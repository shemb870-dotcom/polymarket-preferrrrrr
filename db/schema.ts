import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('research_workspaces', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  mode: text('mode').notNull(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
export const preferences = sqliteTable('research_preferences', {
  owner: text('owner').primaryKey(),
  mode: text('mode').notNull().default('demo'),
});
