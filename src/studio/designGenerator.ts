import { resolveBindingStrategy } from '@/core/bindingStyles';
import { contrastRatio, parseHexColor, parseHexRgb, relativeLuminance } from '@/lib/color';
import {
  COMPOSITION_ARCHETYPES,
  CONCRETE_DESIGN_GENRE_IDS,
  getGenreProfile,
  type CompositionArchetypeId,
  type ConcreteDesignGenreId,
  type DesignGenreId,
} from '@/resources/generatorProfiles';
import type { ProceduralArtworkId } from '@/resources/proceduralArtworks';
import {
  COVER_ORNAMENT_BOUNDS,
  COVER_TEXT_BOUNDS,
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  type ClassicOrnamentId,
  type CoverOrnamentLayer,
  type CoverTextLayer,
  type TextAlign,
} from '@/types/coverElements';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverTextSemanticRole, LayerLayoutConstraint } from '@/types/layoutConstraints';
import {
  CoverStudioModel,
  STUDIO_BOUNDS,
  type CoverStudioState,
  type CuratedFontId,
  type SpineLayoutPreset,
  type StudioFontId,
} from '@/types/studio';
import { CoverImageLayerModel, type CoverImageLayer, type LayerClipZone } from '@/types/studioLayer';
import { UnitConverter, clampFinite, roundTo } from '@/types/units';
import { computeStudioCanvasSpec, type StudioCanvasSpec } from './canvasSpec';
import { getCuratedFont } from './fonts';
import { resolveOrnamentLayerConstraint, resolveTextLayerConstraint } from './layoutConstraints';
import { createMulberry32, createProceduralArtworkAsset } from './proceduralArtwork';

export interface DesignGeneratorLocks {
  readonly lockTextContent: boolean;
  readonly lockPalette: boolean;
  readonly lockFonts: boolean;
  readonly lockOrnaments: boolean;
  readonly lockBackground: boolean;
}

export const DEFAULT_DESIGN_GENERATOR_LOCKS: Readonly<DesignGeneratorLocks> = {
  lockTextContent: true,
  lockPalette: false,
  lockFonts: false,
  lockOrnaments: false,
  lockBackground: false,
};

export interface DesignGeneratorOptions {
  readonly genre: DesignGenreId;
  readonly seed: number;
  readonly includeBackgroundArt: boolean;
  readonly locks: DesignGeneratorLocks;
}

export interface GeneratedDesignSummary {
  readonly genreId: ConcreteDesignGenreId;
  readonly genreLabel: string;
  readonly archetypeId: CompositionArchetypeId;
  readonly archetypeLabel: string;
  readonly paletteName: string;
  readonly titleFontId: CuratedFontId;
  readonly authorFontId: CuratedFontId;
  readonly spineFontId: CuratedFontId;
  readonly artworkId: ProceduralArtworkId | null;
  readonly seed: number;
}

export interface GeneratedDesignResult {
  readonly studio: CoverStudioState;
  readonly summary: GeneratedDesignSummary;
}

const LIGHT_CONTRAST_CANDIDATES = ['#f6f0e4', '#e6c97a', '#d9b566', '#dce2ea', '#ffffff'] as const;
const DARK_CONTRAST_CANDIDATES = ['#181615', '#0f172a', '#000000'] as const;

type SpineDecorationArchetype =
  | 'head-tail-emblems'
  | 'title-cartouche'
  | 'classic-bands'
  | 'head-tail-rules-with-emblem';

const SPINE_DECORATION_ARCHETYPES: readonly SpineDecorationArchetype[] = [
  'head-tail-emblems',
  'title-cartouche',
  'classic-bands',
  'head-tail-rules-with-emblem',
];

/**
 * Guarantees WCAG contrast `>= minRatio` between a preferred foreground foil/ink hex and a background hex,
 * falling back through curated bookbinding foils & archival inks before `#ffffff` / `#000000`.
 */
export function ensureAccessibleTextColor(
  preferredHex: string,
  bgHex: string,
  minRatio: number,
): string {
  const safeBg = parseHexColor(bgHex, '#1f3a52');
  const safePref = parseHexColor(preferredHex, '#f6f0e4');
  const prefRatio = contrastRatio(safePref, safeBg) ?? 1;
  if (prefRatio >= minRatio) {
    return safePref;
  }

  const bgRgb = parseHexRgb(safeBg);
  const isLightBg = bgRgb ? relativeLuminance(bgRgb) > 0.35 : false;
  const orderedCandidates = isLightBg
    ? [...DARK_CONTRAST_CANDIDATES, ...LIGHT_CONTRAST_CANDIDATES]
    : [...LIGHT_CONTRAST_CANDIDATES, ...DARK_CONTRAST_CANDIDATES];

  let bestHex = safePref;
  let bestRatio = prefRatio;

  for (const candidate of orderedCandidates) {
    const ratio = contrastRatio(candidate, safeBg) ?? 1;
    if (ratio >= minRatio) {
      return candidate;
    }
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestHex = candidate;
    }
  }

  return bestHex;
}

