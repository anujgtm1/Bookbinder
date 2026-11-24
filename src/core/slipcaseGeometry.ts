import type { CaseGeometry, Point2D, Polygon2D } from '@/types/geometry';
import { clampFinite, roundTo } from '@/types/units';
import { fmtMm } from '@/lib/svgFormat';
import { resolveBindingStrategy } from './bindingStyles';

export type SlipcasePanelRole = 'side-wall' | 'spine-wall' | 'cap-wall';

export interface SlipcaseOptions {
  /** Internal clearance added to book height & thickness for smooth sliding (mm). */
  readonly slideClearanceMm: number;
  /** Slipcase chipboard wall thickness (mm). */
  readonly wallBoardThicknessMm: number;
  /** Centered semi-circular thumb-notch radius on the open fore-edge of both side walls (mm; 0 disables). */
  readonly thumbNotchRadiusMm: number;
  /** Outer cloth/paper wrap turn-in allowance (mm). */
  readonly wrapTurnInMm: number;
}

export const SLIPCASE_OPTION_BOUNDS = {
  slideClearanceMm: { min: 0.5, max: 6.0 },
  wallBoardThicknessMm: { min: 1.0, max: 4.0 },
  thumbNotchRadiusMm: { min: 0.0, max: 25.0 },
  wrapTurnInMm: { min: 10.0, max: 30.0 },
} as const;

export const DEFAULT_SLIPCASE_OPTIONS: Readonly<SlipcaseOptions> = {
  slideClearanceMm: 2.0,
  wallBoardThicknessMm: 2.0,
  thumbNotchRadiusMm: 12.0,
  wrapTurnInMm: 18.0,
};

export interface SlipcasePanelSpec {
  readonly label: string;
  readonly quantity: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly role: SlipcasePanelRole;
  readonly hasThumbNotch: boolean;
  readonly svgPathD: string;
  readonly cutPolylinePoints: Polygon2D;
}

