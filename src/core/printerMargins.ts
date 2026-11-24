import { clampFinite, roundTo } from '@/types/units';

export type PrinterMarginPresetId =
  | 'standard-5mm'
  | 'borderless'
  | 'fine-art-sheet'
  | 'roll-cut-sheet'
  | 'custom';

export interface PrinterMargins {
  readonly topMm: number;
  readonly bottomMm: number;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly presetId?: PrinterMarginPresetId;
}

export interface PrinterMarginPreset {
  readonly id: PrinterMarginPresetId;
  readonly label: string;
  readonly margins: Readonly<{
    topMm: number;
    bottomMm: number;
    leftMm: number;
    rightMm: number;
  }> | null;
}

export interface PrintableSafeBox {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export const PRINTER_MARGIN_BOUNDS = {
  minMm: 0,
  maxMm: 50,
} as const;

export const DEFAULT_PRINTER_MARGINS: Readonly<PrinterMargins> = {
  topMm: 5,
  bottomMm: 5,
  leftMm: 5,
  rightMm: 5,
  presetId: 'standard-5mm',
};

export const PRINTER_MARGIN_PRESETS: readonly PrinterMarginPreset[] = [
  {
    id: 'standard-5mm',
    label: 'Standard Safe (5 mm all sides)',
    margins: { topMm: 5, bottomMm: 5, leftMm: 5, rightMm: 5 },
  },
  {
    id: 'borderless',
    label: 'Borderless (0 mm)',
    margins: { topMm: 0, bottomMm: 0, leftMm: 0, rightMm: 0 },
  },
  {
    id: 'fine-art-sheet',
    label: 'Fine-Art / Heavy Sheet (Top 5 · Bottom 20 · Sides 5 mm)',
    margins: { topMm: 5, bottomMm: 20, leftMm: 5, rightMm: 5 },
  },
  {
    id: 'roll-cut-sheet',
    label: 'Roll Printer Cut-Sheet (Top 5 · Bottom 30 · Sides 5 mm)',
    margins: { topMm: 5, bottomMm: 30, leftMm: 5, rightMm: 5 },
  },
  {
    id: 'custom',
    label: 'Custom (Per Edge)',
    margins: null,
  },
] as const;

export const PRINTER_MARGINS_STORAGE_KEY = 'bookbinder-printer-margins-v1';

export const CUSTOM_ROLL_WIDTH_BOUNDS = {
  minMm: 200,
  maxMm: 1600,
  defaultMm: 914.4,
} as const;

export const CUSTOM_ROLL_WIDTH_STORAGE_KEY = 'bookbinder-custom-roll-width-v1';

const MARGIN_MATCH_EPS_MM = 0.01;

function isPrinterMarginPresetId(value: unknown): value is PrinterMarginPresetId {
  return (
    value === 'standard-5mm' ||
    value === 'borderless' ||
    value === 'fine-art-sheet' ||
    value === 'roll-cut-sheet' ||
    value === 'custom'
  );
}

function marginsEqual(
  a: Pick<PrinterMargins, 'topMm' | 'bottomMm' | 'leftMm' | 'rightMm'>,
  b: Pick<PrinterMargins, 'topMm' | 'bottomMm' | 'leftMm' | 'rightMm'>,
): boolean {
  return (
    Math.abs(a.topMm - b.topMm) <= MARGIN_MATCH_EPS_MM &&
    Math.abs(a.bottomMm - b.bottomMm) <= MARGIN_MATCH_EPS_MM &&
    Math.abs(a.leftMm - b.leftMm) <= MARGIN_MATCH_EPS_MM &&
    Math.abs(a.rightMm - b.rightMm) <= MARGIN_MATCH_EPS_MM
  );
}

/** Look up a printer margin preset definition by ID. */
export function getPrinterMarginPreset(id: PrinterMarginPresetId): PrinterMarginPreset {
  return PRINTER_MARGIN_PRESETS.find((preset) => preset.id === id) ?? PRINTER_MARGIN_PRESETS[0];
}

/** Detect which fixed preset matches the given edge margins, or `'custom'` if none match. */
export function detectPrinterMarginPresetId(
  margins: Pick<PrinterMargins, 'topMm' | 'bottomMm' | 'leftMm' | 'rightMm'>,
): PrinterMarginPresetId {
  for (const preset of PRINTER_MARGIN_PRESETS) {
    if (preset.margins && marginsEqual(margins, preset.margins)) {
      return preset.id;
    }
  }
  return 'custom';
}

/**
 * Clamp and normalize a partial printer margins object into valid bounds (`0..50 mm`).
 * Preserves an explicit `'custom'` presetId; otherwise reconciles `presetId` with the clamped edges.
 */
export function clampPrinterMargins(raw: Partial<PrinterMargins>): PrinterMargins {
  const topMm = roundTo(
    clampFinite(
      raw.topMm,
      DEFAULT_PRINTER_MARGINS.topMm,
      PRINTER_MARGIN_BOUNDS.minMm,
      PRINTER_MARGIN_BOUNDS.maxMm,
    ),
    2,
  );
  const bottomMm = roundTo(
    clampFinite(
      raw.bottomMm,
      DEFAULT_PRINTER_MARGINS.bottomMm,
      PRINTER_MARGIN_BOUNDS.minMm,
      PRINTER_MARGIN_BOUNDS.maxMm,
    ),
    2,
  );
  const leftMm = roundTo(
    clampFinite(
      raw.leftMm,
      DEFAULT_PRINTER_MARGINS.leftMm,
      PRINTER_MARGIN_BOUNDS.minMm,
      PRINTER_MARGIN_BOUNDS.maxMm,
    ),
    2,
  );
  const rightMm = roundTo(
    clampFinite(
      raw.rightMm,
      DEFAULT_PRINTER_MARGINS.rightMm,
      PRINTER_MARGIN_BOUNDS.minMm,
      PRINTER_MARGIN_BOUNDS.maxMm,
    ),
    2,
  );

  const clamped = { topMm, bottomMm, leftMm, rightMm };
  let presetId: PrinterMarginPresetId;
  if (raw.presetId === 'custom') {
    presetId = 'custom';
  } else if (isPrinterMarginPresetId(raw.presetId)) {
    const preset = getPrinterMarginPreset(raw.presetId);
    presetId =
      preset.margins && marginsEqual(clamped, preset.margins)
        ? raw.presetId
        : detectPrinterMarginPresetId(clamped);
  } else {
    presetId = detectPrinterMarginPresetId(clamped);
  }

  return {
    topMm,
    bottomMm,
    leftMm,
    rightMm,
    presetId,
  };
}

/**
 * Computes the printable safe box inside a physical sheet in top-left coordinates
 * (`xMm = leftMm`, `yMm = topMm`, `widthMm = pageWidth - left - right`, `heightMm = pageHeight - top - bottom`).
 * For PDF bottom-left coordinates, the safe box bottom edge sits at `pageHeightMm - yMm - heightMm` (`bottomMm`).
 */
export function computePrintableSafeBox(
  pageWidthMm: number,
  pageHeightMm: number,
  margins: PrinterMargins,
): PrintableSafeBox {
  const safePageW = Math.max(0, Number.isFinite(pageWidthMm) ? pageWidthMm : 0);
  const safePageH = Math.max(0, Number.isFinite(pageHeightMm) ? pageHeightMm : 0);
  const clamped = clampPrinterMargins(margins);

  const xMm = roundTo(Math.min(safePageW, clamped.leftMm), 3);
  const yMm = roundTo(Math.min(safePageH, clamped.topMm), 3);
  const widthMm = roundTo(Math.max(0, safePageW - clamped.leftMm - clamped.rightMm), 3);
  const heightMm = roundTo(Math.max(0, safePageH - clamped.topMm - clamped.bottomMm), 3);

  return { xMm, yMm, widthMm, heightMm };
}

/** Safely load saved printer margins from `localStorage`, falling back to defaults. */
export function loadSavedPrinterMargins(): PrinterMargins {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return { ...DEFAULT_PRINTER_MARGINS };
    }
    const raw = globalThis.localStorage.getItem(PRINTER_MARGINS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PRINTER_MARGINS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PRINTER_MARGINS };
    }
    return clampPrinterMargins(parsed as Partial<PrinterMargins>);
  } catch {
    return { ...DEFAULT_PRINTER_MARGINS };
  }
}