/** Wraps multi-word titles (> 14 chars) cleanly onto 2–3 visually balanced lines. */
export function wrapTitleIntoBalancedLines(rawTitle: string, maxCharsPerLine = 15): string {
  const normalized = rawTitle.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length <= 14 || rawTitle.includes('\n')) {
    return rawTitle.trim();
  }

  const words = normalized.split(' ');
  if (words.length <= 1) {
    return normalized;
  }

  const targetLineCount = normalized.length > maxCharsPerLine * 2 ? 3 : 2;
  const targetLen = Math.ceil(normalized.length / targetLineCount);
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    const remainingLines = targetLineCount - lines.length - 1;
    if (remainingLines > 0 && candidate.length > targetLen && current.length >= 3) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.join('\n');
}

function pickOne<T>(items: readonly T[], rng: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}

function makeDeterministicId(prefix: string, seed: number, index: number): string {
  const hash = (((seed * 2654435761) ^ (index * 2246822519)) >>> 0).toString(36);
  return `${prefix}-muse-${hash}-${index}`;
}

function resolveFontCasingAndTracking(
  fontId: StudioFontId,
  text: string,
  preferUppercase: boolean,
  desiredTrackingEm: number,
): { readonly uppercase: true | undefined; readonly letterSpacingEm: number } {
  if (fontId === 'custom') {
    return {
      uppercase: preferUppercase ? true : undefined,
      letterSpacingEm: roundTo(clampFinite(desiredTrackingEm, 0, -0.05, 0.4), 3),
    };
  }
  const font = getCuratedFont(fontId);
  switch (font.casingRule) {
    case 'mixed-case-only':
      return { uppercase: undefined, letterSpacingEm: 0 };
    case 'uppercase-only':
      return {
        uppercase: true,
        letterSpacingEm: roundTo(clampFinite(desiredTrackingEm, 0.08, 0, 0.25), 3),
      };
    case 'swash-on-caps': {
      const compactLen = text.replace(/\s+/g, ' ').trim().length;
      const useCaps = compactLen <= 24;
      return {
        uppercase: useCaps ? true : undefined,
        letterSpacingEm: useCaps ? roundTo(Math.min(desiredTrackingEm, 0.08), 3) : 0.02,
      };
    }
    case 'any':
      return {
        uppercase: preferUppercase ? true : undefined,
        letterSpacingEm: roundTo(
          preferUppercase ? Math.min(desiredTrackingEm, 0.22) : Math.min(desiredTrackingEm, 0.04),
          3,
        ),
      };
  }
}

/**
 * Fits a CoverTextLayer's fontSizePt cleanly inside `boardRect` with at least `minSideMarginMm`
 * on left and right and `minTopBottomMarginMm` on top and bottom, clamping position if required.
 */
function fitTextLayerInsideBoard(
  layer: CoverTextLayer,
  boardRect: Rect2D,
  minSideMarginMm = 12,
  minTopBottomMarginMm = 8,
): CoverTextLayer {
  const maxW = Math.max(18, boardRect.width - minSideMarginMm * 2);
  const maxH = Math.max(12, boardRect.height - minTopBottomMarginMm * 2);
  let fontSizePt = clampFinite(
    layer.fontSizePt,
    20,
    COVER_TEXT_BOUNDS.fontSizePt.min,
    COVER_TEXT_BOUNDS.fontSizePt.max,
  );
  let candidate: CoverTextLayer = { ...layer, fontSizePt: roundTo(fontSizePt, 1) };

  while (fontSizePt > COVER_TEXT_BOUNDS.fontSizePt.min) {
    const bounds = CoverTextLayerModel.estimateBounds(candidate);
    if (bounds.width <= maxW && bounds.height <= maxH) {
      break;
    }
    fontSizePt = Math.max(COVER_TEXT_BOUNDS.fontSizePt.min, roundTo(fontSizePt - 0.5, 1));
    candidate = { ...candidate, fontSizePt };
  }

  // Clamp X & Y anchor so estimated bounds never escape boardRect
  let bounds = CoverTextLayerModel.estimateBounds(candidate);
  let xMm = candidate.xMm;
  let yMm = candidate.yMm;
  const minX = boardRect.x + Math.min(minSideMarginMm, boardRect.width * 0.12);
  const maxX = boardRect.x + boardRect.width - Math.min(minSideMarginMm, boardRect.width * 0.12);
  const minY = boardRect.y + Math.min(minTopBottomMarginMm, boardRect.height * 0.08);
  const maxY = boardRect.y + boardRect.height - Math.min(minTopBottomMarginMm, boardRect.height * 0.08);

  if (bounds.x < minX) {
    xMm = roundTo(xMm + (minX - bounds.x), 2);
  } else if (bounds.x + bounds.width > maxX) {
    xMm = roundTo(xMm - (bounds.x + bounds.width - maxX), 2);
  }

  if (bounds.y < minY) {
    yMm = roundTo(yMm + (minY - bounds.y), 2);
  } else if (bounds.y + bounds.height > maxY) {
    yMm = roundTo(yMm - (bounds.y + bounds.height - maxY), 2);
  }

  candidate = { ...candidate, xMm, yMm };
  bounds = CoverTextLayerModel.estimateBounds(candidate);
  if (bounds.x < boardRect.x || bounds.x + bounds.width > boardRect.x + boardRect.width) {
    candidate = {
      ...candidate,
      align: 'center',
      xMm: roundTo(boardRect.x + boardRect.width / 2, 2),
    };
  }
  return candidate;
}

