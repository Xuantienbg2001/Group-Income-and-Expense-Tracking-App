"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractInvoiceTotal = extractInvoiceTotal;
const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 50000000;
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
const FORMATTED_VND = /\d{1,3}(?:\.\d{3}){1,2}\s*(?:đ|vnd|d)(?!\w)/gi;
const FORMATTED_VND_LOOSE = /\d{1,3}(?:\.\d{3}){1,2}(?!\w)/gi;
const UNFORMATTED_VND = /\b(\d{4,9})\s*(?:đ|vnd|d)(?!\w)/gi;
function parseAmount(raw) {
    const cleaned = raw.replace(/[.,\s]/g, '').replace(/(?:đ|vnd|d)$/i, '');
    return parseInt(cleaned, 10);
}
function isLikelyDateFragment(line, raw) {
    return /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line) && line.includes(raw);
}
function isTotalLine(line) {
    const lower = line.toLowerCase();
    return TOTAL_KEYWORDS.some((keyword) => lower.includes(keyword));
}
function isMetadataLine(line) {
    const lower = line.toLowerCase();
    if (/thuế|thue|tax/.test(lower))
        return true;
    if (/số tài khoản|so tai khoan|stk|ngân hàng|ngan hang|account number/.test(lower)) {
        return true;
    }
    if (/điện thoại|dien thoai|phone|tel|fax|hotline/.test(lower))
        return true;
    if (/địa chỉ|dia chi|address/.test(lower))
        return true;
    if (/ngày lập|ngay lap|ngày\s+\d|ngay\s+\d/.test(lower))
        return true;
    if (/xuất hóa|xuat hoa|invoice no|mã hóa|ma hoa/.test(lower))
        return true;
    if (/\+[\d\s.-]{8,}\d/.test(line))
        return true;
    return false;
}
function normalizeOcrAmount(value) {
    if (value <= MAX_AMOUNT)
        return value;
    if (value % 10 !== 0) {
        const trimmed = Math.floor(value / 10);
        if (trimmed >= MIN_AMOUNT && trimmed <= MAX_AMOUNT)
            return trimmed;
    }
    let normalized = value;
    while (normalized > MAX_AMOUNT && normalized % 10 === 0) {
        normalized /= 10;
    }
    return normalized;
}
function isValidAmount(value) {
    return Number.isFinite(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT;
}
function scoreTotalLine(line) {
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
function extractFormattedAmounts(line, requireCurrency = true) {
    const pattern = requireCurrency ? FORMATTED_VND : FORMATTED_VND_LOOSE;
    const amounts = [];
    for (const match of line.matchAll(pattern)) {
        const value = parseAmount(match[0]);
        if (isValidAmount(value))
            amounts.push(value);
    }
    return amounts;
}
function pickRawAmountFromLine(line) {
    const matches = line.match(/\d[\d.,]*(?:\s*(?:đ|vnd|d))?/gi) || [];
    for (let i = matches.length - 1; i >= 0; i--) {
        if (isLikelyDateFragment(line, matches[i]))
            continue;
        const value = normalizeOcrAmount(parseAmount(matches[i]));
        if (isValidAmount(value))
            return value;
    }
    return null;
}
function extractLineItemAmount(line) {
    const withCurrency = extractFormattedAmounts(line, true);
    if (withCurrency.length === 1)
        return withCurrency[0];
    if (withCurrency.length > 1)
        return withCurrency[withCurrency.length - 1];
    const looseFormatted = extractFormattedAmounts(line, false);
    if (looseFormatted.length === 1)
        return looseFormatted[0];
    for (const match of line.matchAll(UNFORMATTED_VND)) {
        const value = normalizeOcrAmount(parseAmount(match[1]));
        if (isValidAmount(value))
            return value;
    }
    return null;
}
function sumLineItemAmounts(text) {
    const lines = text.split('\n');
    let sum = 0;
    for (const line of lines) {
        if (isTotalLine(line) || isMetadataLine(line))
            continue;
        const amount = extractLineItemAmount(line);
        if (amount !== null)
            sum += amount;
    }
    return sum;
}
function amountsAreClose(a, b) {
    if (a === b)
        return true;
    const diff = Math.abs(a - b);
    const tolerance = Math.max(1000, Math.round(Math.max(a, b) * 0.02));
    return diff <= tolerance;
}
function collectTotalLineCandidates(text) {
    const candidates = [];
    for (const line of text.split('\n')) {
        if (!isTotalLine(line))
            continue;
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
function applyConsensus(candidates) {
    const grouped = new Map();
    for (const candidate of candidates) {
        let merged = false;
        for (const [existingValue, existing] of grouped.entries()) {
            if (!amountsAreClose(existingValue, candidate.value))
                continue;
            grouped.set(existingValue, {
                value: existingValue,
                confidence: existing.confidence + candidate.confidence + 20,
                source: `${existing.source}+${candidate.source}`,
            });
            merged = true;
            break;
        }
        if (!merged) {
            grouped.set(candidate.value, Object.assign({}, candidate));
        }
    }
    return [...grouped.values()];
}
function pickBestTotal(candidates, lineItemSum) {
    var _a, _b;
    if (candidates.length === 0) {
        return lineItemSum > 0 ? lineItemSum : 0;
    }
    const scored = applyConsensus(candidates).map((candidate) => {
        let confidence = candidate.confidence;
        if (lineItemSum > 0) {
            if (amountsAreClose(candidate.value, lineItemSum)) {
                confidence += 40;
            }
            else {
                const ratio = candidate.value / lineItemSum;
                if (ratio > 3 || ratio < 0.33)
                    confidence -= 50;
            }
        }
        if (candidate.source.includes('raw-total-line') && lineItemSum > 0) {
            const ratio = candidate.value / lineItemSum;
            if (ratio > 2 || ratio < 0.5)
                confidence -= 30;
        }
        return Object.assign(Object.assign({}, candidate), { confidence });
    });
    scored.sort((a, b) => b.confidence - a.confidence);
    return (_b = (_a = scored[0]) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0;
}
function extractInvoiceTotal(text) {
    const lineItemSum = sumLineItemAmounts(text);
    const candidates = collectTotalLineCandidates(text);
    if (lineItemSum > 0) {
        candidates.push({
            value: lineItemSum,
            confidence: 75,
            source: 'line-item-sum',
        });
    }
    const best = pickBestTotal(candidates, lineItemSum);
    if (best > 0)
        return best;
    const lowerText = text.toLowerCase();
    for (const line of text.split('\n')) {
        const lower = line.toLowerCase();
        if (!/^\s*(tổng|tong)\b/.test(lower))
            continue;
        if (/thành tiền|thanh tien/.test(lower))
            continue;
        const amount = pickRawAmountFromLine(lower);
        if (amount !== null)
            return amount;
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
