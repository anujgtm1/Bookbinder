import { UnitConverter, clampFinite, roundTo } from './units';

export type CoverZoneId = 'front' | 'spine' | 'back';
export type CoverImageSlot = CoverZoneId | 'fullWrap';
export type CoverImageMode = 'per-zone' | 'full-wrap';
export type SpineLayoutPreset = 'inline' | 'stacked';
export type SpineOrientation = 'top-to-bottom' | 'bottom-to-top';
export type CutLineExportMode = 'full-cut-miter' | 'bleed-registration';

export type CuratedFontId =
  | 'eb-garamond'
  | 'libre-baskerville'
  | 'cormorant-garamond'
  | 'lora'
  | 'inter'
  | 'montserrat';

export type StudioFontId = CuratedFontId | 'custom';

export const CURATED_FONT_IDS: readonly CuratedFontId[] = [
  'eb-garamond',
  'libre-baskerville',
  'cormorant-garamond',
  'lora',
  'inter',
  'montserrat',
] as const;

export const COVER_ZONES: readonly { readonly id: CoverZoneId; readonly label: string }[] = [
  { id: 'front', label: 'Front Cover' },
  { id: 'spine', label: 'Spine' },
  { id: 'back', label: 'Back Cover' },
] as const;

export interface CoverImagePlacement {
  dataUrl: string | null;
  fileName: string | null;
  naturalWidth: number;
  naturalHeight: number;
  /** Scale multiplier relative to cover-fit (1.0 = cover-fill target zone) */
  zoom: number;
  /** Horizontal pan offset in physical mm */
  offsetXMm: number;
  /** Vertical pan offset in physical mm */
  offsetYMm: number;
}

export interface CoverZoneImages {
  front: CoverImagePlacement;
  spine: CoverImagePlacement;
  back: CoverImagePlacement;
  fullWrap: CoverImagePlacement;
}

export interface SpineTypographyConfig {
  title: string;
  author: string;
  layout: SpineLayoutPreset;
  orientation: SpineOrientation;
  fontId: StudioFontId;
  customFontName: string | null;
  /** Desired font size in points (automatically clamped against spine width) */
  fontSizePt: number;
  textColor: string;
  /** Optical horizontal nudge across spine width in mm (-2.0 to +2.0 mm) */
  opticalNudgeMm: number;
}

export interface CoverStudioState {
  imageMode: CoverImageMode;
  images: CoverZoneImages;
  frontBgColor: string;
  spineBgColor: string;
  backBgColor: string;
  spineText: SpineTypographyConfig;
  cutLineMode: CutLineExportMode;
}

export const STUDIO_BOUNDS = {
  zoom: { min: 0.25, max: 5.0 },
  offsetMm: { min: -300, max: 300 },
  fontSizePt: { min: 6, max: 72 },
  opticalNudgeMm: { min: -2.0, max: 2.0 },
  spineSafeMarginMm: 4.0,
} as const;

export const EMPTY_IMAGE_PLACEMENT: Readonly<CoverImagePlacement> = {
  dataUrl: null,
  fileName: null,
  naturalWidth: 0,
  naturalHeight: 0,
  zoom: 1.0,
  offsetXMm: 0,
  offsetYMm: 0,
};

export const DEFAULT_COVER_STUDIO_STATE: Readonly<CoverStudioState> = {
  imageMode: 'per-zone',
  images: {
    front: { ...EMPTY_IMAGE_PLACEMENT },
    spine: { ...EMPTY_IMAGE_PLACEMENT },
    back: { ...EMPTY_IMAGE_PLACEMENT },
    fullWrap: { ...EMPTY_IMAGE_PLACEMENT },
  },
  frontBgColor: '#1f3a52',
  spineBgColor: '#1f3a52',
  backBgColor: '#1f3a52',
  spineText: {
    title: '',
    author: '',
    layout: 'inline',
    orientation: 'top-to-bottom',
    fontId: 'eb-garamond',
    customFontName: null,
    fontSizePt: 18,
    textColor: '#f5efe2',
    opticalNudgeMm: 0,
  },
  cutLineMode: 'bleed-registration',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function parseHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback;
}

function parseFontId(value: unknown): StudioFontId {
  if (value === 'custom') return 'custom';
  if (typeof value === 'string' && (CURATED_FONT_IDS as readonly string[]).includes(value)) {
    return value as CuratedFontId;
  }
  return DEFAULT_COVER_STUDIO_STATE.spineText.fontId;
}

