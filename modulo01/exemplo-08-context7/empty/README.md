# DB Leaky Connections Scenario

Small Fastify/PostgreSQL demo of a production connection leak. The pool is deliberately limited to **2** connections so the third request times out quickly.

## Run

```bash
npm install
docker compose up -d
cp .env.example .env
npm run dev
```

The PostgreSQL database must contain a `students` table. The server listens on `http://localhost:9000`.

```bash
curl http://localhost:9000/students/db-leaky-connections
curl http://localhost:9000/students/db-leaky-connections
curl http://localhost:9000/students/db-leaky-connections
curl -X POST http://localhost:9000/students/db-leaky-connections/reset
curl http://localhost:9000/metrics
```

Requests one and two acquire a client and succeed. The third waits for a free client until `DB_CONNECTION_TIMEOUT_MS` and returns HTTP 500. The reset route releases the clients so the experiment can be repeated.

## Observability

- Fastify emits structured error logs with the complete error and stack trace.
- `/metrics` exposes request counters, response-time histograms, and default Node.js metrics for Prometheus.
- HTTP and database work are visible in the request/log lifecycle; the missing `release()` is the deliberate absence of cleanup. The accompanying incident report shows the Tempo/Loki/Prometheus correlation expected when those exporters are connected.

## Grafana MCP

The workspace includes `.vscode/mcp.json` for the official `mcp-grafana` server. It runs through Docker in STDIO mode and uses `--disable-write` so the investigation can query Grafana without modifying dashboards, alerts, annotations, or incidents.

Before starting the MCP server, make `GRAFANA_URL`, `GRAFANA_SERVICE_ACCOUNT_TOKEN`, and optionally `GRAFANA_ORG_ID` available in the VS Code process environment. The service account should have read/query access to the Prometheus, Loki, and Tempo datasources. Docker must be installed and running. The configuration uses host networking so a local Grafana at `http://localhost:3000` is reachable from the container on Linux.

After reloading the workspace, use the VS Code MCP tools to list datasources and query the last 15 minutes of metrics, logs, and traces for this scenario. The token is intentionally not stored in the repository.

## Root cause and fix

`src/main.ts` stores every acquired client but never calls `release()`. The production fix is to scope the client with `try/finally`:

```typescript
const poolClient = await database.connect()
try {
  const result = await poolClient.query('SELECT * FROM students LIMIT 1')
  return reply.send({ students: result.rows })
} finally {
  poolClient.release()
}
```

Do not add that `finally` to this demo unless you are intentionally converting it into the fixed variant.
