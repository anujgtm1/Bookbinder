import {
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFPage,
} from 'pdf-lib';
import {
  GeometryPrimitives,
  type LineSegment2D,
  type Polygon2D,
  type Rect2D,
  type SplitWrapPanel,
} from '@/types/geometry';
import { UnitConverter, roundTo } from '@/types/units';

/** Clearance gap between the outer cut perimeter and the start of each external fold guide tick. */
export const FOLD_GUIDE_TICK_GAP_MM = 1.5;

/** Default external fold guide tick length on outer covers (trimmed off cleanly with outer waste). */
export const FOLD_GUIDE_TICK_LENGTH_MM = 4.0;

/** Compact external fold guide tick length for packed inner pieces (fits cleanly inside 5.0 mm piece gap). */
export const INNER_FOLD_GUIDE_TICK_LENGTH_MM = 2.8;

/** Crisp solid blue stroke matching Bookbinder fold-guide color language. */
export const FOLD_GUIDE_TICK_PDF_COLOR = rgb(0.12, 0.42, 0.88);
export const FOLD_GUIDE_TICK_PDF_THICKNESS_PT = 0.55;

const AXIS_EPS_MM = 1e-4;
const EDGE_EPS_MM = 1e-6;
const MIN_SPAN_MM = 1e-3;
const DEDUP_PRECISION_SCALE = 20; // 0.05 mm rounding bucket

export interface FoldGuideTickOptions {
  readonly gapMm?: number;
  readonly lengthMm?: number;
}

interface AxisFoldSpec {
  readonly axis: 'v' | 'h';
  readonly coord: number;
  readonly label?: string;
}

function collectPolygonIntersectionsOnLine(
  polygon: Polygon2D,
  axis: 'v' | 'h',
  coord: number,
): readonly number[] {
  const hits: number[] = [];
  const count = polygon.length;
  for (let i = 0; i < count; i += 1) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % count];
    const c1 = axis === 'v' ? p1.x : p1.y;
    const c2 = axis === 'v' ? p2.x : p2.y;
    const s1 = axis === 'v' ? p1.y : p1.x;
    const s2 = axis === 'v' ? p2.y : p2.x;

    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    if (coord < minC - EDGE_EPS_MM || coord > maxC + EDGE_EPS_MM) {
      continue;
    }

    const dc = c2 - c1;
    if (Math.abs(dc) < EDGE_EPS_MM) {
      hits.push(s1, s2);
    } else {
      const rawT = (coord - c1) / dc;
      if (rawT >= -EDGE_EPS_MM && rawT <= 1 + EDGE_EPS_MM) {
        const clampedT = Math.min(1, Math.max(0, rawT));
        hits.push(s1 + clampedT * (s2 - s1));
      }
    }
  }
  return hits;
}

/**
 * Computes pairs of external registration ticks lying strictly outside `outerCutPolygon`
 * aligned with every unique vertical and horizontal fold line in `foldLines`.
 *
 * Works identically across all binding styles, split panels, and inner pockets/endpapers
 * directly from the backend-neutral Geometry IR.
 */
