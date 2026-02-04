import { 
  users, watchlists, watchlistItems,
  type User, type UpsertUser, type Watchlist, type WatchlistItem, 
  type CreateWatchlistRequest
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
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
}

export const storage = new DatabaseStorage();
