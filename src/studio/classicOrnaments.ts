import {
  CLASSIC_ORNAMENTS,
  getStaticOrnamentStamp,
  isStaticOrnamentId,
  type ClassicOrnamentSpec,
} from '@/resources/ornaments';
import type { ClassicOrnamentId, CoverOrnamentLayer } from '@/types/coverElements';
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

/** Joins all closed contours of an ornament into a single compound SVG `d` string. */
export function buildOrnamentCompoundPath(
  ornament: CoverOrnamentLayer,
  transform?: OrnamentPathTransform,
): string {
  return buildOrnamentClosedPaths(ornament, transform).filter(Boolean).join(' ');
}
