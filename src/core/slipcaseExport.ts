import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { escapeXml, fmtMm } from '@/lib/svgFormat';
import { getPageSizeSpec } from '@/resources/paperSpecs';
import type { PageSizeId } from '@/types/bookParams';
import { GeometryPrimitives, type Point2D, type Polygon2D } from '@/types/geometry';
import { UnitConverter, roundTo } from '@/types/units';
import {
  buildThumbNotchSideWallPolyline,
  buildThumbNotchSideWallSvgPath,
  type SlipcaseGeometry,
  type SlipcasePanelRole,
} from './slipcaseGeometry';

const SVG_PAD_MM = 10;
const SVG_GAP_MM = 12;
const SVG_HEADER_H_MM = 60;

const PDF_MARGIN_MM = 7.5;
const PDF_GAP_MM = 5.0;
const CALIBRATION_SIZE_MM = 50.0;
const PDF_HEADER_H_MM = 56.0;

export type SlipcasePieceKind =
  | 'info-calibration'
  | 'side-wall-front'
  | 'side-wall-back'
  | 'spine-wall'
  | 'head-wall'
  | 'tail-wall';

export interface SlipcasePdfPlacement {
  readonly kind: SlipcasePieceKind;
  readonly pageIndex: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly originalWidthMm: number;
  readonly originalHeightMm: number;
  readonly rotated90: boolean;
  readonly clipped: boolean;
}

export interface SlipcasePdfLayoutPlan {
  readonly pageSizeId: PageSizeId;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly pageCount: number;
  readonly placements: readonly SlipcasePdfPlacement[];
}

interface GrainArrowSegment {
  readonly a: Point2D;
  readonly b: Point2D;
  readonly headA1: Point2D;
  readonly headA2: Point2D;
  readonly headB1: Point2D;
  readonly headB2: Point2D;
}

function fmtDim(widthMm: number, heightMm: number): string {
  return `${roundTo(widthMm, 1)} × ${roundTo(heightMm, 1)} mm`;
}

function buildDoubleArrow(a: Point2D, b: Point2D, headLen = 2.6, headHalfW = 1.4): GrainArrowSegment {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  return {
    a,
    b,
    headA1: { x: a.x + ux * headLen + px * headHalfW, y: a.y + uy * headLen + py * headHalfW },
    headA2: { x: a.x + ux * headLen - px * headHalfW, y: a.y + uy * headLen - py * headHalfW },
    headB1: { x: b.x - ux * headLen + px * headHalfW, y: b.y - uy * headLen + py * headHalfW },
    headB2: { x: b.x - ux * headLen - px * headHalfW, y: b.y - uy * headLen - py * headHalfW },
  };
}

function buildLocalGrainArrow(
  role: SlipcasePanelRole,
  widthMm: number,
  heightMm: number,
  openSide?: 'left' | 'right',
): GrainArrowSegment {
  if (role === 'side-wall') {
    // Grain runs parallel to the book spine (vertical); place arrow near the closed spine edge
    const edgeInset = Math.min(16, widthMm * 0.16);
    const arrowX = openSide === 'left' ? widthMm - edgeInset : edgeInset;
    const span = Math.min(54, heightMm * 0.45);
    const midY = heightMm / 2;
    return buildDoubleArrow({ x: arrowX, y: midY - span / 2 }, { x: arrowX, y: midY + span / 2 });
  }

  if (role === 'spine-wall') {
    // Grain runs parallel to the book spine (vertical); place in upper section clear of center text
    const arrowX = widthMm / 2;
    const topY = Math.min(14, heightMm * 0.08);
    const span = Math.min(34, heightMm * 0.2);
    return buildDoubleArrow({ x: arrowX, y: topY }, { x: arrowX, y: topY + span });
  }

  // Head & Tail cap walls: grain runs lengthwise along fore-edge depth (widthMm)
  const arrowY = heightMm / 2;
  const leftX = Math.min(10, widthMm * 0.08);
  const span = Math.min(30, widthMm * 0.22);
  return buildDoubleArrow({ x: leftX, y: arrowY }, { x: leftX + span, y: arrowY });
}

function renderSvgArrow(arrow: GrainArrowSegment, offsetX: number, offsetY: number, label: string): string {
  const shift = (pt: Point2D) => ({ x: pt.x + offsetX, y: pt.y + offsetY });
  const a = shift(arrow.a);
  const b = shift(arrow.b);
  const ha1 = shift(arrow.headA1);
  const ha2 = shift(arrow.headA2);
  const hb1 = shift(arrow.headB1);
  const hb2 = shift(arrow.headB2);

  return [
    `<line x1="${fmtMm(a.x)}" y1="${fmtMm(a.y)}" x2="${fmtMm(b.x)}" y2="${fmtMm(b.y)}" data-label="${escapeXml(label)}" />`,
    `<polyline points="${fmtMm(ha1.x)},${fmtMm(ha1.y)} ${fmtMm(a.x)},${fmtMm(a.y)} ${fmtMm(ha2.x)},${fmtMm(ha2.y)}" />`,
    `<polyline points="${fmtMm(hb1.x)},${fmtMm(hb1.y)} ${fmtMm(b.x)},${fmtMm(b.y)} ${fmtMm(hb2.x)},${fmtMm(hb2.y)}" />`,
  ].join('\n    ');
}

