import { fmtMm } from '@/lib/svgFormat';
import {
  CLASSIC_ORNAMENTS,
  getStaticOrnamentStamp,
  isStaticOrnamentId,
  type ClassicOrnamentSpec,
} from '@/resources/ornaments';
import type { ClassicOrnamentId, CoverOrnamentLayer } from '@/types/coverElements';
import { normalizeQuarterTurn, type QuarterTurnDeg } from '@/types/studioLayer';
import {
  PARAMETRIC_ORNAMENT_GENERATORS,
  type ParametricOrnamentId,
} from './ornaments/parametricGenerators';
import { mapNormalizedPathsToMm } from './svgStampParser';

export { CLASSIC_ORNAMENTS, type ClassicOrnamentSpec };

export function getClassicOrnamentSpec(id: ClassicOrnamentId): ClassicOrnamentSpec {
  if (id === 'custom-svg') {
    return {
      id: 'custom-svg',
      label: 'Custom SVG Stamp',
      category: 'emblems',
      defaultZone: 'front',
      description: 'User-imported vector SVG stamp',
    };
  }
  return CLASSIC_ORNAMENTS.find((o) => o.id === id) ?? CLASSIC_ORNAMENTS[0];
}

export interface OrnamentSvgRenderStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidthMm: number;
}

/** Resolves fill & stroke styling for built-in parametric ornaments and custom imported SVG stamps. */
export function getOrnamentSvgStyle(ornament: CoverOrnamentLayer): OrnamentSvgRenderStyle {
  if (ornament.presetId !== 'custom-svg') {
    return { fill: ornament.color, stroke: 'none', strokeWidthMm: 0 };
  }
  const mode = ornament.customSvgRenderMode ?? 'fill';
  if (mode === 'stroke') {
    return { fill: 'none', stroke: ornament.color, strokeWidthMm: ornament.strokeWidthMm };
  }
  if (mode === 'fill-and-stroke') {
    return { fill: ornament.color, stroke: ornament.color, strokeWidthMm: ornament.strokeWidthMm };
  }
  return { fill: ornament.color, stroke: 'none', strokeWidthMm: 0 };
}

export interface OrnamentPathTransform {
  readonly originXMm?: number;
  readonly originYMm?: number;
  readonly canvasWidthMm?: number;
  readonly mirrorX?: boolean;
}

const ABS_PATH_TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function bakeQuarterTurnIntoPath(
  d: string,
  cx: number,
  cy: number,
  rot: Exclude<QuarterTurnDeg, 0>,
  transform?: OrnamentPathTransform,
): string {
  const tokens = d.match(ABS_PATH_TOKEN_RE);
  if (!tokens || tokens.length === 0) return '';

  const ox = transform?.originXMm ?? 0;
  const oy = transform?.originYMm ?? 0;
  const mirrorX = transform?.mirrorX ?? false;
  const canvasW = transform?.canvasWidthMm ?? 0;

  const mapPair = (x: number, y: number): string => {
    const dx = x - cx;
    const dy = y - cy;
    let rx: number;
    let ry: number;
    if (rot === 90) {
      rx = -dy;
      ry = dx;
    } else if (rot === 180) {
      rx = -dx;
      ry = -dy;
    } else {
      rx = dy;
      ry = -dx;
    }
    const rawX = cx + rx - ox;
    const finalX = mirrorX ? canvasW - rawX : rawX;
    const finalY = cy + ry - oy;
    return `${fmtMm(finalX)} ${fmtMm(finalY)}`;
  };

  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'Z') {
      out.push('Z');
    } else if (cmd === 'M' || cmd === 'L') {
      const x = Number.parseFloat(tokens[i++] ?? '0');
      const y = Number.parseFloat(tokens[i++] ?? '0');
      out.push(`${cmd} ${mapPair(x, y)}`);
    } else if (cmd === 'Q') {
      const x1 = Number.parseFloat(tokens[i++] ?? '0');
      const y1 = Number.parseFloat(tokens[i++] ?? '0');
      const x = Number.parseFloat(tokens[i++] ?? '0');
      const y = Number.parseFloat(tokens[i++] ?? '0');
      out.push(`Q ${mapPair(x1, y1)} ${mapPair(x, y)}`);
    } else if (cmd === 'C') {
      const x1 = Number.parseFloat(tokens[i++] ?? '0');
      const y1 = Number.parseFloat(tokens[i++] ?? '0');
      const x2 = Number.parseFloat(tokens[i++] ?? '0');
      const y2 = Number.parseFloat(tokens[i++] ?? '0');
      const x = Number.parseFloat(tokens[i++] ?? '0');
      const y = Number.parseFloat(tokens[i++] ?? '0');
      out.push(`C ${mapPair(x1, y1)} ${mapPair(x2, y2)} ${mapPair(x, y)}`);
    }
  }
  return out.join(' ');
}

