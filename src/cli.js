import { initSchema, close } from './db.js';
import createCoupon from './commands/createCoupon.js';
import applyCoupon from './commands/applyCoupon.js';
import getCoupon from './commands/getCoupon.js';
import cancelOrder from './commands/cancelOrder.js';
import applyCoupons from './commands/applyCoupons.js';

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  await initSchema();

  switch (command) {
    case 'createCoupon': {
      const [code, discountType, discountValue, minSpend, expiresAt, usageLimit, maxDiscountAmount, usageLimitPerUser] = args;
      const res = await createCoupon(
        code,
        discountType,
        discountValue ? parseFloat(discountValue) : undefined,
        minSpend ? parseFloat(minSpend) : undefined,
        expiresAt || null,
        usageLimit ? parseInt(usageLimit, 10) : null,
        maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
        usageLimitPerUser ? parseInt(usageLimitPerUser, 10) : null
      );
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'applyCoupon': {
      const [cartTotal, code, userId] = args;
      const res = await applyCoupon(parseFloat(cartTotal), code, userId || null);
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'getCoupon': {
      const [code] = args;
      const res = await getCoupon(code);
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'cancelOrder': {
      const [orderId] = args;
      const res = await cancelOrder(parseInt(orderId, 10));
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'applyCoupons': {
      const [cartTotal, codesStr, userId] = args;
      const codes = codesStr ? codesStr.split(',') : [];
      const res = await applyCoupons(parseFloat(cartTotal), codes, userId || null);
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    default:
      console.log('Usage: node src/cli.js <command> [args...]');
      process.exit(1);
  }
}

main()
  .then(async () => {
    await close();
  })
  .catch(async (err) => {
    console.error(err.message || err);
    await close();
    process.exit(1);
  });
