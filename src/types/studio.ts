import { parseHexColor } from '@/lib/color';
import { ENDPAPER_SWATCHES } from '@/resources/palettes';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from './coverElements';
import {
  CoverImageLayerModel,
  type CoverImageLayer,
} from './studioLayer';
import { UnitConverter, clampFinite, roundTo } from './units';

export { ENDPAPER_SWATCHES };

export type SpineLayoutPreset = 'inline' | 'stacked';
export type SpineOrientation = 'top-to-bottom' | 'bottom-to-top';
export type AuthorOrientation = 'vertical' | 'horizontal';
export type CutLineExportMode = 'full-cut-miter' | 'bleed-registration';
export type PocketImageFitMode = 'cover' | 'contain' | 'tile';
export type PocketStyleScope = 'faces-only' | 'full-envelope';

export interface PocketStyleConfig {
  /** Base endpaper fill color for inner pockets and spine liner */
  backgroundColor: string;
  /** Free-form draggable & resizable artwork layers positioned in the 1:1 mm Inner Pockets layout */
  layers: readonly CoverImageLayer[];
  /** Optional tiled/background custom endpaper picture/pattern (data URL) */
  imageDataUrl: string | null;
  imageFileName: string | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  imageFitMode: PocketImageFitMode;
  /** Relative scale multiplier (0.25 to 2.5) for tile or background pattern sizing */
  imageScale: number;
  /** Image blend opacity over backgroundColor (0.1 to 1.0) */
  imageOpacity: number;
  /** Whether styling fills only visible pocket faces (leaving white glue flaps) or the full cut envelope */
  styleScope: PocketStyleScope;
}

export const CURATED_FONT_IDS = [
  'eb-garamond',
  'libre-baskerville',
  'cormorant-garamond',
  'lora',
  'playfair-display',
  'fraunces',
  'inter',
  'montserrat',
  'bricolage-grotesque',
  'cinzel-decorative',
  'almendra-display',
  'uncial-antiqua',
  'orbitron',
  'audiowide',
  'syne',
  'unifrakturmaguntia',
  'pirata-one',
  'great-vibes',
  'pinyon-script',
  'bebas-neue',
  'special-elite',
  'poiret-one',
  'limelight',
] as const;

export type CuratedFontId = (typeof CURATED_FONT_IDS)[number];

export type StudioFontId = CuratedFontId | 'custom';

export interface SpineTypographyConfig {
  title: string;
  author: string;
  layout: SpineLayoutPreset;
  orientation: SpineOrientation;
  /** Vertical (follows spine direction) vs Horizontal (classic tail-end author block) */
  authorOrientation: AuthorOrientation;
  fontId: StudioFontId;
  customFontName: string | null;
  /** Desired font size in points (automatically clamped against spine width) */
  fontSizePt: number;
  textColor: string;
  /** Optical horizontal nudge across spine width in mm (-2.0 to +2.0 mm) */
  opticalNudgeMm: number;
}

export interface CoverStudioState {
  /** Free-form stack of uploaded artwork images rendered bottom-to-top */
  layers: readonly CoverImageLayer[];
  /** Draggable Front/Back/Spine cover text layers (rendered in 2D, 3D, PDF, and Cricut HTV) */
  textLayers: readonly CoverTextLayer[];
  /** Parametric classic bookbindery vector ornaments & frames (recolorable & Cricut HTV-ready) */
  ornaments: readonly CoverOrnamentLayer[];
  /** Optional unified bottom-to-top stacking order of element IDs across layers, ornaments, and textLayers */
  readonly layerOrder?: readonly string[];
  frontBgColor: string;
  spineBgColor: string;
  backBgColor: string;
  spineText: SpineTypographyConfig;
  cutLineMode: CutLineExportMode;
  /** Styling configuration for the Inner Pockets & Spine Liner */
  pocketStyle: PocketStyleConfig;
}

