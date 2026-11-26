import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import { computeExternalFoldGuideTicks } from '@/core/foldGuideTicks';
import {
  appendDetachedInnerPocketsPdf,
  composeRollNestedCoverPdf,
  composeSheetNestedCoverPdf,
} from '@/core/pdfExport';
import {
  layoutPdfToPrintMedia,
  type RollNestingExportOptions,
  type SheetNestingExportOptions,
} from '@/core/pdfSheetLayout';
import type { PrinterMargins } from '@/core/printerMargins';
import { canvasToPngBytes } from '@/lib/canvasImage';
import { hexToRgb01 } from '@/lib/color';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import type { PageSizeId, PrintMediaId } from '@/types/bookParams';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type Point2D,
  type Rect2D,
} from '@/types/geometry';
import {
  PdfGuideOptionsModel,
  type PdfGuideOptions,
  type PdfGuideOptionsInput,
} from '@/types/pdfGuides';
import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import type { CoverStudioState, StudioFontId } from '@/types/studio';
import { normalizeQuarterTurn, type CoverImageLayer } from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter } from '@/types/units';
import {
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  type StudioCanvasSpec,
} from '../canvasSpec';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from '../classicOrnaments';
import { getCuratedFont, loadCuratedFontBytes, type CustomFontAsset } from '../fonts';
import { hasImageAboveVectorElements, resolveOrderedStudioElements } from '../layerStack';
import {
  renderCoverArtworkCanvas,
  renderCoverImageSliceCanvas,
} from './coverRasterExporter';

export type CoverPdfLayerMode = 'full' | 'base-only';

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

