import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  StandardFonts,
  clip,
  concatTransformationMatrix,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { evaluatePrintMediaFit } from '@/core/geometry';
import { canvasToPngBytes } from '@/lib/canvasImage';
import { hexToRgb01 } from '@/lib/color';
import type { PrintMediaId } from '@/types/bookParams';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type Point2D,
  type PrintMediaFitEvaluation,
  type Rect2D,
} from '@/types/geometry';
import type { CoverStudioState, StudioFontId } from '@/types/studio';
import { PRINT_DPI, UnitConverter } from '@/types/units';
import {
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  type StudioCanvasSpec,
} from '../canvasSpec';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from '../classicOrnaments';
import { getCuratedFont, loadCuratedFontBytes, type CustomFontAsset } from '../fonts';
import { renderCoverArtworkCanvas } from './coverRasterExporter';

interface PdfCoordMapper {
  readonly toPdfX: (mm: number) => number;
  readonly toPdfY: (mm: number) => number;
}

async function embedFontByIdInPdf(
  pdfDoc: PDFDocument,
  fontId: StudioFontId,
  customFont: CustomFontAsset | null,
  cache: Map<StudioFontId, PDFFont>,
): Promise<PDFFont> {
  const existing = cache.get(fontId);
  if (existing) return existing;

  pdfDoc.registerFontkit(fontkit);

  try {
    if (fontId === 'custom' && customFont?.pdfEmbeddable) {
      const embedded = await pdfDoc.embedFont(customFont.bytes);
      cache.set(fontId, embedded);
      return embedded;
    }

    const curatedId = fontId === 'custom' ? 'eb-garamond' : fontId;
    const curatedBytes = await loadCuratedFontBytes(curatedId);
    if (curatedBytes) {
      const embedded = await pdfDoc.embedFont(curatedBytes);
      cache.set(fontId, embedded);
      return embedded;
    }
  } catch {
    // Graceful fallback below if font bytes cannot be embedded
  }

  const fallbackSpec =
    fontId === 'custom' ? getCuratedFont('eb-garamond') : getCuratedFont(fontId);
  const fallback = await pdfDoc.embedFont(
    fallbackSpec.category === 'sans-serif' ? StandardFonts.Helvetica : StandardFonts.TimesRoman,
  );
  cache.set(fontId, fallback);
  return fallback;
}

