import { BINDING_STYLE_STRATEGIES, getBindingStrategy } from '@/core/bindingStyles';
import { clampCustomRollWidthMm } from '@/core/printerMargins';
import {
  BINDING_STYLES,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
  PRIMARY_SHEET_MEDIA_IDS,
  PRINT_MEDIA_OPTIONS,
  getPageSizeSpec,
  getPrintMediaSpec,
} from '@/resources/paperSpecs';
import { UnitConverter, clampFinite, type UnitSystem } from './units';

export {
  BINDING_STYLES,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
  PRIMARY_SHEET_MEDIA_IDS,
  PRINT_MEDIA_OPTIONS,
  getPageSizeSpec,
  getPrintMediaSpec,
};

export type BindingStyle =
  | 'rigid-case'
  | 'flexible-spine'
  | 'softcover-jacket'
  | 'dust-jacket'
  | 'paperback-wrap';

export type SoftcoverPocketMode = 'integrated' | 'separate';

export type InteriorStyle = 'slip-pockets' | 'folded-endpapers';

export function isBoardlessBinding(style: BindingStyle): boolean {
  return !getBindingStrategy(style).capabilities.usesChipboard;
}

export function hasIntegratedFlaps(style: BindingStyle): boolean {
  return getBindingStrategy(style).capabilities.hasFlaps;
}
export type SplitMode = 'single' | 'three-piece';
export type PageSizeId = 'letter' | 'a4' | 'legal' | 'tabloid';
export type PrintMediaId =
  | 'exact-auto'
  | 'letter'
  | 'a4'
  | 'legal'
  | 'tabloid'
  | 'roll-13'
  | 'roll-17'
  | 'roll-24'
  | 'roll-36'
  | 'roll-44'
  | 'roll-custom';
export type PaperbackPresetId =
  | 'mass-market'
  | 'us-trade-digest'
  | 'us-trade-standard'
  | 'manga-b6'
  | 'a6-notebook'
  | 'custom';

export interface PrintMediaSpec {
  readonly id: PrintMediaId;
  readonly label: string;
  readonly shortLabel: string;
  readonly dimensionsLabel: string;
  readonly kind: 'auto' | 'sheet' | 'roll';
  readonly shortMm: number | null;
  readonly longMm: number | null;
  readonly rollWidthMm: number | null;
}

export interface BindingStyleOption {
  readonly id: BindingStyle;
  readonly label: string;
  readonly shortLabel: string;
  readonly summary: string;
}

