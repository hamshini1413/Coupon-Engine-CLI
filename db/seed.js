import db from '../src/db.js';

async function seed() {
  console.log('🌱 Initializing Database Schema...');
  await db.initSchema();

  console.log('🧹 Cleaning existing tables...');
  await db.query('DELETE FROM order_coupons');
  await db.query('DELETE FROM orders');
  await db.query('DELETE FROM coupons');

  console.log('🚀 Seeding sample coupons according to exact spec...');

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const sampleCoupons = [
    {
      code: 'WELCOME10',
      discount_type: 'flat',
      discount_value: 10.0,
      min_spend: 20.0,
      expires_at: null, // Non-expiring
      usage_limit: 100,
      times_used: 0,
      max_discount_amount: null,
      usage_limit_per_user: 2
    },
    {
      code: 'SUMMER20',
      discount_type: 'percent',
      discount_value: 20.0,
      min_spend: 50.0,
      expires_at: futureDate,
      usage_limit: 50,
      times_used: 0,
      max_discount_amount: 15.0,
      usage_limit_per_user: 1
    },
    {
      code: 'UNLIMITED5',
      discount_type: 'flat',
      discount_value: 5.0,
      min_spend: 0.0,
      expires_at: null, // Non-expiring
      usage_limit: null, // Unlimited global usage
      times_used: 0,
      max_discount_amount: null,
      usage_limit_per_user: null
    },
    {
      code: 'EXPIRED15',
      discount_type: 'percent',
      discount_value: 15.0,
      min_spend: 0.0,
      expires_at: pastDate,
      usage_limit: 10,
      times_used: 0,
      max_discount_amount: null,
      usage_limit_per_user: null
    }
  ];

  for (const c of sampleCoupons) {
    await db.query(
      `INSERT INTO coupons (code, discount_type, discount_value, min_spend, expires_at, usage_limit, times_used, max_discount_amount, usage_limit_per_user)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [c.code, c.discount_type, c.discount_value, c.min_spend, c.expires_at, c.usage_limit, c.times_used, c.max_discount_amount, c.usage_limit_per_user]
    );
    console.log(`  - Created coupon: ${c.code} (${c.discount_type} ${c.discount_value})`);
  }

  console.log('✅ Seeding completed successfully!');
  await db.close();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
