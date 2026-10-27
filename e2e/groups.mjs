// Position groups, keeper from the Goalie group, untimed half, pause/nudge, full game to the log.
import { createTeam, fail, phones, signup, step, tag } from './helpers.mjs'

const { pages: [page], done } = await phones(1)

await signup(page, 'groups-coach@example.com', { club: 'Thunder FC' })
const teamUrl = await createTeam(page, {
  name: 'Thunder',
  age: 'U10',
  preset: 'Left · Center · Right · Goalie',
  roster: ['Owen', 'Nora', 'Jonah', 'Isla', 'Theo', 'June', 'Omar', 'Priya', 'Max', 'Lucy'],
})
await tag(page, teamUrl, { Owen: 'Goalie', Nora: ['Goalie', 'Left'], Jonah: 'Left', Isla: 'Left', Theo: 'Center', June: 'Center', Omar: 'Center', Priya: 'Right', Max: 'Right', Lucy: 'Right' })
await page.reload()
if ((await page.locator('.tag-chip[aria-pressed="true"]').count()) !== 11) fail('tags not saved')
step('11 position tags saved')

await page.goto(teamUrl)
await page.click('button:has-text("Start game")')
await page.click('button:has-text("Everyone’s here")')
await page.click('button:has-text("Make lineup")')
await page.getByText('Starting lineup').waitFor()
const keeper = await page.locator('.tile', { hasText: 'Keeper' }).innerText()
if (!/Goalie/.test(keeper)) fail('keeper not from Goalie group: ' + keeper)
step(`keeper from the Goalie group: ${keeper.split('\n')[0]}; ${await page.locator('.coverage').innerText()}`)

await page.click('.clock-strip .end:has-text("End 1st half")')
await page.getByText('End of 1st half').first().waitFor()
if (!(await page.$$eval('.tile.on .t-min', (ts) => ts.every((t) => t.textContent === '25′')))) fail('untimed half not credited')
await page.click('button:has-text("Undo")')
await page.getByText('Starting lineup').waitFor()
step('untimed half credits 25′; undo returns to kickoff')

await page.click('.start-btn')
await page.waitForTimeout(2200)
await page.click('.start-btn:has-text("Pause")')
const paused = await page.locator('.clock .time').innerText()
await page.waitForTimeout(2200)
if ((await page.locator('.clock .time').innerText()) !== paused) fail('paused clock moved')
await page.click('.clock-strip button:has-text("+1′")')
step(`pause holds at ${paused}; +1′ → ${await page.locator('.clock .time').innerText()}`)

await page.click('.go-btn:has-text("Swap")')
await page.click('.clock-strip .end:has-text("End 1st half")')
await page.getByText('Halftime').first().waitFor()
await page.click('.clock-strip .end:has-text("End 2nd half")')
await page.getByText('Full time').first().waitFor()
await page.click('button:has-text("Subs by half")')
if (!/1st half · \d+ swaps?/i.test(await page.locator('.sheet').innerText())) fail('log missing swaps')
await page.click('.sheet button[aria-label="Close"]')
await page.click('.go-btn:has-text("Save game")')
await page.getByText('Season minutes · 1 game').waitFor()
step('full time → log by half → Save game')

await done()
