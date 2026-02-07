import * as cheerio from 'cheerio';
import { getCached, setCache } from './cache';

const FINVIZ_CACHE_TTL = 86400; // 24 hours
const REQUEST_DELAY = 300; // ms between requests
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FinvizStock {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap?: string;
  price?: number;
  change?: number;
}

export interface FinvizIndustryData {
  [industry: string]: Array<{ symbol: string; name: string }>;
}

export interface FinvizSectorData {
  [sector: string]: {
    industries: string[];
    stocks: FinvizIndustryData;
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
    });
    if (!response.ok) {
      console.log(`Finviz fetch failed: ${response.status} for ${url}`);
      return null;
    }
    return await response.text();
  } catch (err: any) {
    console.log(`Finviz fetch error: ${err.message}`);
    return null;
  }
}

function parseScreenerPage(html: string): { stocks: FinvizStock[]; totalRows: number } {
  const $ = cheerio.load(html);
  const stocks: FinvizStock[] = [];

  const totalMatch = html.match(/Total:\s*<\/b>\s*(\d+)/i) || html.match(/#1\s*\/\s*(\d+)/);
  let totalRows = 0;
  
  const countEl = $('td.count-text');
  if (countEl.length > 0) {
    const countText = countEl.text();
    const match = countText.match(/Total:\s*(\d+)/i) || countText.match(/(\d+)\s*$/);
    if (match) totalRows = parseInt(match[1], 10);
  }
  if (!totalRows && totalMatch) {
    totalRows = parseInt(totalMatch[1], 10);
  }

  const rows = $('table.table-light tr, table.screener_table tr, #screener-content table tr');
  
  rows.each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 10) return;
    
    const no = $(cells[0]).text().trim();
    if (!no || isNaN(parseInt(no))) return;

    const ticker = $(cells[1]).text().trim();
    const company = $(cells[2]).text().trim();
    const sector = $(cells[3]).text().trim();
    const industry = $(cells[4]).text().trim();

    if (ticker && sector && industry) {
      stocks.push({
        symbol: ticker,
        name: company,
        sector,
        industry,
      });
    }
  });

  return { stocks, totalRows: totalRows || stocks.length };
}

const FINVIZ_SECTORS = [
  'basicmaterials',
  'communicationservices',
  'consumercyclical',
  'consumerdefensive',
  'energy',
  'financial',
  'healthcare',
  'industrials',
  'realestate',
  'technology',
  'utilities',
];

async function scrapeSector(sectorFilter: string): Promise<FinvizStock[]> {
  const sectorStocks: FinvizStock[] = [];
  const maxPagesPerSector = 75;
  let offset = 1;
  let pageCount = 0;

  while (pageCount < maxPagesPerSector) {
    const url = `https://finviz.com/screener.ashx?v=111&f=geo_usa,sec_${sectorFilter}&r=${offset}`;
    const html = await fetchPage(url);
    
    if (!html) break;

    const { stocks } = parseScreenerPage(html);
    if (stocks.length === 0) break;

    sectorStocks.push(...stocks);
    pageCount++;

    if (stocks.length < 20) break;
    offset += 20;
    await sleep(REQUEST_DELAY);
  }

  return sectorStocks;
}

async function scrapeAllStocks(): Promise<FinvizStock[]> {
  const allStocks: FinvizStock[] = [];

  console.log('[finviz] Starting sector-by-sector scrape...');

  for (const sectorFilter of FINVIZ_SECTORS) {
    const stocks = await scrapeSector(sectorFilter);
    allStocks.push(...stocks);
    const industries = new Set(stocks.map(s => s.industry));
    console.log(`[finviz] ${sectorFilter}: ${stocks.length} stocks, ${industries.size} industries`);
    await sleep(500);
  }

  console.log(`[finviz] Scrape complete: ${allStocks.length} total stocks`);
  return allStocks;
}

