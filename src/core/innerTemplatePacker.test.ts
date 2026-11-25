import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOK_PARAMETERS,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
  type PageSizeId,
} from '@/types/bookParams';
import { calculateCaseGeometry } from './geometry';
import {
  packRects2D,
  type PackableRect,
  type PackedRectPlacement,
} from './innerTemplatePacker';
import {
  INNER_PAGE_MARGIN_MM,
  INNER_PIECE_GAP_MM,
  planInnerTemplateLayout,
  type InnerPdfLayoutPlan,
  type InnerPieceKind,
} from './pdfExport';

const INVARIANT_EPS_MM = 1e-6;
const ALL_PAGE_SIZES: readonly PageSizeId[] = ['letter', 'a4', 'legal', 'tabloid'];

/**
 * Reference implementation of the legacy greedy single-row shelf packer
 * previously in `src/core/pdfExport.ts` so regression tests can verify
 * `packRects2D` never regresses and strictly improves on L-shaped layouts.
 */
function legacyShelfPackCount<TKind extends string>(
  items: readonly PackableRect<TKind>[],
  pageWidthMm: number,
  pageHeightMm: number,
  marginMm: number,
  gapMm: number,
  preferFirstPageKind?: TKind,
): number {
  const usableW = pageWidthMm - marginMm * 2;
  const usableH = pageHeightMm - marginMm * 2;

  const runShelf = (ordered: readonly PackableRect<TKind>[]) => {
    const bins: { shelves: { yMm: number; heightMm: number; cursorXMm: number }[] }[] = [
      { shelves: [] },
    ];
    const pageByKind = new Map<TKind, number>();

    const tryPlace = (
      bin: { shelves: { yMm: number; heightMm: number; cursorXMm: number }[] },
      w: number,
      h: number,
    ): boolean => {
      for (const shelf of bin.shelves) {
        const nextX = shelf.cursorXMm === 0 ? 0 : shelf.cursorXMm + gapMm;
        if (nextX + w <= usableW + 0.01 && h <= shelf.heightMm + 0.01) {
          shelf.cursorXMm = nextX + w;
          return true;
        }
      }
      const nextShelfY =
        bin.shelves.length === 0
          ? 0
          : bin.shelves[bin.shelves.length - 1].yMm +
            bin.shelves[bin.shelves.length - 1].heightMm +
            gapMm;
      if (w <= usableW + 0.01 && nextShelfY + h <= usableH + 0.01) {
        bin.shelves.push({ yMm: nextShelfY, heightMm: h, cursorXMm: w });
        return true;
      }
      return false;
    };

    for (const item of ordered) {
      const orientations = item.allowRotate
        ? [
            { w: item.widthMm, h: item.heightMm },
            { w: item.heightMm, h: item.widthMm },
          ]
        : [{ w: item.widthMm, h: item.heightMm }];

      let placed = false;
      for (let pageIndex = 0; pageIndex < bins.length && !placed; pageIndex += 1) {
        for (const o of orientations) {
          if (tryPlace(bins[pageIndex], o.w, o.h)) {
            pageByKind.set(item.kind, pageIndex);
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        const newBin = { shelves: [] as { yMm: number; heightMm: number; cursorXMm: number }[] };
        bins.push(newBin);
        const pageIndex = bins.length - 1;
        for (const o of orientations) {
          if (tryPlace(newBin, o.w, o.h)) {
            pageByKind.set(item.kind, pageIndex);
            placed = true;
            break;
          }
        }
        if (!placed) {
          pageByKind.set(item.kind, pageIndex);
        }
      }
    }

    return { pageCount: bins.length, pageByKind };
  };

  const candA = runShelf(items);
  if (!preferFirstPageKind || items.length < 2) {
    return candA.pageCount;
  }

  const preferred = items.find((i) => i.kind === preferFirstPageKind);
  if (!preferred) return candA.pageCount;

  const rest = items.filter((i) => i.kind !== preferFirstPageKind);
  const candB = runShelf([rest[0], preferred, ...rest.slice(1)]);
  const aPrefOnPage0 = candA.pageByKind.get(preferFirstPageKind) === 0;
  return aPrefOnPage0 && candA.pageCount <= candB.pageCount ? candA.pageCount : candB.pageCount;
}

/**
 * Verifies every physical packing invariant on a 2D packed layout:
 * 1. Exact 1-to-1 coverage of every requested piece kind.
 * 2. Page indices cover [0..pageCount - 1].
 * 3. Every non-clipped piece sits strictly inside [marginMm, pageSize - marginMm].
 * 4. Every pair of pieces on the same page has >= gapMm horizontal OR vertical clearance.
 */
function assertPackingInvariants<TKind extends string>(
  placements: readonly PackedRectPlacement<TKind>[],
  expectedKinds: readonly TKind[],
  pageCount: number,
  pageWidthMm: number,
  pageHeightMm: number,
  marginMm: number,
  gapMm: number,
): void {
  expect(placements).toHaveLength(expectedKinds.length);

  const seenKinds = placements.map((p) => p.kind).sort();
  expect(seenKinds).toEqual([...expectedKinds].sort());

  const usedPages = new Set(placements.map((p) => p.pageIndex));
  expect(usedPages.size).toBe(pageCount);
  for (let p = 0; p < pageCount; p += 1) {
    expect(usedPages.has(p)).toBe(true);
  }

  for (const p of placements) {
    expect(p.widthMm).toBeGreaterThan(0);
    expect(p.heightMm).toBeGreaterThan(0);
    expect(p.xMm).toBeGreaterThanOrEqual(marginMm - INVARIANT_EPS_MM);
    expect(p.yMm).toBeGreaterThanOrEqual(marginMm - INVARIANT_EPS_MM);
    if (!p.clipped) {
      expect(p.xMm + p.widthMm).toBeLessThanOrEqual(pageWidthMm - marginMm + INVARIANT_EPS_MM);
      expect(p.yMm + p.heightMm).toBeLessThanOrEqual(pageHeightMm - marginMm + INVARIANT_EPS_MM);
    }
  }

  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i];
      const b = placements[j];
      if (a.pageIndex !== b.pageIndex) continue;

      const horizontalGap = Math.max(b.xMm - (a.xMm + a.widthMm), a.xMm - (b.xMm + b.widthMm));
      const verticalGap = Math.max(b.yMm - (a.yMm + a.heightMm), a.yMm - (b.yMm + b.heightMm));
      const maxClearance = Math.max(horizontalGap, verticalGap);
      expect(maxClearance).toBeGreaterThanOrEqual(gapMm - INVARIANT_EPS_MM);
    }
  }
}

