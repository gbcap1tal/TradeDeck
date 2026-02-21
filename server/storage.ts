import { 
  users, watchlists, watchlistItems, megatrends,
  type User, type UpsertUser, type Watchlist, type WatchlistItem, type Megatrend,
  type CreateWatchlistRequest, type CreateMegatrendRequest
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, isNull } from "drizzle-orm";
import { type IAuthStorage } from "./replit_integrations/auth/storage";

export interface IStorage extends IAuthStorage {
  // Watchlist methods
  createWatchlist(userId: string, watchlist: CreateWatchlistRequest): Promise<Watchlist>;
  getWatchlists(userId: string): Promise<Watchlist[]>;
  getWatchlist(id: number): Promise<Watchlist | undefined>;
  deleteWatchlist(id: number): Promise<void>;
  addWatchlistItem(watchlistId: number, symbol: string): Promise<WatchlistItem>;
  removeWatchlistItem(watchlistId: number, symbol: string): Promise<void>;
  getWatchlistItems(watchlistId: number): Promise<WatchlistItem[]>;
  // Megatrend methods
  getMegatrends(): Promise<Megatrend[]>;
  getMegatrendsForUser(userId: string): Promise<Megatrend[]>;
  getMegatrendById(id: number): Promise<Megatrend | undefined>;
  createMegatrend(data: CreateMegatrendRequest & { userId?: string | null }): Promise<Megatrend>;
  updateMegatrend(id: number, data: Partial<CreateMegatrendRequest>): Promise<Megatrend>;
  deleteMegatrend(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Auth methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Watchlist methods
  async createWatchlist(userId: string, watchlist: CreateWatchlistRequest): Promise<Watchlist> {
    const [newWatchlist] = await db.insert(watchlists).values({
      ...watchlist,
      userId,
    }).returning();
    return newWatchlist;
  }

  async getWatchlists(userId: string): Promise<Watchlist[]> {
    return await db.select().from(watchlists).where(eq(watchlists.userId, userId));
  }

  async getWatchlist(id: number): Promise<Watchlist | undefined> {
    const [watchlist] = await db.select().from(watchlists).where(eq(watchlists.id, id));
    return watchlist;
  }

  async deleteWatchlist(id: number): Promise<void> {
    await db.delete(watchlists).where(eq(watchlists.id, id));
  }

  async addWatchlistItem(watchlistId: number, symbol: string): Promise<WatchlistItem> {
    const [item] = await db.insert(watchlistItems).values({
      watchlistId,
      symbol,
    }).returning();
    return item;
  }

  async removeWatchlistItem(watchlistId: number, symbol: string): Promise<void> {
    await db.delete(watchlistItems).where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.symbol, symbol)
      )
    );
  }

  async getWatchlistItems(watchlistId: number): Promise<WatchlistItem[]> {
    return await db.select().from(watchlistItems).where(eq(watchlistItems.watchlistId, watchlistId));
  }

  async getMegatrends(): Promise<Megatrend[]> {
    return await db.select().from(megatrends);
  }

  async getMegatrendsForUser(userId: string): Promise<Megatrend[]> {
    return await db.select().from(megatrends).where(
      or(isNull(megatrends.userId), eq(megatrends.userId, userId))
    );
  }

  async getMegatrendById(id: number): Promise<Megatrend | undefined> {
    const [mt] = await db.select().from(megatrends).where(eq(megatrends.id, id));
    return mt;
  }

  async createMegatrend(data: CreateMegatrendRequest & { userId?: string | null }): Promise<Megatrend> {
    const [mt] = await db.insert(megatrends).values(data).returning();
    return mt;
  }

  async updateMegatrend(id: number, data: Partial<CreateMegatrendRequest>): Promise<Megatrend> {
    const [mt] = await db.update(megatrends).set(data).where(eq(megatrends.id, id)).returning();
    return mt;
  }

  async deleteMegatrend(id: number): Promise<void> {
    await db.delete(megatrends).where(eq(megatrends.id, id));
  }
}

export const storage = new DatabaseStorage();
