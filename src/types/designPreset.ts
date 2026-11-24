import { parseHexColor } from '@/lib/color';
import { BUILT_IN_DESIGN_PRESETS } from '@/resources/designPresets';
import { computeStudioCanvasSpec, getPanelBoardRect } from '@/studio/canvasSpec';
import {
  CLASSIC_ORNAMENT_IDS,
  COVER_ORNAMENT_BOUNDS,
  COVER_TEXT_BOUNDS,
  isBoxMappedOrnament,
  type ClassicOrnamentId,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CoverTextLayer,
  type CustomSvgRenderMode,
  type TextAlign,
} from './coverElements';
import type { CaseGeometry, Rect2D } from './geometry';
import {
  cloneLayerLayoutConstraint,
  sanitizeCoverTextRole,
  sanitizeLayerLayoutConstraint,
  type CoverTextSemanticRole,
  type LayerLayoutConstraint,
} from './layoutConstraints';
import {
  CURATED_FONT_IDS,
  STUDIO_BOUNDS,
  type AuthorOrientation,
  type CoverStudioState,
  type CuratedFontId,
  type SpineLayoutPreset,
  type SpineOrientation,
  type StudioFontId,
} from './studio';
import { normalizeQuarterTurn, type QuarterTurnDeg } from './studioLayer';
import { clampFinite, roundTo } from './units';

export { BUILT_IN_DESIGN_PRESETS };

export interface DesignPresetSpineStyle {
  readonly layout: SpineLayoutPreset;
  readonly orientation: SpineOrientation;
  readonly authorOrientation: AuthorOrientation;
  readonly fontId: StudioFontId;
  readonly fontSizePt: number;
  readonly textColor: string;
}

export interface NormalizedTextTemplate {
  readonly text: string;
  readonly zone: CoverElementZone;
  /** Horizontal anchor position normalized 0..1 within target board rect */
  readonly relX: number;
  /** Vertical anchor position normalized 0..1 within target board rect */
  readonly relY: number;
  readonly fontId: StudioFontId;
  readonly fontSizePt: number;
  readonly letterSpacingEm: number;
  readonly lineHeight: number;
  readonly align: TextAlign;
  readonly color: string;
  readonly uppercase?: boolean;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly rotationDeg?: QuarterTurnDeg;
  readonly role?: CoverTextSemanticRole;
  readonly layoutConstraint?: LayerLayoutConstraint;
}

export interface NormalizedOrnamentTemplate {
  readonly presetId: ClassicOrnamentId;
  readonly zone: CoverElementZone;
  /** Top-left X normalized 0..1 within target board rect */
  readonly relX: number;
  /** Top-left Y normalized 0..1 within target board rect */
  readonly relY: number;
  /** Width normalized 0..1 relative to target board rect width */
  readonly relW: number;
  /** Height normalized 0..1 relative to target board rect height */
  readonly relH: number;
  readonly color: string;
  readonly strokeWidthMm: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly rotationDeg?: QuarterTurnDeg;
  readonly customSvgName?: string;
  readonly customSvgPaths?: readonly string[];
  readonly customSvgViewBox?: { readonly width: number; readonly height: number };
  readonly customSvgRenderMode?: CustomSvgRenderMode;
  readonly layoutConstraint?: LayerLayoutConstraint;
}

export interface CoverDesignPreset {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly isBuiltIn?: boolean;
  readonly description?: string;
  readonly frontBgColor: string;
  readonly spineBgColor: string;
  readonly backBgColor: string;
  readonly pocketBgColor: string;
  readonly spineStyle: DesignPresetSpineStyle;
  readonly textTemplates: readonly NormalizedTextTemplate[];
  readonly ornamentTemplates: readonly NormalizedOrnamentTemplate[];
}

