/** Same key order as the phone ExpenseCategoryMemory.keysFor. */
const TLDS = new Set(['com', 'net', 'org', 'in', 'co', 'io', 'app', 'shop', 'store', 'info', 'biz']);
const PSP = new Set([
  'ybl', 'ibl', 'axl', 'apl', 'upi', 'paytm', 'okaxis', 'okicici', 'okhdfcbank',
  'okhdfc', 'okbizaxis', 'oksbi', 'yesbank', 'kotak', 'sbi', 'pnb', 'axisbank',
  'hdfcbank', 'icici',
]);
const GENERIC = new Set([
  'email', 'mail', 'info', 'pay', 'upi', 'user', 'care', 'support', 'online',
  'shop', 'store', 'official', 'noreply', 'admin', 'billing', 'payments',
  'accounts', 'finance', 'order', 'orders', 'hello', 'contact',
]);
const MONTHS = new Set(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);
const STOP = new Set([
  'the', 'and', 'for', 'from', 'with', 'this', 'that', 'your', 'you', 'www',
  'http', 'https', 'ltd', 'pvt', 'private', 'limited', 'india', 'inc', 'payment',
  'paid', 'via', 'upi', 'txn', 'bank', 'ref', 'sms', 'block', 'auto', 'detected', 'not',
]);

export function learningKeys(description: string): string[] {
  const raw = description.trim();
  if (!raw || raw.toLowerCase().startsWith('auto detected')) return [];
  const out: string[] = [];
  const add = (s: string) => {
    const k = s.trim().toLowerCase();
    if (k.length < 3) return;
    if (STOP.has(k) || TLDS.has(k) || GENERIC.has(k) || MONTHS.has(k)) return;
    if (/^\d+$/.test(k)) return;
    if (!out.includes(k)) out.push(k);
  };
  add(raw);
  const compact = raw.toLowerCase().replace(/[^a-z0-9@.]/g, '');
  if (compact.includes('@')) {
    add(compact);
    const [local, hostRaw = ''] = compact.split('@');
    let host = hostRaw.startsWith('www.') ? hostRaw.slice(4) : hostRaw;
    const hostCore = host.split('.')[0] ?? '';
    const psp = PSP.has(host) || PSP.has(hostCore);
    if (!psp && host) {
      add(host);
      for (const p of host.split('.')) add(p);
    }
    if (local.length >= 4 && !GENERIC.has(local) && !/\d/.test(local)) add(local);
  } else {
    if (compact.length >= 4 && compact !== raw.toLowerCase()) add(compact);
    for (const t of raw.toLowerCase().split(/[\s,\-_/().@]+/)) add(t);
  }
  return out;
}

/** First learned key wins. Exact handle beats the brand. */
export function matchLearning(
  description: string,
  learnings: Record<string, string>,
): string | null {
  for (const k of learningKeys(description)) {
    const cat = learnings[k];
    if (cat && cat.trim() && cat.trim() !== 'Others') return cat.trim();
  }
  return null;
}