/** Draws hairline cut polygon, dashed score/fold lines, and optional softcover trim-waste instructions. */
async function drawCoverCutAndFoldOverlay(
  pdfDoc: PDFDocument,
  page: PDFPage,
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
  coords: PdfCoordMapper,
): Promise<void> {
  const { toPdfX, toPdfY } = coords;
  const bleed = spec.bleedMm;
  const { outerWrap } = geometry;
  const shiftedCutPoly = GeometryPrimitives.translatePolygon(
    outerWrap.outerCutPolygon,
    bleed,
    bleed,
  );

  const hairlineCut = rgb(0.92, 0.14, 0.14);
  const hairlineFold = rgb(0.12, 0.42, 0.88);

  // 3a. Solid hairline outer cut polygon (including 45° corner miters)
  for (let i = 0; i < shiftedCutPoly.length; i++) {
    const a = shiftedCutPoly[i];
    const b = shiftedCutPoly[(i + 1) % shiftedCutPoly.length];
    page.drawLine({
      start: { x: toPdfX(a.x), y: toPdfY(a.y) },
      end: { x: toPdfX(b.x), y: toPdfY(b.y) },
      color: hairlineCut,
      thickness: 0.55,
    });
  }

  // 3b. Subtle dashed fold / score lines for turn-ins, board seams, spine hinges & softcover flaps
  const drawFoldLine = (x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number) => {
    page.drawLine({
      start: { x: toPdfX(x1Mm), y: toPdfY(y1Mm) },
      end: { x: toPdfX(x2Mm), y: toPdfY(y2Mm) },
      color: hairlineFold,
      thickness: 0.45,
      dashArray: [4, 2.5],
      opacity: 0.78,
    });
  };

  const w = outerWrap.widthMm;
  const h = outerWrap.heightMm;
  const isSoftcover = outerWrap.bindingStyle === 'softcover-jacket';

  // Horizontal top & bottom turn-in fold lines (hardcover styles)
  if (outerWrap.turnInMm > 0.2) {
    const topFoldY = bleed + outerWrap.turnInMm;
    const botFoldY = bleed + h - outerWrap.turnInMm;
    drawFoldLine(bleed, topFoldY, bleed + w, topFoldY);
    drawFoldLine(bleed, botFoldY, bleed + w, botFoldY);
  }

  // Horizontal glue-tab fold lines on Back & Front cover wrap-over tabs (1-piece fold-and-glue slip cover)
  if (isSoftcover && outerWrap.jacketGlueTabPolygons.length > 0) {
    for (const tabPoly of outerWrap.jacketGlueTabPolygons) {
      const bbox = GeometryPrimitives.boundingBox(tabPoly);
      const isTopTab = bbox.y < h / 2;
      const foldY = bleed + (isTopTab ? bbox.y + bbox.height : bbox.y);
      drawFoldLine(bleed + bbox.x, foldY, bleed + bbox.x + bbox.width, foldY);
    }

    // Print concise 1-2-3 fold & glue instructions inside the top cut-off trim-waste gap
    // (strictly outside the red cut outline, so it trims cleanly away after cutting)
    const wasteStartX = bleed + outerWrap.jacketFlapWidthMm * 2 + 3;
    const wasteEndX = bleed + w - outerWrap.jacketFlapWidthMm * 2 - 3;
    const wasteWidthMm = wasteEndX - wasteStartX;
    if (wasteWidthMm >= 80 && outerWrap.jacketGlueTabHeightMm >= 8) {
      const noteFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const stripY = bleed + 1.4;
      const stripH = outerWrap.jacketGlueTabHeightMm - 2.8;
      page.drawRectangle({
        x: toPdfX(wasteStartX),
        y: toPdfY(stripY + stripH),
        width: UnitConverter.mmToPoints(wasteWidthMm),
        height: UnitConverter.mmToPoints(stripH),
        color: rgb(0.98, 0.97, 0.94),
        opacity: 0.92,
      });
      const instructionText =
        'TRIM WASTE • FOLD & GLUE: 1. Fold side flaps inward  2. Glue blank back of 4 tabs  3. Fold tabs over flaps';
      const fontSizePt = wasteWidthMm >= 145 ? 6.4 : 5.2;
      const textW = noteFont.widthOfTextAtSize(instructionText, fontSizePt);
      const centerX = toPdfX(wasteStartX + wasteWidthMm / 2);
      const centerY = toPdfY(stripY + stripH / 2);
      page.drawText(instructionText, {
        x: centerX - textW / 2,
        y: centerY - fontSizePt * 0.34,
        size: fontSizePt,
        font: noteFont,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }

  // Deduplicated vertical fold / score X positions (fore-edge turn-ins/flaps, board edges & spine hinges)
  const verticalStartY = isSoftcover ? bleed + outerWrap.jacketGlueTabHeightMm : bleed;
  const verticalEndY = isSoftcover ? bleed + h - outerWrap.jacketGlueTabHeightMm : bleed + h;
  const rawVerticalXs = [
    outerWrap.backBoardRect.x,
    outerWrap.backBoardRect.x + outerWrap.backBoardRect.width,
    outerWrap.spineRect.x,
    outerWrap.spineRect.x + outerWrap.spineRect.width,
    outerWrap.frontBoardRect.x,
    outerWrap.frontBoardRect.x + outerWrap.frontBoardRect.width,
  ];
  const uniqueVerticalXs: number[] = [];
  for (const x of rawVerticalXs) {
    if (x <= 0.2 || x >= w - 0.2) continue;
    if (!uniqueVerticalXs.some((prev) => Math.abs(prev - x) < 0.2)) {
      uniqueVerticalXs.push(x);
    }
  }
  for (const vx of uniqueVerticalXs) {
    drawFoldLine(bleed + vx, verticalStartY, bleed + vx, verticalEndY);
  }
}

/** Draws bleed-margin miter ticks and outer corner crop brackets outside the trimmed wrap boundary. */
function drawOuterRegistrationMarks(
  page: PDFPage,
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
  coords: PdfCoordMapper,
): void {
  const { toPdfX, toPdfY } = coords;
  const bleed = spec.bleedMm;
  const regColor = rgb(0.1, 0.1, 0.1);
  const markLen = Math.max(2.0, bleed);
  const w = geometry.outerWrap.widthMm;
  const h = geometry.outerWrap.heightMm;
  const leg = geometry.outerWrap.miterCutLegMm;

  const drawMark = (a: Point2D, b: Point2D) =>
    page.drawLine({
      start: { x: toPdfX(a.x), y: toPdfY(a.y) },
      end: { x: toPdfX(b.x), y: toPdfY(b.y) },
      color: regColor,
      thickness: 0.45,
    });

  // Outer trim-box corner crop marks (kept strictly in bleed zone outside the wrap)
  const xL = bleed;
  const xR = bleed + w;
  const yT = bleed;
  const yB = bleed + h;

  // Top-left & Top-right & Bottom-left & Bottom-right miter start ticks in outer margin
  drawMark({ x: xL + leg, y: 0 }, { x: xL + leg, y: Math.max(0.5, yT - 0.3) });
  drawMark({ x: xR - leg, y: 0 }, { x: xR - leg, y: Math.max(0.5, yT - 0.3) });
  drawMark(
    { x: xL + leg, y: spec.totalHeightMm },
    { x: xL + leg, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.3) },
  );
  drawMark(
    { x: xR - leg, y: spec.totalHeightMm },
    { x: xR - leg, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.3) },
  );

  drawMark({ x: 0, y: yT + leg }, { x: Math.max(0.5, xL - 0.3), y: yT + leg });
  drawMark({ x: 0, y: yB - leg }, { x: Math.max(0.5, xL - 0.3), y: yB - leg });
  drawMark(
    { x: spec.totalWidthMm, y: yT + leg },
    { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.3), y: yT + leg },
  );
  drawMark(
    { x: spec.totalWidthMm, y: yB - leg },
    { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.3), y: yB - leg },
  );

  // Corner outer crop brackets if bleed >= 1mm
  if (markLen >= 1) {
    drawMark({ x: 0, y: yT }, { x: Math.max(0.5, xL - 0.5), y: yT });
    drawMark({ x: xL, y: 0 }, { x: xL, y: Math.max(0.5, yT - 0.5) });
    drawMark(
      { x: spec.totalWidthMm, y: yT },
      { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.5), y: yT },
    );
    drawMark({ x: xR, y: 0 }, { x: xR, y: Math.max(0.5, yT - 0.5) });
    drawMark({ x: 0, y: yB }, { x: Math.max(0.5, xL - 0.5), y: yB });
    drawMark(
      { x: xL, y: spec.totalHeightMm },
      { x: xL, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.5) },
    );
    drawMark(
      { x: spec.totalWidthMm, y: yB },
      { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.5), y: yB },
    );
    drawMark(
      { x: xR, y: spec.totalHeightMm },
      { x: xR, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.5) },
    );
  }
}

