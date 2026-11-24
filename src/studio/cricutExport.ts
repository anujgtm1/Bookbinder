import fontkit from '@pdf-lib/fontkit';
import { fmtMm } from '@/lib/svgFormat';
import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import type { CoverStudioState, CuratedFontId, StudioFontId } from '@/types/studio';
import {
  getLayerVisualRect,
  normalizeQuarterTurn,
  type CoverImageLayer,
} from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from './classicOrnaments';
import { loadCuratedFontBytes, type CustomFontAsset } from './fonts';
import {
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  getCoverTextAxisAlignedBounds,
  resolveZoneClipRect,
  type StudioCanvasSpec,
} from './renderEngine';
import { mapNormalizedPathsToMm, parseSvgStampText, type ParsedSvgStamp } from './svgStampParser';

export type CricutCanvasScope = 'spine-only' | 'front-cover' | 'back-cover' | 'full-wrap';

export interface CricutExportOptions {
  /** 'spine-only', 'front-cover', 'back-cover', or 'full-wrap' */
  readonly scope: CricutCanvasScope;
  /** Convert spine & cover text layers to flattened vector <path> outlines (zero <text> tags) */
  readonly includeLettering: boolean;
  /** Include parametric classic bookbindery vector ornaments in the cut paths (default true) */
  readonly includeOrnaments?: boolean;
  /** Parse uploaded .svg artwork layers (data:image/svg+xml) into flattened cut paths (default true) */
  readonly includeSvgArtwork?: boolean;
  /** Add tight +4 mm cut box around lettering & ornaments for effortless HTV weeding */
  readonly includeWeedingBox: boolean;
  /** Add exact corner L-bracket registration ticks to align iron-on HTV onto wrapped bookcloth */
  readonly includeRegistrationMarks: boolean;
  /** Include exact 1:1 mm outer wrap cut polygon (with 45° miters) for cutting bookcloth/paper */
  readonly includeOuterCutOutline: boolean;
  /** Pre-mirror all coordinates horizontally for HTV iron-on (leave Off if mirroring in Cricut Design Space Make It) */
  readonly mirrorForHtv: boolean;
  /** Group lettering & ornaments by their design foil color so Cricut splits mats automatically (default false) */
  readonly groupByColor?: boolean;
}

export const DEFAULT_CRICUT_EXPORT_OPTIONS: Readonly<CricutExportOptions> = {
  scope: 'spine-only',
  includeLettering: true,
  includeOrnaments: true,
  includeSvgArtwork: true,
  includeWeedingBox: true,
  includeRegistrationMarks: true,
  includeOuterCutOutline: false,
  mirrorForHtv: false,
  groupByColor: false,
};

export interface CricutExportResult {
  readonly svg: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly pathCount: number;
  readonly hasLettering: boolean;
  readonly foilColors: readonly string[];
  readonly fitsCricutJoy: boolean;
  readonly fitsStandard12x12: boolean;
  readonly fitsLarge12x24: boolean;
  readonly fileName: string;
}

interface FontkitPathCommand {
  readonly command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  readonly args: readonly number[];
}

interface FontkitGlyph {
  readonly path?: {
    readonly commands?: readonly FontkitPathCommand[];
  };
}

interface FontkitGlyphPosition {
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
}

interface FontkitFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight?: number;
  layout(text: string): {
    readonly glyphs: readonly FontkitGlyph[];
    readonly positions: readonly FontkitGlyphPosition[];
  };
}

interface FontkitModule {
  create(bytes: Uint8Array): FontkitFont;
}

function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned || 'bookbinder';
}

function normalizeFoilHex(raw: string | undefined, fallback = '#111111'): string {
  const trimmed = (raw ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    const expanded =
      trimmed[0] + trimmed[0] + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2];
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  return fallback.toUpperCase();
}

function buildCricutFileName(
  studio: CoverStudioState,
  options: CricutExportOptions,
): string {
  const textLayers = studio.textLayers ?? [];
  const firstCoverText =
    textLayers.find((t) => t.zone === 'front' && t.text.trim().length > 0)?.text ??
    textLayers.find((t) => t.text.trim().length > 0)?.text ??
    '';
  const baseSlug = slugifyTitle(studio.spineText.title || firstCoverText);
  const scopeSlug =
    options.scope === 'spine-only'
      ? 'spine'
      : options.scope === 'front-cover'
        ? 'front'
        : options.scope === 'back-cover'
          ? 'back'
          : 'fullwrap';
  const mirrorSlug = options.mirrorForHtv ? '_mirrored' : '';
  const colorSlug = options.groupByColor ? '_multicolor' : '';
  return `${baseSlug}_cricut_htv_${scopeSlug}${mirrorSlug}${colorSlug}.svg`;
}

export interface CricutScopePresence {
  readonly spine: boolean;
  readonly front: boolean;
  readonly back: boolean;
  readonly any: boolean;
  readonly hasSvgArtwork: boolean;
  readonly hasRasterArtwork: boolean;
}

const SVG_DATA_URL_RE = /^data:image\/svg\+xml([^,]*),(.*)$/is;

/** Returns true when a CoverImageLayer holds inline SVG vector markup (`data:image/svg+xml`). */
export function isSvgArtworkLayer(layer: Pick<CoverImageLayer, 'dataUrl'>): boolean {
  return SVG_DATA_URL_RE.test(layer.dataUrl.trim());
}