function buildOffsetRectPath(x: number, y: number, w: number, h: number): string {
  return `M ${fmtMm(x)} ${fmtMm(y)} L ${fmtMm(x + w)} ${fmtMm(y)} L ${fmtMm(x + w)} ${fmtMm(y + h)} L ${fmtMm(x)} ${fmtMm(y + h)} Z`;
}

/**
 * Generates an exact 1:1 physical millimeter SVG containing all 5 slipcase chipboard
 * panels (2 side walls with optional true SVG arc thumb-notches, 1 spine wall, 2 head/tail walls),
 * a 50 × 50 mm scale check square, grain direction arrows, and outer wrap strip cut specs.
 */
export function generateSlipcaseSvg(slipcase: SlipcaseGeometry): string {
  const { sideWalls, spineWall, headTailWalls, mainWrapStrip, capWrapStrip, options } = slipcase;
  const r = slipcase.effectiveThumbNotchRadiusMm;

  // Row 1: Front Side Wall (notch on right) | Spine Wall | Back Side Wall (notch on left)
  const row1Y = SVG_PAD_MM + SVG_HEADER_H_MM;
  const side1X = SVG_PAD_MM;
  const spineX = side1X + sideWalls.widthMm + SVG_GAP_MM;
  const spineY = row1Y + (sideWalls.heightMm - spineWall.heightMm) / 2;
  const side2X = spineX + spineWall.widthMm + SVG_GAP_MM;
  const row1W = side2X + sideWalls.widthMm - SVG_PAD_MM;

  // Row 2: Head Cap Wall | Tail Cap Wall
  const row2Y = row1Y + sideWalls.heightMm + SVG_GAP_MM;
  const headX = SVG_PAD_MM;
  const tailX = headX + headTailWalls.widthMm + SVG_GAP_MM;
  const row2W = tailX + headTailWalls.widthMm - SVG_PAD_MM;

  const minHeaderW = 240;
  const totalW = roundTo(Math.max(row1W, row2W, minHeaderW) + SVG_PAD_MM * 2, 3);
  const totalH = roundTo(row2Y + headTailWalls.heightMm + SVG_PAD_MM, 3);

  const side1Path = buildThumbNotchSideWallSvgPath(
    sideWalls.widthMm,
    sideWalls.heightMm,
    r,
    'right',
    side1X,
    row1Y,
  );
  const spinePath = buildOffsetRectPath(spineX, spineY, spineWall.widthMm, spineWall.heightMm);
  const side2Path = buildThumbNotchSideWallSvgPath(
    sideWalls.widthMm,
    sideWalls.heightMm,
    r,
    'left',
    side2X,
    row1Y,
  );
  const headPath = buildOffsetRectPath(headX, row2Y, headTailWalls.widthMm, headTailWalls.heightMm);
  const tailPath = buildOffsetRectPath(tailX, row2Y, headTailWalls.widthMm, headTailWalls.heightMm);

  const side1Grain = buildLocalGrainArrow('side-wall', sideWalls.widthMm, sideWalls.heightMm, 'right');
  const spineGrain = buildLocalGrainArrow('spine-wall', spineWall.widthMm, spineWall.heightMm);
  const side2Grain = buildLocalGrainArrow('side-wall', sideWalls.widthMm, sideWalls.heightMm, 'left');
  const capGrain = buildLocalGrainArrow('cap-wall', headTailWalls.widthMm, headTailWalls.heightMm);

  const grainGuides = [
    renderSvgArrow(side1Grain, side1X, row1Y, 'Side Wall 1 Grain'),
    renderSvgArrow(spineGrain, spineX, spineY, 'Spine Wall Grain'),
    renderSvgArrow(side2Grain, side2X, row1Y, 'Side Wall 2 Grain'),
    renderSvgArrow(capGrain, headX, row2Y, 'Head Wall Grain'),
    renderSvgArrow(capGrain, tailX, row2Y, 'Tail Wall Grain'),
  ].join('\n    ');

  const sideDim = fmtDim(sideWalls.widthMm, sideWalls.heightMm);
  const spineDim = fmtDim(spineWall.widthMm, spineWall.heightMm);
  const capDim = fmtDim(headTailWalls.widthMm, headTailWalls.heightMm);
  const outerDim = `${roundTo(slipcase.outerWidthMm, 1)} × ${roundTo(slipcase.outerHeightMm, 1)} × ${roundTo(slipcase.outerThicknessMm, 1)} mm`;
  const notchNote = r > 0 ? `Thumb Notch R = ${roundTo(r, 1)} mm` : 'No Thumb Notch';

  const side1Cx = side1X + sideWalls.widthMm / 2;
  const side1Cy = row1Y + sideWalls.heightMm / 2;
  const spineCx = spineX + spineWall.widthMm / 2;
  const spineCy = spineY + spineWall.heightMm / 2;
  const side2Cx = side2X + sideWalls.widthMm / 2;
  const side2Cy = row1Y + sideWalls.heightMm / 2;
  const headCx = headX + headTailWalls.widthMm / 2;
  const headCy = row2Y + headTailWalls.heightMm / 2;
  const tailCx = tailX + headTailWalls.widthMm / 2;
  const tailCy = row2Y + headTailWalls.heightMm / 2;

  const headerTextX = SVG_PAD_MM + CALIBRATION_SIZE_MM + 8;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(totalW)}mm"
     height="${fmtMm(totalH)}mm"
     viewBox="0 0 ${fmtMm(totalW)} ${fmtMm(totalH)}">
  <title>Matching Slipcase Box — 5-Piece Chipboard Cut Template (${escapeXml(outerDim)})</title>
  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.4">
    <path d="${side1Path}" data-label="Front Side Wall" />
    <path d="${spinePath}" data-label="Spine Wall (Closed Back)" />
    <path d="${side2Path}" data-label="Back Side Wall" />
    <path d="${headPath}" data-label="Head Wall (Top Cap)" />
    <path d="${tailPath}" data-label="Tail Wall (Bottom Cap)" />
  </g>
  <g id="grain-guides" fill="none" stroke="#2D6AA8" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round">
    ${grainGuides}
  </g>
  <g id="dimensions-notes" font-family="sans-serif" fill="#222222">
    <rect x="${fmtMm(SVG_PAD_MM)}" y="${fmtMm(SVG_PAD_MM)}" width="50" height="50" fill="none" stroke="#222222" stroke-width="0.5" data-label="50x50mm Calibration Square" />
    <line x1="${fmtMm(SVG_PAD_MM + 21)}" y1="${fmtMm(SVG_PAD_MM + 25)}" x2="${fmtMm(SVG_PAD_MM + 29)}" y2="${fmtMm(SVG_PAD_MM + 25)}" stroke="#666666" stroke-width="0.3" />
    <line x1="${fmtMm(SVG_PAD_MM + 25)}" y1="${fmtMm(SVG_PAD_MM + 21)}" x2="${fmtMm(SVG_PAD_MM + 25)}" y2="${fmtMm(SVG_PAD_MM + 29)}" stroke="#666666" stroke-width="0.3" />
    <text x="${fmtMm(SVG_PAD_MM + 25)}" y="${fmtMm(SVG_PAD_MM + 19)}" font-size="4.4" font-weight="600" text-anchor="middle">50 × 50 mm</text>
    <text x="${fmtMm(SVG_PAD_MM + 25)}" y="${fmtMm(SVG_PAD_MM + 35)}" font-size="3.4" fill="#555555" text-anchor="middle">50 mm Scale Check</text>
    <text x="${fmtMm(headerTextX)}" y="${fmtMm(SVG_PAD_MM + 10)}" font-size="5.4" font-weight="700">MATCHING SLIPCASE — 5-PIECE CHIPBOARD CUT TEMPLATE</text>
    <text x="${fmtMm(headerTextX)}" y="${fmtMm(SVG_PAD_MM + 18)}" font-size="3.8" fill="#444444">Wall Chipboard: ${fmtMm(options.wallBoardThicknessMm, 1)} mm • Slide Clearance: ${fmtMm(options.slideClearanceMm, 1)} mm • ${escapeXml(notchNote)}</text>
    <text x="${fmtMm(headerTextX)}" y="${fmtMm(SVG_PAD_MM + 25)}" font-size="3.8" fill="#444444">Finished Box Exterior: ${escapeXml(outerDim)}</text>
    <text x="${fmtMm(headerTextX)}" y="${fmtMm(SVG_PAD_MM + 33)}" font-size="3.8" font-weight="600" fill="#222222">Outer Wrap Strips (Turn-In ${fmtMm(options.wrapTurnInMm, 1)} mm): Main (×1) ${escapeXml(fmtDim(mainWrapStrip.widthMm, mainWrapStrip.heightMm))} • Head/Tail Caps (×2) ${escapeXml(fmtDim(capWrapStrip.widthMm, capWrapStrip.heightMm))}</text>
    <text x="${fmtMm(headerTextX)}" y="${fmtMm(SVG_PAD_MM + 41)}" font-size="3.5" fill="#555555">Red Solid = Cut Chipboard • Blue Arrows = Board Grain Direction • Glue caps flush to spine wall, then sandwich with side walls</text>
    <text x="${fmtMm(side1Cx)}" y="${fmtMm(side1Cy - 5)}" font-size="5.2" font-weight="600" text-anchor="middle">SIDE WALL 1 (FRONT)</text>
    <text x="${fmtMm(side1Cx)}" y="${fmtMm(side1Cy + 2)}" font-size="4.2" text-anchor="middle">${escapeXml(sideDim)}</text>
    <text x="${fmtMm(side1Cx)}" y="${fmtMm(side1Cy + 9)}" font-size="3.4" fill="#2D6AA8" text-anchor="middle">OPEN FORE-EDGE: RIGHT</text>
    <text x="${fmtMm(spineCx)}" y="${fmtMm(spineCy)}" font-size="4" font-weight="600" text-anchor="middle" transform="rotate(-90 ${fmtMm(spineCx)} ${fmtMm(spineCy)})">SPINE WALL ${escapeXml(spineDim)}</text>
    <text x="${fmtMm(side2Cx)}" y="${fmtMm(side2Cy - 5)}" font-size="5.2" font-weight="600" text-anchor="middle">SIDE WALL 2 (BACK)</text>
    <text x="${fmtMm(side2Cx)}" y="${fmtMm(side2Cy + 2)}" font-size="4.2" text-anchor="middle">${escapeXml(sideDim)}</text>
    <text x="${fmtMm(side2Cx)}" y="${fmtMm(side2Cy + 9)}" font-size="3.4" fill="#2D6AA8" text-anchor="middle">OPEN FORE-EDGE: LEFT</text>
    <text x="${fmtMm(headCx)}" y="${fmtMm(headCy - 2)}" font-size="4.4" font-weight="600" text-anchor="middle">HEAD WALL (TOP CAP)</text>
    <text x="${fmtMm(headCx)}" y="${fmtMm(headCy + 4.5)}" font-size="3.8" text-anchor="middle">${escapeXml(capDim)}</text>
    <text x="${fmtMm(tailCx)}" y="${fmtMm(tailCy - 2)}" font-size="4.4" font-weight="600" text-anchor="middle">TAIL WALL (BOTTOM CAP)</text>
    <text x="${fmtMm(tailCx)}" y="${fmtMm(tailCy + 4.5)}" font-size="3.8" text-anchor="middle">${escapeXml(capDim)}</text>
  </g>