/** Draws hairline solid red outer cut polygon and optional softcover trim-waste instructions. */
async function drawCoverCutOutline(
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

  // Solid hairline outer cut polygon (including 45° corner miters)
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

  // Optional trim-waste fold & glue instructions for binding styles with mitered glue tabs
  const strategy = resolveBindingStrategy(outerWrap);
  if (strategy.capabilities.hasGlueTabs && outerWrap.jacketGlueTabPolygons.length >= 2) {
    // Compute the exact gap between Back Top Glue Tab and Front Top Glue Tab so instructions stay strictly in trim waste
    const backTopTabBox = GeometryPrimitives.boundingBox(outerWrap.jacketGlueTabPolygons[0]);
    const frontTopTabBox = GeometryPrimitives.boundingBox(outerWrap.jacketGlueTabPolygons[1]);
    const wasteStartX = bleed + backTopTabBox.x + backTopTabBox.width + 3;
    const wasteEndX = bleed + frontTopTabBox.x - 3;
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
      const instructionText = strategy.capabilities.hasFlaps
        ? 'TRIM WASTE • FOLD & GLUE: 1. Fold side flaps inward  2. Glue blank back of 4 tabs  3. Fold tabs over flaps'
        : 'TRIM WASTE • 2-SHEET SLIP COVER: 1. Glue detached pockets inside  2. Fold & glue 4 tabs over pockets';
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
}

/** Draws subtle dashed interior fold / score lines across the cover supplied by the active binding strategy. */
function drawCoverInteriorFoldLines(
  page: PDFPage,
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
  coords: PdfCoordMapper,
): void {
  const { toPdfX, toPdfY } = coords;
  const bleed = spec.bleedMm;
  const hairlineFold = rgb(0.12, 0.42, 0.88);

  for (const line of geometry.outerWrap.foldLines) {
    page.drawLine({
      start: { x: toPdfX(bleed + line.x1), y: toPdfY(bleed + line.y1) },
      end: { x: toPdfX(bleed + line.x2), y: toPdfY(bleed + line.y2) },
      color: hairlineFold,
      thickness: 0.45,
      dashArray: [4, 2.5],
      opacity: 0.78,
    });
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
  if (leg > 0.2) {
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
  }

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

/**
 * Draws subtle 3 mm brass center-alignment hairlines in the outer top/bottom bleed or margin
 * at the exact Back Board, Spine, and Front Board center X coordinates — strictly outside the
 * visible board faces to aid HTV transfer-tape alignment without marking the visible cover.
 */
function drawHtvCenterAlignmentTicks(
  page: PDFPage,
  geometry: CaseGeometry,
  spec: StudioCanvasSpec,
  coords: PdfCoordMapper,
): void {
  const { toPdfX, toPdfY } = coords;
  const bleed = spec.bleedMm;
  const { outerWrap } = geometry;
  const brass = rgb(0.71, 0.51, 0.15);

  const topMarginMm =
    Math.min(
      outerWrap.backBoardRect.y,
      outerWrap.spineRect.y,
      outerWrap.frontBoardRect.y,
    ) + bleed;
  const bottomBoardEdgeMm =
    Math.max(
      outerWrap.backBoardRect.y + outerWrap.backBoardRect.height,
      outerWrap.spineRect.y + outerWrap.spineRect.height,
      outerWrap.frontBoardRect.y + outerWrap.frontBoardRect.height,
    ) + bleed;
  const bottomMarginMm = spec.totalHeightMm - bottomBoardEdgeMm;

  const topTickLen = Math.min(3, Math.max(0, topMarginMm));
  const bottomTickLen = Math.min(3, Math.max(0, bottomMarginMm));

  const centerXsMm = [
    bleed + outerWrap.backBoardRect.x + outerWrap.backBoardRect.width / 2,
    bleed + outerWrap.spineRect.x + outerWrap.spineRect.width / 2,
    bleed + outerWrap.frontBoardRect.x + outerWrap.frontBoardRect.width / 2,
  ];

  for (const cxMm of centerXsMm) {
    const xPt = toPdfX(cxMm);
    if (topTickLen >= 0.5) {
      page.drawLine({
        start: { x: xPt, y: toPdfY(0) },
        end: { x: xPt, y: toPdfY(topTickLen) },
        color: brass,
        thickness: 0.55,
        opacity: 0.9,
      });
    }
    if (bottomTickLen >= 0.5) {
      page.drawLine({
        start: { x: xPt, y: toPdfY(spec.totalHeightMm) },
        end: { x: xPt, y: toPdfY(spec.totalHeightMm - bottomTickLen) },
        color: brass,
        thickness: 0.55,
        opacity: 0.9,
      });
    }
  }
}

function drawPdfBaseZoneRects(
  page: PDFPage,
  spec: StudioCanvasSpec,
  studio: CoverStudioState,
  coords: PdfCoordMapper,
): void {
  const { toPdfX, toPdfY } = coords;
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

function drawPdfOrnament(page: PDFPage, orn: CoverOrnamentLayer, pageH: number): void {
  const compoundD = buildOrnamentCompoundPath(orn);
  if (!compoundD) return;
  const mmToPt = UnitConverter.mmToPoints(1);
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

async function drawPdfCoverTextLayer(
  pdfDoc: PDFDocument,
  page: PDFPage,
  textLayer: CoverTextLayer,
  customFont: CustomFontAsset | null,
  fontCache: Map<StudioFontId, PDFFont>,
  coords: PdfCoordMapper,
): Promise<void> {
  const { toPdfX, toPdfY } = coords;
  const lineItems = computeCoverTextLinePlacements(textLayer);
  const pdfFont = await embedFontByIdInPdf(pdfDoc, textLayer.fontId, customFont, fontCache);
  const tc = hexToRgb01(textLayer.color);
  const textColor = rgb(tc.r, tc.g, tc.b);
  const isFlipped = Boolean(textLayer.flipX || textLayer.flipY);
  const rotDeg = normalizeQuarterTurn(textLayer.rotationDeg);
  // PDF Y-axis points UP, so screen CW +rotDeg equals PDF CCW -rotDeg
  const pdfRotDeg = rotDeg === 0 ? 0 : -rotDeg;
  const layerAnchorXPt = toPdfX(textLayer.xMm);
  const layerAnchorYPt = toPdfY(textLayer.yMm);
  const rad = (pdfRotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  if (isFlipped) {
    const sx = textLayer.flipX ? -1 : 1;
    const sy = textLayer.flipY ? -1 : 1;
    // Compose R(-rotDeg) * S(sx, sy) around (layerAnchorXPt, layerAnchorYPt)
    const a = cos * sx;
    const b = sin * sx;
    const c = -sin * sy;
    const d = cos * sy;
    const e = layerAnchorXPt - a * layerAnchorXPt - c * layerAnchorYPt;
    const f = layerAnchorYPt - b * layerAnchorXPt - d * layerAnchorYPt;
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f));
  }

  const rotateTextPt = (px: number, py: number): { readonly x: number; readonly y: number } => {
    if (isFlipped || pdfRotDeg === 0) return { x: px, y: py };
    const dx = px - layerAnchorXPt;
    const dy = py - layerAnchorYPt;
    return {
      x: layerAnchorXPt + dx * cos - dy * sin,
      y: layerAnchorYPt + dx * sin + dy * cos,
    };
  };
  const drawRotate = !isFlipped && pdfRotDeg !== 0 ? degrees(pdfRotDeg) : undefined;

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
        const pt = rotateTextPt(cursorX, baseYPt);
        page.drawText(ch, {
          x: pt.x,
          y: pt.y,
          size: item.fontSizePt,
          font: pdfFont,
          color: textColor,
          rotate: drawRotate,
        });
        cursorX += pdfFont.widthOfTextAtSize(ch, item.fontSizePt) + trackingPt;
      }
    } else {
      const pt = rotateTextPt(startXPt, baseYPt);
      page.drawText(item.text, {
        x: pt.x,
        y: pt.y,
        size: item.fontSizePt,
        font: pdfFont,
        color: textColor,
        rotate: drawRotate,
      });
    }
  }

  if (isFlipped) {
    page.pushOperators(popGraphicsState());
  }
}

/** Renders the complete 1:1 mm outer cover onto a single PDFDocument page (artwork, vectors, typography, guides). */
async function renderBaseCoverPdfPage(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  spec: StudioCanvasSpec,
  options: {
    rasterDpi?: number;
    skipCanvasRaster?: boolean;
    guideOptions: PdfGuideOptions;
    exportLayerMode?: CoverPdfLayerMode;
  },
): Promise<{ bytes: Uint8Array; pageW: number; pageH: number }> {
  const isBaseOnly = (options?.exportLayerMode ?? 'full') === 'base-only';
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(
    isBaseOnly
      ? 'Bookbinder — Print-Ready Outer Cover Base (For HTV)'
      : 'Bookbinder — Print-Ready Outer Cover',
  );
  pdfDoc.setCreator('Bookbinder Studio');

  const pageW = UnitConverter.mmToPoints(spec.totalWidthMm);
  const pageH = UnitConverter.mmToPoints(spec.totalHeightMm);
  const page = pdfDoc.addPage([pageW, pageH]);

  const toPdfX = (mm: number) => UnitConverter.mmToPoints(mm);
  const toPdfY = (mm: number) => UnitConverter.mmToPoints(spec.totalHeightMm - mm);
  const coords: PdfCoordMapper = { toPdfX, toPdfY };
  const orderedElements = resolveOrderedStudioElements(studio);
  const canRasterize = !options?.skipCanvasRaster && typeof document !== 'undefined';
  const interleavedImages = !isBaseOnly && hasImageAboveVectorElements(studio);
  const fontCache = new Map<StudioFontId, PDFFont>();

  if (interleavedImages) {
    // True interleaved path: crisp vector fills + vector ornaments/text interleaved with transparent image slices in exact layerOrder
    drawPdfBaseZoneRects(page, spec, studio, coords);

    let pendingImages: CoverImageLayer[] = [];
    const flushPendingImages = async () => {
      if (pendingImages.length === 0) return;
      const slice = pendingImages;
      pendingImages = [];
      if (!canRasterize) return;
      const sliceCanvas = await renderCoverImageSliceCanvas(
        spec,
        slice,
        options?.rasterDpi ?? PRINT_DPI,
      );
      const pngBytes = await canvasToPngBytes(sliceCanvas);
      const embeddedImage = await pdfDoc.embedPng(pngBytes);
      page.drawImage(embeddedImage, { x: 0, y: 0, width: pageW, height: pageH });
    };

    for (const item of orderedElements) {
      if (item.kind === 'image') {
        pendingImages.push(item.layer);
      } else {
        await flushPendingImages();
        if (item.kind === 'ornament') {
          drawPdfOrnament(page, item.layer, pageH);
        } else {
          await drawPdfCoverTextLayer(pdfDoc, page, item.layer, customFont, fontCache, coords);
        }
      }
    }
    await flushPendingImages();
  } else {
    // Fast path: all images sit below ornaments & text (or base-only mode)
    if (studio.layers.length > 0 && canRasterize) {
      const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
        includeSpineText: false,
        includeTextAndOrnaments: !isBaseOnly,
        dpi: options?.rasterDpi ?? PRINT_DPI,
      });
      const pngBytes = await canvasToPngBytes(canvas);
      const embeddedImage = await pdfDoc.embedPng(pngBytes);
      page.drawImage(embeddedImage, { x: 0, y: 0, width: pageW, height: pageH });
    } else {
      drawPdfBaseZoneRects(page, spec, studio, coords);
    }

    // 2. Vector Ornaments & Cover Text Layers in exact unified bottom-to-top layerOrder (omitted in 'base-only' HTV mode)
    if (!isBaseOnly) {
      for (const item of orderedElements) {
        if (item.kind === 'ornament') {
          drawPdfOrnament(page, item.layer, pageH);
        } else if (item.kind === 'text') {
          await drawPdfCoverTextLayer(pdfDoc, page, item.layer, customFont, fontCache, coords);
        }
      }
    }
  }

  // 2c. True Vector Spine Typography (omitted in 'base-only' HTV mode)
  if (!isBaseOnly) {
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
  }

  // 3. Independent Cut Outline (or Outer Corner Registration Marks) & Interior Fold Lines
  if (options.guideOptions.includeCutLines) {
    await drawCoverCutOutline(pdfDoc, page, geometry, spec, coords);
  } else {
    drawOuterRegistrationMarks(page, geometry, spec, coords);
  }

  if (options.guideOptions.includeFoldLines) {
    drawCoverInteriorFoldLines(page, geometry, spec, coords);
  }

  // 4. Subtle outer HTV center-alignment ticks for Base-Only mode
  if (isBaseOnly) {
    drawHtvCenterAlignmentTicks(page, geometry, spec, coords);
  }

  return { bytes: await pdfDoc.save(), pageW, pageH };
}

