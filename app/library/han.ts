const DIGITS = '〇一二三四五六七八九';

/** 1 → 一，12 → 十二，105 → 一百〇五（用作卷次、段次） */
export function toHan(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 10) return DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? DIGITS[n % 10] : '');
  if (n < 100) return DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? DIGITS[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    const head = DIGITS[Math.floor(n / 100)] + '百';
    if (!rest) return head;
    return head + (rest < 10 ? '〇' + DIGITS[rest] : DIGITS[Math.floor(rest / 10)] + '十' + (rest % 10 ? DIGITS[rest % 10] : ''));
  }
  return String(n);
}
