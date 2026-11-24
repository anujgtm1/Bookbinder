import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CUSTOM_ROLL_WIDTH_BOUNDS,
  CUSTOM_ROLL_WIDTH_STORAGE_KEY,
  DEFAULT_PRINTER_MARGINS,
  PRINTER_MARGINS_STORAGE_KEY,
  PRINTER_MARGIN_BOUNDS,
  PRINTER_MARGIN_PRESETS,
  clampCustomRollWidthMm,
  clampPrinterMargins,
  computePrintableSafeBox,
  detectPrinterMarginPresetId,
  getPrinterMarginPreset,
  loadSavedCustomRollWidthMm,
  loadSavedPrinterMargins,
  saveCustomRollWidthMm,
  savePrinterMargins,
} from './printerMargins';

describe('printerMargins', () => {
  afterEach(() => {
    try {
      globalThis.localStorage.removeItem(PRINTER_MARGINS_STORAGE_KEY);
      globalThis.localStorage.removeItem(CUSTOM_ROLL_WIDTH_STORAGE_KEY);
    } catch {
      // Ignore if localStorage is mocked/unavailable
    }
    vi.restoreAllMocks();
  });

  it('exposes the canonical presets, default margins, and bounds', () => {
    expect(PRINTER_MARGIN_BOUNDS).toEqual({ minMm: 0, maxMm: 50 });
    expect(DEFAULT_PRINTER_MARGINS).toEqual({
      topMm: 5,
      bottomMm: 5,
      leftMm: 5,
      rightMm: 5,
      presetId: 'standard-5mm',
    });

    const ids = PRINTER_MARGIN_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      'standard-5mm',
      'borderless',
      'fine-art-sheet',
      'roll-cut-sheet',
      'custom',
    ]);

    expect(getPrinterMarginPreset('borderless').margins).toEqual({
      topMm: 0,
      bottomMm: 0,
      leftMm: 0,
      rightMm: 0,
    });
    expect(getPrinterMarginPreset('fine-art-sheet').margins).toEqual({
      topMm: 5,
      bottomMm: 20,
      leftMm: 5,
      rightMm: 5,
    });
    expect(getPrinterMarginPreset('roll-cut-sheet').margins).toEqual({
      topMm: 5,
      bottomMm: 30,
      leftMm: 5,
      rightMm: 5,
    });
    expect(getPrinterMarginPreset('custom').margins).toBeNull();
  });

  it('clamps out-of-range and non-finite margin values and reconciles presetId', () => {
    expect(clampPrinterMargins({})).toEqual(DEFAULT_PRINTER_MARGINS);

    expect(
      clampPrinterMargins({
        topMm: -10,
        bottomMm: 99,
        leftMm: Number.NaN,
        rightMm: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      topMm: 0,
      bottomMm: 50,
      leftMm: 5,
      rightMm: 5,
      presetId: 'custom',
    });

    // Detects fixed presets automatically when values match
    expect(
      clampPrinterMargins({ topMm: 5, bottomMm: 20, leftMm: 5, rightMm: 5 }),
    ).toEqual({
      topMm: 5,
      bottomMm: 20,
      leftMm: 5,
      rightMm: 5,
      presetId: 'fine-art-sheet',
    });

    expect(
      clampPrinterMargins({ topMm: 5, bottomMm: 30, leftMm: 5, rightMm: 5, presetId: 'standard-5mm' }),
    ).toEqual({
      topMm: 5,
      bottomMm: 30,
      leftMm: 5,
      rightMm: 5,
      presetId: 'roll-cut-sheet',
    });

    // Preserves explicit 'custom' mode even when edge numbers match a fixed preset
    expect(
      clampPrinterMargins({ topMm: 5, bottomMm: 5, leftMm: 5, rightMm: 5, presetId: 'custom' }),
    ).toEqual({
      topMm: 5,
      bottomMm: 5,
      leftMm: 5,
      rightMm: 5,
      presetId: 'custom',
    });

    expect(detectPrinterMarginPresetId({ topMm: 0, bottomMm: 0, leftMm: 0, rightMm: 0 })).toBe(
      'borderless',
    );
    expect(detectPrinterMarginPresetId({ topMm: 7, bottomMm: 14, leftMm: 5, rightMm: 5 })).toBe(
      'custom',
    );
  });

  it('computes symmetric and asymmetric printable safe boxes accurately', () => {
    // US Letter Portrait (215.9 x 279.4 mm) with Roll Printer Cut-Sheet asymmetric trailing margin
    const safeBox = computePrintableSafeBox(215.9, 279.4, {
      topMm: 5,
      bottomMm: 30,
      leftMm: 6,
      rightMm: 4,
    });
    expect(safeBox).toEqual({
      xMm: 6,
      yMm: 5,
      widthMm: 205.9,
      heightMm: 244.4,
    });

    // Borderless full bleed
    const borderlessBox = computePrintableSafeBox(297, 210, {
      topMm: 0,
      bottomMm: 0,
      leftMm: 0,
      rightMm: 0,
      presetId: 'borderless',
    });
    expect(borderlessBox).toEqual({
      xMm: 0,
      yMm: 0,
      widthMm: 297,
      heightMm: 210,
    });

    // Degenerate page smaller than margins clamps width/height cleanly to 0
    const tinyBox = computePrintableSafeBox(40, 30, {
      topMm: 25,
      bottomMm: 25,
      leftMm: 30,
      rightMm: 30,
    });
    expect(tinyBox.widthMm).toBe(0);
    expect(tinyBox.heightMm).toBe(0);
  });

  it('persists and reloads printer margins via localStorage with safe fallback', () => {
    expect(loadSavedPrinterMargins()).toEqual(DEFAULT_PRINTER_MARGINS);

    savePrinterMargins({
      topMm: 5,
      bottomMm: 30,
      leftMm: 5,
      rightMm: 5,
      presetId: 'roll-cut-sheet',
    });
    expect(loadSavedPrinterMargins()).toEqual({
      topMm: 5,
      bottomMm: 30,
      leftMm: 5,
      rightMm: 5,
      presetId: 'roll-cut-sheet',
    });

    // Corrupt JSON falls back safely to defaults
    globalThis.localStorage.setItem(PRINTER_MARGINS_STORAGE_KEY, '{not-valid-json');
    expect(loadSavedPrinterMargins()).toEqual(DEFAULT_PRINTER_MARGINS);

    // Out-of-range stored margins get clamped on load
    globalThis.localStorage.setItem(
      PRINTER_MARGINS_STORAGE_KEY,
      JSON.stringify({ topMm: -3, bottomMm: 120, leftMm: 8, rightMm: 12 }),
    );
    expect(loadSavedPrinterMargins()).toEqual({
      topMm: 0,
      bottomMm: 50,
      leftMm: 8,
      rightMm: 12,
      presetId: 'custom',
    });

    // Storage access errors are swallowed safely
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(loadSavedPrinterMargins()).toEqual(DEFAULT_PRINTER_MARGINS);
    expect(() => savePrinterMargins(DEFAULT_PRINTER_MARGINS)).not.toThrow();
  });

  it('clamps and persists custom wide-format roll widths', () => {
    expect(CUSTOM_ROLL_WIDTH_BOUNDS).toEqual({
      minMm: 200,
      maxMm: 1600,
      defaultMm: 914.4,
    });

    expect(clampCustomRollWidthMm(undefined)).toBe(914.4);
    expect(clampCustomRollWidthMm(Number.NaN)).toBe(914.4);
    expect(clampCustomRollWidthMm(120)).toBe(200);
    expect(clampCustomRollWidthMm(2500)).toBe(1600);
    expect(clampCustomRollWidthMm(609.6)).toBe(609.6);

    expect(loadSavedCustomRollWidthMm()).toBe(914.4);
    saveCustomRollWidthMm(1117.6);
    expect(loadSavedCustomRollWidthMm()).toBe(1117.6);
  });
});