export interface SlipcaseWrapStripSpec {
  readonly label: string;
  readonly quantity: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface SlipcaseGeometry {
  readonly bookOuterWidthMm: number;
  readonly bookOuterHeightMm: number;
  readonly bookOuterThicknessMm: number;
  readonly cavityWidthMm: number;
  readonly cavityHeightMm: number;
  readonly cavityThicknessMm: number;
  readonly outerWidthMm: number;
  readonly outerHeightMm: number;
  readonly outerThicknessMm: number;
  readonly sideWalls: SlipcasePanelSpec;
  readonly spineWall: SlipcasePanelSpec;
  readonly headTailWalls: SlipcasePanelSpec;
  readonly mainWrapStrip: SlipcaseWrapStripSpec;
  readonly capWrapStrip: SlipcaseWrapStripSpec;
  readonly options: SlipcaseOptions;
  readonly effectiveThumbNotchRadiusMm: number;
}

const MAX_NOTCH_HEIGHT_RATIO = 0.3;
const MAX_NOTCH_WIDTH_RATIO = 0.35;
const BOARDLESS_THICKNESS_EASE_MM = 1.0;

/**
 * Clamps and normalizes user slipcase configuration values against safe bookbinding bounds.
 */
export function clampSlipcaseOptions(partial?: Partial<SlipcaseOptions>): SlipcaseOptions {
  const b = SLIPCASE_OPTION_BOUNDS;
  const d = DEFAULT_SLIPCASE_OPTIONS;
  return {
    slideClearanceMm: clampFinite(
      partial?.slideClearanceMm,
      d.slideClearanceMm,
      b.slideClearanceMm.min,
      b.slideClearanceMm.max,
    ),
    wallBoardThicknessMm: clampFinite(
      partial?.wallBoardThicknessMm,
      d.wallBoardThicknessMm,
      b.wallBoardThicknessMm.min,
      b.wallBoardThicknessMm.max,
    ),
    thumbNotchRadiusMm: clampFinite(
      partial?.thumbNotchRadiusMm,
      d.thumbNotchRadiusMm,
      b.thumbNotchRadiusMm.min,
      b.thumbNotchRadiusMm.max,
    ),
    wrapTurnInMm: clampFinite(
      partial?.wrapTurnInMm,
      d.wrapTurnInMm,
      b.wrapTurnInMm.min,
      b.wrapTurnInMm.max,
    ),
  };
}

/**
 * Computes a safe effective thumb-notch radius so the cutout never compromises
 * corner board strength or self-intersects on small books.
 */
export function clampEffectiveThumbNotchRadius(
  requestedRadiusMm: number,
  panelWidthMm: number,
  panelHeightMm: number,
): number {
  if (!Number.isFinite(requestedRadiusMm) || requestedRadiusMm <= 0) {
    return 0;
  }
  const safeMax = Math.max(
    0,
    Math.min(panelHeightMm * MAX_NOTCH_HEIGHT_RATIO, panelWidthMm * MAX_NOTCH_WIDTH_RATIO),
  );
  return roundTo(Math.min(requestedRadiusMm, safeMax), 3);
}

function buildRectPolyline(widthMm: number, heightMm: number): Polygon2D {
  return [
    { x: 0, y: 0 },
    { x: roundTo(widthMm, 3), y: 0 },
    { x: roundTo(widthMm, 3), y: roundTo(heightMm, 3) },
    { x: 0, y: roundTo(heightMm, 3) },
  ];
}

function buildRectSvgPath(widthMm: number, heightMm: number, offsetX = 0, offsetY = 0): string {
  const x0 = fmtMm(offsetX);
  const y0 = fmtMm(offsetY);
  const x1 = fmtMm(offsetX + widthMm);
  const y1 = fmtMm(offsetY + heightMm);
  return `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
}

/**
 * Builds an exact SVG path (`d`) for a slipcase side wall with a centered semi-circular
 * thumb-notch cutout along the open fore-edge (`'left'` or `'right'`).
 * When `notchRadiusMm <= 0`, emits a clean rectangular path with no arc command.
 */
export function buildThumbNotchSideWallSvgPath(
  widthMm: number,
  heightMm: number,
  notchRadiusMm: number,
  openSide: 'left' | 'right',
  offsetX = 0,
  offsetY = 0,
): string {
  const r = clampEffectiveThumbNotchRadius(notchRadiusMm, widthMm, heightMm);
  if (r <= 0) {
    return buildRectSvgPath(widthMm, heightMm, offsetX, offsetY);
  }

  const x0 = offsetX;
  const y0 = offsetY;
  const x1 = offsetX + widthMm;
  const y1 = offsetY + heightMm;
  const cy = offsetY + heightMm / 2;
  const rStr = fmtMm(r);

  if (openSide === 'right') {
    // Clockwise perimeter with concave inward semi-circle (sweep-flag = 0) on the right edge.
    return [
      `M ${fmtMm(x0)} ${fmtMm(y0)}`,
      `L ${fmtMm(x1)} ${fmtMm(y0)}`,
      `L ${fmtMm(x1)} ${fmtMm(cy - r)}`,
      `A ${rStr} ${rStr} 0 0 0 ${fmtMm(x1)} ${fmtMm(cy + r)}`,
      `L ${fmtMm(x1)} ${fmtMm(y1)}`,
      `L ${fmtMm(x0)} ${fmtMm(y1)}`,
      'Z',
    ].join(' ');
  }

  // Clockwise perimeter with concave inward semi-circle (sweep-flag = 0) on the left edge.
  return [
    `M ${fmtMm(x0)} ${fmtMm(y0)}`,
    `L ${fmtMm(x1)} ${fmtMm(y0)}`,
    `L ${fmtMm(x1)} ${fmtMm(y1)}`,
    `L ${fmtMm(x0)} ${fmtMm(y1)}`,
    `L ${fmtMm(x0)} ${fmtMm(cy + r)}`,
    `A ${rStr} ${rStr} 0 0 0 ${fmtMm(x0)} ${fmtMm(cy - r)}`,
    'Z',
  ].join(' ');
}

/**
 * Builds a smooth millimeter polyline polygon for a slipcase side wall with a centered
 * semi-circular thumb-notch cutout, suitable for `pdf-lib` and 2D vector consumers.
 */
export function buildThumbNotchSideWallPolyline(
  widthMm: number,
  heightMm: number,
  notchRadiusMm: number,
  openSide: 'left' | 'right',
  arcSegments = 24,
): Polygon2D {
  const r = clampEffectiveThumbNotchRadius(notchRadiusMm, widthMm, heightMm);
  if (r <= 0) {
    return buildRectPolyline(widthMm, heightMm);
  }

  const segments = Math.max(4, Math.round(arcSegments));
  const cy = heightMm / 2;
  const points: Point2D[] = [];

  if (openSide === 'right') {
    points.push({ x: 0, y: 0 }, { x: roundTo(widthMm, 3), y: 0 });
    // Trace inward semi-circle from (widthMm, cy - r) through (widthMm - r, cy) to (widthMm, cy + r)
    for (let i = 0; i <= segments; i++) {
      const theta = (3 * Math.PI) / 2 - (Math.PI * i) / segments;
      points.push({
        x: roundTo(widthMm + r * Math.cos(theta), 3),
        y: roundTo(cy + r * Math.sin(theta), 3),
      });
    }
    points.push({ x: roundTo(widthMm, 3), y: roundTo(heightMm, 3) }, { x: 0, y: roundTo(heightMm, 3) });
    return points;
  }

  points.push(
    { x: 0, y: 0 },
    { x: roundTo(widthMm, 3), y: 0 },
    { x: roundTo(widthMm, 3), y: roundTo(heightMm, 3) },
    { x: 0, y: roundTo(heightMm, 3) },
  );
  // Trace inward semi-circle from (0, cy + r) through (r, cy) to (0, cy - r)
  for (let i = 0; i <= segments; i++) {
    const theta = Math.PI / 2 - (Math.PI * i) / segments;
    points.push({
      x: roundTo(r * Math.cos(theta), 3),
      y: roundTo(cy + r * Math.sin(theta), 3),
    });
  }
  return points;
}

/**
 * Calculates the 5-piece flush-stacking chipboard cut list (DAS Bookbinding method),
 * internal sliding cavity, finished box exterior dimensions, and outer cloth/paper wrap strips
 * for a matching slipcase sized to `caseGeometry`.
 */
export function calculateSlipcaseGeometry(
  caseGeometry: CaseGeometry,
  options?: Partial<SlipcaseOptions>,
): SlipcaseGeometry {
  const clamped = clampSlipcaseOptions(options);
  const strategy = resolveBindingStrategy(caseGeometry);
  const { cutList } = caseGeometry;

  const bookOuterWidthMm = roundTo(cutList.coverBoards.widthMm, 2);
  const bookOuterHeightMm = roundTo(cutList.coverBoards.heightMm, 2);
  const bookOuterThicknessMm = strategy.capabilities.usesChipboard
    ? roundTo(cutList.spineStrip.widthMm + cutList.boardThicknessMm * 2, 2)
    : roundTo(cutList.spineStrip.widthMm + BOARDLESS_THICKNESS_EASE_MM, 2);

  // Fore-edge depth uses slightly tighter ease so the book spine sits flush at the opening
  const foreEdgeEaseMm = Math.max(1.0, clamped.slideClearanceMm * 0.75);
  const cavityWidthMm = roundTo(bookOuterWidthMm + foreEdgeEaseMm, 2);
  const cavityHeightMm = roundTo(bookOuterHeightMm + clamped.slideClearanceMm, 2);
  const cavityThicknessMm = roundTo(bookOuterThicknessMm + clamped.slideClearanceMm, 2);

  const wallT = clamped.wallBoardThicknessMm;

  // 1. Closed Back / Spine Wall (Qty 1): glues inside between side walls and head/tail caps
  const spineWallWidthMm = cavityThicknessMm;
  const spineWallHeightMm = cavityHeightMm;
  const spineWall: SlipcasePanelSpec = {
    label: 'Spine Wall (Closed Back)',
    quantity: 1,
    widthMm: spineWallWidthMm,
    heightMm: spineWallHeightMm,
    role: 'spine-wall',
    hasThumbNotch: false,
    svgPathD: buildRectSvgPath(spineWallWidthMm, spineWallHeightMm),
    cutPolylinePoints: buildRectPolyline(spineWallWidthMm, spineWallHeightMm),
  };

  // 2. Head & Tail Cap Walls (Qty 2): span cavity depth + spine wall thickness
  const capWallWidthMm = roundTo(cavityWidthMm + wallT, 2);
  const capWallHeightMm = cavityThicknessMm;
  const headTailWalls: SlipcasePanelSpec = {
    label: 'Head & Tail Walls (Top / Bottom)',
    quantity: 2,
    widthMm: capWallWidthMm,
    heightMm: capWallHeightMm,
    role: 'cap-wall',
    hasThumbNotch: false,
    svgPathD: buildRectSvgPath(capWallWidthMm, capWallHeightMm),
    cutPolylinePoints: buildRectPolyline(capWallWidthMm, capWallHeightMm),
  };

  // 3. Front & Back Side Walls (Qty 2): glue flush outside spine + head + tail walls
  const sideWallWidthMm = roundTo(cavityWidthMm + wallT, 2);
  const sideWallHeightMm = roundTo(cavityHeightMm + wallT * 2, 2);
  const effectiveThumbNotchRadiusMm = clampEffectiveThumbNotchRadius(
    clamped.thumbNotchRadiusMm,
    sideWallWidthMm,
    sideWallHeightMm,
  );
  const sideWalls: SlipcasePanelSpec = {
    label: 'Side Walls (Front & Back)',
    quantity: 2,
    widthMm: sideWallWidthMm,
    heightMm: sideWallHeightMm,
    role: 'side-wall',
    hasThumbNotch: effectiveThumbNotchRadiusMm > 0,
    svgPathD: buildThumbNotchSideWallSvgPath(
      sideWallWidthMm,
      sideWallHeightMm,
      effectiveThumbNotchRadiusMm,
      'right',
    ),
    cutPolylinePoints: buildThumbNotchSideWallPolyline(
      sideWallWidthMm,
      sideWallHeightMm,
      effectiveThumbNotchRadiusMm,
      'right',
    ),
  };

  // Finished slipcase exterior dimensions
  const outerWidthMm = sideWallWidthMm;
  const outerHeightMm = sideWallHeightMm;
  const outerThicknessMm = roundTo(cavityThicknessMm + wallT * 2, 2);

  // Outer cloth / cover paper wrap strips
  const turnIn = clamped.wrapTurnInMm;
  const mainWrapStrip: SlipcaseWrapStripSpec = {
    label: 'Main Outer Wrap (Side + Spine + Side)',
    quantity: 1,
    widthMm: roundTo(sideWallWidthMm * 2 + outerThicknessMm + turnIn * 2, 2),
    heightMm: roundTo(sideWallHeightMm + turnIn * 2, 2),
  };

  const capWrapStrip: SlipcaseWrapStripSpec = {
    label: 'Head & Tail Wrap Strips',
    quantity: 2,
    widthMm: roundTo(sideWallWidthMm + turnIn * 2, 2),
    heightMm: roundTo(outerThicknessMm + turnIn * 2, 2),
  };

  return {
    bookOuterWidthMm,
    bookOuterHeightMm,
    bookOuterThicknessMm,
    cavityWidthMm,
    cavityHeightMm,
    cavityThicknessMm,
    outerWidthMm,
    outerHeightMm,
    outerThicknessMm,
    sideWalls,
    spineWall,
    headTailWalls,
    mainWrapStrip,
    capWrapStrip,
    options: clamped,
    effectiveThumbNotchRadiusMm,
  };
}
