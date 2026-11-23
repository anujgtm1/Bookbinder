import {
  A4_SHEET,
  PRINT_MEDIA_OPTIONS,
  ROLL_TOTAL_MARGIN_MM,
  STANDARD_ROLL_WIDTHS,
  US_LEGAL_SHEET,
  US_LETTER_SHEET,
  getPrintMediaSpec,
} from '@/resources/paperSpecs';
import type { BookParameters, PrintMediaId } from '@/types/bookParams';
import type {
  CaseGeometry,
  ChipboardCutList,
  OuterWrapGeometry,
  PocketEnvelopeGeometry,
  Polygon2D,
  PrintMediaFitEvaluation,
  PrintMediaFitStatus,
  RollFeedOrientation,
  RollRecommendation,
  SpineLinerGeometry,
  SplitWrapPanel,
} from '@/types/geometry';
import { roundTo } from '@/types/units';

export type { PrintMediaFitEvaluation, PrintMediaFitStatus };

const LINER_OVERLAP_PER_SIDE_MM = 15.0;
const INNER_VERTICAL_INSET_MM = 1.0; // 1.0 mm inset top & bottom => -2.0 mm height
const QUARTER_BOUND_LAP_MM = 3.0;
const SOFTCOVER_GLUE_TAB_H_MM = 10.0;

export function resolveSlipFlapWidthMm(params: BookParameters): number {
  const defaultFlap = roundTo(Math.min(48, Math.max(24, params.pbWidthMm * 0.23)), 1);
  return typeof params.jacketFlapWidthMm === 'number' && Number.isFinite(params.jacketFlapWidthMm)
    ? roundTo(Math.min(65, Math.max(20, params.jacketFlapWidthMm)), 1)
    : defaultFlap;
}

export function calculateMaxSlipFlapForSheetMm(
  params: BookParameters,
  sheetLongMm: number,
): number {
  const innerW = (params.pbWidthMm + 1.0) * 2 + (params.pbThicknessMm + 1.0);
  const maxFlap =
    Math.floor(((sheetLongMm - ROLL_TOTAL_MARGIN_MM - innerW) / 2) * 10 + 1e-9) / 10;
  return roundTo(Math.min(65, Math.max(20, maxFlap)), 1);
}

export function calculateChipboardCutList(params: BookParameters): ChipboardCutList {
  const style = params.bindingStyle ?? 'rigid-case';
  const boardWidthMm = params.pbWidthMm + params.overhangForeEdgeMm;
  const boardHeightMm = params.pbHeightMm + params.overhangTopBottomMm;

  if (style === 'softcover-jacket') {
    // 0-board 1-piece fold-and-glue slip cover wraps directly around the notebook with snug slip ease (no rigid board overhang)
    const coverPanelWidthMm = roundTo(params.pbWidthMm + 1.0, 2);
    const coverPanelHeightMm = roundTo(params.pbHeightMm + 2.0, 2);
    const softSpineWidthMm = roundTo(params.pbThicknessMm + 1.0, 2);
    return {
      coverBoards: {
        label: 'Cover Panels (No Chipboard)',
        quantity: 0,
        widthMm: coverPanelWidthMm,
        heightMm: coverPanelHeightMm,
      },
      spineStrip: {
        label: 'Softcover Spine (No Chipboard)',
        quantity: 0,
        widthMm: softSpineWidthMm,
        heightMm: coverPanelHeightMm,
      },
      boardThicknessMm: 0,
      hingeSpacerMm: 0,
    };
  }

  if (style === 'flexible-spine') {
    // Unified flexible cloth spine channel: text block thickness + 2x board wrap thickness + 2 mm opening ease
    const flexSpineWidthMm = roundTo(params.pbThicknessMm + params.boardThicknessMm * 2 + 2.0, 2);
    return {
      coverBoards: {
        label: 'Cover Boards (Front & Back)',
        quantity: 2,
        widthMm: boardWidthMm,
        heightMm: boardHeightMm,
      },
      spineStrip: {
        label: 'Flexible Cloth Spine (No Rigid Strip)',
        quantity: 0,
        widthMm: flexSpineWidthMm,
        heightMm: boardHeightMm,
      },
      boardThicknessMm: params.boardThicknessMm,
      hingeSpacerMm: 0,
    };
  }

  const spineWidthMm = params.pbThicknessMm + params.spineAllowanceMm;
  return {
    coverBoards: {
      label: 'Cover Boards (Front & Back)',
      quantity: 2,
      widthMm: boardWidthMm,
      heightMm: boardHeightMm,
    },
    spineStrip: {
      label: 'Spine Strip',
      quantity: 1,
      widthMm: spineWidthMm,
      heightMm: boardHeightMm,
    },
    boardThicknessMm: params.boardThicknessMm,
    hingeSpacerMm: params.hingeWidthMm,
  };
}