function generateId(prefix: string): string {
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

function parseFontId(value: unknown, fallback: StudioFontId = 'eb-garamond'): StudioFontId {
  if (value === 'custom') return 'custom';
  if (typeof value === 'string' && (CURATED_FONT_IDS as readonly string[]).includes(value)) {
    return value as CuratedFontId;
  }
  return fallback;
}

function parseOrnamentId(value: unknown): ClassicOrnamentId | null {
  if (typeof value === 'string' && (CLASSIC_ORNAMENT_IDS as readonly string[]).includes(value)) {
    return value as ClassicOrnamentId;
  }
  return null;
}

function getTargetBoardRect(geometry: CaseGeometry, zone: CoverElementZone): Rect2D {
  const rect = getPanelBoardRect(computeStudioCanvasSpec(geometry), zone);
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function resolveNaturalAspectRatio(template: NormalizedOrnamentTemplate): number {
  let baseAspect = 1.0;
  if (
    template.presetId === 'custom-svg' &&
    template.customSvgViewBox &&
    template.customSvgViewBox.width > 0 &&
    template.customSvgViewBox.height > 0
  ) {
    baseAspect = Math.max(0.1, template.customSvgViewBox.width / template.customSvgViewBox.height);
  } else if (template.presetId.startsWith('divider-')) {
    baseAspect = 5.0;
  }
  const rot = normalizeQuarterTurn(template.rotationDeg);
  return rot === 90 || rot === 270 ? 1 / baseAspect : baseAspect;
}

function deserializeTextTemplate(raw: unknown): NormalizedTextTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.text !== 'string') return null;
  const role = sanitizeCoverTextRole(obj.role);
  const layoutConstraint = sanitizeLayerLayoutConstraint(obj.layoutConstraint);

  return {
    text: obj.text.slice(0, 600),
    zone: parseZone(obj.zone),
    relX: roundTo(clampFinite(obj.relX, 0.5, 0, 1), 4),
    relY: roundTo(clampFinite(obj.relY, 0.5, 0, 1), 4),
    fontId: parseFontId(obj.fontId),
    fontSizePt: roundTo(
      clampFinite(
        obj.fontSizePt,
        20,
        COVER_TEXT_BOUNDS.fontSizePt.min,
        COVER_TEXT_BOUNDS.fontSizePt.max,
      ),
      1,
    ),
    letterSpacingEm: roundTo(
      clampFinite(
        obj.letterSpacingEm,
        0,
        COVER_TEXT_BOUNDS.letterSpacingEm.min,
        COVER_TEXT_BOUNDS.letterSpacingEm.max,
      ),
      3,
    ),
    lineHeight: roundTo(
      clampFinite(
        obj.lineHeight,
        1.2,
        COVER_TEXT_BOUNDS.lineHeight.min,
        COVER_TEXT_BOUNDS.lineHeight.max,
      ),
      3,
    ),
    align: parseAlign(obj.align),
    color: parseHexColor(obj.color, '#f5efe2'),
    ...(obj.uppercase === true ? { uppercase: true } : {}),
    ...(obj.flipX === true ? { flipX: true } : {}),
    ...(obj.flipY === true ? { flipY: true } : {}),
    ...(normalizeQuarterTurn(obj.rotationDeg)
      ? { rotationDeg: normalizeQuarterTurn(obj.rotationDeg) }
      : {}),
    ...(role ? { role } : {}),
    ...(layoutConstraint ? { layoutConstraint } : {}),
  };
}

