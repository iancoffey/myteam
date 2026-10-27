'use client'

import { useEffect, useState } from 'react'

// Two-tap submit for destructive actions: no dialog, the first tap arms it for three seconds and the
// second submits. The button stays type="button" and submits explicitly: switching it to a submit
// button on the first tap would let that same tap submit the form.
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
      type="button"
      onClick={(e) => {
        if (!armed) return setArmed(true)
        setArmed(false)
        e.currentTarget.form?.requestSubmit()
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
