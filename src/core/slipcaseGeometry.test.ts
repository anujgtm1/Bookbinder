import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS, type BindingStyle } from '@/types/bookParams';
import { GeometryPrimitives } from '@/types/geometry';
import { calculateCaseGeometry } from './geometry';
import {
  DEFAULT_SLIPCASE_OPTIONS,
  SLIPCASE_OPTION_BOUNDS,
  buildThumbNotchSideWallPolyline,
  buildThumbNotchSideWallSvgPath,
  calculateSlipcaseGeometry,
  clampSlipcaseOptions,
  type SlipcaseGeometry,
} from './slipcaseGeometry';

function expectFlushStackingInvariants(slipcase: SlipcaseGeometry): void {
  const wallT = slipcase.options.wallBoardThicknessMm;

  // Flush-stacking DAS Bookbinding invariants
  expect(slipcase.sideWalls.heightMm - 2 * wallT).toBeCloseTo(slipcase.cavityHeightMm, 5);
  expect(slipcase.sideWalls.widthMm - wallT).toBeCloseTo(slipcase.cavityWidthMm, 5);
  expect(slipcase.headTailWalls.widthMm).toBeCloseTo(slipcase.sideWalls.widthMm, 5);
  expect(slipcase.headTailWalls.heightMm).toBeCloseTo(slipcase.cavityThicknessMm, 5);
  expect(slipcase.spineWall.widthMm).toBeCloseTo(slipcase.cavityThicknessMm, 5);
  expect(slipcase.spineWall.heightMm).toBeCloseTo(slipcase.cavityHeightMm, 5);

  // Exterior dimensions match flush stack
  expect(slipcase.outerWidthMm).toBeCloseTo(slipcase.sideWalls.widthMm, 5);
  expect(slipcase.outerHeightMm).toBeCloseTo(slipcase.sideWalls.heightMm, 5);
  expect(slipcase.outerThicknessMm).toBeCloseTo(slipcase.cavityThicknessMm + 2 * wallT, 5);

  // Panel quantities & roles
  expect(slipcase.sideWalls.quantity).toBe(2);
  expect(slipcase.sideWalls.role).toBe('side-wall');
  expect(slipcase.spineWall.quantity).toBe(1);
  expect(slipcase.spineWall.role).toBe('spine-wall');
  expect(slipcase.headTailWalls.quantity).toBe(2);
  expect(slipcase.headTailWalls.role).toBe('cap-wall');

  // Outer wrap strip formulas
  const turnIn = slipcase.options.wrapTurnInMm;
  expect(slipcase.mainWrapStrip.quantity).toBe(1);
  expect(slipcase.mainWrapStrip.widthMm).toBeCloseTo(
    slipcase.sideWalls.widthMm * 2 + slipcase.outerThicknessMm + turnIn * 2,
    2,
  );
  expect(slipcase.mainWrapStrip.heightMm).toBeCloseTo(slipcase.sideWalls.heightMm + turnIn * 2, 2);

  expect(slipcase.capWrapStrip.quantity).toBe(2);
  expect(slipcase.capWrapStrip.widthMm).toBeCloseTo(slipcase.sideWalls.widthMm + turnIn * 2, 2);
  expect(slipcase.capWrapStrip.heightMm).toBeCloseTo(slipcase.outerThicknessMm + turnIn * 2, 2);
}

describe('clampSlipcaseOptions', () => {
  it('returns defaults when called with undefined or non-finite values', () => {
    expect(clampSlipcaseOptions()).toEqual(DEFAULT_SLIPCASE_OPTIONS);
    expect(
      clampSlipcaseOptions({
        slideClearanceMm: Number.NaN,
        wallBoardThicknessMm: Number.POSITIVE_INFINITY,
        thumbNotchRadiusMm: Number.NEGATIVE_INFINITY,
        wrapTurnInMm: undefined,
      }),
    ).toEqual(DEFAULT_SLIPCASE_OPTIONS);
  });

  it('clamps all option fields to safe bookbinding bounds', () => {
    const low = clampSlipcaseOptions({
      slideClearanceMm: -10,
      wallBoardThicknessMm: 0.1,
      thumbNotchRadiusMm: -5,
      wrapTurnInMm: 2,
    });
    expect(low).toEqual({
      slideClearanceMm: SLIPCASE_OPTION_BOUNDS.slideClearanceMm.min,
      wallBoardThicknessMm: SLIPCASE_OPTION_BOUNDS.wallBoardThicknessMm.min,
      thumbNotchRadiusMm: SLIPCASE_OPTION_BOUNDS.thumbNotchRadiusMm.min,
      wrapTurnInMm: SLIPCASE_OPTION_BOUNDS.wrapTurnInMm.min,
    });

    const high = clampSlipcaseOptions({
      slideClearanceMm: 99,
      wallBoardThicknessMm: 12,
      thumbNotchRadiusMm: 80,
      wrapTurnInMm: 100,
    });
    expect(high).toEqual({
      slideClearanceMm: SLIPCASE_OPTION_BOUNDS.slideClearanceMm.max,
      wallBoardThicknessMm: SLIPCASE_OPTION_BOUNDS.wallBoardThicknessMm.max,
      thumbNotchRadiusMm: SLIPCASE_OPTION_BOUNDS.thumbNotchRadiusMm.max,
      wrapTurnInMm: SLIPCASE_OPTION_BOUNDS.wrapTurnInMm.max,
    });
  });
});

