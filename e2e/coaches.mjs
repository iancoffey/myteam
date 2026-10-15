// Two coaches, two phones, one game: every signed-in coach sees the same teams, game and clock.
import { OUT, createTeam, fail, login, phones, secs, step } from './helpers.mjs'

const { pages: [head, asst], done } = await phones(2)

await login(head)
const teamUrl = await createTeam(head, { name: 'Strikers', age: 'U8', roster: ['Leo', 'Ava', 'Sam', 'Noah', 'Maya', 'Eli', 'Zoe', 'Kai'] })
await login(asst, 'asst@example.com', 'assist')
await asst.getByText('Strikers').first().waitFor()
step('another coach signs in and sees the team right away, without being added')

await head.goto(teamUrl)
await head.click('button:has-text("Start game")')
await head.getByText('Who’s here?').first().waitFor()
await asst.reload()
await asst.click('a:has-text("Resume game")')
await asst.getByText('Who’s here?').first().waitFor()
step('one coach starts the game; the other joins it with Resume game')

await head.click('.tile:has-text("Leo")')
await head.click('.tile:has-text("Ava")')
for (const n of ['Sam', 'Noah', 'Maya']) await asst.click(`.tile:has-text("${n}")`)
for (const p of [head, asst]) await p.waitForFunction(() => document.querySelectorAll('.tile.here').length === 5, null, { timeout: 8000 })
step('check-ins from both phones show on both')

await asst.click('button:has-text("Make lineup")')
await head.getByText('Starting lineup').waitFor({ timeout: 8000 })
await head.waitForFunction(() => document.querySelectorAll('.tile.on').length === 4, null, { timeout: 8000 })
const onField = (p) => p.$$eval('.tile.on .t-name', (ts) => ts.map((t) => t.textContent).sort().join(','))
if ((await onField(head)) !== (await onField(asst))) fail('lineups differ')
step('lineup made on one phone shows on the other: ' + (await onField(head)))

await head.click('.start-btn')
await asst.locator('.clock .state', { hasText: 'Running' }).waitFor({ timeout: 8000 })
await head.waitForTimeout(3000)
const [a, b] = [await head.locator('.clock .time').innerText(), await asst.locator('.clock .time').innerText()]
if (Math.abs(secs(a) - secs(b)) > 1) fail(`clocks differ: ${a} vs ${b}`)
step(`START on one phone; both count down together (${a} / ${b})`)

const benchName = (await asst.locator('.stack', { has: asst.locator('.group-h', { hasText: 'Bench' }) }).locator('.tile .t-name').first().innerText()).trim()
const fieldName = (await asst.locator('.tile.on .t-name').first().innerText()).trim()
await asst.click(`.tile:has-text("${benchName}")`)
await asst.click(`.tile.on:has-text("${fieldName}")`)
await head.waitForFunction((n) => [...document.querySelectorAll('.tile.on .t-name')].some((t) => t.textContent === n), benchName, { timeout: 8000 })
step(`${benchName} in for ${fieldName} on one phone; the other sees it`)

await asst.context().setOffline(true)
await asst.click('button.goal:has-text("+ Us")')
await asst.locator('.sync', { hasText: 'Offline' }).waitFor()
await asst.screenshot({ path: `${OUT}coaches-offline.png` })
await asst.context().setOffline(false)
await head.waitForFunction(() => document.querySelector('.score .num')?.textContent === '1', null, { timeout: 10000 })
step('a goal scored with no signal reaches the other phone when signal returns')

await head.click('button[aria-label="Menu"]')
await head.click('button:has-text("End game & save")')
await head.getByText('Season minutes · 1 game').waitFor()
await asst.getByRole('heading', { name: 'Game ended' }).waitFor({ timeout: 8000 })
await asst.goto(teamUrl)
await asst.getByText('Season minutes · 1 game').waitFor()
step('one coach ends & saves; the other phone shows it ended and sees the saved game')

await done()
