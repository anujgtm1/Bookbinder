import type { Rect2D } from './geometry';
import type { CuratedFontId, StudioFontId } from './studio';
import { UnitConverter, clampFinite, roundTo } from './units';

const VALID_CURATED_FONT_IDS: readonly CuratedFontId[] = [
  'eb-garamond',
  'libre-baskerville',
  'cormorant-garamond',
  'lora',
  'inter',
  'montserrat',
];

export type CoverElementZone = 'front' | 'back' | 'spine';
export type TextAlign = 'left' | 'center' | 'right';
export type CoverTextPresetKind = 'front-title' | 'front-author' | 'back-blurb';

export type ClassicOrnamentCategory = 'frames' | 'corners' | 'dividers' | 'emblems' | 'spine';

export type ClassicOrnamentId =
  | 'frame-single-rule'
  | 'frame-double-rule'
  | 'frame-art-deco'
  | 'frame-notched-corner'
  | 'corners-classic-scroll'
  | 'corners-deco-chevron'
  | 'divider-diamond-rule'
  | 'divider-fleuron-leaf'
  | 'divider-celestial-stars'
  | 'emblem-compass-rose'
  | 'emblem-botanical-sprig'
  | 'spine-classic-bands';

export const CLASSIC_ORNAMENT_IDS: readonly ClassicOrnamentId[] = [
  'frame-single-rule',
  'frame-double-rule',
  'frame-art-deco',
  'frame-notched-corner',
  'corners-classic-scroll',
  'corners-deco-chevron',
  'divider-diamond-rule',
  'divider-fleuron-leaf',
  'divider-celestial-stars',
  'emblem-compass-rose',
  'emblem-botanical-sprig',
  'spine-classic-bands',
] as const;

export interface CoverTextLayer {
  readonly id: string;
  readonly text: string;
  readonly zone: CoverElementZone;
  /** Anchor center X in StudioCanvasSpec mm coordinates (includes bleed offset) */
  readonly xMm: number;
  /** Anchor center Y in StudioCanvasSpec mm coordinates (includes bleed offset) */
  readonly yMm: number;
  readonly fontId: StudioFontId;
  readonly fontSizePt: number;
  /** Tracking in em (-0.05 to 0.40 em — great for classic foil titles) */
  readonly letterSpacingEm: number;
  /** Multi-line line-height multiplier (0.9 to 2.0) */
  readonly lineHeight: number;
  readonly align: TextAlign;
  readonly color: string;
  readonly uppercase?: boolean;
}

export interface CoverOrnamentLayer {
  readonly id: string;
  readonly presetId: ClassicOrnamentId;
  readonly zone: CoverElementZone;
  /** Top-left X in StudioCanvasSpec mm coordinates */
  readonly xMm: number;
  /** Top-left Y in StudioCanvasSpec mm coordinates */
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly color: string;
  /** Line/rule thickness in mm (0.35 to 3.0 mm; default 0.7 mm for crisp foil/HTV cutting) */
  readonly strokeWidthMm: number;
}

export const COVER_TEXT_BOUNDS = {
  fontSizePt: { min: 7, max: 96 },
  letterSpacingEm: { min: -0.05, max: 0.4 },
  lineHeight: { min: 0.9, max: 2.0 },
} as const;

export const COVER_ORNAMENT_BOUNDS = {
  minSizeMm: 8,
  maxSizeMm: 600,
  strokeWidthMm: { min: 0.35, max: 3.0 },
} as const;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function generateElementId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback;
}

function parseZone(value: unknown): CoverElementZone {
  if (value === 'back' || value === 'spine') return value;
  return 'front';
}

function parseAlign(value: unknown): TextAlign {
  if (value === 'left' || value === 'right') return value;
  return 'center';
}

function parseFontId(value: unknown): StudioFontId {
  if (value === 'custom') return 'custom';
  if (typeof value === 'string' && (VALID_CURATED_FONT_IDS as readonly string[]).includes(value)) {
    return value as CuratedFontId;
  }
  return 'eb-garamond';
}

function parseOrnamentId(value: unknown): ClassicOrnamentId | null {
  if (typeof value === 'string' && (CLASSIC_ORNAMENT_IDS as readonly string[]).includes(value)) {
    return value as ClassicOrnamentId;
  }
  return null;
}

