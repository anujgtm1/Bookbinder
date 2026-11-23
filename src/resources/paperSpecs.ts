import type {
  BindingStyleOption,
  PageSizeId,
  PageSizeSpec,
  PaperbackPreset,
  PrintMediaId,
  PrintMediaSpec,
} from '@/types/bookParams';
import type { RollWidthOption } from '@/types/geometry';

export interface DesktopSheetSpec {
  readonly shortMm: number;
  readonly longMm: number;
}

/** Named standard desktop paper sheet dimensions (in mm). */
export const US_LETTER_SHEET: DesktopSheetSpec = { shortMm: 215.9, longMm: 279.4 };
export const A4_SHEET: DesktopSheetSpec = { shortMm: 210.0, longMm: 297.0 };
export const US_LEGAL_SHEET: DesktopSheetSpec = { shortMm: 215.9, longMm: 355.6 };
export const TABLOID_SHEET: DesktopSheetSpec = { shortMm: 279.4, longMm: 431.8 };

/** 5.0 mm unprintable margin per side (10.0 mm total). */
export const ROLL_TOTAL_MARGIN_MM = 10.0;

/** Standard wide-format roll widths (in inches & mm). */
export const STANDARD_ROLL_WIDTHS: readonly RollWidthOption[] = [
  { inches: 13, widthMm: 330, label: '13"' },
  { inches: 17, widthMm: 432, label: '17"' },
  { inches: 24, widthMm: 610, label: '24"' },
  { inches: 36, widthMm: 914, label: '36"' },
  { inches: 44, widthMm: 1118, label: '44"' },
] as const;

/** Target output media specs for Outer Cover Print PDF & paper-fit preflight. */
export const PRINT_MEDIA_OPTIONS: readonly PrintMediaSpec[] = [
  {
    id: 'exact-auto',
    label: 'Exact Wrap Size (Auto)',
    shortLabel: 'Exact Wrap Size (Auto)',
    kind: 'auto',
    shortMm: null,
    longMm: null,
    rollWidthMm: null,
  },
  {
    id: 'letter',
    label: 'US Letter (8.5 × 11")',
    shortLabel: 'US Letter',
    kind: 'sheet',
    shortMm: US_LETTER_SHEET.shortMm,
    longMm: US_LETTER_SHEET.longMm,
    rollWidthMm: null,
  },
  {
    id: 'a4',
    label: 'A4 (210 × 297 mm)',
    shortLabel: 'A4',
    kind: 'sheet',
    shortMm: A4_SHEET.shortMm,
    longMm: A4_SHEET.longMm,
    rollWidthMm: null,
  },
  {
    id: 'legal',
    label: 'US Legal (8.5 × 14")',
    shortLabel: 'US Legal',
    kind: 'sheet',
    shortMm: US_LEGAL_SHEET.shortMm,
    longMm: US_LEGAL_SHEET.longMm,
    rollWidthMm: null,
  },
  {
    id: 'tabloid',
    label: 'Tabloid (11 × 17")',
    shortLabel: 'Tabloid',
    kind: 'sheet',
    shortMm: TABLOID_SHEET.shortMm,
    longMm: TABLOID_SHEET.longMm,
    rollWidthMm: null,
  },
  {
    id: 'roll-13',
    label: '13" Roll (330 mm)',
    shortLabel: '13" Roll',
    kind: 'roll',
    shortMm: null,
    longMm: null,
    rollWidthMm: 330,
  },
  {
    id: 'roll-17',
    label: '17" Roll (432 mm)',
    shortLabel: '17" Roll',
    kind: 'roll',
    shortMm: null,
    longMm: null,
    rollWidthMm: 432,
  },
  {
    id: 'roll-24',
    label: '24" Roll (610 mm)',
    shortLabel: '24" Roll',
    kind: 'roll',
    shortMm: null,
    longMm: null,
    rollWidthMm: 610,
  },
  {
    id: 'roll-36',
    label: '36" Roll (914 mm)',
    shortLabel: '36" Roll',
    kind: 'roll',
    shortMm: null,
    longMm: null,
    rollWidthMm: 914,
  },
  {
    id: 'roll-44',
    label: '44" Roll (1118 mm)',
    shortLabel: '44" Roll',
    kind: 'roll',
    shortMm: null,
    longMm: null,
    rollWidthMm: 1118,
  },
] as const;

export function getPrintMediaSpec(id: PrintMediaId): PrintMediaSpec {
  return PRINT_MEDIA_OPTIONS.find((opt) => opt.id === id) ?? PRINT_MEDIA_OPTIONS[0];
}

/** Structural binding styles supported by the geometry engine. */
export const BINDING_STYLES: readonly BindingStyleOption[] = [
  {
    id: 'rigid-case',
    label: 'Rigid 3-Board Hardcover',
    shortLabel: 'Rigid Case',
    summary: '2 cover boards + rigid spine strip (best ≥ 8 mm)',
  },
  {
    id: 'flexible-spine',
    label: 'Flexible Spine (No Spine Board)',
    shortLabel: 'Flexible Spine',
    summary: '2 cover boards + cloth spine gap (best 3–8 mm)',
  },
  {
    id: 'softcover-jacket',
    label: 'Fold-and-Glue Slip Cover (0-Board, 1 Sheet)',
    shortLabel: 'Slip Cover',
    summary: '1-piece printable cover with 4 mitered glue tabs — no separate pockets (fits Letter/A4 on A6)',
  },
] as const;

/** Paginated inner templates PDF sheet specs. */
export const PAGE_SIZES: Readonly<Record<PageSizeId, PageSizeSpec>> = {
  letter: {
    id: 'letter',
    label: 'US Letter (8.5 × 11")',
    widthMm: US_LETTER_SHEET.shortMm,
    heightMm: US_LETTER_SHEET.longMm,
  },
  a4: {
    id: 'a4',
    label: 'A4 (210 × 297 mm)',
    widthMm: A4_SHEET.shortMm,
    heightMm: A4_SHEET.longMm,
  },
  legal: {
    id: 'legal',
    label: 'US Legal (8.5 × 14 in)',
    widthMm: US_LEGAL_SHEET.shortMm,
    heightMm: US_LEGAL_SHEET.longMm,
  },
  tabloid: {
    id: 'tabloid',
    label: 'Tabloid / Ledger (11 × 17 in)',
    widthMm: TABLOID_SHEET.shortMm,
    heightMm: TABLOID_SHEET.longMm,
  },
};

/** Standard paperback & notebook trim-size presets. */
export const PAPERBACK_PRESETS: readonly PaperbackPreset[] = [
  {
    id: 'mass-market',
    label: 'Mass Market Paperback',
    pbWidthMm: 106.0,
    pbHeightMm: 174.0,
    summary: '106 × 174 mm',
  },
  {
    id: 'us-trade-digest',
    label: 'US Trade Digest',
    pbWidthMm: 139.7,
    pbHeightMm: 215.9,
    summary: '5.5 × 8.5 in',
  },
  {
    id: 'us-trade-standard',
    label: 'US Trade Standard',
    pbWidthMm: 152.4,
    pbHeightMm: 228.6,
    summary: '6.0 × 9.0 in',
  },
  {
    id: 'manga-b6',
    label: 'Manga / B6',
    pbWidthMm: 128.0,
    pbHeightMm: 182.0,
    summary: '128 × 182 mm',
  },
  {
    id: 'a6-notebook',
    label: 'A6 Pocket Notebook',
    pbWidthMm: 105.0,
    pbHeightMm: 148.0,
    summary: '105 × 148 mm',
  },
] as const;
