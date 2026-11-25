import type { LineSegment2D, Rect2D } from '@/types/geometry';

export interface PdfSafeBox {
  readonly leftMm: number;
  readonly bottomMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly topMm: number;
}

export interface ScaleBarPlacement {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
  readonly overlapsAvoidZone: boolean;
  readonly slotName: string;
}

export interface ScaleBarPlacementParams {
  readonly safeBox: PdfSafeBox;
  readonly barWidthMm: number;
  readonly barHeightMm: number;
  readonly avoidRects: readonly Rect2D[];
  readonly clearanceMm?: number;
}

export interface TicksToPdfAvoidRectsOptions {
  /** Total height of the target PDF page in mm (used to convert top-down mm to bottom-up PDF mm). */
  readonly pageHeightMm: number;
  /** X offset in top-down mm added to every tick coordinate. */
  readonly offsetXMm: number;
  /** Y offset in top-down mm added to every tick coordinate. */
  readonly offsetYMm: number;
  /** Optional clip rectangle in top-down page mm coordinates. */
  readonly clipRectMm?: Rect2D;
  /** Half-width stroke padding (mm) applied around each tick segment. Defaults to 0.3 mm. */
  readonly strokePadMm?: number;
}

export const SCALE_BAR_LENGTH_MM = 50;
export const SCALE_BAR_PAD_X_MM = 2.0;
export const SCALE_BAR_BOX_W_MM = SCALE_BAR_LENGTH_MM + SCALE_BAR_PAD_X_MM * 2;
export const SCALE_BAR_BOX_H_MM = 8.4;
export const DEFAULT_SCALE_BAR_CLEARANCE_MM = 1.5;
export const DEFAULT_SCALE_BAR_EDGE_MARGIN_MM = 1.0;

const GEOM_EPS_MM = 1e-6;
const OVERLAP_TIE_EPS_MM2 = 0.01;
const DEDUP_SCALE = 20; // 0.05 mm quantization bucket for anchor deduplication

interface NormalizedSafeBox {
  readonly leftMm: number;
  readonly rightMm: number;
  readonly bottomMm: number;
  readonly topMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

interface CandidateSlot {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
  readonly slotName: string;
  readonly isCorner: boolean;
}

interface NamedCoord {
  readonly value: number;
  readonly tag: string;
  readonly isOuterEdge: boolean;
}

function normalizeSafeBox(safeBox: PdfSafeBox): NormalizedSafeBox {
  const leftMm = Number.isFinite(safeBox.leftMm) ? safeBox.leftMm : 0;
  const bottomMm = Number.isFinite(safeBox.bottomMm) ? safeBox.bottomMm : 0;
  const widthMm = Math.max(0, Number.isFinite(safeBox.widthMm) ? safeBox.widthMm : 0);
  const heightFromDim = Math.max(0, Number.isFinite(safeBox.heightMm) ? safeBox.heightMm : 0);
  const heightFromTop = Number.isFinite(safeBox.topMm) ? Math.max(0, safeBox.topMm - bottomMm) : heightFromDim;
  const heightMm = Math.min(heightFromDim, heightFromTop);
  return {
    leftMm,
    rightMm: leftMm + widthMm,
    bottomMm,
    topMm: bottomMm + heightMm,
    widthMm,
    heightMm,
  };
}

function normalizeAvoidRects(avoidRects: readonly Rect2D[]): readonly Rect2D[] {
  const valid: Rect2D[] = [];
  for (const rect of avoidRects) {
    if (
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > GEOM_EPS_MM &&
      rect.height > GEOM_EPS_MM
    ) {
      valid.push(rect);
    }
  }
  return valid;
}

function expandRect(rect: Rect2D, paddingMm: number): Rect2D {
  if (paddingMm <= 0) return rect;
  return {
    x: rect.x - paddingMm,
    y: rect.y - paddingMm,
    width: rect.width + paddingMm * 2,
    height: rect.height + paddingMm * 2,
  };
}

function intersectionAreaMm2(a: Rect2D, b: Rect2D): number {
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (overlapW <= GEOM_EPS_MM) return 0;
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapH <= GEOM_EPS_MM) return 0;
  return overlapW * overlapH;
}

