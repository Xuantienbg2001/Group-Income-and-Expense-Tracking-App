require('ts-node/register/transpile-only');
const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const { extractInvoiceTotal } = require('../src/invoiceParser');
const { calculateEqualSplit } = require('../src/logic');

const EXPECTED = {
  'hoadon1.webp': 800_000,
  'hoadon2.webp': 219_154_740,
};

async function main() {
  const worker = await createWorker(['vie', 'eng']);

  for (const file of Object.keys(EXPECTED)) {
    const imagePath = path.join(__dirname, '..', file);
    const { data: { text } } = await worker.recognize(imagePath);
    const total = extractInvoiceTotal(text);
    const expected = EXPECTED[file];
    const ok = total === expected;

    console.log(`${ok ? 'PASS' : 'FAIL'} ${file}: ${total} (expected ${expected})`);

    const split = calculateEqualSplit(total, 'Dat', ['Dat', 'Binh', 'An']);
    const shareSum = Object.values(split.shares).reduce((a, b) => a + b, 0);
    console.log(`  shares:`, split.shares, `sum=${shareSum}`);
  }

  await worker.terminate();
}

main().catch(console.error);
