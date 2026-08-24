"""User-scoped memory API for the cfb-app agent, over neo4j-agent-memory.

Why not the stock ``neo4j-agent-memory mcp serve``: its MCP tool surface
binds ONE MemoryIntegration per process (single-tenant by design -- built
for desktop assistants), while the library's ShortTermMemory/LongTermMemory
take ``user_identifier`` per call. A shared multi-user service needs the
latter, so this wrapper exposes exactly the operations the agent uses, each
scoped to a Discord snowflake, and nothing else.

Memory model (v1, deliberately mirrors the bot's proven "atom" semantics):
every durable user memory is a LongTermMemory *preference* with category in
{'preference','fact','take'}; automatic entity extraction is OFF
(extraction_mode='skip' -- the app's own Haiku extraction owns semantics).
Conversation turns are stored user-scoped in ShortTermMemory with
embeddings, ready for cross-session recall later. Dedup nuance: the library
dedups preferences by similarity ACROSS users and links each user to the
shared node, so forgetting removes THIS user's HAS_PREFERENCE edge and
deletes the node only when orphaned.

Auth: HS256 bearer JWT, iss 'cfb-app', aud 'cfb-memory'. Secret from
MEMORY_JWT_SECRET (falling back to FASTMCP_SERVER_AUTH_JWT_PUBLIC_KEY, the
name used when this service was first provisioned). Missing secret =>
server refuses to start; this endpoint is public on Railway.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, SecretStr

from neo4j_agent_memory import MemoryClient, MemorySettings
from neo4j_agent_memory.config.settings import MemoryConfig, Neo4jConfig

JWT_ISSUER = "cfb-app"
JWT_AUDIENCE = "cfb-memory"
KINDS = ("preference", "fact", "take")
ANSWER_STORE_MAX_CHARS = 4000


def _jwt_secret() -> str:
    secret = os.environ.get("MEMORY_JWT_SECRET") or os.environ.get(
        "FASTMCP_SERVER_AUTH_JWT_PUBLIC_KEY"
    )
    if not secret:
        raise RuntimeError("MEMORY_JWT_SECRET (or FASTMCP_SERVER_AUTH_JWT_PUBLIC_KEY) must be set")
    return secret


def _build_settings() -> MemorySettings:
    return MemorySettings(
        neo4j=Neo4jConfig(
            uri=os.environ["NEO4J_URI"],
            username=os.environ.get("NEO4J_USER", "neo4j"),
            password=SecretStr(os.environ["NEO4J_PASSWORD"]),
            database=os.environ.get("NEO4J_DATABASE", "neo4j"),
            # One long-lived service owns the Aura pool; keep it modest.
            max_connection_pool_size=int(os.environ.get("NEO4J_POOL_SIZE", "10")),
        ),
        embedding=os.environ.get("NAM_EMBEDDING", "openai/text-embedding-3-small"),
        # Enforce user_identifier on every write -- a missing scope is a bug,
        # never a silent global write.
        memory=MemoryConfig(multi_tenant=True),
    )


memory: MemoryClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global memory
    _jwt_secret()  # fail fast on missing auth config
    memory = MemoryClient(_build_settings())
    await memory.connect()
    try:
        yield
    finally:
        await memory.close()
        memory = None


app = FastAPI(title="cfb-agent-memory", lifespan=lifespan)


def _client() -> MemoryClient:
    if memory is None:
        raise HTTPException(status_code=503, detail="memory client not connected")
    return memory


async def require_auth(request: Request) -> None:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = header[7:].strip()
    try:
        jwt.decode(
            token,
            _jwt_secret(),
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
    except jwt.InvalidTokenError as err:
        raise HTTPException(status_code=401, detail=f"invalid token: {err}") from err


@app.get("/health")
async def health() -> dict[str, Any]:
    """Authless liveness probe (also Railway's healthcheck)."""
    return {"ok": True, "connected": memory.is_connected if memory is not None else False}


# --- request/response shapes -------------------------------------------------


class TurnIn(BaseModel):
    user: str = Field(min_length=1, max_length=64)
    session_id: str = Field(min_length=1, max_length=128)
    question: str = Field(min_length=1, max_length=8000)
    answer: str = Field(min_length=1, max_length=32000)


class RememberIn(BaseModel):
    user: str = Field(min_length=1, max_length=64)
    kind: str = Field(pattern="^(preference|fact|take)$")
    content: str = Field(min_length=1, max_length=300)
    context: str | None = Field(default=None, max_length=300)
    metadata: dict[str, Any] | None = None


class UserIn(BaseModel):
    user: str = Field(min_length=1, max_length=64)


class SearchIn(BaseModel):
    user: str = Field(min_length=1, max_length=64)
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=8, ge=1, le=25)


class ForgetIn(BaseModel):
    user: str = Field(min_length=1, max_length=64)
    memory_id: str | None = Field(default=None, max_length=64)


