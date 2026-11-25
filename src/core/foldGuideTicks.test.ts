import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOK_PARAMETERS,
  type BindingStyle,
  type BookParameters,
} from '@/types/bookParams';
import type { LineSegment2D, Point2D, Polygon2D } from '@/types/geometry';
import {
  FOLD_GUIDE_TICK_GAP_MM,
  FOLD_GUIDE_TICK_LENGTH_MM,
  INNER_FOLD_GUIDE_TICK_LENGTH_MM,
  computeExternalFoldGuideTicks,
  deriveSplitPanelFoldLines,
  transformTicks90CW,
} from './foldGuideTicks';
import { calculateCaseGeometry } from './geometry';

/** Ray-casting point-in-polygon check (strictly interior or on boundary). */
function isPointInsideOrOnPolygon(pt: Point2D, polygon: Polygon2D): boolean {
  const eps = 1e-4;
  // Boundary check first
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < eps * eps) continue;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    if (Math.hypot(pt.x - projX, pt.y - projY) <= eps) {
      return true;
    }
  }

  // Strict interior ray-cast
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Minimum Euclidean distance from a point to any edge of `polygon`. */
function distanceToPolygonBoundary(pt: Point2D, polygon: Polygon2D): number {
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
    const dist = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function assertAllTicksStrictlyOutside(
  polygon: Polygon2D,
  ticks: readonly LineSegment2D[],
  expectedLen: number,
  expectedGap = FOLD_GUIDE_TICK_GAP_MM,
): void {
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks.length % 2).toBe(0);

  for (const tick of ticks) {
    const len = Math.hypot(tick.x2 - tick.x1, tick.y2 - tick.y1);
    expect(len).toBeCloseTo(expectedLen, 2);

    // Sample start, midpoint, and end of each tick — every point must lie strictly outside polygon
    const samples: Point2D[] = [
      { x: tick.x1, y: tick.y1 },
      { x: (tick.x1 + tick.x2) / 2, y: (tick.y1 + tick.y2) / 2 },
      { x: tick.x2, y: tick.y2 },
    ];
    for (const pt of samples) {
      expect(isPointInsideOrOnPolygon(pt, polygon)).toBe(false);
    }

    // The endpoint closer to the polygon should have a non-zero clearance gap (<= expectedGap along the fold axis)
    const d1 = distanceToPolygonBoundary({ x: tick.x1, y: tick.y1 }, polygon);
    const d2 = distanceToPolygonBoundary({ x: tick.x2, y: tick.y2 }, polygon);
    const nearDist = Math.min(d1, d2);
    expect(nearDist).toBeGreaterThan(0.5);
    expect(nearDist).toBeLessThanOrEqual(expectedGap + 0.05);
  }
}