/** Renders the complete 1:1 mm outer cover onto a single PDFDocument page (artwork, vectors, typography, guides). */
async function renderBaseCoverPdfPage(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  spec: StudioCanvasSpec,
  options?: { rasterDpi?: number; skipCanvasRaster?: boolean },
): Promise<{ bytes: Uint8Array; pageW: number; pageH: number }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bookbinder — Print-Ready Outer Cover (1:1 mm)');
  pdfDoc.setCreator('Bookbinder Studio');

  const pageW = UnitConverter.mmToPoints(spec.totalWidthMm);
  const pageH = UnitConverter.mmToPoints(spec.totalHeightMm);
  const page = pdfDoc.addPage([pageW, pageH]);

  const toPdfX = (mm: number) => UnitConverter.mmToPoints(mm);
  const toPdfY = (mm: number) => UnitConverter.mmToPoints(spec.totalHeightMm - mm);
  const coords: PdfCoordMapper = { toPdfX, toPdfY };

  // 1. Background & Artwork layer
  if (
    studio.layers.length > 0 &&
    !options?.skipCanvasRaster &&
    typeof document !== 'undefined'
  ) {
    const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
      includeSpineText: false,
      dpi: options?.rasterDpi ?? PRINT_DPI,
    });
    const pngBytes = await canvasToPngBytes(canvas);
    const embeddedImage = await pdfDoc.embedPng(pngBytes);
    page.drawImage(embeddedImage, { x: 0, y: 0, width: pageW, height: pageH });
  } else {
    const zones: { rect: Rect2D; hex: string }[] = [
      { rect: spec.backZoneRect, hex: studio.backBgColor },
      { rect: spec.spineZoneRect, hex: studio.spineBgColor },
      { rect: spec.frontZoneRect, hex: studio.frontBgColor },
    ];
    for (const z of zones) {
      const c = hexToRgb01(z.hex);
      page.drawRectangle({
        x: toPdfX(z.rect.x),
        y: toPdfY(z.rect.y + z.rect.height),
        width: UnitConverter.mmToPoints(z.rect.width),
        height: UnitConverter.mmToPoints(z.rect.height),
        color: rgb(c.r, c.g, c.b),
      });
    }
  }

  // 2a. True Vector Classic Bookbindery Ornaments & Custom SVG Stamps (crisp at any scale, never rasterized)
  const mmToPt = UnitConverter.mmToPoints(1);
  for (const orn of studio.ornaments ?? []) {
    const compoundD = buildOrnamentCompoundPath(orn);
    if (!compoundD) continue;
    const style = getOrnamentSvgStyle(orn);
    const oc = hexToRgb01(orn.color);
    const pdfColor = rgb(oc.r, oc.g, oc.b);
    page.drawSvgPath(compoundD, {
      x: 0,
      y: pageH,
      scale: mmToPt,
      color: style.fill !== 'none' ? pdfColor : undefined,
      borderColor: style.stroke !== 'none' && style.strokeWidthMm > 0 ? pdfColor : undefined,
      borderWidth:
        style.stroke !== 'none' && style.strokeWidthMm > 0
          ? UnitConverter.mmToPoints(style.strokeWidthMm)
          : undefined,
    });
  }

  // 2b. True Vector Cover Text Layers (Front / Back / Spine)
  const fontCache = new Map<StudioFontId, PDFFont>();
  for (const textLayer of studio.textLayers ?? []) {
    const lineItems = computeCoverTextLinePlacements(textLayer);
    const pdfFont = await embedFontByIdInPdf(pdfDoc, textLayer.fontId, customFont, fontCache);
    const tc = hexToRgb01(textLayer.color);
    const textColor = rgb(tc.r, tc.g, tc.b);
    const isFlipped = Boolean(textLayer.flipX || textLayer.flipY);

    if (isFlipped) {
      const layerAnchorXPt = toPdfX(textLayer.xMm);
      const layerAnchorYPt = toPdfY(textLayer.yMm);
      const sx = textLayer.flipX ? -1 : 1;
      const sy = textLayer.flipY ? -1 : 1;
      const tx = layerAnchorXPt * (1 - sx);
      const ty = layerAnchorYPt * (1 - sy);
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(sx, 0, 0, sy, tx, ty),
      );
    }

    for (const item of lineItems) {
      if (!item.text.trim()) continue;
      const trackingPt = item.letterSpacingEm * item.fontSizePt;
      const chars = Array.from(item.text);
      const totalWidthPt =
        Math.abs(trackingPt) > 0.05 && chars.length > 1
          ? chars.reduce(
              (acc, ch, i) =>
                acc +
                pdfFont.widthOfTextAtSize(ch, item.fontSizePt) +
                (i < chars.length - 1 ? trackingPt : 0),
              0,
            )
          : pdfFont.widthOfTextAtSize(item.text, item.fontSizePt);
      const textHeightPt = pdfFont.heightAtSize(item.fontSizePt, { descender: false });
      const anchorXPt = toPdfX(item.anchorXMm);
      const anchorYPt = toPdfY(item.anchorYMm);

      const startXPt =
        item.align === 'left'
          ? anchorXPt
          : item.align === 'right'
            ? anchorXPt - totalWidthPt
            : anchorXPt - totalWidthPt / 2;
      const baseYPt = anchorYPt - textHeightPt * 0.36;

      if (Math.abs(trackingPt) > 0.05 && chars.length > 1) {
        let cursorX = startXPt;
        for (const ch of chars) {
          page.drawText(ch, {
            x: cursorX,
            y: baseYPt,
            size: item.fontSizePt,
            font: pdfFont,
            color: textColor,
          });
          cursorX += pdfFont.widthOfTextAtSize(ch, item.fontSizePt) + trackingPt;
        }
      } else {
        page.drawText(item.text, {
          x: startXPt,
          y: baseYPt,
          size: item.fontSizePt,
          font: pdfFont,
          color: textColor,
        });
      }
    }

    if (isFlipped) {
      page.pushOperators(popGraphicsState());
    }
  }

  // 2c. True Vector Spine Typography
  const textPlacements = computeSpineTextPlacements(geometry, studio);
  if (textPlacements.length > 0) {
    const pdfFont = await embedFontByIdInPdf(
      pdfDoc,
      studio.spineText.fontId,
      customFont,
      fontCache,
    );
    const tc = hexToRgb01(studio.spineText.textColor);
    const textColor = rgb(tc.r, tc.g, tc.b);

    for (const item of textPlacements) {
      const textWidthPt = pdfFont.widthOfTextAtSize(item.text, item.fontSizePt);
      const textHeightPt = pdfFont.heightAtSize(item.fontSizePt, { descender: false });
      const centerXPt = toPdfX(item.anchorXMm);
      const centerYPt = toPdfY(item.anchorYMm);

      // Rotate around text center cleanly in PDF coordinate space (CCW positive)
      const pdfRotDeg =
        item.rotationDegCss === 0 ? 0 : item.rotationDegCss === 90 ? -90 : 90;
      const rad = (pdfRotDeg * Math.PI) / 180;
      const dxLocal = -textWidthPt / 2;
      const dyLocal = -textHeightPt * 0.36;
      const startX = centerXPt + dxLocal * Math.cos(rad) - dyLocal * Math.sin(rad);
      const startY = centerYPt + dxLocal * Math.sin(rad) + dyLocal * Math.cos(rad);

      page.drawText(item.text, {
        x: startX,
        y: startY,
        size: item.fontSizePt,
        font: pdfFont,
        color: textColor,
        rotate: degrees(pdfRotDeg),
      });
    }
  }

  // 3. Cut Lines vs. Outer Corner Registration Marks Only
  if (studio.cutLineMode === 'full-cut-miter') {
    await drawCoverCutAndFoldOverlay(pdfDoc, page, geometry, spec, coords);
  } else {
    drawOuterRegistrationMarks(page, geometry, spec, coords);
  }

  return { bytes: await pdfDoc.save(), pageW, pageH };
}

