'use client'

import { useEffect, useState } from 'react'

// The club's invite link with the phone's share sheet (Messages, WhatsApp, email…) or copy.
export function InviteShare({ token, clubName }: { token: string; clubName: string }) {
  const [url, setUrl] = useState(`/join/${token}`)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => setUrl(`${window.location.origin}/join/${token}`), [token])

  async function share() {
    const text = `Join ${clubName} on myteam to run our games and practices together.`
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join ${clubName}`, text, url })
        return
      }
    } catch {
      return // closed the share sheet
    }
    await copy()
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setNote('Link copied.')
    } catch {
      setNote('Press and hold the link to copy it.')
    }
  }

  return (
    <div className="stack">
      <p className="invite-url">{url}</p>
      <div className="btn-grid">
        <button className="btn primary" onClick={share}>Share invite link</button>
        <button className="btn" onClick={copy}>Copy</button>
      </div>
      {note && <p className="msg ok" role="status">{note}</p>}
    </div>
  )
}
