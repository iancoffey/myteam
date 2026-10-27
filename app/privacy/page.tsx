import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy · myteam' }

export default function PrivacyPage() {
  const contact = process.env.SUPPORT_EMAIL
  return (
    <main className="page prose">
      <header className="topbar">
        <Link href="/" className="back">← myteam</Link>
      </header>
      <h1 className="h1">Privacy</h1>
      <p className="muted">Last updated October 27, 2026</p>

      <p>
        myteam helps youth soccer coaches run practices and games: checking kids in, making lineups, timing
        periods and substitutions, and splitting scrimmage teams. It is made for adult coaches and club staff,
        not for children.
      </p>

      <h2 className="h2">What we store</h2>
      <ul>
        <li>Your account: your email address and your password, stored only as a one-way hash.</li>
        <li>The clubs and teams you or your fellow coaches create: names, age groups and game settings.</li>
        <li>
          For each kid, only a first name (or first name and initial) and any position groups you tag them with,
          plus attendance, lineups, minutes played, scores and the game log.
        </li>
      </ul>

      <h2 className="h2">What we don’t</h2>
      <ul>
        <li>No last names, birthdays, photos, schools or contact details for kids, and nothing about parents.</li>
        <li>No ads, no selling or sharing data with advertisers, and no third-party tracking.</li>
      </ul>

      <h2 className="h2">Who can see it</h2>
      <p>
        Coaches in your club see your club’s teams, games and practices. Nobody outside your club does. We use
        hosting and database providers to run the service; they store the data on our behalf and may not use it
        for anything else.
      </p>

      <h2 className="h2">On your phone</h2>
      <p>
        One cookie keeps you signed in and another remembers which club you were viewing. During a game the app
        keeps the game on your phone so it works with no signal, and sends it once you’re back online.
      </p>

      <h2 className="h2">Deleting your data</h2>
      <p>
        Account → Delete account removes your account right away. Clubs where you were the only coach are
        deleted along with their teams and games. Clubs with other coaches keep their teams.
      </p>

      <h2 className="h2">Changes and questions</h2>
      <p>
        If this policy changes we’ll update the date above.{' '}
        {contact ? (
          <>
            Questions: <a href={`mailto:${contact}`}>{contact}</a>.
          </>
        ) : (
          'Questions: ask your club’s admin.'
        )}
      </p>
    </main>
  )
}
