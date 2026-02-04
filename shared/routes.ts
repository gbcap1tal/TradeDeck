import { z } from 'zod';
import { insertWatchlistSchema, insertWatchlistItemSchema, watchlists, watchlistItems } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  // Market Data Endpoints
  market: {
    indices: {
      method: 'GET' as const,
      path: '/api/market/indices',
      responses: {
        200: z.array(z.object({
          symbol: z.string(),
          name: z.string(),
          price: z.number(),
          change: z.number(),
          changePercent: z.number(),
        })),
      },
    },
    sectors: {
      method: 'GET' as const,
      path: '/api/market/sectors',
      responses: {
        200: z.array(z.object({
          name: z.string(),
          changePercent: z.number(),
          performance: z.enum(["positive", "negative", "neutral"]),
        })),
      },
    },
    status: {
      method: 'GET' as const,
      path: '/api/market/status',
      responses: {
        200: z.object({
          isOpen: z.boolean(),
          nextOpen: z.string(),
          nextClose: z.string(),
        }),
      },
    },
  },
  
  stocks: {
    quote: {
      method: 'GET' as const,
      path: '/api/stocks/:symbol/quote',
      responses: {
        200: z.object({
          symbol: z.string(),
          price: z.number(),
          change: z.number(),
          changePercent: z.number(),
          volume: z.number(),
          high: z.number(),
          low: z.number(),
          open: z.number(),
          prevClose: z.number(),
          marketCap: z.number().optional(),
          peRatio: z.number().optional(),
          dividendYield: z.number().optional(),
        }),
        404: errorSchemas.notFound,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/stocks/:symbol/history',
      input: z.object({
        range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y']).optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          time: z.string(),
          value: z.number(),
        })),
        404: errorSchemas.notFound,
      },
    },
    news: {
      method: 'GET' as const,
      path: '/api/stocks/:symbol/news',
      responses: {
        200: z.array(z.object({
          id: z.string(),
          headline: z.string(),
          summary: z.string(),
          source: z.string(),
          url: z.string(),
          timestamp: z.number(),
          imageUrl: z.string().optional(),
          relatedSymbols: z.array(z.string()),
        })),
      },
    },
  },

  watchlists: {
    list: {
      method: 'GET' as const,
      path: '/api/watchlists',
      responses: {
        200: z.array(z.custom<typeof watchlists.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/watchlists/:id',
      responses: {
        200: z.object({
          watchlist: z.custom<typeof watchlists.$inferSelect>(),
          items: z.array(z.custom<typeof watchlistItems.$inferSelect>()),
        }),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/watchlists',
      input: insertWatchlistSchema,
      responses: {
        201: z.custom<typeof watchlists.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/watchlists/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    addItem: {
      method: 'POST' as const,
      path: '/api/watchlists/:id/items',
      input: z.object({ symbol: z.string() }),
      responses: {
        201: z.custom<typeof watchlistItems.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    removeItem: {
      method: 'DELETE' as const,
      path: '/api/watchlists/:id/items/:symbol',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
