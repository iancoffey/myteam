// Kids who never want to play goalie: switch it off on the roster and they're never put in goal.
import { BASE, OUT, createTeam, fail, phones, signup, step } from './helpers.mjs'

const { pages: [page], done } = await phones(1)
await signup(page, 'goalie-coach@example.com', { club: 'Keeper Club' })
const roster = ['Owen', 'Nora', 'Jonah', 'Isla', 'Theo', 'June', 'Omar', 'Priya', 'Max', 'Lucy']
const teamUrl = await createTeam(page, { name: 'Gloves', age: 'U10', roster })
const willing = ['Max', 'Lucy']

await page.goto(`${teamUrl}/roster`)
for (const kid of roster.filter((k) => !willing.includes(k))) {
  const sw = page.locator('.card.kid', { has: page.locator('.kid-name', { hasText: new RegExp(`^${kid}$`) }) }).locator('.switch-row')
  await sw.click()
  await page.waitForFunction((el) => el.getAttribute('aria-checked') === 'false', await sw.elementHandle())
}
await page.waitForTimeout(1500)
await page.reload()
const off = await page.locator('.switch-row[aria-checked="false"]').count()
if (off !== 8) fail(`expected 8 kids switched off, got ${off}`)
await page.screenshot({ path: `${OUT}goalie-roster.png` })
step('“Plays goalie” switched off for 8 kids and saved')

for (let round = 1; round <= 3; round++) {
  await page.goto(teamUrl)
  await page.click('button:has-text("Start game")')
  await page.click('button:has-text("Everyone’s here")')
  await page.click('button:has-text("Make lineup")')
  await page.getByText('Starting lineup').waitFor()
  const keeper = (await page.locator('.tile', { hasText: 'Keeper' }).locator('.t-name').innerText()).trim()
  if (!willing.includes(keeper)) fail(`round ${round}: ${keeper} was put in goal`)
  if (round < 3) {
    await page.click('button[aria-label="Menu"]')
    await page.click('button:has-text("Discard this game")')
    await page.click('button:has-text("Tap again to discard")')
    await page.locator('button:has-text("Start game")').waitFor()
  } else step(`3 lineups in a row: keeper always one of ${willing.join('/')} (last: ${keeper})`)
}

const unwilling = (await page.locator('.tile.on .t-name').allInnerTexts()).map((s) => s.trim()).find((n) => !willing.includes(n))
await page.click(`.tile.on:has-text("${unwilling}")`)
await page.getByText(`${unwilling} doesn’t play goalie.`).waitFor()
if (await page.locator('button:has-text("Put in goal")').count()) fail('Put in goal offered for a kid who won’t play goalie')
step(`${unwilling} selected: no “Put in goal”, and the card says they don’t play goalie`)

if (!BASE) fail('no base')
await done()