export function buildMiteredRectPolygon(
  widthMm: number,
  heightMm: number,
  miterCutLegMm: number,
  corners: { topLeft: boolean; topRight: boolean; bottomRight: boolean; bottomLeft: boolean },
): Polygon2D {
  const leg = Math.max(0, Math.min(miterCutLegMm, widthMm / 2, heightMm / 2));
  const points: { x: number; y: number }[] = [];

  if (corners.topLeft && leg > 0) {
    points.push({ x: leg, y: 0 });
  } else {
    points.push({ x: 0, y: 0 });
  }

  if (corners.topRight && leg > 0) {
    points.push({ x: widthMm - leg, y: 0 }, { x: widthMm, y: leg });
  } else {
    points.push({ x: widthMm, y: 0 });
  }

  if (corners.bottomRight && leg > 0) {
    points.push({ x: widthMm, y: heightMm - leg }, { x: widthMm - leg, y: heightMm });
  } else {
    points.push({ x: widthMm, y: heightMm });
  }

  if (corners.bottomLeft && leg > 0) {
    points.push({ x: leg, y: heightMm }, { x: 0, y: heightMm - leg });
  } else {
    points.push({ x: 0, y: heightMm });
  }

  if (corners.topLeft && leg > 0) {
    points.push({ x: 0, y: leg });
  }

  return points;
}

export function calculateOuterWrap(
  params: BookParameters,
  cutList: ChipboardCutList,
): OuterWrapGeometry {
  const style = params.bindingStyle ?? 'rigid-case';
  const boardW = cutList.coverBoards.widthMm;
  const boardH = cutList.coverBoards.heightMm;
  const spineW = cutList.spineStrip.widthMm;
  const hingeW = cutList.hingeSpacerMm;
  const isSoftcover = style === 'softcover-jacket';
  const jacketFlapWidthMm = isSoftcover ? resolveSlipFlapWidthMm(params) : 0;
  const jacketGlueTabHeightMm = isSoftcover ? SOFTCOVER_GLUE_TAB_H_MM : 0;
  const turnIn = isSoftcover ? 0 : params.turnInMm;
  const sideMargin = isSoftcover ? jacketFlapWidthMm : turnIn;
  const verticalMargin = isSoftcover ? jacketGlueTabHeightMm : turnIn;

  const innerWidthMm = boardW * 2 + hingeW * 2 + spineW;
  const widthMm = roundTo(innerWidthMm + sideMargin * 2, 3);
  const heightMm = roundTo(boardH + verticalMargin * 2, 3);

  const miterGapMm = isSoftcover ? 0 : params.boardThicknessMm * params.miterFactor;
  const miterCutLegMm = isSoftcover
    ? 0
    : Math.max(0, Math.min(widthMm / 2, heightMm / 2, 2 * turnIn - miterGapMm * Math.SQRT2));

  let outerCutPolygon: Polygon2D;
  let jacketGlueTabPolygons: readonly Polygon2D[] = [];

  if (isSoftcover) {
    const x0 = 0;
    const x1 = jacketFlapWidthMm;
    const x1TabEnd = roundTo(Math.min(x1 + jacketFlapWidthMm, x1 + boardW), 3);
    const x2 = roundTo(jacketFlapWidthMm + innerWidthMm, 3);
    const x2TabStart = roundTo(Math.max(x2 - jacketFlapWidthMm, x2 - boardW), 3);
    const x3 = widthMm;
    const y0 = 0;
    const y1 = jacketGlueTabHeightMm;
    const y2 = roundTo(jacketGlueTabHeightMm + boardH, 3);
    const y3 = heightMm;
    const tabSpan = Math.min(x1TabEnd - x1, x2 - x2TabStart);
    const m = roundTo(Math.min(jacketGlueTabHeightMm, tabSpan * 0.35), 2);

    // 20-vertex clockwise 1-piece fold-and-glue slip cover outline:
    // 4 mitered wrap-over glue tabs sit on the outer top & bottom edges of the Back & Front covers
    // so flaps fold inward first and tabs glue over the outside of the flaps (preserving full PB_H + 2 mm pocket clearance).
    outerCutPolygon = [
      { x: x0, y: y1 },
      { x: x1, y: y1 },
      { x: x1 + m, y: y0 },
      { x: x1TabEnd - m, y: y0 },
      { x: x1TabEnd, y: y1 },
      { x: x2TabStart, y: y1 },
      { x: x2TabStart + m, y: y0 },
      { x: x2 - m, y: y0 },
      { x: x2, y: y1 },
      { x: x3, y: y1 },
      { x: x3, y: y2 },
      { x: x2, y: y2 },
      { x: x2 - m, y: y3 },
      { x: x2TabStart + m, y: y3 },
      { x: x2TabStart, y: y2 },
      { x: x1TabEnd, y: y2 },
      { x: x1TabEnd - m, y: y3 },
      { x: x1 + m, y: y3 },
      { x: x1, y: y2 },
      { x: x0, y: y2 },
    ];

    jacketGlueTabPolygons = [
      // Back Cover Top Wrap-Over Glue Tab
      [
        { x: x1, y: y1 },
        { x: x1 + m, y: y0 },
        { x: x1TabEnd - m, y: y0 },
        { x: x1TabEnd, y: y1 },
      ],
      // Front Cover Top Wrap-Over Glue Tab
      [
        { x: x2TabStart, y: y1 },
        { x: x2TabStart + m, y: y0 },
        { x: x2 - m, y: y0 },
        { x: x2, y: y1 },
      ],
      // Front Cover Bottom Wrap-Over Glue Tab
      [
        { x: x2TabStart, y: y2 },
        { x: x2, y: y2 },
        { x: x2 - m, y: y3 },
        { x: x2TabStart + m, y: y3 },
      ],
      // Back Cover Bottom Wrap-Over Glue Tab
      [
        { x: x1, y: y2 },
        { x: x1TabEnd, y: y2 },
        { x: x1TabEnd - m, y: y3 },
        { x: x1 + m, y: y3 },
      ],
    ];
  } else {
    outerCutPolygon = buildMiteredRectPolygon(widthMm, heightMm, miterCutLegMm, {
      topLeft: true,
      topRight: true,
      bottomRight: true,
      bottomLeft: true,
    });
  }

  const activeBleed = params.includeBleed ? params.bleedMm : 0;
  const bleedRect = {
    x: -activeBleed,
    y: -activeBleed,
    width: widthMm + activeBleed * 2,
    height: heightMm + activeBleed * 2,
  };

  const backBoardX = sideMargin;
  const leftHingeX = backBoardX + boardW;
  const spineX = leftHingeX + hingeW;
  const rightHingeX = spineX + spineW;
  const frontBoardX = rightHingeX + hingeW;

  return {
    bindingStyle: style,
    widthMm,
    heightMm,
    innerWidthMm,
    turnInMm: turnIn,
    jacketFlapWidthMm,
    jacketGlueTabHeightMm,
    jacketGlueTabPolygons,
    bleedMm: params.bleedMm,
    includeBleed: params.includeBleed,
    miterGapMm,
    miterCutLegMm,
    outerCutPolygon,
    bleedRect,
    backBoardRect: { x: backBoardX, y: verticalMargin, width: boardW, height: boardH },
    leftHingeRect: { x: leftHingeX, y: verticalMargin, width: hingeW, height: boardH },
    spineRect: { x: spineX, y: verticalMargin, width: spineW, height: boardH },
    rightHingeRect: { x: rightHingeX, y: verticalMargin, width: hingeW, height: boardH },
    frontBoardRect: { x: frontBoardX, y: verticalMargin, width: boardW, height: boardH },
  };
}