export interface PrintReadyCoverPdfOptions extends PdfGuideOptionsInput {
  /** 'full' prints artwork + vector text & ornaments; 'base-only' prints artwork/background + guides & HTV center ticks only. */
  readonly exportLayerMode?: CoverPdfLayerMode;
  /** Target output paper sheet or roll media ID. */
  readonly printMediaId?: PrintMediaId;
  /** Backward-compatible alias for printMediaId. */
  readonly printMedia?: PrintMediaId;
  /** Rasterization resolution for uploaded artwork layers (300 or 600 DPI; defaults to 300). */
  readonly dpi?: 300 | 600;
  /** Backward-compatible alias for dpi. */
  readonly rasterDpi?: number;
  /** Horizontal overlap zone width in mm for 2-sheet tiled output (5..30 mm; defaults to 10). */
  readonly tileOverlapMm?: number;
  /** Draw a 50 mm 1:1 calibration ruler bar for verifying 100% print scale. */
  readonly includeScaleBar?: boolean;
  /** When true on 2-sheet softcover-jacket ('separate'), appends detached inner pockets page(s) to the exported PDF. */
  readonly appendInnerPocketsPage?: boolean;
  /** Sheet size for appended inner pockets page(s). Defaults to 'letter'. */
  readonly innerPageSizeId?: PageSizeId;
  /** Optional custom wide-format roll width in mm when printMediaId === 'roll-custom'. */
  readonly customRollWidthMm?: number;
  /** Optional per-edge hardware unprintable printer margins. */
  readonly printerMargins?: PrinterMargins;
  /** Optional wide-format roll multi-up nesting / gang-sheet configuration. */
  readonly rollNesting?: RollNestingExportOptions;
  /** Optional fixed cut-sheet multi-up / multi-book nesting configuration. */
  readonly sheetNesting?: SheetNestingExportOptions;
  /** Skip DOM canvas rasterization (useful in headless/unit tests without HTML canvas). */
  readonly skipCanvasRaster?: boolean;
}