export function computeExternalFoldGuideTicks(
  outerCutPolygon: Polygon2D,
  foldLines: readonly LineSegment2D[],
  options?: FoldGuideTickOptions,
): readonly LineSegment2D[] {
  if (outerCutPolygon.length < 3 || foldLines.length === 0) {
    return [];
  }

  const gapMm = Math.max(0, options?.gapMm ?? FOLD_GUIDE_TICK_GAP_MM);
  const lengthMm = Math.max(0, options?.lengthMm ?? FOLD_GUIDE_TICK_LENGTH_MM);
  if (lengthMm <= 0) {
    return [];
  }

  const uniqueSpecs: AxisFoldSpec[] = [];
  const seenKeys = new Set<string>();

  for (const line of foldLines) {
    const dx = Math.abs(line.x2 - line.x1);
    const dy = Math.abs(line.y2 - line.y1);

    if (dx < AXIS_EPS_MM && dy > AXIS_EPS_MM) {
      const coord = (line.x1 + line.x2) / 2;
      const key = `v:${Math.round(coord * DEDUP_PRECISION_SCALE)}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueSpecs.push({ axis: 'v', coord, label: line.label });
      }
    } else if (dy < AXIS_EPS_MM && dx > AXIS_EPS_MM) {
      const coord = (line.y1 + line.y2) / 2;
      const key = `h:${Math.round(coord * DEDUP_PRECISION_SCALE)}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueSpecs.push({ axis: 'h', coord, label: line.label });
      }
    }
  }

  const ticks: LineSegment2D[] = [];

  for (const spec of uniqueSpecs) {
    const hits = collectPolygonIntersectionsOnLine(outerCutPolygon, spec.axis, spec.coord);
    if (hits.length === 0) continue;

    let minSpan = Infinity;
    let maxSpan = -Infinity;
    for (const value of hits) {
      if (value < minSpan) minSpan = value;
      if (value > maxSpan) maxSpan = value;
    }
    if (maxSpan - minSpan < MIN_SPAN_MM) continue;

    const c = roundTo(spec.coord, 3);
    const lowOuter = roundTo(minSpan - gapMm - lengthMm, 3);
    const lowInner = roundTo(minSpan - gapMm, 3);
    const highInner = roundTo(maxSpan + gapMm, 3);
    const highOuter = roundTo(maxSpan + gapMm + lengthMm, 3);

    if (spec.axis === 'v') {
      ticks.push(
        { x1: c, y1: lowOuter, x2: c, y2: lowInner, label: spec.label },
        { x1: c, y1: highInner, x2: c, y2: highOuter, label: spec.label },
      );
    } else {
      ticks.push(
        { x1: lowOuter, y1: c, x2: lowInner, y2: c, label: spec.label },
        { x1: highInner, y1: c, x2: highOuter, y2: c, label: spec.label },
      );
    }
  }

  return ticks;
}

/**
 * Extracts deduplicated interior vertical and horizontal fold lines from a 3-piece split
 * wrap panel's `guideRects` relative to its `cutPolygon` bounding box.
 */
export function deriveSplitPanelFoldLines(panel: SplitWrapPanel): readonly LineSegment2D[] {
  const bbox = GeometryPrimitives.boundingBox(panel.cutPolygon);
  if (bbox.width <= 0 || bbox.height <= 0) {
    return [];
  }

  const edgeMargin = 0.2;
  const seenV = new Set<number>();
  const seenH = new Set<number>();
  const lines: LineSegment2D[] = [];

  const addVertical = (x: number, label: string) => {
    if (x <= bbox.x + edgeMargin || x >= bbox.x + bbox.width - edgeMargin) return;
    const bucket = Math.round(x * DEDUP_PRECISION_SCALE);
    if (seenV.has(bucket)) return;
    seenV.add(bucket);
    lines.push({ x1: x, y1: bbox.y, x2: x, y2: bbox.y + bbox.height, label });
  };

  const addHorizontal = (y: number, label: string) => {
    if (y <= bbox.y + edgeMargin || y >= bbox.y + bbox.height - edgeMargin) return;
    const bucket = Math.round(y * DEDUP_PRECISION_SCALE);
    if (seenH.has(bucket)) return;
    seenH.add(bucket);
    lines.push({ x1: bbox.x, y1: y, x2: bbox.x + bbox.width, y2: y, label });
  };

  for (const { label, rect } of panel.guideRects) {
    addVertical(rect.x, label);
    addVertical(rect.x + rect.width, label);
    addHorizontal(rect.y, label);
    addHorizontal(rect.y + rect.height, label);
  }

  return lines;
}

/** Rotates fold guide ticks 90° clockwise inside a box of height `boxHeightMm` (top-down mm). */
export function transformTicks90CW(
  ticks: readonly LineSegment2D[],
  boxHeightMm: number,
): readonly LineSegment2D[] {
  return ticks.map((tick) => {
    const a = GeometryPrimitives.rotatePoint90CW({ x: tick.x1, y: tick.y1 }, boxHeightMm);
    const b = GeometryPrimitives.rotatePoint90CW({ x: tick.x2, y: tick.y2 }, boxHeightMm);
    return {
      x1: roundTo(a.x, 3),
      y1: roundTo(a.y, 3),
      x2: roundTo(b.x, 3),
      y2: roundTo(b.y, 3),
      label: tick.label,
    };
  });
}

