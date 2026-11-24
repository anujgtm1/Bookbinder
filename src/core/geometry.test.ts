import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS, PAGE_SIZES } from '@/types/bookParams';
import { GeometryPrimitives } from '@/types/geometry';
import { UnitConverter } from '@/types/units';
import {
  calculateCaseGeometry,
  calculateChipboardCutList,
  calculateMaxSlipFlapForSheetMm,
  computeMaxFlapWidthForSheet,
  evaluatePrintMediaFit,
  evaluateRollWidth,
} from './geometry';
import { generateInnerTemplatesPdf, planInnerTemplateLayout } from './pdfExport';
import { generateInnerTemplatesSvg } from './svgExport';

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

  it('computes 0-board 1-piece fold-and-glue slip cover with 4 mitered flap glue tabs fitting 1× US Letter / A4 on A6', () => {
    const a6Soft = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
    };

    const geom = calculateCaseGeometry(a6Soft);
    expect(geom.bindingStyle).toBe('softcover-jacket');
    expect(geom.cutList.coverBoards.quantity).toBe(0);
    expect(geom.cutList.spineStrip.quantity).toBe(0);
    expect(geom.cutList.boardThicknessMm).toBe(0);
    expect(geom.outerWrap.turnInMm).toBe(0);
    expect(geom.outerWrap.miterCutLegMm).toBe(0);
    // 20-vertex clockwise outline with 4 mitered wrap-over glue tabs on Back & Front outer cover edges
    expect(geom.outerWrap.outerCutPolygon).toHaveLength(20);
    expect(geom.outerWrap.jacketGlueTabHeightMm).toBeCloseTo(10.0, 2);
    expect(geom.outerWrap.jacketGlueTabPolygons).toHaveLength(4);
    // Snug slip ease: cover panel = 106 × 150 mm, spine = 6 mm, flap = roundTo(105 * 0.23, 1) = 24.2 mm
    expect(geom.outerWrap.jacketFlapWidthMm).toBeCloseTo(24.2, 2);
    expect(geom.outerWrap.spineRect.width).toBeCloseTo(6.0, 2);
    expect(geom.outerWrap.backBoardRect.y).toBeCloseTo(10.0, 2);
    // Verify wrap-over glue tabs sit on the outer cover edges (x = 24.2..48.4 and x = 218.0..242.2)
    // so folding the side flaps inward first preserves the full 150 mm unobstructed pocket height
    const backTopTabBox = GeometryPrimitives.boundingBox(geom.outerWrap.jacketGlueTabPolygons[0]);
    const frontTopTabBox = GeometryPrimitives.boundingBox(geom.outerWrap.jacketGlueTabPolygons[1]);
    expect(backTopTabBox.x).toBeCloseTo(24.2, 1);
    expect(backTopTabBox.width).toBeCloseTo(24.2, 1);
    expect(frontTopTabBox.x + frontTopTabBox.width).toBeCloseTo(242.2, 1);
    expect(frontTopTabBox.width).toBeCloseTo(24.2, 1);
    expect(geom.outerWrap.widthMm).toBeCloseTo(24.2 * 2 + 106 * 2 + 6, 2); // 266.4 mm <= 269.4 mm US Letter printable
    expect(geom.outerWrap.heightMm).toBeCloseTo(170.0, 2); // 150 + 2*10 <= 205.9 mm US Letter printable
    expect(geom.rollRecommendation.fits).toBe(true);
    expect(geom.rollRecommendation.summary).toContain('US Letter / A4');

    // A slightly wider sheet (276 x 170 mm) fits A4 (287 mm printable) but not US Letter (269.4 mm)
    const a4Only = evaluateRollWidth(276, 170);
    expect(a4Only.fits).toBe(true);
    expect(a4Only.summary).toContain('1× A4 (210 × 297 mm)');
  });

  it('supports custom jacketFlapWidthMm, computes sheet max slip flaps, and detects US Legal home sheets', () => {
    const a6Soft = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
    };

    // Max slip flap helpers for 5 mm A6 (innerW = 218 mm, margin = 10 mm)
    expect(calculateMaxSlipFlapForSheetMm(a6Soft, 279.4)).toBeCloseTo(25.7, 1);
    expect(calculateMaxSlipFlapForSheetMm(a6Soft, 297.0)).toBeCloseTo(34.5, 1);

    // Custom 38 mm deep slip flap => width = 218 + 76 = 294 mm, height = 170 mm => US Legal
    const deepGeom = calculateCaseGeometry({ ...a6Soft, jacketFlapWidthMm: 38 });
    expect(deepGeom.outerWrap.jacketFlapWidthMm).toBeCloseTo(38.0, 2);
    expect(deepGeom.outerWrap.widthMm).toBeCloseTo(294.0, 2);
    expect(deepGeom.outerWrap.heightMm).toBeCloseTo(170.0, 2);
    expect(deepGeom.rollRecommendation.fits).toBe(true);
    expect(deepGeom.rollRecommendation.summary).toBe('Fits on 1× US Legal (8.5 × 14") home sheet');

    // Direct evaluateRollWidth checks: 294 × 170 => US Legal; default hardcover 366 × 259 => 13" roll
    const legalRec = evaluateRollWidth(294, 170);
    expect(legalRec.fits).toBe(true);
    expect(legalRec.summary).toBe('Fits on 1× US Legal (8.5 × 14") home sheet');

    const hardcoverRec = evaluateRollWidth(366, 259);
    expect(hardcoverRec.fits).toBe(true);
    expect(hardcoverRec.roll?.inches).toBe(13);
    expect(hardcoverRec.summary).toContain('13" roll');

    // Custom flap clamped to 20..65 mm bounds
    expect(calculateCaseGeometry({ ...a6Soft, jacketFlapWidthMm: 10 }).outerWrap.jacketFlapWidthMm).toBe(20);
    expect(calculateCaseGeometry({ ...a6Soft, jacketFlapWidthMm: 95 }).outerWrap.jacketFlapWidthMm).toBe(65);
  });

  it('evaluates 3-state Target Print Media fit (1-sheet, 2-sheet tile, roll, and does-not-fit)', () => {
    // 1. State 1: fits-1-sheet (A6 softcover 266.4 x 170 mm on US Letter -> Landscape 279.4 x 215.9 mm)
    const a6Letter = evaluatePrintMediaFit('letter', 266.4, 170);
    expect(a6Letter.status).toBe('fits-1-sheet');
    expect(a6Letter.sheetPageWidthMm).toBeCloseTo(279.4, 2);
    expect(a6Letter.sheetPageHeightMm).toBeCloseTo(215.9, 2);
    expect(a6Letter.tilePages).toBe(1);
    expect(a6Letter.tileOverlapMm).toBe(0);
    expect(a6Letter.suggestedMediaId).toBeNull();
    expect(a6Letter.summary).toContain('US Letter (8.5 × 11")');

    // Portrait 1-sheet fit (180 x 250 mm on US Letter -> Portrait 215.9 x 279.4 mm)
    const tallLetter = evaluatePrintMediaFit('letter', 180, 250);
    expect(tallLetter.status).toBe('fits-1-sheet');
    expect(tallLetter.sheetPageWidthMm).toBeCloseTo(215.9, 2);
    expect(tallLetter.sheetPageHeightMm).toBeCloseTo(279.4, 2);
    expect(tallLetter.tilePages).toBe(1);

    // 2. State 2: fits-2-sheet-tile (default Trade Digest 366 x 259 mm on US Letter -> 2 Portrait sheets, 10 mm overlap)
    const digestLetter = evaluatePrintMediaFit('letter', 366, 259);
    expect(digestLetter.status).toBe('fits-2-sheet-tile');
    expect(digestLetter.sheetPageWidthMm).toBeCloseTo(215.9, 2);
    expect(digestLetter.sheetPageHeightMm).toBeCloseTo(279.4, 2);
    expect(digestLetter.tilePages).toBe(2);
    expect(digestLetter.tileOverlapMm).toBe(10);
    expect(digestLetter.suggestedMediaId).toBe('tabloid');

    // Landscape 2-sheet tile (wide short cover 450 x 170 mm on US Letter -> 2 Landscape sheets)
    const wideShortLetter = evaluatePrintMediaFit('letter', 450, 170);
    expect(wideShortLetter.status).toBe('fits-2-sheet-tile');
    expect(wideShortLetter.sheetPageWidthMm).toBeCloseTo(279.4, 2);
    expect(wideShortLetter.sheetPageHeightMm).toBeCloseTo(215.9, 2);
    expect(wideShortLetter.tilePages).toBe(2);
    expect(wideShortLetter.tileOverlapMm).toBe(10);

    // 3. State 3: does-not-fit (oversized 480 x 310 mm on US Letter -> height exceeds 269.4 mm printable)
    const oversizedLetter = evaluatePrintMediaFit('letter', 480, 310);
    expect(oversizedLetter.status).toBe('does-not-fit');
    expect(oversizedLetter.sheetPageWidthMm).toBeNull();
    expect(oversizedLetter.sheetPageHeightMm).toBeNull();
    expect(oversizedLetter.tilePages).toBe(1);
    expect(oversizedLetter.suggestedMediaId).toBe('roll-13');

    // 4. Explicit roll checks
    const roll13Fit = evaluatePrintMediaFit('roll-13', 366, 259);
    expect(roll13Fit.status).toBe('fits-roll');
    expect(roll13Fit.suggestedMediaId).toBeNull();

    const roll13Overflow = evaluatePrintMediaFit('roll-13', 460, 350);
    expect(roll13Overflow.status).toBe('does-not-fit');
    expect(roll13Overflow.suggestedMediaId).toBe('roll-17');

    // 5. exact-auto delegates to evaluateRollWidth
    const autoFit = evaluatePrintMediaFit('exact-auto', 366, 259);
    expect(autoFit.status).toBe('fits-roll');
    expect(autoFit.sheetPageWidthMm).toBeNull();
    expect(autoFit.tilePages).toBe(1);
    expect(autoFit.summary).toContain('13" roll');
  });

  it('respects custom tileOverlapMm (clamped to 5..30 mm) when evaluating 2-sheet tiled fit boundaries', () => {
    // US Letter Portrait printable width = 205.9 mm -> 2-sheet max width = 411.8 - overlapMm
    // 15 mm overlap -> max = 396.8 mm; 20 mm overlap -> max = 391.8 mm
    const fit15 = evaluatePrintMediaFit('letter', 395, 250, 15);
    expect(fit15.status).toBe('fits-2-sheet-tile');
    expect(fit15.tileOverlapMm).toBe(15);
    expect(fit15.summary).toContain('15 mm overlap');

    const overflow20 = evaluatePrintMediaFit('letter', 395, 250, 20);
    expect(overflow20.status).toBe('does-not-fit');
    expect(overflow20.tileOverlapMm).toBe(0);

    // Fits comfortably with 20 mm overlap when width <= 391.8 mm
    const fit20 = evaluatePrintMediaFit('letter', 390, 250, 20);
    expect(fit20.status).toBe('fits-2-sheet-tile');
    expect(fit20.tileOverlapMm).toBe(20);
    expect(fit20.summary).toContain('20 mm overlap');

    // Clamps out-of-range overlap values safely to [5..30]
    const clampedLow = evaluatePrintMediaFit('letter', 366, 259, 1);
    expect(clampedLow.status).toBe('fits-2-sheet-tile');
    expect(clampedLow.tileOverlapMm).toBe(5);

    const clampedHigh = evaluatePrintMediaFit('letter', 366, 259, 50);
    expect(clampedHigh.status).toBe('fits-2-sheet-tile');
    expect(clampedHigh.tileOverlapMm).toBe(30);
  });

  it('computes flush 1-piece paperback-wrap geometry (0 boards, 0 flaps, 0 glue tabs) fitting 1× US Letter on A6', () => {
    const a6Paperback = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      printMedia: 'letter' as const,
    };

    const geom = calculateCaseGeometry(a6Paperback);
    expect(geom.bindingStyle).toBe('paperback-wrap');
    expect(geom.cutList.coverBoards.quantity).toBe(0);
    expect(geom.cutList.coverBoards.widthMm).toBe(105);
    expect(geom.cutList.coverBoards.heightMm).toBe(148);
    expect(geom.cutList.spineStrip.quantity).toBe(0);
    expect(geom.cutList.spineStrip.widthMm).toBe(10);
    expect(geom.cutList.spineStrip.heightMm).toBe(148);
    expect(geom.cutList.boardThicknessMm).toBe(0);
    expect(geom.cutList.hingeSpacerMm).toBe(0);

    const { outerWrap } = geom;
    expect(outerWrap.widthMm).toBe(220);
    expect(outerWrap.heightMm).toBe(148);
    expect(outerWrap.turnInMm).toBe(0);
    expect(outerWrap.miterCutLegMm).toBe(0);
    expect(outerWrap.jacketFlapWidthMm).toBe(0);
    expect(outerWrap.jacketGlueTabHeightMm).toBe(0);
    expect(outerWrap.jacketGlueTabPolygons).toHaveLength(0);
    expect(outerWrap.outerCutPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 220, y: 0 },
      { x: 220, y: 148 },
      { x: 0, y: 148 },
    ]);
    expect(outerWrap.backBoardRect).toEqual({ x: 0, y: 0, width: 105, height: 148 });
    expect(outerWrap.leftHingeRect).toEqual({ x: 105, y: 0, width: 0, height: 148 });
    expect(outerWrap.spineRect).toEqual({ x: 105, y: 0, width: 10, height: 148 });
    expect(outerWrap.rightHingeRect).toEqual({ x: 115, y: 0, width: 0, height: 148 });
    expect(outerWrap.frontBoardRect).toEqual({ x: 115, y: 0, width: 105, height: 148 });
    expect(outerWrap.foldLines).toHaveLength(2);
    expect(outerWrap.foldLines.map((l) => l.x1)).toEqual([105, 115]);

    expect(geom.mediaFit.status).toBe('fits-1-sheet');
    expect(geom.rollRecommendation.fits).toBe(true);
    expect(geom.rollRecommendation.summary).toContain('US Letter / A4');
  });

  it('computes classic dust-jacket geometry with wrap ease, wide fold-in flaps, 4-vertex cut rect, and zero glue tabs', () => {
    const a6DustJacket = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 50,
      printMedia: 'legal' as const,
    };

    const geom = calculateCaseGeometry(a6DustJacket);
    expect(geom.bindingStyle).toBe('dust-jacket');
    expect(geom.cutList.coverBoards.quantity).toBe(0);
    expect(geom.cutList.coverBoards.widthMm).toBe(106); // +1.0 mm wrap ease
    expect(geom.cutList.coverBoards.heightMm).toBe(148); // flush height
    expect(geom.cutList.spineStrip.quantity).toBe(0);
    expect(geom.cutList.spineStrip.widthMm).toBe(11.5); // +1.5 mm spine fold ease
    expect(geom.cutList.hingeSpacerMm).toBe(0);

    const { outerWrap } = geom;
    // 50 + 106 + 11.5 + 106 + 50 = 323.5 mm
    expect(outerWrap.widthMm).toBe(323.5);
    expect(outerWrap.heightMm).toBe(148);
    expect(outerWrap.turnInMm).toBe(0);
    expect(outerWrap.miterCutLegMm).toBe(0);
    expect(outerWrap.jacketFlapWidthMm).toBe(50);
    expect(outerWrap.jacketGlueTabHeightMm).toBe(0);
    expect(outerWrap.jacketGlueTabPolygons).toHaveLength(0);
    expect(outerWrap.outerCutPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 323.5, y: 0 },
      { x: 323.5, y: 148 },
      { x: 0, y: 148 },
    ]);
    expect(outerWrap.backBoardRect).toEqual({ x: 50, y: 0, width: 106, height: 148 });
    expect(outerWrap.leftHingeRect).toEqual({ x: 156, y: 0, width: 0, height: 148 });
    expect(outerWrap.spineRect).toEqual({ x: 156, y: 0, width: 11.5, height: 148 });
    expect(outerWrap.rightHingeRect).toEqual({ x: 167.5, y: 0, width: 0, height: 148 });
    expect(outerWrap.frontBoardRect).toEqual({ x: 167.5, y: 0, width: 106, height: 148 });
    expect(outerWrap.foldLines).toHaveLength(4);
    expect(outerWrap.foldLines.map((l) => l.x1)).toEqual([50, 156, 167.5, 273.5]);
    expect(geom.mediaFit.status).toBe('fits-1-sheet');

    // Default flap width (pbWidthMm * 0.5 clamped to [40..75]) & custom flap clamping to [20..100]
    const defaultA6 = calculateCaseGeometry({ ...a6DustJacket, jacketFlapWidthMm: undefined });
    expect(defaultA6.outerWrap.jacketFlapWidthMm).toBe(52.5);
    const wideFlap = calculateCaseGeometry({ ...a6DustJacket, jacketFlapWidthMm: 85 });
    expect(wideFlap.outerWrap.jacketFlapWidthMm).toBe(85);
    const clampedFlap = calculateCaseGeometry({ ...a6DustJacket, jacketFlapWidthMm: 140 });
    expect(clampedFlap.outerWrap.jacketFlapWidthMm).toBe(100);

    // computeMaxFlapWidthForSheet for dust-jacket (innerW = 223.5 mm)
    expect(computeMaxFlapWidthForSheet(a6DustJacket, 269.4)).toBeCloseTo(22.9, 1);
    expect(computeMaxFlapWidthForSheet(a6DustJacket, 345.6)).toBeCloseTo(61.0, 1);
  });

  it('computes 2-Sheet Separate Glue-In Pockets geometry for A6 softcover-jacket (223 × 170 mm 12-vertex outer shell + 6-vertex 150 mm detached pockets)', () => {
    const a6Separate = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      softcoverPocketMode: 'separate' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      pocketDepthPct: 72,
      pocketFlapMm: 12,
      printMedia: 'letter' as const,
    };

    const geom = calculateCaseGeometry(a6Separate);
    expect(geom.bindingStyle).toBe('softcover-jacket');
    expect(geom.softcoverPocketMode).toBe('separate');

    // Panel sizes match slip cover ease (+1 W, +2 H, +1 spine)
    expect(geom.cutList.coverBoards.quantity).toBe(0);
    expect(geom.cutList.coverBoards.widthMm).toBe(106);
    expect(geom.cutList.coverBoards.heightMm).toBe(150);
    expect(geom.cutList.spineStrip.widthMm).toBe(11);

    // Outer shell: 106 + 11 + 106 = 223 mm wide, 150 + 20 = 170 mm tall, 12-vertex polygon, fits 1x US Letter Landscape
    const { outerWrap } = geom;
    expect(outerWrap.softcoverPocketMode).toBe('separate');
    expect(outerWrap.widthMm).toBe(223);
    expect(outerWrap.heightMm).toBe(170);
    expect(outerWrap.jacketFlapWidthMm).toBe(0);
    expect(outerWrap.jacketGlueTabHeightMm).toBe(10);
    expect(outerWrap.outerCutPolygon).toHaveLength(12);
    expect(outerWrap.jacketGlueTabPolygons).toHaveLength(4);
    expect(outerWrap.foldLines).toHaveLength(6);
    expect(outerWrap.backBoardRect).toEqual({ x: 0, y: 10, width: 106, height: 150 });
    expect(outerWrap.spineRect).toEqual({ x: 106, y: 10, width: 11, height: 150 });
    expect(outerWrap.frontBoardRect).toEqual({ x: 117, y: 10, width: 106, height: 150 });

    expect(geom.mediaFit.status).toBe('fits-1-sheet');
    expect(geom.mediaFit.sheetPageWidthMm).toBeCloseTo(279.4, 2);
    expect(geom.mediaFit.sheetPageHeightMm).toBeCloseTo(215.9, 2);

    // Detached 1-flap fore-edge pockets: full 150 mm height (PB_H + 2 mm), 6 vertices, 1 score line, 1 glue flap
    const { backPocket, frontPocket } = geom;
    expect(backPocket.pocketHeightMm).toBe(150);
    expect(backPocket.totalHeightMm).toBe(150);
    expect(backPocket.pocketWidthMm).toBeCloseTo(76.32, 2);
    expect(backPocket.totalWidthMm).toBeCloseTo(88.32, 2);
    expect(backPocket.openEdge).toBe('right');
    expect(backPocket.outerCutPolygon).toHaveLength(6);
    expect(backPocket.faceRect).toEqual({ x: 12, y: 0, width: 76.32, height: 150 });
    expect(backPocket.scoreLines).toHaveLength(1);
    expect(backPocket.scoreLines[0]?.x1).toBe(12);
    expect(backPocket.glueFlapPolygons).toHaveLength(1);

    expect(frontPocket.pocketHeightMm).toBe(150);
    expect(frontPocket.totalHeightMm).toBe(150);
    expect(frontPocket.pocketWidthMm).toBeCloseTo(76.32, 2);
    expect(frontPocket.totalWidthMm).toBeCloseTo(88.32, 2);
    expect(frontPocket.openEdge).toBe('left');
    expect(frontPocket.outerCutPolygon).toHaveLength(6);
    expect(frontPocket.faceRect).toEqual({ x: 0, y: 0, width: 76.32, height: 150 });
    expect(frontPocket.scoreLines).toHaveLength(1);
    expect(frontPocket.scoreLines[0]?.x1).toBeCloseTo(76.32, 2);
    expect(frontPocket.glueFlapPolygons).toHaveLength(1);
  });

  it('computes Folded Glue-In Endpapers (2 × PB_W × PB_H, 0 glue flaps, 1 center fold) for chipboard hardcovers', () => {
    // Default slip-pockets mode
    const defaultGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    expect(defaultGeom.interiorStyle).toBe('slip-pockets');
    expect(defaultGeom.frontPocket.kind).toBe('slip-pocket');
    expect(defaultGeom.backPocket.kind).toBe('slip-pocket');

    // Rigid 3-board hardcover with folded-endpapers
    const foldedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'rigid-case',
      interiorStyle: 'folded-endpapers',
    });
    expect(foldedGeom.interiorStyle).toBe('folded-endpapers');

    for (const [side, piece] of [
      ['back', foldedGeom.backPocket],
      ['front', foldedGeom.frontPocket],
    ] as const) {
      expect(piece.kind).toBe('folded-endpaper');
      expect(piece.side).toBe(side);
      expect(piece.label).toBe(side === 'front' ? 'Front Folded Endpaper' : 'Back Folded Endpaper');
      expect(piece.pocketWidthMm).toBe(140);
      expect(piece.pocketHeightMm).toBe(216);
      expect(piece.flapWidthMm).toBe(0);
      expect(piece.totalWidthMm).toBe(280);
      expect(piece.totalHeightMm).toBe(216);
      expect(piece.outerCutPolygon).toEqual([
        { x: 0, y: 0 },
        { x: 280, y: 0 },
        { x: 280, y: 216 },
        { x: 0, y: 216 },
      ]);
      expect(piece.faceRect).toEqual({ x: 0, y: 0, width: 280, height: 216 });
      expect(piece.glueFlapPolygons).toHaveLength(0);
      expect(piece.scoreLines).toEqual([
        { x1: 140, y1: 0, x2: 140, y2: 216, label: 'Center Fold (Pastedown / Flyleaf)' },
      ]);
    }

    // Flexible-spine (2-board chipboard) also supports folded-endpapers
    const flexFolded = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'flexible-spine',
      pbWidthMm: 105,
      pbHeightMm: 148,
      interiorStyle: 'folded-endpapers',
    });
    expect(flexFolded.frontPocket.kind).toBe('folded-endpaper');
    expect(flexFolded.frontPocket.totalWidthMm).toBe(210);
    expect(flexFolded.frontPocket.totalHeightMm).toBe(148);
    expect(flexFolded.frontPocket.glueFlapPolygons).toHaveLength(0);
    expect(flexFolded.frontPocket.scoreLines).toHaveLength(1);

    // Boardless softcover-jacket (separate pockets) stays untouched even if interiorStyle is set
    const separateSoft = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      softcoverPocketMode: 'separate',
      interiorStyle: 'folded-endpapers',
    });
    expect(separateSoft.frontPocket.kind).toBe('slip-pocket');
    expect(separateSoft.frontPocket.outerCutPolygon).toHaveLength(6);
    expect(separateSoft.frontPocket.glueFlapPolygons).toHaveLength(1);
  });

  it('exports valid SVG and PDF templates for Folded Glue-In Endpapers with zero glue flaps and center fold score lines', async () => {
    const foldedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'rigid-case',
      interiorStyle: 'folded-endpapers',
    });

    // SVG export compatibility
    const svg = generateInnerTemplatesSvg(foldedGeom);
    expect(svg).toContain('FOLDED ENDPAPERS (PASTEDOWN + FLYLEAF) &amp; SPINE LINER');
    expect(svg).toContain('data-label="Back Folded Endpaper"');
    expect(svg).toContain('data-label="Front Folded Endpaper"');
    expect(svg).toContain('data-label="Center Fold (Pastedown / Flyleaf)"');
    expect(svg).toContain('PASTEDOWN');
    expect(svg).toContain('FLYLEAF');
    expect(svg).not.toContain('OPEN EDGE:');
    expect(svg).not.toContain('Shaded = Apply Glue Here');
    // Glue-flaps layer contains zero paths
    const glueGroupMatch = svg.match(/<g id="glue-flaps"[^>]*>([\s\S]*?)<\/g>/);
    expect(glueGroupMatch?.[1].trim()).toBe('');

    // PDF export compatibility (Tabloid packs 280x216 sheets cleanly rotated 90° without clipping)
    const tabloidPlan = planInnerTemplateLayout(foldedGeom, 'tabloid', { includeLegend: true });
    expect(tabloidPlan.placements.every((p) => !p.clipped)).toBe(true);

    const { bytes, plan } = await generateInnerTemplatesPdf(foldedGeom, 'tabloid', {
      includeLegend: true,
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const pdfDoc = await PDFDocument.load(bytes);
    expect(pdfDoc.getPageCount()).toBe(plan.pageCount);
    expect(pdfDoc.getTitle()).toBe(
      'Bookbinder — Folded Endpapers (Pastedown + Flyleaf) & Spine Liner',
    );
    const firstSize = pdfDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(firstSize.width)).toBeCloseTo(PAGE_SIZES.tabloid.widthMm, 2);
    expect(UnitConverter.pointsToMm(firstSize.height)).toBeCloseTo(PAGE_SIZES.tabloid.heightMm, 2);
  });
});
