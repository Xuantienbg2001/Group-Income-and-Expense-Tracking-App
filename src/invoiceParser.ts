const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 999_999_999_999;

const LINE_TOTAL_FORMATTED =
  /\d{1,3}(?:\.\d{3}){2,4}\d?\s*(?:đ|vnd|d)?(?!\w)/gi;

const LARGE_UNFORMATTED_VND =
  /\b(\d{6,12})\s*(?:đ|vnd|d)(?!\w)/gi;

const TOTAL_KEYWORDS = [
  'tổng cộng',
  'tổngcộng',
  'tong cong',
  'tongcong',
  'tổng tiền',
  'tong tien',
  'grand total',
];

const PAYMENT_KEYWORDS = [
  'thanh toán',
  'thanh toan',
  'thonh toan',
  'thanh torn',
  'payment due',
];

const SUBTOTAL_KEYWORDS = [
  'đơn hàng',
  'don hang',
  'subtotal',
  'tạm tính',
  'tam tinh',
];

const FORMATTED_VND =
  /\d{1,3}(?:\.\d{3}){1,2}\s*(?:đ|vnd|d)(?!\w)/gi;

const FORMATTED_VND_LOOSE =
  /\d{1,3}(?:\.\d{3}){1,2}(?!\w)/gi;

const UNFORMATTED_VND =
  /\b(\d{4,9})\s*(?:đ|vnd|d)(?!\w)/gi;

interface TotalCandidate {
  value: number;
  confidence: number;
  source: string;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[.,\s]/g, '').replace(/(?:đ|vnd|d)$/i, '');
  return parseInt(cleaned, 10);
}

function isLikelyDateFragment(line: string, raw: string): boolean {
  return /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line) && line.includes(raw);
}

function isTotalLine(line: string): boolean {
  const lower = line.toLowerCase();
  return TOTAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isMetadataLine(line: string): boolean {
  const lower = line.toLowerCase();

  if (/thuế|thue|tax/.test(lower)) return true;
  if (/số tài khoản|so tai khoan|stk|ngân hàng|ngan hang|account number/.test(lower)) {
    return true;
  }
  if (/điện thoại|dien thoai|phone|tel|fax|hotline/.test(lower)) return true;
  if (/địa chỉ|dia chi|address/.test(lower)) return true;
  if (/ngày lập|ngay lap|ngày\s+\d|ngay\s+\d/.test(lower)) return true;
  if (/xuất hóa|xuat hoa|invoice no|mã hóa|ma hoa/.test(lower)) return true;
  if (/\+[\d\s.-]{8,}\d/.test(line)) return true;

  return false;
}

function normalizeOcrAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;

  // OCR hay thêm số lẻ cuối: 120000008 -> 12000000, 1461112808 -> 146111280
  if (value % 10 !== 0) {
    const trimmed = Math.floor(value / 10);
    if (trimmed >= MIN_AMOUNT && trimmed <= MAX_AMOUNT) return trimmed;
  }

  return value;
}

function isValidAmount(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT;
}

function scoreTotalLine(line: string): number {
  const lower = line.toLowerCase();

  if (PAYMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return 100;
  }

  if (lower.includes('tổng cộng') || lower.includes('tong cong') || lower.includes('tổngcộng')) {
    return 95;
  }

  if (SUBTOTAL_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return 85;
  }

  if (lower.includes('tổng tiền') || lower.includes('tong tien')) {
    return 80;
  }

  return 70;
}

function extractFormattedAmounts(line: string, requireCurrency = true): number[] {
  const pattern = requireCurrency ? FORMATTED_VND : FORMATTED_VND_LOOSE;
  const amounts: number[] = [];

  for (const match of line.matchAll(pattern)) {
    const value = parseAmount(match[0]);
    if (isValidAmount(value)) amounts.push(value);
  }

  return amounts;
}

function pickRawAmountFromLine(line: string): number | null {
  const matches = line.match(/\d[\d.,]*(?:\s*(?:đ|vnd|d))?/gi) || [];

  for (let i = matches.length - 1; i >= 0; i--) {
    if (isLikelyDateFragment(line, matches[i])) continue;

    const value = normalizeOcrAmount(parseAmount(matches[i]));
    if (isValidAmount(value)) return value;
  }

  return null;
}