describe('calculateSlipcaseGeometry', () => {
  it('computes exact flush-stacking dimensions for a hardcover rigid-case book', () => {
    const caseGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const slipcase = calculateSlipcaseGeometry(caseGeom);

    // Default rigid-case: coverBoards 143 × 223, spineStrip 28, boardT 2 => book outer 143 × 223 × 32
    expect(slipcase.bookOuterWidthMm).toBe(143);
    expect(slipcase.bookOuterHeightMm).toBe(223);
    expect(slipcase.bookOuterThicknessMm).toBe(32);

    // Default clearance 2.0 mm => fore-edge ease max(1.0, 1.5) = 1.5 mm
    expect(slipcase.cavityWidthMm).toBe(144.5);
    expect(slipcase.cavityHeightMm).toBe(225);
    expect(slipcase.cavityThicknessMm).toBe(34);

    // Default wall board 2.0 mm
    expect(slipcase.spineWall.widthMm).toBe(34);
    expect(slipcase.spineWall.heightMm).toBe(225);
    expect(slipcase.headTailWalls.widthMm).toBe(146.5);
    expect(slipcase.headTailWalls.heightMm).toBe(34);
    expect(slipcase.sideWalls.widthMm).toBe(146.5);
    expect(slipcase.sideWalls.heightMm).toBe(229);

    expect(slipcase.outerWidthMm).toBe(146.5);
    expect(slipcase.outerHeightMm).toBe(229);
    expect(slipcase.outerThicknessMm).toBe(38);
    expect(slipcase.effectiveThumbNotchRadiusMm).toBe(12);
    expect(slipcase.sideWalls.hasThumbNotch).toBe(true);

    expectFlushStackingInvariants(slipcase);
  });

  it('computes exact flush-stacking dimensions for a boardless softcover-jacket book', () => {
    const softCase = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
    });
    const slipcase = calculateSlipcaseGeometry(softCase, {
      slideClearanceMm: 1.5,
      wallBoardThicknessMm: 2.5,
      wrapTurnInMm: 20,
    });

    // Softcover cutList: coverBoards 141 × 218, spineStrip 25, boardT 0 => bookOuterThickness = 25 + 1.0 = 26
    expect(slipcase.bookOuterWidthMm).toBe(141);
    expect(slipcase.bookOuterHeightMm).toBe(218);
    expect(slipcase.bookOuterThicknessMm).toBe(26);

    // Fore-edge ease = max(1.0, 1.5 * 0.75 = 1.125) = 1.125 => 142.13
    expect(slipcase.cavityWidthMm).toBe(142.13);
    expect(slipcase.cavityHeightMm).toBe(219.5);
    expect(slipcase.cavityThicknessMm).toBe(27.5);

    expectFlushStackingInvariants(slipcase);
  });

  it('maintains flush-stacking invariants across every supported binding style', () => {
    const styles: BindingStyle[] = [
      'rigid-case',
      'flexible-spine',
      'softcover-jacket',
      'dust-jacket',
      'paperback-wrap',
    ];
    for (const bindingStyle of styles) {
      const caseGeom = calculateCaseGeometry({ ...DEFAULT_BOOK_PARAMETERS, bindingStyle });
      const slipcase = calculateSlipcaseGeometry(caseGeom, {
        slideClearanceMm: 3.0,
        wallBoardThicknessMm: 3.0,
      });
      expectFlushStackingInvariants(slipcase);
    }
  });

  it('enforces the 1.0 mm fore-edge depth floor when slide clearance is tight (0.5 mm)', () => {
    const caseGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const slipcase = calculateSlipcaseGeometry(caseGeom, { slideClearanceMm: 0.5 });
    expect(slipcase.cavityWidthMm).toBeCloseTo(slipcase.bookOuterWidthMm + 1.0, 5);
    expect(slipcase.cavityHeightMm).toBeCloseTo(slipcase.bookOuterHeightMm + 0.5, 5);
    expect(slipcase.cavityThicknessMm).toBeCloseTo(slipcase.bookOuterThicknessMm + 0.5, 5);
    expectFlushStackingInvariants(slipcase);
  });

  it('disables the thumb notch cleanly when thumbNotchRadiusMm is 0', () => {
    const caseGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const slipcase = calculateSlipcaseGeometry(caseGeom, { thumbNotchRadiusMm: 0 });

    expect(slipcase.effectiveThumbNotchRadiusMm).toBe(0);
    expect(slipcase.sideWalls.hasThumbNotch).toBe(false);
    expect(slipcase.sideWalls.svgPathD).not.toContain('A ');
    expect(slipcase.sideWalls.cutPolylinePoints).toHaveLength(4);
  });

  it('clamps the effective thumb-notch radius to a safe fraction of small side wall dimensions', () => {
    const tinyBook = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 50,
      pbHeightMm: 60,
      pbThicknessMm: 8,
    });
    const slipcase = calculateSlipcaseGeometry(tinyBook, { thumbNotchRadiusMm: 25 });

    expect(slipcase.effectiveThumbNotchRadiusMm).toBeLessThan(25);
    expect(slipcase.effectiveThumbNotchRadiusMm).toBeLessThanOrEqual(
      slipcase.sideWalls.heightMm * 0.3 + 0.001,
    );
    expect(slipcase.effectiveThumbNotchRadiusMm).toBeLessThanOrEqual(
      slipcase.sideWalls.widthMm * 0.35 + 0.001,
    );
    expect(slipcase.sideWalls.hasThumbNotch).toBe(true);
  });
});

