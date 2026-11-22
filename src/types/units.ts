export type UnitSystem = 'mm' | 'in';

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const PT_PER_MM = PT_PER_INCH / MM_PER_INCH; // ~2.8346456693 pt/mm
export const PRINT_DPI = 300;

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export const UnitConverter = {
  isUnitSystem(value: unknown): value is UnitSystem {
    return value === 'mm' || value === 'in';
  },

  parseUnitSystem(value: unknown, fallback: UnitSystem = 'mm'): UnitSystem {
    return this.isUnitSystem(value) ? value : fallback;
  },

  mmToInches(mm: number): number {
    return mm / MM_PER_INCH;
  },

  inchesToMm(inches: number): number {
    return inches * MM_PER_INCH;
  },

  toDisplay(mm: number, unit: UnitSystem): number {
    return unit === 'in' ? this.mmToInches(mm) : mm;
  },

  fromDisplay(displayValue: number, unit: UnitSystem): number {
    return unit === 'in' ? this.inchesToMm(displayValue) : displayValue;
  },

  mmToPoints(mm: number): number {
    return mm * PT_PER_MM;
  },

  pointsToMm(points: number): number {
    return points / PT_PER_MM;
  },

  mmToPixels(mm: number, dpi = PRINT_DPI): number {
    return Math.round((mm / MM_PER_INCH) * dpi);
  },

  pixelsToMm(pixels: number, dpi = PRINT_DPI): number {
    return (pixels / dpi) * MM_PER_INCH;
  },

  decimalsForUnit(unit: UnitSystem): number {
    return unit === 'in' ? 2 : 1;
  },

  stepForUnit(unit: UnitSystem): number {
    return unit === 'in' ? 0.05 : 0.5;
  },

  formatValue(mm: number, unit: UnitSystem, decimals?: number): string {
    const places = decimals ?? this.decimalsForUnit(unit);
    return roundTo(this.toDisplay(mm, unit), places).toFixed(places);
  },

  format(mm: number, unit: UnitSystem, decimals?: number): string {
    return `${this.formatValue(mm, unit, decimals)} ${unit}`;
  },

  formatDimensions(widthMm: number, heightMm: number, unit: UnitSystem, decimals?: number): string {
    const w = this.formatValue(widthMm, unit, decimals);
    const h = this.formatValue(heightMm, unit, decimals);
    return `${w} × ${h} ${unit}`;
  },
} as const;
