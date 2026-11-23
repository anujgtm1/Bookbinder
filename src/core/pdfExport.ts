import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { PAGE_SIZES, type PageSizeId, type SplitMode } from '@/types/bookParams';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type LineSegment2D,
  type PocketEnvelopeGeometry,
  type Point2D,
  type Polygon2D,
  type SpineLinerGeometry,
} from '@/types/geometry';
import { UnitConverter, roundTo } from '@/types/units';

const PAGE_MARGIN_MM = 7.5;
const PIECE_GAP_MM = 5.0;
const CALIBRATION_SIZE_MM = 50.0;
const CALIBRATION_BOX_H_MM = 84.0; // 50mm square + compact title & legend
const CALIBRATION_BOX_W_MM = 62.0;

export type InnerPieceKind = 'back-pocket' | 'front-pocket' | 'spine-liner' | 'calibration-legend';

export interface PlannedPlacement {
  readonly kind: InnerPieceKind;
  readonly pageIndex: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
  readonly clipped: boolean;
}

export interface InnerPdfLayoutPlan {
  readonly pageSizeId: PageSizeId;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly pageCount: number;
  readonly placements: readonly PlannedPlacement[];
}

interface PackableItem {
  readonly kind: InnerPieceKind;
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
    const nextX = shelf.cursorXMm === 0 ? 0 : shelf.cursorXMm + PIECE_GAP_MM;
    if (nextX + w <= usableW + 0.01 && h <= shelf.heightMm + 0.01) {
      shelf.cursorXMm = nextX + w;
      return { xMm: PAGE_MARGIN_MM + nextX, yMm: PAGE_MARGIN_MM + shelf.yMm };
    }
  }

  const nextShelfY =
    bin.shelves.length === 0
      ? 0
      : bin.shelves[bin.shelves.length - 1].yMm +
        bin.shelves[bin.shelves.length - 1].heightMm +
        PIECE_GAP_MM;

  if (w <= usableW + 0.01 && nextShelfY + h <= usableH + 0.01) {
    bin.shelves.push({ yMm: nextShelfY, heightMm: h, cursorXMm: w });
    return { xMm: PAGE_MARGIN_MM, yMm: PAGE_MARGIN_MM + nextShelfY };
  }

  return null;
}

function packOrderedItems(
  items: readonly PackableItem[],
  usableW: number,
  usableH: number,
): { pageCount: number; placements: PlannedPlacement[] } {
  const bins: PageBin[] = [{ shelves: [] }];
  const placements: PlannedPlacement[] = [];

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
          xMm: PAGE_MARGIN_MM,
          yMm: PAGE_MARGIN_MM,
          widthMm: bestOrient.w,
          heightMm: bestOrient.h,
          rotated90: bestOrient.rotated90,
          clipped: true,
        });
      }
    }
  }

  return { pageCount: bins.length, placements };
}

export interface InnerPdfLayoutOptions {
  /** Include the 50×50 mm scale verification square & cut/score visual legend block. Defaults to false for tighter sheet packing. */
  readonly includeLegend?: boolean;
}

