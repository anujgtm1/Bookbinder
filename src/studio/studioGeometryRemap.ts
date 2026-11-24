import { computeStudioCanvasSpec, getPanelBoardRect, type StudioCanvasSpec } from '@/studio/canvasSpec';
import { computeInnerPocketsLayout } from '@/studio/pocketRenderEngine';
import {
  isBoxMappedOrnament,
  type CoverElementZone,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { getLayerVisualRect, type CoverImageLayer } from '@/types/studioLayer';
import { roundTo } from '@/types/units';

const REMAP_PRECISION = 4;
const RECT_EPS_MM = 1e-6;
const MIN_DIM_MM = 1e-3;
const MIN_ORNAMENT_REMAP_MM = 1;
const MAX_ORNAMENT_REMAP_MM = 2000;
const MIN_IMAGE_REMAP_MM = 1;
const MAX_IMAGE_REMAP_MM = 4000;

type OuterImageAnchor = 'front' | 'back' | 'spine' | 'fullWrap';
type InnerImageAnchor = 'front' | 'back' | 'spine' | 'all';

interface InnerPieceRects {
  readonly back: Rect2D;
  readonly spine: Rect2D;
  readonly front: Rect2D;
  readonly all: Rect2D;
}

function rectsEqual(a: Rect2D, b: Rect2D): boolean {
  return (
    Math.abs(a.x - b.x) < RECT_EPS_MM &&
    Math.abs(a.y - b.y) < RECT_EPS_MM &&
    Math.abs(a.width - b.width) < RECT_EPS_MM &&
    Math.abs(a.height - b.height) < RECT_EPS_MM
  );
}

function clampSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getOuterWrapRectInCanvas(geometry: CaseGeometry): Rect2D {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  return {
    x: bleedMm,
    y: bleedMm,
    width: outerWrap.widthMm,
    height: outerWrap.heightMm,
  };
}

function mapPointBetweenRects(
  xMm: number,
  yMm: number,
  prevRect: Rect2D,
  nextRect: Rect2D,
): { readonly x: number; readonly y: number } {
  if (prevRect.width <= MIN_DIM_MM || prevRect.height <= MIN_DIM_MM) {
    return { x: xMm, y: yMm };
  }
  const u = (xMm - prevRect.x) / prevRect.width;
  const v = (yMm - prevRect.y) / prevRect.height;
  return {
    x: nextRect.x + u * nextRect.width,
    y: nextRect.y + v * nextRect.height,
  };
}

/**
 * Area-preserving uniform scale factor between two rectangles.
 * Algebraically invertible across arbitrary aspect-ratio changes and multi-hop chains:
 * `geometricMeanScale(A, B) * geometricMeanScale(B, A) === 1`.
 */
function geometricMeanScale(prevRect: Rect2D, nextRect: Rect2D): number {
  const prevArea = prevRect.width * prevRect.height;
  const nextArea = nextRect.width * nextRect.height;
  if (prevArea <= MIN_DIM_MM || nextArea <= MIN_DIM_MM) {
    return 1;
  }
  return Math.sqrt(nextArea / prevArea);
}

function remapTextLayer(
  layer: CoverTextLayer,
  prevSpec: StudioCanvasSpec,
  nextSpec: StudioCanvasSpec,
): CoverTextLayer {
  const zone: CoverElementZone = layer.zone;
  const prevRect = getPanelBoardRect(prevSpec, zone);
  const nextRect = getPanelBoardRect(nextSpec, zone);
  if (rectsEqual(prevRect, nextRect)) {
    return layer;
  }
  const mapped = mapPointBetweenRects(layer.xMm, layer.yMm, prevRect, nextRect);
  return {
    ...layer,
    xMm: roundTo(mapped.x, REMAP_PRECISION),
    yMm: roundTo(mapped.y, REMAP_PRECISION),
  };
}

function remapOrnamentLayer(
  orn: CoverOrnamentLayer,
  prevSpec: StudioCanvasSpec,
  nextSpec: StudioCanvasSpec,
): CoverOrnamentLayer {
  const prevRect = getPanelBoardRect(prevSpec, orn.zone);
  const nextRect = getPanelBoardRect(nextSpec, orn.zone);
  if (rectsEqual(prevRect, nextRect)) {
    return orn;
  }
  if (prevRect.width <= MIN_DIM_MM || prevRect.height <= MIN_DIM_MM) {
    return orn;
  }

  const prevCx = orn.xMm + orn.widthMm / 2;
  const prevCy = orn.yMm + orn.heightMm / 2;
  const nextCenter = mapPointBetweenRects(prevCx, prevCy, prevRect, nextRect);

  let nextW: number;
  let nextH: number;
  if (isBoxMappedOrnament(orn)) {
    nextW = clampSize(
      orn.widthMm * (nextRect.width / prevRect.width),
      MIN_ORNAMENT_REMAP_MM,
      MAX_ORNAMENT_REMAP_MM,
    );
    nextH = clampSize(
      orn.heightMm * (nextRect.height / prevRect.height),
      MIN_ORNAMENT_REMAP_MM,
      MAX_ORNAMENT_REMAP_MM,
    );
  } else {
    const scale = geometricMeanScale(prevRect, nextRect);
    nextW = clampSize(orn.widthMm * scale, MIN_ORNAMENT_REMAP_MM, MAX_ORNAMENT_REMAP_MM);
    nextH = clampSize(orn.heightMm * scale, MIN_ORNAMENT_REMAP_MM, MAX_ORNAMENT_REMAP_MM);
  }

  return {
    ...orn,
    xMm: roundTo(nextCenter.x - nextW / 2, REMAP_PRECISION),
    yMm: roundTo(nextCenter.y - nextH / 2, REMAP_PRECISION),
    widthMm: roundTo(nextW, REMAP_PRECISION),
    heightMm: roundTo(nextH, REMAP_PRECISION),
  };
}

function resolveOuterImageAnchor(
  layer: CoverImageLayer,
  prevSpec: ReturnType<typeof computeStudioCanvasSpec>,
): OuterImageAnchor {
  if (layer.clipZone !== 'none') {
    return layer.clipZone;
  }
  const vis = getLayerVisualRect(layer);
  const spansMultiplePanels =
    vis.x < prevSpec.spineZoneRect.x - 1 &&
    vis.x + vis.width > prevSpec.frontZoneRect.x + 1 &&
    vis.width > Math.max(prevSpec.backArtworkRect.width, prevSpec.frontArtworkRect.width) * 1.1;

  if (vis.width >= prevSpec.totalWidthMm * 0.7 || spansMultiplePanels) {
    return 'fullWrap';
  }

  const cx = layer.xMm + layer.widthMm / 2;
  if (cx < prevSpec.spineZoneRect.x) {
    return 'back';
  }
  if (cx < prevSpec.frontZoneRect.x) {
    return 'spine';
  }
  return 'front';
}

function remapImageBetweenRects(
  layer: CoverImageLayer,
  prevRect: Rect2D,
  nextRect: Rect2D,
): CoverImageLayer {
  if (rectsEqual(prevRect, nextRect)) {
    return layer;
  }
  if (prevRect.width <= MIN_DIM_MM || prevRect.height <= MIN_DIM_MM) {
    return layer;
  }

  const prevCx = layer.xMm + layer.widthMm / 2;
  const prevCy = layer.yMm + layer.heightMm / 2;
  const nextCenter = mapPointBetweenRects(prevCx, prevCy, prevRect, nextRect);
  const scale = geometricMeanScale(prevRect, nextRect);
  const nextW = clampSize(layer.widthMm * scale, MIN_IMAGE_REMAP_MM, MAX_IMAGE_REMAP_MM);
  const nextH = clampSize(layer.heightMm * scale, MIN_IMAGE_REMAP_MM, MAX_IMAGE_REMAP_MM);

  return {
    ...layer,
    xMm: roundTo(nextCenter.x - nextW / 2, REMAP_PRECISION),
    yMm: roundTo(nextCenter.y - nextH / 2, REMAP_PRECISION),
    widthMm: roundTo(nextW, REMAP_PRECISION),
    heightMm: roundTo(nextH, REMAP_PRECISION),
  };
}

function getInnerPieceRects(
  layout: ReturnType<typeof computeInnerPocketsLayout>,
  fullEnvelope: boolean,
): InnerPieceRects {
  return {
    back: fullEnvelope ? layout.backFullRect : layout.backFaceRect,
    spine: layout.linerRect,
    front: fullEnvelope ? layout.frontFullRect : layout.frontFaceRect,
    all: {
      x: 0,
      y: 0,
      width: layout.totalWidthMm,
      height: layout.totalHeightMm,
    },
  };
}

function resolveInnerImageAnchor(
  layer: CoverImageLayer,
  prevLayout: ReturnType<typeof computeInnerPocketsLayout>,
  prevPieces: InnerPieceRects,
): InnerImageAnchor {
  if (layer.clipZone !== 'none') {
    return layer.clipZone;
  }
  const vis = getLayerVisualRect(layer);
  const spansMultiplePieces =
    vis.x < prevLayout.linerX - 1 &&
    vis.x + vis.width > prevLayout.frontX + 1 &&
    vis.width > Math.max(prevPieces.back.width, prevPieces.front.width) * 1.1;

  if (vis.width >= prevLayout.totalWidthMm * 0.7 || spansMultiplePieces) {
    return 'all';
  }

  const cx = layer.xMm + layer.widthMm / 2;
  if (cx < prevLayout.linerX - 9) {
    return 'back';
  }
  if (cx < prevLayout.frontX - 9) {
    return 'spine';
  }
  return 'front';
}

/**
 * Invertibly remaps all outer cover designs (text layers, classic ornaments, uploaded artwork)
 * and inner pocket / endpaper artwork layers whenever book dimensions, presets, binding style,
 * or interior attachment style change.
 *
 * Guarantees:
 * - Short-circuits (returns `studio` unchanged) when no geometry rects changed.
 * - Uses exact board/panel relative coordinates and area-preserving geometric-mean scaling
 *   (or per-axis scaling for frames, corners, and spine bands) so switching `A -> B -> A`
 *   and arbitrary multi-hop style/size chains return every design to its original millimeter
 *   position and size with zero cumulative drift.
 * - Keeps tiled endpaper repeat swatches untouched so wallpaper pattern scale never distorts.
 */
export function remapStudioForGeometryChange(
  studio: CoverStudioState,
  prevGeometry: CaseGeometry,
  nextGeometry: CaseGeometry,
): CoverStudioState {
  const hasOuterElements =
    studio.layers.length > 0 ||
    (studio.textLayers?.length ?? 0) > 0 ||
    (studio.ornaments?.length ?? 0) > 0;
  const pocketLayers = studio.pocketStyle.layers ?? [];
  const hasInnerElements = pocketLayers.length > 0;

  if (!hasOuterElements && !hasInnerElements) {
    return studio;
  }

  const prevSpec = computeStudioCanvasSpec(prevGeometry);
  const nextSpec = computeStudioCanvasSpec(nextGeometry);
  const prevOuterWrapRect = getOuterWrapRectInCanvas(prevGeometry);
  const nextOuterWrapRect = getOuterWrapRectInCanvas(nextGeometry);

  const outerUnchanged =
    rectsEqual(prevSpec.backBoardRect, nextSpec.backBoardRect) &&
    rectsEqual(prevSpec.spineBoardRect, nextSpec.spineBoardRect) &&
    rectsEqual(prevSpec.frontBoardRect, nextSpec.frontBoardRect) &&
    rectsEqual(prevSpec.backArtworkRect, nextSpec.backArtworkRect) &&
    rectsEqual(prevSpec.spineArtworkRect, nextSpec.spineArtworkRect) &&
    rectsEqual(prevSpec.frontArtworkRect, nextSpec.frontArtworkRect) &&
    rectsEqual(prevOuterWrapRect, nextOuterWrapRect);

  const hasNonTiledInnerElements = pocketLayers.some((layer) => !layer.tiled);

  let innerUnchanged = true;
  let prevInnerLayout: ReturnType<typeof computeInnerPocketsLayout> | null = null;
  let nextInnerLayout: ReturnType<typeof computeInnerPocketsLayout> | null = null;
  let prevInnerPieces: InnerPieceRects | null = null;
  let nextInnerPieces: InnerPieceRects | null = null;

  if (hasNonTiledInnerElements) {
    prevInnerLayout = computeInnerPocketsLayout(prevGeometry);
    nextInnerLayout = computeInnerPocketsLayout(nextGeometry);
    const fullEnvelope = studio.pocketStyle.styleScope === 'full-envelope';
    prevInnerPieces = getInnerPieceRects(prevInnerLayout, fullEnvelope);
    nextInnerPieces = getInnerPieceRects(nextInnerLayout, fullEnvelope);
    innerUnchanged =
      rectsEqual(prevInnerPieces.back, nextInnerPieces.back) &&
      rectsEqual(prevInnerPieces.spine, nextInnerPieces.spine) &&
      rectsEqual(prevInnerPieces.front, nextInnerPieces.front) &&
      rectsEqual(prevInnerPieces.all, nextInnerPieces.all);
  }

  if ((outerUnchanged || !hasOuterElements) && innerUnchanged) {
    return studio;
  }

  const nextTextLayers =
    outerUnchanged || (studio.textLayers?.length ?? 0) === 0
      ? studio.textLayers
      : studio.textLayers.map((layer) => remapTextLayer(layer, prevSpec, nextSpec));

  const nextOrnaments =
    outerUnchanged || (studio.ornaments?.length ?? 0) === 0
      ? studio.ornaments
      : studio.ornaments.map((orn) => remapOrnamentLayer(orn, prevSpec, nextSpec));

  const nextLayers =
    outerUnchanged || studio.layers.length === 0
      ? studio.layers
      : studio.layers.map((layer) => {
          const anchor = resolveOuterImageAnchor(layer, prevSpec);
          const prevRect =
            anchor === 'fullWrap'
              ? prevOuterWrapRect
              : anchor === 'front'
                ? prevSpec.frontArtworkRect
                : anchor === 'back'
                  ? prevSpec.backArtworkRect
                  : prevSpec.spineArtworkRect;
          const nextRect =
            anchor === 'fullWrap'
              ? nextOuterWrapRect
              : anchor === 'front'
                ? nextSpec.frontArtworkRect
                : anchor === 'back'
                  ? nextSpec.backArtworkRect
                  : nextSpec.spineArtworkRect;
          return remapImageBetweenRects(layer, prevRect, nextRect);
        });

  const nextPocketStyle =
    innerUnchanged || !prevInnerLayout || !prevInnerPieces || !nextInnerPieces
      ? studio.pocketStyle
      : {
          ...studio.pocketStyle,
          layers: pocketLayers.map((layer) => {
            if (layer.tiled) {
              return layer;
            }
            const anchor = resolveInnerImageAnchor(layer, prevInnerLayout, prevInnerPieces);
            return remapImageBetweenRects(layer, prevInnerPieces[anchor], nextInnerPieces[anchor]);
          }),
        };

  return {
    ...studio,
    layers: nextLayers,
    textLayers: nextTextLayers,
    ornaments: nextOrnaments,
    pocketStyle: nextPocketStyle,
  };
}
