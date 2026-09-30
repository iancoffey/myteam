import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Coaches. Only an email is stored; how they log in (static password now, Google later) lives outside this table.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    // IANA zone captured from the coach's browser, used to show and enter event times.
    timeZone: text('time_zone').notNull().default('America/New_York'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('teams_owner_idx').on(t.ownerId)],
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
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('players_team_idx').on(t.teamId)],
)

export const guardians = pgTable(
  'guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    phone: text('phone'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guardians_team_idx').on(t.teamId)],
)

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    // 'game' | 'practice'
    kind: text('kind').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    location: text('location'),
    opponent: text('opponent'),
    // The family bringing snacks, identified by their kid.
    snackPlayerId: uuid('snack_player_id').references(() => players.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_team_starts_idx').on(t.teamId, t.startsAt)],
)

// A finished game from field mode: score and each kid's minutes (playerId -> ms).
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    // Client-generated so a retried save after a dropped connection is not recorded twice.
    clientId: text('client_id').notNull().unique(),
    us: integer('us').notNull(),
    them: integer('them').notNull(),
    minutes: jsonb('minutes').$type<Record<string, number>>().notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('games_team_idx').on(t.teamId)],
)

export type Team = typeof teams.$inferSelect
export type Player = typeof players.$inferSelect
export type Guardian = typeof guardians.$inferSelect
export type Event = typeof events.$inferSelect
export type Game = typeof games.$inferSelect
