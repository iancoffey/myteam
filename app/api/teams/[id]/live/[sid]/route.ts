import { NextResponse } from 'next/server'
import { coachTeamOrNull } from '@/lib/data'
import { parseTimed, type Timed } from '@/lib/live'
import { actLive, discardLive, finishLive, toClient } from '@/lib/live-server'

type Ctx = { params: Promise<{ id: string; sid: string }> }
const noStore = { 'Cache-Control': 'no-store' }

// Apply a coach's changes ({ actions }), or end the session ({ op: 'finish' | 'discard' }).
export async function POST(req: Request, ctx: Ctx) {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const { id, sid } = await ctx.params
  const access = await coachTeamOrNull(id)
  if (!access || !/^[0-9a-f-]{36}$/i.test(sid)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { actions?: unknown; op?: unknown }
  try {
    if (body.op === 'finish') return NextResponse.json(await finishLive(access.team, sid), { headers: noStore })
    if (body.op === 'discard') {
      await discardLive(access.team, sid)
      return NextResponse.json({ ok: true }, { headers: noStore })
    }
    const raw = Array.isArray(body.actions) ? body.actions.slice(0, 100) : []
    const actions = raw.map(parseTimed).filter((a): a is Timed => a !== null)
    const row = await actLive(access.team, sid, actions)
    if (!row) return NextResponse.json({ session: null, now: Date.now() }, { headers: noStore })
    return NextResponse.json({ session: toClient(row), now: Date.now() }, { headers: noStore })
  } catch (err) {
    console.error('[myteam] live session update failed', err)
    return NextResponse.json({ error: 'Couldn’t save. Please try again.' }, { status: 500, headers: noStore })
  }
}
