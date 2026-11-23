import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToRgb01,
  parseHexColor,
  parseHexRgb,
  relativeLuminance,
  rgbToHex,
} from './color';

describe('color utilities', () => {
  it('validates and lowercases 6-digit hex colors with fallback', () => {
    expect(parseHexColor('#D9B566', '#000000')).toBe('#d9b566');
    expect(parseHexColor('#1f3a52', '#000000')).toBe('#1f3a52');
    expect(parseHexColor('#fff', '#1f3a52')).toBe('#1f3a52');
    expect(parseHexColor('not-a-color', '#f5efe2')).toBe('#f5efe2');
    expect(parseHexColor(null, '#f5efe2')).toBe('#f5efe2');
  });

  it('parses 3-digit and 6-digit hex strings into 0..255 RGB', () => {
    expect(parseHexRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHexRgb('  #0f8  ')).toEqual({ r: 0, g: 255, b: 136 });
    expect(parseHexRgb('1f3a52')).toEqual({ r: 31, g: 58, b: 82 });
    expect(parseHexRgb('invalid')).toBeNull();
    expect(parseHexRgb('#12345')).toBeNull();
  });

  it('converts hex to normalized 0..1 RGB with fallback', () => {
    const orange = hexToRgb01('#ff8000');
    expect(orange.r).toBeCloseTo(1, 4);
    expect(orange.g).toBeCloseTo(128 / 255, 4);
    expect(orange.b).toBeCloseTo(0, 4);

    const fallback = hexToRgb01('invalid');
    expect(fallback).toEqual({ r: 0.12, g: 0.23, b: 0.32 });

    expect(hexToRgb01('invalid', { r: 1, g: 1, b: 1 })).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('converts RGB channels to lowercase hex with clamping and rounding', () => {
    expect(rgbToHex(31, 58, 82)).toBe('#1f3a52');
    expect(rgbToHex(-10, 127.6, 300)).toBe('#0080ff');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });

  it('computes WCAG 2.1 relative luminance and contrast ratio', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);

    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#1f3a52', '#1f3a52')).toBe(1);
    expect(contrastRatio('#1f3a52', '#f5efe2')).toBeGreaterThan(9);
    expect(contrastRatio('#1f3a52', 'not-hex')).toBeNull();
  });
});
