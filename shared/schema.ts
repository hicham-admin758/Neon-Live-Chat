import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  externalId: text("external_id").unique(),
  lobbyStatus: text("lobby_status").default("active"), // active, in_game
  joinedAt: text("joined_at").default("CURRENT_TIMESTAMP"),
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
  totalGames: integer("total_games").default(0),
  avgReactionTime: real("avg_reaction_time").default(0),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, joinedAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
