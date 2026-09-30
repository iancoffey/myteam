import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page">
      <h1 className="h1">Not found</h1>
      <p className="muted">That team or page doesn’t exist, or it belongs to another coach.</p>
      <Link href="/" className="btn primary">Back to your teams</Link>
    </main>
  )
}