/**
 * Decodes a `data:image/svg+xml` data URL (supporting both `;base64,` and URL-encoded UTF-8 variants)
 * into raw SVG XML text. Returns `null` for non-SVG or malformed data URLs.
 */
export function decodeSvgDataUrl(dataUrl: string): string | null {
  const match = SVG_DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return null;
  const meta = match[1] ?? '';
  const payload = match[2] ?? '';
  if (!payload) return null;

  try {
    if (/;base64/i.test(meta)) {
      const cleaned = payload.replace(/\s+/g, '');
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decoded = new TextDecoder('utf-8').decode(bytes).trim();
      return decoded || null;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(payload).trim();
    } catch {
      decoded = payload.trim();
    }
    return decoded || null;
  } catch {
    return null;
  }
}

function extractPrimarySvgHex(svgText: string): string {
  const attrMatch = svgText.match(/\b(?:fill|stroke)\s*=\s*["'](#(?:[0-9a-f]{3}|[0-9a-f]{6}))["']/i);
  if (attrMatch?.[1]) {
    return normalizeFoilHex(attrMatch[1], '#222222');
  }
  const styleMatch = svgText.match(/\b(?:fill|stroke)\s*:\s*(#(?:[0-9a-f]{3}|[0-9a-f]{6}))/i);
  if (styleMatch?.[1]) {
    return normalizeFoilHex(styleMatch[1], '#222222');
  }
  return '#222222';
}

function intersectRects(a: Rect2D, b: Rect2D): Rect2D | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function rectsIntersect(a: Rect2D, b: Rect2D): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function pointInRect(x: number, y: number, rect: Rect2D): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function getScopeZoneRect(scope: CricutCanvasScope, spec: StudioCanvasSpec): Rect2D {
  switch (scope) {
    case 'spine-only':
      return spec.spineZoneRect;
    case 'front-cover':
      return spec.frontZoneRect;
    case 'back-cover':
      return spec.backZoneRect;
    case 'full-wrap':
      return spec.fullWrapRect;
  }
}

function textLayerMatchesScope(
  layer: CoverTextLayer,
  scope: CricutCanvasScope,
  spec: StudioCanvasSpec,
): boolean {
  if (!layer.text.trim()) return false;
  if (scope === 'full-wrap') return true;
  const zoneRect = getScopeZoneRect(scope, spec);
  const bounds = getCoverTextAxisAlignedBounds(layer);
  return rectsIntersect(bounds, zoneRect) || pointInRect(layer.xMm, layer.yMm, zoneRect);
}

function ornamentMatchesScope(
  orn: CoverOrnamentLayer,
  scope: CricutCanvasScope,
  spec: StudioCanvasSpec,
): boolean {
  if (scope === 'full-wrap') return true;
  const zoneRect = getScopeZoneRect(scope, spec);
  const bounds: Rect2D = {
    x: orn.xMm,
    y: orn.yMm,
    width: orn.widthMm,
    height: orn.heightMm,
  };
  const cx = orn.xMm + orn.widthMm / 2;
  const cy = orn.yMm + orn.heightMm / 2;
  return rectsIntersect(bounds, zoneRect) || pointInRect(cx, cy, zoneRect);
}

function getEffectiveImageLayerRect(layer: CoverImageLayer, spec: StudioCanvasSpec): Rect2D | null {
  const vis = getLayerVisualRect(layer);
  if (layer.clipZone === 'none') return vis;
  return intersectRects(vis, resolveZoneClipRect(spec, layer.clipZone));
}

function parseSvgArtworkLayer(
  layer: CoverImageLayer,
): { readonly parsed: ParsedSvgStamp; readonly primaryHex: string } | null {
  if (!isSvgArtworkLayer(layer)) return null;
  const svgText = decodeSvgDataUrl(layer.dataUrl);
  if (!svgText) return null;
  const parsed = parseSvgStampText(svgText);
  if (!parsed || parsed.paths.length === 0) return null;
  return {
    parsed,
    primaryHex: extractPrimarySvgHex(svgText),
  };
}

function svgArtworkMatchesScope(
  layer: CoverImageLayer,
  scope: CricutCanvasScope,
  spec: StudioCanvasSpec,
): boolean {
  if (!isSvgArtworkLayer(layer)) return false;
  const effectiveRect = getEffectiveImageLayerRect(layer, spec);
  if (!effectiveRect) return false;
  if (scope === 'full-wrap') return true;
  const zoneRect = getScopeZoneRect(scope, spec);
  const cx = effectiveRect.x + effectiveRect.width / 2;
  const cy = effectiveRect.y + effectiveRect.height / 2;
  return rectsIntersect(effectiveRect, zoneRect) || pointInRect(cx, cy, zoneRect);
}

/**
 * Geometrically detects which Cricut cut scopes contain cuttable vector designs
 * (dedicated spine text, draggable cover text layers, ornaments, custom SVG stamps,
 * or uploaded `.svg` artwork layers), independent of stale `layer.zone` metadata,
 * while accurately distinguishing true raster layers (`PNG`/`JPG`/`WEBP`) from vector `.svg` layers.
 */
export function detectCricutScopePresence(
  geometry: CaseGeometry,
  studio: CoverStudioState,
): CricutScopePresence {
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const hasDedicatedSpineText =
    studio.spineText.title.trim().length > 0 || studio.spineText.author.trim().length > 0;
  const textLayers = studio.textLayers ?? [];
  const ornaments = studio.ornaments ?? [];
  const allLayers = studio.layers ?? [];
  const svgArtworkLayers = allLayers.filter((l) => parseSvgArtworkLayer(l) !== null);
  const hasSvgArtwork = svgArtworkLayers.length > 0;
  const hasRasterArtwork = allLayers.some((l) => !isSvgArtworkLayer(l));

  const spine =
    hasDedicatedSpineText ||
    textLayers.some((t) => textLayerMatchesScope(t, 'spine-only', spec)) ||
    ornaments.some((o) => ornamentMatchesScope(o, 'spine-only', spec)) ||
    svgArtworkLayers.some((l) => svgArtworkMatchesScope(l, 'spine-only', spec));
  const front =
    textLayers.some((t) => textLayerMatchesScope(t, 'front-cover', spec)) ||
    ornaments.some((o) => ornamentMatchesScope(o, 'front-cover', spec)) ||
    svgArtworkLayers.some((l) => svgArtworkMatchesScope(l, 'front-cover', spec));
  const back =
    textLayers.some((t) => textLayerMatchesScope(t, 'back-cover', spec)) ||
    ornaments.some((o) => ornamentMatchesScope(o, 'back-cover', spec)) ||
    svgArtworkLayers.some((l) => svgArtworkMatchesScope(l, 'back-cover', spec));
  const any =
    spine ||
    front ||
    back ||
    textLayers.some((t) => t.text.trim().length > 0) ||
    ornaments.length > 0 ||
    hasSvgArtwork;

  return { spine, front, back, any, hasSvgArtwork, hasRasterArtwork };
}

/**
 * Loads font bytes for fontkit glyph outlining (prefers uploaded .ttf/.otf/.woff custom font,
 * otherwise loads the active bundled curated .woff font).
 */
async function resolveFontBytesById(
  fontId: StudioFontId,
  customFont: CustomFontAsset | null,
  overrideBytes?: Uint8Array | null,
): Promise<Uint8Array | null> {
  if (overrideBytes && overrideBytes.byteLength > 0) {
    return overrideBytes;
  }
  if (fontId === 'custom' && customFont && customFont.pdfEmbeddable) {
    return customFont.bytes;
  }
  const curatedId: CuratedFontId = fontId === 'custom' ? 'eb-garamond' : fontId;
  const loaded = await loadCuratedFontBytes(curatedId);
  if (loaded) return loaded;
  return loadCuratedFontBytes('eb-garamond');
}

export async function resolveOutlineFontBytes(
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  overrideBytes?: Uint8Array | null,
): Promise<Uint8Array | null> {
  return resolveFontBytesById(studio.spineText.fontId, customFont, overrideBytes);
}

interface BakedLetteringPaths {
  readonly compoundD: string;
  readonly bounds: Rect2D | null;
}

interface GlyphRunPlacement {
  readonly text: string;
  readonly anchorXMm: number;
  readonly anchorYMm: number;
  readonly fontSizePt: number;
  readonly rotationDegCss: number;
  readonly align: 'left' | 'center' | 'right';
  readonly letterSpacingEm: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

function bakeGlyphRunsWithFont(
  runs: readonly GlyphRunPlacement[],
  font: FontkitFont,
  originXMm: number,
  originYMm: number,
  canvasWidthMm: number,
  mirrorX: boolean,
  emitSegments = true,
): BakedLetteringPaths {
  if (runs.length === 0) {
    return { compoundD: '', bounds: null };
  }

  const upem = Math.max(1, font.unitsPerEm || 1000);
  const capHeight =
    typeof font.capHeight === 'number' && font.capHeight > 0
      ? font.capHeight
      : font.ascent * 0.68;
  const verticalCenterFontUnits = capHeight / 2;

  const segments: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const recordPoint = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const placement of runs) {
    if (!placement.text.trim()) continue;
    const run = font.layout(placement.text);
    const trackingUnits = placement.letterSpacingEm * upem;
    const glyphCount = run.glyphs.length;
    const totalAdvance =
      run.positions.reduce((sum, p) => sum + p.xAdvance, 0) +
      Math.max(0, glyphCount - 1) * trackingUnits;
    const alignOffsetUnits =
      placement.align === 'left'
        ? 0
        : placement.align === 'right'
          ? totalAdvance
          : totalAdvance / 2;
    const scale = UnitConverter.pointsToMm(placement.fontSizePt) / upem;

    const rad = (placement.rotationDegCss * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchorX = placement.anchorXMm - originXMm;
    const anchorY = placement.anchorYMm - originYMm;

    let cursorX = 0;
    for (let i = 0; i < glyphCount; i++) {
      const glyph = run.glyphs[i];
      const pos = run.positions[i];
      const cmds = glyph.path?.commands ?? [];

      const mapPt = (fx: number, fy: number): { readonly x: number; readonly y: number } => {
        const rawLx = (cursorX + pos.xOffset + fx - alignOffsetUnits) * scale;
        const rawLy = -(pos.yOffset + fy - verticalCenterFontUnits) * scale;
        const lx = placement.flipX ? -rawLx : rawLx;
        const ly = placement.flipY ? -rawLy : rawLy;
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        const rawX = anchorX + rx;
        const x = mirrorX ? canvasWidthMm - rawX : rawX;
        const y = anchorY + ry;
        recordPoint(x, y);
        return { x, y };
      };

      for (const cmd of cmds) {
        switch (cmd.command) {
          case 'moveTo': {
            const p = mapPt(cmd.args[0], cmd.args[1]);
            if (emitSegments) segments.push(`M ${fmtMm(p.x)} ${fmtMm(p.y)}`);
            break;
          }
          case 'lineTo': {
            const p = mapPt(cmd.args[0], cmd.args[1]);
            if (emitSegments) segments.push(`L ${fmtMm(p.x)} ${fmtMm(p.y)}`);
            break;
          }
          case 'quadraticCurveTo': {
            const c = mapPt(cmd.args[0], cmd.args[1]);
            const p = mapPt(cmd.args[2], cmd.args[3]);
            if (emitSegments) {
              segments.push(`Q ${fmtMm(c.x)} ${fmtMm(c.y)} ${fmtMm(p.x)} ${fmtMm(p.y)}`);
            }
            break;
          }
          case 'bezierCurveTo': {
            const c1 = mapPt(cmd.args[0], cmd.args[1]);
            const c2 = mapPt(cmd.args[2], cmd.args[3]);
            const p = mapPt(cmd.args[4], cmd.args[5]);
            if (emitSegments) {
              segments.push(
                `C ${fmtMm(c1.x)} ${fmtMm(c1.y)} ${fmtMm(c2.x)} ${fmtMm(c2.y)} ${fmtMm(p.x)} ${fmtMm(p.y)}`,
              );
            }
            break;
          }
          case 'closePath': {
            if (emitSegments) segments.push('Z');
            break;
          }
        }
      }

      cursorX += pos.xAdvance + trackingUnits;
    }
  }

  if (!Number.isFinite(minX) || (emitSegments && segments.length === 0)) {
    return { compoundD: '', bounds: null };
  }

  return {
    compoundD: emitSegments ? segments.join(' ') : '',
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(0.5, maxX - minX),
      height: Math.max(0.5, maxY - minY),
    },
  };
}

function bakeGlyphRunsToPaths(
  runs: readonly GlyphRunPlacement[],
  fontBytes: Uint8Array,
  originXMm: number,
  originYMm: number,
  canvasWidthMm: number,
  mirrorX: boolean,
): BakedLetteringPaths {
  if (runs.length === 0) {
    return { compoundD: '', bounds: null };
  }
  const fk = fontkit as unknown as FontkitModule;
  const font = fk.create(fontBytes);
  return bakeGlyphRunsWithFont(runs, font, originXMm, originYMm, canvasWidthMm, mirrorX, true);
}

function buildSpineGlyphRuns(
  geometry: CaseGeometry,
  studio: CoverStudioState,
): readonly GlyphRunPlacement[] {
  return computeSpineTextPlacements(geometry, studio).map((p) => ({
    text: p.text,
    anchorXMm: p.anchorXMm,
    anchorYMm: p.anchorYMm,
    fontSizePt: p.fontSizePt,
    rotationDegCss: p.rotationDegCss,
    align: 'center' as const,
    letterSpacingEm: 0,
  }));
}

function buildCoverTextGlyphRuns(layer: CoverTextLayer): readonly GlyphRunPlacement[] {
  const lineItems = computeCoverTextLinePlacements(layer);
  const rot = normalizeQuarterTurn(layer.rotationDeg);
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return lineItems.map((item) => {
    const dyLine = (layer.flipY ? -1 : 1) * (item.anchorYMm - layer.yMm);
    const anchorXMm = roundTo(layer.xMm - dyLine * sin, 3);
    const anchorYMm = roundTo(layer.yMm + dyLine * cos, 3);
    return {
      text: item.text,
      anchorXMm,
      anchorYMm,
      fontSizePt: item.fontSizePt,
      rotationDegCss: rot,
      align: item.align,
      letterSpacingEm: item.letterSpacingEm,
      flipX: layer.flipX,
      flipY: layer.flipY,
    };
  });
}

/**
 * Bakes all spine typography placements into a single flattened compound SVG path string
 * in exact absolute millimeter coordinates (zero <text> tags, zero SVG transform attributes).
 */
export function bakeSpineLetteringToPaths(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  fontBytes: Uint8Array,
  originXMm: number,
  originYMm: number,
  canvasWidthMm: number,
  mirrorX: boolean,
): BakedLetteringPaths {
  return bakeGlyphRunsToPaths(
    buildSpineGlyphRuns(geometry, studio),
    fontBytes,
    originXMm,
    originYMm,
    canvasWidthMm,
    mirrorX,
  );
}

/** Bakes a draggable CoverTextLayer (Front / Back / Spine) into flattened 1:1 mm Bezier cut paths. */
export function bakeCoverTextLayerToPaths(
  layer: CoverTextLayer,
  fontBytes: Uint8Array,
  originXMm: number,
  originYMm: number,
  canvasWidthMm: number,
  mirrorX: boolean,
): BakedLetteringPaths {
  return bakeGlyphRunsToPaths(
    buildCoverTextGlyphRuns(layer),
    fontBytes,
    originXMm,
    originYMm,
    canvasWidthMm,
    mirrorX,
  );
}

function mergeBounds(a: Rect2D | null, b: Rect2D | null): Rect2D | null {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Builds crisp closed L-bracket corner registration marks as filled polygons (no stroke ambiguity in Cricut). */
function buildCornerBracketsPath(
  rects: readonly Rect2D[],
  canvasWidthMm: number,
  mirrorX: boolean,
): string {
  const parts: string[] = [];
  const barThickness = 0.65;

  const rectPoly = (x: number, y: number, w: number, h: number): string => {
    const x1 = mirrorX ? canvasWidthMm - (x + w) : x;
    const x2 = x1 + w;
    return `M ${fmtMm(x1)} ${fmtMm(y)} L ${fmtMm(x2)} ${fmtMm(y)} L ${fmtMm(x2)} ${fmtMm(y + h)} L ${fmtMm(x1)} ${fmtMm(y + h)} Z`;
  };

  for (const r of rects) {
    const arm = Math.min(5.0, Math.max(2.2, r.width * 0.28), Math.max(2.2, r.height * 0.1));
    // Top-left L
    parts.push(rectPoly(r.x, r.y, arm, barThickness));
    parts.push(rectPoly(r.x, r.y, barThickness, arm));
    // Top-right L
    parts.push(rectPoly(r.x + r.width - arm, r.y, arm, barThickness));
    parts.push(rectPoly(r.x + r.width - barThickness, r.y, barThickness, arm));
    // Bottom-left L
    parts.push(rectPoly(r.x, r.y + r.height - barThickness, arm, barThickness));
    parts.push(rectPoly(r.x, r.y + r.height - arm, barThickness, arm));
    // Bottom-right L
    parts.push(rectPoly(r.x + r.width - arm, r.y + r.height - barThickness, arm, barThickness));
    parts.push(rectPoly(r.x + r.width - barThickness, r.y + r.height - arm, barThickness, arm));
  }

  return parts.join(' ');
}

function buildRectStrokePath(rect: Rect2D): string {
  const x1 = rect.x;
  const y1 = rect.y;
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return `M ${fmtMm(x1)} ${fmtMm(y1)} L ${fmtMm(x2)} ${fmtMm(y1)} L ${fmtMm(x2)} ${fmtMm(y2)} L ${fmtMm(x1)} ${fmtMm(y2)} Z`;
}

/**
 * Generates a Cricut Design Space / Silhouette Studio / ScanNCut ready 1:1 mm vector SVG:
 * - Explicit physical `width="...mm" height="...mm"` + `viewBox`
 * - Zero `<text>` tags, zero `transform="..."` attributes, zero embedded rasters
 * - Compound vector `<path>` layers separated cleanly by color for automatic mat grouping
 */
export async function generateCricutHtvSvg(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options: CricutExportOptions = DEFAULT_CRICUT_EXPORT_OPTIONS,
  overrideFontBytes?: Uint8Array | null,
): Promise<CricutExportResult> {
  const { outerWrap } = geometry;
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const bleed = spec.bleedMm;

  const isFullWrap = options.scope === 'full-wrap';
  const matPad = 6;
  const scopeRect: Rect2D =
    options.scope === 'spine-only'
      ? outerWrap.spineRect
      : options.scope === 'front-cover'
        ? outerWrap.frontBoardRect
        : options.scope === 'back-cover'
          ? outerWrap.backBoardRect
          : { x: 0, y: 0, width: outerWrap.widthMm, height: outerWrap.heightMm };

  const scopeBoardCanvasRect: Rect2D = {
    x: scopeRect.x + bleed,
    y: scopeRect.y + bleed,
    width: scopeRect.width,
    height: scopeRect.height,
  };

  const fk = fontkit as unknown as FontkitModule;
  const fontCache = new Map<StudioFontId, FontkitFont | null>();

  const loadFontCached = async (fontId: StudioFontId): Promise<FontkitFont | null> => {
    if (fontCache.has(fontId)) {
      return fontCache.get(fontId) ?? null;
    }
    const bytes = await resolveFontBytesById(fontId, customFont, overrideFontBytes);
    const parsed = bytes ? fk.create(bytes) : null;
    fontCache.set(fontId, parsed);
    return parsed;
  };

  // Pass 1: Collect geometrically matched designs and compute exact canvas-space bounding box
  // so overhanging artwork (e.g. turn-ins, hinges, or dust-jacket/slip-cover flaps) expands viewBox cleanly.
  const matchedSpineRuns: readonly GlyphRunPlacement[] =
    options.includeLettering && (options.scope === 'spine-only' || isFullWrap)
      ? buildSpineGlyphRuns(geometry, studio)
      : [];
  const spineFont =
    matchedSpineRuns.length > 0 ? await loadFontCached(studio.spineText.fontId) : null;

  const matchedTextItems: {
    readonly layer: CoverTextLayer;
    readonly runs: readonly GlyphRunPlacement[];
    readonly font: FontkitFont;
  }[] = [];

  if (options.includeLettering) {
    for (const layer of studio.textLayers ?? []) {
      if (!textLayerMatchesScope(layer, options.scope, spec)) continue;
      const font = await loadFontCached(layer.fontId);
      if (!font) continue;
      matchedTextItems.push({
        layer,
        runs: buildCoverTextGlyphRuns(layer),
        font,
      });
    }
  }

  const includeOrnaments = options.includeOrnaments ?? true;
  const matchedOrnaments: CoverOrnamentLayer[] = includeOrnaments
    ? (studio.ornaments ?? []).filter((orn) => ornamentMatchesScope(orn, options.scope, spec))
    : [];

  const includeSvgArtwork = options.includeSvgArtwork ?? true;
  const matchedSvgArtwork: {
    readonly layer: CoverImageLayer;
    readonly parsed: ParsedSvgStamp;
    readonly primaryHex: string;
  }[] = [];
  if (includeSvgArtwork) {
    for (const layer of studio.layers ?? []) {
      if (!svgArtworkMatchesScope(layer, options.scope, spec)) continue;
      const parsedEntry = parseSvgArtworkLayer(layer);
      if (!parsedEntry) continue;
      matchedSvgArtwork.push({
        layer,
        parsed: parsedEntry.parsed,
        primaryHex: parsedEntry.primaryHex,
      });
    }
  }

  let canvasDesignBounds: Rect2D | null = null;
  if (spineFont && matchedSpineRuns.length > 0) {
    const measured = bakeGlyphRunsWithFont(matchedSpineRuns, spineFont, 0, 0, 0, false, false);
    canvasDesignBounds = mergeBounds(canvasDesignBounds, measured.bounds);
  }
  for (const item of matchedTextItems) {
    const measured = bakeGlyphRunsWithFont(item.runs, item.font, 0, 0, 0, false, false);
    canvasDesignBounds = mergeBounds(canvasDesignBounds, measured.bounds);
  }
  for (const orn of matchedOrnaments) {
    if (orn.presetId === 'custom-svg' && (!orn.customSvgPaths || orn.customSvgPaths.length === 0)) {
      continue;
    }
    const style = getOrnamentSvgStyle(orn);
    const halfStroke = style.stroke !== 'none' && style.strokeWidthMm > 0 ? style.strokeWidthMm / 2 : 0;
    canvasDesignBounds = mergeBounds(canvasDesignBounds, {
      x: orn.xMm - halfStroke,
      y: orn.yMm - halfStroke,
      width: orn.widthMm + halfStroke * 2,
      height: orn.heightMm + halfStroke * 2,
    });
  }
  for (const item of matchedSvgArtwork) {
    const vis = getLayerVisualRect(item.layer);
    const halfStroke = item.parsed.suggestedMode === 'fill' ? 0 : 0.3;
    canvasDesignBounds = mergeBounds(canvasDesignBounds, {
      x: vis.x - halfStroke,
      y: vis.y - halfStroke,
      width: vis.width + halfStroke * 2,
      height: vis.height + halfStroke * 2,
    });
  }

  // Compute final viewBox as the union of the physical scope board box (+ matPad)
  // and the matched design bounds (+ matPad, which comfortably fits the +4 mm weeding box).
  let minXMm: number;
  let minYMm: number;
  let maxXMm: number;
  let maxYMm: number;

  if (isFullWrap) {
    const baseMinX = bleed;
    const baseMinY = bleed;
    const baseMaxX = bleed + outerWrap.widthMm;
    const baseMaxY = bleed + outerWrap.heightMm;

    minXMm =
      canvasDesignBounds && canvasDesignBounds.x < baseMinX
        ? Math.min(baseMinX, canvasDesignBounds.x - matPad)
        : baseMinX;
    minYMm =
      canvasDesignBounds && canvasDesignBounds.y < baseMinY
        ? Math.min(baseMinY, canvasDesignBounds.y - matPad)
        : baseMinY;
    maxXMm =
      canvasDesignBounds && canvasDesignBounds.x + canvasDesignBounds.width > baseMaxX
        ? Math.max(baseMaxX, canvasDesignBounds.x + canvasDesignBounds.width + matPad)
        : baseMaxX;
    maxYMm =
      canvasDesignBounds && canvasDesignBounds.y + canvasDesignBounds.height > baseMaxY
        ? Math.max(baseMaxY, canvasDesignBounds.y + canvasDesignBounds.height + matPad)
        : baseMaxY;
  } else {
    const baseMinX = scopeBoardCanvasRect.x - matPad;
    const baseMinY = scopeBoardCanvasRect.y - matPad;
    const baseMaxX = scopeBoardCanvasRect.x + scopeBoardCanvasRect.width + matPad;
    const baseMaxY = scopeBoardCanvasRect.y + scopeBoardCanvasRect.height + matPad;

    minXMm = canvasDesignBounds
      ? Math.min(baseMinX, canvasDesignBounds.x - matPad)
      : baseMinX;
    minYMm = canvasDesignBounds
      ? Math.min(baseMinY, canvasDesignBounds.y - matPad)
      : baseMinY;
    maxXMm = canvasDesignBounds
      ? Math.max(baseMaxX, canvasDesignBounds.x + canvasDesignBounds.width + matPad)
      : baseMaxX;
    maxYMm = canvasDesignBounds
      ? Math.max(baseMaxY, canvasDesignBounds.y + canvasDesignBounds.height + matPad)
      : baseMaxY;
  }

  // Origin in studio canvas coordinates (which include bleed offset)
  const originXMm = roundTo(minXMm, 2);
  const originYMm = roundTo(minYMm, 2);
  const widthMm = roundTo(maxXMm - originXMm, 2);
  const heightMm = roundTo(maxYMm - originYMm, 2);

  // Pass 2: Bake all matched designs into exact 1:1 mm SVG paths in final viewBox coordinates
  const letteringParts: string[] = [];
  const foilColorSet = new Set<string>();
  const filledPathsByColor = new Map<string, string[]>();
  const appendColorPath = (hex: string, pathD: string) => {
    foilColorSet.add(hex);
    const existing = filledPathsByColor.get(hex);
    if (existing) {
      existing.push(pathD);
    } else {
      filledPathsByColor.set(hex, [pathD]);
    }
  };

  let designBounds: Rect2D | null = null;

  if (spineFont && matchedSpineRuns.length > 0) {
    const baked = bakeGlyphRunsWithFont(
      matchedSpineRuns,
      spineFont,
      originXMm,
      originYMm,
      widthMm,
      options.mirrorForHtv,
      true,
    );
    if (baked.compoundD) {
      const spineHex = normalizeFoilHex(studio.spineText.textColor, '#111111');
      letteringParts.push(baked.compoundD);
      appendColorPath(spineHex, baked.compoundD);
      designBounds = mergeBounds(designBounds, baked.bounds);
    }
  }

  for (const item of matchedTextItems) {
    const baked = bakeGlyphRunsWithFont(
      item.runs,
      item.font,
      originXMm,
      originYMm,
      widthMm,
      options.mirrorForHtv,
      true,
    );
    if (baked.compoundD) {
      const textHex = normalizeFoilHex(item.layer.color, '#111111');
      letteringParts.push(baked.compoundD);
      appendColorPath(textHex, baked.compoundD);
      designBounds = mergeBounds(designBounds, baked.bounds);
    }
  }

  const letteringD = letteringParts.join(' ');

  // 3. Classic Bookbindery Vector Ornaments & Custom SVG Stamps
  const groupByColor = Boolean(options.groupByColor);
  const filledOrnamentParts: string[] = [];
  const strokedOrnaments: {
    readonly id: string;
    readonly d: string;
    readonly strokeWidthMm: number;
    readonly hex: string;
  }[] = [];
  for (const orn of matchedOrnaments) {
    const d = buildOrnamentCompoundPath(orn, {
      originXMm,
      originYMm,
      canvasWidthMm: widthMm,
      mirrorX: options.mirrorForHtv,
    });
    if (!d) continue;
    const style = getOrnamentSvgStyle(orn);
    const ornHex = normalizeFoilHex(orn.color, '#222222');
    if (style.fill !== 'none') {
      filledOrnamentParts.push(d);
      appendColorPath(ornHex, d);
    }
    if (style.stroke !== 'none' && style.strokeWidthMm > 0) {
      foilColorSet.add(ornHex);
      strokedOrnaments.push({
        id: orn.id,
        d,
        strokeWidthMm: style.strokeWidthMm,
        hex: ornHex,
      });
    }
    const rawX = orn.xMm - originXMm;
    const ornX = options.mirrorForHtv ? widthMm - (rawX + orn.widthMm) : rawX;
    designBounds = mergeBounds(designBounds, {
      x: ornX,
      y: orn.yMm - originYMm,
      width: orn.widthMm,
      height: orn.heightMm,
    });
  }
  const ornamentsD = filledOrnamentParts.join(' ');

  // 3b. Uploaded .svg Artwork Layers (parsed to 1:1 mm Bezier curves, zero <image> or transform=)
  const filledSvgArtworkParts: string[] = [];
  const strokedSvgArtwork: {
    readonly id: string;
    readonly d: string;
    readonly strokeWidthMm: number;
    readonly hex: string;
  }[] = [];
  for (const item of matchedSvgArtwork) {
    const mapped = mapNormalizedPathsToMm(
      item.parsed.paths,
      item.parsed.viewBoxWidth,
      item.parsed.viewBoxHeight,
      {
        xMm: item.layer.xMm,
        yMm: item.layer.yMm,
        widthMm: item.layer.widthMm,
        heightMm: item.layer.heightMm,
      },
      {
        originXMm,
        originYMm,
        canvasWidthMm: widthMm,
        mirrorX: options.mirrorForHtv,
        flipX: item.layer.flipX,
        flipY: item.layer.flipY,
        rotationDeg: normalizeQuarterTurn(item.layer.rotationDeg),
      },
    );
    const d = mapped.filter(Boolean).join(' ');
    if (!d) continue;

    if (item.parsed.suggestedMode === 'stroke') {
      foilColorSet.add(item.primaryHex);
      strokedSvgArtwork.push({
        id: item.layer.id,
        d,
        strokeWidthMm: 0.6,
        hex: item.primaryHex,
      });
    } else if (item.parsed.suggestedMode === 'fill-and-stroke') {
      filledSvgArtworkParts.push(d);
      appendColorPath(item.primaryHex, d);
      strokedSvgArtwork.push({
        id: item.layer.id,
        d,
        strokeWidthMm: 0.6,
        hex: item.primaryHex,
      });
    } else {
      filledSvgArtworkParts.push(d);
      appendColorPath(item.primaryHex, d);
    }

    const vis = getLayerVisualRect(item.layer);
    const rawX = vis.x - originXMm;
    const visX = options.mirrorForHtv ? widthMm - (rawX + vis.width) : rawX;
    designBounds = mergeBounds(designBounds, {
      x: visX,
      y: vis.y - originYMm,
      width: vis.width,
      height: vis.height,
    });
  }
  const svgArtworkD = filledSvgArtworkParts.join(' ');

  const pathElements: string[] = [];

  // 1. Optional Outer Case Wrap Cut Outline (separate vermilion cut layer for bookcloth/paper cutting)
  if (isFullWrap && options.includeOuterCutOutline) {
    const poly = outerWrap.outerCutPolygon.map((pt) => {
      const shiftedX = pt.x + bleed - originXMm;
      return {
        x: options.mirrorForHtv ? widthMm - shiftedX : shiftedX,
        y: pt.y + bleed - originYMm,
      };
    });
    const cutD = GeometryPrimitives.polygonToSvgPath(poly, 3);
    pathElements.push(
      `  <path id="outer-wrap-cut" d="${cutD}" fill="none" stroke="#D93829" stroke-width="0.35" />`,
    );
  }

  // 2. Optional Alignment Corner Registration L-Brackets (anchored strictly to true physical board corners)
  if (options.includeRegistrationMarks) {
    const targetRects: Rect2D[] = isFullWrap
      ? [outerWrap.backBoardRect, outerWrap.spineRect, outerWrap.frontBoardRect].map((r) => ({
          x: r.x + bleed - originXMm,
          y: r.y + bleed - originYMm,
          width: r.width,
          height: r.height,
        }))
      : [
          {
            x: scopeBoardCanvasRect.x - originXMm,
            y: scopeBoardCanvasRect.y - originYMm,
            width: scopeBoardCanvasRect.width,
            height: scopeBoardCanvasRect.height,
          },
        ];
    const regD = buildCornerBracketsPath(targetRects, widthMm, options.mirrorForHtv);
    pathElements.push(
      `  <path id="alignment-registration-marks" d="${regD}" fill="#B48327" fill-rule="nonzero" />`,
    );
  }

  // 3. Optional HTV Weeding Box (+4 mm around baked lettering + ornament bounds, separate blue cut layer)
  if (options.includeWeedingBox && designBounds) {
    const pad = 4.0;
    const wx = Math.max(0.5, designBounds.x - pad);
    const wy = Math.max(0.5, designBounds.y - pad);
    const wx2 = Math.min(widthMm - 0.5, designBounds.x + designBounds.width + pad);
    const wy2 = Math.min(heightMm - 0.5, designBounds.y + designBounds.height + pad);
    if (wx2 > wx + 2 && wy2 > wy + 2) {
      const weedD = buildRectStrokePath({
        x: wx,
        y: wy,
        width: wx2 - wx,
        height: wy2 - wy,
      });
      pathElements.push(
        `  <path id="htv-weeding-box" d="${weedD}" fill="none" stroke="#1D5BD6" stroke-width="0.35" />`,
      );
    }
  }

  // 4 & 5. Ornaments, Parsed SVG Artwork, and Outlined Lettering (grouped by foil color OR classic monochrome layers)
  if (groupByColor) {
    for (const [hex, parts] of filledPathsByColor.entries()) {
      const compoundD = parts.join(' ');
      if (!compoundD) continue;
      const hexNoHash = hex.slice(1).toLowerCase();
      pathElements.push(
        `  <path id="foil-color-${hexNoHash}" d="${compoundD}" fill="${hex}" fill-rule="nonzero" />`,
      );
    }
    for (const st of strokedOrnaments) {
      pathElements.push(
        `  <path id="custom-svg-stroke-${st.id}" d="${st.d}" fill="none" stroke="${st.hex}" stroke-width="${fmtMm(st.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round" />`,
      );
    }
    for (const st of strokedSvgArtwork) {
      pathElements.push(
        `  <path id="svg-artwork-stroke-${st.id}" d="${st.d}" fill="none" stroke="${st.hex}" stroke-width="${fmtMm(st.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round" />`,
      );
    }
  } else {
    // Uploaded .svg Artwork Layers parsed to cuttable vector paths
    if (svgArtworkD) {
      pathElements.push(
        `  <path id="svg-artwork" d="${svgArtworkD}" fill="#222222" fill-rule="nonzero" />`,
      );
    }
    for (const st of strokedSvgArtwork) {
      pathElements.push(
        `  <path id="svg-artwork-stroke-${st.id}" d="${st.d}" fill="none" stroke="#222222" stroke-width="${fmtMm(st.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round" />`,
      );
    }

    // Classic Bookbindery Vector Ornaments & Custom SVG Stamps (separate foil/HTV cut paths)
    if (ornamentsD) {
      pathElements.push(
        `  <path id="classic-ornaments" d="${ornamentsD}" fill="#222222" fill-rule="nonzero" />`,
      );
    }
    for (const st of strokedOrnaments) {
      pathElements.push(
        `  <path id="custom-svg-stroke-${st.id}" d="${st.d}" fill="none" stroke="#222222" stroke-width="${fmtMm(st.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round" />`,
      );
    }

    // Outlined Compound Vector Lettering (solid lampblack fill — Cricut Basic Cut / HTV)
    if (letteringD) {
      pathElements.push(
        `  <path id="spine-lettering" d="${letteringD}" fill="#111111" fill-rule="nonzero" />`,
      );
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(widthMm)}mm"
     height="${fmtMm(heightMm)}mm"
     viewBox="0 0 ${fmtMm(widthMm)} ${fmtMm(heightMm)}">
${pathElements.join('\n')}
</svg>
`;

  const minSide = Math.min(widthMm, heightMm);
  const maxSide = Math.max(widthMm, heightMm);
  // Cricut real cuttable areas: Joy ~114x304mm (4.5x12"), 12x12" mat ~292x292mm, 12x24" mat ~292x596mm
  const fitsCricutJoy = minSide <= 114 && maxSide <= 304;
  const fitsStandard12x12 = widthMm <= 292 && heightMm <= 292;
  const fitsLarge12x24 = minSide <= 292 && maxSide <= 596;

  const fileName = buildCricutFileName(studio, options);

  return {
    svg,
    widthMm,
    heightMm,
    pathCount: pathElements.length,
    hasLettering: Boolean(
      letteringD ||
        ornamentsD ||
        strokedOrnaments.length > 0 ||
        svgArtworkD ||
        strokedSvgArtwork.length > 0,
    ),
    foilColors: Array.from(foilColorSet),
    fitsCricutJoy,
    fitsStandard12x12,
    fitsLarge12x24,
    fileName,
  };
}