function drawCenteredSheetFooter(
  targetPage: PDFPage,
  footerFont: PDFFont,
  sheetWPt: number,
  text: string,
): void {
  const fontSizePt = 6.5;
  const textW = footerFont.widthOfTextAtSize(text, fontSizePt);
  targetPage.drawText(text, {
    x: (sheetWPt - textW) / 2,
    y: UnitConverter.mmToPoints(2.0),
    size: fontSizePt,
    font: footerFont,
    color: rgb(0.32, 0.32, 0.32),
  });
}

/** Case B: Centers the 1:1 mm outer cover onto a single desktop sheet page at 100% scale. */
async function layoutSingleSheetCenteredPdf(
  sourceBytes: Uint8Array,
  pageW: number,
  pageH: number,
  spec: StudioCanvasSpec,
  fit: PrintMediaFitEvaluation,
  sheetWMm: number,
  sheetHMm: number,
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();
  outDoc.setTitle(`Bookbinder — Print-Ready Outer Cover (${fit.mediaLabel}, 1:1 mm)`);
  outDoc.setCreator('Bookbinder Studio');
  const [embeddedCover] = await outDoc.embedPdf(sourceBytes);
  const footerFont = await outDoc.embedFont(StandardFonts.Helvetica);

  const sheetWPt = UnitConverter.mmToPoints(sheetWMm);
  const sheetHPt = UnitConverter.mmToPoints(sheetHMm);

  const sheetPage = outDoc.addPage([sheetWPt, sheetHPt]);
  const offsetXPt = UnitConverter.mmToPoints((sheetWMm - spec.totalWidthMm) / 2);
  const offsetYPt = UnitConverter.mmToPoints((sheetHMm - spec.totalHeightMm) / 2);

  sheetPage.pushOperators(
    pushGraphicsState(),
    rectangle(0, 0, sheetWPt, sheetHPt),
    clip(),
    endPath(),
  );
  sheetPage.drawPage(embeddedCover, {
    x: offsetXPt,
    y: offsetYPt,
    width: pageW,
    height: pageH,
  });
  sheetPage.pushOperators(popGraphicsState());

  drawCenteredSheetFooter(
    sheetPage,
    footerFont,
    sheetWPt,
    `100% Actual Size • Centered on ${fit.mediaLabel}`,
  );
  return outDoc.save();
}

