import { BINDING_STYLES } from '@/resources/paperSpecs';
import type { BindingStyle, BindingStyleOption, BookParameters } from '@/types/bookParams';
import type {
  ChipboardCutList,
  LineSegment2D,
  OuterWrapGeometry,
  Polygon2D,
} from '@/types/geometry';
import { roundTo } from '@/types/units';

const SOFTCOVER_GLUE_TAB_H_MM = 10.0;

export interface BindingStyleCapabilities {
  readonly usesChipboard: boolean;
  readonly hasRigidSpine: boolean;
  readonly hasHingeSpacers: boolean;
  readonly supportsThreePieceSplit: boolean;
  readonly usesInnerPockets: boolean;
  readonly hasFlaps: boolean;
  readonly hasGlueTabs: boolean;
  readonly hasTurnIns: boolean;
}

export interface BindingStylePanelLabels {
  readonly back: string;
  readonly spine: string;
  readonly front: string;
  readonly leftFlap?: string;
  readonly rightFlap?: string;
}

export interface BindingStyleInnerPocketsNotice {
  readonly tabBadge: string;
  readonly heading: string;
  readonly explanation: string;
}

export interface BindingStyleFlapConfig {
  readonly label: string;
  readonly minMm: number;
  readonly maxMm: number;
  readonly defaultRatio: number;
  readonly defaultMinMm: number;
  readonly defaultMaxMm: number;
  readonly presetLabel: string;
  readonly presetMm: number;
}

export interface BindingStyleStrategy extends BindingStyleOption {
  readonly capabilities: BindingStyleCapabilities;
  readonly panelLabels: BindingStylePanelLabels;
  readonly innerPocketsNotice?: BindingStyleInnerPocketsNotice;
  readonly flapConfig?: BindingStyleFlapConfig;
  readonly materialNote: string;
  buildExportNote(outerWrap: OuterWrapGeometry, cutList: ChipboardCutList): string;
  calculateCutList(params: BookParameters): ChipboardCutList;
  calculateOuterWrap(params: BookParameters, cutList: ChipboardCutList): OuterWrapGeometry;
  computeMaxFlapWidthForSheet?(
    params: Pick<BookParameters, 'bindingStyle' | 'pbWidthMm' | 'pbThicknessMm'>,
    printableWidthMm: number,
  ): number;
}

const STYLE_OPTION_MAP = new Map<BindingStyle, BindingStyleOption>(
  BINDING_STYLES.map((opt) => [opt.id, opt]),
);