export function calculateSplitWrapPanels(
  params: BookParameters,
  cutList: ChipboardCutList,
  outerWrap: OuterWrapGeometry,
): readonly SplitWrapPanel[] {
  const boardW = cutList.coverBoards.widthMm;
  const boardH = cutList.coverBoards.heightMm;
  const spineW = cutList.spineStrip.widthMm;
  const hingeW = cutList.hingeSpacerMm;
  const turnIn = outerWrap.turnInMm;
  const overlap = Math.min(params.quarterBoundOverlapMm, boardW * 0.4);
  const heightMm = outerWrap.heightMm;

  const spinePanelWidth = spineW + hingeW * 2 + overlap * 2;
  const spinePanel: SplitWrapPanel = {
    id: 'spine',
    label: 'Spine Wrap (Quarter-Bound)',
    widthMm: spinePanelWidth,
    heightMm,
    cutPolygon: buildMiteredRectPolygon(spinePanelWidth, heightMm, 0, {
      topLeft: false,
      topRight: false,
      bottomRight: false,
      bottomLeft: false,
    }),
    guideRects: [
      { label: 'Back Overlap', rect: { x: 0, y: turnIn, width: overlap, height: boardH } },
      { label: 'Left Hinge', rect: { x: overlap, y: turnIn, width: hingeW, height: boardH } },
      {
        label: 'Spine Strip',
        rect: { x: overlap + hingeW, y: turnIn, width: spineW, height: boardH },
      },
      {
        label: 'Right Hinge',
        rect: { x: overlap + hingeW + spineW, y: turnIn, width: hingeW, height: boardH },
      },
      {
        label: 'Front Overlap',
        rect: { x: overlap + hingeW * 2 + spineW, y: turnIn, width: overlap, height: boardH },
      },
    ],
  };

  const coverFaceWidth = Math.max(10, boardW - overlap + QUARTER_BOUND_LAP_MM);
  const coverPanelWidth = coverFaceWidth + turnIn;

  const backPanel: SplitWrapPanel = {
    id: 'back',
    label: 'Back Cover Panel',
    widthMm: coverPanelWidth,
    heightMm,
    cutPolygon: buildMiteredRectPolygon(coverPanelWidth, heightMm, outerWrap.miterCutLegMm, {
      topLeft: true,
      topRight: false,
      bottomRight: false,
      bottomLeft: true,
    }),
    guideRects: [
      {
        label: 'Back Board Area',
        rect: { x: turnIn, y: turnIn, width: coverFaceWidth, height: boardH },
      },
    ],
  };

  const frontPanel: SplitWrapPanel = {
    id: 'front',
    label: 'Front Cover Panel',
    widthMm: coverPanelWidth,
    heightMm,
    cutPolygon: buildMiteredRectPolygon(coverPanelWidth, heightMm, outerWrap.miterCutLegMm, {
      topLeft: false,
      topRight: true,
      bottomRight: true,
      bottomLeft: false,
    }),
    guideRects: [
      {
        label: 'Front Board Area',
        rect: { x: 0, y: turnIn, width: coverFaceWidth, height: boardH },
      },
    ],
  };

  return [backPanel, spinePanel, frontPanel];
}

