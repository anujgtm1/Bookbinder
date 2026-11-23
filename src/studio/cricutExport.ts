import fontkit from '@pdf-lib/fontkit';
import type { CoverTextLayer } from '@/types/coverElements';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import type { CoverStudioState, CuratedFontId, StudioFontId } from '@/types/studio';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from './classicOrnaments';
import { loadCuratedFontBytes, type CustomFontAsset } from './fonts';
import {
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
} from './renderEngine';

export type CricutCanvasScope = 'spine-only' | 'front-cover' | 'back-cover' | 'full-wrap';

export interface CricutExportOptions {
  /** 'spine-only', 'front-cover', 'back-cover', or 'full-wrap' */
  readonly scope: CricutCanvasScope;
  /** Convert spine & cover text layers to flattened vector <path> outlines (zero <text> tags) */
  readonly includeLettering: boolean;
  /** Include parametric classic bookbindery vector ornaments in the cut paths (default true) */
  readonly includeOrnaments?: boolean;
  /** Add tight +4 mm cut box around lettering & ornaments for effortless HTV weeding */
  readonly includeWeedingBox: boolean;
  /** Add exact corner L-bracket registration ticks to align iron-on HTV onto wrapped bookcloth */
  readonly includeRegistrationMarks: boolean;
  /** Include exact 1:1 mm outer wrap cut polygon (with 45° miters) for cutting bookcloth/paper */
  readonly includeOuterCutOutline: boolean;
  /** Pre-mirror all coordinates horizontally for HTV iron-on (leave Off if mirroring in Cricut Design Space Make It) */
  readonly mirrorForHtv: boolean;
}

export const DEFAULT_CRICUT_EXPORT_OPTIONS: Readonly<CricutExportOptions> = {
  scope: 'spine-only',
  includeLettering: true,
  includeOrnaments: true,
  includeWeedingBox: true,
  includeRegistrationMarks: true,
  includeOuterCutOutline: false,
  mirrorForHtv: false,
};

