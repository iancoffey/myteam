'use client'

import { useEffect, useState } from 'react'
import { useKeptForm } from './ActionForm'
import { createTeam, updateTeam } from '@/app/actions'
import { AGES, FORMATS, FORMAT_KEYS, LIMITS, agePreset, type Age, type FormatKey, type TeamSettings } from '@/lib/formats'

type Props =
  | { mode: 'create' }
  | { mode: 'edit'; teamId: string; name: string; age: Age; settings: TeamSettings }

export function TeamForm(props: Props) {
  const { state, pending, ref, onSubmit } = useKeptForm(props.mode === 'create' ? createTeam : updateTeam)
  const [age, setAge] = useState<Age>(props.mode === 'edit' ? props.age : 'U6')
  const [s, setS] = useState<TeamSettings>(props.mode === 'edit' ? props.settings : agePreset('U6'))
  const [timeZone, setTimeZone] = useState('')

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    } catch {}
  }, [])

  function pickAge(a: Age) {
    setAge(a)
    setS(agePreset(a))
  }
  function pickFormat(f: FormatKey) {
    setS((prev) => (f === 'custom' ? { ...prev, format: f } : { ...prev, format: f, ...FORMATS[f] }))
  }
  function step(k: keyof typeof LIMITS, d: number) {
    const [lo, hi] = LIMITS[k]
    setS((prev) => ({ ...prev, [k]: Math.min(hi, Math.max(lo, prev[k] + d)) }))
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className="stack">
      {props.mode === 'edit' && <input type="hidden" name="teamId" value={props.teamId} />}
      <input type="hidden" name="age" value={age} />
      <input type="hidden" name="format" value={s.format} />
      <input type="hidden" name="onField" value={s.onField} />
      <input type="hidden" name="keeper" value={s.keeper ? 'yes' : 'no'} />
      <input type="hidden" name="periods" value={s.periods} />
      <input type="hidden" name="periodMin" value={s.periodMin} />
      <input type="hidden" name="subMin" value={s.subMin} />
      <input type="hidden" name="timeZone" value={timeZone} />

      <div>
        <label className="lbl" htmlFor="name">Team name</label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Green Rockets"
          defaultValue={props.mode === 'edit' ? props.name : ''}
        />
      </div>

      <h2 className="h2">Age group</h2>
      <div className="chips">
        {AGES.map((a) => (
          <button key={a} type="button" className="chip" aria-pressed={a === age} onClick={() => pickAge(a)}>
            {a}
          </button>
        ))}
      </div>
      <p className="note">Picking an age fills in the rest. Change anything your league does differently.</p>

      <h2 className="h2">Players on the field</h2>
      <div className="chips four">
        {FORMAT_KEYS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={f === s.format} onClick={() => pickFormat(f)}>
            {f === 'custom' ? 'Other' : f}
          </button>
        ))}
      </div>
      {s.format === 'custom' && (
        <>
          <div className="stepper">
            <span className="lbl">On the field</span>
            <button type="button" aria-label="Fewer players" onClick={() => step('onField', -1)}>−</button>
            <output>{s.onField}v{s.onField}</output>
            <button type="button" aria-label="More players" onClick={() => step('onField', 1)}>+</button>
          </div>
          <div className="chips pair">
            <button type="button" className="chip" aria-pressed={s.keeper} onClick={() => setS({ ...s, keeper: true })}>Keeper</button>
            <button type="button" className="chip" aria-pressed={!s.keeper} onClick={() => setS({ ...s, keeper: false })}>No keeper</button>
          </div>
        </>
      )}

      <h2 className="h2">Game times</h2>
      <div className="stepper">
        <span className="lbl">Periods</span>
        <button type="button" aria-label="Fewer periods" onClick={() => step('periods', -1)}>−</button>
        <output>{s.periods}</output>
        <button type="button" aria-label="More periods" onClick={() => step('periods', 1)}>+</button>
      </div>
      <div className="stepper">
        <span className="lbl">Minutes each</span>
        <button type="button" aria-label="Shorter periods" onClick={() => step('periodMin', -1)}>−</button>
        <output>{s.periodMin} min</output>
        <button type="button" aria-label="Longer periods" onClick={() => step('periodMin', 1)}>+</button>
      </div>
      <div className="stepper">
        <span className="lbl">Swap</span>
        <button type="button" aria-label="Swap more often" onClick={() => step('subMin', -1)}>−</button>
        <output>{s.subMin ? `every ${s.subMin} min` : 'at breaks'}</output>
        <button type="button" aria-label="Swap less often" onClick={() => step('subMin', 1)}>+</button>
      </div>

      {props.mode === 'create' && (
        <>
          <h2 className="h2">Kids (optional)</h2>
          <label className="note" htmlFor="roster">First names, one per line. You can add them later.</label>
          <textarea id="roster" name="roster" autoComplete="off" autoCapitalize="words" spellCheck={false} />
        </>
      )}

      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      <button className="btn primary big" disabled={pending}>
        {pending ? 'Saving…' : props.mode === 'create' ? 'Create team' : 'Save team'}
      </button>
    </form>
  )
}