function fitsDesktopSheet(
  wrapWidthMm: number,
  wrapHeightMm: number,
  sheetShortMm: number,
  sheetLongMm: number,
): boolean {
  const short = Math.min(wrapWidthMm, wrapHeightMm);
  const long = Math.max(wrapWidthMm, wrapHeightMm);
  return (
    short <= sheetShortMm - ROLL_TOTAL_MARGIN_MM &&
    long <= sheetLongMm - ROLL_TOTAL_MARGIN_MM
  );
}

export function evaluateRollWidth(
  wrapWidthMm: number,
  wrapHeightMm: number,
): RollRecommendation {
  // Check standard desktop home-printer sheets first (US Letter 8.5×11" and A4)
  const fitsLetter = fitsDesktopSheet(
    wrapWidthMm,
    wrapHeightMm,
    US_LETTER_SHEET.shortMm,
    US_LETTER_SHEET.longMm,
  );
  const fitsA4 = fitsDesktopSheet(wrapWidthMm, wrapHeightMm, A4_SHEET.shortMm, A4_SHEET.longMm);

  if (fitsLetter || fitsA4) {
    const orientation: RollFeedOrientation =
      wrapHeightMm <= wrapWidthMm ? 'rotated-90' : 'unrotated';
    const usedWidthMm = Math.min(wrapWidthMm, wrapHeightMm);
    const printableWidthMm =
      (fitsLetter ? US_LETTER_SHEET.shortMm : A4_SHEET.shortMm) - ROLL_TOTAL_MARGIN_MM;
    const spareWidthMm = roundTo(printableWidthMm - usedWidthMm, 1);
    const sheetLabel =
      fitsLetter && fitsA4
        ? '1× US Letter / A4 (8.5×11") home sheet'
        : fitsLetter
          ? '1× US Letter (8.5×11") home sheet'
          : '1× A4 (210×297 mm) home sheet';

    return {
      fits: true,
      roll: STANDARD_ROLL_WIDTHS[0],
      printableWidthMm,
      orientation,
      usedWidthMm,
      spareWidthMm,
      summary: `Fits on ${sheetLabel} (100% actual size)`,
    };
  }

  // Check US Legal (8.5×14") home sheet before falling through to wide-format rolls
  const fitsLegal = fitsDesktopSheet(
    wrapWidthMm,
    wrapHeightMm,
    US_LEGAL_SHEET.shortMm,
    US_LEGAL_SHEET.longMm,
  );

  if (fitsLegal) {
    const orientation: RollFeedOrientation =
      wrapHeightMm <= wrapWidthMm ? 'rotated-90' : 'unrotated';
    const usedWidthMm = Math.min(wrapWidthMm, wrapHeightMm);
    const printableWidthMm = US_LEGAL_SHEET.shortMm - ROLL_TOTAL_MARGIN_MM;
    const spareWidthMm = roundTo(printableWidthMm - usedWidthMm, 1);

    return {
      fits: true,
      roll: STANDARD_ROLL_WIDTHS[0],
      printableWidthMm,
      orientation,
      usedWidthMm,
      spareWidthMm,
      summary: 'Fits on 1× US Legal (8.5×14") home sheet (100% actual size)',
    };
  }

  for (const roll of STANDARD_ROLL_WIDTHS) {
    const printableWidthMm = roll.widthMm - ROLL_TOTAL_MARGIN_MM;
    const fitsUnrotated = wrapWidthMm <= printableWidthMm;
    const fitsRotated = wrapHeightMm <= printableWidthMm;

    if (!fitsUnrotated && !fitsRotated) {
      continue;
    }

    let orientation: RollFeedOrientation;
    let usedWidthMm: number;

    if (fitsUnrotated && fitsRotated) {
      // Both fit on this narrowest roll; choose orientation with larger spare margin
      if (wrapHeightMm <= wrapWidthMm) {
        orientation = 'rotated-90';
        usedWidthMm = wrapHeightMm;
      } else {
        orientation = 'unrotated';
        usedWidthMm = wrapWidthMm;
      }
    } else if (fitsRotated) {
      orientation = 'rotated-90';
      usedWidthMm = wrapHeightMm;
    } else {
      orientation = 'unrotated';
      usedWidthMm = wrapWidthMm;
    }

    const spareWidthMm = roundTo(printableWidthMm - usedWidthMm, 1);
    const orientationLabel = orientation === 'rotated-90' ? 'rotated 90°' : 'unrotated';

    return {
      fits: true,
      roll,
      printableWidthMm,
      orientation,
      usedWidthMm,
      spareWidthMm,
      summary: `Fits on a ${roll.label} roll (${orientationLabel}) with ${Math.round(spareWidthMm)} mm spare width`,
    };
  }

  const maxRoll = STANDARD_ROLL_WIDTHS[STANDARD_ROLL_WIDTHS.length - 1];
  const maxPrintable = maxRoll.widthMm - ROLL_TOTAL_MARGIN_MM;
  const minDimension = Math.min(wrapWidthMm, wrapHeightMm);

  return {
    fits: false,
    roll: null,
    printableWidthMm: maxPrintable,
    orientation: wrapHeightMm <= wrapWidthMm ? 'rotated-90' : 'unrotated',
    usedWidthMm: minDimension,
    spareWidthMm: roundTo(maxPrintable - minDimension, 1),
    summary: `Exceeds 44" roll printable width (${maxPrintable} mm); use 3-Piece Split mode`,
  };
}

