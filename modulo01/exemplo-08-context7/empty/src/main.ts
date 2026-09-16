import Fastify, { type FastifyInstance } from 'fastify'
import { Pool, type PoolClient } from 'pg'
import client from 'prom-client'

const port = Number(process.env.PORT ?? 9000)
const connectionTimeoutMillis = Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 1000)

export interface Database {
  connect(): Promise<PoolClient>
}

export function buildApp(database: Database): FastifyInstance {
  const app = Fastify({ logger: true })
  const leakedClients: PoolClient[] = []
  const register = new client.Registry()
  client.collectDefaultMetrics({ register })

  const requests = new client.Counter({
    name: 'students_requests_total',
    help: 'Student endpoint requests by outcome',
    labelNames: ['endpoint', 'status'] as const,
    registers: [register]
  })
  const duration = new client.Histogram({
    name: 'students_request_duration_seconds',
    help: 'Student endpoint response duration',
    labelNames: ['endpoint', 'status'] as const,
    registers: [register],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
  })

  app.get('/students/db-leaky-connections', async (request, reply) => {
    const end = duration.startTimer({ endpoint: request.url })
    let status = '500'

    try {
      const poolClient = await database.connect()
      leakedClients.push(poolClient)
      const result = await poolClient.query('SELECT * FROM students LIMIT 1')
      status = '200'
      return reply.send({ students: result.rows })
    } catch (error) {
      request.log.error({ err: error }, 'database request failed')
      return reply.code(500).send({ error: 'Internal Server Error' })
    } finally {
      requests.inc({ endpoint: request.url, status })
      end({ status })
      // Deliberately missing: poolClient.release(). This is the bug.
    }
  })

  app.post('/students/db-leaky-connections/reset', async (_request, reply) => {
    const clientsToRelease = leakedClients.splice(0)
    for (const poolClient of clientsToRelease) {
      poolClient.release()
    }
    return reply.send({ released: clientsToRelease.length })
  })

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return reply.send(await register.metrics())
  })

  return app
}

export async function createServer(): Promise<{ app: FastifyInstance; pool: Pool }> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis
  })
  const app = buildApp(pool)
  app.addHook('onClose', async () => pool.end())
  return { app, pool }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = await createServer()
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info({ port, poolMax: 2 }, 'db leaky connections demo listening')
}