export const CoverTextLayerModel = {
  displayLines(layer: CoverTextLayer): readonly string[] {
    const raw = layer.uppercase ? layer.text.toUpperCase() : layer.text;
    const lines = raw.split(/\r?\n/);
    return lines.length > 0 ? lines : [''];
  },

  /** Estimates tight bounding box in StudioCanvasSpec mm coordinates for selection hit-testing & snapping. */
  estimateBounds(layer: CoverTextLayer): Rect2D {
    const lines = this.displayLines(layer);
    const fontMm = UnitConverter.pointsToMm(layer.fontSizePt);
    const stepMm = fontMm * layer.lineHeight;
    const maxChars = Math.max(
      2,
      ...lines.map((line) => Math.max(1, line.trim().length || line.length)),
    );
    const charFactor = layer.uppercase ? 0.64 : 0.54;
    const estWidth = Math.max(
      14,
      maxChars * fontMm * (charFactor + Math.max(0, layer.letterSpacingEm)),
    );
    const estHeight = Math.max(fontMm * 1.15, (lines.length - 1) * stepMm + fontMm * 1.15);

    const x =
      layer.align === 'left'
        ? layer.xMm
        : layer.align === 'right'
          ? layer.xMm - estWidth
          : layer.xMm - estWidth / 2;

    return {
      x: roundTo(x, 2),
      y: roundTo(layer.yMm - estHeight / 2, 2),
      width: roundTo(estWidth, 2),
      height: roundTo(estHeight, 2),
    };
  },

  createPreset(
    preset: CoverTextPresetKind,
    targetBoardRectMm: Rect2D,
    options?: { readonly fontId?: StudioFontId; readonly color?: string },
  ): CoverTextLayer {
    const fontId = options?.fontId ?? 'eb-garamond';
    const color = options?.color ?? '#f5efe2';
    const cx = roundTo(targetBoardRectMm.x + targetBoardRectMm.width / 2, 2);
    const scaleFactor = Math.min(1.15, Math.max(0.68, targetBoardRectMm.width / 140));

    if (preset === 'front-title') {
      return {
        id: generateElementId('txt'),
        text: 'BOOK TITLE',
        zone: 'front',
        xMm: cx,
        yMm: roundTo(targetBoardRectMm.y + targetBoardRectMm.height * 0.32, 2),
        fontId,
        fontSizePt: roundTo(26 * scaleFactor, 1),
        letterSpacingEm: 0.08,
        lineHeight: 1.18,
        align: 'center',
        color,
        uppercase: true,
      };
    }

    if (preset === 'front-author') {
      return {
        id: generateElementId('txt'),
        text: 'AUTHOR NAME',
        zone: 'front',
        xMm: cx,
        yMm: roundTo(targetBoardRectMm.y + targetBoardRectMm.height * 0.76, 2),
        fontId,
        fontSizePt: roundTo(13 * scaleFactor, 1),
        letterSpacingEm: 0.16,
        lineHeight: 1.25,
        align: 'center',
        color,
        uppercase: true,
      };
    }

    return {
      id: generateElementId('txt'),
      text: 'A handcrafted edition\nbound with care.',
      zone: 'back',
      xMm: cx,
      yMm: roundTo(targetBoardRectMm.y + targetBoardRectMm.height * 0.5, 2),
      fontId,
      fontSizePt: roundTo(11 * scaleFactor, 1),
      letterSpacingEm: 0.02,
      lineHeight: 1.38,
      align: 'center',
      color,
      uppercase: false,
    };
  },

  moveBy(layer: CoverTextLayer, dxMm: number, dyMm: number): CoverTextLayer {
    return {
      ...layer,
      xMm: roundTo(clampFinite(layer.xMm + dxMm, layer.xMm, -1500, 1500), 2),
      yMm: roundTo(clampFinite(layer.yMm + dyMm, layer.yMm, -1500, 1500), 2),
    };
  },

  deserialize(raw: unknown): CoverTextLayer | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.text !== 'string') return null;
    return {
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id : generateElementId('txt'),
      text: obj.text.slice(0, 600),
      zone: parseZone(obj.zone),
      xMm: clampFinite(obj.xMm, 100, -1500, 1500),
      yMm: clampFinite(obj.yMm, 100, -1500, 1500),
      fontId: parseFontId(obj.fontId),
      fontSizePt: clampFinite(
        obj.fontSizePt,
        20,
        COVER_TEXT_BOUNDS.fontSizePt.min,
        COVER_TEXT_BOUNDS.fontSizePt.max,
      ),
      letterSpacingEm: clampFinite(
        obj.letterSpacingEm,
        0,
        COVER_TEXT_BOUNDS.letterSpacingEm.min,
        COVER_TEXT_BOUNDS.letterSpacingEm.max,
      ),
      lineHeight: clampFinite(
        obj.lineHeight,
        1.2,
        COVER_TEXT_BOUNDS.lineHeight.min,
        COVER_TEXT_BOUNDS.lineHeight.max,
      ),
      align: parseAlign(obj.align),
      color: parseHex(obj.color, '#f5efe2'),
      uppercase: obj.uppercase === true ? true : undefined,
    };
  },
} as const;