const FIT_EPS_MM = 1e-6;
export const TILE_OVERLAP_MM = 10;
export const MIN_TILE_OVERLAP_MM = 5;
export const MAX_TILE_OVERLAP_MM = 30;

export function clampTileOverlapMm(overlapMm?: number): number {
  if (typeof overlapMm !== 'number' || !Number.isFinite(overlapMm)) {
    return TILE_OVERLAP_MM;
  }
  return roundTo(Math.min(MAX_TILE_OVERLAP_MM, Math.max(MIN_TILE_OVERLAP_MM, overlapMm)), 1);
}

function findSuggestedMediaId(
  wrapWidthMm: number,
  wrapHeightMm: number,
  excludeId?: PrintMediaId,
): PrintMediaId | null {
  // 1. Narrowest desktop sheet that fits cleanly on 1 sheet
  for (const opt of PRINT_MEDIA_OPTIONS) {
    if (opt.kind !== 'sheet' || opt.id === excludeId || opt.shortMm === null || opt.longMm === null) {
      continue;
    }
    const shortPrintable = opt.shortMm - ROLL_TOTAL_MARGIN_MM + FIT_EPS_MM;
    const longPrintable = opt.longMm - ROLL_TOTAL_MARGIN_MM + FIT_EPS_MM;
    const fitsLandscape = wrapWidthMm <= longPrintable && wrapHeightMm <= shortPrintable;
    const fitsPortrait = wrapWidthMm <= shortPrintable && wrapHeightMm <= longPrintable;
    if (fitsLandscape || fitsPortrait) {
      return opt.id;
    }
  }

  // 2. Narrowest wide-format roll that fits cleanly
  const minDim = Math.min(wrapWidthMm, wrapHeightMm);
  for (const opt of PRINT_MEDIA_OPTIONS) {
    if (opt.kind !== 'roll' || opt.id === excludeId || opt.rollWidthMm === null) {
      continue;
    }
    const printableWidth = opt.rollWidthMm - ROLL_TOTAL_MARGIN_MM + FIT_EPS_MM;
    if (minDim <= printableWidth) {
      return opt.id;
    }
  }

  return null;
}