export const STUDIO_BOUNDS = {
  fontSizePt: { min: 6, max: 72 },
  opticalNudgeMm: { min: -2.0, max: 2.0 },
  spineSafeMarginMm: 4.0,
  pocketImageScale: { min: 0.25, max: 2.5 },
  pocketImageOpacity: { min: 0.1, max: 1.0 },
} as const;

export const DEFAULT_POCKET_STYLE: Readonly<PocketStyleConfig> = {
  backgroundColor: '#f4eee1',
  layers: [],
  imageDataUrl: null,
  imageFileName: null,
  imageNaturalWidth: 0,
  imageNaturalHeight: 0,
  imageFitMode: 'cover',
  imageScale: 1,
  imageOpacity: 1,
  styleScope: 'faces-only',
};

export const DEFAULT_COVER_STUDIO_STATE: Readonly<CoverStudioState> = {
  layers: [],
  textLayers: [],
  ornaments: [],
  frontBgColor: '#1f3a52',
  spineBgColor: '#1f3a52',
  backBgColor: '#1f3a52',
  spineText: {
    title: '',
    author: '',
    layout: 'inline',
    orientation: 'top-to-bottom',
    authorOrientation: 'vertical',
    fontId: 'eb-garamond',
    customFontName: null,
    fontSizePt: 18,
    textColor: '#f5efe2',
    opticalNudgeMm: 0,
  },
  cutLineMode: 'full-cut-miter',
  pocketStyle: { ...DEFAULT_POCKET_STYLE },
};

function parseFontId(value: unknown): StudioFontId {
  if (value === 'custom') return 'custom';
  if (typeof value === 'string' && (CURATED_FONT_IDS as readonly string[]).includes(value)) {
    return value as CuratedFontId;
  }
  return DEFAULT_COVER_STUDIO_STATE.spineText.fontId;
}