function drawTileAlignmentMarks(
  tilePage: PDFPage,
  sheetHMm: number,
  seamXMm: number,
  overlapEdgeXMm: number,
): void {
  const seamXPt = UnitConverter.mmToPoints(seamXMm);
  const overlapEdgeXPt = UnitConverter.mmToPoints(overlapEdgeXMm);
  const lineBottomPt = UnitConverter.mmToPoints(5.5);
  const lineTopPt = UnitConverter.mmToPoints(sheetHMm - 5.5);

  // Crisp dashed seam centerline where Page 1 & Page 2 align
  tilePage.drawLine({
    start: { x: seamXPt, y: lineBottomPt },
    end: { x: seamXPt, y: lineTopPt },
    color: rgb(0.12, 0.42, 0.88),
    thickness: 0.55,
    dashArray: [3.5, 2],
  });

  // Subtle dashed inner edge of the 10 mm overlap glue/tape strip
  tilePage.drawLine({
    start: { x: overlapEdgeXPt, y: lineBottomPt },
    end: { x: overlapEdgeXPt, y: lineTopPt },
    color: rgb(0.45, 0.45, 0.45),
    thickness: 0.35,
    dashArray: [2, 2.5],
  });

  // Top & bottom alignment crosshair targets along the seam centerline
  const crossRadiusPt = UnitConverter.mmToPoints(2.0);
  const crossArmPt = UnitConverter.mmToPoints(3.2);
  const crossYPositionsMm = [6.5, sheetHMm - 3.8];
  const crossColor = rgb(0.12, 0.42, 0.88);
  for (const cyMm of crossYPositionsMm) {
    const cyPt = UnitConverter.mmToPoints(cyMm);
    tilePage.drawCircle({
      x: seamXPt,
      y: cyPt,
      size: crossRadiusPt,
      borderColor: crossColor,
      borderWidth: 0.5,
    });
    tilePage.drawLine({
      start: { x: seamXPt - crossArmPt, y: cyPt },
      end: { x: seamXPt + crossArmPt, y: cyPt },
      color: crossColor,
      thickness: 0.45,
    });
    tilePage.drawLine({
      start: { x: seamXPt, y: cyPt - crossArmPt },
      end: { x: seamXPt, y: cyPt + crossArmPt },
      color: crossColor,
      thickness: 0.45,
    });
  }
}

