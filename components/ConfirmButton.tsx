'use client'

import { useEffect, useState } from 'react'

// Two-tap submit for destructive actions: no dialog, the first tap arms it for three seconds.
export function ConfirmButton({
  children,
  confirmLabel,
  className,
}: {
  children: React.ReactNode
  confirmLabel: string
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={className}
      type={armed ? 'submit' : 'button'}
      onClick={() => {
        if (!armed) setArmed(true)
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