function organizeByIndustry(stocks: FinvizStock[]): FinvizSectorData {
  const sectorData: FinvizSectorData = {};

  for (const stock of stocks) {
    if (!sectorData[stock.sector]) {
      sectorData[stock.sector] = { industries: [], stocks: {} };
    }
    const sd = sectorData[stock.sector];
    
    if (!sd.stocks[stock.industry]) {
      sd.stocks[stock.industry] = [];
      sd.industries.push(stock.industry);
    }
    
    sd.stocks[stock.industry].push({
      symbol: stock.symbol,
      name: stock.name,
    });
  }

  for (const sector of Object.keys(sectorData)) {
    sectorData[sector].industries.sort();
    for (const industry of Object.keys(sectorData[sector].stocks)) {
      sectorData[sector].stocks[industry].sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
  }

  return sectorData;
}

let scrapeInProgress = false;
let scrapePromise: Promise<FinvizSectorData | null> | null = null;

export async function getFinvizData(): Promise<FinvizSectorData | null> {
  const cacheKey = 'finviz_sector_data';
  const cached = getCached<FinvizSectorData>(cacheKey);
  if (cached) return cached;

  if (scrapeInProgress && scrapePromise) {
    return scrapePromise;
  }

  scrapeInProgress = true;
  scrapePromise = (async () => {
    try {
      const stocks = await scrapeAllStocks();
      if (stocks.length < 100) {
        console.log(`[finviz] Too few stocks scraped (${stocks.length}), likely blocked. Skipping.`);
        return null;
      }
      
      const organized = organizeByIndustry(stocks);
      const sectorCount = Object.keys(organized).length;
      let industryCount = 0;
      for (const sector of Object.values(organized)) {
        industryCount += sector.industries.length;
      }
      
      console.log(`[finviz] Organized: ${sectorCount} sectors, ${industryCount} industries, ${stocks.length} stocks`);
      setCache(cacheKey, organized, FINVIZ_CACHE_TTL);
      return organized;
    } catch (err: any) {
      console.log(`[finviz] Scrape failed: ${err.message}`);
      return null;
    } finally {
      scrapeInProgress = false;
      scrapePromise = null;
    }
  })();

  return scrapePromise;
}

export function mergeStockLists(
  hardcoded: Array<{ symbol: string; name: string }>,
  finvizStocks: Array<{ symbol: string; name: string }> | undefined
): Array<{ symbol: string; name: string }> {
  if (!finvizStocks || finvizStocks.length === 0) return hardcoded;
  
  const seen = new Set<string>();
  const merged: Array<{ symbol: string; name: string }> = [];

  for (const stock of hardcoded) {
    if (!seen.has(stock.symbol)) {
      seen.add(stock.symbol);
      merged.push(stock);
    }
  }

  for (const stock of finvizStocks) {
    if (!seen.has(stock.symbol)) {
      seen.add(stock.symbol);
      merged.push(stock);
    }
  }

  return merged;
}

const FINVIZ_TO_OUR_NAMES: Record<string, string[]> = {
  'Semiconductors': ['Semiconductors'],
  'Software - Infrastructure': ['Software-Infrastructure', 'Cloud Computing', 'Cybersecurity', 'Data Storage'],
  'Software - Application': ['Software-Application'],
  'Banks - Regional': ['Banks-Regional'],
  'Banks - Diversified': ['Diversified Banks'],
  'Insurance - Diversified': ['Insurance'],
  'Insurance - Life': ['Life & Health Insurance'],
  'Insurance - Property & Casualty': ['Insurance', 'Property & Casualty Insurance'],
  'Insurance - Specialty': ['Insurance Brokers'],
  'Insurance - Reinsurance': ['Reinsurance'],
  'Financial Conglomerates': ['Multi-Sector Holdings'],
  'Shell Companies': ['Multi-Sector Holdings'],
  'Financial Data & Stock Exchanges': ['Financial Data'],
  'Credit Services': ['Credit Services', 'Consumer Finance'],
  'Drug Manufacturers - General': ['Drug Manufacturers', 'Pharmaceuticals'],
  'Drug Manufacturers - Specialty & Generic': ['Drug Manufacturers', 'Pharmaceuticals'],
  'Medical Devices': ['Medical Devices'],
  'Medical Instruments & Supplies': ['Medical Devices', 'Health Care Supplies'],
  'Healthcare Plans': ['Healthcare Plans'],
  'Medical Care Facilities': ['Healthcare Facilities'],
  'Health Information Services': ['Health Information'],
  'Diagnostics & Research': ['Diagnostics', 'Life Sciences Tools'],
  'Biotechnology': ['Biotechnology'],
  'Pharmaceutical Retailers': ['Drug Retail'],
  'Healthcare Information Services': ['Health Information', 'Healthcare Services'],
  'Medical Distribution': ['Medical Distribution'],
  'Oil & Gas E&P': ['Oil & Gas E&P'],
  'Oil & Gas Integrated': ['Integrated Oil & Gas', 'Oil & Gas E&P'],
  'Oil & Gas Midstream': ['Oil & Gas Midstream'],
  'Oil & Gas Refining & Marketing': ['Oil Refining'],
  'Oil & Gas Equipment & Services': ['Oil & Gas Equipment'],
  'Oil & Gas Drilling': ['Oil & Gas Drilling'],
  'Uranium': ['Uranium', 'Nuclear Energy'],
  'Thermal Coal': ['Coal'],
  'Aerospace & Defense': ['Aerospace & Defense'],
  'Specialty Industrial Machinery': ['Industrial Machinery', 'Specialty Machinery'],
  'Railroads': ['Railroads'],
  'Farm & Heavy Construction Machinery': ['Farm Machinery', 'Farm & Construction Machinery'],
  'Building Products & Equipment': ['Building Products'],
  'Waste Management': ['Waste Management'],
  'Electrical Equipment & Parts': ['Electrical Equipment'],
  'Trucking': ['Trucking'],
  'Marine Shipping': ['Marine Shipping'],
  'Airlines': ['Airlines'],
  'Rental & Leasing Services': ['Rental & Leasing'],
  'Engineering & Construction': ['Engineering', 'Construction'],
  'Integrated Freight & Logistics': ['Air Freight & Logistics', 'Freight & Logistics'],
  'Industrial Distribution': ['Industrial Distribution'],
  'Conglomerates': ['Conglomerates'],
  'Staffing & Employment Services': ['Staffing'],
  'Security & Protection Services': ['Security Services'],
  'Metal Fabrication': ['Metal Fabrication'],
  'Consulting Services': ['Consulting Services'],
  'Specialty Business Services': ['Staffing', 'Consulting Services'],
  'Business Equipment & Supplies': ['Conglomerates'],
  'Pollution & Treatment Controls': ['Waste Management'],
  'Internet Retail': ['Internet Retail', 'Broadline Retail'],
  'Restaurants': ['Restaurants'],
  'Home Improvement Retail': ['Home Improvement'],
  'Travel Services': ['Travel & Leisure'],
  'Auto Manufacturers': ['Auto Manufacturers'],
  'Apparel Retail': ['Apparel'],
  'Apparel Manufacturing': ['Apparel'],
  'Auto Parts': ['Auto Parts'],
  'Residential Construction': ['Homebuilding'],
  'Leisure': ['Leisure Products'],
  'Footwear & Accessories': ['Footwear'],
  'Specialty Retail': ['Specialty Retail', 'Broadline Retail'],
  'Resorts & Casinos': ['Gambling'],
  'Gambling': ['Gambling'],
  'Lodging': ['Travel & Leisure'],
  'Auto & Truck Dealerships': ['Auto Manufacturers'],
  'Furnishings, Fixtures & Appliances': ['Luxury Goods'],
  'Packaging & Containers': ['Paper & Packaging'],
  'Textile Manufacturing': ['Apparel'],
  'Department Stores': ['Broadline Retail'],
  'Luxury Goods': ['Luxury Goods'],
  'Household & Personal Products': ['Household Products', 'Personal Products'],
  'Packaged Foods': ['Packaged Foods'],
  'Discount Stores': ['Discount Stores'],
  'Beverages - Non-Alcoholic': ['Beverages'],
  'Beverages - Wineries & Distilleries': ['Brewers & Distillers'],
  'Beverages - Brewers': ['Brewers & Distillers'],
  'Tobacco': ['Tobacco'],
  'Confectioners': ['Packaged Foods'],
  'Farm Products': ['Farm Products'],
  'Food Distribution': ['Food Distribution'],
  'Grocery Stores': ['Food Retail'],
  'Education & Training Services': ['Education Services'],
  'REIT - Residential': ['REIT-Residential'],
  'REIT - Industrial': ['REIT-Industrial'],
  'REIT - Retail': ['REIT-Retail'],
  'REIT - Healthcare Facilities': ['REIT-Healthcare'],
  'REIT - Office': ['REIT-Office'],
  'REIT - Specialty': ['REIT-Specialty'],
  'REIT - Hotel & Motel': ['REIT-Hotel'],
  'REIT - Diversified': ['REIT-Diversified'],
  'REIT - Mortgage': ['REIT-Diversified'],
  'Real Estate Services': ['Real Estate Services'],
  'Real Estate - Development': ['Real Estate Development'],
  'Real Estate - Diversified': ['REIT-Diversified'],
  'Utilities - Regulated Electric': ['Electric Utilities'],
  'Utilities - Regulated Gas': ['Gas Utilities'],
  'Utilities - Regulated Water': ['Water Utilities'],
  'Utilities - Diversified': ['Multi-Utilities'],
  'Utilities - Renewable': ['Renewable Utilities'],
  'Utilities - Independent Power Producers': ['Independent Power', 'Nuclear Energy'],
  'Gold': ['Gold', 'Precious Metals'],
  'Copper': ['Copper'],
  'Aluminum': ['Aluminium'],
  'Steel': ['Steel'],
  'Lumber & Wood Production': ['Lumber & Wood'],
  'Paper & Paper Products': ['Paper & Packaging'],
  'Other Precious Metals & Mining': ['Precious Metals', 'Silver'],
  'Specialty Chemicals': ['Specialty Chemicals'],
  'Chemicals': ['Commodity Chemicals', 'Specialty Chemicals'],
  'Agricultural Inputs': ['Fertilizers'],
  'Building Materials': ['Building Materials'],
  'Coking Coal': ['Coal'],
  'Silver': ['Silver'],
  'Other Industrial Metals & Mining': ['Diversified Metals & Mining'],
  'Telecom Services': ['Telecom Services', 'Integrated Telecom', 'Wireless Telecom'],
  'Internet Content & Information': ['Internet Content', 'Social Media', 'Streaming'],
  'Entertainment': ['Entertainment', 'Gaming', 'Streaming'],
  'Electronic Gaming & Multimedia': ['Gaming'],
  'Advertising Agencies': ['Advertising'],
  'Broadcasting': ['Broadcasting'],
  'Publishing': ['Publishing'],
  'Pay TV': ['Broadcasting'],
  'Communication Equipment': ['Communications Equipment'],
  'Information Technology Services': ['IT Services'],
  'Semiconductor Equipment & Materials': ['Semiconductor Equipment'],
  'Scientific & Technical Instruments': ['Electronic Manufacturing'],
  'Solar': ['Renewable Energy'],
  'Computer Hardware': ['Computer Hardware'],
  'Consumer Electronics': ['Consumer Electronics'],
  'Electronic Components': ['Electronic Components'],
  'Electronics & Computer Distribution': ['Technology Distributors'],
  'Exchange Traded Fund': [],
};

let reverseMapCache: Record<string, string[]> | null = null;

function buildReverseMap(): Record<string, string[]> {
  if (reverseMapCache) return reverseMapCache;
  const result: Record<string, string[]> = {};
  for (const [finvizName, ourNames] of Object.entries(FINVIZ_TO_OUR_NAMES)) {
    for (const ourName of ourNames) {
      if (!result[ourName]) result[ourName] = [];
      if (!result[ourName].includes(finvizName)) {
        result[ourName].push(finvizName);
      }
    }
  }
  reverseMapCache = result;
  return result;
}

export function getIndustryNameMapping(finvizIndustry: string): string | null {
  const targets = FINVIZ_TO_OUR_NAMES[finvizIndustry];
  return targets && targets.length > 0 ? targets[0] : null;
}

export function getFinvizNamesForIndustry(ourIndustryName: string): string[] {
  const reverseMap = buildReverseMap();
  return reverseMap[ourIndustryName] || [];
}