export function planInnerTemplateLayout(
  geometry: CaseGeometry,
  pageSizeId: PageSizeId,
  options?: InnerPdfLayoutOptions,
): InnerPdfLayoutPlan {
  const includeLegend = options?.includeLegend ?? false;
  const sheet = PAGE_SIZES[pageSizeId];
  const usableW = sheet.widthMm - PAGE_MARGIN_MM * 2;
  const usableH = sheet.heightMm - PAGE_MARGIN_MM * 2;

  const backPocket: PackableItem = {
    kind: 'back-pocket',
    widthMm: geometry.backPocket.totalWidthMm,
    heightMm: geometry.backPocket.totalHeightMm,
    allowRotate: true,
  };
  const frontPocket: PackableItem = {
    kind: 'front-pocket',
    widthMm: geometry.frontPocket.totalWidthMm,
    heightMm: geometry.frontPocket.totalHeightMm,
    allowRotate: true,
  };
  const spineLiner: PackableItem = {
    kind: 'spine-liner',
    widthMm: geometry.spineLiner.widthMm,
    heightMm: geometry.spineLiner.heightMm,
    allowRotate: true,
  };

  if (!includeLegend) {
    const packed = packOrderedItems([backPocket, frontPocket, spineLiner], usableW, usableH);
    return {
      pageSizeId,
      pageWidthMm: sheet.widthMm,
      pageHeightMm: sheet.heightMm,
      pageCount: packed.pageCount,
      placements: packed.placements,
    };
  }

  const calibration: PackableItem = {
    kind: 'calibration-legend',
    widthMm: CALIBRATION_BOX_W_MM,
    heightMm: CALIBRATION_BOX_H_MM,
    allowRotate: false,
  };

  // Candidate A: pack largest templates first (optimizes 1-page Tabloid packing)
  const candidateA = packOrderedItems(
    [backPocket, frontPocket, spineLiner, calibration],
    usableW,
    usableH,
  );
  // Candidate B: guarantee calibration square stays on Page 1 alongside back pocket
  const candidateB = packOrderedItems(
    [backPocket, calibration, frontPocket, spineLiner],
    usableW,
    usableH,
  );

  const aCalOnPage1 =
    candidateA.placements.find((p) => p.kind === 'calibration-legend')?.pageIndex === 0;
  const chosen =
    aCalOnPage1 && candidateA.pageCount <= candidateB.pageCount ? candidateA : candidateB;

  return {
    pageSizeId,
    pageWidthMm: sheet.widthMm,
    pageHeightMm: sheet.heightMm,
    pageCount: chosen.pageCount,
    placements: chosen.placements,
  };
}

class PdfMmWriter {
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
      thickness: options.thicknessPt ?? 0.8,
      dashArray: options.dashArray,
    });
  }

  drawPolygonOutline(
    polygon: Polygon2D,
    options: {
      color: ReturnType<typeof rgb>;
      thicknessPt?: number;
      dashArray?: number[];
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
      opacity?: number;
      dashArray?: number[];
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
      opacity: options.opacity,
      borderDashArray: options.dashArray,
    });
  }

  drawText(
    text: string,
    xMm: number,
    yMm: number,
    font: PDFFont,
    sizePt: number,
    color = rgb(0.15, 0.15, 0.15),
  ): void {
    this.page.drawText(text, {
      x: UnitConverter.mmToPoints(xMm),
      y: UnitConverter.mmToPoints(this.pageHeightMm - yMm),
      font,
      size: sizePt,
      color,
    });
  }

  drawHatchedPolygon(polygon: Polygon2D): void {
    const bbox = GeometryPrimitives.boundingBox(polygon);
    // Light shading fill via bounding rect approximation + crisp diagonal hatch strokes
    const hatchStepMm = 3.5;
    const hatchColor = rgb(0.75, 0.68, 0.58);
    for (let d = -bbox.height; d <= bbox.width + bbox.height; d += hatchStepMm) {
      const p1 = { x: bbox.x + d, y: bbox.y };
      const p2 = { x: bbox.x + d - bbox.height, y: bbox.y + bbox.height };
      const clipped = clipSegmentToConvexPolygon(p1, p2, polygon);
      if (clipped) {
        this.drawLine(clipped[0], clipped[1], { color: hatchColor, thicknessPt: 0.45 });
      }
    }
  }
}

