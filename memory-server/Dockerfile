# The agent's memory service: a thin user-scoped FastAPI wrapper (app.py)
# over the pinned neo4j-agent-memory library, talking Bolt to Neo4j Aura.
# See app.py's docstring for why the stock MCP server isn't used (its tool
# surface is single-tenant) and README.md for the endpoint + env contract.
FROM python:3.12-slim

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

# Railway injects PORT; default to 8080 for local runs.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