export interface PageSizeSpec {
  readonly id: PageSizeId;
  readonly label: string;
  readonly shortLabel: string;
  readonly dimensionsLabel: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface PaperbackPreset {
  readonly id: Exclude<PaperbackPresetId, 'custom'>;
  readonly label: string;
  readonly pbWidthMm: number;
  readonly pbHeightMm: number;
  readonly summary: string;
}

export interface BookParameters {
  /** Structural binding style (rigid 3-board case, 2-board flexible spine, or 0-board softcover jacket) */
  bindingStyle: BindingStyle;
  /** Paperback height / length in mm (PB_H) */
  pbHeightMm: number;
  /** Paperback width in mm (PB_W) */
  pbWidthMm: number;
  /** Paperback spine thickness in mm (PB_THICK) */
  pbThicknessMm: number;
  /** Chipboard thickness in mm (BOARD_T) */
  boardThicknessMm: number;
  /** Hinge spacer width in mm (HINGE_W) */
  hingeWidthMm: number;
  /** Total top + bottom board overhang in mm (OVERHANG_TB) */
  overhangTopBottomMm: number;
  /** Fore-edge board overhang in mm (OVERHANG_FORE) */
  overhangForeEdgeMm: number;
  /** Extra spine clearance for removable pockets in mm (SPINE_ALLOWANCE) */
  spineAllowanceMm: number;
  /** Whether spineAllowanceMm automatically tracks 1.0x boardThicknessMm */
  spineAllowanceLinked: boolean;
  /** Outer wrap turn-in margin in mm (TURN_IN) */
  turnInMm: number;
  /** Corner miter gap multiplier against boardThicknessMm (MITER_FACTOR) */
  miterFactor: number;
  /** Outer artwork bleed margin in mm (BLEED) */
  bleedMm: number;
  /** Whether to include the bleed frame on previews/exports */
  includeBleed: boolean;
  /** Inner pocket width ratio as % of BOARD_W (65–80%) */
  pocketDepthPct: number;
  /** Pocket glue flap width in mm (POCKET_FLAP) */
  pocketFlapMm: number;
  /** Single-piece continuous wrap vs 3-piece quarter-bound split */
  splitMode: SplitMode;
  /** Spine cloth overlap onto front & back boards in 3-piece split mode (mm) */
  quarterBoundOverlapMm: number;
  /** Sheet size for paginated inner envelopes & liner PDF */
  pdfPageSize: PageSizeId;
  /** Target output paper sheet or roll width for outer cover Print PDF & paper-fit preflight */
  printMedia: PrintMediaId;
  /** Optional custom wide-format roll width in mm when printMedia === 'roll-custom' (clamped to 200..1600 mm) */
  customRollWidthMm?: number;
  /** Optional custom flap width in mm for softcover-jacket or dust-jacket (undefined = auto default) */
  jacketFlapWidthMm?: number;
  /** Optional pocket construction mode for softcover-jacket ('integrated' 1-piece flaps vs 'separate' 2-sheet glue-in pockets) */
  softcoverPocketMode?: SoftcoverPocketMode;
  /** Optional interior attachment style for chipboard hardcovers ('slip-pockets' vs 'folded-endpapers'; undefined defaults to 'slip-pockets') */
  interiorStyle?: InteriorStyle;
  /** UI display unit (exports remain strictly 1:1 mm) */
  unit: UnitSystem;
}

export interface BookParametersValidation {
  readonly isValid: boolean;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export const BOOK_PARAM_BOUNDS = {
  pbHeightMm: { min: 60, max: 500 },
  pbWidthMm: { min: 50, max: 400 },
  pbThicknessMm: { min: 2, max: 120 },
  boardThicknessMm: { min: 0.5, max: 6 },
  hingeWidthMm: { min: 3, max: 25 },
  overhangTopBottomMm: { min: 0, max: 24 },
  overhangForeEdgeMm: { min: 0, max: 16 },
  spineAllowanceMm: { min: 0, max: 15 },
  turnInMm: { min: 8, max: 40 },
  miterFactor: { min: 0.5, max: 3 },
  bleedMm: { min: 0, max: 15 },
  pocketDepthPct: { min: 65, max: 80 },
  pocketFlapMm: { min: 6, max: 25 },
  quarterBoundOverlapMm: { min: 10, max: 50 },
  jacketFlapWidthMm: { min: 20, max: 100 },
} as const;

export const DEFAULT_BOOK_PARAMETERS: Readonly<BookParameters> = {
  bindingStyle: 'rigid-case',
  pbHeightMm: 216.0,
  pbWidthMm: 140.0,
  pbThicknessMm: 24.0,
  boardThicknessMm: 2.0,
  hingeWidthMm: 9.0,
  overhangTopBottomMm: 7.0,
  overhangForeEdgeMm: 3.0,
  spineAllowanceMm: 2.0,
  spineAllowanceLinked: true,
  turnInMm: 18.0,
  miterFactor: 1.5,
  bleedMm: 3.0,
  includeBleed: true,
  pocketDepthPct: 72,
  pocketFlapMm: 12.0,
  splitMode: 'single',
  quarterBoundOverlapMm: 20.0,
  pdfPageSize: 'letter',
  printMedia: 'exact-auto',
  unit: 'mm',
};

const VALID_PRINT_MEDIA_IDS = new Set<string>(PRINT_MEDIA_OPTIONS.map((o) => o.id));

function parseBindingStyle(value: unknown): BindingStyle {
  if (typeof value === 'string' && value in BINDING_STYLE_STRATEGIES) {
    return value as BindingStyle;
  }
  return 'rigid-case';
}

function parseSplitMode(value: unknown): SplitMode {
  return value === 'three-piece' ? 'three-piece' : 'single';
}

function parsePageSize(value: unknown): PageSizeId {
  return value === 'a4' || value === 'legal' || value === 'tabloid' ? value : 'letter';
}

function parsePrintMedia(value: unknown): PrintMediaId {
  if (typeof value === 'string' && VALID_PRINT_MEDIA_IDS.has(value)) {
    return value as PrintMediaId;
  }
  return DEFAULT_BOOK_PARAMETERS.printMedia;
}

function parseSoftcoverPocketMode(value: unknown): SoftcoverPocketMode | undefined {
  if (value === 'separate' || value === 'integrated') {
    return value;
  }
  return undefined;
}

function parseInteriorStyle(value: unknown): InteriorStyle | undefined {
  if (value === 'folded-endpapers' || value === 'slip-pockets') {
    return value;
  }
  return undefined;
}

export const BookParametersModel = {
  createDefault(): BookParameters {
    return { ...DEFAULT_BOOK_PARAMETERS };
  },

  clampAndNormalize(partial: Partial<BookParameters>): BookParameters {
    const b = BOOK_PARAM_BOUNDS;
    const d = DEFAULT_BOOK_PARAMETERS;
    const boardThicknessMm = clampFinite(
      partial.boardThicknessMm,
      d.boardThicknessMm,
      b.boardThicknessMm.min,
      b.boardThicknessMm.max,
    );
    const spineAllowanceLinked =
      typeof partial.spineAllowanceLinked === 'boolean'
        ? partial.spineAllowanceLinked
        : d.spineAllowanceLinked;

    const rawSpineAllowance =
      spineAllowanceLinked && partial.spineAllowanceMm === undefined
        ? boardThicknessMm
        : partial.spineAllowanceMm;

    const jacketFlapWidthMm =
      typeof partial.jacketFlapWidthMm === 'number' && Number.isFinite(partial.jacketFlapWidthMm)
        ? clampFinite(
            partial.jacketFlapWidthMm,
            b.jacketFlapWidthMm.min,
            b.jacketFlapWidthMm.min,
            b.jacketFlapWidthMm.max,
          )
        : undefined;
    const softcoverPocketMode = parseSoftcoverPocketMode(partial.softcoverPocketMode);
    const interiorStyle = parseInteriorStyle(partial.interiorStyle);
    const customRollWidthMm =
      typeof partial.customRollWidthMm === 'number' && Number.isFinite(partial.customRollWidthMm)
        ? clampCustomRollWidthMm(partial.customRollWidthMm)
        : undefined;

    return {
      bindingStyle: parseBindingStyle(partial.bindingStyle),
      pbHeightMm: clampFinite(partial.pbHeightMm, d.pbHeightMm, b.pbHeightMm.min, b.pbHeightMm.max),
      pbWidthMm: clampFinite(partial.pbWidthMm, d.pbWidthMm, b.pbWidthMm.min, b.pbWidthMm.max),
      pbThicknessMm: clampFinite(
        partial.pbThicknessMm,
        d.pbThicknessMm,
        b.pbThicknessMm.min,
        b.pbThicknessMm.max,
      ),
      boardThicknessMm,
      hingeWidthMm: clampFinite(
        partial.hingeWidthMm,
        d.hingeWidthMm,
        b.hingeWidthMm.min,
        b.hingeWidthMm.max,
      ),
      overhangTopBottomMm: clampFinite(
        partial.overhangTopBottomMm,
        d.overhangTopBottomMm,
        b.overhangTopBottomMm.min,
        b.overhangTopBottomMm.max,
      ),
      overhangForeEdgeMm: clampFinite(
        partial.overhangForeEdgeMm,
        d.overhangForeEdgeMm,
        b.overhangForeEdgeMm.min,
        b.overhangForeEdgeMm.max,
      ),
      spineAllowanceMm: clampFinite(
        rawSpineAllowance,
        boardThicknessMm,
        b.spineAllowanceMm.min,
        b.spineAllowanceMm.max,
      ),
      spineAllowanceLinked,
      turnInMm: clampFinite(partial.turnInMm, d.turnInMm, b.turnInMm.min, b.turnInMm.max),
      miterFactor: clampFinite(
        partial.miterFactor,
        d.miterFactor,
        b.miterFactor.min,
        b.miterFactor.max,
      ),
      bleedMm: clampFinite(partial.bleedMm, d.bleedMm, b.bleedMm.min, b.bleedMm.max),
      includeBleed: typeof partial.includeBleed === 'boolean' ? partial.includeBleed : d.includeBleed,
      pocketDepthPct: clampFinite(
        partial.pocketDepthPct,
        d.pocketDepthPct,
        b.pocketDepthPct.min,
        b.pocketDepthPct.max,
      ),
      pocketFlapMm: clampFinite(
        partial.pocketFlapMm,
        d.pocketFlapMm,
        b.pocketFlapMm.min,
        b.pocketFlapMm.max,
      ),
      splitMode: parseSplitMode(partial.splitMode),
      quarterBoundOverlapMm: clampFinite(
        partial.quarterBoundOverlapMm,
        d.quarterBoundOverlapMm,
        b.quarterBoundOverlapMm.min,
        b.quarterBoundOverlapMm.max,
      ),
      pdfPageSize: parsePageSize(partial.pdfPageSize),
      printMedia: parsePrintMedia(partial.printMedia),
      ...(customRollWidthMm !== undefined ? { customRollWidthMm } : {}),
      ...(jacketFlapWidthMm !== undefined ? { jacketFlapWidthMm } : {}),
      ...(softcoverPocketMode !== undefined ? { softcoverPocketMode } : {}),
      ...(interiorStyle !== undefined ? { interiorStyle } : {}),
      unit: UnitConverter.parseUnitSystem(partial.unit, d.unit),
    };
  },

  withBoardThickness(params: BookParameters, nextBoardThicknessMm: number): BookParameters {
    const b = BOOK_PARAM_BOUNDS.boardThicknessMm;
    const clamped = clampFinite(nextBoardThicknessMm, params.boardThicknessMm, b.min, b.max);
    return {
      ...params,
      boardThicknessMm: clamped,
      spineAllowanceMm: params.spineAllowanceLinked ? clamped : params.spineAllowanceMm,
    };
  },

  applyPreset(
    params: BookParameters,
    presetId: Exclude<PaperbackPresetId, 'custom'>,
  ): BookParameters {
    const preset = PAPERBACK_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      return params;
    }
    return {
      ...params,
      pbWidthMm: preset.pbWidthMm,
      pbHeightMm: preset.pbHeightMm,
    };
  },

