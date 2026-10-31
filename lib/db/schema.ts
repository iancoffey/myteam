import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { PositionGroup } from '../formats'
import type { GameLogEntry } from '../gamelog'
import type { LiveState } from '../live'

// Coaches. Sign-in is email + password (scrypt hash); Sign in with Apple can be added as another
// way to reach the same row. Bumping sessionVersion signs the account out everywhere.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  sessionVersion: integer('session_version').notNull().default(1),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// A club or league: the unit that owns teams and, later, pays. Coaches only see their clubs' teams.
export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const clubMembers = pgTable(
  'club_members',
  {
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 'admin' manages members, the invite link and deleting teams; 'coach' runs everything else.
    role: text('role').notNull().default('coach'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clubId, t.userId] }), index('club_members_user_idx').on(t.userId)],
)

// One shareable invite link per club; resetting it replaces the token.
export const clubInvites = pgTable('club_invites', {
  clubId: uuid('club_id')
    .primaryKey()
    .references(() => clubs.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    // Who created the team; kept if that coach deletes their account.
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    age: text('age').notNull(),
    // '4v4' | '7v7' | '11v11' | 'custom'
    format: text('format').notNull(),
    onField: integer('on_field').notNull(),
    keeper: boolean('keeper').notNull(),
    periods: integer('periods').notNull(),
    periodMin: integer('period_min').notNull(),
    // 0 = swap only at breaks
    subMin: integer('sub_min').notNull(),
    // Coach-defined position groups, e.g. Left/Center/Right/Goalie or Offense/Mids/Defense/Goalies.
    groups: jsonb('groups').$type<PositionGroup[]>().notNull().default(sql`'[]'::jsonb`),
    // IANA zone captured from the coach's browser, used to show dates of saved games.
    timeZone: text('time_zone').notNull().default('America/New_York'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('teams_owner_idx').on(t.ownerId), index('teams_club_idx').on(t.clubId)],
)

// Kids: first name only, by design.
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    // Ids from teams.groups this kid is tagged with. Ids of deleted groups are ignored on read.
    groupIds: jsonb('group_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Some kids never want to play in goal; they're never made keeper.
    playsGoalie: boolean('plays_goalie').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('players_team_idx').on(t.teamId)],
)

// The game or practice happening now, shared by every coach. At most one per team;
// the row is deleted when the session is finished (a game is then saved to games) or discarded.
export const liveSessions = pgTable('live_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .unique()
    .references(() => teams.id, { onDelete: 'cascade' }),
  // 'game' | 'practice'
  kind: text('kind').notNull(),
  state: jsonb('state').$type<LiveState>().notNull(),
  // Bumped on every change; writes only succeed against the version they read.
  version: integer('version').notNull().default(1),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// A finished game: score, each kid's minutes (playerId -> ms) and what happened when.
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    // The live session's id, so finishing the same session twice records one game.
    clientId: text('client_id').notNull().unique(),
    us: integer('us').notNull(),
    them: integer('them').notNull(),
    minutes: jsonb('minutes').$type<Record<string, number>>().notNull(),
    // Swaps, goals and arrivals by period, plus the period setup they were timed against.
    log: jsonb('log').$type<GameLogEntry[]>().notNull().default(sql`'[]'::jsonb`),
    periods: integer('periods'),
    periodMin: integer('period_min'),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('games_team_idx').on(t.teamId)],
)

export type Team = typeof teams.$inferSelect
export type Player = typeof players.$inferSelect
export type Game = typeof games.$inferSelect
export type Club = typeof clubs.$inferSelect
export type LiveSessionRow = typeof liveSessions.$inferSelect
