import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripe/stripeClient";
import { WebhookHandlers } from "./stripe/webhookHandlers";
import { storage } from "./storage";

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception (kept alive):', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled rejection (kept alive):', reason);
});

const requiredEnvVars = ['DATABASE_URL', 'SESSION_SECRET'] as const;
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

const optionalEnvVars = ['FMP_KEY', 'ALPHA_VANTAGE_KEY', 'ADMIN_USER_ID'] as const;
const missingOptional = optionalEnvVars.filter(v => !process.env[v]);
if (missingOptional.length > 0) {
  console.warn(`[startup] Missing optional environment variables: ${missingOptional.join(', ')} — some features may be limited`);
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[stripe] DATABASE_URL required for Stripe integration');
    return;
  }

  try {
    console.log('[stripe] Initializing schema...');
    await runMigrations({ databaseUrl } as any);
    console.log('[stripe] Schema ready');

    const stripeSync = await getStripeSync();

    try {
      const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      console.log(`[stripe] Webhook configured: ${result?.webhook?.url || 'OK'}`);
    } catch (whErr: any) {
      console.log(`[stripe] Webhook setup skipped: ${whErr.message}`);
    }

    stripeSync.syncBackfill()
      .then(() => console.log('[stripe] Data synced'))
      .catch((err: any) => console.error('[stripe] Sync error:', err.message));
  } catch (error: any) {
    console.error('[stripe] Init error:', error.message);
  }
}

initStripe().catch(err => console.error('[stripe] Failed to initialize:', err.message));

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing signature' });

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('[stripe] Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.slice(0, 200) + '...' : jsonStr}`;
      }

      if (res.statusCode >= 400 || duration > 5000) {
        log(logLine);
      }
    }
  });

  next();
});

async function seedMegatrends() {
  try {
    const existing = await storage.getMegatrends();
    if (existing.length > 0) {
      console.log(`[seed] Megatrends: ${existing.length} baskets already exist`);
      return;
    }
    console.log('[seed] Megatrends table is empty — seeding default baskets...');
    const defaults = [
      { name: 'Rare Earths', tickers: ['TMRC','TMC','UAMY','NB','IDR','MP','PPTA','USAR','UUUU','ERO','AREC','IPX','CRML'] },
      { name: 'Memory & Storage', tickers: ['SNDK','STX','WDC','MU','LRCX','SIMO','AMAT','RMBS'] },
      { name: 'Drones', tickers: ['ESLT','AVAV','AIRO','ONDS','UAVS','KTOS','RCAT','DPRO','AMPX','UMAC','PDYN'] },
      { name: 'Robotics', tickers: ['OUST','RR','TER','ROK','SYM','TSLA','PATH','MDT','ISRG','SYK','SERV','ZBRA','ARBE','XPEV','AUR','KDK','OII','PRCT','TDY','CGNX'] },
      { name: 'Batteries', tickers: ['EOSE','ABAT','AMPX','SLDP','QS','MVST','FLNC','ENVX','STEM','SES','ULBI'] },
      { name: 'Opticals & Photonics', tickers: ['PLAB','COHR','IPGP','LITE','AAOI','CIEN','ADTN','AXTI','SLAB','VSH','NOVT','FN','GLW','APH','TEL','COMM'] },
      { name: 'Space', tickers: ['RKLB','FLY','RDW','ASTS','NOC','BA','PL','MNTS','LUNR','GD','LHX','TDY','STM','BWTX','AME','HON','CW','VSAT','IRDM','SATS','CAE','ASTI','SATL','SPIR','RTX','GSAT','BKSY','LMT','HEI'] },
      { name: 'Quantum Computing', tickers: ['IONQ','RGTI','QBTS','QUBT','ARQQ','LAES'] },
      { name: 'Cannabis', tickers: ['TLRY','ACB','CGC','CRON','IIPR','ZYNE','HYFM','GRWG','VFF','SNDL','HITI'] },
      { name: 'Data Centers & Hyperscalers', tickers: ['IREN','NBIS','APLD','WULF','CRWV','CIFR','DGXX','WIFY','GLXY','HUT','CLSK','GOGL','MSFT','AMZN','ORCL','NUAI'] },
      { name: 'Crypto & Stablecoin', tickers: ['COIN','MARA','RIOT','HOOD','PYPL','CRCL','BK','CME','IBKR'] },
      { name: 'Genomics', tickers: ['CRSP','NTLA','EDIT','BEAM','VERV','BLUE','FATE','SGMO','RVMD','ILMN','TMO','PACB','TXG','CDNA','RGEN','DNA','TWST','CODX','RXRX','SDGR','GRAL','EXAS'] },
      { name: 'Autonomous Systems', tickers: ['TSLA','KDK','AUR','UBER','GOOG','MBLY','AEVA','LIDR','INVZ','OUST','BIDU','WRD','PONY'] },
      { name: 'eVTOLs', tickers: ['ACHR','JOBY','EH','EVEX','BLDE','SRFM','BETA','HOVR','EVTL'] },
      { name: 'Psychedelics & Mental Health', tickers: ['DFTX','CMPS','ATAI','NUVB','PRAX','HELP','GHRS','MIRA','BNOX','SEEL','KTTA','QNTM','TALK','TDOC','AMWL','HIMS','PSIL'] },
      { name: 'Fintech & Neobanks', tickers: ['SOFI','NU','DAVE','CHYM','KLAR','AFRM','SEZL','XYZ','PYPL','TOST','FOUR','MQ','PAYO','RELY','RPAY','SHOP','UPST','NCNO','LC','LMND','ROOT','BILL','HOOD','CRCL'] },
      { name: 'GLP-1 & Weight Loss', tickers: ['LLY','NVO','AMGN','PFE','AZN','RHHBY','MRK','JNJ','ABI','VKTX','GPCR','TERN','HIMS','ZEAL','CTLT','WST','BDX','WW'] },
    ];
    for (const d of defaults) {
      await storage.createMegatrend(d);
    }
    console.log(`[seed] Seeded ${defaults.length} megatrend baskets`);
  } catch (err: any) {
    console.error(`[seed] Failed to seed megatrends: ${err.message}`);
  }
}

(async () => {
  await seedMegatrends();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