</svg>
`;
}

// ---------------------------------------------------------------------------
// 1:1 mm Paginated PDF Exporter
// ---------------------------------------------------------------------------

interface PackableSlipcaseItem {
  readonly kind: SlipcasePieceKind;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly allowRotate: boolean;
}

interface Shelf {
  yMm: number;
  heightMm: number;
  cursorXMm: number;
}

interface PageBin {
  shelves: Shelf[];
}

function tryPlaceInPage(
  bin: PageBin,
  usableW: number,
  usableH: number,
  w: number,
  h: number,
): { xMm: number; yMm: number } | null {
  for (const shelf of bin.shelves) {
    const nextX = shelf.cursorXMm === 0 ? 0 : shelf.cursorXMm + PDF_GAP_MM;
    if (nextX + w <= usableW + 0.01 && h <= shelf.heightMm + 0.01) {
      shelf.cursorXMm = nextX + w;
      return { xMm: PDF_MARGIN_MM + nextX, yMm: PDF_MARGIN_MM + shelf.yMm };
    }
  }

  const nextShelfY =
    bin.shelves.length === 0
      ? 0
      : bin.shelves[bin.shelves.length - 1].yMm +
        bin.shelves[bin.shelves.length - 1].heightMm +
        PDF_GAP_MM;

  if (w <= usableW + 0.01 && nextShelfY + h <= usableH + 0.01) {
    bin.shelves.push({ yMm: nextShelfY, heightMm: h, cursorXMm: w });
    return { xMm: PDF_MARGIN_MM, yMm: PDF_MARGIN_MM + nextShelfY };
  }

  return null;
}

/**
 * Plans shelf-packed pagination for the Page 1 scale-check/assembly header plus all 5
 * slipcase chipboard panels across standard desktop sheets, rotating panels 90° when needed.
 */
export function planSlipcasePdfLayout(
  slipcase: SlipcaseGeometry,
  pageSizeId: PageSizeId,
): SlipcasePdfLayoutPlan {
  const sheet = getPageSizeSpec(pageSizeId);
  const usableW = sheet.widthMm - PDF_MARGIN_MM * 2;
  const usableH = sheet.heightMm - PDF_MARGIN_MM * 2;

  const items: PackableSlipcaseItem[] = [
    {
      kind: 'info-calibration',
      widthMm: usableW,
      heightMm: PDF_HEADER_H_MM,
      allowRotate: false,
    },
    {
      kind: 'side-wall-front',
      widthMm: slipcase.sideWalls.widthMm,
      heightMm: slipcase.sideWalls.heightMm,
      allowRotate: true,
    },
    {
      kind: 'side-wall-back',
      widthMm: slipcase.sideWalls.widthMm,
      heightMm: slipcase.sideWalls.heightMm,
      allowRotate: true,
    },
    {
      kind: 'spine-wall',
      widthMm: slipcase.spineWall.widthMm,
      heightMm: slipcase.spineWall.heightMm,
      allowRotate: true,
    },
    {
      kind: 'head-wall',
      widthMm: slipcase.headTailWalls.widthMm,
      heightMm: slipcase.headTailWalls.heightMm,
      allowRotate: true,
    },
    {
      kind: 'tail-wall',
      widthMm: slipcase.headTailWalls.widthMm,
      heightMm: slipcase.headTailWalls.heightMm,
      allowRotate: true,
    },
  ];

  const bins: PageBin[] = [{ shelves: [] }];
  const placements: SlipcasePdfPlacement[] = [];

  for (const item of items) {
    const orientations: { w: number; h: number; rotated90: boolean }[] = [
      { w: item.widthMm, h: item.heightMm, rotated90: false },
    ];
    if (item.allowRotate) {
      orientations.push({ w: item.heightMm, h: item.widthMm, rotated90: true });
    }

    let placed = false;

    for (let pageIndex = 0; pageIndex < bins.length && !placed; pageIndex++) {
      for (const orient of orientations) {
        const pos = tryPlaceInPage(bins[pageIndex], usableW, usableH, orient.w, orient.h);
        if (pos) {
          placements.push({
            kind: item.kind,
            pageIndex,
            xMm: pos.xMm,
            yMm: pos.yMm,
            widthMm: orient.w,
            heightMm: orient.h,
            originalWidthMm: item.widthMm,
            originalHeightMm: item.heightMm,
            rotated90: orient.rotated90,
            clipped: false,
          });
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      const newPageIndex = bins.length;
      const newBin: PageBin = { shelves: [] };
      bins.push(newBin);

      for (const orient of orientations) {
        const pos = tryPlaceInPage(newBin, usableW, usableH, orient.w, orient.h);
        if (pos) {
          placements.push({
            kind: item.kind,
            pageIndex: newPageIndex,
            xMm: pos.xMm,
            yMm: pos.yMm,
            widthMm: orient.w,
            heightMm: orient.h,
            originalWidthMm: item.widthMm,
            originalHeightMm: item.heightMm,
            rotated90: orient.rotated90,
            clipped: false,
          });
          placed = true;
          break;
        }
      }

      if (!placed) {
        const bestOrient =
          item.allowRotate && item.heightMm < item.widthMm
            ? { w: item.heightMm, h: item.widthMm, rotated90: true }
            : { w: item.widthMm, h: item.heightMm, rotated90: false };
        placements.push({
          kind: item.kind,
          pageIndex: newPageIndex,
          xMm: PDF_MARGIN_MM,
          yMm: PDF_MARGIN_MM,
          widthMm: bestOrient.w,
          heightMm: bestOrient.h,
          originalWidthMm: item.widthMm,
          originalHeightMm: item.heightMm,
          rotated90: bestOrient.rotated90,
          clipped: true,
        });
      }
    }
  }

  return {
    pageSizeId,
    pageWidthMm: sheet.widthMm,
    pageHeightMm: sheet.heightMm,
    pageCount: bins.length,
    placements,
  };
}

class SlipcasePdfWriter {
  private readonly page: PDFPage;
  private readonly pageHeightMm: number;

  constructor(page: PDFPage, pageHeightMm: number) {
    this.page = page;
    this.pageHeightMm = pageHeightMm;
  }

  private toPdfPoint(pt: Point2D): { x: number; y: number } {
    return {
      x: UnitConverter.mmToPoints(pt.x),
      y: UnitConverter.mmToPoints(this.pageHeightMm - pt.y),
    };
  }

  drawLine(
    a: Point2D,
    b: Point2D,
    options: {
      color: ReturnType<typeof rgb>;
      thicknessPt?: number;
      dashArray?: number[];
    },
  ): void {
    this.page.drawLine({
      start: this.toPdfPoint(a),
      end: this.toPdfPoint(b),
      color: options.color,
      thickness: options.thicknessPt ?? 0.9,
      dashArray: options.dashArray,
    });
  }

  drawPolygonOutline(
    polygon: Polygon2D,
    options: {
      color: ReturnType<typeof rgb>;
      thicknessPt?: number;
    },
  ): void {
    for (let i = 0; i < polygon.length; i++) {
      const curr = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      this.drawLine(curr, next, options);
    }
  }

  drawRect(
    xMm: number,
    yMm: number,
    widthMm: number,
    heightMm: number,
    options: {
      borderColor?: ReturnType<typeof rgb>;
      borderWidthPt?: number;
      fillColor?: ReturnType<typeof rgb>;
    },
  ): void {
    this.page.drawRectangle({
      x: UnitConverter.mmToPoints(xMm),
      y: UnitConverter.mmToPoints(this.pageHeightMm - (yMm + heightMm)),
      width: UnitConverter.mmToPoints(widthMm),
      height: UnitConverter.mmToPoints(heightMm),
      borderColor: options.borderColor,
      borderWidth: options.borderWidthPt ?? 0,
      color: options.fillColor,
    });
  }

  drawText(
    text: string,
    xMm: number,
    yMm: number,
    font: PDFFont,
    sizePt: number,
    color = rgb(0.14, 0.14, 0.14),
  ): void {
    this.page.drawText(text, {
      x: UnitConverter.mmToPoints(xMm),
      y: UnitConverter.mmToPoints(this.pageHeightMm - yMm),
      font,
      size: sizePt,
      color,
    });
  }

  drawCenteredText(
    text: string,
    cxMm: number,
    cyMm: number,
    font: PDFFont,
    sizePt: number,
    color = rgb(0.14, 0.14, 0.14),
    vertical = false,
  ): void {
    const textWidthMm = UnitConverter.pointsToMm(font.widthOfTextAtSize(text, sizePt));
    const ascentMm = UnitConverter.pointsToMm(sizePt * 0.7);
    if (vertical) {
      this.page.drawText(text, {
        x: UnitConverter.mmToPoints(cxMm + ascentMm / 2),
        y: UnitConverter.mmToPoints(this.pageHeightMm - (cyMm + textWidthMm / 2)),
        font,
        size: sizePt,
        color,
        rotate: degrees(90),
      });
      return;
    }

    this.page.drawText(text, {
      x: UnitConverter.mmToPoints(cxMm - textWidthMm / 2),
      y: UnitConverter.mmToPoints(this.pageHeightMm - (cyMm + ascentMm / 2)),
      font,
      size: sizePt,
      color,
    });
  }
}

function transformPoint(pt: Point2D, placement: SlipcasePdfPlacement): Point2D {
  const rotated = placement.rotated90
    ? GeometryPrimitives.rotatePoint90CW(pt, placement.originalHeightMm)
    : pt;
  return GeometryPrimitives.translatePoint(rotated, placement.xMm, placement.yMm);
}

function transformPolygon(poly: Polygon2D, placement: SlipcasePdfPlacement): Polygon2D {
  return poly.map((pt) => transformPoint(pt, placement));
}

function renderGrainArrowPdf(
  writer: SlipcasePdfWriter,
  arrow: GrainArrowSegment,
  placement: SlipcasePdfPlacement,
): void {
  const grainColor = rgb(0.18, 0.42, 0.66);
  const t = (pt: Point2D) => transformPoint(pt, placement);
  const a = t(arrow.a);
  const b = t(arrow.b);
  writer.drawLine(a, b, { color: grainColor, thicknessPt: 0.75 });
  writer.drawLine(t(arrow.headA1), a, { color: grainColor, thicknessPt: 0.75 });
  writer.drawLine(t(arrow.headA2), a, { color: grainColor, thicknessPt: 0.75 });
  writer.drawLine(t(arrow.headB1), b, { color: grainColor, thicknessPt: 0.75 });
  writer.drawLine(t(arrow.headB2), b, { color: grainColor, thicknessPt: 0.75 });
}

function renderInfoAndCalibrationPdf(
  writer: SlipcasePdfWriter,
  placement: SlipcasePdfPlacement,
  slipcase: SlipcaseGeometry,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const x = placement.xMm;
  const y = placement.yMm;
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.36, 0.36, 0.36);
  const vermilion = rgb(0.84, 0.24, 0.14);

  // Exact 50.0 × 50.0 mm Scale Check Square
  const sqY = y + 2;
  writer.drawRect(x, sqY, CALIBRATION_SIZE_MM, CALIBRATION_SIZE_MM, {
    borderColor: dark,
    borderWidthPt: 1.0,
  });
  const midX = x + CALIBRATION_SIZE_MM / 2;
  const midY = sqY + CALIBRATION_SIZE_MM / 2;
  writer.drawLine({ x: midX - 4, y: midY }, { x: midX + 4, y: midY }, { color: muted, thicknessPt: 0.5 });
  writer.drawLine({ x: midX, y: midY - 4 }, { x: midX, y: midY + 4 }, { color: muted, thicknessPt: 0.5 });
  writer.drawCenteredText('50.0 × 50.0 mm', midX, sqY + 15, boldFont, 7.8, dark);
  writer.drawCenteredText('50 mm Scale Check', midX, sqY + 36, font, 6.8, muted);

  // Right-side specs, outer wrap cut list, and concise DAS flush-stacking assembly notes
  const tx = x + CALIBRATION_SIZE_MM + 6;
  const { options, mainWrapStrip, capWrapStrip } = slipcase;
  const outerDim = `${roundTo(slipcase.outerWidthMm, 1)} × ${roundTo(slipcase.outerHeightMm, 1)} × ${roundTo(slipcase.outerThicknessMm, 1)} mm`;
  const notchNote =
    slipcase.effectiveThumbNotchRadiusMm > 0
      ? `Thumb Notch R ${roundTo(slipcase.effectiveThumbNotchRadiusMm, 1)} mm`
      : 'No Thumb Notch';

  writer.drawText('MATCHING SLIPCASE — 5-PIECE BOARD CUT TEMPLATE', tx, y + 6, boldFont, 8.6, dark);
  writer.drawText(
    `Board: ${roundTo(options.wallBoardThicknessMm, 1)} mm • Slide Ease: ${roundTo(options.slideClearanceMm, 1)} mm • ${notchNote}`,
    tx,
    y + 12.5,
    font,
    7.0,
    muted,
  );
  writer.drawText(`Finished Box Exterior: ${outerDim}`, tx, y + 18, font, 7.0, dark);

  writer.drawText('OUTER WRAP STRIPS (CLOTH / COVER PAPER)', tx, y + 25.5, boldFont, 7.2, vermilion);
  writer.drawText(
    `Main Wrap (×1, Side + Spine + Side): ${fmtDim(mainWrapStrip.widthMm, mainWrapStrip.heightMm)}`,
    tx,
    y + 31,
    font,
    6.9,
    dark,
  );
  writer.drawText(
    `Head & Tail Cap Strips (×2): ${fmtDim(capWrapStrip.widthMm, capWrapStrip.heightMm)} (Turn-In ${roundTo(options.wrapTurnInMm, 1)} mm)`,
    tx,
    y + 36.2,
    font,
    6.9,
    dark,
  );

  writer.drawText('FLUSH-STACKING ASSEMBLY', tx, y + 43.2, boldFont, 7.0, dark);
  writer.drawText(
    '1. Cut 5 chipboard panels along solid vermilion lines (match blue grain arrows).',
    tx,
    y + 48.2,
    font,
    6.5,
    muted,
  );
  writer.drawText(
    '2. Glue Head & Tail caps flush to Spine wall; glue Side walls flush outside.',
    tx,
    y + 52.8,
    font,
    6.5,
    muted,
  );
}

function renderPanelPdf(
  writer: SlipcasePdfWriter,
  placement: SlipcasePdfPlacement,
  slipcase: SlipcaseGeometry,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const vermilion = rgb(0.84, 0.24, 0.14);
  const dark = rgb(0.14, 0.14, 0.14);
  const muted = rgb(0.36, 0.36, 0.36);
  const grainBlue = rgb(0.18, 0.42, 0.66);

  let localPoly: Polygon2D;
  let role: SlipcasePanelRole;
  let openSide: 'left' | 'right' | undefined;
  let title: string;
  let subtitle: string;

  switch (placement.kind) {
    case 'side-wall-front':
      role = 'side-wall';
      openSide = 'right';
      localPoly = buildThumbNotchSideWallPolyline(
        slipcase.sideWalls.widthMm,
        slipcase.sideWalls.heightMm,
        slipcase.effectiveThumbNotchRadiusMm,
        'right',
      );
      title = 'SIDE WALL 1 (FRONT)';
      subtitle = fmtDim(slipcase.sideWalls.widthMm, slipcase.sideWalls.heightMm);
      break;
    case 'side-wall-back':
      role = 'side-wall';
      openSide = 'left';
      localPoly = buildThumbNotchSideWallPolyline(
        slipcase.sideWalls.widthMm,
        slipcase.sideWalls.heightMm,
        slipcase.effectiveThumbNotchRadiusMm,
        'left',
      );
      title = 'SIDE WALL 2 (BACK)';
      subtitle = fmtDim(slipcase.sideWalls.widthMm, slipcase.sideWalls.heightMm);
      break;
    case 'spine-wall':
      role = 'spine-wall';
      localPoly = slipcase.spineWall.cutPolylinePoints;
      title = 'SPINE WALL';
      subtitle = fmtDim(slipcase.spineWall.widthMm, slipcase.spineWall.heightMm);
      break;
    case 'head-wall':
      role = 'cap-wall';
      localPoly = slipcase.headTailWalls.cutPolylinePoints;
      title = 'HEAD WALL (TOP)';
      subtitle = fmtDim(slipcase.headTailWalls.widthMm, slipcase.headTailWalls.heightMm);
      break;
    case 'tail-wall':
      role = 'cap-wall';
      localPoly = slipcase.headTailWalls.cutPolylinePoints;
      title = 'TAIL WALL (BOTTOM)';
      subtitle = fmtDim(slipcase.headTailWalls.widthMm, slipcase.headTailWalls.heightMm);
      break;
    default:
      return;
  }

  // Solid vermilion cut outline
  const transformedCut = transformPolygon(localPoly, placement);
  writer.drawPolygonOutline(transformedCut, { color: vermilion, thicknessPt: 1.0 });

  // Grain direction arrow
  const localArrow = buildLocalGrainArrow(
    role,
    placement.originalWidthMm,
    placement.originalHeightMm,
    openSide,
  );
  renderGrainArrowPdf(writer, localArrow, placement);

  // Panel center labels (auto-oriented vertically on tall narrow panels)
  const cx = placement.xMm + placement.widthMm / 2;
  const cy = placement.yMm + placement.heightMm / 2;
  const useVerticalText = placement.widthMm < 52 && placement.heightMm > placement.widthMm * 1.5;

  if (useVerticalText) {
    const titleSize = placement.widthMm < 20 ? 6.2 : 7.5;
    const subSize = placement.widthMm < 20 ? 5.8 : 6.8;
    const lineGap = placement.widthMm < 20 ? 3.2 : 4.2;
    writer.drawCenteredText(title, cx - lineGap / 2, cy, boldFont, titleSize, dark, true);
    writer.drawCenteredText(subtitle, cx + lineGap / 2, cy, font, subSize, muted, true);
    return;
  }

  const compact = placement.heightMm < 24;
  const titleSize = compact ? 6.8 : 8.4;
  const subSize = compact ? 6.2 : 7.4;
  const offset = compact ? 2.6 : 4.2;

  writer.drawCenteredText(title, cx, cy - offset, boldFont, titleSize, dark);
  writer.drawCenteredText(subtitle, cx, cy + offset, font, subSize, muted);

  if (role === 'side-wall' && placement.heightMm >= 50) {
    const openLabel = placement.rotated90
      ? openSide === 'right'
        ? 'OPEN FORE-EDGE: BOTTOM'
        : 'OPEN FORE-EDGE: TOP'
      : openSide === 'right'
        ? 'OPEN FORE-EDGE: RIGHT'
        : 'OPEN FORE-EDGE: LEFT';
    writer.drawCenteredText(openLabel, cx, cy + offset + 6, font, 6.6, grainBlue);
  }
}

/**
 * Generates an exact 1:1 physical millimeter PDF cutting template for all 5 slipcase
 * chipboard panels paginated cleanly across the chosen desktop paper sheet.
 */
export async function generateSlipcasePdf(
  slipcase: SlipcaseGeometry,
  pageSizeId: PageSizeId,
): Promise<{ readonly bytes: Uint8Array; readonly pageCount: number }> {
  const plan = planSlipcasePdfLayout(slipcase, pageSizeId);
  const sheet = getPageSizeSpec(pageSizeId);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bookbinder — Matching Slipcase Cut Templates');
  pdfDoc.setCreator('Bookbinder Studio');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidthPt = UnitConverter.mmToPoints(plan.pageWidthMm);
  const pageHeightPt = UnitConverter.mmToPoints(plan.pageHeightMm);

  const pages: PDFPage[] = [];
  for (let i = 0; i < plan.pageCount; i++) {
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    pages.push(page);
    const footer = `Page ${i + 1} of ${plan.pageCount} • ${sheet.label} • Matching Slipcase Cut Templates`;
    page.drawText(footer, {
      x: UnitConverter.mmToPoints(PDF_MARGIN_MM),
      y: UnitConverter.mmToPoints(3.8),
      size: 6.5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  for (const placement of plan.placements) {
    const page = pages[placement.pageIndex];
    const writer = new SlipcasePdfWriter(page, plan.pageHeightMm);
    if (placement.kind === 'info-calibration') {
      renderInfoAndCalibrationPdf(writer, placement, slipcase, font, boldFont);
    } else {
      renderPanelPdf(writer, placement, slipcase, font, boldFont);
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, pageCount: plan.pageCount };
}