function getStyleMeta(id: BindingStyle): BindingStyleOption {
  const opt = STYLE_OPTION_MAP.get(id);
  if (!opt) {
    throw new Error(`Missing BINDING_STYLES metadata for "${id}"`);
  }
  return opt;
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

export function resolveFlapWidthFromConfig(
  params: Pick<BookParameters, 'pbWidthMm' | 'jacketFlapWidthMm'>,
  flapConfig: BindingStyleFlapConfig,
): number {
  const defaultFlap = Math.min(
    flapConfig.defaultMaxMm,
    Math.max(flapConfig.defaultMinMm, roundTo(params.pbWidthMm * flapConfig.defaultRatio, 1)),
  );
  return typeof params.jacketFlapWidthMm === 'number' && Number.isFinite(params.jacketFlapWidthMm)
    ? roundTo(Math.min(flapConfig.maxMm, Math.max(flapConfig.minMm, params.jacketFlapWidthMm)), 1)
    : defaultFlap;
}

function buildBleedRect(
  widthMm: number,
  heightMm: number,
  bleedMm: number,
  includeBleed: boolean,
) {
  const activeBleed = includeBleed ? bleedMm : 0;
  return {
    x: -activeBleed,
    y: -activeBleed,
    width: widthMm + activeBleed * 2,
    height: heightMm + activeBleed * 2,
  };
}

function buildHardcoverOuterWrap(
  style: 'rigid-case' | 'flexible-spine',
  params: BookParameters,
  cutList: ChipboardCutList,
): OuterWrapGeometry {
  const boardW = cutList.coverBoards.widthMm;
  const boardH = cutList.coverBoards.heightMm;
  const spineW = cutList.spineStrip.widthMm;
  const hingeW = cutList.hingeSpacerMm;
  const turnIn = params.turnInMm;

  const innerWidthMm = boardW * 2 + hingeW * 2 + spineW;
  const widthMm = roundTo(innerWidthMm + turnIn * 2, 3);
  const heightMm = roundTo(boardH + turnIn * 2, 3);

  const miterGapMm = params.boardThicknessMm * params.miterFactor;
  const miterCutLegMm = Math.max(
    0,
    Math.min(widthMm / 2, heightMm / 2, 2 * turnIn - miterGapMm * Math.SQRT2),
  );

  const outerCutPolygon = buildMiteredRectPolygon(widthMm, heightMm, miterCutLegMm, {
    topLeft: true,
    topRight: true,
    bottomRight: true,
    bottomLeft: true,
  });

  const backBoardX = turnIn;
  const leftHingeX = backBoardX + boardW;
  const spineX = leftHingeX + hingeW;
  const rightHingeX = spineX + spineW;
  const frontBoardX = rightHingeX + hingeW;

  const foldLines: LineSegment2D[] = [];
  if (turnIn > 0.2) {
    foldLines.push(
      { x1: 0, y1: turnIn, x2: widthMm, y2: turnIn, label: 'Top Turn-In Fold' },
      {
        x1: 0,
        y1: heightMm - turnIn,
        x2: widthMm,
        y2: heightMm - turnIn,
        label: 'Bottom Turn-In Fold',
      },
    );
  }

  const verticalPositions = [
    { x: backBoardX, label: 'Back Fore-Edge Turn-In' },
    { x: leftHingeX, label: hingeW > 0 ? 'Back Board / Left Hinge' : 'Back Spine Fold' },
    ...(hingeW > 0
      ? [
          { x: spineX, label: 'Left Hinge / Spine' },
          { x: rightHingeX, label: 'Spine / Right Hinge' },
        ]
      : []),
    { x: frontBoardX, label: hingeW > 0 ? 'Right Hinge / Front Board' : 'Front Spine Fold' },
    { x: frontBoardX + boardW, label: 'Front Fore-Edge Turn-In' },
  ];
  for (const pos of verticalPositions) {
    if (pos.x > 0.2 && pos.x < widthMm - 0.2) {
      foldLines.push({ x1: pos.x, y1: 0, x2: pos.x, y2: heightMm, label: pos.label });
    }
  }

  return {
    bindingStyle: style,
    widthMm,
    heightMm,
    innerWidthMm,
    turnInMm: turnIn,
    jacketFlapWidthMm: 0,
    jacketGlueTabHeightMm: 0,
    jacketGlueTabPolygons: [],
    bleedMm: params.bleedMm,
    includeBleed: params.includeBleed,
    miterGapMm,
    miterCutLegMm,
    outerCutPolygon,
    foldLines,
    bleedRect: buildBleedRect(widthMm, heightMm, params.bleedMm, params.includeBleed),
    backBoardRect: { x: backBoardX, y: turnIn, width: boardW, height: boardH },
    leftHingeRect: { x: leftHingeX, y: turnIn, width: hingeW, height: boardH },
    spineRect: { x: spineX, y: turnIn, width: spineW, height: boardH },
    rightHingeRect: { x: rightHingeX, y: turnIn, width: hingeW, height: boardH },
    frontBoardRect: { x: frontBoardX, y: turnIn, width: boardW, height: boardH },
  };
}

const SOFTCOVER_FLAP_CONFIG: BindingStyleFlapConfig = {
  label: 'Slip Flap Width',
  minMm: 20,
  maxMm: 65,
  defaultRatio: 0.23,
  defaultMinMm: 24,
  defaultMaxMm: 48,
  presetLabel: 'Deep (38 mm)',
  presetMm: 38,
};

const DUST_JACKET_FLAP_CONFIG: BindingStyleFlapConfig = {
  label: 'Jacket Flap Width',
  minMm: 20,
  maxMm: 100,
  defaultRatio: 0.5,
  defaultMinMm: 40,
  defaultMaxMm: 75,
  presetLabel: 'Classic (70 mm)',
  presetMm: 70,
};

function computeMaxFlap(
  innerW: number,
  printableWidthMm: number,
  flapConfig: BindingStyleFlapConfig,
): number {
  const maxFlap = Math.floor(((printableWidthMm - innerW) / 2) * 10 + 1e-9) / 10;
  return roundTo(Math.min(flapConfig.maxMm, Math.max(flapConfig.minMm, maxFlap)), 1);
}

function fmtDim(widthMm: number, heightMm: number): string {
  return `${roundTo(widthMm, 1)} × ${roundTo(heightMm, 1)} mm`;
}

export const BINDING_STYLE_STRATEGIES: Readonly<Record<BindingStyle, BindingStyleStrategy>> = {
  'rigid-case': {
    ...getStyleMeta('rigid-case'),
    capabilities: {
      usesChipboard: true,
      hasRigidSpine: true,
      hasHingeSpacers: true,
      supportsThreePieceSplit: true,
      usesInnerPockets: true,
      hasFlaps: false,
      hasGlueTabs: false,
      hasTurnIns: true,
    },
    panelLabels: {
      back: 'BACK BOARD',
      spine: 'SPINE',
      front: 'FRONT BOARD',
    },
    materialNote:
      'Cut 2 cover boards + 1 rigid spine strip from chipboard; wrap with bookcloth or heavy cover paper.',
    buildExportNote(outerWrap) {
      return `Outer Wrap ${fmtDim(outerWrap.widthMm, outerWrap.heightMm)} • Turn-In ${roundTo(outerWrap.turnInMm, 2)} mm • 45° Miter Clearance ${roundTo(outerWrap.miterGapMm, 2)} mm • Scale 1:1 mm`;
    },
    calculateCutList(params) {
      const boardWidthMm = params.pbWidthMm + params.overhangForeEdgeMm;
      const boardHeightMm = params.pbHeightMm + params.overhangTopBottomMm;
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
    },
    calculateOuterWrap(params, cutList) {
      return buildHardcoverOuterWrap('rigid-case', params, cutList);
    },
  },

  'flexible-spine': {
    ...getStyleMeta('flexible-spine'),
    capabilities: {
      usesChipboard: true,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: true,
      usesInnerPockets: true,
      hasFlaps: false,
      hasGlueTabs: false,
      hasTurnIns: true,
    },
    panelLabels: {
      back: 'BACK BOARD',
      spine: 'FLEX SPINE',
      front: 'FRONT BOARD',
    },
    materialNote:
      'Cut 2 cover boards (no spine board); bridge the center gap with flexible bookcloth or heavy paper.',
    buildExportNote(outerWrap, cutList) {
      return `Flexible-Spine Wrap ${fmtDim(outerWrap.widthMm, outerWrap.heightMm)} • Cloth Spine Gap ${roundTo(cutList.spineStrip.widthMm, 2)} mm • Turn-In ${roundTo(outerWrap.turnInMm, 2)} mm • Scale 1:1 mm`;
    },
    calculateCutList(params) {
      const boardWidthMm = params.pbWidthMm + params.overhangForeEdgeMm;
      const boardHeightMm = params.pbHeightMm + params.overhangTopBottomMm;
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
    },
    calculateOuterWrap(params, cutList) {
      return buildHardcoverOuterWrap('flexible-spine', params, cutList);
    },
  },

  'softcover-jacket': {
    ...getStyleMeta('softcover-jacket'),
    capabilities: {
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: false,
      hasFlaps: true,
      hasGlueTabs: true,
      hasTurnIns: false,
    },
    panelLabels: {
      back: 'BACK COVER',
      spine: 'SPINE',
      front: 'FRONT COVER',
      leftFlap: 'TUCK FLAP',
      rightFlap: 'TUCK FLAP',
    },
    innerPocketsNotice: {
      tabBadge: 'Built-In',
      heading: 'Inner Pockets Are Already Included',
      explanation:
        'Separate Inner Pockets & Spine Liner are not needed for the 1-Piece Fold-and-Glue Slip Cover — your slip-in pockets and 4 wrap-over glue tabs are already built into the Cover Studio sheet.',
    },
    flapConfig: SOFTCOVER_FLAP_CONFIG,
    materialNote:
      '0 chipboard — print 1-piece slip cover on 160–250 gsm cardstock, fold flaps inward, and glue 4 tabs over flaps.',
    buildExportNote(outerWrap) {
      return `Fold-and-Glue Slip Cover ${fmtDim(outerWrap.widthMm, outerWrap.heightMm)} • 1. Fold ${roundTo(outerWrap.jacketFlapWidthMm, 2)} mm flaps inward • 2. Glue back of 4 tabs (${roundTo(outerWrap.jacketGlueTabHeightMm, 2)} mm) • 3. Fold tabs over flaps`;
    },
    calculateCutList(params) {
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
    },
    calculateOuterWrap(params, cutList) {
      const boardW = cutList.coverBoards.widthMm;
      const boardH = cutList.coverBoards.heightMm;
      const spineW = cutList.spineStrip.widthMm;
      const jacketFlapWidthMm = resolveFlapWidthFromConfig(params, SOFTCOVER_FLAP_CONFIG);
      const jacketGlueTabHeightMm = SOFTCOVER_GLUE_TAB_H_MM;

      const innerWidthMm = boardW * 2 + spineW;
      const widthMm = roundTo(innerWidthMm + jacketFlapWidthMm * 2, 3);
      const heightMm = roundTo(boardH + jacketGlueTabHeightMm * 2, 3);

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
      const outerCutPolygon: Polygon2D = [
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

      const jacketGlueTabPolygons: readonly Polygon2D[] = [
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

      const backBoardX = jacketFlapWidthMm;
      const spineX = backBoardX + boardW;
      const frontBoardX = spineX + spineW;

      const foldLines: LineSegment2D[] = [
        // 4 vertical fold lines (flaps & spine edges)
        { x1: backBoardX, y1: y1, x2: backBoardX, y2: y2, label: 'Back Flap Fold' },
        { x1: spineX, y1: y1, x2: spineX, y2: y2, label: 'Back Spine Fold' },
        { x1: frontBoardX, y1: y1, x2: frontBoardX, y2: y2, label: 'Front Spine Fold' },
        { x1: x2, y1: y1, x2: x2, y2: y2, label: 'Front Flap Fold' },
        // 4 horizontal glue-tab fold lines
        { x1: x1, y1: y1, x2: x1TabEnd, y2: y1, label: 'Back Top Glue Tab Fold' },
        { x1: x2TabStart, y1: y1, x2: x2, y2: y1, label: 'Front Top Glue Tab Fold' },
        { x1: x2TabStart, y1: y2, x2: x2, y2: y2, label: 'Front Bottom Glue Tab Fold' },
        { x1: x1, y1: y2, x2: x1TabEnd, y2: y2, label: 'Back Bottom Glue Tab Fold' },
      ];

      return {
        bindingStyle: 'softcover-jacket',
        widthMm,
        heightMm,
        innerWidthMm,
        turnInMm: 0,
        jacketFlapWidthMm,
        jacketGlueTabHeightMm,
        jacketGlueTabPolygons,
        bleedMm: params.bleedMm,
        includeBleed: params.includeBleed,
        miterGapMm: 0,
        miterCutLegMm: 0,
        outerCutPolygon,
        foldLines,
        bleedRect: buildBleedRect(widthMm, heightMm, params.bleedMm, params.includeBleed),
        backBoardRect: { x: backBoardX, y: y1, width: boardW, height: boardH },
        leftHingeRect: { x: spineX, y: y1, width: 0, height: boardH },
        spineRect: { x: spineX, y: y1, width: spineW, height: boardH },
        rightHingeRect: { x: frontBoardX, y: y1, width: 0, height: boardH },
        frontBoardRect: { x: frontBoardX, y: y1, width: boardW, height: boardH },
      };
    },
    computeMaxFlapWidthForSheet(params, printableWidthMm) {
      const innerW = (params.pbWidthMm + 1.0) * 2 + (params.pbThicknessMm + 1.0);
      return computeMaxFlap(innerW, printableWidthMm, SOFTCOVER_FLAP_CONFIG);
    },
  },

  'dust-jacket': {
    ...getStyleMeta('dust-jacket'),
    capabilities: {
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: false,
      hasFlaps: true,
      hasGlueTabs: false,
      hasTurnIns: false,
    },
    panelLabels: {
      back: 'BACK COVER',
      spine: 'SPINE',
      front: 'FRONT COVER',
      leftFlap: 'BACK FLAP',
      rightFlap: 'FRONT FLAP',
    },
    innerPocketsNotice: {
      tabBadge: 'Not Needed',
      heading: 'Classic Dust Jacket — No Separate Inner Pockets',
      explanation:
        'Dust jackets wrap around an existing book cover with wide fold-in flaps — no inner pockets, chipboard, or glue tabs are required.',
    },
    flapConfig: DUST_JACKET_FLAP_CONFIG,
    materialNote:
      '0 chipboard — print on 130–200 gsm coated or matte paper, score 4 vertical folds, and wrap over an existing cover (no glue).',
    buildExportNote(outerWrap) {
      return `Dust Jacket ${fmtDim(outerWrap.widthMm, outerWrap.heightMm)} • ${roundTo(outerWrap.jacketFlapWidthMm, 2)} mm fold-in flaps • Score 4 vertical folds (no glue) • Scale 1:1 mm`;
    },
    calculateCutList(params) {
      // Real publisher dust jacket wrap ease over an existing cover:
      // +1.0 mm fore-edge wrap ease, +1.5 mm spine fold ease, flush height so edges don't fray
      const coverWidthMm = roundTo(params.pbWidthMm + 1.0, 2);
      const coverHeightMm = roundTo(params.pbHeightMm, 2);
      const spineWidthMm = roundTo(params.pbThicknessMm + 1.5, 2);
      return {
        coverBoards: {
          label: 'Cover Panels (No Chipboard)',
          quantity: 0,
          widthMm: coverWidthMm,
          heightMm: coverHeightMm,
        },
        spineStrip: {
          label: 'Dust Jacket Spine (No Chipboard)',
          quantity: 0,
          widthMm: spineWidthMm,
          heightMm: coverHeightMm,
        },
        boardThicknessMm: 0,
        hingeSpacerMm: 0,
      };
    },
    calculateOuterWrap(params, cutList) {
      const coverW = cutList.coverBoards.widthMm;
      const coverH = cutList.coverBoards.heightMm;
      const spineW = cutList.spineStrip.widthMm;
      const flapW = resolveFlapWidthFromConfig(params, DUST_JACKET_FLAP_CONFIG);

      const innerWidthMm = roundTo(coverW + spineW + coverW, 2);
      const widthMm = roundTo(flapW + coverW + spineW + coverW + flapW, 2);
      const heightMm = roundTo(coverH, 2);

      const outerCutPolygon: Polygon2D = [
        { x: 0, y: 0 },
        { x: widthMm, y: 0 },
        { x: widthMm, y: heightMm },
        { x: 0, y: heightMm },
      ];

      const backCoverX = flapW;
      const spineX = roundTo(flapW + coverW, 2);
      const frontCoverX = roundTo(flapW + coverW + spineW, 2);
      const frontFlapX = roundTo(flapW + coverW + spineW + coverW, 2);

      const foldLines: LineSegment2D[] = [
        { x1: backCoverX, y1: 0, x2: backCoverX, y2: heightMm, label: 'Back Flap Fold' },
        { x1: spineX, y1: 0, x2: spineX, y2: heightMm, label: 'Back Spine Fold' },
        { x1: frontCoverX, y1: 0, x2: frontCoverX, y2: heightMm, label: 'Front Spine Fold' },
        { x1: frontFlapX, y1: 0, x2: frontFlapX, y2: heightMm, label: 'Front Flap Fold' },
      ];

      return {
        bindingStyle: 'dust-jacket',
        widthMm,
        heightMm,
        innerWidthMm,
        turnInMm: 0,
        jacketFlapWidthMm: flapW,
        jacketGlueTabHeightMm: 0,
        jacketGlueTabPolygons: [],
        bleedMm: params.bleedMm,
        includeBleed: params.includeBleed,
        miterGapMm: 0,
        miterCutLegMm: 0,
        outerCutPolygon,
        foldLines,
        bleedRect: buildBleedRect(widthMm, heightMm, params.bleedMm, params.includeBleed),
        backBoardRect: { x: backCoverX, y: 0, width: coverW, height: heightMm },
        leftHingeRect: { x: spineX, y: 0, width: 0, height: heightMm },
        spineRect: { x: spineX, y: 0, width: spineW, height: heightMm },
        rightHingeRect: { x: frontCoverX, y: 0, width: 0, height: heightMm },
        frontBoardRect: { x: frontCoverX, y: 0, width: coverW, height: heightMm },
      };
    },
    computeMaxFlapWidthForSheet(params, printableWidthMm) {
      const innerW = roundTo(params.pbWidthMm + 1.0, 2) * 2 + roundTo(params.pbThicknessMm + 1.5, 2);
      return computeMaxFlap(innerW, printableWidthMm, DUST_JACKET_FLAP_CONFIG);
    },
  },

  'paperback-wrap': {
    ...getStyleMeta('paperback-wrap'),
    capabilities: {
      usesChipboard: false,
      hasRigidSpine: false,
      hasHingeSpacers: false,
      supportsThreePieceSplit: false,
      usesInnerPockets: false,
      hasFlaps: false,
      hasGlueTabs: false,
      hasTurnIns: false,
    },
    panelLabels: {
      back: 'BACK COVER',
      spine: 'SPINE',
      front: 'FRONT COVER',
    },
    innerPocketsNotice: {
      tabBadge: 'Not Needed',
      heading: 'Replacement Paperback Cover — No Inner Pockets or Chipboard',
      explanation:
        'This flush 1-piece cardstock wrap glues directly to the paperback textblock spine — no separate inner pockets, spine liner, or boards are needed.',
    },
    materialNote:
      '0 chipboard — print on 220–300 gsm cover cardstock, score 2 spine folds, and glue directly onto the paperback textblock spine.',
    buildExportNote(outerWrap) {
      return `Paperback Cover ${fmtDim(outerWrap.widthMm, outerWrap.heightMm)} • Score 2 spine folds & glue spine to textblock • Scale 1:1 mm`;
    },
    calculateCutList(params) {
      const coverWidthMm = roundTo(params.pbWidthMm, 2);
      const coverHeightMm = roundTo(params.pbHeightMm, 2);
      const spineWidthMm = roundTo(params.pbThicknessMm, 2);
      return {
        coverBoards: {
          label: 'Cover Panels (No Chipboard)',
          quantity: 0,
          widthMm: coverWidthMm,
          heightMm: coverHeightMm,
        },
        spineStrip: {
          label: 'Paperback Spine (No Chipboard)',
          quantity: 0,
          widthMm: spineWidthMm,
          heightMm: coverHeightMm,
        },
        boardThicknessMm: 0,
        hingeSpacerMm: 0,
      };
    },
    calculateOuterWrap(params, cutList) {
      const coverW = cutList.coverBoards.widthMm;
      const coverH = cutList.coverBoards.heightMm;
      const spineW = cutList.spineStrip.widthMm;

      const widthMm = roundTo(coverW + spineW + coverW, 2);
      const heightMm = roundTo(coverH, 2);
      const spineX = coverW;
      const frontCoverX = roundTo(coverW + spineW, 2);

      const outerCutPolygon: Polygon2D = [
        { x: 0, y: 0 },
        { x: widthMm, y: 0 },
        { x: widthMm, y: heightMm },
        { x: 0, y: heightMm },
      ];

      const foldLines: LineSegment2D[] = [
        { x1: spineX, y1: 0, x2: spineX, y2: heightMm, label: 'Back Spine Fold' },
        { x1: frontCoverX, y1: 0, x2: frontCoverX, y2: heightMm, label: 'Front Spine Fold' },
      ];

      return {
        bindingStyle: 'paperback-wrap',
        widthMm,
        heightMm,
        innerWidthMm: widthMm,
        turnInMm: 0,
        jacketFlapWidthMm: 0,
        jacketGlueTabHeightMm: 0,
        jacketGlueTabPolygons: [],
        bleedMm: params.bleedMm,
        includeBleed: params.includeBleed,
        miterGapMm: 0,
        miterCutLegMm: 0,
        outerCutPolygon,
        foldLines,
        bleedRect: buildBleedRect(widthMm, heightMm, params.bleedMm, params.includeBleed),
        backBoardRect: { x: 0, y: 0, width: coverW, height: heightMm },
        leftHingeRect: { x: spineX, y: 0, width: 0, height: heightMm },
        spineRect: { x: spineX, y: 0, width: spineW, height: heightMm },
        rightHingeRect: { x: frontCoverX, y: 0, width: 0, height: heightMm },
        frontBoardRect: { x: frontCoverX, y: 0, width: coverW, height: heightMm },
      };
    },
  },
};

export function getBindingStrategy(style?: BindingStyle): BindingStyleStrategy {
  if (style && style in BINDING_STYLE_STRATEGIES) {
    return BINDING_STYLE_STRATEGIES[style];
  }
  return BINDING_STYLE_STRATEGIES['rigid-case'];
}

export function listBindingStrategies(): readonly BindingStyleStrategy[] {
  return BINDING_STYLES.map((opt) => BINDING_STYLE_STRATEGIES[opt.id]);
}