export interface CricutExportResult {
  readonly svg: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly pathCount: number;
  readonly hasLettering: boolean;
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

const fmt = (n: number): string => String(roundTo(n, 3));

function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned || 'bookbinder';
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
            segments.push(`M ${fmt(p.x)} ${fmt(p.y)}`);
            break;
          }
          case 'lineTo': {
            const p = mapPt(cmd.args[0], cmd.args[1]);
            segments.push(`L ${fmt(p.x)} ${fmt(p.y)}`);
            break;
          }
          case 'quadraticCurveTo': {
            const c = mapPt(cmd.args[0], cmd.args[1]);
            const p = mapPt(cmd.args[2], cmd.args[3]);
            segments.push(`Q ${fmt(c.x)} ${fmt(c.y)} ${fmt(p.x)} ${fmt(p.y)}`);
            break;
          }
          case 'bezierCurveTo': {
            const c1 = mapPt(cmd.args[0], cmd.args[1]);
            const c2 = mapPt(cmd.args[2], cmd.args[3]);
            const p = mapPt(cmd.args[4], cmd.args[5]);
            segments.push(
              `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p.x)} ${fmt(p.y)}`,
            );
            break;
          }
          case 'closePath': {
            segments.push('Z');
            break;
          }
        }
      }

      cursorX += pos.xAdvance + trackingUnits;
    }
  }

  if (segments.length === 0 || !Number.isFinite(minX)) {
    return { compoundD: '', bounds: null };
  }

  return {
    compoundD: segments.join(' '),
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(0.5, maxX - minX),
      height: Math.max(0.5, maxY - minY),
    },
  };
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
  const placements = computeSpineTextPlacements(geometry, studio);
  return bakeGlyphRunsToPaths(
    placements.map((p) => ({
      text: p.text,
      anchorXMm: p.anchorXMm,
      anchorYMm: p.anchorYMm,
      fontSizePt: p.fontSizePt,
      rotationDegCss: p.rotationDegCss,
      align: 'center' as const,
      letterSpacingEm: 0,
    })),
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
  const lineItems = computeCoverTextLinePlacements(layer);
  return bakeGlyphRunsToPaths(
    lineItems.map((item) => ({
      text: item.text,
      anchorXMm: item.anchorXMm,
      anchorYMm: layer.flipY ? roundTo(2 * layer.yMm - item.anchorYMm, 2) : item.anchorYMm,
      fontSizePt: item.fontSizePt,
      rotationDegCss: 0,
      align: item.align,
      letterSpacingEm: item.letterSpacingEm,
      flipX: layer.flipX,
      flipY: layer.flipY,
    })),
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
    return `M ${fmt(x1)} ${fmt(y)} L ${fmt(x2)} ${fmt(y)} L ${fmt(x2)} ${fmt(y + h)} L ${fmt(x1)} ${fmt(y + h)} Z`;
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
  return `M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)} L ${fmt(x1)} ${fmt(y2)} Z`;
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

  // Origin in studio canvas coordinates (which include bleed offset)
  const originXMm = isFullWrap ? bleed : scopeRect.x + bleed - matPad;
  const originYMm = isFullWrap ? bleed : scopeRect.y + bleed - matPad;

  const widthMm = roundTo(isFullWrap ? outerWrap.widthMm : scopeRect.width + matPad * 2, 2);
  const heightMm = roundTo(isFullWrap ? outerWrap.heightMm : scopeRect.height + matPad * 2, 2);

  const matchesScopeZone = (zone: 'front' | 'back' | 'spine'): boolean => {
    if (isFullWrap) return true;
    if (options.scope === 'spine-only') return zone === 'spine';
    if (options.scope === 'front-cover') return zone === 'front';
    return zone === 'back';
  };

  const letteringParts: string[] = [];
  let designBounds: Rect2D | null = null;
  const fontBytesCache = new Map<StudioFontId, Uint8Array | null>();

  const loadFontCached = async (fontId: StudioFontId): Promise<Uint8Array | null> => {
    if (fontBytesCache.has(fontId)) {
      return fontBytesCache.get(fontId) ?? null;
    }
    const bytes = await resolveFontBytesById(fontId, customFont, overrideFontBytes);
    fontBytesCache.set(fontId, bytes);
    return bytes;
  };

  if (options.includeLettering) {
    // 1. Dedicated Spine Typography (included in spine-only & full-wrap)
    if (options.scope === 'spine-only' || isFullWrap) {
      const spineFontBytes = await loadFontCached(studio.spineText.fontId);
      if (spineFontBytes) {
        const baked = bakeSpineLetteringToPaths(
          geometry,
          studio,
          spineFontBytes,
          originXMm,
          originYMm,
          widthMm,
          options.mirrorForHtv,
        );
        if (baked.compoundD) {
          letteringParts.push(baked.compoundD);
          designBounds = mergeBounds(designBounds, baked.bounds);
        }
      }
    }

    // 2. Draggable Front / Back / Spine Cover Text Layers
    for (const layer of studio.textLayers ?? []) {
      if (!matchesScopeZone(layer.zone)) continue;
      const layerFontBytes = await loadFontCached(layer.fontId);
      if (!layerFontBytes) continue;
      const baked = bakeCoverTextLayerToPaths(
        layer,
        layerFontBytes,
        originXMm,
        originYMm,
        widthMm,
        options.mirrorForHtv,
      );
      if (baked.compoundD) {
        letteringParts.push(baked.compoundD);
        designBounds = mergeBounds(designBounds, baked.bounds);
      }
    }
  }

  const letteringD = letteringParts.join(' ');

  // 3. Classic Bookbindery Vector Ornaments & Custom SVG Stamps
  const includeOrnaments = options.includeOrnaments ?? true;
  const filledOrnamentParts: string[] = [];
  const strokedOrnamentEls: string[] = [];
  if (includeOrnaments) {
    for (const orn of studio.ornaments ?? []) {
      if (!matchesScopeZone(orn.zone)) continue;
      const d = buildOrnamentCompoundPath(orn, {
        originXMm,
        originYMm,
        canvasWidthMm: widthMm,
        mirrorX: options.mirrorForHtv,
      });
      if (!d) continue;
      const style = getOrnamentSvgStyle(orn);
      if (style.fill !== 'none') {
        filledOrnamentParts.push(d);
      }
      if (style.stroke !== 'none' && style.strokeWidthMm > 0) {
        strokedOrnamentEls.push(
          `  <path id="custom-svg-stroke-${orn.id}" d="${d}" fill="none" stroke="#222222" stroke-width="${fmt(style.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round" />`,
        );
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
  }
  const ornamentsD = filledOrnamentParts.join(' ');

  const pathElements: string[] = [];

  // 1. Optional Outer Case Wrap Cut Outline (separate vermilion cut layer for bookcloth/paper cutting)
  if (isFullWrap && options.includeOuterCutOutline) {
    const poly = options.mirrorForHtv
      ? outerWrap.outerCutPolygon.map((pt) => ({ x: widthMm - pt.x, y: pt.y }))
      : outerWrap.outerCutPolygon;
    const cutD = GeometryPrimitives.polygonToSvgPath(poly, 3);
    pathElements.push(
      `  <path id="outer-wrap-cut" d="${cutD}" fill="none" stroke="#D93829" stroke-width="0.35" />`,
    );
  }

  // 2. Optional Alignment Corner Registration L-Brackets (separate brass/amber layer)
  if (options.includeRegistrationMarks) {
    const targetRects: Rect2D[] = isFullWrap
      ? [outerWrap.backBoardRect, outerWrap.spineRect, outerWrap.frontBoardRect]
      : [
          {
            x: matPad,
            y: matPad,
            width: scopeRect.width,
            height: scopeRect.height,
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

  // 4. Classic Bookbindery Vector Ornaments & Custom SVG Stamps (separate foil/HTV cut paths)
  if (ornamentsD) {
    pathElements.push(
      `  <path id="classic-ornaments" d="${ornamentsD}" fill="#222222" fill-rule="nonzero" />`,
    );
  }
  for (const el of strokedOrnamentEls) {
    pathElements.push(el);
  }

  // 5. Outlined Compound Vector Lettering (solid lampblack fill — Cricut Basic Cut / HTV)
  if (letteringD) {
    pathElements.push(
      `  <path id="spine-lettering" d="${letteringD}" fill="#111111" fill-rule="nonzero" />`,
    );
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmt(widthMm)}mm"
     height="${fmt(heightMm)}mm"
     viewBox="0 0 ${fmt(widthMm)} ${fmt(heightMm)}">
${pathElements.join('\n')}
</svg>
`;

  const minSide = Math.min(widthMm, heightMm);
  const maxSide = Math.max(widthMm, heightMm);
  // Cricut real cuttable areas: Joy ~114x304mm (4.5x12"), 12x12" mat ~292x292mm, 12x24" mat ~292x596mm
  const fitsCricutJoy = minSide <= 114 && maxSide <= 304;
  const fitsStandard12x12 = widthMm <= 292 && heightMm <= 292;
  const fitsLarge12x24 = minSide <= 292 && maxSide <= 596;

  const firstFrontText = (studio.textLayers ?? []).find((t) => t.zone === 'front')?.text ?? '';
  const baseSlug = slugifyTitle(studio.spineText.title || firstFrontText);
  const scopeSlug =
    options.scope === 'spine-only'
      ? 'spine'
      : options.scope === 'front-cover'
        ? 'front'
        : options.scope === 'back-cover'
          ? 'back'
          : 'fullwrap';
  const mirrorSlug = options.mirrorForHtv ? '_mirrored' : '';
  const fileName = `${baseSlug}_cricut_htv_${scopeSlug}${mirrorSlug}.svg`;

  return {
    svg,
    widthMm,
    heightMm,
    pathCount: pathElements.length,
    hasLettering: Boolean(letteringD || ornamentsD || strokedOrnamentEls.length > 0),
    fitsCricutJoy,
    fitsStandard12x12,
    fitsLarge12x24,
    fileName,
  };
}
