import fontkit from '@pdf-lib/fontkit';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import type { CoverStudioState, CuratedFontId } from '@/types/studio';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { loadCuratedFontBytes, type CustomFontAsset } from './fonts';
import { computeSpineTextPlacements, computeStudioCanvasSpec } from './renderEngine';

export type CricutCanvasScope = 'spine-only' | 'full-wrap';

export interface CricutExportOptions {
  /** 'spine-only' exports a compact SPINE_W × BOARD_H mat (fits Cricut Joy); 'full-wrap' exports full WRAP_W × WRAP_H */
  readonly scope: CricutCanvasScope;
  /** Convert spine title & author lettering to flattened vector <path> outlines (zero <text> tags) */
  readonly includeLettering: boolean;
  /** Add tight +4 mm cut box around lettering for effortless HTV weeding */
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
export async function resolveOutlineFontBytes(
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  overrideBytes?: Uint8Array | null,
): Promise<Uint8Array | null> {
  if (overrideBytes && overrideBytes.byteLength > 0) {
    return overrideBytes;
  }
  if (studio.spineText.fontId === 'custom' && customFont && customFont.pdfEmbeddable) {
    return customFont.bytes;
  }
  const curatedId: CuratedFontId =
    studio.spineText.fontId === 'custom' ? 'eb-garamond' : studio.spineText.fontId;
  const loaded = await loadCuratedFontBytes(curatedId);
  if (loaded) return loaded;
  return loadCuratedFontBytes('eb-garamond');
}

interface BakedLetteringPaths {
  readonly compoundD: string;
  readonly bounds: Rect2D | null;
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
  if (placements.length === 0) {
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

  for (const placement of placements) {
    const run = font.layout(placement.text);
    const totalAdvance = run.positions.reduce((sum, p) => sum + p.xAdvance, 0);
    const scale = UnitConverter.pointsToMm(placement.fontSizePt) / upem;

    const rad = (placement.rotationDegCss * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchorX = placement.anchorXMm - originXMm;
    const anchorY = placement.anchorYMm - originYMm;

    let cursorX = 0;
    for (let i = 0; i < run.glyphs.length; i++) {
      const glyph = run.glyphs[i];
      const pos = run.positions[i];
      const cmds = glyph.path?.commands ?? [];

      const mapPt = (fx: number, fy: number): { readonly x: number; readonly y: number } => {
        const lx = (cursorX + pos.xOffset + fx - totalAdvance / 2) * scale;
        const ly = -(pos.yOffset + fy - verticalCenterFontUnits) * scale;
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

      cursorX += pos.xAdvance;
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

  const isSpineOnly = options.scope === 'spine-only';
  const spinePadX = 6;
  const spinePadY = 6;

  // Origin in studio canvas coordinates (which include bleed offset)
  const originXMm = isSpineOnly ? outerWrap.spineRect.x + bleed - spinePadX : bleed;
  const originYMm = isSpineOnly ? outerWrap.spineRect.y + bleed - spinePadY : bleed;

  const widthMm = roundTo(
    isSpineOnly ? outerWrap.spineRect.width + spinePadX * 2 : outerWrap.widthMm,
    2,
  );
  const heightMm = roundTo(
    isSpineOnly ? outerWrap.spineRect.height + spinePadY * 2 : outerWrap.heightMm,
    2,
  );

  let letteringD = '';
  let letteringBounds: Rect2D | null = null;

  if (options.includeLettering) {
    const fontBytes = await resolveOutlineFontBytes(studio, customFont, overrideFontBytes);
    if (fontBytes) {
      const baked = bakeSpineLetteringToPaths(
        geometry,
        studio,
        fontBytes,
        originXMm,
        originYMm,
        widthMm,
        options.mirrorForHtv,
      );
      letteringD = baked.compoundD;
      letteringBounds = baked.bounds;
    }
  }

  const pathElements: string[] = [];

  // 1. Optional Outer Case Wrap Cut Outline (separate vermilion cut layer for bookcloth/paper cutting)
  if (!isSpineOnly && options.includeOuterCutOutline) {
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
    const targetRects: Rect2D[] = isSpineOnly
      ? [
          {
            x: spinePadX,
            y: spinePadY,
            width: outerWrap.spineRect.width,
            height: outerWrap.spineRect.height,
          },
        ]
      : [outerWrap.backBoardRect, outerWrap.spineRect, outerWrap.frontBoardRect];
    const regD = buildCornerBracketsPath(targetRects, widthMm, options.mirrorForHtv);
    pathElements.push(
      `  <path id="alignment-registration-marks" d="${regD}" fill="#B48327" fill-rule="nonzero" />`,
    );
  }

  // 3. Optional HTV Weeding Box (+4 mm around baked lettering bounds, separate blue cut layer)
  if (options.includeWeedingBox && letteringBounds) {
    const pad = 4.0;
    const wx = Math.max(0.5, letteringBounds.x - pad);
    const wy = Math.max(0.5, letteringBounds.y - pad);
    const wx2 = Math.min(widthMm - 0.5, letteringBounds.x + letteringBounds.width + pad);
    const wy2 = Math.min(heightMm - 0.5, letteringBounds.y + letteringBounds.height + pad);
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

  // 4. Outlined Compound Vector Spine Lettering (solid lampblack fill — Cricut Basic Cut / HTV)
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

  const baseSlug = slugifyTitle(studio.spineText.title);
  const scopeSlug = isSpineOnly ? 'spine' : 'fullwrap';
  const mirrorSlug = options.mirrorForHtv ? '_mirrored' : '';
  const fileName = `${baseSlug}_cricut_htv_${scopeSlug}${mirrorSlug}.svg`;

  return {
    svg,
    widthMm,
    heightMm,
    pathCount: pathElements.length,
    hasLettering: Boolean(letteringD),
    fitsCricutJoy,
    fitsStandard12x12,
    fitsLarge12x24,
    fileName,
  };
}
