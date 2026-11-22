import { describe, expect, it } from 'vitest';
import { MM_PER_INCH, PRINT_DPI, PT_PER_MM, UnitConverter, roundTo } from './units';

describe('UnitConverter', () => {
  it('converts between mm and inches accurately', () => {
    expect(UnitConverter.mmToInches(25.4)).toBeCloseTo(1, 6);
    expect(UnitConverter.inchesToMm(8.5)).toBeCloseTo(215.9, 6);
    expect(UnitConverter.toDisplay(MM_PER_INCH * 5.5, 'in')).toBeCloseTo(5.5, 6);
    expect(UnitConverter.toDisplay(216, 'mm')).toBe(216);
    expect(UnitConverter.fromDisplay(5.5, 'in')).toBeCloseTo(139.7, 6);
    expect(UnitConverter.fromDisplay(216, 'mm')).toBe(216);
  });

  it('converts between mm and PDF points accurately', () => {
    expect(PT_PER_MM).toBeCloseTo(2.83464567, 5);
    expect(UnitConverter.mmToPoints(25.4)).toBeCloseTo(72, 6);
    expect(UnitConverter.pointsToMm(72)).toBeCloseTo(25.4, 6);
  });

  it('converts between mm and 300 DPI pixels accurately', () => {
    expect(PRINT_DPI).toBe(300);
    expect(UnitConverter.mmToPixels(25.4)).toBe(300);
    expect(UnitConverter.mmToPixels(25.4, 150)).toBe(150);
    expect(UnitConverter.pixelsToMm(300)).toBeCloseTo(25.4, 6);
  });

  it('formats values and dimensions for mm and in', () => {
    expect(UnitConverter.format(216, 'mm')).toBe('216.0 mm');
    expect(UnitConverter.format(215.9, 'in')).toBe('8.50 in');
    expect(UnitConverter.formatDimensions(143, 223, 'mm')).toBe('143.0 × 223.0 mm');
    expect(UnitConverter.formatDimensions(139.7, 215.9, 'in')).toBe('5.50 × 8.50 in');
    expect(UnitConverter.stepForUnit('mm')).toBe(0.5);
    expect(UnitConverter.stepForUnit('in')).toBe(0.05);
  });

  it('validates and parses unit systems safely', () => {
    expect(UnitConverter.isUnitSystem('mm')).toBe(true);
    expect(UnitConverter.isUnitSystem('in')).toBe(true);
    expect(UnitConverter.isUnitSystem('cm')).toBe(false);
    expect(UnitConverter.parseUnitSystem('in')).toBe('in');
    expect(UnitConverter.parseUnitSystem('invalid')).toBe('mm');
    expect(UnitConverter.parseUnitSystem(null, 'in')).toBe('in');
    expect(roundTo(1.005, 2)).toBe(1.01);
  });
});