/** Case C: Horizontally tiles the 1:1 mm outer cover across 2 desktop sheets with overlap & crosshairs. */
async function layoutTwoSheetTiledPdf(
  sourceBytes: Uint8Array,
  pageW: number,
  pageH: number,
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
  fit: PrintMediaFitEvaluation,
  sheetWMm: number,
  sheetHMm: number,
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();
  outDoc.setTitle(`Bookbinder — Print-Ready Outer Cover (${fit.mediaLabel}, 1:1 mm)`);
  outDoc.setCreator('Bookbinder Studio');
  const [embeddedCover] = await outDoc.embedPdf(sourceBytes);
  const footerFont = await outDoc.embedFont(StandardFonts.Helvetica);

  const sheetWPt = UnitConverter.mmToPoints(sheetWMm);
  const sheetHPt = UnitConverter.mmToPoints(sheetHMm);
  const bleed = spec.bleedMm;

  const overlapMm = fit.tileOverlapMm;
  const halfOverlapMm = overlapMm / 2;
  const wrapWMm = geometry.outerWrap.widthMm;
  const wrapHalfWithOverlapMm = wrapWMm / 2 + halfOverlapMm;
  const leftMarginMm = (sheetWMm - wrapHalfWithOverlapMm) / 2;
  const drawOriginYMm = (sheetHMm - spec.totalHeightMm) / 2;
  const drawOriginYPt = UnitConverter.mmToPoints(drawOriginYMm);
  const midXMm = bleed + wrapWMm / 2;

  // Page 1: Left half [0 .. midX + 5 mm]
  const page1 = outDoc.addPage([sheetWPt, sheetHPt]);
  const p1OriginXMm = leftMarginMm - bleed;
  const p1ClipX1Mm = Math.max(0, p1OriginXMm);
  const p1ClipX2Mm = leftMarginMm + wrapHalfWithOverlapMm;

  page1.pushOperators(
    pushGraphicsState(),
    rectangle(
      UnitConverter.mmToPoints(p1ClipX1Mm),
      0,
      UnitConverter.mmToPoints(Math.max(0, p1ClipX2Mm - p1ClipX1Mm)),
      sheetHPt,
    ),
    clip(),
    endPath(),
  );
  page1.drawPage(embeddedCover, {
    x: UnitConverter.mmToPoints(p1OriginXMm),
    y: drawOriginYPt,
    width: pageW,
    height: pageH,
  });
  page1.pushOperators(popGraphicsState());

  const p1SeamXMm = leftMarginMm + wrapWMm / 2;
  drawTileAlignmentMarks(page1, sheetHMm, p1SeamXMm, p1SeamXMm - halfOverlapMm);
  drawCenteredSheetFooter(
    page1,
    footerFont,
    sheetWPt,
    `PAGE 1 OF 2 — ALIGN & TAPE ${overlapMm} mm OVERLAP • 100% ACTUAL SIZE (${fit.mediaLabel})`,
  );

  // Page 2: Right half [midX - 5 mm .. totalW]
  const page2 = outDoc.addPage([sheetWPt, sheetHPt]);
  const p2OriginXMm = leftMarginMm - (midXMm - halfOverlapMm);
  const p2ClipX1Mm = leftMarginMm;
  const p2ClipX2Mm = Math.min(sheetWMm, p2OriginXMm + spec.totalWidthMm);

  page2.pushOperators(
    pushGraphicsState(),
    rectangle(
      UnitConverter.mmToPoints(p2ClipX1Mm),
      0,
      UnitConverter.mmToPoints(Math.max(0, p2ClipX2Mm - p2ClipX1Mm)),
      sheetHPt,
    ),
    clip(),
    endPath(),
  );
  page2.drawPage(embeddedCover, {
    x: UnitConverter.mmToPoints(p2OriginXMm),
    y: drawOriginYPt,
    width: pageW,
    height: pageH,
  });
  page2.pushOperators(popGraphicsState());

  const p2SeamXMm = leftMarginMm + halfOverlapMm;
  drawTileAlignmentMarks(page2, sheetHMm, p2SeamXMm, p2SeamXMm + halfOverlapMm);
  drawCenteredSheetFooter(
    page2,
    footerFont,
    sheetWPt,
    `PAGE 2 OF 2 — ALIGN & TAPE ${overlapMm} mm OVERLAP • 100% ACTUAL SIZE (${fit.mediaLabel})`,
  );

  return outDoc.save();
}

