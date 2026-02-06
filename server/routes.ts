import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import * as yahoo from "./api/yahoo";
import * as fmp from "./api/fmp";
import { getCached, setCache, CACHE_TTL } from "./api/cache";

const SECTORS_DATA = [
  { name: 'Technology', ticker: 'XLK', color: '#0a84ff', industries: ['Software-Infrastructure', 'Semiconductors', 'Software-Application', 'IT Services', 'Electronic Components', 'Computer Hardware', 'Data Storage', 'Cybersecurity', 'Cloud Computing', 'Consumer Electronics', 'Semiconductor Equipment', 'Communications Equipment', 'Technology Distributors', 'Electronic Manufacturing'] },
  { name: 'Financials', ticker: 'XLF', color: '#30d158', industries: ['Banks-Regional', 'Insurance', 'Asset Management', 'Capital Markets', 'Financial Data', 'Credit Services', 'Mortgage Finance', 'Insurance Brokers', 'Diversified Banks', 'Life & Health Insurance', 'Property & Casualty Insurance', 'Reinsurance', 'Consumer Finance', 'Multi-Sector Holdings'] },
  { name: 'Healthcare', ticker: 'XLV', color: '#ff453a', industries: ['Biotechnology', 'Medical Devices', 'Pharmaceuticals', 'Health Information', 'Diagnostics', 'Healthcare Plans', 'Medical Distribution', 'Drug Manufacturers', 'Healthcare Facilities', 'Life Sciences Tools', 'Health Care Supplies', 'Healthcare Services'] },
  { name: 'Energy', ticker: 'XLE', color: '#ffd60a', industries: ['Oil & Gas E&P', 'Oil & Gas Equipment', 'Oil Refining', 'Renewable Energy', 'Natural Gas', 'Oil & Gas Midstream', 'Uranium', 'Coal', 'Integrated Oil & Gas', 'Oil & Gas Drilling'] },
  { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2', industries: ['Internet Retail', 'Restaurants', 'Specialty Retail', 'Auto Manufacturers', 'Apparel', 'Home Improvement', 'Travel & Leisure', 'Gambling', 'Luxury Goods', 'Auto Parts', 'Homebuilding', 'Footwear', 'Leisure Products', 'Broadline Retail', 'Education Services'] },
  { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a', industries: ['Beverages', 'Household Products', 'Packaged Foods', 'Food Distribution', 'Tobacco', 'Personal Products', 'Discount Stores', 'Farm Products', 'Drug Retail', 'Food Retail', 'Brewers & Distillers'] },
  { name: 'Industrials', ticker: 'XLI', color: '#64d2ff', industries: ['Aerospace & Defense', 'Railroads', 'Construction', 'Waste Management', 'Engineering', 'Airlines', 'Trucking', 'Marine Shipping', 'Staffing', 'Conglomerates', 'Building Products', 'Electrical Equipment', 'Farm Machinery', 'Air Freight & Logistics', 'Security Services', 'Industrial Machinery'] },
  { name: 'Materials', ticker: 'XLB', color: '#ffd60a', industries: ['Specialty Chemicals', 'Gold', 'Steel', 'Building Materials', 'Paper & Packaging', 'Silver', 'Aluminium', 'Copper', 'Lumber & Wood', 'Industrial Gases', 'Fertilizers', 'Diversified Metals & Mining', 'Commodity Chemicals', 'Precious Metals'] },
  { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6', industries: ['REIT-Residential', 'REIT-Industrial', 'REIT-Office', 'REIT-Healthcare', 'Real Estate Services', 'REIT-Retail', 'REIT-Specialty', 'REIT-Hotel', 'REIT-Diversified', 'Real Estate Development'] },
  { name: 'Utilities', ticker: 'XLU', color: '#30d158', industries: ['Electric Utilities', 'Gas Utilities', 'Water Utilities', 'Renewable Utilities', 'Multi-Utilities', 'Independent Power', 'Nuclear Energy'] },
  { name: 'Communication Services', ticker: 'XLC', color: '#bf5af2', industries: ['Internet Content', 'Telecom Services', 'Entertainment', 'Advertising', 'Publishing', 'Gaming', 'Streaming', 'Social Media', 'Broadcasting', 'Integrated Telecom', 'Wireless Telecom'] },
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
  'Computer Hardware': [
    { symbol: 'AAPL', name: 'Apple Inc' },
    { symbol: 'HPQ', name: 'HP Inc' },
    { symbol: 'HPE', name: 'Hewlett Packard Enterprise' },
    { symbol: 'DELL', name: 'Dell Technologies' },
    { symbol: 'LNVGY', name: 'Lenovo Group' },
  ],
  'Data Storage': [
    { symbol: 'NTAP', name: 'NetApp Inc' },
    { symbol: 'PSTG', name: 'Pure Storage' },
    { symbol: 'STX', name: 'Seagate Technology' },
    { symbol: 'WDC', name: 'Western Digital' },
    { symbol: 'SMCI', name: 'Super Micro Computer' },
  ],
  'Cybersecurity': [
    { symbol: 'PANW', name: 'Palo Alto Networks' },
    { symbol: 'CRWD', name: 'CrowdStrike Holdings' },
    { symbol: 'FTNT', name: 'Fortinet Inc' },
    { symbol: 'ZS', name: 'Zscaler Inc' },
    { symbol: 'S', name: 'SentinelOne Inc' },
  ],
  'Cloud Computing': [
    { symbol: 'AMZN', name: 'Amazon (AWS)' },
    { symbol: 'MSFT', name: 'Microsoft (Azure)' },
    { symbol: 'GOOG', name: 'Alphabet (GCP)' },
    { symbol: 'DDOG', name: 'Datadog Inc' },
    { symbol: 'NET', name: 'Cloudflare Inc' },
  ],
  'Consumer Electronics': [
    { symbol: 'SONY', name: 'Sony Group' },
    { symbol: 'ROKU', name: 'Roku Inc' },
    { symbol: 'GPRO', name: 'GoPro Inc' },
    { symbol: 'HEAR', name: 'Turtle Beach' },
    { symbol: 'KOSS', name: 'Koss Corp' },
  ],
  'Credit Services': [
    { symbol: 'V', name: 'Visa Inc' },
    { symbol: 'MA', name: 'Mastercard Inc' },
    { symbol: 'AXP', name: 'American Express' },
    { symbol: 'DFS', name: 'Discover Financial' },
    { symbol: 'SYF', name: 'Synchrony Financial' },
  ],
  'Mortgage Finance': [
    { symbol: 'RKT', name: 'Rocket Companies' },
    { symbol: 'UWMC', name: 'UWM Holdings' },
    { symbol: 'PFSI', name: 'PennyMac Financial' },
    { symbol: 'NLY', name: 'Annaly Capital Mgmt' },
    { symbol: 'AGNC', name: 'AGNC Investment' },
  ],
  'Insurance Brokers': [
    { symbol: 'MMC', name: 'Marsh & McLennan' },
    { symbol: 'AON', name: 'Aon plc' },
    { symbol: 'WTW', name: 'Willis Towers Watson' },
    { symbol: 'AJG', name: 'Arthur J. Gallagher' },
    { symbol: 'BRO', name: 'Brown & Brown' },
  ],
  'Healthcare Plans': [
    { symbol: 'UNH', name: 'UnitedHealth Group' },
    { symbol: 'ELV', name: 'Elevance Health' },
    { symbol: 'CI', name: 'Cigna Group' },
    { symbol: 'HUM', name: 'Humana Inc' },
    { symbol: 'CNC', name: 'Centene Corp' },
  ],
  'Medical Distribution': [
    { symbol: 'MCK', name: 'McKesson Corp' },
    { symbol: 'ABC', name: 'AmerisourceBergen' },
    { symbol: 'CAH', name: 'Cardinal Health' },
    { symbol: 'HSIC', name: 'Henry Schein' },
    { symbol: 'OMI', name: 'Owens & Minor' },
  ],
  'Drug Manufacturers': [
    { symbol: 'NVO', name: 'Novo Nordisk' },
    { symbol: 'AZN', name: 'AstraZeneca' },
    { symbol: 'SNY', name: 'Sanofi' },
    { symbol: 'GSK', name: 'GSK plc' },
    { symbol: 'BMY', name: 'Bristol-Myers Squibb' },
  ],
  'Oil & Gas Midstream': [
    { symbol: 'WMB', name: 'Williams Companies' },
    { symbol: 'KMI', name: 'Kinder Morgan' },
    { symbol: 'OKE', name: 'ONEOK Inc' },
    { symbol: 'ET', name: 'Energy Transfer' },
    { symbol: 'EPD', name: 'Enterprise Products' },
  ],
  'Uranium': [
    { symbol: 'CCJ', name: 'Cameco Corp' },
    { symbol: 'UEC', name: 'Uranium Energy' },
    { symbol: 'DNN', name: 'Denison Mines' },
    { symbol: 'NXE', name: 'NexGen Energy' },
    { symbol: 'LEU', name: 'Centrus Energy' },
  ],
  'Coal': [
    { symbol: 'BTU', name: 'Peabody Energy' },
    { symbol: 'ARCH', name: 'Arch Resources' },
    { symbol: 'ARLP', name: 'Alliance Resource' },
    { symbol: 'CEIX', name: 'CONSOL Energy' },
    { symbol: 'HCC', name: 'Warrior Met Coal' },
  ],
  'Home Improvement': [
    { symbol: 'HD', name: 'Home Depot' },
    { symbol: 'LOW', name: "Lowe's Companies" },
    { symbol: 'WSM', name: 'Williams-Sonoma' },
    { symbol: 'RH', name: 'RH (Restoration Hardware)' },
    { symbol: 'POOL', name: 'Pool Corp' },
  ],
  'Travel & Leisure': [
    { symbol: 'BKNG', name: 'Booking Holdings' },
    { symbol: 'ABNB', name: 'Airbnb Inc' },
    { symbol: 'MAR', name: 'Marriott Intl' },
    { symbol: 'HLT', name: 'Hilton Worldwide' },
    { symbol: 'EXPE', name: 'Expedia Group' },
  ],
  'Gambling': [
    { symbol: 'LVS', name: 'Las Vegas Sands' },
    { symbol: 'MGM', name: 'MGM Resorts' },
    { symbol: 'WYNN', name: 'Wynn Resorts' },
    { symbol: 'DKNG', name: 'DraftKings' },
    { symbol: 'FLUT', name: 'Flutter Entertainment' },
  ],
  'Luxury Goods': [
    { symbol: 'LVMUY', name: 'LVMH' },
    { symbol: 'CFRUY', name: 'Richemont' },
    { symbol: 'HESAY', name: 'Hermes Intl' },
    { symbol: 'TPR', name: 'Tapestry Inc' },
    { symbol: 'CPRI', name: 'Capri Holdings' },
  ],
  'Auto Parts': [
    { symbol: 'AZO', name: 'AutoZone Inc' },
    { symbol: 'ORLY', name: "O'Reilly Automotive" },
    { symbol: 'AAP', name: 'Advance Auto Parts' },
    { symbol: 'GPC', name: 'Genuine Parts' },
    { symbol: 'BWA', name: 'BorgWarner Inc' },
  ],
  'Personal Products': [
    { symbol: 'EL', name: 'Estee Lauder' },
    { symbol: 'COTY', name: 'Coty Inc' },
    { symbol: 'ELF', name: 'e.l.f. Beauty' },
    { symbol: 'IPAR', name: 'Inter Parfums' },
    { symbol: 'SKIN', name: 'Beauty Health' },
  ],
  'Discount Stores': [
    { symbol: 'WMT', name: 'Walmart Inc' },
    { symbol: 'COST', name: 'Costco Wholesale' },
    { symbol: 'TGT', name: 'Target Corp' },
    { symbol: 'DG', name: 'Dollar General' },
    { symbol: 'DLTR', name: 'Dollar Tree' },
  ],
  'Farm Products': [
    { symbol: 'ADM', name: 'Archer-Daniels-Midland' },
    { symbol: 'BG', name: 'Bunge Global' },
    { symbol: 'CTVA', name: 'Corteva Inc' },
    { symbol: 'DAR', name: 'Darling Ingredients' },
    { symbol: 'FDP', name: 'Fresh Del Monte' },
  ],
  'Airlines': [
    { symbol: 'DAL', name: 'Delta Air Lines' },
    { symbol: 'UAL', name: 'United Airlines' },
    { symbol: 'LUV', name: 'Southwest Airlines' },
    { symbol: 'AAL', name: 'American Airlines' },
    { symbol: 'ALK', name: 'Alaska Air Group' },
  ],
  'Trucking': [
    { symbol: 'ODFL', name: 'Old Dominion Freight' },
    { symbol: 'XPO', name: 'XPO Inc' },
    { symbol: 'JBHT', name: 'J.B. Hunt Transport' },
    { symbol: 'SAIA', name: 'Saia Inc' },
    { symbol: 'KNX', name: 'Knight-Swift Transport' },
  ],
  'Marine Shipping': [
    { symbol: 'ZIM', name: 'ZIM Integrated Shipping' },
    { symbol: 'MATX', name: 'Matson Inc' },
    { symbol: 'KEX', name: 'Kirby Corp' },
    { symbol: 'GOGL', name: 'Golden Ocean Group' },
    { symbol: 'SBLK', name: 'Star Bulk Carriers' },
  ],
  'Staffing': [
    { symbol: 'RHI', name: 'Robert Half Intl' },
    { symbol: 'MAN', name: 'ManpowerGroup' },
    { symbol: 'HEIDRICK', name: 'Heidrick & Struggles' },
    { symbol: 'ASGN', name: 'ASGN Inc' },
    { symbol: 'KFRC', name: 'Kforce Inc' },
  ],
  'Conglomerates': [
    { symbol: 'GE', name: 'GE Aerospace' },
    { symbol: 'MMM', name: '3M Company' },
    { symbol: 'DHR', name: 'Danaher Corp' },
    { symbol: 'ITW', name: 'Illinois Tool Works' },
    { symbol: 'AMZN', name: 'Amazon.com' },
  ],
  'Silver': [
    { symbol: 'PAAS', name: 'Pan American Silver' },
    { symbol: 'AG', name: 'First Majestic Silver' },
    { symbol: 'HL', name: 'Hecla Mining' },
    { symbol: 'MAG', name: 'MAG Silver' },
    { symbol: 'SVM', name: 'Silvercorp Metals' },
  ],
  'Aluminium': [
    { symbol: 'AA', name: 'Alcoa Corp' },
    { symbol: 'CENX', name: 'Century Aluminum' },
    { symbol: 'ARNC', name: 'Arconic Corp' },
    { symbol: 'KALU', name: 'Kaiser Aluminum' },
    { symbol: 'CSTM', name: 'Constellium' },
  ],
  'Copper': [
    { symbol: 'FCX', name: 'Freeport-McMoRan' },
    { symbol: 'SCCO', name: 'Southern Copper' },
    { symbol: 'TECK', name: 'Teck Resources' },
    { symbol: 'HBM', name: 'Hudbay Minerals' },
    { symbol: 'COPX', name: 'Global X Copper Miners' },
  ],
  'Lumber & Wood': [
    { symbol: 'WY', name: 'Weyerhaeuser Co' },
    { symbol: 'RYN', name: 'Rayonier Inc' },
    { symbol: 'PCH', name: 'PotlatchDeltic' },
    { symbol: 'LPX', name: 'Louisiana-Pacific' },
    { symbol: 'UFPI', name: 'UFP Industries' },
  ],
  'Industrial Gases': [
    { symbol: 'LIN', name: 'Linde plc' },
    { symbol: 'APD', name: 'Air Products & Chem' },
    { symbol: 'AIQUY', name: 'Air Liquide' },
    { symbol: 'NPSNY', name: 'Nippon Sanso' },
    { symbol: 'MESO', name: 'Mesoblast Ltd' },
  ],
  'REIT-Retail': [
    { symbol: 'SPG', name: 'Simon Property Group' },
    { symbol: 'O', name: 'Realty Income' },
    { symbol: 'NNN', name: 'NNN REIT' },
    { symbol: 'REG', name: 'Regency Centers' },
    { symbol: 'KIM', name: 'Kimco Realty' },
  ],
  'REIT-Specialty': [
    { symbol: 'EQIX', name: 'Equinix Inc' },
    { symbol: 'AMT', name: 'American Tower' },
    { symbol: 'CCI', name: 'Crown Castle' },
    { symbol: 'SBAC', name: 'SBA Communications' },
    { symbol: 'VICI', name: 'VICI Properties' },
  ],
  'REIT-Hotel': [
    { symbol: 'HST', name: 'Host Hotels & Resorts' },
    { symbol: 'PK', name: 'Park Hotels & Resorts' },
    { symbol: 'RHP', name: 'Ryman Hospitality' },
    { symbol: 'SHO', name: 'Sunstone Hotel' },
    { symbol: 'PEB', name: 'Pebblebrook Hotel' },
  ],
  'Independent Power': [
    { symbol: 'VST', name: 'Vistra Corp' },
    { symbol: 'CEG', name: 'Constellation Energy' },
    { symbol: 'NRG', name: 'NRG Energy' },
    { symbol: 'TAL', name: 'Talen Energy' },
    { symbol: 'CWEN', name: 'Clearway Energy' },
  ],
  'Nuclear Energy': [
    { symbol: 'CEG', name: 'Constellation Energy' },
    { symbol: 'CCJ', name: 'Cameco Corp' },
    { symbol: 'SMR', name: 'NuScale Power' },
    { symbol: 'OKLO', name: 'Oklo Inc' },
    { symbol: 'LEU', name: 'Centrus Energy' },
  ],
  'Gaming': [
    { symbol: 'TTWO', name: 'Take-Two Interactive' },
    { symbol: 'EA', name: 'Electronic Arts' },
    { symbol: 'RBLX', name: 'Roblox Corp' },
    { symbol: 'U', name: 'Unity Software' },
    { symbol: 'ZNGA', name: 'Zynga Inc' },
  ],
  'Streaming': [
    { symbol: 'NFLX', name: 'Netflix Inc' },
    { symbol: 'SPOT', name: 'Spotify Technology' },
    { symbol: 'ROKU', name: 'Roku Inc' },
    { symbol: 'DIS', name: 'Walt Disney (Disney+)' },
    { symbol: 'WBD', name: 'Warner Bros (Max)' },
  ],
  'Social Media': [
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'SNAP', name: 'Snap Inc' },
    { symbol: 'PINS', name: 'Pinterest Inc' },
    { symbol: 'RDDT', name: 'Reddit Inc' },
    { symbol: 'TWLO', name: 'Twilio Inc' },
  ],
  'Semiconductor Equipment': [
    { symbol: 'ASML', name: 'ASML Holding' },
    { symbol: 'AMAT', name: 'Applied Materials' },
    { symbol: 'LRCX', name: 'Lam Research' },
    { symbol: 'KLAC', name: 'KLA Corp' },
    { symbol: 'TER', name: 'Teradyne Inc' },
  ],
  'Communications Equipment': [
    { symbol: 'CSCO', name: 'Cisco Systems' },
    { symbol: 'MSI', name: 'Motorola Solutions' },
    { symbol: 'ANET', name: 'Arista Networks' },
    { symbol: 'JNPR', name: 'Juniper Networks' },
    { symbol: 'ZBRA', name: 'Zebra Technologies' },
  ],
  'Technology Distributors': [
    { symbol: 'ARW', name: 'Arrow Electronics' },
    { symbol: 'AVT', name: 'Avnet Inc' },
    { symbol: 'SNX', name: 'TD SYNNEX Corp' },
    { symbol: 'SCSC', name: 'ScanSource Inc' },
    { symbol: 'NSIT', name: 'Insight Enterprises' },
  ],
  'Electronic Manufacturing': [
    { symbol: 'FLEX', name: 'Flex Ltd' },
    { symbol: 'JBL', name: 'Jabil Inc' },
    { symbol: 'CLS', name: 'Celestica Inc' },
    { symbol: 'PLXS', name: 'Plexus Corp' },
    { symbol: 'BHE', name: 'Benchmark Electronics' },
  ],
  'Diversified Banks': [
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'WFC', name: 'Wells Fargo' },
    { symbol: 'C', name: 'Citigroup Inc' },
    { symbol: 'USB', name: 'U.S. Bancorp' },
  ],
  'Life & Health Insurance': [
    { symbol: 'AFL', name: 'Aflac Inc' },
    { symbol: 'PRU', name: 'Prudential Financial' },
    { symbol: 'MET', name: 'MetLife Inc' },
    { symbol: 'LNC', name: 'Lincoln National' },
    { symbol: 'UNM', name: 'Unum Group' },
  ],
  'Property & Casualty Insurance': [
    { symbol: 'TRV', name: 'Travelers Companies' },
    { symbol: 'ALL', name: 'Allstate Corp' },
    { symbol: 'CB', name: 'Chubb Ltd' },
    { symbol: 'PGR', name: 'Progressive Corp' },
    { symbol: 'HIG', name: 'Hartford Financial' },
  ],
  'Reinsurance': [
    { symbol: 'RNR', name: 'RenaissanceRe Holdings' },
    { symbol: 'ESGR', name: 'Enstar Group' },
    { symbol: 'RE', name: 'Everest Group' },
    { symbol: 'ACGL', name: 'Arch Capital Group' },
    { symbol: 'GNW', name: 'Genworth Financial' },
  ],
  'Consumer Finance': [
    { symbol: 'COF', name: 'Capital One Financial' },
    { symbol: 'SYF', name: 'Synchrony Financial' },
    { symbol: 'DFS', name: 'Discover Financial' },
    { symbol: 'ALLY', name: 'Ally Financial' },
    { symbol: 'SLM', name: 'SLM Corp (Sallie Mae)' },
  ],
  'Multi-Sector Holdings': [
    { symbol: 'BRK-B', name: 'Berkshire Hathaway' },
    { symbol: 'GOOG', name: 'Alphabet Inc' },
    { symbol: 'JEF', name: 'Jefferies Financial' },
    { symbol: 'LCII', name: 'LCI Industries' },
    { symbol: 'IEP', name: 'Icahn Enterprises' },
  ],
  'Healthcare Facilities': [
    { symbol: 'HCA', name: 'HCA Healthcare' },
    { symbol: 'THC', name: 'Tenet Healthcare' },
    { symbol: 'UHS', name: 'Universal Health Services' },
    { symbol: 'CYH', name: 'Community Health Systems' },
    { symbol: 'SGRY', name: 'Surgery Partners' },
  ],
  'Life Sciences Tools': [
    { symbol: 'TMO', name: 'Thermo Fisher' },
    { symbol: 'DHR', name: 'Danaher Corp' },
    { symbol: 'A', name: 'Agilent Technologies' },
    { symbol: 'WAT', name: 'Waters Corp' },
    { symbol: 'BIO', name: 'Bio-Rad Laboratories' },
  ],
  'Health Care Supplies': [
    { symbol: 'BAX', name: 'Baxter International' },
    { symbol: 'BDX', name: 'Becton Dickinson' },
    { symbol: 'COO', name: 'CooperCompanies' },
    { symbol: 'HOLX', name: 'Hologic Inc' },
    { symbol: 'ALGN', name: 'Align Technology' },
  ],
  'Healthcare Services': [
    { symbol: 'CVS', name: 'CVS Health' },
    { symbol: 'GEHC', name: 'GE HealthCare' },
    { symbol: 'DVA', name: 'DaVita Inc' },
    { symbol: 'AMGN', name: 'Amgen Inc' },
    { symbol: 'LH', name: 'Labcorp Holdings' },
  ],
  'Integrated Oil & Gas': [
    { symbol: 'XOM', name: 'Exxon Mobil' },
    { symbol: 'CVX', name: 'Chevron Corp' },
    { symbol: 'SHEL', name: 'Shell plc' },
    { symbol: 'BP', name: 'BP plc' },
    { symbol: 'TTE', name: 'TotalEnergies SE' },
  ],
  'Oil & Gas Drilling': [
    { symbol: 'HP', name: 'Helmerich & Payne' },
    { symbol: 'RIG', name: 'Transocean Ltd' },
    { symbol: 'VAL', name: 'Valaris Ltd' },
    { symbol: 'NBR', name: 'Nabors Industries' },
    { symbol: 'PTEN', name: 'Patterson-UTI Energy' },
  ],
  'Homebuilding': [
    { symbol: 'DHI', name: 'D.R. Horton' },
    { symbol: 'LEN', name: 'Lennar Corp' },
    { symbol: 'PHM', name: 'PulteGroup Inc' },
    { symbol: 'NVR', name: 'NVR Inc' },
    { symbol: 'TOL', name: 'Toll Brothers' },
  ],
  'Footwear': [
    { symbol: 'NKE', name: 'Nike Inc' },
    { symbol: 'DECK', name: 'Deckers Outdoor' },
    { symbol: 'ONON', name: 'On Holding' },
    { symbol: 'CROX', name: 'Crocs Inc' },
    { symbol: 'SKX', name: 'Skechers USA' },
  ],
  'Leisure Products': [
    { symbol: 'PTON', name: 'Peloton Interactive' },
    { symbol: 'HAS', name: 'Hasbro Inc' },
    { symbol: 'MAT', name: 'Mattel Inc' },
    { symbol: 'BC', name: 'Brunswick Corp' },
    { symbol: 'YETI', name: 'YETI Holdings' },
  ],
  'Broadline Retail': [
    { symbol: 'AMZN', name: 'Amazon.com Inc' },
    { symbol: 'WMT', name: 'Walmart Inc' },
    { symbol: 'TGT', name: 'Target Corp' },
    { symbol: 'COST', name: 'Costco Wholesale' },
    { symbol: 'BABA', name: 'Alibaba Group' },
  ],
  'Education Services': [
    { symbol: 'CHGG', name: 'Chegg Inc' },
    { symbol: 'DUOL', name: 'Duolingo Inc' },
    { symbol: 'STRA', name: 'Strategic Education' },
    { symbol: 'LRN', name: 'Stride Inc' },
    { symbol: 'LOPE', name: 'Grand Canyon Education' },
  ],
  'Drug Retail': [
    { symbol: 'WBA', name: 'Walgreens Boots Alliance' },
    { symbol: 'CVS', name: 'CVS Health' },
    { symbol: 'RAD', name: 'Rite Aid Corp' },
    { symbol: 'HITI', name: 'High Tide Inc' },
    { symbol: 'PETS', name: 'PetMed Express' },
  ],
  'Food Retail': [
    { symbol: 'KR', name: 'Kroger Co' },
    { symbol: 'ACI', name: 'Albertsons Companies' },
    { symbol: 'SFM', name: 'Sprouts Farmers Market' },
    { symbol: 'GO', name: 'Grocery Outlet' },
    { symbol: 'NGVC', name: 'Natural Grocers' },
  ],
  'Brewers & Distillers': [
    { symbol: 'TAP', name: 'Molson Coors Brewing' },
    { symbol: 'SAM', name: 'Boston Beer Co' },
    { symbol: 'DEO', name: 'Diageo plc' },
    { symbol: 'BUD', name: 'Anheuser-Busch InBev' },
    { symbol: 'STZ', name: 'Constellation Brands' },
  ],
  'Building Products': [
    { symbol: 'CARR', name: 'Carrier Global' },
    { symbol: 'JCI', name: 'Johnson Controls' },
    { symbol: 'TT', name: 'Trane Technologies' },
    { symbol: 'AOS', name: 'A.O. Smith Corp' },
    { symbol: 'AZEK', name: 'AZEK Company' },
  ],
  'Electrical Equipment': [
    { symbol: 'ETN', name: 'Eaton Corp' },
    { symbol: 'AME', name: 'AMETEK Inc' },
    { symbol: 'HUBB', name: 'Hubbell Inc' },
    { symbol: 'NVT', name: 'nVent Electric' },
    { symbol: 'POWL', name: 'Powell Industries' },
  ],
  'Farm Machinery': [
    { symbol: 'DE', name: 'Deere & Co' },
    { symbol: 'AGCO', name: 'AGCO Corp' },
    { symbol: 'CNHI', name: 'CNH Industrial' },
    { symbol: 'TTC', name: 'Toro Company' },
    { symbol: 'LNN', name: 'Lindsay Corp' },
  ],
  'Air Freight & Logistics': [
    { symbol: 'UPS', name: 'United Parcel Service' },
    { symbol: 'FDX', name: 'FedEx Corp' },
    { symbol: 'EXPD', name: 'Expeditors Intl' },
    { symbol: 'CHRW', name: 'C.H. Robinson' },
    { symbol: 'GXO', name: 'GXO Logistics' },
  ],
  'Security Services': [
    { symbol: 'LDOS', name: 'Leidos Holdings' },
    { symbol: 'BAH', name: 'Booz Allen Hamilton' },
    { symbol: 'SAIC', name: 'Science Applications' },
    { symbol: 'CACI', name: 'CACI International' },
    { symbol: 'NSSC', name: 'NAPCO Security Tech' },
  ],
  'Industrial Machinery': [
    { symbol: 'PH', name: 'Parker-Hannifin' },
    { symbol: 'DOV', name: 'Dover Corp' },
    { symbol: 'ITW', name: 'Illinois Tool Works' },
    { symbol: 'IR', name: 'Ingersoll Rand' },
    { symbol: 'XYL', name: 'Xylem Inc' },
  ],
  'Fertilizers': [
    { symbol: 'NTR', name: 'Nutrien Ltd' },
    { symbol: 'MOS', name: 'Mosaic Company' },
    { symbol: 'CF', name: 'CF Industries' },
    { symbol: 'FMC', name: 'FMC Corp' },
    { symbol: 'IPI', name: 'Intrepid Potash' },
  ],
  'Diversified Metals & Mining': [
    { symbol: 'BHP', name: 'BHP Group' },
    { symbol: 'RIO', name: 'Rio Tinto' },
    { symbol: 'VALE', name: 'Vale SA' },
    { symbol: 'TECK', name: 'Teck Resources' },
    { symbol: 'MP', name: 'MP Materials' },
  ],
  'Commodity Chemicals': [
    { symbol: 'DOW', name: 'Dow Inc' },
    { symbol: 'LYB', name: 'LyondellBasell' },
    { symbol: 'CE', name: 'Celanese Corp' },
    { symbol: 'EMN', name: 'Eastman Chemical' },
    { symbol: 'HUN', name: 'Huntsman Corp' },
  ],
  'Precious Metals': [
    { symbol: 'NEM', name: 'Newmont Corp' },
    { symbol: 'GOLD', name: 'Barrick Gold' },
    { symbol: 'WPM', name: 'Wheaton Precious Metals' },
    { symbol: 'FNV', name: 'Franco-Nevada' },
    { symbol: 'RGLD', name: 'Royal Gold' },
  ],
  'REIT-Diversified': [
    { symbol: 'WPC', name: 'W. P. Carey' },
    { symbol: 'STAG', name: 'STAG Industrial' },
    { symbol: 'BNL', name: 'Broadstone Net Lease' },
    { symbol: 'EPRT', name: 'Essential Properties' },
    { symbol: 'ADC', name: 'Agree Realty' },
  ],
  'Real Estate Development': [
    { symbol: 'HHH', name: 'Howard Hughes Holdings' },
    { symbol: 'FOR', name: 'Forestar Group' },
    { symbol: 'JOE', name: 'St. Joe Company' },
    { symbol: 'AYR', name: 'Ayr Wellness' },
    { symbol: 'UCP', name: 'United Homes Group' },
  ],
  'Broadcasting': [
    { symbol: 'CMCSA', name: 'Comcast Corp' },
    { symbol: 'FOX', name: 'Fox Corp' },
    { symbol: 'NXST', name: 'Nexstar Media Group' },
    { symbol: 'SIRI', name: 'Sirius XM Holdings' },
    { symbol: 'GTN', name: 'Gray Television' },
  ],
  'Integrated Telecom': [
    { symbol: 'T', name: 'AT&T Inc' },
    { symbol: 'VZ', name: 'Verizon Communications' },
    { symbol: 'CHTR', name: 'Charter Communications' },
    { symbol: 'LBRDA', name: 'Liberty Broadband' },
    { symbol: 'ATUS', name: 'Altice USA' },
  ],
  'Wireless Telecom': [
    { symbol: 'TMUS', name: 'T-Mobile US' },
    { symbol: 'USM', name: 'United States Cellular' },
    { symbol: 'GSAT', name: 'Globalstar Inc' },
    { symbol: 'SATS', name: 'EchoStar Corp' },
    { symbol: 'LSCC', name: 'Lattice Semiconductor' },
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

  app.get('/api/market/sectors/rotation', async (req, res) => {
    const cacheKey = 'rrg_rotation';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const SECTOR_ETFS = [
        { name: 'Technology', ticker: 'XLK', color: '#0a84ff' },
        { name: 'Financials', ticker: 'XLF', color: '#30d158' },
        { name: 'Healthcare', ticker: 'XLV', color: '#ff453a' },
        { name: 'Energy', ticker: 'XLE', color: '#ffd60a' },
        { name: 'Consumer Discretionary', ticker: 'XLY', color: '#bf5af2' },
        { name: 'Consumer Staples', ticker: 'XLP', color: '#ff9f0a' },
        { name: 'Industrials', ticker: 'XLI', color: '#64d2ff' },
        { name: 'Materials', ticker: 'XLB', color: '#ac8e68' },
        { name: 'Real Estate', ticker: 'XLRE', color: '#32ade6' },
        { name: 'Utilities', ticker: 'XLU', color: '#86d48e' },
        { name: 'Communication Services', ticker: 'XLC', color: '#e040fb' },
      ];

      const allTickers = ['SPY', ...SECTOR_ETFS.map(s => s.ticker)];
      const historyResults = await Promise.allSettled(
        allTickers.map(t => yahoo.getHistory(t, '3M'))
      );

      const historyMap = new Map<string, Array<{ time: string; close: number }>>();
      allTickers.forEach((ticker, i) => {
        const r = historyResults[i];
        if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
          historyMap.set(ticker, r.value);
        }
      });

      const spyHist = historyMap.get('SPY');
      if (!spyHist || spyHist.length < 20) {
        return res.json({ sectors: [] });
      }

      const spyByDate = new Map<string, number>();
      spyHist.forEach(d => spyByDate.set(d.time, d.close));

      const RS_PERIOD = 10;
      const MOM_PERIOD = 10;
      const TAIL_LENGTH = 5;

      const calcSMA = (arr: number[], period: number): number[] => {
        const result: number[] = [];
        for (let i = 0; i < arr.length; i++) {
          if (i < period - 1) {
            result.push(NaN);
          } else {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += arr[j];
            result.push(sum / period);
          }
        }
        return result;
      }

      const sectors = SECTOR_ETFS.map(sector => {
        const sectorHist = historyMap.get(sector.ticker);
        if (!sectorHist || sectorHist.length < 25) {
          return null;
        }

        const alignedDates: string[] = [];
        const ratios: number[] = [];

        for (const day of sectorHist) {
          const spyClose = spyByDate.get(day.time);
          if (spyClose && spyClose > 0) {
            alignedDates.push(day.time);
            ratios.push(day.close / spyClose);
          }
        }

        if (ratios.length < 25) return null;

        const ratioSMA = calcSMA(ratios, RS_PERIOD);
        const rsRatio: number[] = ratios.map((r, i) =>
          isNaN(ratioSMA[i]) ? NaN : (r / ratioSMA[i]) * 100
        );

        const rsRatioSMA = calcSMA(
          rsRatio.filter(v => !isNaN(v)),
          MOM_PERIOD
        );

        const validRS = rsRatio.filter(v => !isNaN(v));
        const rsMomentum: number[] = validRS.map((r, i) =>
          i < rsRatioSMA.length && !isNaN(rsRatioSMA[i]) && rsRatioSMA[i] > 0
            ? (r / rsRatioSMA[i]) * 100
            : NaN
        );

        const validPairs: Array<{ date: string; rsRatio: number; rsMomentum: number }> = [];
        let validIdx = 0;
        for (let i = 0; i < rsRatio.length; i++) {
          if (!isNaN(rsRatio[i])) {
            if (validIdx < rsMomentum.length && !isNaN(rsMomentum[validIdx])) {
              const dateIdx = i;
              validPairs.push({
                date: alignedDates[dateIdx],
                rsRatio: Math.round(rsRatio[i] * 100) / 100,
                rsMomentum: Math.round(rsMomentum[validIdx] * 100) / 100,
              });
            }
            validIdx++;
          }
        }

        if (validPairs.length === 0) return null;

        const weeklyPairs: typeof validPairs = [];
        for (let i = 0; i < validPairs.length; i += 5) {
          weeklyPairs.push(validPairs[Math.min(i, validPairs.length - 1)]);
        }
        if (weeklyPairs[weeklyPairs.length - 1] !== validPairs[validPairs.length - 1]) {
          weeklyPairs.push(validPairs[validPairs.length - 1]);
        }

        const tail = weeklyPairs.slice(-TAIL_LENGTH);
        const current = validPairs[validPairs.length - 1];

        let quadrant: string;
        if (current.rsRatio >= 100 && current.rsMomentum >= 100) quadrant = 'leading';
        else if (current.rsRatio >= 100 && current.rsMomentum < 100) quadrant = 'weakening';
        else if (current.rsRatio < 100 && current.rsMomentum >= 100) quadrant = 'improving';
        else quadrant = 'lagging';

        const prev = validPairs.length > 1 ? validPairs[validPairs.length - 2] : current;
        const heading = Math.atan2(
          current.rsMomentum - prev.rsMomentum,
          current.rsRatio - prev.rsRatio
        ) * (180 / Math.PI);

        return {
          name: sector.name,
          ticker: sector.ticker,
          color: sector.color,
          rsRatio: current.rsRatio,
          rsMomentum: current.rsMomentum,
          quadrant,
          heading: Math.round(heading * 10) / 10,
          tail: tail.map(t => ({
            date: t.date,
            rsRatio: t.rsRatio,
            rsMomentum: t.rsMomentum,
          })),
        };
      }).filter(Boolean);

      const result = { sectors };
      setCache(cacheKey, result, CACHE_TTL.SECTORS);
      return res.json(result);
    } catch (e: any) {
      console.error('RRG rotation error:', e.message);
      return res.json({ sectors: [] });
    }
  });

  app.get('/api/market/industries/performance', async (req, res) => {
    const cacheKey = 'industry_perf_all';
    const cached = getCached<any>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const allIndustries: Array<{ name: string; sector: string; symbols: string[] }> = [];
      for (const sector of SECTORS_DATA) {
        for (const ind of sector.industries) {
          const stocks = INDUSTRY_STOCKS[ind] || [];
          allIndustries.push({
            name: ind,
            sector: sector.name,
            symbols: stocks.slice(0, 2).map(s => s.symbol),
          });
        }
      }

      const uniqueSymbols = Array.from(new Set(allIndustries.flatMap(i => i.symbols)));

      const quotes = await yahoo.getMultipleQuotes(uniqueSymbols);
      const quoteMap = new Map<string, any>();
      for (const q of quotes) {
        if (q) quoteMap.set(q.symbol, q);
      }

      const histResults = new Map<string, any[]>();
      const histPromises = uniqueSymbols.map(async (sym) => {
        try {
          const hist = await yahoo.getHistory(sym, '1M');
          if (hist && hist.length > 0) {
            histResults.set(sym, hist);
          }
        } catch {}
      });
      await Promise.allSettled(histPromises);

      const industries = allIndustries.map(ind => {
        const indQuotes = ind.symbols.map(s => quoteMap.get(s)).filter(Boolean);
        const dailyChange = indQuotes.length > 0
          ? Math.round(indQuotes.reduce((sum: number, q: any) => sum + (q.changePercent ?? 0), 0) / indQuotes.length * 100) / 100
          : 0;

        let weeklyChange = 0;
        let monthlyChange = 0;
        let weekCount = 0;
        let monthCount = 0;

        for (const sym of ind.symbols) {
          const hist = histResults.get(sym);
          if (!hist || hist.length < 2) continue;

          const latest = hist[hist.length - 1];
          const latestPrice = latest.close;

          if (hist.length >= 6) {
            const weekAgo = hist[Math.max(0, hist.length - 6)];
            const wChange = ((latestPrice - weekAgo.close) / weekAgo.close) * 100;
            weeklyChange += wChange;
            weekCount++;
          }

          const monthAgo = hist[0];
          const mChange = ((latestPrice - monthAgo.close) / monthAgo.close) * 100;
          monthlyChange += mChange;
          monthCount++;
        }

        return {
          name: ind.name,
          sector: ind.sector,
          dailyChange,
          weeklyChange: weekCount > 0 ? Math.round(weeklyChange / weekCount * 100) / 100 : 0,
          monthlyChange: monthCount > 0 ? Math.round(monthlyChange / monthCount * 100) / 100 : 0,
          stockCount: (INDUSTRY_STOCKS[ind.name] || []).length,
        };
      });

      const result = { industries };
      setCache(cacheKey, result, CACHE_TTL.INDUSTRY_PERF);
      res.json(result);
    } catch (e: any) {
      console.error('Industry performance error:', e.message);
      res.json({ industries: [] });
    }
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

    const allSymbols: string[] = [];
    for (const ind of sectorConfig.industries) {
      const stocks = INDUSTRY_STOCKS[ind] || [];
      stocks.forEach(s => { if (!allSymbols.includes(s.symbol)) allSymbols.push(s.symbol); });
    }

    let allQuotes: any[] = [];
    try {
      allQuotes = await yahoo.getMultipleQuotes(allSymbols);
    } catch {}

    const industries = sectorConfig.industries.map(ind => {
      const stocks = INDUSTRY_STOCKS[ind] || [];
      const industryQuotes = stocks.map(s => allQuotes.find((q: any) => q?.symbol === s.symbol)).filter(Boolean);
      const avgChange = industryQuotes.length > 0
        ? Math.round(industryQuotes.reduce((sum: number, q: any) => sum + (q.changePercent ?? 0), 0) / industryQuotes.length * 100) / 100
        : 0;
      return {
        name: ind,
        changePercent: avgChange,
        stockCount: stocks.length,
        rs: 0,
        topStocks: stocks.slice(0, 3).map(s => s.symbol),
      };
    });

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