/** Clips a 2D line segment against a clockwise convex polygon (Cyrus-Beck). */
function clipSegmentToConvexPolygon(
  p0: Point2D,
  p1: Point2D,
  polygon: Polygon2D,
): [Point2D, Point2D] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  // Determine winding so outward normals work regardless of CW/CCW input
  let signedArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    signedArea += a.x * b.y - b.x * a.y;
  }
  const windingSign = signedArea >= 0 ? 1 : -1;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    // Inward normal
    const nx = -ey * windingSign;
    const ny = ex * windingSign;

    const num = nx * (p0.x - a.x) + ny * (p0.y - a.y);
    const den = nx * dx + ny * dy;

    if (Math.abs(den) < 1e-9) {
      if (num < 0) return null;
      continue;
    }

    const t = -num / den;
    if (den > 0) {
      if (t > t0) t0 = t;
    } else if (t < t1) {
      t1 = t;
    }

    if (t0 > t1) return null;
  }

  return [
    { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
    { x: p0.x + t1 * dx, y: p0.y + t1 * dy },
  ];
}

function transformPoint(
  pt: Point2D,
  placement: PlannedPlacement,
  originalHeightMm: number,
): Point2D {
  const rotated = placement.rotated90
    ? GeometryPrimitives.rotatePoint90CW(pt, originalHeightMm)
    : pt;
  return GeometryPrimitives.translatePoint(rotated, placement.xMm, placement.yMm);
}

function transformPolygon(
  poly: Polygon2D,
  placement: PlannedPlacement,
  originalHeightMm: number,
): Polygon2D {
  return poly.map((pt) => transformPoint(pt, placement, originalHeightMm));
}

function transformLine(
  line: LineSegment2D,
  placement: PlannedPlacement,
  originalHeightMm: number,
): { a: Point2D; b: Point2D } {
  return {
    a: transformPoint({ x: line.x1, y: line.y1 }, placement, originalHeightMm),
    b: transformPoint({ x: line.x2, y: line.y2 }, placement, originalHeightMm),
  };
}

function renderPocket(
  writer: PdfMmWriter,
  pocket: PocketEnvelopeGeometry,
  placement: PlannedPlacement,
  font: PDFFont,
  boldFont: PDFFont,
  showInteriorLabels = true,
): void {
  const cutColor = rgb(0.85, 0.1, 0.1);
  const scoreColor = rgb(0.05, 0.35, 0.85);

  for (const flap of pocket.glueFlapPolygons) {
    const transformedFlap = transformPolygon(flap, placement, pocket.totalHeightMm);
    writer.drawHatchedPolygon(transformedFlap);
  }

  const cutPoly = transformPolygon(pocket.outerCutPolygon, placement, pocket.totalHeightMm);
  writer.drawPolygonOutline(cutPoly, { color: cutColor, thicknessPt: 0.9 });

  for (const score of pocket.scoreLines) {
    const { a, b } = transformLine(score, placement, pocket.totalHeightMm);
    writer.drawLine(a, b, { color: scoreColor, thicknessPt: 0.75, dashArray: [4, 3] });
  }

  if (!showInteriorLabels) return;

  const centerLocal = GeometryPrimitives.rectCenter(pocket.faceRect);
  const center = transformPoint(centerLocal, placement, pocket.totalHeightMm);
  const dimLabel = `${roundTo(pocket.pocketWidthMm, 1)} × ${roundTo(pocket.pocketHeightMm, 1)} mm`;

  writer.drawText(pocket.label.toUpperCase(), center.x - 24, center.y - 4, boldFont, 8.5);
  writer.drawText(`Face: ${dimLabel}`, center.x - 24, center.y + 3, font, 7.5, rgb(0.3, 0.3, 0.3));
  writer.drawText(
    `Open edge: ${pocket.openEdge.toUpperCase()} (faces spine)`,
    center.x - 24,
    center.y + 9,
    font,
    6.8,
    scoreColor,
  );
  writer.drawText(
    'Shaded tabs = Apply Glue',
    center.x - 24,
    center.y + 15,
    font,
    6.5,
    rgb(0.45, 0.38, 0.3),
  );
}