function deserializeImagePlacement(raw: unknown): CoverImagePlacement {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_IMAGE_PLACEMENT };
  }
  const obj = raw as Record<string, unknown>;
  return {
    dataUrl:
      typeof obj.dataUrl === 'string' && obj.dataUrl.startsWith('data:image/')
        ? obj.dataUrl
        : null,
    fileName: typeof obj.fileName === 'string' ? obj.fileName : null,
    naturalWidth:
      typeof obj.naturalWidth === 'number' && obj.naturalWidth > 0 ? obj.naturalWidth : 0,
    naturalHeight:
      typeof obj.naturalHeight === 'number' && obj.naturalHeight > 0 ? obj.naturalHeight : 0,
    zoom: clampFinite(
      obj.zoom,
      EMPTY_IMAGE_PLACEMENT.zoom,
      STUDIO_BOUNDS.zoom.min,
      STUDIO_BOUNDS.zoom.max,
    ),
    offsetXMm: clampFinite(
      obj.offsetXMm,
      0,
      STUDIO_BOUNDS.offsetMm.min,
      STUDIO_BOUNDS.offsetMm.max,
    ),
    offsetYMm: clampFinite(
      obj.offsetYMm,
      0,
      STUDIO_BOUNDS.offsetMm.min,
      STUDIO_BOUNDS.offsetMm.max,
    ),
  };
}

function serializeImagePlacement(
  img: CoverImagePlacement,
  includeImageData: boolean,
): CoverImagePlacement {
  return {
    ...img,
    dataUrl: includeImageData ? img.dataUrl : null,
  };
}

export const CoverStudioModel = {
  createEmptyImage(): CoverImagePlacement {
    return { ...EMPTY_IMAGE_PLACEMENT };
  },

  createDefault(): CoverStudioState {
    return {
      ...DEFAULT_COVER_STUDIO_STATE,
      images: {
        front: { ...EMPTY_IMAGE_PLACEMENT },
        spine: { ...EMPTY_IMAGE_PLACEMENT },
        back: { ...EMPTY_IMAGE_PLACEMENT },
        fullWrap: { ...EMPTY_IMAGE_PLACEMENT },
      },
      spineText: { ...DEFAULT_COVER_STUDIO_STATE.spineText },
    };
  },

  hasAnyActiveImage(state: CoverStudioState): boolean {
    if (state.imageMode === 'full-wrap') {
      return state.images.fullWrap.dataUrl !== null;
    }
    return (
      state.images.front.dataUrl !== null ||
      state.images.spine.dataUrl !== null ||
      state.images.back.dataUrl !== null
    );
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

  serialize(state: CoverStudioState, options?: { includeImageData?: boolean }): CoverStudioState {
    const includeImageData = options?.includeImageData ?? true;
    return {
      ...state,
      images: {
        front: serializeImagePlacement(state.images.front, includeImageData),
        spine: serializeImagePlacement(state.images.spine, includeImageData),
        back: serializeImagePlacement(state.images.back, includeImageData),
        fullWrap: serializeImagePlacement(state.images.fullWrap, includeImageData),
      },
      spineText: { ...state.spineText },
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

    const imageMode: CoverImageMode = obj.imageMode === 'full-wrap' ? 'full-wrap' : 'per-zone';

    // Support current `images` map AND transparently migrate legacy single `image` projects
    let images: CoverZoneImages;
    if (obj.images && typeof obj.images === 'object') {
      const rawImages = obj.images as Record<string, unknown>;
      images = {
        front: deserializeImagePlacement(rawImages.front),
        spine: deserializeImagePlacement(rawImages.spine),
        back: deserializeImagePlacement(rawImages.back),
        fullWrap: deserializeImagePlacement(rawImages.fullWrap),
      };
    } else if (obj.image && typeof obj.image === 'object') {
      const legacy = deserializeImagePlacement(obj.image);
      images = {
        front: imageMode === 'per-zone' ? legacy : { ...EMPTY_IMAGE_PLACEMENT },
        spine: { ...EMPTY_IMAGE_PLACEMENT },
        back: { ...EMPTY_IMAGE_PLACEMENT },
        fullWrap: imageMode === 'full-wrap' ? legacy : { ...EMPTY_IMAGE_PLACEMENT },
      };
    } else {
      images = defaults.images;
    }

    return {
      imageMode,
      images,
      frontBgColor: parseHexColor(obj.frontBgColor, defaults.frontBgColor),
      spineBgColor: parseHexColor(obj.spineBgColor, defaults.spineBgColor),
      backBgColor: parseHexColor(obj.backBgColor, defaults.backBgColor),
      spineText: {
        title: typeof rawSpine.title === 'string' ? rawSpine.title : '',
        author: typeof rawSpine.author === 'string' ? rawSpine.author : '',
        layout: rawSpine.layout === 'stacked' ? 'stacked' : 'inline',
        orientation:
          rawSpine.orientation === 'bottom-to-top' ? 'bottom-to-top' : 'top-to-bottom',
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
      cutLineMode: obj.cutLineMode === 'full-cut-miter' ? 'full-cut-miter' : 'bleed-registration',
    };
  },
} as const;