/**
 * Generates the Print-Ready Outer Cover PDF (`outer_cover_print.pdf`) at exact 1:1 physical mm scale:
 * - Solid vector fills or 300/600 DPI embedded artwork raster
 * - True vector spine & cover typography via pdf-lib + fontkit (omitted when exportLayerMode === 'base-only')
 * - Independent cut outline, interior dashed fold lines, and external fold guide ticks
 * - Shared print-media sheet centering, 2-sheet tiling with overlap marks, wide-format roll nesting, and optional 50 mm scale check bar
 */
export async function generatePrintReadyRollPdf(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options?: PrintReadyCoverPdfOptions,
): Promise<Uint8Array> {
  const rasterDpi = options?.dpi ?? options?.rasterDpi ?? PRINT_DPI;
  const spec = computeStudioCanvasSpec(geometry, rasterDpi);
  const guideOptions = PdfGuideOptionsModel.resolve(
    'print',
    options,
    studio.cutLineMode === 'full-cut-miter',
  );
  const { bytes: sourceBytes } = await renderBaseCoverPdfPage(
    geometry,
    studio,
    customFont,
    spec,
    {
      rasterDpi,
      skipCanvasRaster: options?.skipCanvasRaster,
      guideOptions,
      exportLayerMode: options?.exportLayerMode,
    },
  );

  const externalFoldGuideTicks = guideOptions.includeFoldGuideTicks
    ? computeExternalFoldGuideTicks(
        geometry.outerWrap.outerCutPolygon,
        geometry.outerWrap.foldLines,
      )
    : [];

  const printMediaId = options?.printMediaId ?? options?.printMedia ?? 'exact-auto';
  const mediaSpec = getPrintMediaSpec(printMediaId);
  const { capabilities } = resolveBindingStrategy(geometry);

  if (options?.rollNesting?.enabled && mediaSpec.kind === 'roll') {
    const nestedBytes = await composeRollNestedCoverPdf(sourceBytes, geometry, printMediaId, {
      rollNesting: options.rollNesting,
      customRollWidthMm: options.customRollWidthMm,
      printerMargins: options.printerMargins,
      includeScaleBar: options.includeScaleBar,
      coverLabel: studio.spineText.title.trim() || 'Outer Cover',
      externalFoldGuideTicks,
      bleedMm: spec.bleedMm,
      guideOptions,
    });

    if (
      options.appendInnerPocketsPage &&
      !options.rollNesting.packInnerPockets &&
      !capabilities.usesChipboard &&
      capabilities.usesInnerPockets
    ) {
      return appendDetachedInnerPocketsPdf(
        nestedBytes,
        geometry,
        options.innerPageSizeId ?? 'letter',
        guideOptions,
      );
    }

    return nestedBytes;
  }

  if (options?.sheetNesting?.enabled && mediaSpec.kind === 'sheet') {
    const nestedBytes = await composeSheetNestedCoverPdf(sourceBytes, geometry, printMediaId, {
      sheetNesting: options.sheetNesting,
      printerMargins: options.printerMargins,
      includeScaleBar: options.includeScaleBar,
      coverLabel: studio.spineText.title.trim() || 'Outer Cover',
      externalFoldGuideTicks,
      bleedMm: spec.bleedMm,
      guideOptions,
    });

    if (
      options.appendInnerPocketsPage &&
      !options.sheetNesting.packInnerPockets &&
      !capabilities.usesChipboard &&
      capabilities.usesInnerPockets
    ) {
      return appendDetachedInnerPocketsPdf(
        nestedBytes,
        geometry,
        options.innerPageSizeId ?? 'letter',
        guideOptions,
      );
    }

    return nestedBytes;
  }

  const outerBytes = await layoutPdfToPrintMedia(sourceBytes, spec.totalWidthMm, spec.totalHeightMm, {
    printMediaId,
    tileOverlapMm: options?.tileOverlapMm,
    includeScaleBar: options?.includeScaleBar,
    bleedMm: spec.bleedMm,
    printerMargins: options?.printerMargins,
    customRollWidthMm: options?.customRollWidthMm,
    externalFoldGuideTicks,
  });

  if (
    options?.appendInnerPocketsPage &&
    geometry.bindingStyle === 'softcover-jacket' &&
    geometry.softcoverPocketMode === 'separate'
  ) {
    return appendDetachedInnerPocketsPdf(
      outerBytes,
      geometry,
      options.innerPageSizeId ?? 'letter',
      guideOptions,
    );
  }

  return outerBytes;
}