function renderSpineLiner(
  writer: PdfMmWriter,
  liner: SpineLinerGeometry,
  placement: PlannedPlacement,
  font: PDFFont,
  boldFont: PDFFont,
  showInteriorLabels = true,
): void {
  const cutColor = rgb(0.85, 0.1, 0.1);
  const scoreColor = rgb(0.05, 0.35, 0.85);

  const outlineLocal: Polygon2D = [
    { x: 0, y: 0 },
    { x: liner.widthMm, y: 0 },
    { x: liner.widthMm, y: liner.heightMm },
    { x: 0, y: liner.heightMm },
  ];
  const cutPoly = transformPolygon(outlineLocal, placement, liner.heightMm);
  writer.drawPolygonOutline(cutPoly, { color: cutColor, thicknessPt: 0.9 });

  for (const score of liner.scoreLines) {
    const { a, b } = transformLine(score, placement, liner.heightMm);
    writer.drawLine(a, b, { color: scoreColor, thicknessPt: 0.75, dashArray: [4, 3] });
  }

  if (!showInteriorLabels) return;

  const center = transformPoint(
    { x: liner.widthMm / 2, y: liner.heightMm / 2 },
    placement,
    liner.heightMm,
  );
  const dimLabel = `${roundTo(liner.widthMm, 1)} × ${roundTo(liner.heightMm, 1)} mm`;
  writer.drawText('SPINE LINER', center.x - 16, center.y - 3, boldFont, 8);
  writer.drawText(dimLabel, center.x - 16, center.y + 3, font, 7, rgb(0.3, 0.3, 0.3));
  writer.drawText('15 mm board overlap/side', center.x - 18, center.y + 9, font, 6.2, scoreColor);
}

function renderCalibrationAndLegend(
  writer: PdfMmWriter,
  placement: PlannedPlacement,
  geometry: CaseGeometry,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const x = placement.xMm;
  const y = placement.yMm;
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.38, 0.38, 0.38);

  writer.drawText('BOOKBINDER STUDIO', x, y + 3, boldFont, 8.5, dark);
  writer.drawText('Inner Pockets & Spine Liner (1:1 mm)', x, y + 8, font, 6.8, muted);

  // Exact 50.0 mm x 50.0 mm Calibration Square
  const sqY = y + 12;
  writer.drawRect(x, sqY, CALIBRATION_SIZE_MM, CALIBRATION_SIZE_MM, {
    borderColor: dark,
    borderWidthPt: 1.0,
  });

  // 10mm internal crosshair ruler ticks
  const midX = x + CALIBRATION_SIZE_MM / 2;
  const midY = sqY + CALIBRATION_SIZE_MM / 2;
  writer.drawLine({ x: midX - 4, y: midY }, { x: midX + 4, y: midY }, { color: muted, thicknessPt: 0.5 });
  writer.drawLine({ x: midX, y: midY - 4 }, { x: midX, y: midY + 4 }, { color: muted, thicknessPt: 0.5 });

  writer.drawText('50.0 mm × 50.0 mm', x + 7, sqY + 18, boldFont, 8, dark);
  writer.drawText('Verify 50mm × 50mm', x + 5, sqY + 33, font, 6.8, dark);
  writer.drawText('Print at 100% / Actual Size', x + 3, sqY + 39, font, 6.5, muted);

  // Visual Legend
  const legY = sqY + CALIBRATION_SIZE_MM + 7;
  writer.drawText('LEGEND', x, legY, boldFont, 7.2, dark);

  writer.drawLine({ x, y: legY + 4 }, { x: x + 12, y: legY + 4 }, { color: rgb(0.85, 0.1, 0.1), thicknessPt: 0.9 });
  writer.drawText('Solid = Cut Line', x + 14, legY + 5, font, 6.6, dark);

  writer.drawLine(
    { x, y: legY + 9 },
    { x: x + 12, y: legY + 9 },
    { color: rgb(0.05, 0.35, 0.85), thicknessPt: 0.8, dashArray: [3, 2] },
  );
  writer.drawText('Dashed = Score & Fold', x + 14, legY + 10, font, 6.6, dark);

  writer.drawHatchedPolygon([
    { x, y: legY + 12.5 },
    { x: x + 12, y: legY + 12.5 },
    { x: x + 12, y: legY + 16.5 },
    { x, y: legY + 16.5 },
  ]);
  writer.drawRect(x, legY + 12.5, 12, 4, { borderColor: muted, borderWidthPt: 0.4 });
  writer.drawText('Hatched = Apply Glue Here', x + 14, legY + 15.5, font, 6.6, dark);

  const spacerNote = `Hinge Spacer: ${roundTo(geometry.cutList.hingeSpacerMm, 1)} mm`;
  writer.drawText(spacerNote, x, legY + 23, boldFont, 6.8, rgb(0.05, 0.35, 0.85));
}

