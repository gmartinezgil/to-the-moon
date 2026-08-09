export function mxn(n: number, decimals = 0): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MXN`;
}

export function sats(n: number): string {
  return n.toLocaleString('en-US');
}

export function btc(n: number, decimals = 6): string {
  return n.toFixed(decimals);
}
