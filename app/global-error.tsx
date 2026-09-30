'use client'

// Last-resort error screen: plain message only, no technical details.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>Please try again.</p>
        <button onClick={() => reset()} style={{ minHeight: 48, padding: '0 18px' }}>
          Try again
        </button>
      </body>
    </html>
  )
}