def _serialize(pref: Any) -> dict[str, Any]:
    return {
        "id": str(pref.id),
        "kind": pref.category,
        "content": pref.preference,
        "context": pref.context,
        "createdAt": pref.created_at.isoformat() if pref.created_at else None,
        "updatedAt": pref.updated_at.isoformat() if pref.updated_at else None,
    }


async def _user_memories(user: str) -> list[dict[str, Any]]:
    prefs = await _client().long_term.get_preferences_for(user)
    rows = [_serialize(p) for p in prefs if p.category in KINDS]
    # Oldest first, id tiebreak -- the same stable order the bot's
    # /memory show numbering contract has always used.
    rows.sort(key=lambda r: ((r["createdAt"] or ""), r["id"]))
    return rows


# --- endpoints ---------------------------------------------------------------


@app.post("/turn", dependencies=[Depends(require_auth)])
async def store_turn(body: TurnIn) -> dict[str, Any]:
    """Store one Q&A turn in user-scoped conversation memory."""
    st = _client().short_term
    session_id = f"{body.user}:{body.session_id}"
    for role, content in (("user", body.question), ("assistant", body.answer[:ANSWER_STORE_MAX_CHARS])):
        await st.add_message(
            session_id,
            role,
            content,
            user_identifier=body.user,
            extraction_mode="skip",
            generate_embedding=True,
        )
    return {"stored": 2, "sessionId": session_id}


@app.post("/remember", dependencies=[Depends(require_auth)])
async def remember(body: RememberIn) -> dict[str, Any]:
    """Store one durable memory (bot-atom semantics; dedup built in)."""
    pref = await _client().long_term.add_preference(
        category=body.kind,
        preference=body.content,
        context=body.context,
        user_identifier=body.user,
        metadata=body.metadata,
    )
    return {"memory": _serialize(pref), "deduplicated": bool(pref.metadata.get("deduplicated"))}


@app.post("/context", dependencies=[Depends(require_auth)])
async def context(body: UserIn) -> dict[str, Any]:
    """Everything known about the user, oldest first (stable numbering)."""
    return {"memories": await _user_memories(body.user)}


@app.post("/search", dependencies=[Depends(require_auth)])
async def search(body: SearchIn) -> dict[str, Any]:
    """The user's memories ranked for a query.

    v1 ranking is lexical term-overlap with a recency tiebreak over the
    user's own (small) memory set -- the library's vector search is not
    user-scoped yet; when it grows a user filter this becomes one call.
    """
    rows = await _user_memories(body.user)
    terms = [t for t in body.query.lower().split() if len(t) > 2]

    def score(row: dict[str, Any]) -> tuple[int, str]:
        text = f"{row['content']} {row['context'] or ''}".lower()
        return (sum(1 for t in terms if t in text), row["updatedAt"] or row["createdAt"] or "")

    ranked = sorted(rows, key=score, reverse=True)
    return {"memories": ranked[: body.limit]}


FORGET_ONE = """
MATCH (u:User {identifier: $user})-[r:HAS_PREFERENCE]->(p:Preference {id: $id})
DELETE r
WITH p
WHERE NOT EXISTS { MATCH (:User)-[:HAS_PREFERENCE]->(p) }
DETACH DELETE p
"""

COUNT_ONE = """
MATCH (u:User {identifier: $user})-[r:HAS_PREFERENCE]->(p:Preference {id: $id})
RETURN count(r) AS n
"""

FORGET_ALL = """
MATCH (u:User {identifier: $user})-[r:HAS_PREFERENCE]->(p:Preference)
DELETE r
WITH p
WHERE NOT EXISTS { MATCH (:User)-[:HAS_PREFERENCE]->(p) }
DETACH DELETE p
"""

COUNT_ALL = """
MATCH (u:User {identifier: $user})-[r:HAS_PREFERENCE]->(p:Preference)
RETURN count(r) AS n
"""


@app.post("/forget", dependencies=[Depends(require_auth)])
async def forget(body: ForgetIn) -> dict[str, Any]:
    """Forget one memory (by id) or every memory for the user.

    Removes THIS user's HAS_PREFERENCE edge; the Preference node itself is
    deleted only when no other user still links to it (dedup can share
    nodes across users -- see module docstring).
    """
    # The library exposes no public graph handle; its own memory classes use
    # this client, and the package version is pinned in the Dockerfile.
    graph = _client().long_term._client  # noqa: SLF001
    if body.memory_id is not None:
        counted = await graph.execute_read(COUNT_ONE, {"user": body.user, "id": body.memory_id})
        n = counted[0]["n"] if counted else 0
        if n > 0:
            await graph.execute_write(FORGET_ONE, {"user": body.user, "id": body.memory_id})
        return {"deleted": n}
    counted = await graph.execute_read(COUNT_ALL, {"user": body.user})
    n = counted[0]["n"] if counted else 0
    if n > 0:
        await graph.execute_write(FORGET_ALL, {"user": body.user})
    return {"deleted": n}
