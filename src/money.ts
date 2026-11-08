const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND"]);

export function moneyFromCents(cents: number | null | undefined, currency = "AUD"): MoneyLike {
  return { cents: Number(cents ?? 0), currency: currency || "AUD" };
}

export type MoneyLike = { cents: number; currency: string };

export function centsToMajor(cents: number, currency = "AUD"): number {
  const factor = ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
  return Number((cents / factor).toFixed(factor === 1 ? 0 : 2));
}

export function formatMoney(cents: number, currency = "AUD"): string {
  const major = centsToMajor(cents, currency);
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
}
