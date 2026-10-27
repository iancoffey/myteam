// The game and practice screens on real iPhone sizes in Safari's engine: everything below the clock
// must be reachable by scrolling and never hidden behind the pinned clock or the bottom buttons.
import { OUT, createTeam, fail, phones, signup, step } from './helpers.mjs'

// Where the pinned top ends and the fixed bottom bar starts, and whether `sel` sits fully between them.
const visibleBetweenBars = (p, sel) =>
  p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { ok: false, why: 'missing' }
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const top = document.querySelector('.field-sticky')?.getBoundingClientRect().bottom ?? 0
    const bar = document.querySelector('.thumbbar, .cta')?.getBoundingClientRect().top ?? innerHeight
    return { ok: r.top >= top - 1 && r.bottom <= bar + 1 && r.height > 20, top: Math.round(r.top), bottom: Math.round(r.bottom), stickyBottom: Math.round(top), barTop: Math.round(bar), vh: innerHeight }
  }, sel)
const noSideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

for (const iphone of ['iPhone SE (3rd gen)', 'iPhone 16', 'iPhone 13 Mini']) {
  const { pages: [page], done } = await phones(1, iphone)
  const slug = iphone.replace(/\W+/g, '-').toLowerCase()
  await signup(page, `${slug}@example.com`, { club: `Club ${slug}` })
  const teamUrl = await createTeam(page, { name: `Rockets ${slug}`, age: 'U10', roster: ['Owen', 'Nora', 'Jonah', 'Isla', 'Theo', 'June', 'Omar', 'Priya', 'Max', 'Lucy', 'Ben'] })

  await page.goto(teamUrl)
  await page.click('button:has-text("Start game")')
  await page.click('button:has-text("Everyone’s here")')
  const cta = await visibleBetweenBars(page, '.tile:last-of-type')
  if (!cta.ok) fail(`${iphone} check-in: last kid hidden ${JSON.stringify(cta)}`)
  await page.click('button:has-text("Make lineup")')
  await page.getByText('Starting lineup').waitFor()
  await page.click('.start-btn')
  await page.screenshot({ path: `${OUT}${slug}-game-top.png` })
  const bench = await visibleBetweenBars(page, '.stack:nth-of-type(2) .tile')
  const away = await visibleBetweenBars(page, '.roster .stack:last-child .group-h')
  if (!bench.ok) fail(`${iphone} game: bench tile not usable ${JSON.stringify(bench)}`)
  if (!away.ok) fail(`${iphone} game: bottom of roster not reachable ${JSON.stringify(away)}`)
  await page.click('.stack:nth-of-type(2) .tile')
  await page.getByText('selected. Tap a player').first().waitFor()
  await page.screenshot({ path: `${OUT}${slug}-game-scrolled.png` })
  if (!(await noSideScroll(page))) fail(`${iphone} game scrolls sideways`)
  const clockStillThere = await page.locator('.field-sticky .clock .time').isVisible()
  if (!clockStillThere) fail(`${iphone} clock not visible after scrolling`)
  step(`${iphone}: game tiles reachable and tappable below the pinned clock (space for content ${bench.barTop - bench.stickyBottom}px of ${bench.vh}px)`)

  await page.click('button[aria-label="Menu"]')
  await page.click('button:has-text("Discard this game")')
  await page.click('button:has-text("Tap again to discard")')
  await page.click('button:has-text("Practice")')
  await page.click('button:has-text("Everyone’s here")')
  const lastKid = await visibleBetweenBars(page, '.tile:last-of-type')
  if (!lastKid.ok) fail(`${iphone} practice: last kid hidden ${JSON.stringify(lastKid)}`)
  await page.click('button[role="tab"]:has-text("Scrimmage")')
  await page.click('button:has-text("Split 11 into 2 teams")')
  const side = await visibleBetweenBars(page, '.team-col .team-kid:last-child')
  if (!side.ok) fail(`${iphone} scrimmage: team list hidden ${JSON.stringify(side)}`)
  await page.screenshot({ path: `${OUT}${slug}-practice.png` })
  if (!(await noSideScroll(page))) fail(`${iphone} practice scrolls sideways`)
  step(`${iphone}: practice check-in and scrimmage teams reachable`)
  await done()
}
