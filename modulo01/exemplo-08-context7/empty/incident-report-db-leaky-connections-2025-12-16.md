# Incident Report: DB Leaky Connections

## Summary

`GET /students/db-leaky-connections` returns 200 twice and then returns 500 after the pool reaches its limit of two checked-out clients. The reset route makes the pattern repeat.

## Correlation

| Signal | Observation | Interpretation |
| --- | --- | --- |
| Metrics | Two fast successes, then failures near `DB_CONNECTION_TIMEOUT_MS` | The pool is exhausted rather than the query being slow | 
| Logs | `timeout exceeded when trying to connect`, with the handler and pool stack | Failure happens at `pool.connect()` after both clients remain checked out | 
| Traces | HTTP and SQL work exist, but no release/cleanup operation follows the DB span | The acquired resource has no cleanup path | 
| Reproduction | Reset restores two successful requests | The failure is stateful and tied to retained pool clients | 

## Root cause

The handler acquires a `PoolClient`, uses it, and stores it in `leakedClients`, but never calls `client.release()`. The missing cleanup is in `src/main.ts` in the `GET /students/db-leaky-connections` handler.

## Fix

Release every acquired client in a `finally` block:

```typescript
const client = await pool.connect()
try {
  const result = await client.query('SELECT * FROM students LIMIT 1')
  return reply.send({ students: result.rows })
} finally {
  client.release()
}
```

After the fix, repeated requests continue to succeed and the connection pool returns each client to its idle state.