function deserializeOrnamentTemplate(raw: unknown): NormalizedOrnamentTemplate | null {
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
    Number.isFinite(rawVb.width) &&
    rawVb.width > 0 &&
    typeof rawVb.height === 'number' &&
    Number.isFinite(rawVb.height) &&
    rawVb.height > 0
      ? { width: rawVb.width, height: rawVb.height }
      : undefined;

  if (presetId === 'custom-svg' && (!customSvgPaths || customSvgPaths.length === 0)) {
    return null;
  }

  const layoutConstraint = sanitizeLayerLayoutConstraint(obj.layoutConstraint);

  return {
    presetId,
    zone: parseZone(obj.zone),
    relX: roundTo(clampFinite(obj.relX, 0.08, 0, 1), 4),
    relY: roundTo(clampFinite(obj.relY, 0.06, 0, 1), 4),
    relW: roundTo(clampFinite(obj.relW, 0.84, 0.02, 1), 4),
    relH: roundTo(clampFinite(obj.relH, 0.88, 0.02, 1), 4),
    color: parseHexColor(obj.color, '#d9b566'),
    strokeWidthMm: roundTo(
      clampFinite(
        obj.strokeWidthMm,
        0.7,
        COVER_ORNAMENT_BOUNDS.strokeWidthMm.min,
        COVER_ORNAMENT_BOUNDS.strokeWidthMm.max,
      ),
      2,
    ),
    ...(obj.flipX === true ? { flipX: true } : {}),
    ...(obj.flipY === true ? { flipY: true } : {}),
    ...(normalizeQuarterTurn(obj.rotationDeg)
      ? { rotationDeg: normalizeQuarterTurn(obj.rotationDeg) }
      : {}),
    ...(typeof obj.customSvgName === 'string' && obj.customSvgName.trim()
      ? { customSvgName: obj.customSvgName.slice(0, 120) }
      : {}),
    ...(customSvgPaths ? { customSvgPaths } : {}),
    ...(customSvgViewBox ? { customSvgViewBox } : {}),
    ...(customSvgRenderMode ? { customSvgRenderMode } : {}),
    ...(layoutConstraint ? { layoutConstraint } : {}),
  };
}

function deserializePreset(raw: unknown): CoverDesignPreset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) return null;

  const rawSpine =
    obj.spineStyle && typeof obj.spineStyle === 'object'
      ? (obj.spineStyle as Record<string, unknown>)
      : {};

  const textTemplates: NormalizedTextTemplate[] = [];
  if (Array.isArray(obj.textTemplates)) {
    for (const item of obj.textTemplates) {
      const parsed = deserializeTextTemplate(item);
      if (parsed) textTemplates.push(parsed);
    }
  }

  const ornamentTemplates: NormalizedOrnamentTemplate[] = [];
  if (Array.isArray(obj.ornamentTemplates)) {
    for (const item of obj.ornamentTemplates) {
      const parsed = deserializeOrnamentTemplate(item);
      if (parsed) ornamentTemplates.push(parsed);
    }
  }

  const createdAt =
    typeof obj.createdAt === 'string' && !Number.isNaN(Date.parse(obj.createdAt))
      ? obj.createdAt
      : new Date().toISOString();

  return {
    id:
      typeof obj.id === 'string' && obj.id.trim().length > 0
        ? obj.id.trim().slice(0, 120)
        : generateId('preset'),
    name: obj.name.trim().slice(0, 80),
    createdAt,
    ...(obj.isBuiltIn === true ? { isBuiltIn: true } : {}),
    ...(typeof obj.description === 'string' && obj.description.trim().length > 0
      ? { description: obj.description.trim().slice(0, 240) }
      : {}),
    frontBgColor: parseHexColor(obj.frontBgColor, '#1f3a52'),
    spineBgColor: parseHexColor(obj.spineBgColor, '#1f3a52'),
    backBgColor: parseHexColor(obj.backBgColor, '#1f3a52'),
    pocketBgColor: parseHexColor(obj.pocketBgColor, '#f4eee1'),
    spineStyle: {
      layout: rawSpine.layout === 'stacked' ? 'stacked' : 'inline',
      orientation:
        rawSpine.orientation === 'bottom-to-top' ? 'bottom-to-top' : 'top-to-bottom',
      authorOrientation:
        rawSpine.authorOrientation === 'horizontal' ? 'horizontal' : 'vertical',
      fontId: parseFontId(rawSpine.fontId, 'eb-garamond'),
      fontSizePt: roundTo(
        clampFinite(
          rawSpine.fontSizePt,
          18,
          STUDIO_BOUNDS.fontSizePt.min,
          STUDIO_BOUNDS.fontSizePt.max,
        ),
        1,
      ),
      textColor: parseHexColor(rawSpine.textColor, '#f5efe2'),
    },
    textTemplates,
    ornamentTemplates,
  };
}

