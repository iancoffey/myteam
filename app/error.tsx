'use client'

// Visitors see a plain message only; details stay in the server log.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page" style={{ paddingTop: '10vh' }}>
      <h1 className="h1">Something went wrong</h1>
      <p className="muted" style={{ margin: 0 }}>Please try again.</p>
      <button className="btn primary" onClick={() => reset()}>Try again</button>
    </main>
  )
}
