import Link from 'next/link'
import { TeamForm } from '@/components/TeamForm'

export default function NewTeamPage() {
  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="back">← Teams</Link>
      </header>
      <h1 className="h1">New team</h1>
      <TeamForm mode="create" />
    </main>
  )
}
