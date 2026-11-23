import {
  CoverImageLayerModel,
  type CoverImageLayer,
} from './studioLayer';
import { UnitConverter, clampFinite, roundTo } from './units';

export type SpineLayoutPreset = 'inline' | 'stacked';
export type SpineOrientation = 'top-to-bottom' | 'bottom-to-top';
export type AuthorOrientation = 'vertical' | 'horizontal';
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
  frontBgColor: string;
  spineBgColor: string;
  backBgColor: string;
  spineText: SpineTypographyConfig;
  cutLineMode: CutLineExportMode;
}

export const STUDIO_BOUNDS = {
  fontSizePt: { min: 6, max: 72 },
  opticalNudgeMm: { min: -2.0, max: 2.0 },
  spineSafeMarginMm: 4.0,
} as const;

export const DEFAULT_COVER_STUDIO_STATE: Readonly<CoverStudioState> = {
  layers: [],
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

export const CoverStudioModel = {
  createDefault(): CoverStudioState {
    return {
      ...DEFAULT_COVER_STUDIO_STATE,
      layers: [],
      spineText: { ...DEFAULT_COVER_STUDIO_STATE.spineText },
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
    return {
      ...state,
      layers: includeImageData ? state.layers.map((layer) => ({ ...layer })) : [],
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

    const layers: CoverImageLayer[] = [];
    if (Array.isArray(obj.layers)) {
      for (const item of obj.layers) {
        const parsed = CoverImageLayerModel.deserialize(item);
        if (parsed) layers.push(parsed);
      }
    }

    return {
      layers,
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
      cutLineMode: obj.cutLineMode === 'full-cut-miter' ? 'full-cut-miter' : 'bleed-registration',
    };
  },
} as const;
