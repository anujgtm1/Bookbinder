import type { CaseGeometry, Rect2D } from '@/types/geometry';
import {
  CoverImageLayerModel,
  getLayerVisualRect,
  type CoverImageLayer,
  type ResizeCorner,
} from '@/types/studioLayer';
import { roundTo } from '@/types/units';
import type { StudioCanvasSpec } from './renderEngine';

export type SnapAxis = 'x' | 'y';

export interface SnapTargetLine {
  readonly axis: SnapAxis;
  readonly positionMm: number;
  readonly label: string;
  readonly kind: 'board' | 'center' | 'cut' | 'bleed';
}

export interface CanvasSnapTargets {
  readonly vertical: readonly SnapTargetLine[];
  readonly horizontal: readonly SnapTargetLine[];
}

export interface ActiveSnapGuide {
  readonly axis: SnapAxis;
  readonly positionMm: number;
  readonly label: string;
  readonly kind: 'board' | 'center' | 'cut' | 'bleed';
}

export interface AxisSnapResult {
  readonly deltaMm: number;
  readonly target: SnapTargetLine;
}

export interface PointSnapResult {
  readonly xMm: number;
  readonly yMm: number;
  readonly guides: readonly ActiveSnapGuide[];
}

export interface SnapMoveResult {
  readonly layer: CoverImageLayer;
  readonly guides: readonly ActiveSnapGuide[];
}

export const DEFAULT_SNAP_THRESHOLD_MM = 3.5;

function dedupeTargets(lines: readonly SnapTargetLine[]): SnapTargetLine[] {
  const result: SnapTargetLine[] = [];
  for (const line of lines) {
    const existing = result.find((t) => Math.abs(t.positionMm - line.positionMm) < 0.15);
    if (!existing) {
      result.push({ ...line, positionMm: roundTo(line.positionMm, 2) });
    }
  }
  return result;
}

/**
 * Computes a proportional safe inset margin (in mm) for a cover board
 * (clamped to 7–14 mm; e.g. ~9.0 mm on A6, ~12.2 mm on 5.5×8.5").
 */
export function computeCoverSafeMarginMm(boardWidthMm: number, boardHeightMm: number): number {
  return roundTo(Math.min(14, Math.max(7, Math.min(boardWidthMm, boardHeightMm) * 0.085)), 1);
}

/**
 * Builds the magnetic alignment target lines for the Outer Case Wrap canvas:
 * Front/Back board edges & centers, Spine edges & centerline, Turn-In cut lines,
 * Bleed boundaries, and proportional safe-margin inset guides.
 */
