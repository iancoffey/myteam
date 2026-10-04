import { NextResponse } from 'next/server'
import { coachTeamOrNull, getLive } from '@/lib/data'
import { startLive, toClient } from '@/lib/live-server'

type Ctx = { params: Promise<{ id: string }> }
const noStore = { 'Cache-Control': 'no-store' }

// Poll for the team's live game or practice. 204 when nothing changed since `rev`.
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const access = await coachTeamOrNull(id)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const rev = Number(new URL(req.url).searchParams.get('rev') ?? '-1')
  const row = await getLive(id)
  const now = Date.now()
  if (row && row.version === rev) return new NextResponse(null, { status: 204, headers: { ...noStore, 'x-now': String(now) } })
  return NextResponse.json({ session: row ? toClient(row) : null, now }, { headers: noStore })
}

// Start a game or practice (or get the one already running).
export async function POST(req: Request, ctx: Ctx) {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const { id } = await ctx.params
  const access = await coachTeamOrNull(id)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown }
  const kind = body.kind === 'practice' ? 'practice' : 'game'
  const row = await startLive(access.team, kind, access.session.email)
  return NextResponse.json({ session: toClient(row), now: Date.now() }, { headers: noStore })
}