export function evaluatePrintMediaFit(
  mediaId: PrintMediaId,
  wrapWidthMm: number,
  wrapHeightMm: number,
  tileOverlapMm: number = TILE_OVERLAP_MM,
): PrintMediaFitEvaluation {
  const spec = getPrintMediaSpec(mediaId);

  if (spec.kind === 'auto') {
    const rollRec = evaluateRollWidth(wrapWidthMm, wrapHeightMm);
    return {
      mediaId: 'exact-auto',
      mediaLabel: spec.shortLabel,
      status: rollRec.fits ? 'fits-roll' : 'does-not-fit',
      sheetPageWidthMm: null,
      sheetPageHeightMm: null,
      tilePages: 1,
      tileOverlapMm: 0,
      suggestedMediaId: null,
      summary: rollRec.summary,
    };
  }

  if (spec.kind === 'roll' && spec.rollWidthMm !== null) {
    const printableWidthMm = spec.rollWidthMm - ROLL_TOTAL_MARGIN_MM;
    const minDim = Math.min(wrapWidthMm, wrapHeightMm);
    if (minDim <= printableWidthMm + FIT_EPS_MM) {
      const orientationLabel = wrapHeightMm <= wrapWidthMm ? 'rotated 90°' : 'unrotated';
      const spare = Math.max(0, roundTo(printableWidthMm - minDim, 1));
      return {
        mediaId: spec.id,
        mediaLabel: spec.shortLabel,
        status: 'fits-roll',
        sheetPageWidthMm: null,
        sheetPageHeightMm: null,
        tilePages: 1,
        tileOverlapMm: 0,
        suggestedMediaId: null,
        summary: `Fits on ${spec.shortLabel} (${orientationLabel}) with ${Math.round(spare)} mm spare width`,
      };
    }

    return {
      mediaId: spec.id,
      mediaLabel: spec.shortLabel,
      status: 'does-not-fit',
      sheetPageWidthMm: null,
      sheetPageHeightMm: null,
      tilePages: 1,
      tileOverlapMm: 0,
      suggestedMediaId: findSuggestedMediaId(wrapWidthMm, wrapHeightMm, spec.id),
      summary: `Does not fit on ${spec.shortLabel} (${roundTo(minDim, 1)} mm > ${printableWidthMm} mm printable)`,
    };
  }

  // Desktop sheet evaluation: 3-state ('fits-1-sheet' | 'fits-2-sheet-tile' | 'does-not-fit')
  const shortMm = spec.shortMm ?? US_LETTER_SHEET.shortMm;
  const longMm = spec.longMm ?? US_LETTER_SHEET.longMm;
  const shortPrintable = shortMm - ROLL_TOTAL_MARGIN_MM;
  const longPrintable = longMm - ROLL_TOTAL_MARGIN_MM;

  // State 1: Fits on 1 sheet (check Landscape first, then Portrait)
  if (
    wrapWidthMm <= longPrintable + FIT_EPS_MM &&
    wrapHeightMm <= shortPrintable + FIT_EPS_MM
  ) {
    return {
      mediaId: spec.id,
      mediaLabel: spec.shortLabel,
      status: 'fits-1-sheet',
      sheetPageWidthMm: longMm,
      sheetPageHeightMm: shortMm,
      tilePages: 1,
      tileOverlapMm: 0,
      suggestedMediaId: null,
      summary: `Fits on 1× ${spec.shortLabel} (Landscape)`,
    };
  }

  if (
    wrapWidthMm <= shortPrintable + FIT_EPS_MM &&
    wrapHeightMm <= longPrintable + FIT_EPS_MM
  ) {
    return {
      mediaId: spec.id,
      mediaLabel: spec.shortLabel,
      status: 'fits-1-sheet',
      sheetPageWidthMm: shortMm,
      sheetPageHeightMm: longMm,
      tilePages: 1,
      tileOverlapMm: 0,
      suggestedMediaId: null,
      summary: `Fits on 1× ${spec.shortLabel} (Portrait)`,
    };
  }

  // State 2: Horizontal 2-sheet tile with configurable overlap (check Portrait first, then Landscape)
  const overlapMm = clampTileOverlapMm(tileOverlapMm);
  const maxTiledPortraitW = shortPrintable * 2 - overlapMm;
  const maxTiledLandscapeW = longPrintable * 2 - overlapMm;
  const suggestedMediaId = findSuggestedMediaId(wrapWidthMm, wrapHeightMm, spec.id);

  if (wrapWidthMm <= maxTiledPortraitW + FIT_EPS_MM && wrapHeightMm <= longPrintable + FIT_EPS_MM) {
    return {
      mediaId: spec.id,
      mediaLabel: spec.shortLabel,
      status: 'fits-2-sheet-tile',
      sheetPageWidthMm: shortMm,
      sheetPageHeightMm: longMm,
      tilePages: 2,
      tileOverlapMm: overlapMm,
      suggestedMediaId,
      summary: `2× ${spec.shortLabel} tiled (Portrait, ${overlapMm} mm overlap)`,
    };
  }

  if (wrapWidthMm <= maxTiledLandscapeW + FIT_EPS_MM && wrapHeightMm <= shortPrintable + FIT_EPS_MM) {
    return {
      mediaId: spec.id,
      mediaLabel: spec.shortLabel,
      status: 'fits-2-sheet-tile',
      sheetPageWidthMm: longMm,
      sheetPageHeightMm: shortMm,
      tilePages: 2,
      tileOverlapMm: overlapMm,
      suggestedMediaId,
      summary: `2× ${spec.shortLabel} tiled (Landscape, ${overlapMm} mm overlap)`,
    };
  }

  // State 3: Does not fit even as 2 tiled sheets
  return {
    mediaId: spec.id,
    mediaLabel: spec.shortLabel,
    status: 'does-not-fit',
    sheetPageWidthMm: null,
    sheetPageHeightMm: null,
    tilePages: 1,
    tileOverlapMm: 0,
    suggestedMediaId,
    summary: `Does not fit on ${spec.shortLabel} (even as 2 tiled sheets)`,
  };
}

