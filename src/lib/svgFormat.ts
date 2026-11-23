import { roundTo } from '@/types/units';

export { escapeXml } from './utils';

/** Formats a millimeter number cleanly for SVG attributes and path coordinates. */
export function fmtMm(n: number, decimals = 3): string {
  return String(roundTo(n, decimals));
}