/**
 * Generates the Phase 2 Print-Ready Roll PDF (`outer_cover_print.pdf`) at exact 1:1 physical mm scale:
 * - Solid vector fills or 300 DPI embedded artwork raster
 * - True vector spine typography via pdf-lib + fontkit
 * - Cut-line toggle: Full Cut & Miter Guides vs. Bleed + Outer Corner Registration Marks Only
 */
export async function generatePrintReadyRollPdf(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options?: { rasterDpi?: number; skipCanvasRaster?: boolean; printMedia?: PrintMediaId },
): Promise<Uint8Array> {
  const spec = computeStudioCanvasSpec(geometry, options?.rasterDpi ?? PRINT_DPI);
  const { bytes: sourceBytes, pageW, pageH } = await renderBaseCoverPdfPage(
    geometry,
    studio,
    customFont,
    spec,
    options,
  );

  const printMedia = options?.printMedia ?? 'exact-auto';
  const fit = evaluatePrintMediaFit(
    printMedia,
    geometry.outerWrap.widthMm,
    geometry.outerWrap.heightMm,
  );

  // Case A: exact-auto, wide-format roll, or does-not-fit -> keep exact 1-page 1:1 mm wrap output
  if (
    (fit.status !== 'fits-1-sheet' && fit.status !== 'fits-2-sheet-tile') ||
    fit.sheetPageWidthMm === null ||
    fit.sheetPageHeightMm === null
  ) {
    return sourceBytes;
  }

  // Case B: Centered on 1 exact desktop sheet page at 100% scale
  if (fit.status === 'fits-1-sheet') {
    return layoutSingleSheetCenteredPdf(
      sourceBytes,
      pageW,
      pageH,
      spec,
      fit,
      fit.sheetPageWidthMm,
      fit.sheetPageHeightMm,
    );
  }

  // Case C: 2-sheet horizontally tiled PDF with 10 mm overlap & alignment crosshairs
  return layoutTwoSheetTiledPdf(
    sourceBytes,
    pageW,
    pageH,
    geometry,
    spec,
    fit,
    fit.sheetPageWidthMm,
    fit.sheetPageHeightMm,
  );
}
