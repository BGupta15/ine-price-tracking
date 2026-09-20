import 'dotenv/config';
import { revealPrice } from './revealPrice.js';

const productId = process.argv[2];
const attemptTimeoutMs = process.argv[3] ? Number(process.argv[3]) : undefined;

if (!productId) {
  console.error('Usage: node src/scraper/runOnce.js <productId> [attemptTimeoutMs]');
  process.exit(1);
}

const result = await revealPrice(
  Number(productId),
  attemptTimeoutMs ? { attemptTimeoutMs } : undefined
);
console.log(JSON.stringify(result, null, 2));