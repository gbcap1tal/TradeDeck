import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import auth models
export * from "./models/auth";
import { users } from "./models/auth";

// === TABLE DEFINITIONS ===

export const watchlists = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const watchlistItems = pgTable("watchlist_items", {
  id: serial("id").primaryKey(),
  watchlistId: integer("watchlist_id").notNull().references(() => watchlists.id, { onDelete: 'cascade' }),
  symbol: text("symbol").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});

export const megatrends = pgTable("megatrends", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tickers: text("tickers").array().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const watchlistsRelations = relations(watchlists, ({ one, many }) => ({
  user: one(users, {
    fields: [watchlists.userId],
    references: [users.id],
  }),
  items: many(watchlistItems),
}));

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  watchlist: one(watchlists, {
    fields: [watchlistItems.watchlistId],
    references: [watchlists.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertWatchlistSchema = createInsertSchema(watchlists).omit({ id: true, createdAt: true });
export const insertWatchlistItemSchema = createInsertSchema(watchlistItems).omit({ id: true, addedAt: true });
export const insertMegatrendSchema = createInsertSchema(megatrends).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

// Domain types
export type Watchlist = typeof watchlists.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type Megatrend = typeof megatrends.$inferSelect;
export type CreateMegatrendRequest = z.infer<typeof insertMegatrendSchema>;

// Request types
export type CreateWatchlistRequest = z.infer<typeof insertWatchlistSchema>;
export type AddWatchlistItemRequest = z.infer<typeof insertWatchlistItemSchema>;

// Response types
export type WatchlistResponse = Watchlist & { items?: WatchlistItem[] };

// Market Data Types (Non-database)
export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
}

export interface SectorPerformance {
  name: string;
  changePercent: number;
  performance: "positive" | "negative" | "neutral";
}

export interface MarketStatus {
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  imageUrl?: string;
  timestamp: number;
  relatedSymbols: string[];
}
