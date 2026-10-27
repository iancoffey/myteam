// Practice scrimmage: 9 kids show up, split into even teams that every coach sees.
import { OUT, createTeam, fail, inviteLink, phones, signup, step, tag } from './helpers.mjs'

const { pages: [head, asst], done } = await phones(2)
const sides = (p) => p.$$eval('.team-col', (cols) => cols.map((c) => [...c.querySelectorAll('.team-kid .t-name')].map((n) => n.textContent).sort()))

await signup(head, 'scrim-head@example.com', { club: 'Comets SC' })
const teamUrl = await createTeam(head, {
  name: 'Comets',
  age: 'U10',
  preset: 'Left · Center · Right · Goalie',
  roster: ['Owen', 'Nora', 'Jonah', 'Isla', 'Theo', 'June', 'Omar', 'Priya', 'Max', 'Lucy'],
})
await tag(head, teamUrl, { Owen: 'Goalie', Nora: 'Goalie', Jonah: 'Left', Isla: 'Left', Theo: 'Center', June: 'Center', Omar: 'Center', Priya: 'Right', Max: 'Right', Lucy: 'Right' })

await head.goto(teamUrl)
await head.click('button:has-text("Practice")')
await head.getByRole('heading', { name: 'Practice' }).waitFor()
for (const n of ['Owen', 'Nora', 'Jonah', 'Isla', 'Theo', 'June', 'Omar', 'Priya', 'Max']) await head.click(`.tile:has-text("${n}")`)
await head.click('button[role="tab"]:has-text("Scrimmage")')
await head.click('button:has-text("Split 9 into 2 teams")')
await head.locator('.team-col').first().waitFor()
let s = await sides(head)
if (s.map((t) => t.length).sort().join() !== '4,5') fail('not 5 v 4: ' + JSON.stringify(s))
for (const t of s) if (t.filter((n) => n === 'Owen' || n === 'Nora').length !== 1) fail('goalies not split')
step(`9 kids → ${s.map((t) => t.length).join(' v ')}, one goalie each: ${s.map((t) => t.join(' ')).join(' | ')}`)
await head.screenshot({ path: `${OUT}scrimmage.png` })

const link = await inviteLink(head)
await signup(asst, 'scrim-asst@example.com', { invite: link })
await head.goto(`${teamUrl}/field`)
await head.click('button[role="tab"]:has-text("Scrimmage")')
await head.locator('.team-col').first().waitFor()
await asst.click('a:has-text("Resume practice")')
await asst.click('button[role="tab"]:has-text("Scrimmage")')
await asst.waitForFunction(() => document.querySelectorAll('.team-kid').length === 9, null, { timeout: 8000 })
if (JSON.stringify(await sides(asst)) !== JSON.stringify(s)) fail('other coach sees different teams')
step('the other coach sees the same teams')

const mover = s[0][0]
await asst.click(`.team-col.t0 .team-kid:has-text("${mover}")`)
await head.waitForFunction((n) => [...document.querySelectorAll('.team-col.t1 .team-kid .t-name')].some((e) => e.textContent === n), mover, { timeout: 8000 })
step(`${mover} tapped across on one phone; the other sees it`)

await head.click('button[role="tab"]:has-text("Who’s here")')
await head.click('.tile:has-text("Lucy")')
await head.click('.tile:has-text("Theo")')
await head.click('button[role="tab"]:has-text("Scrimmage")')
s = await sides(head)
if (!s.flat().includes('Lucy') || s.flat().includes('Theo')) fail('teams did not follow check-in: ' + JSON.stringify(s))
step(`late arrival joined, leaver dropped off (${s.map((t) => t.length).join(' v ')})`)

await head.click('button:has-text("Clear teams")')
await head.click('.chip:has-text("3 teams")')
await head.click('button:has-text("Split 9 into 3 teams")')
await head.locator('.team-col.t2').waitFor()
s = await sides(head)
if (s.map((t) => t.length).join() !== '3,3,3') fail('3 teams uneven: ' + JSON.stringify(s))
step('3 teams: 3 v 3 v 3')

await done()