/** Returns true when two rectangles overlap (optionally expanded by `clearanceMm`). */
export function rectsIntersectMm(a: Rect2D, b: Rect2D, clearanceMm = 0): boolean {
  const expandedB = clearanceMm > 0 ? expandRect(b, clearanceMm) : b;
  return intersectionAreaMm2(a, expandedB) > 0;
}

function intersectsAny(candidate: Rect2D, expandedAvoids: readonly Rect2D[]): boolean {
  for (const avoid of expandedAvoids) {
    if (intersectionAreaMm2(candidate, avoid) > 0) {
      return true;
    }
  }
  return false;
}

function totalOverlapAreaMm2(candidate: Rect2D, rawAvoids: readonly Rect2D[]): number {
  let total = 0;
  for (const avoid of rawAvoids) {
    total += intersectionAreaMm2(candidate, avoid);
  }
  return total;
}

function isInsideSafeBox(candidate: Rect2D, safe: NormalizedSafeBox): boolean {
  return (
    candidate.x >= safe.leftMm - GEOM_EPS_MM &&
    candidate.x + candidate.width <= safe.rightMm + GEOM_EPS_MM &&
    candidate.y >= safe.bottomMm - GEOM_EPS_MM &&
    candidate.y + candidate.height <= safe.topMm + GEOM_EPS_MM
  );
}

function unionRects(rects: readonly Rect2D[]): Rect2D | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function pushUniqueCoord(
  list: NamedCoord[],
  seen: Set<number>,
  value: number,
  minVal: number,
  maxVal: number,
  tag: string,
  isOuterEdge: boolean,
): void {
  if (!Number.isFinite(value)) return;
  if (value < minVal - GEOM_EPS_MM || value > maxVal + GEOM_EPS_MM) return;
  const clamped = Math.min(maxVal, Math.max(minVal, value));
  const bucket = Math.round(clamped * DEDUP_SCALE);
  if (seen.has(bucket)) return;
  seen.add(bucket);
  list.push({ value: clamped, tag, isOuterEdge });
}

function addCandidate(
  candidates: CandidateSlot[],
  seenKeys: Set<string>,
  safe: NormalizedSafeBox,
  candidate: CandidateSlot,
): void {
  const rect: Rect2D = {
    x: candidate.xMm,
    y: candidate.yMm,
    width: candidate.widthMm,
    height: candidate.heightMm,
  };
  if (!isInsideSafeBox(rect, safe)) return;
  const key = `${candidate.rotated90 ? 'V' : 'H'}:${Math.round(candidate.xMm * DEDUP_SCALE)}:${Math.round(candidate.yMm * DEDUP_SCALE)}`;
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  candidates.push(candidate);
}

/**
 * Converts top-down external fold guide tick segments into PDF bottom-up millimeter avoid rects
 * so the scale bar planner keeps clear clearance from every rendered fold tick.
 */