describe('computeExternalFoldGuideTicks', () => {
  const styles: readonly {
    readonly name: string;
    readonly params: Partial<BookParameters>;
    readonly expectedUniqueFolds: number;
  }[] = [
    {
      name: 'rigid-case (2 horizontal turn-ins + 6 vertical board/hinge/turn-in folds)',
      params: { bindingStyle: 'rigid-case' as BindingStyle },
      expectedUniqueFolds: 8,
    },
    {
      name: 'flexible-spine (2 horizontal turn-ins + 4 vertical board/spine/turn-in folds)',
      params: { bindingStyle: 'flexible-spine' as BindingStyle },
      expectedUniqueFolds: 6,
    },
    {
      name: 'softcover-jacket integrated (4 vertical folds + 2 deduplicated horizontal glue-tab folds)',
      params: { bindingStyle: 'softcover-jacket' as BindingStyle, softcoverPocketMode: 'integrated' },
      expectedUniqueFolds: 6,
    },
    {
      name: 'softcover-jacket separate (2 vertical spine folds + 2 deduplicated horizontal glue-tab folds)',
      params: { bindingStyle: 'softcover-jacket' as BindingStyle, softcoverPocketMode: 'separate' },
      expectedUniqueFolds: 4,
    },
    {
      name: 'dust-jacket (4 vertical flap/spine folds)',
      params: { bindingStyle: 'dust-jacket' as BindingStyle },
      expectedUniqueFolds: 4,
    },
    {
      name: 'paperback-wrap (2 vertical spine folds)',
      params: { bindingStyle: 'paperback-wrap' as BindingStyle },
      expectedUniqueFolds: 2,
    },
  ];

  for (const { name, params, expectedUniqueFolds } of styles) {
    it(`emits strictly external 1.5 mm gap / 4.0 mm ticks for ${name}`, () => {
      const geom = calculateCaseGeometry({ ...DEFAULT_BOOK_PARAMETERS, ...params });
      const ticks = computeExternalFoldGuideTicks(
        geom.outerWrap.outerCutPolygon,
        geom.outerWrap.foldLines,
      );

      expect(ticks).toHaveLength(expectedUniqueFolds * 2);
      assertAllTicksStrictlyOutside(
        geom.outerWrap.outerCutPolygon,
        ticks,
        FOLD_GUIDE_TICK_LENGTH_MM,
      );
    });
  }

  it('places softcover-jacket spine ticks strictly inside the 10 mm top/bottom trim waste above/below the spine', () => {
    const geom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      softcoverPocketMode: 'integrated',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 38,
    });
    const ticks = computeExternalFoldGuideTicks(
      geom.outerWrap.outerCutPolygon,
      geom.outerWrap.foldLines,
    );
    const spineX = geom.outerWrap.spineRect.x;
    const spineTicks = ticks.filter((t) => Math.abs(t.x1 - spineX) < 0.05 && Math.abs(t.x2 - spineX) < 0.05);
    expect(spineTicks).toHaveLength(2);

    const [topTick, bottomTick] = spineTicks.sort((a, b) => a.y1 - b.y1);
    // y1 = 10 mm glue tab height -> top tick sits at [4.5, 8.5] mm (strictly inside [0, 10] trim waste)
    expect(topTick.y1).toBeCloseTo(4.5, 2);
    expect(topTick.y2).toBeCloseTo(8.5, 2);
    // y2 = 160 mm -> bottom tick sits at [161.5, 165.5] mm (strictly inside [160, 170] trim waste)
    expect(bottomTick.y1).toBeCloseTo(geom.outerWrap.heightMm - 10 + 1.5, 2);
    expect(bottomTick.y2).toBeCloseTo(geom.outerWrap.heightMm - 10 + 5.5, 2);
  });

  it('places rigid-case turn-in ticks strictly outside the 45° corner miter edges', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const ticks = computeExternalFoldGuideTicks(
      geom.outerWrap.outerCutPolygon,
      geom.outerWrap.foldLines,
    );
    const turnIn = geom.outerWrap.turnInMm;
    const leg = geom.outerWrap.miterCutLegMm;
    // Along x = turnIn, the top-left 45° miter line x + y = leg crosses at y = leg - turnIn
    const expectedMiterY = leg - turnIn;

    const backForeTicks = ticks.filter(
      (t) => Math.abs(t.x1 - turnIn) < 0.05 && Math.abs(t.x2 - turnIn) < 0.05,
    );
    expect(backForeTicks).toHaveLength(2);
    const topTick = backForeTicks.sort((a, b) => a.y1 - b.y1)[0];
    expect(topTick.y2).toBeCloseTo(expectedMiterY - FOLD_GUIDE_TICK_GAP_MM, 2);
    expect(topTick.y1).toBeCloseTo(
      expectedMiterY - FOLD_GUIDE_TICK_GAP_MM - FOLD_GUIDE_TICK_LENGTH_MM,
      2,
    );
  });

  it('computes strictly external ticks for inner slip pockets, separate pockets, folded endpapers, and spine liner', () => {
    // 1. Standard 3-flap hardcover inner pockets & spine liner
    const hcGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    for (const pocket of [hcGeom.backPocket, hcGeom.frontPocket]) {
      const ticks = computeExternalFoldGuideTicks(pocket.outerCutPolygon, pocket.scoreLines, {
        lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM,
      });
      // 3 unique fold lines (top flap, bottom flap, fore-edge flap) => 6 ticks
      expect(ticks).toHaveLength(6);
      assertAllTicksStrictlyOutside(
        pocket.outerCutPolygon,
        ticks,
        INNER_FOLD_GUIDE_TICK_LENGTH_MM,
      );
    }

    const linerPoly: Polygon2D = [
      { x: 0, y: 0 },
      { x: hcGeom.spineLiner.widthMm, y: 0 },
      { x: hcGeom.spineLiner.widthMm, y: hcGeom.spineLiner.heightMm },
      { x: 0, y: hcGeom.spineLiner.heightMm },
    ];
    const linerTicks = computeExternalFoldGuideTicks(linerPoly, hcGeom.spineLiner.scoreLines, {
      lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM,
    });
    expect(linerTicks).toHaveLength(hcGeom.spineLiner.scoreLines.length * 2);
    assertAllTicksStrictlyOutside(linerPoly, linerTicks, INNER_FOLD_GUIDE_TICK_LENGTH_MM);

    // 2. Folded glue-in endpapers (1 vertical center fold => 2 ticks)
    const endpaperGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      interiorStyle: 'folded-endpapers',
    });
    const endpaperTicks = computeExternalFoldGuideTicks(
      endpaperGeom.frontPocket.outerCutPolygon,
      endpaperGeom.frontPocket.scoreLines,
      { lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM },
    );
    expect(endpaperTicks).toHaveLength(2);
    assertAllTicksStrictlyOutside(
      endpaperGeom.frontPocket.outerCutPolygon,
      endpaperTicks,
      INNER_FOLD_GUIDE_TICK_LENGTH_MM,
    );

    // 3. Softcover separate 6-vertex 1-flap pocket (1 vertical fore-edge fold => 2 ticks)
    const sepGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      softcoverPocketMode: 'separate',
    });
    const sepTicks = computeExternalFoldGuideTicks(
      sepGeom.frontPocket.outerCutPolygon,
      sepGeom.frontPocket.scoreLines,
      { lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM },
    );
    expect(sepTicks).toHaveLength(2);
    assertAllTicksStrictlyOutside(
      sepGeom.frontPocket.outerCutPolygon,
      sepTicks,
      INNER_FOLD_GUIDE_TICK_LENGTH_MM,
    );
  });

  it('derives split panel fold lines and transforms ticks 90° clockwise accurately', () => {
    const geom = calculateCaseGeometry({ ...DEFAULT_BOOK_PARAMETERS, splitMode: 'three-piece' });
    for (const panel of geom.splitPanels) {
      const folds = deriveSplitPanelFoldLines(panel);
      expect(folds.length).toBeGreaterThanOrEqual(3);
      const ticks = computeExternalFoldGuideTicks(panel.cutPolygon, folds);
      assertAllTicksStrictlyOutside(panel.cutPolygon, ticks, FOLD_GUIDE_TICK_LENGTH_MM);
    }

    const rotated = transformTicks90CW([{ x1: 20, y1: -5.5, x2: 20, y2: -1.5 }], 100);
    // (x, y) -> (boxH - y, x)
    expect(rotated).toEqual([{ x1: 105.5, y1: 20, x2: 101.5, y2: 20, label: undefined }]);
  });
});