export function calculateSpineLiner(cutList: ChipboardCutList): SpineLinerGeometry {
  const spineW = cutList.spineStrip.widthMm;
  const hingeW = cutList.hingeSpacerMm;
  const widthMm = spineW + hingeW * 2 + LINER_OVERLAP_PER_SIDE_MM * 2;
  const heightMm = Math.max(10, cutList.coverBoards.heightMm - INNER_VERTICAL_INSET_MM * 2);

  const xLeftHingeStart = LINER_OVERLAP_PER_SIDE_MM;
  const xSpineStart = xLeftHingeStart + hingeW;
  const xSpineEnd = xSpineStart + spineW;
  const xRightHingeEnd = xSpineEnd + hingeW;

  const scoreLines =
    hingeW > 0
      ? [
          { x1: xLeftHingeStart, y1: 0, x2: xLeftHingeStart, y2: heightMm, label: 'Back Board / Hinge' },
          { x1: xSpineStart, y1: 0, x2: xSpineStart, y2: heightMm, label: 'Hinge / Spine' },
          { x1: xSpineEnd, y1: 0, x2: xSpineEnd, y2: heightMm, label: 'Spine / Hinge' },
          { x1: xRightHingeEnd, y1: 0, x2: xRightHingeEnd, y2: heightMm, label: 'Hinge / Front Board' },
        ]
      : [
          { x1: xSpineStart, y1: 0, x2: xSpineStart, y2: heightMm, label: 'Back Board / Spine' },
          { x1: xSpineEnd, y1: 0, x2: xSpineEnd, y2: heightMm, label: 'Spine / Front Board' },
        ];

  return {
    widthMm,
    heightMm,
    boardOverlapMm: LINER_OVERLAP_PER_SIDE_MM,
    scoreLines,
    leftHingeZoneRect: { x: xLeftHingeStart, y: 0, width: hingeW, height: heightMm },
    spineZoneRect: { x: xSpineStart, y: 0, width: spineW, height: heightMm },
    rightHingeZoneRect: { x: xSpineEnd, y: 0, width: hingeW, height: heightMm },
  };
}