function clampOrnamentInsideRect(orn: CoverOrnamentLayer, rect: Rect2D, padMm = 0): CoverOrnamentLayer {
  const safePadX = Math.min(padMm, rect.width * 0.25);
  const safePadY = Math.min(padMm, rect.height * 0.25);
  const availW = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, rect.width - safePadX * 2);
  const availH = Math.max(COVER_ORNAMENT_BOUNDS.minSizeMm, rect.height - safePadY * 2);
  const widthMm = roundTo(Math.min(orn.widthMm, availW), 2);
  const heightMm = roundTo(Math.min(orn.heightMm, availH), 2);
  const xMm = roundTo(
    Math.min(rect.x + rect.width - safePadX - widthMm, Math.max(rect.x + safePadX, orn.xMm)),
    2,
  );
  const yMm = roundTo(
    Math.min(rect.y + rect.height - safePadY - heightMm, Math.max(rect.y + safePadY, orn.yMm)),
    2,
  );
  return { ...orn, xMm, yMm, widthMm, heightMm };
}

function extractExistingTextByRole(
  studio: CoverStudioState,
  role: CoverTextSemanticRole,
): CoverTextLayer | null {
  const layers = studio.textLayers ?? [];
  const byRole = layers.find((l) => l.role === role && l.text.trim().length > 0);
  if (byRole) return byRole;
  if (role === 'title') {
    return layers.find((l) => l.zone === 'front' && l.text.trim().length > 0) ?? null;
  }
  if (role === 'author') {
    const frontLayers = layers.filter((l) => l.zone === 'front' && l.text.trim().length > 0);
    return frontLayers.length > 1 ? frontLayers[1] : null;
  }
  if (role === 'blurb') {
    return layers.find((l) => l.zone === 'back' && l.text.trim().length > 0) ?? null;
  }
  return null;
}

function buildFrameOrnament(
  id: string,
  presetId: ClassicOrnamentId,
  spec: StudioCanvasSpec,
  color: string,
  marginMm: number,
): CoverOrnamentLayer {
  const base = CoverOrnamentLayerModel.createForZone(presetId, spec.frontBoardRect, 'front', color);
  const constraint: LayerLayoutConstraint = {
    anchorZone: 'front',
    horizontal: { kind: 'inset-both', marginMm },
    vertical: { kind: 'inset-both', marginMm },
  };
  const resolved = resolveOrnamentLayerConstraint(
    { ...base, id, strokeWidthMm: 0.72, layoutConstraint: constraint },
    spec,
  );
  return clampOrnamentInsideRect(resolved, spec.frontBoardRect, 4);
}

function buildCenterAccentOrnament(
  id: string,
  presetId: ClassicOrnamentId,
  spec: StudioCanvasSpec,
  color: string,
  kind: 'emblem' | 'divider',
): CoverOrnamentLayer {
  const board = spec.frontBoardRect;
  const widthMm =
    kind === 'divider'
      ? roundTo(clampFinite(board.width * 0.5, 58, 24, Math.min(72, board.width - 28)), 2)
      : roundTo(clampFinite(Math.min(board.width * 0.34, board.height * 0.2), 40, 22, 52), 2);
  const heightMm =
    kind === 'divider'
      ? roundTo(clampFinite(widthMm * 0.2, 11, 8, 16), 2)
      : widthMm;

  const constraint: LayerLayoutConstraint = {
    anchorZone: 'front',
    horizontal: { kind: 'center' },
    vertical: { kind: 'center' },
  };
  const base: CoverOrnamentLayer = {
    id,
    presetId,
    zone: 'front',
    xMm: roundTo(board.x + (board.width - widthMm) / 2, 2),
    yMm: roundTo(board.y + (board.height - heightMm) / 2, 2),
    widthMm,
    heightMm,
    color,
    strokeWidthMm: 0.7,
    layoutConstraint: constraint,
  };
  const resolved = resolveOrnamentLayerConstraint(base, spec);
  return clampOrnamentInsideRect(resolved, board, 8);
}

function buildSpineMiniEmblem(
  id: string,
  presetId: ClassicOrnamentId,
  spineBoardRect: Rect2D,
  sizeMm: number,
  yMm: number,
  color: string,
): CoverOrnamentLayer {
  const xMm = roundTo(spineBoardRect.x + (spineBoardRect.width - sizeMm) / 2, 2);
  return clampOrnamentInsideRect(
    {
      id,
      presetId,
      zone: 'spine',
      xMm,
      yMm: roundTo(yMm, 2),
      widthMm: sizeMm,
      heightMm: sizeMm,
      color,
      strokeWidthMm: 0.65,
    },
    spineBoardRect,
    1.2,
  );
}

/**
 * Rule-based Design Muse generator producing bookstore-grade, WCAG-verified,
 * margin-safe cover & spine compositions across 8 genres and 7 archetypes.
 */
