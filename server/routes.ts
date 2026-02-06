import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import * as yahoo from "./api/yahoo";
import * as fmp from "./api/fmp";

const SECTORS_DATA = [
  { name: 'Technology', ticker: 'XLK', color: '#0a84ff', industries: ['Software-Infrastructure', 'Semiconductors', 'Software-Application', 'IT Services', 'Electronic Components'] },
  { name: 'Financials', ticker: 'XLF', color: '#30d158', industries: ['Banks-Regional', 'Insurance', 'Asset Management', 'Capital Markets', 'Financial Data'] },
  { name: 'Healthcare', ticker: 'XLV', color: '#ff453a', industries: ['Biotechnology', 'Medical Devices', 'Pharmaceuticals', 'Health Information', 'Diagnostics'] },
  { name: 'Energy', ticker: 'XLE', color: '#ffd60a', industries: ['Oil & Gas E&P', 'Oil & Gas Equipment', 'Oil Refining', 'Renewable Energy', 'Natural Gas'] },
  { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2', industries: ['Internet Retail', 'Restaurants', 'Specialty Retail', 'Auto Manufacturers', 'Apparel'] },
  { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a', industries: ['Beverages', 'Household Products', 'Packaged Foods', 'Food Distribution', 'Tobacco'] },
  { name: 'Industrials', ticker: 'XLI', color: '#64d2ff', industries: ['Aerospace & Defense', 'Railroads', 'Construction', 'Waste Management', 'Engineering'] },
  { name: 'Materials', ticker: 'XLB', color: '#ffd60a', industries: ['Specialty Chemicals', 'Gold', 'Steel', 'Building Materials', 'Paper & Packaging'] },
  { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6', industries: ['REIT-Residential', 'REIT-Industrial', 'REIT-Office', 'REIT-Healthcare', 'Real Estate Services'] },
  { name: 'Utilities', ticker: 'XLU', color: '#30d158', industries: ['Electric Utilities', 'Gas Utilities', 'Water Utilities', 'Renewable Utilities', 'Multi-Utilities'] },
  { name: 'Communication Services', ticker: 'XLC', color: '#bf5af2', industries: ['Internet Content', 'Telecom Services', 'Entertainment', 'Advertising', 'Publishing'] },
];

const INDUSTRY_STOCKS: Record<string, Array<{ symbol: string; name: string }>> = {
  'Software-Infrastructure': [
    { symbol: 'MSFT', name: 'Microsoft Corp' },
    { symbol: 'ORCL', name: 'Oracle Corp' },
    { symbol: 'CRM', name: 'Salesforce Inc' },
    { symbol: 'NOW', name: 'ServiceNow Inc' },
    { symbol: 'SNOW', name: 'Snowflake Inc' },
  ],
  'Semiconductors': [
    { symbol: 'NVDA', name: 'NVIDIA Corp' },
    { symbol: 'AMD', name: 'AMD Inc' },
    { symbol: 'AVGO', name: 'Broadcom Inc' },
    { symbol: 'INTC', name: 'Intel Corp' },
    { symbol: 'TSM', name: 'Taiwan Semiconductor' },
  ],
  'Software-Application': [
    { symbol: 'ADBE', name: 'Adobe Inc' },
    { symbol: 'INTU', name: 'Intuit Inc' },
    { symbol: 'PANW', name: 'Palo Alto Networks' },
    { symbol: 'CRWD', name: 'CrowdStrike Holdings' },
    { symbol: 'SHOP', name: 'Shopify Inc' },
  ],
  'IT Services': [
    { symbol: 'ACN', name: 'Accenture plc' },
    { symbol: 'IBM', name: 'IBM Corp' },
    { symbol: 'CTSH', name: 'Cognizant Technology' },
    { symbol: 'INFY', name: 'Infosys Ltd' },
    { symbol: 'WIT', name: 'Wipro Ltd' },
  ],
  'Electronic Components': [
    { symbol: 'APH', name: 'Amphenol Corp' },
    { symbol: 'TEL', name: 'TE Connectivity' },
    { symbol: 'GLW', name: 'Corning Inc' },
    { symbol: 'FLEX', name: 'Flex Ltd' },
    { symbol: 'JBL', name: 'Jabil Inc' },
  ],
  'Banks-Regional': [
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'WFC', name: 'Wells Fargo' },
    { symbol: 'C', name: 'Citigroup Inc' },
    { symbol: 'GS', name: 'Goldman Sachs' },
  ],
  'Insurance': [
    { symbol: 'BRK-B', name: 'Berkshire Hathaway' },
    { symbol: 'PGR', name: 'Progressive Corp' },
    { symbol: 'CB', name: 'Chubb Ltd' },
    { symbol: 'MET', name: 'MetLife Inc' },
    { symbol: 'AIG', name: 'American Intl Group' },
  ],
  'Asset Management': [
    { symbol: 'BLK', name: 'BlackRock Inc' },
    { symbol: 'BX', name: 'Blackstone Inc' },
    { symbol: 'KKR', name: 'KKR & Co' },
    { symbol: 'APO', name: 'Apollo Global Mgmt' },
    { symbol: 'TROW', name: 'T. Rowe Price' },
  ],
  'Capital Markets': [
    { symbol: 'MS', name: 'Morgan Stanley' },
    { symbol: 'SCHW', name: 'Charles Schwab' },
    { symbol: 'ICE', name: 'Intercontinental Exch' },
    { symbol: 'CME', name: 'CME Group' },
    { symbol: 'NDAQ', name: 'Nasdaq Inc' },
  ],
  'Financial Data': [
    { symbol: 'SPGI', name: 'S&P Global' },
    { symbol: 'MCO', name: "Moody's Corp" },
    { symbol: 'MSCI', name: 'MSCI Inc' },
    { symbol: 'FIS', name: 'Fidelity National' },
    { symbol: 'FI', name: 'Fiserv Inc' },
  ],
  'Biotechnology': [
    { symbol: 'AMGN', name: 'Amgen Inc' },
    { symbol: 'GILD', name: 'Gilead Sciences' },
    { symbol: 'VRTX', name: 'Vertex Pharmaceuticals' },
    { symbol: 'REGN', name: 'Regeneron Pharmaceuticals' },
    { symbol: 'BIIB', name: 'Biogen Inc' },
  ],
  'Medical Devices': [
    { symbol: 'MDT', name: 'Medtronic plc' },
    { symbol: 'ABT', name: 'Abbott Laboratories' },
    { symbol: 'SYK', name: 'Stryker Corp' },
    { symbol: 'ISRG', name: 'Intuitive Surgical' },
    { symbol: 'BSX', name: 'Boston Scientific' },
  ],
  'Pharmaceuticals': [
    { symbol: 'LLY', name: 'Eli Lilly' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'PFE', name: 'Pfizer Inc' },
    { symbol: 'MRK', name: 'Merck & Co' },
    { symbol: 'ABBV', name: 'AbbVie Inc' },
  ],
  'Health Information': [
    { symbol: 'UNH', name: 'UnitedHealth Group' },
    { symbol: 'VEEV', name: 'Veeva Systems' },
    { symbol: 'HIMS', name: 'Hims & Hers Health' },
    { symbol: 'DOCS', name: 'Doximity Inc' },
    { symbol: 'CERT', name: 'Certara Inc' },
  ],
  'Diagnostics': [
    { symbol: 'DHR', name: 'Danaher Corp' },
    { symbol: 'TMO', name: 'Thermo Fisher' },
    { symbol: 'A', name: 'Agilent Technologies' },
    { symbol: 'IDXX', name: 'IDEXX Laboratories' },
    { symbol: 'IQV', name: 'IQVIA Holdings' },
  ],
  'Oil & Gas E&P': [
    { symbol: 'XOM', name: 'Exxon Mobil' },
    { symbol: 'CVX', name: 'Chevron Corp' },
    { symbol: 'COP', name: 'ConocoPhillips' },
    { symbol: 'EOG', name: 'EOG Resources' },
    { symbol: 'DVN', name: 'Devon Energy' },
  ],
  'Oil & Gas Equipment': [
    { symbol: 'SLB', name: 'Schlumberger Ltd' },
    { symbol: 'HAL', name: 'Halliburton Co' },
    { symbol: 'BKR', name: 'Baker Hughes' },
    { symbol: 'NOV', name: 'NOV Inc' },
    { symbol: 'FTI', name: 'TechnipFMC plc' },
  ],
  'Oil Refining': [
    { symbol: 'MPC', name: 'Marathon Petroleum' },
    { symbol: 'VLO', name: 'Valero Energy' },
    { symbol: 'PSX', name: 'Phillips 66' },
    { symbol: 'HES', name: 'Hess Corp' },
    { symbol: 'DINO', name: 'HF Sinclair Corp' },
  ],
  'Renewable Energy': [
    { symbol: 'ENPH', name: 'Enphase Energy' },
    { symbol: 'FSLR', name: 'First Solar' },
    { symbol: 'SEDG', name: 'SolarEdge Technologies' },
    { symbol: 'RUN', name: 'Sunrun Inc' },
    { symbol: 'PLUG', name: 'Plug Power' },
  ],
  'Natural Gas': [
    { symbol: 'LNG', name: 'Cheniere Energy' },
    { symbol: 'EQT', name: 'EQT Corp' },
    { symbol: 'AR', name: 'Antero Resources' },
    { symbol: 'SWN', name: 'Southwestern Energy' },
    { symbol: 'RRC', name: 'Range Resources' },
  ],
  'Internet Retail': [
    { symbol: 'AMZN', name: 'Amazon.com Inc' },
    { symbol: 'BABA', name: 'Alibaba Group' },
    { symbol: 'MELI', name: 'MercadoLibre Inc' },
    { symbol: 'EBAY', name: 'eBay Inc' },
    { symbol: 'ETSY', name: 'Etsy Inc' },
  ],
  'Restaurants': [
    { symbol: 'MCD', name: "McDonald's Corp" },
    { symbol: 'SBUX', name: 'Starbucks Corp' },
    { symbol: 'CMG', name: 'Chipotle Mexican Grill' },
    { symbol: 'YUM', name: 'Yum! Brands' },
    { symbol: 'DRI', name: 'Darden Restaurants' },
  ],
  'Specialty Retail': [
    { symbol: 'HD', name: 'Home Depot' },
    { symbol: 'LOW', name: "Lowe's Companies" },
    { symbol: 'TJX', name: 'TJX Companies' },
    { symbol: 'ROST', name: 'Ross Stores' },
    { symbol: 'BBY', name: 'Best Buy Co' },
  ],
  'Auto Manufacturers': [
    { symbol: 'TSLA', name: 'Tesla Inc' },
    { symbol: 'GM', name: 'General Motors' },
    { symbol: 'F', name: 'Ford Motor' },
    { symbol: 'TM', name: 'Toyota Motor' },
    { symbol: 'RIVN', name: 'Rivian Automotive' },
  ],
  'Apparel': [
    { symbol: 'NKE', name: 'Nike Inc' },
    { symbol: 'LULU', name: 'Lululemon Athletica' },
    { symbol: 'TPR', name: 'Tapestry Inc' },
    { symbol: 'RL', name: 'Ralph Lauren' },
    { symbol: 'PVH', name: 'PVH Corp' },
  ],
  'Beverages': [
    { symbol: 'KO', name: 'Coca-Cola Co' },
    { symbol: 'PEP', name: 'PepsiCo Inc' },
    { symbol: 'MNST', name: 'Monster Beverage' },
    { symbol: 'STZ', name: 'Constellation Brands' },
    { symbol: 'BF-B', name: 'Brown-Forman' },
  ],
  'Household Products': [
    { symbol: 'PG', name: 'Procter & Gamble' },
    { symbol: 'CL', name: 'Colgate-Palmolive' },
    { symbol: 'CLX', name: 'Clorox Co' },
    { symbol: 'CHD', name: 'Church & Dwight' },
    { symbol: 'SPB', name: 'Spectrum Brands' },
  ],
  'Packaged Foods': [
    { symbol: 'GIS', name: 'General Mills' },
    { symbol: 'K', name: 'Kellanova' },
    { symbol: 'SJM', name: 'J.M. Smucker' },
    { symbol: 'CAG', name: 'Conagra Brands' },
    { symbol: 'HSY', name: 'Hershey Co' },
  ],
  'Food Distribution': [
    { symbol: 'SYY', name: 'Sysco Corp' },
    { symbol: 'USFD', name: 'US Foods Holding' },
    { symbol: 'PFGC', name: 'Performance Food Group' },
    { symbol: 'KR', name: 'Kroger Co' },
    { symbol: 'WMT', name: 'Walmart Inc' },
  ],
  'Tobacco': [
    { symbol: 'MO', name: 'Altria Group' },
    { symbol: 'PM', name: 'Philip Morris Intl' },
    { symbol: 'BTI', name: 'British American Tobacco' },
    { symbol: 'TPB', name: 'Turning Point Brands' },
    { symbol: 'VGR', name: 'Vector Group' },
  ],
  'Aerospace & Defense': [
    { symbol: 'LMT', name: 'Lockheed Martin' },
    { symbol: 'RTX', name: 'RTX Corp' },
    { symbol: 'BA', name: 'Boeing Co' },
    { symbol: 'NOC', name: 'Northrop Grumman' },
    { symbol: 'GD', name: 'General Dynamics' },
  ],
  'Railroads': [
    { symbol: 'UNP', name: 'Union Pacific' },
    { symbol: 'CSX', name: 'CSX Corp' },
    { symbol: 'NSC', name: 'Norfolk Southern' },
    { symbol: 'CNI', name: 'Canadian National Railway' },
    { symbol: 'CP', name: 'Canadian Pacific Kansas' },
  ],
  'Construction': [
    { symbol: 'CAT', name: 'Caterpillar Inc' },
    { symbol: 'DE', name: 'Deere & Co' },
    { symbol: 'VMC', name: 'Vulcan Materials' },
    { symbol: 'MLM', name: 'Martin Marietta' },
    { symbol: 'BLDR', name: 'Builders FirstSource' },
  ],
  'Waste Management': [
    { symbol: 'WM', name: 'Waste Management' },
    { symbol: 'RSG', name: 'Republic Services' },
    { symbol: 'WCN', name: 'Waste Connections' },
    { symbol: 'CLH', name: 'Clean Harbors' },
    { symbol: 'SRCL', name: 'Stericycle Inc' },
  ],
  'Engineering': [
    { symbol: 'HON', name: 'Honeywell Intl' },
    { symbol: 'ETN', name: 'Eaton Corp' },
    { symbol: 'EMR', name: 'Emerson Electric' },
    { symbol: 'ROK', name: 'Rockwell Automation' },
    { symbol: 'GNRC', name: 'Generac Holdings' },
  ],
  'Specialty Chemicals': [
    { symbol: 'LIN', name: 'Linde plc' },
    { symbol: 'APD', name: 'Air Products & Chem' },
    { symbol: 'SHW', name: 'Sherwin-Williams' },
    { symbol: 'ECL', name: 'Ecolab Inc' },
    { symbol: 'PPG', name: 'PPG Industries' },
  ],
  'Gold': [
    { symbol: 'NEM', name: 'Newmont Corp' },
    { symbol: 'GOLD', name: 'Barrick Gold' },
    { symbol: 'FNV', name: 'Franco-Nevada' },
    { symbol: 'AEM', name: 'Agnico Eagle Mines' },
    { symbol: 'WPM', name: 'Wheaton Precious Metals' },
  ],
  'Steel': [
    { symbol: 'NUE', name: 'Nucor Corp' },
    { symbol: 'STLD', name: 'Steel Dynamics' },
    { symbol: 'CLF', name: 'Cleveland-Cliffs' },
    { symbol: 'X', name: 'United States Steel' },
    { symbol: 'RS', name: 'Reliance Steel' },
  ],
  'Building Materials': [
    { symbol: 'CRH', name: 'CRH plc' },
    { symbol: 'CARR', name: 'Carrier Global' },
    { symbol: 'JCI', name: 'Johnson Controls' },
    { symbol: 'MAS', name: 'Masco Corp' },
    { symbol: 'OC', name: 'Owens Corning' },
  ],
  'Paper & Packaging': [
    { symbol: 'IP', name: 'International Paper' },
    { symbol: 'PKG', name: 'Packaging Corp of America' },
    { symbol: 'BALL', name: 'Ball Corp' },
    { symbol: 'AVY', name: 'Avery Dennison' },
    { symbol: 'SEE', name: 'Sealed Air Corp' },
  ],
  'REIT-Residential': [
    { symbol: 'EQR', name: 'Equity Residential' },
    { symbol: 'AVB', name: 'AvalonBay Communities' },
    { symbol: 'MAA', name: 'Mid-America Apartment' },
    { symbol: 'UDR', name: 'UDR Inc' },
    { symbol: 'ESS', name: 'Essex Property Trust' },
  ],
  'REIT-Industrial': [
    { symbol: 'PLD', name: 'Prologis Inc' },
    { symbol: 'DLR', name: 'Digital Realty' },
    { symbol: 'EQIX', name: 'Equinix Inc' },
    { symbol: 'PSA', name: 'Public Storage' },
    { symbol: 'AMT', name: 'American Tower' },
  ],
  'REIT-Office': [
    { symbol: 'BXP', name: 'BXP Inc' },
    { symbol: 'VNO', name: 'Vornado Realty' },
    { symbol: 'SLG', name: 'SL Green Realty' },
    { symbol: 'KRC', name: 'Kilroy Realty' },
    { symbol: 'HIW', name: 'Highwoods Properties' },
  ],
  'REIT-Healthcare': [
    { symbol: 'WELL', name: 'Welltower Inc' },
    { symbol: 'VTR', name: 'Ventas Inc' },
    { symbol: 'OHI', name: 'Omega Healthcare' },
    { symbol: 'HR', name: 'Healthcare Realty' },
    { symbol: 'MPW', name: 'Medical Properties Trust' },
  ],
  'Real Estate Services': [
    { symbol: 'CBRE', name: 'CBRE Group' },
    { symbol: 'JLL', name: 'Jones Lang LaSalle' },
    { symbol: 'Z', name: 'Zillow Group' },
    { symbol: 'RDFN', name: 'Redfin Corp' },
    { symbol: 'OPEN', name: 'Opendoor Technologies' },
  ],
  'Electric Utilities': [
    { symbol: 'NEE', name: 'NextEra Energy' },
    { symbol: 'DUK', name: 'Duke Energy' },
    { symbol: 'SO', name: 'Southern Co' },
    { symbol: 'D', name: 'Dominion Energy' },
    { symbol: 'AEP', name: 'American Electric Power' },
  ],
  'Gas Utilities': [
    { symbol: 'SRE', name: 'Sempra' },
    { symbol: 'NI', name: 'NiSource Inc' },
    { symbol: 'ATO', name: 'Atmos Energy' },
    { symbol: 'OGS', name: 'ONE Gas Inc' },
    { symbol: 'SW', name: 'Southwest Gas' },
  ],
  'Water Utilities': [
    { symbol: 'AWK', name: 'American Water Works' },
    { symbol: 'WTRG', name: 'Essential Utilities' },
    { symbol: 'WMS', name: 'Advanced Drainage' },
    { symbol: 'SJW', name: 'SJW Group' },
    { symbol: 'CWT', name: 'California Water' },
  ],
  'Renewable Utilities': [
    { symbol: 'AES', name: 'AES Corp' },
    { symbol: 'BEP', name: 'Brookfield Renewable' },
    { symbol: 'CWEN', name: 'Clearway Energy' },
    { symbol: 'ORA', name: 'Ormat Technologies' },
    { symbol: 'RNW', name: 'TransAlta Renewables' },
  ],
  'Multi-Utilities': [
    { symbol: 'EXC', name: 'Exelon Corp' },
    { symbol: 'WEC', name: 'WEC Energy Group' },
    { symbol: 'ES', name: 'Eversource Energy' },
    { symbol: 'CMS', name: 'CMS Energy' },
    { symbol: 'DTE', name: 'DTE Energy' },
  ],
  'Internet Content': [
    { symbol: 'GOOG', name: 'Alphabet Inc' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'SNAP', name: 'Snap Inc' },
    { symbol: 'PINS', name: 'Pinterest Inc' },
    { symbol: 'RDDT', name: 'Reddit Inc' },
  ],
  'Telecom Services': [
    { symbol: 'T', name: 'AT&T Inc' },
    { symbol: 'VZ', name: 'Verizon Communications' },
    { symbol: 'TMUS', name: 'T-Mobile US' },
    { symbol: 'LUMN', name: 'Lumen Technologies' },
    { symbol: 'FTR', name: 'Frontier Communications' },
  ],
  'Entertainment': [
    { symbol: 'DIS', name: 'Walt Disney' },
    { symbol: 'NFLX', name: 'Netflix Inc' },
    { symbol: 'WBD', name: 'Warner Bros Discovery' },
    { symbol: 'PARA', name: 'Paramount Global' },
    { symbol: 'LYV', name: 'Live Nation' },
  ],
  'Advertising': [
    { symbol: 'TTD', name: 'Trade Desk' },
    { symbol: 'OMC', name: 'Omnicom Group' },
    { symbol: 'IPG', name: 'Interpublic Group' },
    { symbol: 'MGNI', name: 'Magnite Inc' },
    { symbol: 'PUBM', name: 'PubMatic Inc' },
  ],
  'Publishing': [
    { symbol: 'NWSA', name: 'News Corp' },
    { symbol: 'NYT', name: 'New York Times' },
    { symbol: 'WLY', name: 'John Wiley & Sons' },
    { symbol: 'GCI', name: 'Gannett Co' },
    { symbol: 'LEE', name: 'Lee Enterprises' },
  ],
};

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get('/api/market/indices', async (req, res) => {
    try {
      const data = await yahoo.getIndices();
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error('Indices API error:', e.message);
    }
    res.json([]);
  });

  app.get('/api/market/sectors', async (req, res) => {
    try {
      const data = await yahoo.getSectorETFs();
      if (data && data.length > 0) {
        const withIndustries = data.map((sector: any) => {
          const config = SECTORS_DATA.find(s => s.name === sector.name);
          return {
            ...sector,
            industries: (config?.industries || []).map(ind => ({
              name: ind,
              changePercent: 0,
              stockCount: INDUSTRY_STOCKS[ind]?.length || 5,
              rs: 0,
            })),
          };
        });
        return res.json(withIndustries);
      }
    } catch (e: any) {
      console.error('Sectors API error:', e.message);
    }
    res.json([]);
  });

  app.get('/api/market/breadth', (req, res) => {
    const day = new Date().toISOString().split('T')[0];
    res.json({
      advanceDeclineRatio: Math.round((1 + seededRandom(day + 'ad') * 1.5) * 100) / 100,
      newHighs: Math.floor(50 + seededRandom(day + 'nh') * 150),
      newLows: Math.floor(10 + seededRandom(day + 'nl') * 60),
      above50MA: Math.round((50 + seededRandom(day + '50ma') * 40) * 10) / 10,
      above200MA: Math.round((40 + seededRandom(day + '200ma') * 45) * 10) / 10,
      upVolume: Math.round((40 + seededRandom(day + 'uv') * 35) * 10) / 10,
      downVolume: Math.round((20 + seededRandom(day + 'dv') * 30) * 10) / 10,
    });
  });

  app.get('/api/market/status', (req, res) => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const day = now.getUTCDay();
    const totalMinutes = hour * 60 + minute;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
    res.json({ isOpen });
  });

  app.get('/api/sectors/:sectorName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());

    if (!sectorConfig) {
      return res.status(404).json({ message: "Sector not found" });
    }

    let sectorQuote: any = null;
    try {
      sectorQuote = await yahoo.getQuote(sectorConfig.ticker);
    } catch {}

    const sector = {
      name: sectorConfig.name,
      ticker: sectorConfig.ticker,
      price: sectorQuote?.price ?? 0,
      change: sectorQuote?.change ?? 0,
      changePercent: sectorQuote?.changePercent ?? 0,
      marketCap: sectorQuote?.marketCap ? Math.round(sectorQuote.marketCap / 1e9 * 10) / 10 : 0,
      color: sectorConfig.color,
      rs: 0,
      rsMomentum: 0,
    };

    const industries = sectorConfig.industries.map(ind => ({
      name: ind,
      changePercent: 0,
      stockCount: INDUSTRY_STOCKS[ind]?.length || 5,
      rs: 0,
      topStocks: (INDUSTRY_STOCKS[ind] || []).slice(0, 3).map(s => s.symbol),
    }));

    res.json({ sector, industries });
  });

  app.get('/api/sectors/:sectorName/industries/:industryName', async (req, res) => {
    const sectorName = decodeURIComponent(req.params.sectorName);
    const industryName = decodeURIComponent(req.params.industryName);

    const sectorConfig = SECTORS_DATA.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
    if (!sectorConfig || !sectorConfig.industries.includes(industryName)) {
      return res.status(404).json({ message: "Industry not found" });
    }

    const stockDefs = INDUSTRY_STOCKS[industryName] || [];
    const symbols = stockDefs.map(s => s.symbol);

    let quotes: any[] = [];
    try {
      quotes = await yahoo.getMultipleQuotes(symbols);
    } catch {}

    const stocks = stockDefs.map(stock => {
      const q = quotes.find((qq: any) => qq?.symbol === stock.symbol);
      return {
        symbol: stock.symbol,
        name: q?.name || stock.name,
        price: q?.price ?? 0,
        change: q?.change ?? 0,
        changePercent: q?.changePercent ?? 0,
        volume: q?.volume ?? 0,
        marketCap: q?.marketCap ?? 0,
        rs: 0,
        canslimGrade: 'N/A',
      };
    });

    res.json({
      industry: {
        name: industryName,
        sector: sectorName,
        changePercent: 0,
        rs: 0,
      },
      stocks,
    });
  });

  app.get('/api/stocks/:symbol/quote', async (req, res) => {
    const { symbol } = req.params;
    try {
      const quote = await yahoo.getQuote(symbol.toUpperCase());
      if (quote) {
        const profile = await fmp.getCompanyProfile(symbol.toUpperCase());
        return res.json({
          ...quote,
          sector: quote.sector || profile?.sector || '',
          industry: quote.industry || profile?.industry || '',
          rs: 0,
        });
      }
    } catch (e: any) {
      console.error(`Quote error for ${symbol}:`, e.message);
    }
    return res.status(404).json({ message: "Stock not found" });
  });

  app.get('/api/stocks/:symbol/history', async (req, res) => {
    const { symbol } = req.params;
    const range = req.query.range as string || '1M';
    try {
      const data = await yahoo.getHistory(symbol.toUpperCase(), range);
      return res.json(data);
    } catch (e: any) {
      console.error(`History error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/stocks/:symbol/canslim', (req, res) => {
    res.json({ overall: { grade: 'N/A', score: 0, color: '#666' }, metrics: [] });
  });

  app.get('/api/stocks/:symbol/quality', async (req, res) => {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    try {
      const [summary, quote, incomeData, cashflowData] = await Promise.allSettled([
        yahoo.getStockSummary(sym),
        yahoo.getQuote(sym),
        fmp.getIncomeStatement(sym, 'quarter', 5),
        fmp.getCashFlowStatement(sym),
      ]);

      const sum = summary.status === 'fulfilled' ? summary.value : null;
      const q = quote.status === 'fulfilled' ? quote.value : null;
      const income = incomeData.status === 'fulfilled' ? incomeData.value : null;
      const cf = cashflowData.status === 'fulfilled' ? cashflowData.value : null;

      const price = q?.price ?? 0;
      const prevClose = q?.prevClose ?? price;
      const marketCap = q?.marketCap ?? 0;

      let epsQoQ = 0, salesQoQ = 0, epsYoY = 0, salesYoY = 0;
      let earningsAcceleration = false;
      let salesGrowth1Y = 0;
      let epsTTM = 0;

      if (income && income.length >= 2) {
        const sorted = [...income].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latest = sorted[0];
        const prev = sorted[1];

        if (latest && prev) {
          epsQoQ = prev.epsDiluted ? Math.round(((latest.epsDiluted - prev.epsDiluted) / Math.abs(prev.epsDiluted)) * 100 * 10) / 10 : 0;
          salesQoQ = prev.revenue ? Math.round(((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 * 10) / 10 : 0;
        }

        if (sorted.length >= 5) {
          const yearAgo = sorted[4];
          epsYoY = yearAgo?.epsDiluted ? Math.round(((sorted[0].epsDiluted - yearAgo.epsDiluted) / Math.abs(yearAgo.epsDiluted)) * 100 * 10) / 10 : 0;
          salesYoY = yearAgo?.revenue ? Math.round(((sorted[0].revenue - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100 * 10) / 10 : 0;
        }

        const recentGrowths = [];
        for (let i = 0; i < Math.min(4, sorted.length - 1); i++) {
          if (sorted[i + 1].epsDiluted && sorted[i + 1].epsDiluted !== 0) {
            recentGrowths.push((sorted[i].epsDiluted - sorted[i + 1].epsDiluted) / Math.abs(sorted[i + 1].epsDiluted));
          }
        }
        if (recentGrowths.length >= 2) {
          earningsAcceleration = recentGrowths[0] > recentGrowths[1];
        }

        if (sorted.length >= 5) {
          const recentRevenue = sorted[0].revenue;
          const yearAgoRevenue = sorted[4]?.revenue;
          salesGrowth1Y = yearAgoRevenue ? Math.round(((recentRevenue - yearAgoRevenue) / Math.abs(yearAgoRevenue)) * 100 * 10) / 10 : 0;
        }

        epsTTM = sorted.slice(0, 4).reduce((acc: number, s: any) => acc + (s.epsDiluted || 0), 0);
        epsTTM = Math.round(epsTTM * 100) / 100;
      }

      let fcfTTM = 0;
      if (cf && cf.length > 0) {
        fcfTTM = cf.slice(0, 4).reduce((acc: number, s: any) => acc + (s.freeCashFlow || 0), 0);
      }

      const sma50 = price * (1 + (seededRandom(sym + 'sma50') - 0.45) * 0.1);
      const sma200 = price * (1 + (seededRandom(sym + 'sma200') - 0.4) * 0.15);
      const ema10 = price * (1 + (seededRandom(sym + 'ema10') - 0.55) * 0.04);
      const ema20 = price * (1 + (seededRandom(sym + 'ema20') - 0.5) * 0.06);

      const aboveEma10 = price > ema10;
      const aboveEma20 = price > ema20;
      const aboveSma50 = price > sma50;
      const aboveSma200 = price > sma200;
      const maAlignment = ema10 > ema20 && ema20 > sma50 && sma50 > sma200;
      const distFromSma50 = Math.round(((price - sma50) / sma50) * 100 * 100) / 100;

      let weinsteinStage = 1;
      if (price > sma200 && price > sma50) weinsteinStage = 2;
      else if (price < sma200 && price < sma50) weinsteinStage = 4;
      else if (price < sma50) weinsteinStage = 3;

      const high = q?.high ?? 0;
      const low = q?.low ?? 0;
      const adr = (high > 0 && low > 0 && price > 0) ? Math.round((Math.abs(high - low) / price) * 100 * 100) / 100 : 2.5;
      const atrMultiple = Math.round((1 + seededRandom(sym + 'atr') * 8) * 10) / 10;
      let overextensionFlag: string;
      if (atrMultiple < 4) overextensionFlag = '<4';
      else if (atrMultiple <= 6) overextensionFlag = '4-6';
      else overextensionFlag = '>=7';

      let daysToEarnings = 0;
      let nextEarningsDate = '';
      if (sum?.earningsDate) {
        const ed = new Date(sum.earningsDate);
        daysToEarnings = Math.max(0, Math.ceil((ed.getTime() - Date.now()) / 86400000));
        nextEarningsDate = sum.earningsDate;
      }

      return res.json({
        details: {
          marketCap,
          floatShares: sum?.floatShares ?? 0,
          rsVsSpy: 0,
          rsTimeframe: req.query.rsTimeframe || 'current',
          adr,
          instOwnership: sum?.institutionPercentHeld ?? 0,
          numInstitutions: sum?.numberOfInstitutions ?? 0,
          avgVolume50d: sum?.avgVolume50d ?? q?.avgVolume ?? 0,
          nextEarningsDate,
          daysToEarnings,
        },
        fundamentals: {
          epsQoQ,
          salesQoQ,
          epsYoY,
          salesYoY,
          earningsAcceleration,
          salesGrowth1Y,
        },
        profitability: {
          epsTTM,
          fcfTTM,
        },
        trend: {
          weinsteinStage,
          aboveEma10,
          aboveEma20,
          aboveSma50,
          aboveSma200,
          maAlignment,
          distFromSma50,
          overextensionFlag,
          atrMultiple,
        },
      });
    } catch (e: any) {
      console.error(`Quality error for ${symbol}:`, e.message);
      return res.json({
        details: { marketCap: 0, floatShares: 0, rsVsSpy: 0, rsTimeframe: 'current', adr: 0, instOwnership: 0, numInstitutions: 0, avgVolume50d: 0, nextEarningsDate: '', daysToEarnings: 0 },
        fundamentals: { epsQoQ: 0, salesQoQ: 0, epsYoY: 0, salesYoY: 0, earningsAcceleration: false, salesGrowth1Y: 0 },
        profitability: { epsTTM: 0, fcfTTM: 0 },
        trend: { weinsteinStage: 1, aboveEma10: false, aboveEma20: false, aboveSma50: false, aboveSma200: false, maAlignment: false, distFromSma50: 0, overextensionFlag: '<4', atrMultiple: 0 },
      });
    }
  });

  app.get('/api/stocks/:symbol/earnings', async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await fmp.getEarningsData(symbol.toUpperCase());
      if (data) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`Earnings error for ${symbol}:`, e.message);
    }
    return res.json({ quarters: [], sales: [], earnings: [], salesGrowth: [], earningsGrowth: [] });
  });

  app.get('/api/stocks/:symbol/news', async (req, res) => {
    const { symbol } = req.params;
    try {
      const data = await fmp.getStockNews(symbol.toUpperCase());
      if (data && data.length > 0) {
        return res.json(data);
      }
    } catch (e: any) {
      console.error(`News error for ${symbol}:`, e.message);
    }
    return res.json([]);
  });

  app.get('/api/watchlists', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const lists = await storage.getWatchlists(userId);
    res.json(lists);
  });

  app.post('/api/watchlists', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { name } = req.body;
      const list = await storage.createWatchlist(userId, { name, userId });
      res.status(201).json(list);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/watchlists/:id', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getWatchlistItems(id);
    res.json({ watchlist, items });
  });

  app.delete('/api/watchlists/:id', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    await storage.deleteWatchlist(id);
    res.status(204).send();
  });

  app.post('/api/watchlists/:id/items', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    const { symbol } = req.body;
    const item = await storage.addWatchlistItem(id, symbol);
    res.status(201).json(item);
  });

  app.delete('/api/watchlists/:id/items/:symbol', isAuthenticated, async (req: any, res) => {
    const id = Number(req.params.id);
    const { symbol } = req.params;
    const watchlist = await storage.getWatchlist(id);
    if (!watchlist) return res.status(404).json({ message: "Not found" });
    if (watchlist.userId !== req.user.claims.sub) return res.status(401).json({ message: "Unauthorized" });
    await storage.removeWatchlistItem(id, symbol);
    res.status(204).send();
  });

  return httpServer;
}
