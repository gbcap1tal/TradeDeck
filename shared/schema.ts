import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision, varchar, date, bigint, real } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import auth models
export * from "./models/auth";
import { users } from "./models/auth";

// === FREE ACCESS USERS ===

export const freeUsers = pgTable("free_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFreeUserSchema = createInsertSchema(freeUsers).omit({ id: true, createdAt: true, passwordHash: true });
export type FreeUser = typeof freeUsers.$inferSelect;
export type InsertFreeUser = z.infer<typeof insertFreeUserSchema>;

// === WAITLIST ===

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWaitlistSchema = createInsertSchema(waitlist).omit({ id: true, createdAt: true });
export type WaitlistEntry = typeof waitlist.$inferSelect;
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;

// === EARNINGS TABLE DEFINITIONS ===

export const earningsReports = pgTable("earnings_reports", {
  id: serial("id").primaryKey(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  companyName: text("company_name").notNull(),
  reportDate: date("report_date").notNull(),
  timing: varchar("timing", { length: 10 }).notNull(),
  epsEstimate: real("eps_estimate"),
  epsReported: real("eps_reported"),
  epsSurprisePct: real("eps_surprise_pct"),
  revenueEstimate: doublePrecision("revenue_estimate"),
  revenueReported: doublePrecision("revenue_reported"),
  revenueSurprisePct: real("revenue_surprise_pct"),
  priceChangePct: real("price_change_pct"),
  volumeOnDay: bigint("volume_on_day", { mode: "number" }),
  avgDailyVolume20d: bigint("avg_daily_volume_20d", { mode: "number" }),
  volumeIncreasePct: real("volume_increase_pct"),
  gapPct: real("gap_pct"),
  priorClose: real("prior_close"),
  openPrice: real("open_price"),
  high52w: real("high_52w"),
  price2MonthsAgo: real("price_2months_ago"),
  aiSummary: text("ai_summary"),
  transcriptSource: varchar("transcript_source", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const qualityScoresCache = pgTable("quality_scores_cache", {
  symbol: varchar("symbol", { length: 20 }).primaryKey(),
  score: real("score").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type QualityScoreCache = typeof qualityScoresCache.$inferSelect;

export const compressionScoresCache = pgTable("compression_scores_cache", {
  symbol: varchar("symbol", { length: 20 }).primaryKey(),
  score: real("score").notNull(),
  data: text("data"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CompressionScoreCache = typeof compressionScoresCache.$inferSelect;

export const epScores = pgTable("ep_scores", {
  id: serial("id").primaryKey(),
  earningsReportId: integer("earnings_report_id").notNull().references(() => earningsReports.id, { onDelete: 'cascade' }),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  reportDate: date("report_date").notNull(),
  totalScore: real("total_score"),
  volumeScore: real("volume_score"),
  guidanceScore: real("guidance_score"),
  earningsQualityScore: real("earnings_quality_score"),
  gapScore: real("gap_score"),
  narrativeScore: real("narrative_score"),
  baseQualityScore: real("base_quality_score"),
  bonusPoints: real("bonus_points"),
  isDisqualified: boolean("is_disqualified").default(false),
  disqualificationReason: text("disqualification_reason"),
  classification: varchar("classification", { length: 20 }),
  aiVerdict: text("ai_verdict"),
  aiNarrativeAssessment: text("ai_narrative_assessment"),
  aiGuidanceAssessment: text("ai_guidance_assessment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const earningsCalendar = pgTable("earnings_calendar", {
  id: serial("id").primaryKey(),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  companyName: text("company_name").notNull(),
  reportDate: date("report_date").notNull(),
  timing: varchar("timing", { length: 10 }).notNull(),
  source: varchar("source", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

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

// === PORTFOLIO PERFORMANCE MODULE ===

export const portfolioTrades = pgTable("portfolio_trades", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  ticker: varchar("ticker", { length: 20 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  entryDate: date("entry_date").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitDate: date("exit_date"),
  exitPrice: doublePrecision("exit_price"),
  quantity: doublePrecision("quantity").notNull(),
  fees: doublePrecision("fees").default(0),
  setupTag: varchar("setup_tag", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const portfolioEquityDaily = pgTable("portfolio_equity_daily", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  totalEquity: doublePrecision("total_equity").notNull(),
  cash: doublePrecision("cash").notNull(),
  investedCapital: doublePrecision("invested_capital").notNull(),
  realizedPnl: doublePrecision("realized_pnl").notNull(),
  unrealizedPnl: doublePrecision("unrealized_pnl").notNull(),
});

export const portfolioBenchmarksDaily = pgTable("portfolio_benchmarks_daily", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  qqqPrice: doublePrecision("qqq_price"),
  spyPrice: doublePrecision("spy_price"),
});

export const portfolioConfig = pgTable("portfolio_config", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  startingCapital: doublePrecision("starting_capital").notNull().default(100000),
  startDate: date("start_date"),
});

export const portfolioSetupTags = pgTable("portfolio_setup_tags", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }),
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

// Earnings types
export type EarningsReport = typeof earningsReports.$inferSelect;
export type EpScore = typeof epScores.$inferSelect;
export type EarningsCalendarEntry = typeof earningsCalendar.$inferSelect;

export const insertEarningsReportSchema = createInsertSchema(earningsReports).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEpScoreSchema = createInsertSchema(epScores).omit({ id: true, createdAt: true });
export const insertEarningsCalendarSchema = createInsertSchema(earningsCalendar).omit({ id: true, createdAt: true });

export type InsertEarningsReport = z.infer<typeof insertEarningsReportSchema>;
export type InsertEpScore = z.infer<typeof insertEpScoreSchema>;
export type InsertEarningsCalendar = z.infer<typeof insertEarningsCalendarSchema>;

// Portfolio types
export const insertPortfolioTradeSchema = createInsertSchema(portfolioTrades).omit({ id: true, createdAt: true });
export const insertPortfolioConfigSchema = createInsertSchema(portfolioConfig).omit({ id: true });

export type PortfolioTrade = typeof portfolioTrades.$inferSelect;
export type InsertPortfolioTrade = z.infer<typeof insertPortfolioTradeSchema>;
export type PortfolioEquityDay = typeof portfolioEquityDaily.$inferSelect;
export type PortfolioBenchmarkDay = typeof portfolioBenchmarksDaily.$inferSelect;
export type PortfolioConfigType = typeof portfolioConfig.$inferSelect;
export type InsertPortfolioConfig = z.infer<typeof insertPortfolioConfigSchema>;

export const insertPortfolioSetupTagSchema = createInsertSchema(portfolioSetupTags).omit({ id: true, createdAt: true });
export type PortfolioSetupTag = typeof portfolioSetupTags.$inferSelect;
export type InsertPortfolioSetupTag = z.infer<typeof insertPortfolioSetupTagSchema>;

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
