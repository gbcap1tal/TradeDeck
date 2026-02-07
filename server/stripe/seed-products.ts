import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'TradeDeck Pro Access'" });
  if (existing.data.length > 0) {
    console.log('TradeDeck Pro Access already exists:', existing.data[0].id);
    const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
    if (prices.data.length > 0) {
      console.log('Price:', prices.data[0].id, '€' + (prices.data[0].unit_amount! / 100));
    }
    return;
  }

  const product = await stripe.products.create({
    name: 'TradeDeck Pro Access',
    description: 'Lifetime access to TradeDeck Pro — professional financial markets dashboard with Market Quality Score, sector/industry analysis, and real-time market data.',
    metadata: {
      type: 'one_time_access',
    },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 12900,
    currency: 'eur',
  });

  console.log('Product created:', product.id);
  console.log('Price created:', price.id, '€129.00');
}

createProducts().catch(console.error);
