import type { CaseGeometry } from '@/types/geometry';
import {
  CoverImageLayerModel,
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
 * Builds the magnetic alignment target lines for the Outer Case Wrap canvas:
 * Front/Back board edges & centers, Spine edges & centerline, Turn-In cut lines, and Bleed boundaries.
 */
export function buildCanvasSnapTargets(
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
): CanvasSnapTargets {
  const b = spec.bleedMm;
  const back = geometry.outerWrap.backBoardRect;
  const spine = geometry.outerWrap.spineRect;
  const front = geometry.outerWrap.frontBoardRect;

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
  ];

  return {
    vertical: dedupeTargets(verticalRaw),
    horizontal: dedupeTargets(horizontalRaw),
  };
}

function findBestAxisSnap(
  anchors: readonly number[],
  targets: readonly SnapTargetLine[],
  thresholdMm: number,
): { readonly deltaMm: number; readonly target: SnapTargetLine } | null {
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
 * Magnetically snaps a moving cover image layer's left/center/right and top/middle/bottom
 * anchors onto nearby structural board, spine, cut, or bleed guides.
 */
export function snapLayerMove(
  rawLayer: CoverImageLayer,
  targets: CanvasSnapTargets,
  thresholdMm = DEFAULT_SNAP_THRESHOLD_MM,
): SnapMoveResult {
  const xAnchors = [
    rawLayer.xMm,
    rawLayer.xMm + rawLayer.widthMm / 2,
    rawLayer.xMm + rawLayer.widthMm,
  ];
  const yAnchors = [
    rawLayer.yMm,
    rawLayer.yMm + rawLayer.heightMm / 2,
    rawLayer.yMm + rawLayer.heightMm,
  ];

  const xSnap = findBestAxisSnap(xAnchors, targets.vertical, thresholdMm);
  const ySnap = findBestAxisSnap(yAnchors, targets.horizontal, thresholdMm);

  const guides: ActiveSnapGuide[] = [];
  if (xSnap) {
    guides.push({
      axis: 'x',
      positionMm: xSnap.target.positionMm,
      label: xSnap.target.label,
      kind: xSnap.target.kind,
    });
  }
  if (ySnap) {
    guides.push({
      axis: 'y',
      positionMm: ySnap.target.positionMm,
      label: ySnap.target.label,
      kind: ySnap.target.kind,
    });
  }

  if (guides.length === 0) {
    return { layer: rawLayer, guides };
  }

  return {
    layer: {
      ...rawLayer,
      xMm: roundTo(rawLayer.xMm + (xSnap?.deltaMm ?? 0), 2),
      yMm: roundTo(rawLayer.yMm + (ySnap?.deltaMm ?? 0), 2),
    },
    guides,
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
  const activeX = corner === 'nw' || corner === 'sw' ? rawResized.xMm : rawResized.xMm + rawResized.widthMm;
  const activeY = corner === 'nw' || corner === 'ne' ? rawResized.yMm : rawResized.yMm + rawResized.heightMm;

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
  const finalX = corner === 'nw' || corner === 'sw' ? snapped.xMm : snapped.xMm + snapped.widthMm;
  const finalY = corner === 'nw' || corner === 'ne' ? snapped.yMm : snapped.yMm + snapped.heightMm;

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
