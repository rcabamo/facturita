const moneyNumber = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainNumber = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2,
});

export function formatMoney(value: number, symbol: string): string {
  return `${symbol}${moneyNumber.format(value)}`;
}

export function formatNumber(value: number): string {
  return plainNumber.format(value);
}