export const CoverOrnamentLayerModel = {
  createForZone(
    presetId: ClassicOrnamentId,
    targetBoardRectMm: Rect2D,
    zone: CoverElementZone,
    color = '#d9b566',
  ): CoverOrnamentLayer {
    const isFrameOrCorner =
      presetId.startsWith('frame-') || presetId.startsWith('corners-');
    const isDivider = presetId.startsWith('divider-');
    const isSpineBands = presetId === 'spine-classic-bands';

    let xMm: number;
    let yMm: number;
    let widthMm: number;
    let heightMm: number;
    let strokeWidthMm = 0.7;

    if (isSpineBands) {
      const padX = Math.min(2.5, targetBoardRectMm.width * 0.12);
      const padY = Math.min(18, targetBoardRectMm.height * 0.08);
      xMm = targetBoardRectMm.x + padX;
      yMm = targetBoardRectMm.y + padY;
      widthMm = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.width - padX * 2);
      heightMm = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.height - padY * 2);
      strokeWidthMm = 0.75;
    } else if (isFrameOrCorner) {
      const inset = Math.min(12, Math.max(6, Math.min(targetBoardRectMm.width, targetBoardRectMm.height) * 0.085));
      xMm = targetBoardRectMm.x + inset;
      yMm = targetBoardRectMm.y + inset;
      widthMm = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.width - inset * 2);
      heightMm = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.height - inset * 2);
    } else if (isDivider) {
      widthMm = Math.max(24, Math.min(72, targetBoardRectMm.width * 0.56));
      heightMm = Math.max(8, Math.min(16, widthMm * 0.2));
      xMm = targetBoardRectMm.x + (targetBoardRectMm.width - widthMm) / 2;
      yMm = targetBoardRectMm.y + targetBoardRectMm.height * 0.52 - heightMm / 2;
    } else {
      // Emblem centered on cover
      const size = Math.max(22, Math.min(54, Math.min(targetBoardRectMm.width, targetBoardRectMm.height) * 0.34));
      widthMm = size;
      heightMm = size;
      xMm = targetBoardRectMm.x + (targetBoardRectMm.width - widthMm) / 2;
      yMm = targetBoardRectMm.y + targetBoardRectMm.height * 0.54 - heightMm / 2;
    }

    return {
      id: generateElementId('orn'),
      presetId,
      zone,
      xMm: roundTo(xMm, 2),
      yMm: roundTo(yMm, 2),
      widthMm: roundTo(widthMm, 2),
      heightMm: roundTo(heightMm, 2),
      color,
      strokeWidthMm,
    };
  },

  moveBy(layer: CoverOrnamentLayer, dxMm: number, dyMm: number): CoverOrnamentLayer {
    return {
      ...layer,
      xMm: roundTo(clampFinite(layer.xMm + dxMm, layer.xMm, -1500, 1500), 2),
      yMm: roundTo(clampFinite(layer.yMm + dyMm, layer.yMm, -1500, 1500), 2),
    };
  },

  scaleAroundCenter(layer: CoverOrnamentLayer, factor: number): CoverOrnamentLayer {
    if (!Number.isFinite(factor) || factor <= 0) return layer;
    const nextW = clampFinite(
      layer.widthMm * factor,
      layer.widthMm,
      COVER_ORNAMENT_BOUNDS.minSizeMm,
      COVER_ORNAMENT_BOUNDS.maxSizeMm,
    );
    const nextH = clampFinite(
      layer.heightMm * factor,
      layer.heightMm,
      COVER_ORNAMENT_BOUNDS.minSizeMm,
      COVER_ORNAMENT_BOUNDS.maxSizeMm,
    );
    const cx = layer.xMm + layer.widthMm / 2;
    const cy = layer.yMm + layer.heightMm / 2;
    return {
      ...layer,
      xMm: roundTo(cx - nextW / 2, 2),
      yMm: roundTo(cy - nextH / 2, 2),
      widthMm: roundTo(nextW, 2),
      heightMm: roundTo(nextH, 2),
    };
  },

  deserialize(raw: unknown): CoverOrnamentLayer | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const presetId = parseOrnamentId(obj.presetId);
    if (!presetId) return null;
    return {
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id : generateElementId('orn'),
      presetId,
      zone: parseZone(obj.zone),
      xMm: clampFinite(obj.xMm, 20, -1500, 1500),
      yMm: clampFinite(obj.yMm, 20, -1500, 1500),
      widthMm: clampFinite(
        obj.widthMm,
        80,
        COVER_ORNAMENT_BOUNDS.minSizeMm,
        COVER_ORNAMENT_BOUNDS.maxSizeMm,
      ),
      heightMm: clampFinite(
        obj.heightMm,
        80,
        COVER_ORNAMENT_BOUNDS.minSizeMm,
        COVER_ORNAMENT_BOUNDS.maxSizeMm,
      ),
      color: parseHex(obj.color, '#d9b566'),
      strokeWidthMm: clampFinite(
        obj.strokeWidthMm,
        0.7,
        COVER_ORNAMENT_BOUNDS.strokeWidthMm.min,
        COVER_ORNAMENT_BOUNDS.strokeWidthMm.max,
      ),
    };
  },
} as const;
