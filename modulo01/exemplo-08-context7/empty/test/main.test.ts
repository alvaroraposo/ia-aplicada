import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp, type Database } from '../src/main.js'

function fakeDatabase(): Database & { connectCount: number } {
  return {
    connectCount: 0,
    async connect() {
      this.connectCount += 1
      return {
        query: async () => ({ rows: [{ id: 1, name: 'Ada' }] }),
        release: () => undefined
      } as never
    }
  }
}

test('first two requests succeed and keep their clients checked out', async () => {
  const database = fakeDatabase()
  const app = buildApp(database)

  const first = await app.inject('/students/db-leaky-connections')
  const second = await app.inject('/students/db-leaky-connections')

  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.equal(database.connectCount, 2)
  await app.close()
})

test('reset releases the leaked clients', async () => {
  const database = fakeDatabase()
  const app = buildApp(database)
  const released: number[] = []
  const originalConnect = database.connect
  database.connect = async () => ({
    query: async () => ({ rows: [] }),
    release: () => released.push(1)
  } as never)

  await app.inject('/students/db-leaky-connections')
  const reset = await app.inject({ method: 'POST', url: '/students/db-leaky-connections/reset' })

  assert.deepEqual(reset.json(), { released: 1 })
  assert.deepEqual(released, [1])
  database.connect = originalConnect
  await app.close()
})
