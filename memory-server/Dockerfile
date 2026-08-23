# The agent's memory service: the upstream neo4j-agent-memory MCP server
# (context-graph memory over Neo4j Aura), pinned and run as-is -- no custom
# Python. Deployed as a small always-on Railway service so one long-lived
# process owns the Aura connection pool; the Vercel app talks to it over
# streamable HTTP with a bearer JWT.
#
# Configuration is entirely environment-driven (see README.md next to this
# file for the full contract): NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD,
# NAM_EMBEDDING + OPENAI_API_KEY, and the FASTMCP_SERVER_AUTH_* group that
# turns on HS256 bearer verification (FastMCP instantiates the verifier from
# env when the server itself passes no auth provider).
FROM python:3.12-slim

RUN pip install --no-cache-dir "neo4j-agent-memory[mcp,openai]==0.5.0"

# Railway injects PORT; default to 8080 for local runs.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "neo4j-agent-memory mcp serve --transport http --host 0.0.0.0 --port ${PORT} --profile extended"]
