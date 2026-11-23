import { roundTo } from '@/types/units';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_6_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_RGB01: RgbColor = { r: 0.12, g: 0.23, b: 0.32 };

/** Validates a 6-digit `#rrggbb` hex string and returns it lowercased, or `fallback`. */
export function parseHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_6_RE.test(value) ? value.toLowerCase() : fallback;
}

/** Parses a 3-digit or 6-digit hex color string into 0..255 RGB channels, or `null` if invalid. */
export function parseHexRgb(hex: string): RgbColor | null {
  const normalized = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized[0] + normalized[0], 16),
      g: Number.parseInt(normalized[1] + normalized[1], 16),
      b: Number.parseInt(normalized[2] + normalized[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }
  return null;
}

/** Converts a hex color string into normalized 0..1 RGB channels (used by pdf-lib `rgb()`). */
export function hexToRgb01(hex: string, fallback: RgbColor = DEFAULT_RGB01): RgbColor {
  const parsed = parseHexRgb(hex);
  if (!parsed) {
    return { ...fallback };
  }
  return {
    r: parsed.r / 255,
    g: parsed.g / 255,
    b: parsed.b / 255,
  };
}

/** Converts 0..255 RGB channels into a 6-digit lowercase `#rrggbb` hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((channel) =>
        Math.max(0, Math.min(255, Math.round(channel)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Computes WCAG 2.1 relative luminance (0.0 to 1.0) from 0..255 RGB channels. */
export function relativeLuminance(rgb: RgbColor): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Computes WCAG 2.1 contrast ratio (1.0 to 21.0) between two hex colors, or `null` if invalid. */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  if (!a || !b) return null;
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return roundTo((lighter + 0.05) / (darker + 0.05), 2);
}