/** Safely persist clamped printer margins to `localStorage`. */
export function savePrinterMargins(margins: PrinterMargins): void {
  const normalized = clampPrinterMargins(margins);
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }
    globalThis.localStorage.setItem(PRINTER_MARGINS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota / SSR / private-browsing errors
  }
}

/** Clamp a custom wide-format roll width (in mm) to supported bounds (`200..1600 mm`, default `914.4 mm` = 36"). */
export function clampCustomRollWidthMm(value: number | undefined): number {
  return roundTo(
    clampFinite(
      value,
      CUSTOM_ROLL_WIDTH_BOUNDS.defaultMm,
      CUSTOM_ROLL_WIDTH_BOUNDS.minMm,
      CUSTOM_ROLL_WIDTH_BOUNDS.maxMm,
    ),
    2,
  );
}

/** Safely load saved custom roll width (in mm) from `localStorage`. */
export function loadSavedCustomRollWidthMm(): number {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return CUSTOM_ROLL_WIDTH_BOUNDS.defaultMm;
    }
    const raw = globalThis.localStorage.getItem(CUSTOM_ROLL_WIDTH_STORAGE_KEY);
    if (!raw) {
      return CUSTOM_ROLL_WIDTH_BOUNDS.defaultMm;
    }
    const parsed = Number(raw);
    return clampCustomRollWidthMm(parsed);
  } catch {
    return CUSTOM_ROLL_WIDTH_BOUNDS.defaultMm;
  }
}

/** Safely persist a clamped custom roll width (in mm) to `localStorage`. */
export function saveCustomRollWidthMm(widthMm: number): void {
  const normalized = clampCustomRollWidthMm(widthMm);
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }
    globalThis.localStorage.setItem(CUSTOM_ROLL_WIDTH_STORAGE_KEY, String(normalized));
  } catch {
    // Ignore storage quota / SSR / private-browsing errors
  }
}