function buildUnrotatedOrnamentClosedPaths(
  ornament: CoverOrnamentLayer,
  transform?: OrnamentPathTransform,
): readonly string[] {
  const targetRect = {
    xMm: ornament.xMm,
    yMm: ornament.yMm,
    widthMm: ornament.widthMm,
    heightMm: ornament.heightMm,
  };

  if (ornament.presetId === 'custom-svg') {
    if (!ornament.customSvgPaths || ornament.customSvgPaths.length === 0) return [];
    const vbW = ornament.customSvgViewBox?.width ?? 100;
    const vbH = ornament.customSvgViewBox?.height ?? 100;
    return mapNormalizedPathsToMm(ornament.customSvgPaths, vbW, vbH, targetRect, {
      ...transform,
      flipX: ornament.flipX,
      flipY: ornament.flipY,
    });
  }

  if (isStaticOrnamentId(ornament.presetId)) {
    const stamp = getStaticOrnamentStamp(ornament.presetId);
    if (!stamp) return [];
    return mapNormalizedPathsToMm(
      stamp.paths,
      stamp.viewBoxWidth,
      stamp.viewBoxHeight,
      targetRect,
      { ...transform, flipX: ornament.flipX, flipY: ornament.flipY },
    );
  }

  const ox = transform?.originXMm ?? 0;
  const oy = transform?.originYMm ?? 0;
  const mirrorX = transform?.mirrorX ?? false;
  const canvasW = transform?.canvasWidthMm ?? 0;
  const w = ornament.widthMm;
  const h = ornament.heightMm;
  const t = Math.max(0.35, ornament.strokeWidthMm);

  const mapX = (localX: number): number => {
    const lx = ornament.flipX ? w - localX : localX;
    const raw = ornament.xMm + lx - ox;
    return mirrorX ? canvasW - raw : raw;
  };
  const mapY = (localY: number): number => {
    const ly = ornament.flipY ? h - localY : localY;
    return ornament.yMm + ly - oy;
  };

  const generator = PARAMETRIC_ORNAMENT_GENERATORS[ornament.presetId as ParametricOrnamentId];
  return generator ? generator({ w, h, t, mapX, mapY }) : [];
}

/**
 * Generates pure closed filled SVG path strings (`M ... L/Q/C ... Z`) in absolute millimeter coordinates
 * for any classic bookbindery ornament or custom imported SVG stamp.
 *
 * Dispatches cleanly across:
 * 1. Custom imported SVG stamps (`custom-svg`)
 * 2. Bundled static `.svg` motif assets (`src/resources/ornaments/*.svg`)
 * 3. Parametric Strategy generators (`PARAMETRIC_ORNAMENT_GENERATORS`)
 */
export function buildOrnamentClosedPaths(
  ornament: CoverOrnamentLayer,
  transform?: OrnamentPathTransform,
): readonly string[] {
  const rot = normalizeQuarterTurn(ornament.rotationDeg);
  if (rot === 0) {
    return buildUnrotatedOrnamentClosedPaths(ornament, transform);
  }

  const cx = ornament.xMm + ornament.widthMm / 2;
  const cy = ornament.yMm + ornament.heightMm / 2;
  const preW = rot === 90 || rot === 270 ? ornament.heightMm : ornament.widthMm;
  const preH = rot === 90 || rot === 270 ? ornament.widthMm : ornament.heightMm;
  const preOrn: CoverOrnamentLayer = {
    ...ornament,
    xMm: cx - preW / 2,
    yMm: cy - preH / 2,
    widthMm: preW,
    heightMm: preH,
    rotationDeg: 0,
  };

  const basePaths = buildUnrotatedOrnamentClosedPaths(preOrn);
  return basePaths.map((d) => bakeQuarterTurnIntoPath(d, cx, cy, rot, transform)).filter(Boolean);
}

/** Joins all closed contours of an ornament into a single compound SVG `d` string. */
export function buildOrnamentCompoundPath(
  ornament: CoverOrnamentLayer,
  transform?: OrnamentPathTransform,
): string {
  return buildOrnamentClosedPaths(ornament, transform).filter(Boolean).join(' ');
}
