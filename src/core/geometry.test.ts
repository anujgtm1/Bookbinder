import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { GeometryPrimitives } from '@/types/geometry';
import {
  calculateCaseGeometry,
  calculateChipboardCutList,
  evaluateRollWidth,
} from './geometry';

describe('calculateCaseGeometry', () => {
  it('computes exact default chipboard cut list from SPEC.md', () => {
    const cutList = calculateChipboardCutList(DEFAULT_BOOK_PARAMETERS);
    // BOARD_W = 140 + 3 = 143, BOARD_H = 216 + 7 = 223, SPINE_W = 24 + 2 = 26
    expect(cutList.coverBoards.quantity).toBe(2);
    expect(cutList.coverBoards.widthMm).toBeCloseTo(143.0, 5);
    expect(cutList.coverBoards.heightMm).toBeCloseTo(223.0, 5);
    expect(cutList.spineStrip.quantity).toBe(1);
    expect(cutList.spineStrip.widthMm).toBeCloseTo(26.0, 5);
    expect(cutList.spineStrip.heightMm).toBeCloseTo(223.0, 5);
  });

  it('computes outer case wrap dimensions, placement rects, and 8-point 45° miter polygon', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const { outerWrap } = geom;

    // INNER_W = 143*2 + 9*2 + 26 = 330
    // WRAP_W = 330 + 36 = 366, WRAP_H = 223 + 36 = 259
    expect(outerWrap.innerWidthMm).toBeCloseTo(330.0, 5);
    expect(outerWrap.widthMm).toBeCloseTo(366.0, 5);
    expect(outerWrap.heightMm).toBeCloseTo(259.0, 5);

    // 45° corner miter geometry: MITER_GAP = 2 * 1.5 = 3.0 mm perpendicular distance from (18, 18)
    expect(outerWrap.miterGapMm).toBeCloseTo(3.0, 5);
    const expectedLeg = 2 * 18 - 3 * Math.SQRT2;
    expect(outerWrap.miterCutLegMm).toBeCloseTo(expectedLeg, 5);
    expect(outerWrap.outerCutPolygon).toHaveLength(8);

    // Verify perpendicular distance from board corner (18, 18) to top-left miter segment
    const p0 = outerWrap.outerCutPolygon[0];
    const p7 = outerWrap.outerCutPolygon[7];
    expect(p0.y).toBe(0);
    expect(p7.x).toBe(0);
    expect(p0.x).toBeCloseTo(p7.y, 5); // exact 45° bevel
    const perpDist = Math.abs(18 + 18 - p0.x) / Math.SQRT2;
    expect(perpDist).toBeCloseTo(3.0, 5);

    // Verify contiguous horizontal layout: back -> leftHinge -> spine -> rightHinge -> front
    expect(outerWrap.backBoardRect.x).toBe(18);
    expect(GeometryPrimitives.rectRight(outerWrap.backBoardRect)).toBeCloseTo(
      outerWrap.leftHingeRect.x,
      5,
    );
    expect(GeometryPrimitives.rectRight(outerWrap.leftHingeRect)).toBeCloseTo(
      outerWrap.spineRect.x,
      5,
    );
    expect(GeometryPrimitives.rectRight(outerWrap.spineRect)).toBeCloseTo(
      outerWrap.rightHingeRect.x,
      5,
    );
    expect(GeometryPrimitives.rectRight(outerWrap.rightHingeRect)).toBeCloseTo(
      outerWrap.frontBoardRect.x,
      5,
    );
    expect(GeometryPrimitives.rectRight(outerWrap.frontBoardRect)).toBeCloseTo(
      outerWrap.widthMm - 18,
      5,
    );

    // Bleed frame extends 3 mm on all 4 sides
    expect(outerWrap.bleedRect).toEqual({ x: -3, y: -3, width: 372, height: 265 });
  });

  it('recommends narrowest compatible roll printer width and orientation', () => {
    // Default wrap: 366 x 259 mm. 13" roll printable = 320 mm -> fits rotated 90° (259 <= 320) with 61 mm spare
    const recDefault = evaluateRollWidth(366, 259);
    expect(recDefault.fits).toBe(true);
    expect(recDefault.roll?.inches).toBe(13);
    expect(recDefault.orientation).toBe('rotated-90');
    expect(recDefault.spareWidthMm).toBeCloseTo(61, 1);

    // Larger book: 460 x 350 mm -> exceeds 13" (320), fits 17" (422) rotated 90° with 72 mm spare
    const rec17 = evaluateRollWidth(460, 350);
    expect(rec17.fits).toBe(true);
    expect(rec17.roll?.inches).toBe(17);
    expect(rec17.orientation).toBe('rotated-90');
    expect(rec17.spareWidthMm).toBeCloseTo(72, 1);

    // Tall narrow sheet: 280 x 350 mm -> fits 13" unrotated (280 <= 320)
    const recUnrotated = evaluateRollWidth(280, 350);
    expect(recUnrotated.fits).toBe(true);
    expect(recUnrotated.roll?.inches).toBe(13);
    expect(recUnrotated.orientation).toBe('unrotated');

    // Oversized sheet exceeding 44" roll (1108 mm printable)
    const recTooBig = evaluateRollWidth(1200, 1150);
    expect(recTooBig.fits).toBe(false);
    expect(recTooBig.roll).toBeNull();
  });

  it('computes inner spine reinforcement liner dimensions and 4 score lines', () => {
    const { spineLiner } = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    // LINER_W = 26 + 18 + 30 = 74 mm; LINER_H = 223 - 2 = 221 mm
    expect(spineLiner.widthMm).toBeCloseTo(74.0, 5);
    expect(spineLiner.heightMm).toBeCloseTo(221.0, 5);
    expect(spineLiner.scoreLines).toHaveLength(4);
    expect(spineLiner.scoreLines.map((l) => l.x1)).toEqual([15, 24, 50, 59]);
  });

  it('computes mirrored front and back slip-in pocket envelopes with 45° mitered flaps', () => {
    const { frontPocket, backPocket } = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    // POCKET_W = 143 * 0.72 = 102.96, POCKET_H = 221
    expect(frontPocket.pocketWidthMm).toBeCloseTo(102.96, 4);
    expect(frontPocket.pocketHeightMm).toBeCloseTo(221.0, 5);
    expect(frontPocket.totalWidthMm).toBeCloseTo(114.96, 4);
    expect(frontPocket.totalHeightMm).toBeCloseTo(245.0, 5);
    expect(frontPocket.openEdge).toBe('left');
    expect(frontPocket.scoreLines).toHaveLength(3);
    expect(frontPocket.glueFlapPolygons).toHaveLength(3);

    expect(backPocket.pocketWidthMm).toBeCloseTo(102.96, 4);
    expect(backPocket.openEdge).toBe('right');
    expect(backPocket.scoreLines).toHaveLength(3);
    expect(backPocket.glueFlapPolygons).toHaveLength(3);

    // Verify bounding boxes match exact total dimensions
    const frontBounds = GeometryPrimitives.boundingBox(frontPocket.outerCutPolygon);
    const backBounds = GeometryPrimitives.boundingBox(backPocket.outerCutPolygon);
    expect(frontBounds.width).toBeCloseTo(frontPocket.totalWidthMm, 4);
    expect(frontBounds.height).toBeCloseTo(frontPocket.totalHeightMm, 4);
    expect(backBounds.width).toBeCloseTo(backPocket.totalWidthMm, 4);
    expect(backBounds.height).toBeCloseTo(backPocket.totalHeightMm, 4);
  });

  it('computes 3-piece quarter-bound split panels accurately', () => {
    const { splitPanels } = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      splitMode: 'three-piece',
      quarterBoundOverlapMm: 20,
    });
    expect(splitPanels).toHaveLength(3);
    const [back, spine, front] = splitPanels;
    // Spine wrap width = 26 + 18 + 40 = 84 mm
    expect(spine.widthMm).toBeCloseTo(84.0, 5);
    expect(spine.heightMm).toBeCloseTo(259.0, 5);
    // Cover panel width = (143 - 20 + 3) + 18 = 144 mm
    expect(back.widthMm).toBeCloseTo(144.0, 5);
    expect(front.widthMm).toBeCloseTo(144.0, 5);
    // Outer fore-edge corners mitered (6 vertices instead of 4)
    expect(back.cutPolygon).toHaveLength(6);
    expect(front.cutPolygon).toHaveLength(6);
    expect(spine.cutPolygon).toHaveLength(4);
  });

  it('computes 2-board flexible-spine geometry (no rigid spine strip, unified cloth spine gap) for a 5 mm A6 notebook', () => {
    const a6Flex = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'flexible-spine' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      boardThicknessMm: 1.5,
      overhangForeEdgeMm: 1.5,
      overhangTopBottomMm: 3,
      turnInMm: 14,
    };

    const geom = calculateCaseGeometry(a6Flex);
    expect(geom.bindingStyle).toBe('flexible-spine');
    expect(geom.cutList.coverBoards.quantity).toBe(2);
    expect(geom.cutList.spineStrip.quantity).toBe(0);
    // Flexible spine channel = 5 + 2*1.5 + 2 = 10 mm; hinge spacer = 0
    expect(geom.cutList.spineStrip.widthMm).toBeCloseTo(10.0, 4);
    expect(geom.cutList.hingeSpacerMm).toBe(0);
    expect(geom.outerWrap.leftHingeRect.width).toBe(0);
    expect(geom.outerWrap.rightHingeRect.width).toBe(0);
    // Wrap width = (106.5 * 2 + 10) + 14 * 2 = 251 mm
    expect(geom.outerWrap.widthMm).toBeCloseTo(251.0, 4);
    expect(geom.spineLiner.scoreLines).toHaveLength(2);
  });

  it('computes 0-board softcover slip-in jacket geometry with integrated tuck flaps and rectangular cut outline', () => {
    const a6Soft = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      overhangForeEdgeMm: 0,
      overhangTopBottomMm: 2,
    };

    const geom = calculateCaseGeometry(a6Soft);
    expect(geom.bindingStyle).toBe('softcover-jacket');
    expect(geom.cutList.coverBoards.quantity).toBe(0);
    expect(geom.cutList.spineStrip.quantity).toBe(0);
    expect(geom.cutList.boardThicknessMm).toBe(0);
    expect(geom.outerWrap.turnInMm).toBe(0);
    expect(geom.outerWrap.miterCutLegMm).toBe(0);
    expect(geom.outerWrap.outerCutPolygon).toHaveLength(4);
    // Flap = roundTo(105 * 0.42, 1) = 44.1 mm; spine = 6 mm
    expect(geom.outerWrap.jacketFlapWidthMm).toBeCloseTo(44.1, 2);
    expect(geom.outerWrap.spineRect.width).toBeCloseTo(6.0, 2);
    expect(geom.outerWrap.widthMm).toBeCloseTo(44.1 * 2 + 105 * 2 + 6, 2);
    expect(geom.outerWrap.heightMm).toBeCloseTo(150, 2);
  });
});