export function buildCanvasSnapTargets(
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
): CanvasSnapTargets {
  const b = spec.bleedMm;
  const back = geometry.outerWrap.backBoardRect;
  const spine = geometry.outerWrap.spineRect;
  const front = geometry.outerWrap.frontBoardRect;
  const margin = computeCoverSafeMarginMm(front.width, front.height);

  const verticalRaw: SnapTargetLine[] = [
    // Centers first so centerlines win priority if overlapping
    { axis: 'x', positionMm: b + spine.x + spine.width / 2, label: 'SPINE CENTER', kind: 'center' },
    { axis: 'x', positionMm: b + front.x + front.width / 2, label: 'FRONT CENTER', kind: 'center' },
    { axis: 'x', positionMm: b + back.x + back.width / 2, label: 'BACK CENTER', kind: 'center' },

    // Board & spine structural seams
    { axis: 'x', positionMm: b + front.x, label: 'FRONT HINGE', kind: 'board' },
    { axis: 'x', positionMm: b + front.x + front.width, label: 'FRONT EDGE', kind: 'board' },
    { axis: 'x', positionMm: b + back.x, label: 'BACK EDGE', kind: 'board' },
    { axis: 'x', positionMm: b + back.x + back.width, label: 'BACK HINGE', kind: 'board' },
    { axis: 'x', positionMm: b + spine.x, label: 'SPINE LEFT', kind: 'board' },
    { axis: 'x', positionMm: b + spine.x + spine.width, label: 'SPINE RIGHT', kind: 'board' },

    // Cut & Bleed boundaries
    { axis: 'x', positionMm: 0, label: 'LEFT BLEED', kind: 'bleed' },
    { axis: 'x', positionMm: spec.totalWidthMm, label: 'RIGHT BLEED', kind: 'bleed' },
    ...(b > 0
      ? [
          { axis: 'x' as const, positionMm: b, label: 'LEFT CUT', kind: 'cut' as const },
          {
            axis: 'x' as const,
            positionMm: spec.totalWidthMm - b,
            label: 'RIGHT CUT',
            kind: 'cut' as const,
          },
        ]
      : []),

    // Safe-margin inset guides (appended last so center & board edges retain priority)
    { axis: 'x', positionMm: b + front.x + margin, label: 'FRONT MARGIN', kind: 'board' },
    {
      axis: 'x',
      positionMm: b + front.x + front.width - margin,
      label: 'FRONT MARGIN',
      kind: 'board',
    },
    { axis: 'x', positionMm: b + back.x + margin, label: 'BACK MARGIN', kind: 'board' },
    {
      axis: 'x',
      positionMm: b + back.x + back.width - margin,
      label: 'BACK MARGIN',
      kind: 'board',
    },
  ];

  const horizontalRaw: SnapTargetLine[] = [
    { axis: 'y', positionMm: spec.totalHeightMm / 2, label: 'CENTERLINE', kind: 'center' },
    { axis: 'y', positionMm: b + front.y, label: 'BOARD TOP', kind: 'board' },
    { axis: 'y', positionMm: b + front.y + front.height, label: 'BOARD BOTTOM', kind: 'board' },
    { axis: 'y', positionMm: 0, label: 'TOP BLEED', kind: 'bleed' },
    { axis: 'y', positionMm: spec.totalHeightMm, label: 'BOTTOM BLEED', kind: 'bleed' },
    ...(b > 0
      ? [
          { axis: 'y' as const, positionMm: b, label: 'TOP CUT', kind: 'cut' as const },
          {
            axis: 'y' as const,
            positionMm: spec.totalHeightMm - b,
            label: 'BOTTOM CUT',
            kind: 'cut' as const,
          },
        ]
      : []),

    // Safe-margin inset guides
    { axis: 'y', positionMm: b + front.y + margin, label: 'TOP MARGIN', kind: 'board' },
    {
      axis: 'y',
      positionMm: b + front.y + front.height - margin,
      label: 'BOTTOM MARGIN',
      kind: 'board',
    },
  ];

  return {
    vertical: dedupeTargets(verticalRaw),
    horizontal: dedupeTargets(horizontalRaw),
  };
}

export interface InnerPocketSnapLayout {
  readonly backFaceRect: Rect2D;
  readonly backFullRect: Rect2D;
  readonly linerRect: Rect2D;
  readonly frontFaceRect: Rect2D;
  readonly frontFullRect: Rect2D;
}

/**
 * Builds magnetic alignment target lines for the Inner Pockets & Spine Liner canvas:
 * Back Pocket, Spine Liner, and Front Pocket face edges, centers, and outer cut limits.
 */