describe('thumb-notch side wall geometry builders', () => {
  it('emits an SVG arc command when notch > 0 and omits it when notch === 0', () => {
    const rightPath = buildThumbNotchSideWallSvgPath(140, 220, 12, 'right');
    expect(rightPath).toContain('A 12 12 0 0 0 140 122');

    const leftPath = buildThumbNotchSideWallSvgPath(140, 220, 12, 'left');
    expect(leftPath).toContain('A 12 12 0 0 0 0 98');

    const straightPath = buildThumbNotchSideWallSvgPath(140, 220, 0, 'right');
    expect(straightPath).toBe('M 0 0 L 140 0 L 140 220 L 0 220 Z');
    expect(straightPath).not.toContain('A ');
  });

  it('produces an inward semi-circular polyline strictly inside panel bounds', () => {
    const w = 140;
    const h = 220;
    const r = 12;

    const rightPoly = buildThumbNotchSideWallPolyline(w, h, r, 'right', 24);
    expect(rightPoly.length).toBe(29); // 2 + 25 arc pts + 2
    const rightBbox = GeometryPrimitives.boundingBox(rightPoly);
    expect(rightBbox).toEqual({ x: 0, y: 0, width: w, height: h });
    // Arc midpoint at index 2 + 12 = 14 should sit at (w - r, h / 2)
    expect(rightPoly[14].x).toBeCloseTo(w - r, 2);
    expect(rightPoly[14].y).toBeCloseTo(h / 2, 2);

    const leftPoly = buildThumbNotchSideWallPolyline(w, h, r, 'left', 24);
    expect(leftPoly.length).toBe(29); // 4 + 25 arc pts
    const leftBbox = GeometryPrimitives.boundingBox(leftPoly);
    expect(leftBbox).toEqual({ x: 0, y: 0, width: w, height: h });
    // Arc midpoint at index 4 + 12 = 16 should sit at (r, h / 2)
    expect(leftPoly[16].x).toBeCloseTo(r, 2);
    expect(leftPoly[16].y).toBeCloseTo(h / 2, 2);

    const noNotchPoly = buildThumbNotchSideWallPolyline(w, h, 0, 'right');
    expect(noNotchPoly).toHaveLength(4);
  });
});
