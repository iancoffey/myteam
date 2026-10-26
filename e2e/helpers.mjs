import { chromium, devices, webkit } from 'playwright'

export const BASE = `http://localhost:${process.env.PORT ?? 3100}`
export const OUT = new URL('./.out/', import.meta.url).pathname
const phone = { viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago', hasTouch: true, reducedMotion: 'reduce' }

export const step = (s) => console.log('✓', s)
export const fail = (m) => {
  throw new Error(m)
}
export const secs = (t) => {
  const [m, s] = t.split(':').map(Number)
  return m * 60 + s
}

// One browser, any number of phones (separate sign-ins). Collects page errors from all of them.
// Pass an iPhone name (e.g. 'iPhone SE (3rd gen)') to run in Safari's engine at that phone's size.
export async function phones(n = 1, iphone) {
  const browser = iphone ? await webkit.launch() : await chromium.launch()
  const errors = []
  const pages = []
  for (let i = 0; i < n; i++) {
    const opts = iphone ? { ...devices[iphone], timezoneId: 'America/Chicago', reducedMotion: 'reduce' } : phone
    const p = await (await browser.newContext(opts)).newPage()
    p.on('pageerror', (e) => errors.push(`phone ${i + 1}: ${e.message}`))
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`phone ${i + 1}: ${m.text()}`))
    pages.push(p)
  }
  return {
    pages,
    async done() {
      console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors')
      await browser.close()
      if (errors.length) process.exitCode = 1
    },
  }
}

export async function login(p, email = 'coach@example.com', password = 'soccer') {
  await p.goto(`${BASE}/login`)
  await p.fill('#email', email)
  await p.fill('#password', password)
  await p.click('button:has-text("Sign in")')
  await p.getByRole('heading', { name: 'Your teams' }).waitFor()
}

export async function createTeam(p, { name, age, roster, preset }) {
  await p.goto(`${BASE}/teams/new`)
  await p.fill('#name', name)
  await p.click(`.chip:has-text("${age}")`)
  if (preset) await p.click(`button:has-text("${preset}")`)
  await p.fill('#roster', roster.join('\n'))
  await p.click('button:has-text("Create team")')
  await p.getByRole('heading', { name }).waitFor()
  return p.url()
}

export async function tag(p, teamUrl, tags) {
  await p.goto(`${teamUrl}/roster`)
  for (const [kid, groups] of Object.entries(tags)) {
    const card = p.locator('.card.kid', { has: p.locator('.kid-name', { hasText: new RegExp(`^${kid}$`) }) })
    for (const g of [groups].flat()) {
      const chip = card.locator('.tag-chip', { hasText: g })
      await chip.click()
      await p.waitForFunction((el) => el.getAttribute('aria-pressed') === 'true', await chip.elementHandle())
    }
  }
  await p.waitForTimeout(1500)
}
