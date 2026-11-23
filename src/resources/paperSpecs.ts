import type {
  BindingStyleOption,
  PageSizeId,
  PageSizeSpec,
  PaperbackPreset,
  PrintMediaId,
  PrintMediaSpec,
} from '@/types/bookParams';
import type { RollWidthOption } from '@/types/geometry';
import paperSpecsData from './paperSpecs.json';

export interface DesktopSheetSpec {
  readonly shortMm: number;
  readonly longMm: number;
}

/** Canonical ordered desktop sheet IDs shared by print media cards and inner PDF pagination. */
export const PRIMARY_SHEET_MEDIA_IDS: readonly PageSizeId[] = [
  'letter',
  'a4',
  'legal',
  'tabloid',
] as const;

function formatMediaLabel(name: string, dimensionsLabel: string): string {
  return `${name} (${dimensionsLabel})`;
}

function toDesktopSheet(id: PageSizeId): DesktopSheetSpec {
  const sheet = paperSpecsData.desktopSheets[id];
  return { shortMm: sheet.shortMm, longMm: sheet.longMm };
}

/** Named standard desktop paper sheet dimensions (in mm). */
export const US_LETTER_SHEET: DesktopSheetSpec = toDesktopSheet('letter');
export const A4_SHEET: DesktopSheetSpec = toDesktopSheet('a4');
export const US_LEGAL_SHEET: DesktopSheetSpec = toDesktopSheet('legal');
export const TABLOID_SHEET: DesktopSheetSpec = toDesktopSheet('tabloid');

/** 5.0 mm unprintable margin per side (10.0 mm total). */
export const ROLL_TOTAL_MARGIN_MM: number = paperSpecsData.rollTotalMarginMm;

/** Standard wide-format roll widths (in inches & mm). */
export const STANDARD_ROLL_WIDTHS: readonly RollWidthOption[] = paperSpecsData.rollWidths.map(
  (roll) => ({
    inches: roll.inches,
    widthMm: roll.widthMm,
    label: `${roll.inches}"`,
  }),
);

/** Target output media specs for Outer Cover Print PDF & paper-fit preflight. */
export const PRINT_MEDIA_OPTIONS: readonly PrintMediaSpec[] = [
  {
    id: paperSpecsData.exactAutoMedia.id as PrintMediaId,
    label: paperSpecsData.exactAutoMedia.label,
    shortLabel: paperSpecsData.exactAutoMedia.name,
    dimensionsLabel: paperSpecsData.exactAutoMedia.dimensionsLabel,
    kind: 'auto',
    shortMm: null,
    longMm: null,
    rollWidthMm: null,
  },
  ...PRIMARY_SHEET_MEDIA_IDS.map((id): PrintMediaSpec => {
    const sheet = paperSpecsData.desktopSheets[id];
    return {
      id,
      label: formatMediaLabel(sheet.name, sheet.dimensionsLabel),
      shortLabel: sheet.name,
      dimensionsLabel: sheet.dimensionsLabel,
      kind: 'sheet',
      shortMm: sheet.shortMm,
      longMm: sheet.longMm,
      rollWidthMm: null,
    };
  }),
  ...paperSpecsData.rollWidths.map(
    (roll): PrintMediaSpec => ({
      id: roll.id as PrintMediaId,
      label: formatMediaLabel(roll.name, roll.dimensionsLabel),
      shortLabel: roll.name,
      dimensionsLabel: roll.dimensionsLabel,
      kind: 'roll',
      shortMm: null,
      longMm: null,
      rollWidthMm: roll.widthMm,
    }),
  ),
];

export function getPrintMediaSpec(id: PrintMediaId): PrintMediaSpec {
  return PRINT_MEDIA_OPTIONS.find((opt) => opt.id === id) ?? PRINT_MEDIA_OPTIONS[0];
}

/** Structural binding styles supported by the geometry engine. */
export const BINDING_STYLES: readonly BindingStyleOption[] = paperSpecsData.bindingStyles.map(
  (style) => ({
    id: style.id as BindingStyleOption['id'],
    label: style.label,
    shortLabel: style.shortLabel,
    summary: style.summary,
  }),
);

function buildPageSizeSpec(id: PageSizeId): PageSizeSpec {
  const sheet = paperSpecsData.desktopSheets[id];
  return {
    id,
    label: formatMediaLabel(sheet.name, sheet.dimensionsLabel),
    shortLabel: sheet.name,
    dimensionsLabel: sheet.dimensionsLabel,
    widthMm: sheet.shortMm,
    heightMm: sheet.longMm,
  };
}

/** Paginated inner templates PDF sheet specs. */
export const PAGE_SIZES: Readonly<Record<PageSizeId, PageSizeSpec>> = {
  letter: buildPageSizeSpec('letter'),
  a4: buildPageSizeSpec('a4'),
  legal: buildPageSizeSpec('legal'),
  tabloid: buildPageSizeSpec('tabloid'),
};

export function getPageSizeSpec(id: PageSizeId): PageSizeSpec {
  return PAGE_SIZES[id] ?? PAGE_SIZES.letter;
}

/** Standard paperback & notebook trim-size presets. */
export const PAPERBACK_PRESETS: readonly PaperbackPreset[] = paperSpecsData.paperbackPresets.map(
  (preset) => ({
    id: preset.id as PaperbackPreset['id'],
    label: preset.label,
    pbWidthMm: preset.pbWidthMm,
    pbHeightMm: preset.pbHeightMm,
    summary: preset.summary,
  }),
);