  detectPreset(params: BookParameters, toleranceMm = 0.2): PaperbackPresetId {
    const match = PAPERBACK_PRESETS.find(
      (preset) =>
        Math.abs(preset.pbWidthMm - params.pbWidthMm) <= toleranceMm &&
        Math.abs(preset.pbHeightMm - params.pbHeightMm) <= toleranceMm,
    );
    return match ? match.id : 'custom';
  },

  validate(params: BookParameters): BookParametersValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (params.pbHeightMm <= 0 || params.pbWidthMm <= 0 || params.pbThicknessMm <= 0) {
      errors.push('Paperback dimensions must be positive numbers.');
    }

    if (!isBoardlessBinding(params.bindingStyle)) {
      const miterGap = params.boardThicknessMm * params.miterFactor;
      if (miterGap * Math.SQRT2 >= params.turnInMm * 2) {
        errors.push('Miter clearance exceeds available turn-in width.');
      }

      if (
        params.bindingStyle === 'rigid-case' &&
        params.hingeWidthMm < params.boardThicknessMm * 2.5
      ) {
        warnings.push(
          `Hinge width (${params.hingeWidthMm.toFixed(1)} mm) is tight for ${params.boardThicknessMm.toFixed(1)} mm chipboard; 9.0 mm is recommended.`,
        );
      }

      if (params.turnInMm < 12) {
        warnings.push('Turn-in margin under 12 mm may reduce glue adhesion on inner boards.');
      }
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
    };
  },

  serialize(params: BookParameters): BookParameters {
    return { ...params };
  },

  deserialize(raw: unknown): BookParameters {
    if (!raw || typeof raw !== 'object') {
      return this.createDefault();
    }
    return this.clampAndNormalize(raw as Partial<BookParameters>);
  },
} as const;