export const CoverDesignPresetModel = {
  /**
   * Captures the active cover theme (colors, spine style, text layers, ornaments)
   * into dimension-independent normalized 0..1 coordinates relative to each target board rect.
   */
  captureFromStudio(
    name: string,
    geometry: CaseGeometry,
    studio: CoverStudioState,
  ): CoverDesignPreset {
    const cleanName = name.trim().slice(0, 80) || 'Untitled Series';

    const textTemplates: NormalizedTextTemplate[] = (studio.textLayers ?? []).map((layer) => {
      const rect = getTargetBoardRect(geometry, layer.zone);
      const layoutConstraint = cloneLayerLayoutConstraint(layer.layoutConstraint);
      return {
        text: layer.text,
        zone: layer.zone,
        relX: roundTo(clampFinite((layer.xMm - rect.x) / rect.width, 0.5, 0, 1), 4),
        relY: roundTo(clampFinite((layer.yMm - rect.y) / rect.height, 0.5, 0, 1), 4),
        fontId: layer.fontId,
        fontSizePt: layer.fontSizePt,
        letterSpacingEm: layer.letterSpacingEm,
        lineHeight: layer.lineHeight,
        align: layer.align,
        color: layer.color,
        ...(layer.uppercase ? { uppercase: true } : {}),
        ...(layer.flipX ? { flipX: true } : {}),
        ...(layer.flipY ? { flipY: true } : {}),
        ...(normalizeQuarterTurn(layer.rotationDeg)
          ? { rotationDeg: normalizeQuarterTurn(layer.rotationDeg) }
          : {}),
        ...(layer.role ? { role: layer.role } : {}),
        ...(layoutConstraint ? { layoutConstraint } : {}),
      };
    });

    const ornamentTemplates: NormalizedOrnamentTemplate[] = (studio.ornaments ?? []).map((orn) => {
      const rect = getTargetBoardRect(geometry, orn.zone);
      const layoutConstraint = cloneLayerLayoutConstraint(orn.layoutConstraint);
      return {
        presetId: orn.presetId,
        zone: orn.zone,
        relX: roundTo(clampFinite((orn.xMm - rect.x) / rect.width, 0.08, 0, 1), 4),
        relY: roundTo(clampFinite((orn.yMm - rect.y) / rect.height, 0.06, 0, 1), 4),
        relW: roundTo(clampFinite(orn.widthMm / rect.width, 0.84, 0.02, 1), 4),
        relH: roundTo(clampFinite(orn.heightMm / rect.height, 0.88, 0.02, 1), 4),
        color: orn.color,
        strokeWidthMm: orn.strokeWidthMm,
        ...(orn.flipX ? { flipX: true } : {}),
        ...(orn.flipY ? { flipY: true } : {}),
        ...(normalizeQuarterTurn(orn.rotationDeg)
          ? { rotationDeg: normalizeQuarterTurn(orn.rotationDeg) }
          : {}),
        ...(orn.customSvgName ? { customSvgName: orn.customSvgName } : {}),
        ...(orn.customSvgPaths ? { customSvgPaths: [...orn.customSvgPaths] } : {}),
        ...(orn.customSvgViewBox ? { customSvgViewBox: { ...orn.customSvgViewBox } } : {}),
        ...(orn.customSvgRenderMode ? { customSvgRenderMode: orn.customSvgRenderMode } : {}),
        ...(layoutConstraint ? { layoutConstraint } : {}),
      };
    });

    return {
      id: generateId('preset'),
      name: cleanName,
      createdAt: new Date().toISOString(),
      frontBgColor: studio.frontBgColor,
      spineBgColor: studio.spineBgColor,
      backBgColor: studio.backBgColor,
      pocketBgColor: studio.pocketStyle.backgroundColor,
      spineStyle: {
        layout: studio.spineText.layout,
        orientation: studio.spineText.orientation,
        authorOrientation: studio.spineText.authorOrientation,
        fontId: studio.spineText.fontId,
        fontSizePt: studio.spineText.fontSizePt,
        textColor: studio.spineText.textColor,
      },
      textTemplates,
      ornamentTemplates,
    };
  },

  /**
   * Applies a dimension-independent design preset onto any target book geometry,
   * preserving the target book's existing spine title, spine author, and uploaded artwork layers.
   */
  applyToStudio(
    preset: CoverDesignPreset,
    geometry: CaseGeometry,
    currentStudio: CoverStudioState,
  ): CoverStudioState {
    const textLayers: CoverTextLayer[] = preset.textTemplates.map((tpl) => {
      const rect = getTargetBoardRect(geometry, tpl.zone);
      const fontScale = preset.isBuiltIn ? clampFinite(rect.width / 140, 1, 0.72, 1.2) : 1;
      const fontSizePt = roundTo(
        clampFinite(
          tpl.fontSizePt * fontScale,
          tpl.fontSizePt,
          COVER_TEXT_BOUNDS.fontSizePt.min,
          COVER_TEXT_BOUNDS.fontSizePt.max,
        ),
        1,
      );

      return {
        id: generateId('txt'),
        text: tpl.text,
        zone: tpl.zone,
        xMm: roundTo(rect.x + tpl.relX * rect.width, 2),
        yMm: roundTo(rect.y + tpl.relY * rect.height, 2),
        fontId: tpl.fontId,
        fontSizePt,
        letterSpacingEm: tpl.letterSpacingEm,
        lineHeight: tpl.lineHeight,
        align: tpl.align,
        color: tpl.color,
        ...(tpl.uppercase ? { uppercase: true } : {}),
        ...(tpl.flipX ? { flipX: true } : {}),
        ...(tpl.flipY ? { flipY: true } : {}),
        ...(normalizeQuarterTurn(tpl.rotationDeg)
          ? { rotationDeg: normalizeQuarterTurn(tpl.rotationDeg) }
          : {}),
      };
    });

    const ornaments: CoverOrnamentLayer[] = preset.ornamentTemplates.map((tpl) => {
      const rect = getTargetBoardRect(geometry, tpl.zone);
      const mappedX = rect.x + tpl.relX * rect.width;
      const mappedY = rect.y + tpl.relY * rect.height;
      const mappedW = tpl.relW * rect.width;
      const mappedH = tpl.relH * rect.height;

      let xMm: number;
      let yMm: number;
      let widthMm: number;
      let heightMm: number;

      if (isBoxMappedOrnament(tpl.presetId)) {
        widthMm = clampFinite(
          mappedW,
          mappedW,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.maxSizeMm,
        );
        heightMm = clampFinite(
          mappedH,
          mappedH,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.maxSizeMm,
        );
        xMm = mappedX + (mappedW - widthMm) / 2;
        yMm = mappedY + (mappedH - heightMm) / 2;
      } else {
        const aspect = resolveNaturalAspectRatio(tpl);
        widthMm = mappedW;
        heightMm = widthMm / aspect;
        if (heightMm > mappedH) {
          heightMm = mappedH;
          widthMm = heightMm * aspect;
        }
        if (heightMm < COVER_ORNAMENT_BOUNDS.minSizeMm) {
          heightMm = COVER_ORNAMENT_BOUNDS.minSizeMm;
          widthMm = Math.min(COVER_ORNAMENT_BOUNDS.maxSizeMm, heightMm * aspect);
        }
        if (widthMm < COVER_ORNAMENT_BOUNDS.minSizeMm) {
          widthMm = COVER_ORNAMENT_BOUNDS.minSizeMm;
          heightMm = Math.min(COVER_ORNAMENT_BOUNDS.maxSizeMm, widthMm / aspect);
        }
        widthMm = clampFinite(
          widthMm,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.maxSizeMm,
        );
        heightMm = clampFinite(
          heightMm,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.minSizeMm,
          COVER_ORNAMENT_BOUNDS.maxSizeMm,
        );
        const cx = mappedX + mappedW / 2;
        const cy = mappedY + mappedH / 2;
        xMm = cx - widthMm / 2;
        yMm = cy - heightMm / 2;
      }

      return {
        id: generateId(tpl.presetId === 'custom-svg' ? 'svg' : 'orn'),
        presetId: tpl.presetId,
        zone: tpl.zone,
        xMm: roundTo(xMm, 2),
        yMm: roundTo(yMm, 2),
        widthMm: roundTo(widthMm, 2),
        heightMm: roundTo(heightMm, 2),
        color: tpl.color,
        strokeWidthMm: tpl.strokeWidthMm,
        ...(tpl.flipX ? { flipX: true } : {}),
        ...(tpl.flipY ? { flipY: true } : {}),
        ...(normalizeQuarterTurn(tpl.rotationDeg)
          ? { rotationDeg: normalizeQuarterTurn(tpl.rotationDeg) }
          : {}),
        ...(tpl.customSvgName ? { customSvgName: tpl.customSvgName } : {}),
        ...(tpl.customSvgPaths ? { customSvgPaths: [...tpl.customSvgPaths] } : {}),
        ...(tpl.customSvgViewBox ? { customSvgViewBox: { ...tpl.customSvgViewBox } } : {}),
        ...(tpl.customSvgRenderMode ? { customSvgRenderMode: tpl.customSvgRenderMode } : {}),
      };
    });

    return {
      ...currentStudio,
      frontBgColor: preset.frontBgColor,
      spineBgColor: preset.spineBgColor,
      backBgColor: preset.backBgColor,
      pocketStyle: {
        ...currentStudio.pocketStyle,
        backgroundColor: preset.pocketBgColor,
      },
      spineText: {
        ...currentStudio.spineText,
        layout: preset.spineStyle.layout,
        orientation: preset.spineStyle.orientation,
        authorOrientation: preset.spineStyle.authorOrientation,
        fontId: preset.spineStyle.fontId,
        fontSizePt: preset.spineStyle.fontSizePt,
        textColor: preset.spineStyle.textColor,
      },
      textLayers,
      ornaments,
    };
  },

  serializeList(presets: readonly CoverDesignPreset[]): string {
    const clean = presets.map((preset) => ({
      ...preset,
      spineStyle: { ...preset.spineStyle },
      textTemplates: preset.textTemplates.map((t) => {
        const layoutConstraint = cloneLayerLayoutConstraint(t.layoutConstraint);
        return {
          ...t,
          ...(layoutConstraint ? { layoutConstraint } : {}),
        };
      }),
      ornamentTemplates: preset.ornamentTemplates.map((o) => {
        const layoutConstraint = cloneLayerLayoutConstraint(o.layoutConstraint);
        return {
          ...o,
          ...(o.customSvgPaths ? { customSvgPaths: [...o.customSvgPaths] } : {}),
          ...(o.customSvgViewBox ? { customSvgViewBox: { ...o.customSvgViewBox } } : {}),
          ...(layoutConstraint ? { layoutConstraint } : {}),
        };
      }),
    }));
    return JSON.stringify(clean);
  },

  deserializeList(raw: unknown): CoverDesignPreset[] {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
    }

    let list: unknown[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as Record<string, unknown>).presets)
    ) {
      list = (parsed as Record<string, unknown>).presets as unknown[];
    } else if (parsed && typeof parsed === 'object') {
      const single = deserializePreset(parsed);
      return single ? [single] : [];
    } else {
      return [];
    }

    const seenIds = new Set<string>();
    const result: CoverDesignPreset[] = [];
    for (const item of list) {
      const preset = deserializePreset(item);
      if (!preset) continue;
      let id = preset.id;
      if (seenIds.has(id)) {
        id = generateId('preset');
      }
      seenIds.add(id);
      result.push(id === preset.id ? preset : { ...preset, id });
    }
    return result;
  },
} as const;