function assertInnerPlanInvariants(plan: InnerPdfLayoutPlan, includeLegend: boolean): void {
  const expectedKinds: InnerPieceKind[] = includeLegend
    ? ['back-pocket', 'front-pocket', 'spine-liner', 'calibration-legend']
    : ['back-pocket', 'front-pocket', 'spine-liner'];
  assertPackingInvariants(
    plan.placements,
    expectedKinds,
    plan.pageCount,
    plan.pageWidthMm,
    plan.pageHeightMm,
    INNER_PAGE_MARGIN_MM,
    INNER_PIECE_GAP_MM,
  );
  if (includeLegend) {
    const legend = plan.placements.find((p) => p.kind === 'calibration-legend');
    expect(legend?.rotated90).toBe(false);
  }
}

describe('innerTemplatePacker (Exact 2D MaxRects Bin Packer)', () => {
  it('returns an empty plan for zero items', () => {
    const result = packRects2D([], {
      pageWidthMm: 215.9,
      pageHeightMm: 279.4,
      marginMm: INNER_PAGE_MARGIN_MM,
      gapMm: INNER_PIECE_GAP_MM,
    });
    expect(result.pageCount).toBe(0);
    expect(result.placements).toEqual([]);
  });

  it('packs an L-shaped residual layout (vertical pocket + horizontal pocket + spine liner beneath horizontal pocket) onto 1 page where the legacy shelf packer required 2 pages', () => {
    // Usable area = 200 × 180 mm (page = 215 × 195 mm with 7.5 mm margin, 5 mm gap).
    // Vertical piece (90 × 180) + horizontal piece (105 × 90) sit side-by-side (90 + 5 + 105 = 200).
    // Directly underneath the horizontal piece is a 105 × 85 mm empty pocket (y = 95..180)
    // where the spine liner (100 × 80) fits cleanly with >= 5 mm clearance!
    // A single-row shelf packer locks Shelf 1 at height 180 and forces Spine Liner onto Page 2.
    const items: readonly PackableRect<InnerPieceKind>[] = [
      { kind: 'front-pocket', widthMm: 90, heightMm: 180, allowRotate: true },
      { kind: 'back-pocket', widthMm: 90, heightMm: 105, allowRotate: true },
      { kind: 'spine-liner', widthMm: 80, heightMm: 100, allowRotate: true },
    ];
    const pageW = 215;
    const pageH = 195;

    const shelfPages = legacyShelfPackCount(
      items,
      pageW,
      pageH,
      INNER_PAGE_MARGIN_MM,
      INNER_PIECE_GAP_MM,
    );
    expect(shelfPages).toBe(2);

    const packed = packRects2D(items, {
      pageWidthMm: pageW,
      pageHeightMm: pageH,
      marginMm: INNER_PAGE_MARGIN_MM,
      gapMm: INNER_PIECE_GAP_MM,
    });

    expect(packed.pageCount).toBe(1);
    expect(packed.placements.every((p) => !p.clipped)).toBe(true);
    assertPackingInvariants(
      packed.placements,
      ['front-pocket', 'back-pocket', 'spine-liner'],
      packed.pageCount,
      pageW,
      pageH,
      INNER_PAGE_MARGIN_MM,
      INNER_PIECE_GAP_MM,
    );
  });

  it('packs real symmetric book inner pockets + spine liner into a unique L-shaped 1-page layout on US Letter and A4 where the legacy shelf packer required 2 pages', () => {
    // Case 1: US Letter (215.9 × 279.4 mm, usable 200.9 × 264.4 mm)
    // Book: 105 × 140 mm, 46 mm spine -> pockets 89.76 × 167.0 mm, spine liner 96.0 × 143.0 mm.
    // - Two vertical pockets leave 264.4 - 172.0 = 92.4 mm < 96.0 mm -> shelf packer needs 2 pages!
    // - Two horizontal pockets + horizontal liner need 89.76 + 5 + 89.76 + 5 + 96 = 285.52 mm > 264.4 mm!
    // - ONLY an L-shaped arrangement (1 horizontal pocket + 1 vertical pocket + spine liner tucked in the L-corner)
    //   fits onto 1 US Letter page: 89.76 + 5 + 167.0 = 261.76 <= 264.4 mm and 89.76 + 5 + 96.0 = 190.76 <= 200.9 mm!
    const letterGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 105,
      pbHeightMm: 140,
      pbThicknessMm: 46,
    });
    const letterItems: readonly PackableRect<InnerPieceKind>[] = [
      {
        kind: 'back-pocket',
        widthMm: letterGeom.backPocket.totalWidthMm,
        heightMm: letterGeom.backPocket.totalHeightMm,
        allowRotate: true,
      },
      {
        kind: 'front-pocket',
        widthMm: letterGeom.frontPocket.totalWidthMm,
        heightMm: letterGeom.frontPocket.totalHeightMm,
        allowRotate: true,
      },
      {
        kind: 'spine-liner',
        widthMm: letterGeom.spineLiner.widthMm,
        heightMm: letterGeom.spineLiner.heightMm,
        allowRotate: true,
      },
    ];

    const letter = PAGE_SIZES.letter;
    expect(
      legacyShelfPackCount(
        letterItems,
        letter.widthMm,
        letter.heightMm,
        INNER_PAGE_MARGIN_MM,
        INNER_PIECE_GAP_MM,
      ),
    ).toBe(2);

    const letterPlan = planInnerTemplateLayout(letterGeom, 'letter');
    expect(letterPlan.pageCount).toBe(1);
    expect(letterPlan.placements.every((p) => !p.clipped)).toBe(true);
    assertInnerPlanInvariants(letterPlan, false);
    const letterBack = letterPlan.placements.find((p) => p.kind === 'back-pocket');
    const letterFront = letterPlan.placements.find((p) => p.kind === 'front-pocket');
    expect(letterBack?.rotated90).not.toBe(letterFront?.rotated90);

    // Case 2: A4 (210 × 297 mm, usable 195 × 282 mm)
    // Book: 105 × 154 mm, 48 mm spine -> pockets 89.76 × 181.0 mm, spine liner 98.0 × 157.0 mm.
    // - Two vertical pockets leave 282 - 186 = 96.0 < 98.0 -> shelf packer needs 2 pages!
    // - Two horizontal pockets + liner need 287.52 > 282 -> doesn't fit!
    // - L-shaped 1 horizontal + 1 vertical + spine liner fits onto 1 A4 sheet!
    const a4Geom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 105,
      pbHeightMm: 154,
      pbThicknessMm: 48,
    });
    const a4Items: readonly PackableRect<InnerPieceKind>[] = [
      {
        kind: 'back-pocket',
        widthMm: a4Geom.backPocket.totalWidthMm,
        heightMm: a4Geom.backPocket.totalHeightMm,
        allowRotate: true,
      },
      {
        kind: 'front-pocket',
        widthMm: a4Geom.frontPocket.totalWidthMm,
        heightMm: a4Geom.frontPocket.totalHeightMm,
        allowRotate: true,
      },
      {
        kind: 'spine-liner',
        widthMm: a4Geom.spineLiner.widthMm,
        heightMm: a4Geom.spineLiner.heightMm,
        allowRotate: true,
      },
    ];

    const a4 = PAGE_SIZES.a4;
    expect(
      legacyShelfPackCount(
        a4Items,
        a4.widthMm,
        a4.heightMm,
        INNER_PAGE_MARGIN_MM,
        INNER_PIECE_GAP_MM,
      ),
    ).toBe(2);

    const a4Plan = planInnerTemplateLayout(a4Geom, 'a4');
    expect(a4Plan.pageCount).toBe(1);
    expect(a4Plan.placements.every((p) => !p.clipped)).toBe(true);
    assertInnerPlanInvariants(a4Plan, false);
    const a4Back = a4Plan.placements.find((p) => p.kind === 'back-pocket');
    const a4Front = a4Plan.placements.find((p) => p.kind === 'front-pocket');
    expect(a4Back?.rotated90).not.toBe(a4Front?.rotated90);
  });

  it('strictly improves standard Mass Market folded-endpapers preset on Tabloid from 2 pages to 1 page', () => {
    // Mass Market Paperback (106 × 174 × 24 mm) with Folded Endpapers on Tabloid:
    // Endpapers are 212 × 174 mm; Spine Liner is 74 × 177 mm.
    // Legacy shelf packer stacks both horizontal (174 + 5 + 174 = 353 mm) leaving 58.8 mm < 74 mm -> 2 pages!
    // Exact 2D MaxRects places 1 vertical (174 × 212) + Spine Liner (74 × 177) beside it + 1 horizontal (212 × 174) below -> 1 page!
    const mmPreset = PAPERBACK_PRESETS.find((p) => p.id === 'mass-market');
    expect(mmPreset).toBeDefined();
    if (!mmPreset) return;

    const mmFoldedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: mmPreset.pbWidthMm,
      pbHeightMm: mmPreset.pbHeightMm,
      interiorStyle: 'folded-endpapers',
    });
    const tabloid = PAGE_SIZES.tabloid;
    expect(
      legacyShelfPackCount(
        [
          {
            kind: 'back-pocket',
            widthMm: mmFoldedGeom.backPocket.totalWidthMm,
            heightMm: mmFoldedGeom.backPocket.totalHeightMm,
            allowRotate: true,
          },
          {
            kind: 'front-pocket',
            widthMm: mmFoldedGeom.frontPocket.totalWidthMm,
            heightMm: mmFoldedGeom.frontPocket.totalHeightMm,
            allowRotate: true,
          },
          {
            kind: 'spine-liner',
            widthMm: mmFoldedGeom.spineLiner.widthMm,
            heightMm: mmFoldedGeom.spineLiner.heightMm,
            allowRotate: true,
          },
        ],
        tabloid.widthMm,
        tabloid.heightMm,
        INNER_PAGE_MARGIN_MM,
        INNER_PIECE_GAP_MM,
      ),
    ).toBe(2);

    const mmTabloidPlan = planInnerTemplateLayout(mmFoldedGeom, 'tabloid');
    expect(mmTabloidPlan.pageCount).toBe(1);
    expect(mmTabloidPlan.placements.every((p) => !p.clipped)).toBe(true);
    assertInnerPlanInvariants(mmTabloidPlan, false);
  });

  it('does not waste a trailing gap at the right or bottom sheet margins', () => {
    // Usable = 200 × 200 (page 215 × 215, margin 7.5, gap 5.0).
    // Two 97.5 × 200 pieces need 97.5 + 5 + 97.5 = 200.0 mm exact width and 200.0 mm exact height!
    const items: readonly PackableRect<'a' | 'b'>[] = [
      { kind: 'a', widthMm: 97.5, heightMm: 200, allowRotate: false },
      { kind: 'b', widthMm: 97.5, heightMm: 200, allowRotate: false },
    ];
    const packed = packRects2D(items, {
      pageWidthMm: 215,
      pageHeightMm: 215,
      marginMm: 7.5,
      gapMm: 5.0,
    });
    expect(packed.pageCount).toBe(1);
    expect(packed.placements.every((p) => !p.clipped)).toBe(true);
    assertPackingInvariants(packed.placements, ['a', 'b'], 1, 215, 215, 7.5, 5.0);
  });

  it('respects allowRotate: false even when rotating would reduce pageCount', () => {
    // Usable = 100 × 200; item is 180 × 50 with allowRotate: false -> cannot rotate to fit, must clip
    const packed = packRects2D(
      [{ kind: 'calibration-legend', widthMm: 180, heightMm: 50, allowRotate: false }],
      { pageWidthMm: 115, pageHeightMm: 215, marginMm: 7.5, gapMm: 5.0 },
    );
    expect(packed.pageCount).toBe(1);
    expect(packed.placements[0].rotated90).toBe(false);
    expect(packed.placements[0].clipped).toBe(true);
  });

  it('keeps preferFirstPageKind on Page 0 when tied on pageCount, without ever worsening pageCount', () => {
    // 2 pages required either way: two large pieces (160 × 150) + small legend (62 × 84) on usable 200 × 264.
    // Legend fits alongside one large piece on Page 0 (200 - 160 - 5 = 35? No, 264 - 150 - 5 = 109 >= 84).
    const items: readonly PackableRect<InnerPieceKind>[] = [
      { kind: 'back-pocket', widthMm: 160, heightMm: 150, allowRotate: true },
      { kind: 'front-pocket', widthMm: 160, heightMm: 150, allowRotate: true },
      { kind: 'calibration-legend', widthMm: 62, heightMm: 84, allowRotate: false },
    ];
    const packed = packRects2D(items, {
      pageWidthMm: PAGE_SIZES.letter.widthMm,
      pageHeightMm: PAGE_SIZES.letter.heightMm,
      marginMm: INNER_PAGE_MARGIN_MM,
      gapMm: INNER_PIECE_GAP_MM,
      preferFirstPageKind: 'calibration-legend',
    });
    expect(packed.pageCount).toBe(2);
    const legend = packed.placements.find((p) => p.kind === 'calibration-legend');
    expect(legend?.pageIndex).toBe(0);
    expect(legend?.rotated90).toBe(false);
    assertPackingInvariants(
      packed.placements,
      ['back-pocket', 'front-pocket', 'calibration-legend'],
      packed.pageCount,
      PAGE_SIZES.letter.widthMm,
      PAGE_SIZES.letter.heightMm,
      INNER_PAGE_MARGIN_MM,
      INNER_PIECE_GAP_MM,
    );
  });

  it('picks minimum-overflow orientation for an oversized clipped piece and keeps other pieces non-overlapping', () => {
    // Usable = 200 × 264. Piece = 280 × 250 (exceeds usable in both orientations):
    // - Unrotated (280 × 250): inside = 200 × 250 = 50000, overflow = 20000
    // - Rotated   (250 × 280): inside = 200 × 264 = 52800, overflow = 17200  <-- strictly less overflow!
    const packed = packRects2D(
      [
        { kind: 'oversized', widthMm: 280, heightMm: 250, allowRotate: true },
        { kind: 'small', widthMm: 50, heightMm: 50, allowRotate: false },
      ],
      { pageWidthMm: 215, pageHeightMm: 279, marginMm: 7.5, gapMm: 5.0 },
    );
    const oversized = packed.placements.find((p) => p.kind === 'oversized');
    const small = packed.placements.find((p) => p.kind === 'small');
    expect(oversized?.clipped).toBe(true);
    expect(oversized?.rotated90).toBe(true);
    expect(oversized?.widthMm).toBe(250);
    expect(oversized?.heightMm).toBe(280);
    expect(small?.clipped).toBe(false);
    // Small piece must not overlap the oversized clipped piece
    expect(small?.pageIndex).toBe(1);
    assertPackingInvariants(packed.placements, ['oversized', 'small'], 2, 215, 279, 7.5, 5.0);
  });

  it('packs > 4 items deterministically using the area-descending MaxRects fallback with full invariants', () => {
    const items: readonly PackableRect<string>[] = [
      { kind: 'p1', widthMm: 85, heightMm: 120, allowRotate: true },
      { kind: 'p2', widthMm: 85, heightMm: 120, allowRotate: true },
      { kind: 'p3', widthMm: 50, heightMm: 110, allowRotate: true },
      { kind: 'p4', widthMm: 62, heightMm: 84, allowRotate: false },
      { kind: 'p5', widthMm: 60, heightMm: 70, allowRotate: true },
      { kind: 'p6', widthMm: 45, heightMm: 60, allowRotate: true },
    ];
    const packed = packRects2D(items, {
      pageWidthMm: PAGE_SIZES.letter.widthMm,
      pageHeightMm: PAGE_SIZES.letter.heightMm,
      marginMm: INNER_PAGE_MARGIN_MM,
      gapMm: INNER_PIECE_GAP_MM,
      preferFirstPageKind: 'p4',
    });

    expect(packed.pageCount).toBeGreaterThanOrEqual(1);
    expect(packed.pageCount).toBeLessThanOrEqual(2);
    expect(packed.placements.every((p) => !p.clipped)).toBe(true);
    expect(packed.placements.find((p) => p.kind === 'p4')?.pageIndex).toBe(0);
    expect(packed.placements.find((p) => p.kind === 'p4')?.rotated90).toBe(false);
    assertPackingInvariants(
      packed.placements,
      items.map((i) => i.kind),
      packed.pageCount,
      PAGE_SIZES.letter.widthMm,
      PAGE_SIZES.letter.heightMm,
      INNER_PAGE_MARGIN_MM,
      INNER_PIECE_GAP_MM,
    );
  });

  it('satisfies all packing invariants and never regresses vs legacy shelf packer across all standard presets × desktop sheets (with & without legend)', () => {
    let strictImprovements = 0;

    for (const preset of PAPERBACK_PRESETS) {
      for (const interiorStyle of ['slip-pockets', 'folded-endpapers'] as const) {
        const geom = calculateCaseGeometry({
          ...DEFAULT_BOOK_PARAMETERS,
          pbWidthMm: preset.pbWidthMm,
          pbHeightMm: preset.pbHeightMm,
          interiorStyle,
        });

        for (const pageSizeId of ALL_PAGE_SIZES) {
          const sheet = PAGE_SIZES[pageSizeId];

          for (const includeLegend of [false, true]) {
            const plan = planInnerTemplateLayout(geom, pageSizeId, { includeLegend });
            assertInnerPlanInvariants(plan, includeLegend);

            const items: PackableRect<InnerPieceKind>[] = [
              {
                kind: 'back-pocket',
                widthMm: geom.backPocket.totalWidthMm,
                heightMm: geom.backPocket.totalHeightMm,
                allowRotate: true,
              },
              {
                kind: 'front-pocket',
                widthMm: geom.frontPocket.totalWidthMm,
                heightMm: geom.frontPocket.totalHeightMm,
                allowRotate: true,
              },
              {
                kind: 'spine-liner',
                widthMm: geom.spineLiner.widthMm,
                heightMm: geom.spineLiner.heightMm,
                allowRotate: true,
              },
            ];
            if (includeLegend) {
              items.push({
                kind: 'calibration-legend',
                widthMm: 62,
                heightMm: 84,
                allowRotate: false,
              });
            }

            const shelfPages = legacyShelfPackCount(
              items,
              sheet.widthMm,
              sheet.heightMm,
              INNER_PAGE_MARGIN_MM,
              INNER_PIECE_GAP_MM,
              includeLegend ? 'calibration-legend' : undefined,
            );

            expect(plan.pageCount).toBeLessThanOrEqual(shelfPages);
            if (plan.pageCount < shelfPages) {
              strictImprovements += 1;
            }
          }
        }
      }
    }

    // Standard presets strictly improve (Mass Market folded-endpapers on Tabloid: 2 -> 1 page)
    expect(strictImprovements).toBeGreaterThanOrEqual(1);
  });

  it('maintains invariants for detached softcover-jacket pockets and folded-endpapers across all sheet sizes', () => {
    const softcoverSeparate = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      softcoverPocketMode: 'separate',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 16,
    });
    const foldedEndpapers = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'rigid-case',
      interiorStyle: 'folded-endpapers',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 16,
    });

    for (const geom of [softcoverSeparate, foldedEndpapers]) {
      for (const pageSizeId of ALL_PAGE_SIZES) {
        for (const includeLegend of [false, true]) {
          const plan = planInnerTemplateLayout(geom, pageSizeId, { includeLegend });
          assertInnerPlanInvariants(plan, includeLegend);
        }
      }
    }
  });
});