function extractLineItemAmount(line: string): number | null {
  const unitPrices = extractFormattedAmounts(line, true);
  const unitPrice = unitPrices[0] ?? 0;
  const lineTotals: number[] = [];

  for (const match of line.matchAll(LINE_TOTAL_FORMATTED)) {
    const value = normalizeOcrAmount(parseAmount(match[0]));
    if (isValidAmount(value) && (!unitPrice || value > unitPrice * 1.2)) {
      lineTotals.push(value);
    }
  }

  for (const match of line.matchAll(LARGE_UNFORMATTED_VND)) {
    const value = normalizeOcrAmount(parseAmount(match[1]));
    if (isValidAmount(value) && (!unitPrice || value > unitPrice * 1.2)) {
      lineTotals.push(value);
    }
  }

  if (lineTotals.length > 0) {
    return lineTotals[lineTotals.length - 1];
  }

  if (unitPrices.length === 1) return unitPrices[0];
  if (unitPrices.length > 1) return unitPrices[unitPrices.length - 1];

  const looseFormatted = extractFormattedAmounts(line, false);
  if (looseFormatted.length === 1) return looseFormatted[0];

  for (const match of line.matchAll(UNFORMATTED_VND)) {
    const value = normalizeOcrAmount(parseAmount(match[1]));
    if (isValidAmount(value)) return value;
  }

  return null;
}

function sumLineItemAmounts(text: string): number {
  const lines = text.split('\n');
  let sum = 0;

  for (const line of lines) {
    if (isTotalLine(line) || isMetadataLine(line)) continue;

    const amount = extractLineItemAmount(line);
    if (amount !== null) sum += amount;
  }

  return sum;
}

function amountsAreClose(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  const tolerance = Math.max(1000, Math.round(Math.max(a, b) * 0.02));
  return diff <= tolerance;
}

function collectTotalLineCandidates(text: string): TotalCandidate[] {
  const candidates: TotalCandidate[] = [];

  for (const line of text.split('\n')) {
    if (!isTotalLine(line)) continue;

    const lineScore = scoreTotalLine(line);
    const formatted = extractFormattedAmounts(line, true);

    for (const value of formatted) {
      candidates.push({
        value,
        confidence: lineScore + 15,
        source: 'formatted-total-line',
      });
    }

    if (formatted.length === 0) {
      const raw = pickRawAmountFromLine(line);
      if (raw !== null) {
        candidates.push({
          value: raw,
          confidence: lineScore - 10,
          source: 'raw-total-line',
        });
      }
    }
  }

  return candidates;
}

function applyConsensus(candidates: TotalCandidate[]): TotalCandidate[] {
  const grouped = new Map<number, TotalCandidate>();

  for (const candidate of candidates) {
    let merged = false;

    for (const [existingValue, existing] of grouped.entries()) {
      if (!amountsAreClose(existingValue, candidate.value)) continue;

      grouped.set(existingValue, {
        value: existingValue,
        confidence: existing.confidence + candidate.confidence + 20,
        source: `${existing.source}+${candidate.source}`,
      });
      merged = true;
      break;
    }

    if (!merged) {
      grouped.set(candidate.value, { ...candidate });
    }
  }

  return [...grouped.values()];
}

function pickBestTotal(candidates: TotalCandidate[], lineItemSum: number): number {
  if (candidates.length === 0) {
    return lineItemSum > 0 ? lineItemSum : 0;
  }

  const scored = applyConsensus(candidates).map((candidate) => {
    let confidence = candidate.confidence;

    if (lineItemSum > 0) {
      if (amountsAreClose(candidate.value, lineItemSum)) {
        confidence += 40;
      } else {
        const ratio = candidate.value / lineItemSum;
        if (ratio > 3 || ratio < 0.33) confidence -= 50;
      }
    }

    if (candidate.source.includes('raw-total-line') && lineItemSum > 0) {
      const ratio = candidate.value / lineItemSum;
      if (ratio > 2 || ratio < 0.5) confidence -= 30;
    }

    return { ...candidate, confidence };
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  return scored[0]?.value ?? 0;
}

export function extractInvoiceTotal(text: string): number {
  const lineItemSum = sumLineItemAmounts(text);
  const candidates: TotalCandidate[] = collectTotalLineCandidates(text);

  if (lineItemSum > 0) {
    candidates.push({
      value: lineItemSum,
      confidence: 75,
      source: 'line-item-sum',
    });
  }

  const best = pickBestTotal(candidates, lineItemSum);
  if (best > 0) return best;

  const lowerText = text.toLowerCase();

  for (const line of text.split('\n')) {
    const lower = line.toLowerCase();
    if (!/^\s*(tổng|tong)\b/.test(lower)) continue;
    if (/thành tiền|thanh tien/.test(lower)) continue;

    const amount = pickRawAmountFromLine(lower);
    if (amount !== null) return amount;
  }

  const currencyMatches = [
    ...lowerText.matchAll(/(\d[\d.,]+)\s*(?:đ|vnd|d)(?!\w)/gi),
  ];

  const currencyAmounts = currencyMatches
    .map((match) => normalizeOcrAmount(parseAmount(match[1])))
    .filter(isValidAmount);

  if (currencyAmounts.length > 0) {
    return Math.max(...currencyAmounts);
  }

  return 0;
}