function sanitizeLayerOrder(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    cleaned.push(id);
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export const CoverStudioModel = {
  createDefault(): CoverStudioState {
    return {
      ...DEFAULT_COVER_STUDIO_STATE,
      layers: [],
      textLayers: [],
      ornaments: [],
      spineText: { ...DEFAULT_COVER_STUDIO_STATE.spineText },
      pocketStyle: { ...DEFAULT_POCKET_STYLE },
    };
  },

  /**
   * Maximum allowed spine text size in pt so text height never exceeds
   * `spineWidthMm - 4.0 mm` (keeping typography safely out of the 9 mm hinges).
   */
  maxSpineFontSizePt(spineWidthMm: number): number {
    const usableMm = Math.max(2.1, spineWidthMm - STUDIO_BOUNDS.spineSafeMarginMm);
    const maxPt = UnitConverter.mmToPoints(usableMm);
    return roundTo(
      Math.min(STUDIO_BOUNDS.fontSizePt.max, Math.max(STUDIO_BOUNDS.fontSizePt.min, maxPt)),
      1,
    );
  },

  effectiveSpineFontSizePt(requestedPt: number, spineWidthMm: number): number {
    const maxPt = this.maxSpineFontSizePt(spineWidthMm);
    return roundTo(Math.min(maxPt, Math.max(STUDIO_BOUNDS.fontSizePt.min, requestedPt)), 1);
  },

  formatInlineSpineText(title: string, author: string): string {
    const cleanTitle = title.trim();
    const cleanAuthor = author.trim();
    if (cleanTitle && cleanAuthor) return `${cleanTitle}  —  ${cleanAuthor}`;
    return cleanTitle || cleanAuthor;
  },

  /**
   * Splits a multi-word author name cleanly into balanced horizontal lines
   * for classic horizontal clothbound spine lettering (e.g. "JULES" / "VERNE").
   */
  splitHorizontalAuthorLines(author: string): readonly string[] {
    const trimmed = author.trim();
    if (!trimmed) return [];
    const words = trimmed.split(/\s+/);
    if (words.length === 1 || trimmed.length <= 7) {
      return [trimmed];
    }
    if (words.length === 2) {
      return [words[0], words[1]];
    }
    // Keep initials/first names together on top line, surname on bottom line
    return [words.slice(0, -1).join(' '), words[words.length - 1]];
  },

  /**
   * Clamps horizontal author font size so the widest line fits comfortably inside
   * `spineWidthMm - 4.0 mm` without spilling into the 9 mm hinge grooves.
   */
  horizontalAuthorFontSizePt(
    lines: readonly string[],
    requestedPt: number,
    spineWidthMm: number,
  ): number {
    const longestChars = Math.max(1, ...lines.map((line) => line.length));
    const usableWidthMm = Math.max(4, spineWidthMm - STUDIO_BOUNDS.spineSafeMarginMm);
    // Average proportional glyph width ~0.62 em for serif/sans caps
    const maxMmHeight = usableWidthMm / (longestChars * 0.62);
    const maxPt = UnitConverter.mmToPoints(maxMmHeight);
    return roundTo(Math.max(5.5, Math.min(requestedPt, maxPt)), 1);
  },

  serialize(state: CoverStudioState, options?: { includeImageData?: boolean }): CoverStudioState {
    const includeImageData = options?.includeImageData ?? true;
    const { layerOrder: rawLayerOrder, ...restState } = state;
    const serializedLayers = includeImageData
      ? state.layers.map((layer) => CoverImageLayerModel.serialize(layer))
      : [];
    const serializedTextLayers = (state.textLayers ?? []).map((layer) =>
      CoverTextLayerModel.serialize(layer),
    );
    const serializedOrnaments = (state.ornaments ?? []).map((orn) =>
      CoverOrnamentLayerModel.serialize(orn),
    );
    const imageIds = includeImageData ? null : new Set(state.layers.map((layer) => layer.id));
    const sanitizedOrder = sanitizeLayerOrder(rawLayerOrder);
    const filteredOrder =
      sanitizedOrder && imageIds
        ? sanitizedOrder.filter((id) => !imageIds.has(id))
        : sanitizedOrder;
    const layerOrder = filteredOrder && filteredOrder.length > 0 ? filteredOrder : undefined;

    return {
      ...restState,
      layers: serializedLayers,
      textLayers: serializedTextLayers,
      ornaments: serializedOrnaments,
      ...(layerOrder ? { layerOrder } : {}),
      spineText: { ...state.spineText },
      pocketStyle: {
        ...state.pocketStyle,
        layers: includeImageData
          ? state.pocketStyle.layers.map((layer) => CoverImageLayerModel.serialize(layer))
          : [],
        imageDataUrl: includeImageData ? state.pocketStyle.imageDataUrl : null,
        imageFileName: includeImageData ? state.pocketStyle.imageFileName : null,
      },
    };
  },

  deserialize(raw: unknown): CoverStudioState {
    const defaults = this.createDefault();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }
    const obj = raw as Record<string, unknown>;
    const rawSpine = (obj.spineText && typeof obj.spineText === 'object'
      ? obj.spineText
      : {}) as Record<string, unknown>;
    const rawPocket = (obj.pocketStyle && typeof obj.pocketStyle === 'object'
      ? obj.pocketStyle
      : {}) as Record<string, unknown>;

    const layers: CoverImageLayer[] = [];
    if (Array.isArray(obj.layers)) {
      for (const item of obj.layers) {
        const parsed = CoverImageLayerModel.deserialize(item);
        if (parsed) layers.push(parsed);
      }
    }

    const textLayers: CoverTextLayer[] = [];
    if (Array.isArray(obj.textLayers)) {
      for (const item of obj.textLayers) {
        const parsed = CoverTextLayerModel.deserialize(item);
        if (parsed) textLayers.push(parsed);
      }
    }

    const ornaments: CoverOrnamentLayer[] = [];
    if (Array.isArray(obj.ornaments)) {
      for (const item of obj.ornaments) {
        const parsed = CoverOrnamentLayerModel.deserialize(item);
        if (parsed) ornaments.push(parsed);
      }
    }

    const pocketLayers: CoverImageLayer[] = [];
    if (Array.isArray(rawPocket.layers)) {
      for (const item of rawPocket.layers) {
        const parsed = CoverImageLayerModel.deserialize(item);
        if (parsed) pocketLayers.push(parsed);
      }
    }

    const rawFitMode = rawPocket.imageFitMode;
    const imageFitMode: PocketImageFitMode =
      rawFitMode === 'contain' || rawFitMode === 'tile' ? rawFitMode : 'cover';
    const layerOrder = sanitizeLayerOrder(obj.layerOrder);

    return {
      layers,
      textLayers,
      ornaments,
      ...(layerOrder ? { layerOrder } : {}),
      frontBgColor: parseHexColor(obj.frontBgColor, defaults.frontBgColor),
      spineBgColor: parseHexColor(obj.spineBgColor, defaults.spineBgColor),
      backBgColor: parseHexColor(obj.backBgColor, defaults.backBgColor),
      spineText: {
        title: typeof rawSpine.title === 'string' ? rawSpine.title : '',
        author: typeof rawSpine.author === 'string' ? rawSpine.author : '',
        layout: rawSpine.layout === 'stacked' ? 'stacked' : 'inline',
        orientation:
          rawSpine.orientation === 'bottom-to-top' ? 'bottom-to-top' : 'top-to-bottom',
        authorOrientation:
          rawSpine.authorOrientation === 'horizontal' ? 'horizontal' : 'vertical',
        fontId: parseFontId(rawSpine.fontId),
        customFontName: typeof rawSpine.customFontName === 'string' ? rawSpine.customFontName : null,
        fontSizePt: clampFinite(
          rawSpine.fontSizePt,
          defaults.spineText.fontSizePt,
          STUDIO_BOUNDS.fontSizePt.min,
          STUDIO_BOUNDS.fontSizePt.max,
        ),
        textColor: parseHexColor(rawSpine.textColor, defaults.spineText.textColor),
        opticalNudgeMm: clampFinite(
          rawSpine.opticalNudgeMm,
          0,
          STUDIO_BOUNDS.opticalNudgeMm.min,
          STUDIO_BOUNDS.opticalNudgeMm.max,
        ),
      },
      cutLineMode: obj.cutLineMode === 'bleed-registration' ? 'bleed-registration' : 'full-cut-miter',
      pocketStyle: {
        backgroundColor: parseHexColor(
          rawPocket.backgroundColor,
          DEFAULT_POCKET_STYLE.backgroundColor,
        ),
        layers: pocketLayers,
        imageDataUrl:
          typeof rawPocket.imageDataUrl === 'string' && rawPocket.imageDataUrl.startsWith('data:image/')
            ? rawPocket.imageDataUrl
            : null,
        imageFileName: typeof rawPocket.imageFileName === 'string' ? rawPocket.imageFileName : null,
        imageNaturalWidth: clampFinite(rawPocket.imageNaturalWidth, 0, 0, 20000),
        imageNaturalHeight: clampFinite(rawPocket.imageNaturalHeight, 0, 0, 20000),
        imageFitMode,
        imageScale: clampFinite(
          rawPocket.imageScale,
          DEFAULT_POCKET_STYLE.imageScale,
          STUDIO_BOUNDS.pocketImageScale.min,
          STUDIO_BOUNDS.pocketImageScale.max,
        ),
        imageOpacity: clampFinite(
          rawPocket.imageOpacity,
          DEFAULT_POCKET_STYLE.imageOpacity,
          STUDIO_BOUNDS.pocketImageOpacity.min,
          STUDIO_BOUNDS.pocketImageOpacity.max,
        ),
        styleScope:
          rawPocket.styleScope === 'full-envelope' ? 'full-envelope' : 'faces-only',
      },
    };
  },
} as const;