export function calculatePocketEnvelope(
  side: 'front' | 'back',
  params: BookParameters,
  cutList: ChipboardCutList,
): PocketEnvelopeGeometry {
  const pocketWidthMm = cutList.coverBoards.widthMm * (params.pocketDepthPct / 100);
  const pocketHeightMm = Math.max(10, cutList.coverBoards.heightMm - INNER_VERTICAL_INSET_MM * 2);
  const flap = params.pocketFlapMm;
  const totalWidthMm = pocketWidthMm + flap;
  const totalHeightMm = pocketHeightMm + flap * 2;

  // Back pocket sits inside back cover -> open edge faces spine on the right.
  // Front pocket sits inside front cover -> open edge faces spine on the left.
  const openEdge: 'left' | 'right' = side === 'back' ? 'right' : 'left';
  const miterInset = Math.min(flap, pocketWidthMm / 2, pocketHeightMm / 2);

  if (openEdge === 'right') {
    const x0 = flap;
    const x1 = flap + pocketWidthMm;
    const y0 = flap;
    const y1 = flap + pocketHeightMm;

    const outerCutPolygon: Polygon2D = [
      { x: x0 + miterInset, y: 0 },
      { x: x1, y: 0 },
      { x: x1, y: totalHeightMm },
      { x: x0 + miterInset, y: totalHeightMm },
      { x: x0, y: y1 },
      { x: 0, y: y1 - miterInset },
      { x: 0, y: y0 + miterInset },
      { x: x0, y: y0 },
    ];

    const topFlap: Polygon2D = [
      { x: x0, y: y0 },
      { x: x0 + miterInset, y: 0 },
      { x: x1, y: 0 },
      { x: x1, y: y0 },
    ];
    const bottomFlap: Polygon2D = [
      { x: x0, y: y1 },
      { x: x1, y: y1 },
      { x: x1, y: totalHeightMm },
      { x: x0 + miterInset, y: totalHeightMm },
    ];
    const foreFlap: Polygon2D = [
      { x: x0, y: y0 },
      { x: 0, y: y0 + miterInset },
      { x: 0, y: y1 - miterInset },
      { x: x0, y: y1 },
    ];

    return {
      side,
      label: 'Back Pocket Envelope',
      pocketWidthMm,
      pocketHeightMm,
      flapWidthMm: flap,
      totalWidthMm,
      totalHeightMm,
      openEdge,
      outerCutPolygon,
      faceRect: { x: x0, y: y0, width: pocketWidthMm, height: pocketHeightMm },
      scoreLines: [
        { x1: x0, y1: y0, x2: x1, y2: y0, label: 'Top Flap Fold' },
        { x1: x0, y1: y1, x2: x1, y2: y1, label: 'Bottom Flap Fold' },
        { x1: x0, y1: y0, x2: x0, y2: y1, label: 'Fore-Edge Flap Fold' },
      ],
      glueFlapPolygons: [topFlap, bottomFlap, foreFlap],
    };
  }

  // Front pocket: open edge on left (x = 0), fore-edge flap on right (x = pocketWidthMm .. totalWidthMm)
  const x0 = 0;
  const x1 = pocketWidthMm;
  const y0 = flap;
  const y1 = flap + pocketHeightMm;

  const outerCutPolygon: Polygon2D = [
    { x: x0, y: 0 },
    { x: x1 - miterInset, y: 0 },
    { x: x1, y: y0 },
    { x: totalWidthMm, y: y0 + miterInset },
    { x: totalWidthMm, y: y1 - miterInset },
    { x: x1, y: y1 },
    { x: x1 - miterInset, y: totalHeightMm },
    { x: x0, y: totalHeightMm },
  ];

  const topFlap: Polygon2D = [
    { x: x0, y: 0 },
    { x: x1 - miterInset, y: 0 },
    { x: x1, y: y0 },
    { x: x0, y: y0 },
  ];
  const bottomFlap: Polygon2D = [
    { x: x0, y: y1 },
    { x: x1, y: y1 },
    { x: x1 - miterInset, y: totalHeightMm },
    { x: x0, y: totalHeightMm },
  ];
  const foreFlap: Polygon2D = [
    { x: x1, y: y0 },
    { x: totalWidthMm, y: y0 + miterInset },
    { x: totalWidthMm, y: y1 - miterInset },
    { x: x1, y: y1 },
  ];

  return {
    side,
    label: 'Front Pocket Envelope',
    pocketWidthMm,
    pocketHeightMm,
    flapWidthMm: flap,
    totalWidthMm,
    totalHeightMm,
    openEdge,
    outerCutPolygon,
    faceRect: { x: x0, y: y0, width: pocketWidthMm, height: pocketHeightMm },
    scoreLines: [
      { x1: x0, y1: y0, x2: x1, y2: y0, label: 'Top Flap Fold' },
      { x1: x0, y1: y1, x2: x1, y2: y1, label: 'Bottom Flap Fold' },
      { x1: x1, y1: y0, x2: x1, y2: y1, label: 'Fore-Edge Flap Fold' },
    ],
    glueFlapPolygons: [topFlap, bottomFlap, foreFlap],
  };
}

export function calculateCaseGeometry(params: BookParameters): CaseGeometry {
  const cutList = calculateChipboardCutList(params);
  const outerWrap = calculateOuterWrap(params, cutList);
  const splitPanels = calculateSplitWrapPanels(params, cutList, outerWrap);
  const rollRecommendation = evaluateRollWidth(outerWrap.widthMm, outerWrap.heightMm);
  const mediaFit = evaluatePrintMediaFit(
    params.printMedia ?? 'exact-auto',
    outerWrap.widthMm,
    outerWrap.heightMm,
  );
  const spineLiner = calculateSpineLiner(cutList);
  const frontPocket = calculatePocketEnvelope('front', params, cutList);
  const backPocket = calculatePocketEnvelope('back', params, cutList);

  return {
    bindingStyle: params.bindingStyle ?? 'rigid-case',
    cutList,
    outerWrap,
    splitPanels,
    rollRecommendation,
    mediaFit,
    spineLiner,
    frontPocket,
    backPocket,
  };
}