export function generateBookCoverDesign(
  geometry: CaseGeometry,
  currentStudio: CoverStudioState,
  options: DesignGeneratorOptions,
): GeneratedDesignResult {
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 1;
  const rng = createMulberry32(seed ^ 0x9e3779b9);
  const locks = options.locks;

  const genreId: ConcreteDesignGenreId =
    options.genre === 'surprise' ? pickOne(CONCRETE_DESIGN_GENRE_IDS, rng) : options.genre;
  const profile = getGenreProfile(genreId);
  const archetypeId: CompositionArchetypeId = pickOne(profile.archetypes, rng);
  const palette = pickOne(profile.palettes, rng);
  const sample = pickOne(profile.samples, rng);
  const spec = computeStudioCanvasSpec(geometry);

  // 1. Palette & WCAG Contrast Guard
  const frontBgColor = locks.lockPalette ? currentStudio.frontBgColor : palette.frontBg;
  const spineBgColor = locks.lockPalette ? currentStudio.spineBgColor : palette.spineBg;
  const backBgColor = locks.lockPalette ? currentStudio.backBgColor : palette.backBg;
  const pocketBgColor = locks.lockPalette
    ? currentStudio.pocketStyle.backgroundColor
    : palette.pocketBg;

  const titleColor = ensureAccessibleTextColor(palette.foil, frontBgColor, 4.5);
  const authorColor = ensureAccessibleTextColor(palette.inkAccent, frontBgColor, 5.5);
  const ornamentColor = ensureAccessibleTextColor(palette.foil, frontBgColor, 3.2);
  const spineTextColor = ensureAccessibleTextColor(palette.foil, spineBgColor, 4.5);
  const spineOrnamentColor = ensureAccessibleTextColor(palette.foil, spineBgColor, 3.2);
  const blurbColor = ensureAccessibleTextColor(palette.inkAccent, backBgColor, 5.5);

  // 2. Strict 2-Font Pairing (honoring lockFonts)
  const existingTitleLayer = extractExistingTextByRole(currentStudio, 'title');
  const existingAuthorLayer = extractExistingTextByRole(currentStudio, 'author');
  const existingBlurbLayer = extractExistingTextByRole(currentStudio, 'blurb');

  const pickedTitleFont: CuratedFontId = pickOne(profile.titleFonts, rng);
  const pickedAuthorFont: CuratedFontId = pickOne(profile.authorFonts, rng);

  const titleFontId: StudioFontId = locks.lockFonts
    ? (existingTitleLayer?.fontId ?? currentStudio.spineText.fontId)
    : pickedTitleFont;
  const authorFontId: StudioFontId = locks.lockFonts
    ? (existingAuthorLayer?.fontId ?? currentStudio.spineText.fontId)
    : pickedAuthorFont;
  const spineFontId: StudioFontId = locks.lockFonts
    ? currentStudio.spineText.fontId
    : rng() > 0.45
      ? pickedTitleFont
      : pickedAuthorFont;

  const summaryTitleFont: CuratedFontId = titleFontId === 'custom' ? pickedTitleFont : titleFontId;
  const summaryAuthorFont: CuratedFontId =
    authorFontId === 'custom' ? pickedAuthorFont : authorFontId;
  const summarySpineFont: CuratedFontId = spineFontId === 'custom' ? pickedTitleFont : spineFontId;

  // 3. Text Content (honoring lockTextContent verbatim when non-empty)
  const lockedFrontTitle = existingTitleLayer?.text.trim() || currentStudio.spineText.title.trim();
  const lockedAuthor = existingAuthorLayer?.text.trim() || currentStudio.spineText.author.trim();
  const lockedBlurb = existingBlurbLayer?.text.trim() ?? '';

  const hasLockedTitle = locks.lockTextContent && lockedFrontTitle.length > 0;
  const hasLockedAuthor = locks.lockTextContent && lockedAuthor.length > 0;
  const hasLockedBlurb = locks.lockTextContent && lockedBlurb.length > 0;

  const frontTitleText = hasLockedTitle
    ? lockedFrontTitle
    : wrapTitleIntoBalancedLines(sample.title);
  const frontAuthorText = hasLockedAuthor ? lockedAuthor : sample.author;
  const backBlurbText = hasLockedBlurb ? lockedBlurb : sample.blurb;

  const spineTitleText =
    locks.lockTextContent && currentStudio.spineText.title.trim().length > 0
      ? currentStudio.spineText.title.trim()
      : hasLockedTitle
        ? lockedFrontTitle.replace(/\s*\n+\s*/g, ' ')
        : sample.title;
  const spineAuthorText =
    locks.lockTextContent && currentStudio.spineText.author.trim().length > 0
      ? currentStudio.spineText.author.trim()
      : hasLockedAuthor
        ? lockedAuthor.replace(/\s*\n+\s*/g, ' ')
        : sample.author;

  // 4. Archetype Typography & Layout Constraints
  const isSwiss = archetypeId === 'swiss-editorial';
  const isBoldPoster = archetypeId === 'bold-poster';
  const isScifi = archetypeId === 'scifi-orbital';
  const isDeco = archetypeId === 'art-deco-opulence';
  const preferUpperTitle = isBoldPoster || isScifi || isDeco || archetypeId === 'classic-framed';

  const titleCasing = resolveFontCasingAndTracking(
    titleFontId,
    frontTitleText,
    preferUpperTitle,
    isDeco || isScifi ? 0.14 : isBoldPoster ? 0.08 : 0.07,
  );
  const authorCasing = resolveFontCasingAndTracking(
    authorFontId,
    frontAuthorText,
    true,
    isDeco || isScifi ? 0.2 : 0.15,
  );
  const blurbCasing = resolveFontCasingAndTracking(authorFontId, backBlurbText, false, 0.02);

  const boardScale = clampFinite(spec.frontBoardRect.width / 140, 1, 0.68, 1.18);
  const baseTitlePt = isBoldPoster ? 34 : isSwiss ? 30 : isScifi ? 25 : 27;
  const baseAuthorPt = isSwiss ? 11.5 : 12.5;
  const textAlign: TextAlign = isSwiss ? 'left' : 'center';
  const swissLeftX = roundTo(spec.frontBoardRect.x + 15, 2);

  const titleConstraint: LayerLayoutConstraint = isSwiss
    ? { anchorZone: 'front', vertical: { kind: 'top-third' } }
    : { anchorZone: 'front', horizontal: { kind: 'center' }, vertical: { kind: 'top-third' } };
  const authorConstraint: LayerLayoutConstraint = isSwiss
    ? { anchorZone: 'front', vertical: { kind: 'bottom-third' } }
    : { anchorZone: 'front', horizontal: { kind: 'center' }, vertical: { kind: 'bottom-third' } };
  const blurbConstraint: LayerLayoutConstraint = {
    anchorZone: 'back',
    horizontal: { kind: 'center' },
    vertical: { kind: 'center' },
  };

  const rawTitleLayer: CoverTextLayer = {
    id: makeDeterministicId('txt', seed, 1),
    text: frontTitleText,
    zone: 'front',
    xMm: isSwiss ? swissLeftX : roundTo(spec.frontBoardRect.x + spec.frontBoardRect.width / 2, 2),
    yMm: roundTo(spec.frontBoardRect.y + spec.frontBoardRect.height * 0.3, 2),
    fontId: titleFontId,
    fontSizePt: roundTo(baseTitlePt * boardScale, 1),
    letterSpacingEm: titleCasing.letterSpacingEm,
    lineHeight: 1.16,
    align: textAlign,
    color: titleColor,
    ...(titleCasing.uppercase ? { uppercase: true } : {}),
    role: 'title',
    layoutConstraint: titleConstraint,
  };
  const frontTitleLayer = fitTextLayerInsideBoard(
    resolveTextLayerConstraint(rawTitleLayer, spec),
    spec.frontBoardRect,
    12,
    10,
  );

  const rawAuthorLayer: CoverTextLayer = {
    id: makeDeterministicId('txt', seed, 2),
    text: frontAuthorText,
    zone: 'front',
    xMm: isSwiss ? swissLeftX : roundTo(spec.frontBoardRect.x + spec.frontBoardRect.width / 2, 2),
    yMm: roundTo(spec.frontBoardRect.y + spec.frontBoardRect.height * 0.76, 2),
    fontId: authorFontId,
    fontSizePt: roundTo(baseAuthorPt * boardScale, 1),
    letterSpacingEm: authorCasing.letterSpacingEm,
    lineHeight: 1.24,
    align: textAlign,
    color: authorColor,
    ...(authorCasing.uppercase ? { uppercase: true } : {}),
    role: 'author',
    layoutConstraint: authorConstraint,
  };
  const frontAuthorLayer = fitTextLayerInsideBoard(
    resolveTextLayerConstraint(rawAuthorLayer, spec),
    spec.frontBoardRect,
    12,
    10,
  );

  const rawBlurbLayer: CoverTextLayer = {
    id: makeDeterministicId('txt', seed, 3),
    text: backBlurbText,
    zone: 'back',
    xMm: roundTo(spec.backBoardRect.x + spec.backBoardRect.width / 2, 2),
    yMm: roundTo(spec.backBoardRect.y + spec.backBoardRect.height * 0.5, 2),
    fontId: authorFontId,
    fontSizePt: roundTo(10.5 * boardScale, 1),
    letterSpacingEm: blurbCasing.letterSpacingEm,
    lineHeight: 1.4,
    align: 'center',
    color: blurbColor,
    ...(blurbCasing.uppercase ? { uppercase: true } : {}),
    role: 'blurb',
    layoutConstraint: blurbConstraint,
  };
  const backBlurbLayer = fitTextLayerInsideBoard(
    resolveTextLayerConstraint(rawBlurbLayer, spec),
    spec.backBoardRect,
    12,
    12,
  );

  const textLayers: CoverTextLayer[] = [frontTitleLayer, frontAuthorLayer, backBlurbLayer];

  // 5. Thin-Spine Safety Guard & Editorial + Height-Aware Spine Sizing
  const spineWidthMm = spec.spineBoardRect.width;
  const spineHeightMm = spec.spineBoardRect.height;
  const maxSpinePt = CoverStudioModel.maxSpineFontSizePt(spineWidthMm);
  const isThinSpine = spineWidthMm < 14;
  const hasSpineText =
    spineTitleText.trim().length > 0 || spineAuthorText.trim().length > 0;

  // Choose text-safe spine decoration archetype first so head/tail mini-emblem height
  // is reserved in safeSpineHeightMm and spine text never collides with emblems.
  const spineDecorationArchetype: SpineDecorationArchetype = pickOne(
    SPINE_DECORATION_ARCHETYPES,
    rng,
  );
  const spineMiniEmblemSizeMm = roundTo(
    clampFinite(Math.min(spineWidthMm * 0.68, 13), 10, COVER_ORNAMENT_BOUNDS.minSizeMm, 13),
    2,
  );
  const spineEmblemOffsetMm = roundTo(clampFinite(spineHeightMm * 0.048, 10, 8, 12), 2);
  const usesSpineHeadTailEmblem =
    !locks.lockOrnaments &&
    !isThinSpine &&
    hasSpineText &&
    profile.emblems.length > 0 &&
    (spineDecorationArchetype === 'head-tail-emblems' ||
      spineDecorationArchetype === 'head-tail-rules-with-emblem');

  const spineLayout: SpineLayoutPreset = isThinSpine
    ? 'inline'
    : rng() > 0.45
      ? 'stacked'
      : 'inline';

  const combinedSpineChars =
    spineLayout === 'inline'
      ? [spineTitleText.trim(), spineAuthorText.trim()].filter(Boolean).join(' — ').length
      : spineTitleText.trim().length;
  const baseSafeSpineHeightMm =
    spineLayout === 'stacked' ? spineHeightMm * 0.68 : Math.max(12, spineHeightMm - 20);
  const spineEmblemReserveMm = usesSpineHeadTailEmblem
    ? (spineEmblemOffsetMm +
        spineMiniEmblemSizeMm +
        (spineDecorationArchetype === 'head-tail-rules-with-emblem' ? 14 : 6)) *
      2
    : 0;
  const safeSpineHeightMm = Math.max(
    12,
    usesSpineHeadTailEmblem
      ? Math.min(baseSafeSpineHeightMm, spineHeightMm - spineEmblemReserveMm)
      : baseSafeSpineHeightMm,
  );
  const maxVerticalSpinePt =
    combinedSpineChars > 0
      ? Math.floor(
          UnitConverter.mmToPoints(safeSpineHeightMm / (combinedSpineChars * 0.62)) * 10,
        ) / 10
      : STUDIO_BOUNDS.fontSizePt.max;
  const spineSizeJitterPt = Math.round((rng() - 0.5) * 4);
  const editorialTargetSpinePt = clampFinite(
    Math.round(spineWidthMm * 0.52) + spineSizeJitterPt,
    13,
    10,
    17,
  );
  const spineFontSizePt = roundTo(
    Math.max(
      STUDIO_BOUNDS.fontSizePt.min,
      Math.min(editorialTargetSpinePt, maxSpinePt, maxVerticalSpinePt),
    ),
    1,
  );

  let spineAuthorOrientation: 'vertical' | 'horizontal' =
    !isThinSpine && spineLayout === 'stacked' && spineWidthMm >= 18 && rng() > 0.4
      ? 'horizontal'
      : 'vertical';
  if (spineAuthorOrientation === 'horizontal' && spineAuthorText.trim().length > 0) {
    const authorLines = CoverStudioModel.splitHorizontalAuthorLines(spineAuthorText);
    const horizPt = CoverStudioModel.horizontalAuthorFontSizePt(
      authorLines,
      CoverStudioModel.effectiveSpineFontSizePt(spineFontSizePt, spineWidthMm),
      spineWidthMm,
    );
    if (horizPt < 6.5) {
      spineAuthorOrientation = 'vertical';
    }
  }
  const hasHorizontalTailAuthor =
    spineAuthorOrientation === 'horizontal' && spineAuthorText.trim().length > 0;

  const spineText = {
    ...currentStudio.spineText,
    title: spineTitleText,
    author: spineAuthorText,
    layout: spineLayout,
    orientation: 'top-to-bottom' as const,
    authorOrientation: spineAuthorOrientation,
    fontId: spineFontId,
    customFontName: locks.lockFonts ? currentStudio.spineText.customFontName : null,
    fontSizePt: spineFontSizePt,
    textColor: spineTextColor,
    opticalNudgeMm: 0,
  };

  // 6. Ornaments by Composition Archetype (honoring lockOrnaments & Thin-Spine Safety)
  let ornaments: readonly CoverOrnamentLayer[];
  if (locks.lockOrnaments) {
    ornaments = currentStudio.ornaments ?? [];
  } else {
    const builtOrnaments: CoverOrnamentLayer[] = [];
    let ornIdx = 1;
    const nextOrnId = () => makeDeterministicId('orn', seed, ornIdx++);

    const pickFrame = (): ClassicOrnamentId => pickOne(profile.frames, rng);
    const pickCorner = (): ClassicOrnamentId => pickOne(profile.corners, rng);
    const pickEmblem = (): ClassicOrnamentId => pickOne(profile.emblems, rng);
    const pickDivider = (): ClassicOrnamentId => pickOne(profile.dividers, rng);

    switch (archetypeId) {
      case 'classic-framed': {
        const outer = rng() > 0.35 ? pickFrame() : pickCorner();
        builtOrnaments.push(buildFrameOrnament(nextOrnId(), outer, spec, ornamentColor, 12));
        builtOrnaments.push(
          buildCenterAccentOrnament(nextOrnId(), pickDivider(), spec, ornamentColor, 'divider'),
        );
        break;
      }
      case 'tarot-arch': {
        const archFrame = profile.frames.includes('frame-gothic-arch')
          ? 'frame-gothic-arch'
          : profile.frames.includes('frame-deco-archway')
            ? 'frame-deco-archway'
            : pickFrame();
        builtOrnaments.push(buildFrameOrnament(nextOrnId(), archFrame, spec, ornamentColor, 10));
        builtOrnaments.push(
          buildCenterAccentOrnament(nextOrnId(), pickEmblem(), spec, ornamentColor, 'emblem'),
        );
        break;
      }
      case 'art-deco-opulence': {
        const decoOuter = rng() > 0.45 ? pickFrame() : pickCorner();
        builtOrnaments.push(buildFrameOrnament(nextOrnId(), decoOuter, spec, ornamentColor, 11));
        const useEmblem = rng() > 0.35;
        builtOrnaments.push(
          buildCenterAccentOrnament(
            nextOrnId(),
            useEmblem ? pickEmblem() : pickDivider(),
            spec,
            ornamentColor,
            useEmblem ? 'emblem' : 'divider',
          ),
        );
        break;
      }
      case 'botanical-medallion': {
        const botOuter = rng() > 0.45 ? pickCorner() : pickFrame();
        builtOrnaments.push(buildFrameOrnament(nextOrnId(), botOuter, spec, ornamentColor, 12));
        builtOrnaments.push(
          buildCenterAccentOrnament(nextOrnId(), pickEmblem(), spec, ornamentColor, 'emblem'),
        );
        break;
      }
      case 'bold-poster': {
        builtOrnaments.push(buildFrameOrnament(nextOrnId(), pickFrame(), spec, ornamentColor, 10));
        builtOrnaments.push(
          buildCenterAccentOrnament(nextOrnId(), pickDivider(), spec, ornamentColor, 'divider'),
        );
        break;
      }
      case 'scifi-orbital': {
        builtOrnaments.push(buildFrameOrnament(nextOrnId(), pickFrame(), spec, ornamentColor, 10));
        builtOrnaments.push(
          buildCenterAccentOrnament(nextOrnId(), pickEmblem(), spec, ornamentColor, 'emblem'),
        );
        break;
      }
      case 'swiss-editorial': {
        const editorialFrame = profile.frames.includes('frame-modern-editorial')
          ? 'frame-modern-editorial'
          : pickFrame();
        builtOrnaments.push(
          buildFrameOrnament(nextOrnId(), editorialFrame, spec, ornamentColor, 10),
        );
        builtOrnaments.push(
          buildCenterAccentOrnament(nextOrnId(), pickEmblem(), spec, ornamentColor, 'emblem'),
        );
        break;
      }
    }

    // Add rich, text-safe spine decorations ONLY when spine is >= 14 mm wide.
    if (!isThinSpine) {
      if (hasSpineText) {
        switch (spineDecorationArchetype) {
          case 'head-tail-emblems': {
            if (profile.emblems.length > 0) {
              const emblemPreset = pickOne(profile.emblems, rng);
              builtOrnaments.push(
                buildSpineMiniEmblem(
                  nextOrnId(),
                  emblemPreset,
                  spec.spineBoardRect,
                  spineMiniEmblemSizeMm,
                  spec.spineBoardRect.y + spineEmblemOffsetMm,
                  spineOrnamentColor,
                ),
              );
              if (!hasHorizontalTailAuthor) {
                builtOrnaments.push(
                  buildSpineMiniEmblem(
                    nextOrnId(),
                    emblemPreset,
                    spec.spineBoardRect,
                    spineMiniEmblemSizeMm,
                    spec.spineBoardRect.y +
                      spineHeightMm -
                      spineEmblemOffsetMm -
                      spineMiniEmblemSizeMm,
                    spineOrnamentColor,
                  ),
                );
              }
            }
            break;
          }
          case 'title-cartouche': {
            const rawCartouche = CoverOrnamentLayerModel.createForZone(
              'spine-title-cartouche',
              spec.spineBoardRect,
              'spine',
              spineOrnamentColor,
            );
            builtOrnaments.push(
              clampOrnamentInsideRect(
                { ...rawCartouche, id: nextOrnId(), strokeWidthMm: 0.65 },
                spec.spineBoardRect,
                1.2,
              ),
            );
            break;
          }
          case 'classic-bands': {
            const rawBands = CoverOrnamentLayerModel.createForZone(
              'spine-classic-bands',
              spec.spineBoardRect,
              'spine',
              spineOrnamentColor,
            );
            builtOrnaments.push(
              clampOrnamentInsideRect(
                { ...rawBands, id: nextOrnId(), strokeWidthMm: 0.65 },
                spec.spineBoardRect,
                1.2,
              ),
            );
            break;
          }
          case 'head-tail-rules-with-emblem': {
            const rawRules = CoverOrnamentLayerModel.createForZone(
              'spine-head-tail-bands',
              spec.spineBoardRect,
              'spine',
              spineOrnamentColor,
            );
            const emblemClearance = spineEmblemOffsetMm + spineMiniEmblemSizeMm + 4;
            const rulesTopY = hasHorizontalTailAuthor
              ? spec.spineBoardRect.y + emblemClearance
              : spec.spineBoardRect.y + 8;
            const rulesHeight = Math.max(
              COVER_ORNAMENT_BOUNDS.minSizeMm,
              spineHeightMm - 8 - emblemClearance,
            );
            builtOrnaments.push(
              clampOrnamentInsideRect(
                {
                  ...rawRules,
                  id: nextOrnId(),
                  yMm: roundTo(rulesTopY, 2),
                  heightMm: roundTo(rulesHeight, 2),
                  strokeWidthMm: 0.65,
                },
                spec.spineBoardRect,
                1.2,
              ),
            );
            if (profile.emblems.length > 0) {
              const emblemPreset = pickOne(profile.emblems, rng);
              const emblemY = hasHorizontalTailAuthor
                ? spec.spineBoardRect.y + spineEmblemOffsetMm
                : spec.spineBoardRect.y +
                  spineHeightMm -
                  spineEmblemOffsetMm -
                  spineMiniEmblemSizeMm;
              builtOrnaments.push(
                buildSpineMiniEmblem(
                  nextOrnId(),
                  emblemPreset,
                  spec.spineBoardRect,
                  spineMiniEmblemSizeMm,
                  emblemY,
                  spineOrnamentColor,
                ),
              );
            }
            break;
          }
        }
      } else if (profile.spineOrnaments.length > 0) {
        const spinePreset = pickOne(profile.spineOrnaments, rng);
        const rawSpineOrn = CoverOrnamentLayerModel.createForZone(
          spinePreset,
          spec.spineBoardRect,
          'spine',
          spineOrnamentColor,
        );
        builtOrnaments.push(
          clampOrnamentInsideRect(
            { ...rawSpineOrn, id: nextOrnId(), strokeWidthMm: 0.65 },
            spec.spineBoardRect,
            1.2,
          ),
        );
      }
    }

    ornaments = builtOrnaments;
  }

  // 7. Procedural Background Art (honoring lockBackground & Flap/Glue-Tab Rule #3)
  let layers: readonly CoverImageLayer[] = currentStudio.layers;
  let artworkId: ProceduralArtworkId | null = null;

  if (!locks.lockBackground) {
    if (options.includeBackgroundArt && profile.proceduralArtworks.length > 0) {
      artworkId = pickOne(profile.proceduralArtworks, rng);
      const strategy = resolveBindingStrategy(geometry);
      const hasFlapsOrTabs =
        strategy.capabilities.hasFlaps || strategy.capabilities.hasGlueTabs;
      const isQuarterBound = frontBgColor.toLowerCase() !== spineBgColor.toLowerCase();

      const clipToFrontOnly = hasFlapsOrTabs || isQuarterBound;
      const targetRect: Rect2D = clipToFrontOnly ? spec.frontArtworkRect : spec.fullWrapRect;
      const clipZone: LayerClipZone = clipToFrontOnly ? 'front' : 'none';
      const anchorZone = clipToFrontOnly ? 'front' : 'fullWrap';

      const asset = createProceduralArtworkAsset({
        patternId: artworkId,
        widthMm: targetRect.width,
        heightMm: targetRect.height,
        baseColor: frontBgColor,
        accentColor: ornamentColor,
        seed: seed ^ 0x517cc1b7,
        intensity: 'subtle',
      });

      const artLayer: CoverImageLayer = {
        ...CoverImageLayerModel.createInRect({
          id: makeDeterministicId('art', seed, 1),
          dataUrl: asset.dataUrl,
          fileName: asset.fileName,
          naturalWidth: asset.naturalWidth,
          naturalHeight: asset.naturalHeight,
          targetRect,
          clipZone,
          mode: 'cover',
        }),
        layoutConstraint: {
          anchorZone,
          horizontal: { kind: 'center' },
          vertical: { kind: 'center' },
          imageFit: 'cover',
        },
      };

      const generatedLayers: CoverImageLayer[] = [artLayer];
      if (clipToFrontOnly) {
        const spineAsset = createProceduralArtworkAsset({
          patternId: artworkId,
          widthMm: spec.spineArtworkRect.width,
          heightMm: spec.spineArtworkRect.height,
          baseColor: spineBgColor,
          accentColor: spineOrnamentColor,
          seed: (seed ^ 0x27d4eb2d) >>> 0,
          intensity: 'subtle',
        });
        generatedLayers.push({
          ...CoverImageLayerModel.createInRect({
            id: makeDeterministicId('art', seed, 2),
            dataUrl: spineAsset.dataUrl,
            fileName: spineAsset.fileName,
            naturalWidth: spineAsset.naturalWidth,
            naturalHeight: spineAsset.naturalHeight,
            targetRect: spec.spineArtworkRect,
            clipZone: 'spine',
            mode: 'cover',
          }),
          layoutConstraint: {
            anchorZone: 'spine',
            horizontal: { kind: 'center' },
            vertical: { kind: 'center' },
            imageFit: 'cover',
          },
        });
      }
      layers = generatedLayers;
    } else {
      layers = [];
    }
  }

  const nextStudio: CoverStudioState = {
    ...currentStudio,
    frontBgColor,
    spineBgColor,
    backBgColor,
    pocketStyle: {
      ...currentStudio.pocketStyle,
      backgroundColor: pocketBgColor,
    },
    spineText,
    textLayers,
    ornaments,
    layers,
  };

  return {
    studio: nextStudio,
    summary: {
      genreId,
      genreLabel: profile.label,
      archetypeId,
      archetypeLabel: COMPOSITION_ARCHETYPES[archetypeId].label,
      paletteName: locks.lockPalette ? 'Locked Palette' : palette.name,
      titleFontId: summaryTitleFont,
      authorFontId: summaryAuthorFont,
      spineFontId: summarySpineFont,
      artworkId,
      seed,
    },
  };
}
