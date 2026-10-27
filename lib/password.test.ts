import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPassword, normalizeEmail, passwordProblem, verifyPassword } from './password'

test('passwords hash with a fresh salt and verify only with the right password', async () => {
  const a = await hashPassword('correct horse battery')
  const b = await hashPassword('correct horse battery')
  assert.notEqual(a, b, 'salted')
  assert.match(a, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
  assert.equal(await verifyPassword('correct horse battery', a), true)
  assert.equal(await verifyPassword('correct horse batterY', a), false)
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false)
})

test('password and email rules', () => {
  assert.equal(passwordProblem('short'), 'Use at least 10 characters.')
  assert.equal(passwordProblem('long enough!'), null)
  assert.equal(normalizeEmail('  Coach@Example.COM '), 'coach@example.com')
  assert.equal(normalizeEmail('not an email'), null)
})
