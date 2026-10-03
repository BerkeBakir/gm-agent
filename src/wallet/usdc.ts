export const USDC_DECIMALS = 6;
const UNIT = 10n ** BigInt(USDC_DECIMALS);

/** "0.50" → 500000n */
export function parseUsdc(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid USDC amount: "${value}"`);
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(USDC_DECIMALS, "0"));
  return whole * UNIT + fraction;
}

/** 500000n → "0.50 USDC" (at least two decimals, trailing zeros trimmed beyond that) */
export function formatUsdc(amount: bigint): string {
  const sign = amount < 0n ? "-" : "";
  const abs = amount < 0n ? -amount : amount;
  const whole = abs / UNIT;
  let fraction = (abs % UNIT).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  fraction = fraction.padEnd(2, "0");
  return `${sign}${whole}.${fraction} USDC`;
}