export function ticksToPdfAvoidRects(
  ticks: readonly LineSegment2D[] | undefined,
  options: TicksToPdfAvoidRectsOptions,
): readonly Rect2D[] {
  if (!ticks || ticks.length === 0) return [];
  const pad = Math.max(0, options.strokePadMm ?? 0.3);
  const clip = options.clipRectMm;
  const rects: Rect2D[] = [];

  for (const tick of ticks) {
    const x1 = tick.x1 + options.offsetXMm;
    const y1 = tick.y1 + options.offsetYMm;
    const x2 = tick.x2 + options.offsetXMm;
    const y2 = tick.y2 + options.offsetYMm;

    let minX = Math.min(x1, x2);
    let maxX = Math.max(x1, x2);
    let minY = Math.min(y1, y2);
    let maxY = Math.max(y1, y2);

    if (clip) {
      const clipRight = clip.x + clip.width;
      const clipBottom = clip.y + clip.height;
      if (
        maxX < clip.x + GEOM_EPS_MM ||
        minX > clipRight - GEOM_EPS_MM ||
        maxY < clip.y + GEOM_EPS_MM ||
        minY > clipBottom - GEOM_EPS_MM
      ) {
        continue;
      }
      minX = Math.max(clip.x, minX);
      maxX = Math.min(clipRight, maxX);
      minY = Math.max(clip.y, minY);
      maxY = Math.min(clipBottom, maxY);
    }

    const pdfBottom = options.pageHeightMm - maxY;
    const pdfTop = options.pageHeightMm - minY;
    rects.push({
      x: minX - pad,
      y: pdfBottom - pad,
      width: Math.max(0, maxX - minX) + pad * 2,
      height: Math.max(0, pdfTop - pdfBottom) + pad * 2,
    });
  }

  return rects;
}

/**
 * Plans a collision-free placement for the 50 mm physical Scale-Check Bar strictly inside `safeBox`
 * in PDF bottom-up millimeter coordinates (`y = 0` at bottom of page).
 *
 * Priority order:
 * 1. Horizontal edge-aligned slots (top-left/center/right, bottom-left/center/right) with 1 mm edge inset.
 * 2. Horizontal dynamic tucked margin slots strictly inside `safeBox` (above/below/beside avoid zones).
 * 3. Vertical 90°-rotated edge-aligned slots (left-top/center/bottom, right-top/center/bottom) with 1 mm edge inset.
 * 4. Vertical 90°-rotated dynamic tucked margin slots strictly inside `safeBox`.
 * 5. Graceful fallback (only when zero collision-free slot exists): minimum total overlap area against
 *    `avoidRects`, preferring outer corners and horizontal orientation on ties.
 */