export interface InnerPdfRenderOptions {
  /** Optional 300 DPI pre-rendered PNG artwork keyed by inner piece kind */
  readonly pieceArtworkPng?: Partial<
    Record<Exclude<InnerPieceKind, 'calibration-legend'>, Uint8Array>
  >;
  /** Suppress centered dimension text on styled pieces so printed endpaper artwork stays clean */
  readonly hideFaceTextOnStyled?: boolean;
  /** Include the 50×50 mm calibration square & visual legend block. Defaults to false. */
  readonly includeLegend?: boolean;
  /** Include red cut lines, dashed blue fold/score lines & glue-flap hatches. Defaults to true. */
  readonly includeGuides?: boolean;
}

export async function generateInnerTemplatesPdf(
  geometry: CaseGeometry,
  pageSizeId: PageSizeId,
  options?: InnerPdfRenderOptions,
): Promise<{ readonly bytes: Uint8Array; readonly plan: InnerPdfLayoutPlan }> {
  const plan = planInnerTemplateLayout(geometry, pageSizeId, {
    includeLegend: options?.includeLegend,
  });
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bookbinder — Inner Pockets & Spine Liner (1:1 mm)');
  pdfDoc.setCreator('Bookbinder Studio');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidthPt = UnitConverter.mmToPoints(plan.pageWidthMm);
  const pageHeightPt = UnitConverter.mmToPoints(plan.pageHeightMm);

  const pages: PDFPage[] = [];
  for (let i = 0; i < plan.pageCount; i++) {
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    pages.push(page);
    const footer = `Page ${i + 1} of ${plan.pageCount} • ${PAGE_SIZES[pageSizeId].label} • Scale 1:1 mm (Print at 100% Actual Size)`;
    page.drawText(footer, {
      x: UnitConverter.mmToPoints(PAGE_MARGIN_MM),
      y: UnitConverter.mmToPoints(4.5),
      size: 6.5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  const showLabels = !options?.hideFaceTextOnStyled;
  const showGuides = options?.includeGuides ?? true;

  for (const placement of plan.placements) {
    const page = pages[placement.pageIndex];
    const writer = new PdfMmWriter(page, plan.pageHeightMm);

    if (placement.kind !== 'calibration-legend') {
      const pngBytes = options?.pieceArtworkPng?.[placement.kind];
      if (pngBytes && pngBytes.byteLength > 0) {
        const embeddedPng = await pdfDoc.embedPng(pngBytes);
        page.drawImage(embeddedPng, {
          x: UnitConverter.mmToPoints(placement.xMm),
          y: UnitConverter.mmToPoints(plan.pageHeightMm - (placement.yMm + placement.heightMm)),
          width: UnitConverter.mmToPoints(placement.widthMm),
          height: UnitConverter.mmToPoints(placement.heightMm),
        });
      }
    }

    if (!showGuides && placement.kind !== 'calibration-legend') {
      continue;
    }

    switch (placement.kind) {
      case 'back-pocket':
        renderPocket(writer, geometry.backPocket, placement, font, boldFont, showLabels);
        break;
      case 'front-pocket':
        renderPocket(writer, geometry.frontPocket, placement, font, boldFont, showLabels);
        break;
      case 'spine-liner':
        renderSpineLiner(writer, geometry.spineLiner, placement, font, boldFont, showLabels);
        break;
      case 'calibration-legend':
        renderCalibrationAndLegend(writer, placement, geometry, font, boldFont);
        break;
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, plan };
}

/**
 * Generates an exact 1:1 physical mm structural PDF for the Outer Case Wrap
 * (1 page for Single-Piece Continuous Wrap; 3 pages for 3-Piece Quarter-Bound Split).
 */
export async function generateOuterWrapPdf(
  geometry: CaseGeometry,
  splitMode: SplitMode,
): Promise<Uint8Array> {
  const { outerWrap, splitPanels, cutList } = geometry;
  const bleed = outerWrap.includeBleed ? outerWrap.bleedMm : 0;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bookbinder — Outer Case Wrap Structural Template (1:1 mm)');
  pdfDoc.setCreator('Bookbinder Studio');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cutColor = rgb(0.9, 0.1, 0.1);
  const guideColor = rgb(0.05, 0.38, 0.9);
  const bleedColor = rgb(0.0, 0.62, 0.28);
  const mutedColor = rgb(0.35, 0.35, 0.35);

  if (splitMode === 'three-piece') {
    for (const panel of splitPanels) {
      const pageW = panel.widthMm + bleed * 2;
      const pageH = panel.heightMm + bleed * 2;
      const page = pdfDoc.addPage([
        UnitConverter.mmToPoints(pageW),
        UnitConverter.mmToPoints(pageH),
      ]);
      const writer = new PdfMmWriter(page, pageH);

      if (bleed > 0) {
        writer.drawRect(0.2, 0.2, pageW - 0.4, pageH - 0.4, {
          borderColor: bleedColor,
          borderWidthPt: 0.7,
          dashArray: [4, 2.5],
        });
      }

      const shiftedCut = GeometryPrimitives.translatePolygon(panel.cutPolygon, bleed, bleed);
      writer.drawPolygonOutline(shiftedCut, { color: cutColor, thicknessPt: 0.9 });

      for (const guide of panel.guideRects) {
        writer.drawRect(
          guide.rect.x + bleed,
          guide.rect.y + bleed,
          guide.rect.width,
          guide.rect.height,
          {
            borderColor: guideColor,
            borderWidthPt: 0.7,
            dashArray: [4, 2.5],
          },
        );
      }

      const cx = pageW / 2;
      const cy = pageH / 2;
      writer.drawText(panel.label.toUpperCase(), cx - 32, cy - 3, boldFont, 9, guideColor);
      writer.drawText(
        `${roundTo(panel.widthMm, 1)} × ${roundTo(panel.heightMm, 1)} mm • Scale 1:1 mm`,
        cx - 32,
        cy + 5,
        font,
        7.5,
        mutedColor,
      );
    }

    return pdfDoc.save();
  }

  // Single-Piece Continuous Wrap
  const pageW = outerWrap.widthMm + bleed * 2;
  const pageH = outerWrap.heightMm + bleed * 2;
  const page = pdfDoc.addPage([UnitConverter.mmToPoints(pageW), UnitConverter.mmToPoints(pageH)]);
  const writer = new PdfMmWriter(page, pageH);

  if (bleed > 0) {
    writer.drawRect(0.2, 0.2, pageW - 0.4, pageH - 0.4, {
      borderColor: bleedColor,
      borderWidthPt: 0.7,
      dashArray: [4, 2.5],
    });
  }

  const shiftedCut = GeometryPrimitives.translatePolygon(outerWrap.outerCutPolygon, bleed, bleed);
  const isSoftcover = outerWrap.bindingStyle === 'softcover-jacket';
  const isFlexible = outerWrap.bindingStyle === 'flexible-spine';

  if (isSoftcover && outerWrap.jacketGlueTabPolygons.length > 0) {
    const tabFoldStyle = { color: guideColor, thicknessPt: 0.65, dashArray: [3.5, 2] };
    for (const tabPoly of outerWrap.jacketGlueTabPolygons) {
      const shiftedTab = GeometryPrimitives.translatePolygon(tabPoly, bleed, bleed);
      writer.drawHatchedPolygon(shiftedTab);
      const bbox = GeometryPrimitives.boundingBox(shiftedTab);
      const isTopTab = bbox.y < bleed + outerWrap.heightMm / 2;
      const foldY = isTopTab ? bbox.y + bbox.height : bbox.y;
      writer.drawLine({ x: bbox.x, y: foldY }, { x: bbox.x + bbox.width, y: foldY }, tabFoldStyle);
      writer.drawText(
        'GLUE',
        bbox.x + bbox.width / 2 - 5,
        bbox.y + bbox.height / 2 + 1.5,
        boldFont,
        5.5,
        rgb(0.48, 0.32, 0.08),
      );
    }
  }

  writer.drawPolygonOutline(shiftedCut, { color: cutColor, thicknessPt: 0.95 });
  const boardRects = [
    { label: isSoftcover ? 'BACK COVER' : 'BACK BOARD', rect: outerWrap.backBoardRect },
    { label: isFlexible ? 'FLEX SPINE' : 'SPINE', rect: outerWrap.spineRect },
    { label: isSoftcover ? 'FRONT COVER' : 'FRONT BOARD', rect: outerWrap.frontBoardRect },
  ];
  for (const { label, rect } of boardRects) {
    writer.drawRect(rect.x + bleed, rect.y + bleed, rect.width, rect.height, {
      borderColor: guideColor,
      borderWidthPt: 0.75,
      dashArray: [5, 2.5],
    });
    const c = GeometryPrimitives.rectCenter(rect);
    const dim = `${roundTo(rect.width, 1)} × ${roundTo(rect.height, 1)} mm`;
    const isSpine = label === 'SPINE' || label === 'FLEX SPINE';
    writer.drawText(label, c.x + bleed - 16, c.y + bleed - 3, boldFont, 8.5, guideColor);
    if (!isSpine) {
      writer.drawText(dim, c.x + bleed - 16, c.y + bleed + 4, font, 7.2, mutedColor);
    }
  }

  if (cutList.hingeSpacerMm > 0) {
    for (const hinge of [outerWrap.leftHingeRect, outerWrap.rightHingeRect]) {
      writer.drawRect(hinge.x + bleed, hinge.y + bleed, hinge.width, hinge.height, {
        borderColor: guideColor,
        borderWidthPt: 0.5,
        dashArray: [2, 2],
      });
    }
  }

  const headerNote = isSoftcover
    ? `FOLD & GLUE: 1. Fold ${roundTo(outerWrap.jacketFlapWidthMm, 1)} mm flaps inward  2. Glue blank back of 4 tabs  3. Fold tabs over flaps`
    : isFlexible
      ? `Flexible-Spine Wrap ${roundTo(outerWrap.widthMm, 1)} × ${roundTo(outerWrap.heightMm, 1)} mm • Cloth Spine Gap ${roundTo(cutList.spineStrip.widthMm, 1)} mm • Turn-In ${roundTo(outerWrap.turnInMm, 1)} mm • Print at 100% (1:1 mm)`
      : `Outer Wrap ${roundTo(outerWrap.widthMm, 1)} × ${roundTo(outerWrap.heightMm, 1)} mm • Hinge Spacer ${roundTo(cutList.hingeSpacerMm, 1)} mm • Turn-In ${roundTo(outerWrap.turnInMm, 1)} mm • Print at 100% (1:1 mm)`;
  const headerX = bleed + (isSoftcover ? outerWrap.jacketFlapWidthMm * 2 + 4 : outerWrap.turnInMm);
  const headerY = bleed + (isSoftcover ? outerWrap.jacketGlueTabHeightMm * 0.65 : outerWrap.turnInMm * 0.6);
  writer.drawText(headerNote, headerX, headerY, font, isSoftcover ? 6.5 : 7.5, mutedColor);

  return pdfDoc.save();
}