export function buildInnerPocketSnapTargets(layout: InnerPocketSnapLayout): CanvasSnapTargets {
  const { backFaceRect, backFullRect, linerRect, frontFaceRect, frontFullRect } = layout;

  const verticalRaw: SnapTargetLine[] = [
    // Centers first for priority
    { axis: 'x', positionMm: backFaceRect.x + backFaceRect.width / 2, label: 'BACK CENTER', kind: 'center' },
    { axis: 'x', positionMm: linerRect.x + linerRect.width / 2, label: 'LINER CENTER', kind: 'center' },
    { axis: 'x', positionMm: frontFaceRect.x + frontFaceRect.width / 2, label: 'FRONT CENTER', kind: 'center' },

    // Face & fold edges
    { axis: 'x', positionMm: backFaceRect.x, label: 'BACK FOLD', kind: 'board' },
    { axis: 'x', positionMm: backFaceRect.x + backFaceRect.width, label: 'BACK OPEN', kind: 'board' },
    { axis: 'x', positionMm: linerRect.x, label: 'LINER LEFT', kind: 'board' },
    { axis: 'x', positionMm: linerRect.x + linerRect.width, label: 'LINER RIGHT', kind: 'board' },
    { axis: 'x', positionMm: frontFaceRect.x, label: 'FRONT OPEN', kind: 'board' },
    { axis: 'x', positionMm: frontFaceRect.x + frontFaceRect.width, label: 'FRONT FOLD', kind: 'board' },

    // Outer cut boundaries
    { axis: 'x', positionMm: backFullRect.x, label: 'BACK CUT', kind: 'cut' },
    { axis: 'x', positionMm: frontFullRect.x + frontFullRect.width, label: 'FRONT CUT', kind: 'cut' },
  ];

  const horizontalRaw: SnapTargetLine[] = [
    { axis: 'y', positionMm: frontFaceRect.y + frontFaceRect.height / 2, label: 'CENTERLINE', kind: 'center' },
    { axis: 'y', positionMm: frontFaceRect.y, label: 'FACE TOP', kind: 'board' },
    { axis: 'y', positionMm: frontFaceRect.y + frontFaceRect.height, label: 'FACE BOTTOM', kind: 'board' },
    { axis: 'y', positionMm: frontFullRect.y, label: 'TOP CUT', kind: 'cut' },
    { axis: 'y', positionMm: frontFullRect.y + frontFullRect.height, label: 'BOTTOM CUT', kind: 'cut' },
  ];

  return {
    vertical: dedupeTargets(verticalRaw),
    horizontal: dedupeTargets(horizontalRaw),
  };
}

function toActiveGuide(target: SnapTargetLine): ActiveSnapGuide {
  return {
    axis: target.axis,
    positionMm: target.positionMm,
    label: target.label,
    kind: target.kind,
  };
}

/**
 * Finds the closest snap target along a single axis for a set of anchor positions
 * within `thresholdMm`. Earlier targets win ties so centerlines keep priority.
 */
export function findBestAxisSnap(
  anchors: readonly number[],
  targets: readonly SnapTargetLine[],
  thresholdMm = DEFAULT_SNAP_THRESHOLD_MM,
): AxisSnapResult | null {
  let best: { deltaMm: number; absDelta: number; target: SnapTargetLine } | null = null;

  for (const anchor of anchors) {
    for (const target of targets) {
      const delta = target.positionMm - anchor;
      const absDelta = Math.abs(delta);
      if (absDelta <= thresholdMm && (!best || absDelta < best.absDelta)) {
        best = { deltaMm: delta, absDelta, target };
      }
    }
  }

  return best ? { deltaMm: best.deltaMm, target: best.target } : null;
}

/**
 * Magnetically snaps a 2D point (e.g., text anchor or resize pointer) onto nearby
 * vertical and horizontal structural guides.
 */
export function snapPointToTargets(
  xMm: number,
  yMm: number,
  targets: CanvasSnapTargets,
  thresholdMm = DEFAULT_SNAP_THRESHOLD_MM,
): PointSnapResult {
  const xSnap = findBestAxisSnap([xMm], targets.vertical, thresholdMm);
  const ySnap = findBestAxisSnap([yMm], targets.horizontal, thresholdMm);

  const guides: ActiveSnapGuide[] = [];
  if (xSnap) guides.push(toActiveGuide(xSnap.target));
  if (ySnap) guides.push(toActiveGuide(ySnap.target));

  return {
    xMm: xSnap ? xSnap.target.positionMm : xMm,
    yMm: ySnap ? ySnap.target.positionMm : yMm,
    guides,
  };
}

/**
 * Magnetically snaps a moving axis-aligned box's left/center/right and top/middle/bottom
 * anchors onto nearby structural board, spine, cut, bleed, or safe-margin guides.
 */
export function snapBoxToTargets(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  targets: CanvasSnapTargets,
  thresholdMm = DEFAULT_SNAP_THRESHOLD_MM,
): PointSnapResult {
  const xAnchors = [xMm, xMm + widthMm / 2, xMm + widthMm];
  const yAnchors = [yMm, yMm + heightMm / 2, yMm + heightMm];

  const xSnap = findBestAxisSnap(xAnchors, targets.vertical, thresholdMm);
  const ySnap = findBestAxisSnap(yAnchors, targets.horizontal, thresholdMm);

  const guides: ActiveSnapGuide[] = [];
  if (xSnap) guides.push(toActiveGuide(xSnap.target));
  if (ySnap) guides.push(toActiveGuide(ySnap.target));

  if (guides.length === 0) {
    return { xMm, yMm, guides };
  }

  return {
    xMm: roundTo(xMm + (xSnap?.deltaMm ?? 0), 2),
    yMm: roundTo(yMm + (ySnap?.deltaMm ?? 0), 2),
    guides,
  };
}

