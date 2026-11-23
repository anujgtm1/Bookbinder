import { parseHexColor } from '@/lib/color';
import type { Rect2D } from './geometry';
import type { CuratedFontId, StudioFontId } from './studio';
import type { ResizeCorner } from './studioLayer';
import { UnitConverter, clampFinite, roundTo } from './units';

export type CustomSvgRenderMode = 'fill' | 'stroke' | 'fill-and-stroke';

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
  | 'spine-classic-bands'
  | 'spine-title-cartouche'
  | 'spine-head-tail-bands'
  | 'spine-botanical-vine'
  | 'spine-celestial-column'
  | 'spine-diamond-lattice'
  | 'custom-svg';

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
  'spine-title-cartouche',
  'spine-head-tail-bands',
  'spine-botanical-vine',
  'spine-celestial-column',
  'spine-diamond-lattice',
  'custom-svg',
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
  readonly flipX?: boolean;
  readonly flipY?: boolean;
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
  /** Optional custom imported SVG stamp metadata when presetId === 'custom-svg' */
  readonly customSvgName?: string;
  readonly customSvgPaths?: readonly string[];
  readonly customSvgViewBox?: { readonly width: number; readonly height: number };
  readonly customSvgRenderMode?: CustomSvgRenderMode;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
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

function generateElementId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      color: parseHexColor(obj.color, '#f5efe2'),
      uppercase: obj.uppercase === true ? true : undefined,
      flipX: obj.flipX === true ? true : undefined,
      flipY: obj.flipY === true ? true : undefined,
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
    const isSpinePreset = presetId.startsWith('spine-');

    let xMm: number;
    let yMm: number;
    let widthMm: number;
    let heightMm: number;
    let strokeWidthMm = 0.7;

    if (isSpinePreset) {
      const padX = Math.min(2.4, targetBoardRectMm.width * 0.14);
      const padY = Math.min(14, targetBoardRectMm.height * 0.07);
      xMm = targetBoardRectMm.x + padX;
      yMm = targetBoardRectMm.y + padY;
      widthMm = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.width - padX * 2);
      heightMm = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.height - padY * 2);
      strokeWidthMm = 0.65;
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

  createCustomSvg(input: {
    readonly name: string;
    readonly paths: readonly string[];
    readonly viewBoxWidth: number;
    readonly viewBoxHeight: number;
    readonly renderMode: CustomSvgRenderMode;
    readonly targetBoardRectMm: Rect2D;
    readonly zone: CoverElementZone;
    readonly color?: string;
  }): CoverOrnamentLayer {
    const aspect = Math.max(0.1, input.viewBoxWidth / Math.max(0.1, input.viewBoxHeight));
    const maxW = input.targetBoardRectMm.width * (input.zone === 'spine' ? 0.78 : 0.48);
    const maxH = input.targetBoardRectMm.height * (input.zone === 'spine' ? 0.72 : 0.42);
    let widthMm = maxW;
    let heightMm = widthMm / aspect;
    if (heightMm > maxH) {
      heightMm = maxH;
      widthMm = heightMm * aspect;
    }
    widthMm = clampFinite(widthMm, 36, COVER_ORNAMENT_BOUNDS.minSizeMm, COVER_ORNAMENT_BOUNDS.maxSizeMm);
    heightMm = clampFinite(heightMm, 36, COVER_ORNAMENT_BOUNDS.minSizeMm, COVER_ORNAMENT_BOUNDS.maxSizeMm);

    return {
      id: generateElementId('svg'),
      presetId: 'custom-svg',
      zone: input.zone,
      xMm: roundTo(input.targetBoardRectMm.x + (input.targetBoardRectMm.width - widthMm) / 2, 2),
      yMm: roundTo(input.targetBoardRectMm.y + (input.targetBoardRectMm.height - heightMm) / 2, 2),
      widthMm: roundTo(widthMm, 2),
      heightMm: roundTo(heightMm, 2),
      color: input.color ?? '#d9b566',
      strokeWidthMm: input.renderMode === 'stroke' ? 0.7 : 0.5,
      customSvgName: input.name,
      customSvgPaths: [...input.paths],
      customSvgViewBox: { width: input.viewBoxWidth, height: input.viewBoxHeight },
      customSvgRenderMode: input.renderMode,
    };
  },

  resizeFromCorner(
    layer: CoverOrnamentLayer,
    corner: ResizeCorner,
    pointerXMm: number,
    pointerYMm: number,
    lockAspect: boolean,
  ): CoverOrnamentLayer {
    const left = layer.xMm;
    const right = layer.xMm + layer.widthMm;
    const top = layer.yMm;
    const bottom = layer.yMm + layer.heightMm;
    const anchorX = corner === 'nw' || corner === 'sw' ? right : left;
    const anchorY = corner === 'nw' || corner === 'ne' ? bottom : top;

    let nextW = clampFinite(
      Math.abs(pointerXMm - anchorX),
      layer.widthMm,
      COVER_ORNAMENT_BOUNDS.minSizeMm,
      COVER_ORNAMENT_BOUNDS.maxSizeMm,
    );
    let nextH = clampFinite(
      Math.abs(pointerYMm - anchorY),
      layer.heightMm,
      COVER_ORNAMENT_BOUNDS.minSizeMm,
      COVER_ORNAMENT_BOUNDS.maxSizeMm,
    );

    if (lockAspect) {
      const aspect = layer.widthMm / Math.max(0.1, layer.heightMm);
      if (nextW / aspect >= nextH) {
        nextH = clampFinite(nextW / aspect, nextH, COVER_ORNAMENT_BOUNDS.minSizeMm, COVER_ORNAMENT_BOUNDS.maxSizeMm);
        nextW = nextH * aspect;
      } else {
        nextW = clampFinite(nextH * aspect, nextW, COVER_ORNAMENT_BOUNDS.minSizeMm, COVER_ORNAMENT_BOUNDS.maxSizeMm);
        nextH = nextW / aspect;
      }
    }

    const nextX = corner === 'nw' || corner === 'sw' ? anchorX - nextW : anchorX;
    const nextY = corner === 'nw' || corner === 'ne' ? anchorY - nextH : anchorY;

    return {
      ...layer,
      xMm: roundTo(nextX, 2),
      yMm: roundTo(nextY, 2),
      widthMm: roundTo(nextW, 2),
      heightMm: roundTo(nextH, 2),
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

  fitInsideBoardWithMargin(
    layer: CoverOrnamentLayer,
    targetBoardRectMm: Rect2D,
    marginMm: number,
  ): CoverOrnamentLayer {
    const safeMargin = Math.max(0, Number.isFinite(marginMm) ? marginMm : 0);
    const m = Math.min(safeMargin, targetBoardRectMm.width * 0.35, targetBoardRectMm.height * 0.35);
    const usable: Rect2D = {
      x: targetBoardRectMm.x + m,
      y: targetBoardRectMm.y + m,
      width: Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.width - m * 2),
      height: Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, targetBoardRectMm.height - m * 2),
    };

    const fillsInsetBox =
      layer.presetId.startsWith('frame-') ||
      layer.presetId.startsWith('corners-') ||
      layer.presetId.startsWith('spine-');

    if (fillsInsetBox) {
      return {
        ...layer,
        xMm: roundTo(usable.x, 2),
        yMm: roundTo(usable.y, 2),
        widthMm: roundTo(
          clampFinite(
            usable.width,
            usable.width,
            COVER_ORNAMENT_BOUNDS.minSizeMm,
            COVER_ORNAMENT_BOUNDS.maxSizeMm,
          ),
          2,
        ),
        heightMm: roundTo(
          clampFinite(
            usable.height,
            usable.height,
            COVER_ORNAMENT_BOUNDS.minSizeMm,
            COVER_ORNAMENT_BOUNDS.maxSizeMm,
          ),
          2,
        ),
      };
    }

    const rawAspect =
      layer.presetId === 'custom-svg' &&
      layer.customSvgViewBox &&
      layer.customSvgViewBox.width > 0 &&
      layer.customSvgViewBox.height > 0
        ? layer.customSvgViewBox.width / layer.customSvgViewBox.height
        : layer.widthMm / Math.max(0.1, layer.heightMm);
    const aspect = Math.max(0.1, Number.isFinite(rawAspect) ? rawAspect : 1);

    let widthMm = usable.width;
    let heightMm = widthMm / aspect;
    if (heightMm > usable.height) {
      heightMm = usable.height;
      widthMm = heightMm * aspect;
    }
    widthMm = clampFinite(
      widthMm,
      usable.width,
      COVER_ORNAMENT_BOUNDS.minSizeMm,
      COVER_ORNAMENT_BOUNDS.maxSizeMm,
    );
    heightMm = clampFinite(
      heightMm,
      usable.height,
      COVER_ORNAMENT_BOUNDS.minSizeMm,
      COVER_ORNAMENT_BOUNDS.maxSizeMm,
    );

    return {
      ...layer,
      xMm: roundTo(usable.x + (usable.width - widthMm) / 2, 2),
      yMm: roundTo(usable.y + (usable.height - heightMm) / 2, 2),
      widthMm: roundTo(widthMm, 2),
      heightMm: roundTo(heightMm, 2),
    };
  },

  centerInBoard(layer: CoverOrnamentLayer, targetBoardRectMm: Rect2D): CoverOrnamentLayer {
    return {
      ...layer,
      xMm: roundTo(targetBoardRectMm.x + (targetBoardRectMm.width - layer.widthMm) / 2, 2),
      yMm: roundTo(targetBoardRectMm.y + (targetBoardRectMm.height - layer.heightMm) / 2, 2),
    };
  },

  deserialize(raw: unknown): CoverOrnamentLayer | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const presetId = parseOrnamentId(obj.presetId);
    if (!presetId) return null;
    const rawMode = obj.customSvgRenderMode;
    const customSvgRenderMode: CustomSvgRenderMode | undefined =
      rawMode === 'fill' || rawMode === 'stroke' || rawMode === 'fill-and-stroke'
        ? rawMode
        : undefined;
    const customSvgPaths =
      presetId === 'custom-svg' && Array.isArray(obj.customSvgPaths)
        ? obj.customSvgPaths.filter((p): p is string => typeof p === 'string' && p.length > 0)
        : undefined;
    const rawVb =
      obj.customSvgViewBox && typeof obj.customSvgViewBox === 'object'
        ? (obj.customSvgViewBox as Record<string, unknown>)
        : null;
    const customSvgViewBox =
      presetId === 'custom-svg' &&
      rawVb &&
      typeof rawVb.width === 'number' &&
      rawVb.width > 0 &&
      typeof rawVb.height === 'number' &&
      rawVb.height > 0
        ? { width: rawVb.width, height: rawVb.height }
        : undefined;

    if (presetId === 'custom-svg' && (!customSvgPaths || customSvgPaths.length === 0)) {
      return null;
    }

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
      color: parseHexColor(obj.color, '#d9b566'),
      strokeWidthMm: clampFinite(
        obj.strokeWidthMm,
        0.7,
        COVER_ORNAMENT_BOUNDS.strokeWidthMm.min,
        COVER_ORNAMENT_BOUNDS.strokeWidthMm.max,
      ),
      customSvgName: typeof obj.customSvgName === 'string' ? obj.customSvgName : undefined,
      customSvgPaths,
      customSvgViewBox,
      customSvgRenderMode,
      flipX: obj.flipX === true ? true : undefined,
      flipY: obj.flipY === true ? true : undefined,
    };
  },
} as const;