export function planScaleBarPlacement(params: ScaleBarPlacementParams): ScaleBarPlacement {
  const safe = normalizeSafeBox(params.safeBox);
  const hW = Math.max(1, params.barWidthMm);
  const hH = Math.max(1, params.barHeightMm);
  const vW = hH;
  const vH = hW;
  const clearanceMm = Math.max(
    0,
    Number.isFinite(params.clearanceMm)
      ? (params.clearanceMm as number)
      : DEFAULT_SCALE_BAR_CLEARANCE_MM,
  );
  const edgeMargin = DEFAULT_SCALE_BAR_EDGE_MARGIN_MM;

  const rawAvoids = normalizeAvoidRects(params.avoidRects);
  const expandedAvoids = rawAvoids.map((rect) => expandRect(rect, clearanceMm));
  const unionAvoid = unionRects(rawAvoids);

  const candidates: CandidateSlot[] = [];
  const seenKeys = new Set<string>();

  // --- Priority 1a: Horizontal edge-aligned slots (1.0 mm inset from safeBox edges) ---
  if (safe.widthMm >= hW - GEOM_EPS_MM && safe.heightMm >= hH - GEOM_EPS_MM) {
    const xLeft = safe.leftMm + edgeMargin;
    const xCenter = safe.leftMm + (safe.widthMm - hW) / 2;
    const xRight = safe.rightMm - edgeMargin - hW;
    const yTop = safe.topMm - edgeMargin - hH;
    const yBottom = safe.bottomMm + edgeMargin;

    const p1a: readonly CandidateSlot[] = [
      { xMm: xLeft, yMm: yTop, widthMm: hW, heightMm: hH, rotated90: false, slotName: 'top-left', isCorner: true },
      { xMm: xCenter, yMm: yTop, widthMm: hW, heightMm: hH, rotated90: false, slotName: 'top-center', isCorner: false },
      { xMm: xRight, yMm: yTop, widthMm: hW, heightMm: hH, rotated90: false, slotName: 'top-right', isCorner: true },
      { xMm: xLeft, yMm: yBottom, widthMm: hW, heightMm: hH, rotated90: false, slotName: 'bottom-left', isCorner: true },
      { xMm: xCenter, yMm: yBottom, widthMm: hW, heightMm: hH, rotated90: false, slotName: 'bottom-center', isCorner: false },
      { xMm: xRight, yMm: yBottom, widthMm: hW, heightMm: hH, rotated90: false, slotName: 'bottom-right', isCorner: true },
    ];
    for (const slot of p1a) {
      addCandidate(candidates, seenKeys, safe, slot);
    }

    // --- Priority 1b: Horizontal dynamic tucked margin slots (strictly inside safeBox) ---
    const hMaxX = safe.rightMm - hW;
    const hMaxY = safe.topMm - hH;

    const hXCoords: NamedCoord[] = [];
    const seenHX = new Set<number>();
    pushUniqueCoord(hXCoords, seenHX, xLeft, safe.leftMm, hMaxX, 'left', true);
    pushUniqueCoord(hXCoords, seenHX, xCenter, safe.leftMm, hMaxX, 'center', false);
    pushUniqueCoord(hXCoords, seenHX, xRight, safe.leftMm, hMaxX, 'right', true);
    pushUniqueCoord(hXCoords, seenHX, safe.leftMm, safe.leftMm, hMaxX, 'flush-left', true);
    pushUniqueCoord(hXCoords, seenHX, hMaxX, safe.leftMm, hMaxX, 'flush-right', true);

    if (unionAvoid) {
      pushUniqueCoord(hXCoords, seenHX, unionAvoid.x + unionAvoid.width + clearanceMm, safe.leftMm, hMaxX, 'right-of-union', false);
      pushUniqueCoord(hXCoords, seenHX, unionAvoid.x - clearanceMm - hW, safe.leftMm, hMaxX, 'left-of-union', false);
    }
    for (const r of rawAvoids) {
      pushUniqueCoord(hXCoords, seenHX, r.x + r.width + clearanceMm, safe.leftMm, hMaxX, 'right-of-avoid', false);
      pushUniqueCoord(hXCoords, seenHX, r.x - clearanceMm - hW, safe.leftMm, hMaxX, 'left-of-avoid', false);
    }

    const hYCoords: NamedCoord[] = [];
    const seenHY = new Set<number>();
    // Prefer tucked above cover / below top header / above bottom footer / below cover
    if (unionAvoid) {
      pushUniqueCoord(hYCoords, seenHY, unionAvoid.y + unionAvoid.height + clearanceMm, safe.bottomMm, hMaxY, 'top-tucked', true);
    }
    for (const r of rawAvoids) {
      // Above an avoid rect (e.g. above cover or above bottom footer strip)
      pushUniqueCoord(hYCoords, seenHY, r.y + r.height + clearanceMm, safe.bottomMm, hMaxY, 'tucked-above', true);
    }
    for (const r of rawAvoids) {
      // Below an avoid rect (e.g. below top header strip or below cover)
      pushUniqueCoord(hYCoords, seenHY, r.y - clearanceMm - hH, safe.bottomMm, hMaxY, 'tucked-below', true);
    }
    if (unionAvoid) {
      pushUniqueCoord(hYCoords, seenHY, unionAvoid.y - clearanceMm - hH, safe.bottomMm, hMaxY, 'bottom-tucked', true);
    }
    pushUniqueCoord(hYCoords, seenHY, yTop, safe.bottomMm, hMaxY, 'top', true);
    pushUniqueCoord(hYCoords, seenHY, yBottom, safe.bottomMm, hMaxY, 'bottom', true);
    pushUniqueCoord(hYCoords, seenHY, hMaxY, safe.bottomMm, hMaxY, 'flush-top', true);
    pushUniqueCoord(hYCoords, seenHY, safe.bottomMm, safe.bottomMm, hMaxY, 'flush-bottom', true);

    for (const yc of hYCoords) {
      for (const xc of hXCoords) {
        addCandidate(candidates, seenKeys, safe, {
          xMm: xc.value,
          yMm: yc.value,
          widthMm: hW,
          heightMm: hH,
          rotated90: false,
          slotName: `${yc.tag}-${xc.tag}`,
          isCorner: xc.isOuterEdge && yc.isOuterEdge,
        });
      }
    }
  }

  // --- Priority 2a: Vertical 90°-rotated edge-aligned slots (1.0 mm inset from safeBox edges) ---
  if (safe.widthMm >= vW - GEOM_EPS_MM && safe.heightMm >= vH - GEOM_EPS_MM) {
    const xLeftV = safe.leftMm + edgeMargin;
    const xRightV = safe.rightMm - edgeMargin - vW;
    const yTopV = safe.topMm - edgeMargin - vH;
    const yCenterV = safe.bottomMm + (safe.heightMm - vH) / 2;
    const yBottomV = safe.bottomMm + edgeMargin;

    const p2a: readonly CandidateSlot[] = [
      { xMm: xLeftV, yMm: yTopV, widthMm: vW, heightMm: vH, rotated90: true, slotName: 'left-top', isCorner: true },
      { xMm: xLeftV, yMm: yCenterV, widthMm: vW, heightMm: vH, rotated90: true, slotName: 'left-center', isCorner: false },
      { xMm: xLeftV, yMm: yBottomV, widthMm: vW, heightMm: vH, rotated90: true, slotName: 'left-bottom', isCorner: true },
      { xMm: xRightV, yMm: yTopV, widthMm: vW, heightMm: vH, rotated90: true, slotName: 'right-top', isCorner: true },
      { xMm: xRightV, yMm: yCenterV, widthMm: vW, heightMm: vH, rotated90: true, slotName: 'right-center', isCorner: false },
      { xMm: xRightV, yMm: yBottomV, widthMm: vW, heightMm: vH, rotated90: true, slotName: 'right-bottom', isCorner: true },
    ];
    for (const slot of p2a) {
      addCandidate(candidates, seenKeys, safe, slot);
    }

    // --- Priority 2b: Vertical 90°-rotated dynamic tucked margin slots (strictly inside safeBox) ---
    const vMaxX = safe.rightMm - vW;
    const vMaxY = safe.topMm - vH;

    const vXCoords: NamedCoord[] = [];
    const seenVX = new Set<number>();
    pushUniqueCoord(vXCoords, seenVX, xLeftV, safe.leftMm, vMaxX, 'left', true);
    pushUniqueCoord(vXCoords, seenVX, xRightV, safe.leftMm, vMaxX, 'right', true);
    if (unionAvoid) {
      pushUniqueCoord(vXCoords, seenVX, unionAvoid.x - clearanceMm - vW, safe.leftMm, vMaxX, 'left-tucked', true);
      pushUniqueCoord(vXCoords, seenVX, unionAvoid.x + unionAvoid.width + clearanceMm, safe.leftMm, vMaxX, 'right-tucked', true);
    }
    for (const r of rawAvoids) {
      pushUniqueCoord(vXCoords, seenVX, r.x - clearanceMm - vW, safe.leftMm, vMaxX, 'left-of-avoid', false);
      pushUniqueCoord(vXCoords, seenVX, r.x + r.width + clearanceMm, safe.leftMm, vMaxX, 'right-of-avoid', false);
    }
    pushUniqueCoord(vXCoords, seenVX, safe.leftMm, safe.leftMm, vMaxX, 'flush-left', true);
    pushUniqueCoord(vXCoords, seenVX, vMaxX, safe.leftMm, vMaxX, 'flush-right', true);

    const vYCoords: NamedCoord[] = [];
    const seenVY = new Set<number>();
    pushUniqueCoord(vYCoords, seenVY, yTopV, safe.bottomMm, vMaxY, 'top', true);
    pushUniqueCoord(vYCoords, seenVY, yCenterV, safe.bottomMm, vMaxY, 'center', false);
    pushUniqueCoord(vYCoords, seenVY, yBottomV, safe.bottomMm, vMaxY, 'bottom', true);
    for (const r of rawAvoids) {
      pushUniqueCoord(vYCoords, seenVY, r.y - clearanceMm - vH, safe.bottomMm, vMaxY, 'below-avoid', false);
      pushUniqueCoord(vYCoords, seenVY, r.y + r.height + clearanceMm, safe.bottomMm, vMaxY, 'above-avoid', false);
    }
    pushUniqueCoord(vYCoords, seenVY, vMaxY, safe.bottomMm, vMaxY, 'flush-top', true);
    pushUniqueCoord(vYCoords, seenVY, safe.bottomMm, safe.bottomMm, vMaxY, 'flush-bottom', true);

    for (const xc of vXCoords) {
      for (const yc of vYCoords) {
        addCandidate(candidates, seenKeys, safe, {
          xMm: xc.value,
          yMm: yc.value,
          widthMm: vW,
          heightMm: vH,
          rotated90: true,
          slotName: `${xc.tag}-${yc.tag}`,
          isCorner: xc.isOuterEdge && yc.isOuterEdge,
        });
      }
    }
  }

  // First strictly collision-free slot wins (zero intersection with any clearance-expanded avoid rect)
  for (const candidate of candidates) {
    const rect: Rect2D = {
      x: candidate.xMm,
      y: candidate.yMm,
      width: candidate.widthMm,
      height: candidate.heightMm,
    };
    if (!intersectsAny(rect, expandedAvoids)) {
      return {
        xMm: candidate.xMm,
        yMm: candidate.yMm,
        widthMm: candidate.widthMm,
        heightMm: candidate.heightMm,
        rotated90: candidate.rotated90,
        overlapsAvoidZone: false,
        slotName: candidate.slotName,
      };
    }
  }

  // Graceful fallback: pick candidate with minimum total overlap area against avoidRects
  // (tie-breaking: prefer outer corners, then horizontal, then earliest candidate priority)
  if (candidates.length > 0) {
    let best = candidates[0];
    let bestArea = totalOverlapAreaMm2(
      { x: best.xMm, y: best.yMm, width: best.widthMm, height: best.heightMm },
      rawAvoids,
    );

    for (let i = 1; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const area = totalOverlapAreaMm2(
        { x: candidate.xMm, y: candidate.yMm, width: candidate.widthMm, height: candidate.heightMm },
        rawAvoids,
      );

      if (area < bestArea - OVERLAP_TIE_EPS_MM2) {
        best = candidate;
        bestArea = area;
      } else if (Math.abs(area - bestArea) <= OVERLAP_TIE_EPS_MM2) {
        if (candidate.isCorner && !best.isCorner) {
          best = candidate;
          bestArea = area;
        } else if (candidate.isCorner === best.isCorner && !candidate.rotated90 && best.rotated90) {
          best = candidate;
          bestArea = area;
        }
      }
    }

    return {
      xMm: best.xMm,
      yMm: best.yMm,
      widthMm: best.widthMm,
      heightMm: best.heightMm,
      rotated90: best.rotated90,
      overlapsAvoidZone: true,
      slotName: best.slotName,
    };
  }

  // Degenerate fallback when safeBox is smaller than the bar in both orientations
  const clampedX = Math.max(safe.leftMm, Math.min(safe.rightMm - hW, safe.leftMm + edgeMargin));
  const clampedY = Math.max(safe.bottomMm, Math.min(safe.topMm - hH, safe.topMm - edgeMargin - hH));
  return {
    xMm: clampedX,
    yMm: clampedY,
    widthMm: hW,
    heightMm: hH,
    rotated90: false,
    overlapsAvoidZone: true,
    slotName: 'fallback-clamped',
  };
}