/** Shifts fold guide ticks by `(dxMm, dyMm)` in top-down mm space. */
export function translateTicks(
  ticks: readonly LineSegment2D[],
  dxMm: number,
  dyMm: number,
): readonly LineSegment2D[] {
  if (dxMm === 0 && dyMm === 0) return ticks;
  return ticks.map((tick) => ({
    x1: roundTo(tick.x1 + dxMm, 3),
    y1: roundTo(tick.y1 + dyMm, 3),
    x2: roundTo(tick.x2 + dxMm, 3),
    y2: roundTo(tick.y2 + dyMm, 3),
    label: tick.label,
  }));
}

export interface DrawPdfFoldGuideTicksOptions {
  /** Total height of the target PDF page in mm (used to convert top-down mm to bottom-up PDF pt). */
  readonly pageHeightMm: number;
  /** X offset in top-down mm added to every tick coordinate. Defaults to 0. */
  readonly offsetXMm?: number;
  /** Y offset in top-down mm added to every tick coordinate. Defaults to 0. */
  readonly offsetYMm?: number;
  /** Optional clip rectangle in top-down page mm coordinates. */
  readonly clipRectMm?: Rect2D;
  /** Optional line thickness in pt (defaults to 0.55 pt). */
  readonly thicknessPt?: number;
}

function segmentIntersectsRect(seg: LineSegment2D, rect: Rect2D): boolean {
  const segMinX = Math.min(seg.x1, seg.x2);
  const segMaxX = Math.max(seg.x1, seg.x2);
  const segMinY = Math.min(seg.y1, seg.y2);
  const segMaxY = Math.max(seg.y1, seg.y2);
  return (
    segMaxX >= rect.x + EDGE_EPS_MM &&
    segMinX <= rect.x + rect.width - EDGE_EPS_MM &&
    segMaxY >= rect.y + EDGE_EPS_MM &&
    segMinY <= rect.y + rect.height - EDGE_EPS_MM
  );
}

/**
 * Shared PDF renderer for external fold guide ticks.
 * Draws crisp solid blue (`rgb(0.12, 0.42, 0.88)`, `0.55 pt`) lines clipped cleanly to `clipRectMm`.
 */
export function drawPdfFoldGuideTicks(
  page: PDFPage,
  ticks: readonly LineSegment2D[],
  options: DrawPdfFoldGuideTicksOptions,
): number {
  if (ticks.length === 0) return 0;

  const offsetXMm = options.offsetXMm ?? 0;
  const offsetYMm = options.offsetYMm ?? 0;
  const thicknessPt = options.thicknessPt ?? FOLD_GUIDE_TICK_PDF_THICKNESS_PT;

  const positioned: LineSegment2D[] = [];
  for (const tick of ticks) {
    const shifted: LineSegment2D = {
      x1: tick.x1 + offsetXMm,
      y1: tick.y1 + offsetYMm,
      x2: tick.x2 + offsetXMm,
      y2: tick.y2 + offsetYMm,
      label: tick.label,
    };
    if (!options.clipRectMm || segmentIntersectsRect(shifted, options.clipRectMm)) {
      positioned.push(shifted);
    }
  }

  if (positioned.length === 0) return 0;

  if (options.clipRectMm) {
    const { x, y, width, height } = options.clipRectMm;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        UnitConverter.mmToPoints(x),
        UnitConverter.mmToPoints(options.pageHeightMm - (y + height)),
        UnitConverter.mmToPoints(Math.max(0, width)),
        UnitConverter.mmToPoints(Math.max(0, height)),
      ),
      clip(),
      endPath(),
    );
  }

  for (const tick of positioned) {
    page.drawLine({
      start: {
        x: UnitConverter.mmToPoints(tick.x1),
        y: UnitConverter.mmToPoints(options.pageHeightMm - tick.y1),
      },
      end: {
        x: UnitConverter.mmToPoints(tick.x2),
        y: UnitConverter.mmToPoints(options.pageHeightMm - tick.y2),
      },
      color: FOLD_GUIDE_TICK_PDF_COLOR,
      thickness: thicknessPt,
    });
  }

  if (options.clipRectMm) {
    page.pushOperators(popGraphicsState());
  }

  return positioned.length;
}
