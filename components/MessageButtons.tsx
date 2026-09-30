'use client'

import { useEffect, useState } from 'react'

// Opens the coach's own Messages / Mail app with every parent filled in. Nothing is sent by the server,
// so there is no SMS cost and no carrier registration.
export function MessageButtons({
  phones,
  emails,
  body,
  subject,
}: {
  phones: string[]
  emails: string[]
  body: string
  subject: string
}) {
  const [ios, setIos] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setIos(/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document)
  }, [])

  const enc = encodeURIComponent(body)
  const smsHref = phones.length
    ? ios
      ? `sms:/open?addresses=${phones.join(',')}&body=${enc}`
      : `sms:${phones.join(',')}?body=${enc}`
    : undefined
  const mailHref = emails.length
    ? `mailto:?bcc=${emails.join(',')}&subject=${encodeURIComponent(subject)}&body=${enc}`
    : undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (!phones.length && !emails.length) {
    return <p className="note">Add parents’ phone numbers or emails on the Roster page to message them.</p>
  }

  return (
    <div className="btn-grid">
      {smsHref ? (
        <a className="btn primary" href={smsHref}>Text {phones.length}</a>
      ) : (
        <button className="btn" disabled>No phones</button>
      )}
      {mailHref ? (
        <a className="btn" href={mailHref}>Email {emails.length}</a>
      ) : (
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy message'}</button>
      )}
    </div>
  )
}