/**
 * Magnetically snaps a moving cover image layer's left/center/right and top/middle/bottom
 * anchors onto nearby structural board, spine, cut, or bleed guides.
 */
export function snapLayerMove(
  rawLayer: CoverImageLayer,
  targets: CanvasSnapTargets,
  thresholdMm = DEFAULT_SNAP_THRESHOLD_MM,
): SnapMoveResult {
  const vis = getLayerVisualRect(rawLayer);
  const snapped = snapBoxToTargets(
    vis.x,
    vis.y,
    vis.width,
    vis.height,
    targets,
    thresholdMm,
  );

  if (snapped.guides.length === 0) {
    return { layer: rawLayer, guides: snapped.guides };
  }

  const dx = snapped.xMm - vis.x;
  const dy = snapped.yMm - vis.y;
  return {
    layer: {
      ...rawLayer,
      xMm: roundTo(rawLayer.xMm + dx, 2),
      yMm: roundTo(rawLayer.yMm + dy, 2),
    },
    guides: snapped.guides,
  };
}

/**
 * Magnetically snaps the active moving corner during proportional corner-resizing
 * while keeping the opposite corner anchored and aspect ratio intact.
 */
export function snapLayerResize(
  origLayer: CoverImageLayer,
  corner: ResizeCorner,
  pointerXMm: number,
  pointerYMm: number,
  targets: CanvasSnapTargets,
  thresholdMm = DEFAULT_SNAP_THRESHOLD_MM,
): SnapMoveResult {
  const rawResized = CoverImageLayerModel.resizeFromCorner(
    origLayer,
    corner,
    pointerXMm,
    pointerYMm,
  );
  const rawVis = getLayerVisualRect(rawResized);
  const activeX = corner === 'nw' || corner === 'sw' ? rawVis.x : rawVis.x + rawVis.width;
  const activeY = corner === 'nw' || corner === 'ne' ? rawVis.y : rawVis.y + rawVis.height;

  const xSnap = findBestAxisSnap([activeX], targets.vertical, thresholdMm);
  const ySnap = findBestAxisSnap([activeY], targets.horizontal, thresholdMm);

  if (!xSnap && !ySnap) {
    return { layer: rawResized, guides: [] };
  }

  // Pick whichever axis snap is closer so proportional aspect ratio locks cleanly onto that target
  const useX =
    xSnap !== null &&
    (ySnap === null || Math.abs(xSnap.deltaMm) <= Math.abs(ySnap.deltaMm));

  const snapped = useX && xSnap
    ? CoverImageLayerModel.resizeFromCorner(
        origLayer,
        corner,
        xSnap.target.positionMm,
        pointerYMm,
      )
    : ySnap
      ? CoverImageLayerModel.resizeFromCorner(
          origLayer,
          corner,
          pointerXMm,
          ySnap.target.positionMm,
        )
      : rawResized;

  const guides: ActiveSnapGuide[] = [];
  const finalVis = getLayerVisualRect(snapped);
  const finalX = corner === 'nw' || corner === 'sw' ? finalVis.x : finalVis.x + finalVis.width;
  const finalY = corner === 'nw' || corner === 'ne' ? finalVis.y : finalVis.y + finalVis.height;

  if (xSnap && Math.abs(finalX - xSnap.target.positionMm) <= 0.35) {
    guides.push({
      axis: 'x',
      positionMm: xSnap.target.positionMm,
      label: xSnap.target.label,
      kind: xSnap.target.kind,
    });
  }
  if (ySnap && Math.abs(finalY - ySnap.target.positionMm) <= 0.35) {
    guides.push({
      axis: 'y',
      positionMm: ySnap.target.positionMm,
      label: ySnap.target.label,
      kind: ySnap.target.kind,
    });
  }

  return { layer: snapped, guides };
}
