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
} from 'pdf-lib';
import { escapeXml } from '@/lib/utils';
import { CoverTextLayerModel, type CoverTextLayer } from '@/types/coverElements';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type Point2D,
  type Rect2D,
} from '@/types/geometry';
import { CoverStudioModel, type CoverStudioState, type StudioFontId } from '@/types/studio';
import type { LayerClipZone, QuickFitTarget } from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from './classicOrnaments';
import {
  getCuratedFont,
  loadCuratedFontBytes,
  resolveFontCssFamily,
  type CustomFontAsset,
} from './fonts';

export interface StudioCanvasSpec {
  readonly bleedMm: number;
  readonly totalWidthMm: number;
  readonly totalHeightMm: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly backZoneRect: Rect2D;
  readonly spineZoneRect: Rect2D;
  readonly frontZoneRect: Rect2D;
  readonly fullWrapRect: Rect2D;
}

export interface SpineTextPlacement {
  readonly text: string;
  readonly anchorXMm: number;
  readonly anchorYMm: number;
  readonly fontSizePt: number;
  readonly rotationDegCss: 0 | 90 | -90;
  readonly kind: 'inline' | 'title' | 'author';
}

export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return { r: 0.12, g: 0.23, b: 0.32 };
  }
  return {
    r: Number.parseInt(clean.slice(0, 2), 16) / 255,
    g: Number.parseInt(clean.slice(2, 4), 16) / 255,
    b: Number.parseInt(clean.slice(4, 6), 16) / 255,
  };
}

/** Builds an SVG transform attribute flipping a rectangular layer around its center. */
export function buildLayerFlipTransform(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  flipX?: boolean,
  flipY?: boolean,
): string | undefined {
  if (!flipX && !flipY) return undefined;
  const cx = roundTo(xMm + widthMm / 2, 3);
  const cy = roundTo(yMm + heightMm / 2, 3);
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  return `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
}

/** Builds an SVG transform attribute flipping an element around a point (cx, cy). */
export function buildPointFlipTransform(
  cx: number,
  cy: number,
  flipX?: boolean,
  flipY?: boolean,
): string | undefined {
  if (!flipX && !flipY) return undefined;
  const rx = roundTo(cx, 3);
  const ry = roundTo(cy, 3);
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  return `translate(${rx} ${ry}) scale(${sx} ${sy}) translate(${-rx} ${-ry})`;
}

export function computeStudioCanvasSpec(
  geometry: CaseGeometry,
  dpi = PRINT_DPI,
): StudioCanvasSpec {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const totalWidthMm = outerWrap.widthMm + bleedMm * 2;
  const totalHeightMm = outerWrap.heightMm + bleedMm * 2;

  const spineZoneStart = bleedMm + outerWrap.leftHingeRect.x;
  const frontZoneStart = bleedMm + outerWrap.frontBoardRect.x;

  return {
    bleedMm,
    totalWidthMm,
    totalHeightMm,
    pixelWidth: UnitConverter.mmToPixels(totalWidthMm, dpi),
    pixelHeight: UnitConverter.mmToPixels(totalHeightMm, dpi),
    backZoneRect: {
      x: 0,
      y: 0,
      width: spineZoneStart,
      height: totalHeightMm,
    },
    spineZoneRect: {
      x: spineZoneStart,
      y: 0,
      width: frontZoneStart - spineZoneStart,
      height: totalHeightMm,
    },
    frontZoneRect: {
      x: frontZoneStart,
      y: 0,
      width: totalWidthMm - frontZoneStart,
      height: totalHeightMm,
    },
    fullWrapRect: {
      x: 0,
      y: 0,
      width: totalWidthMm,
      height: totalHeightMm,
    },
  };
}

export function resolveZoneClipRect(
  spec: StudioCanvasSpec,
  clipZone: LayerClipZone,
): Rect2D {
  switch (clipZone) {
    case 'front':
      return spec.frontZoneRect;
    case 'spine':
      return spec.spineZoneRect;
    case 'back':
      return spec.backZoneRect;
    case 'none':
      return spec.fullWrapRect;
  }
}

export function resolveQuickFitRect(
  spec: StudioCanvasSpec,
  target: QuickFitTarget,
): Rect2D {
  switch (target) {
    case 'front':
      return spec.frontZoneRect;
    case 'spine':
      return spec.spineZoneRect;
    case 'back':
      return spec.backZoneRect;
    case 'fullWrap':
      return spec.fullWrapRect;
  }
}

export function computeSpineTextPlacements(
  geometry: CaseGeometry,
  studio: CoverStudioState,
): readonly SpineTextPlacement[] {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const { spineText } = studio;
  const title = spineText.title.trim();
  const author = spineText.author.trim();

  if (!title && !author) return [];

  const spineCenterX =
    bleedMm + outerWrap.spineRect.x + outerWrap.spineRect.width / 2 + spineText.opticalNudgeMm;
  const boardTopY = bleedMm + outerWrap.spineRect.y;
  const boardH = outerWrap.spineRect.height;

  const baseFontSizePt = CoverStudioModel.effectiveSpineFontSizePt(
    spineText.fontSizePt,
    outerWrap.spineRect.width,
  );
  const verticalRotDeg: 90 | -90 = spineText.orientation === 'top-to-bottom' ? 90 : -90;
  const isAuthorHorizontal = spineText.authorOrientation === 'horizontal';

  if (spineText.layout === 'inline' && !isAuthorHorizontal) {
    return [
      {
        text: CoverStudioModel.formatInlineSpineText(title, author),
        anchorXMm: spineCenterX,
        anchorYMm: boardTopY + boardH / 2,
        fontSizePt: baseFontSizePt,
        rotationDegCss: verticalRotDeg,
        kind: 'inline',
      },
    ];
  }

  // Stacked layout (or Horizontal author mode): Title upper-center, Author near tail of spine
  const placements: SpineTextPlacement[] = [];
  if (title) {
    placements.push({
      text: title,
      anchorXMm: spineCenterX,
      anchorYMm: boardTopY + boardH * (author ? (isAuthorHorizontal ? 0.42 : 0.36) : 0.5),
      fontSizePt: baseFontSizePt,
      rotationDegCss: verticalRotDeg,
      kind: 'title',
    });
  }

  if (author) {
    const requestedAuthorPt = roundTo(Math.max(6, baseFontSizePt * 0.78), 1);

    if (isAuthorHorizontal) {
      const lines = CoverStudioModel.splitHorizontalAuthorLines(author);
      const horizPt = CoverStudioModel.horizontalAuthorFontSizePt(
        lines,
        requestedAuthorPt,
        outerWrap.spineRect.width,
      );
      const lineHeightMm = UnitConverter.pointsToMm(horizPt) * 1.28;
      const blockCenterY = boardTopY + boardH * (title ? 0.88 : 0.5);
      const firstLineY = blockCenterY - ((lines.length - 1) * lineHeightMm) / 2;

      lines.forEach((line, idx) => {
        placements.push({
          text: line,
          anchorXMm: spineCenterX,
          anchorYMm: roundTo(firstLineY + idx * lineHeightMm, 2),
          fontSizePt: horizPt,
          rotationDegCss: 0,
          kind: 'author',
        });
      });
    } else {
      placements.push({
        text: author,
        anchorXMm: spineCenterX,
        anchorYMm: boardTopY + boardH * (title ? 0.8 : 0.5),
        fontSizePt: requestedAuthorPt,
        rotationDegCss: verticalRotDeg,
        kind: 'author',
      });
    }
  }
  return placements;
}

export interface CoverTextLinePlacement {
  readonly text: string;
  readonly anchorXMm: number;
  readonly anchorYMm: number;
  readonly fontSizePt: number;
  readonly letterSpacingEm: number;
  readonly align: CoverTextLayer['align'];
  readonly color: string;
  readonly fontId: StudioFontId;
}

/** Computes exact multi-line millimeter anchors for a draggable CoverTextLayer. */
export function computeCoverTextLinePlacements(
  layer: CoverTextLayer,
): readonly CoverTextLinePlacement[] {
  const lines = CoverTextLayerModel.displayLines(layer);
  const stepMm = UnitConverter.pointsToMm(layer.fontSizePt) * layer.lineHeight;
  const firstY = layer.yMm - ((lines.length - 1) * stepMm) / 2;

  return lines.map((line, idx) => ({
    text: line,
    anchorXMm: layer.xMm,
    anchorYMm: roundTo(firstY + idx * stepMm, 2),
    fontSizePt: layer.fontSizePt,
    letterSpacingEm: layer.letterSpacingEm,
    align: layer.align,
    color: layer.color,
    fontId: layer.fontId,
  }));
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode cover artwork image.'));
    img.src = src;
  });
}

export async function renderCoverArtworkCanvas(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  options: { includeSpineText: boolean; dpi?: number },
): Promise<HTMLCanvasElement> {
  const dpi = options.dpi ?? PRINT_DPI;
  const spec = computeStudioCanvasSpec(geometry, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = spec.pixelWidth;
  canvas.height = spec.pixelHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D rendering context for cover export.');
  }

  const pxPerMm = dpi / 25.4;
  const toPx = (mm: number) => mm * pxPerMm;

  // 1. Solid zone backgrounds
  ctx.fillStyle = studio.backBgColor;
  ctx.fillRect(
    toPx(spec.backZoneRect.x),
    toPx(spec.backZoneRect.y),
    toPx(spec.backZoneRect.width),
    toPx(spec.backZoneRect.height),
  );

  ctx.fillStyle = studio.spineBgColor;
  ctx.fillRect(
    toPx(spec.spineZoneRect.x),
    toPx(spec.spineZoneRect.y),
    toPx(spec.spineZoneRect.width),
    toPx(spec.spineZoneRect.height),
  );

  ctx.fillStyle = studio.frontBgColor;
  ctx.fillRect(
    toPx(spec.frontZoneRect.x),
    toPx(spec.frontZoneRect.y),
    toPx(spec.frontZoneRect.width),
    toPx(spec.frontZoneRect.height),
  );

  // 2. Uploaded free-form artwork layers rendered bottom-to-top
  for (const layer of studio.layers) {
    const clipRect = resolveZoneClipRect(spec, layer.clipZone);
    const img = await loadHtmlImage(layer.dataUrl);
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      toPx(clipRect.x),
      toPx(clipRect.y),
      toPx(clipRect.width),
      toPx(clipRect.height),
    );
    ctx.clip();
    if (layer.flipX || layer.flipY) {
      const cx = toPx(layer.xMm + layer.widthMm / 2);
      const cy = toPx(layer.yMm + layer.heightMm / 2);
      const wPx = toPx(layer.widthMm);
      const hPx = toPx(layer.heightMm);
      ctx.translate(cx, cy);
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx);
    } else {
      ctx.drawImage(
        img,
        toPx(layer.xMm),
        toPx(layer.yMm),
        toPx(layer.widthMm),
        toPx(layer.heightMm),
      );
    }
    ctx.restore();
  }

  // 3. Optional rasterized classic ornaments, cover text layers & spine typography (used for 300 DPI PNG export)
  if (options.includeSpineText) {
    // 3a. Classic Bookbindery Vector Ornaments & Custom SVG Stamps
    for (const orn of studio.ornaments ?? []) {
      const compoundD = buildOrnamentCompoundPath(orn);
      if (!compoundD || typeof Path2D === 'undefined') continue;
      const style = getOrnamentSvgStyle(orn);
      const path2d = new Path2D(compoundD);
      ctx.save();
      ctx.scale(pxPerMm, pxPerMm);
      if (style.fill !== 'none') {
        ctx.fillStyle = style.fill;
        ctx.fill(path2d);
      }
      if (style.stroke !== 'none' && style.strokeWidthMm > 0) {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.strokeWidthMm;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(path2d);
      }
      ctx.restore();
    }

    // 3b. Draggable Front / Back / Spine Cover Text Layers
    for (const textLayer of studio.textLayers ?? []) {
      const fontFamily = resolveFontCssFamily(textLayer.fontId, customFont);
      const lineItems = computeCoverTextLinePlacements(textLayer);
      ctx.save();
      if (textLayer.flipX || textLayer.flipY) {
        const cx = toPx(textLayer.xMm);
        const cy = toPx(textLayer.yMm);
        ctx.translate(cx, cy);
        ctx.scale(textLayer.flipX ? -1 : 1, textLayer.flipY ? -1 : 1);
        ctx.translate(-cx, -cy);
      }
      ctx.fillStyle = textLayer.color;
      ctx.textAlign = textLayer.align;
      ctx.textBaseline = 'middle';

      for (const item of lineItems) {
        if (!item.text.trim()) continue;
        const fontSizePx = (item.fontSizePt / 72) * dpi;
        ctx.save();
        ctx.font = `400 ${fontSizePx}px ${fontFamily}`;
        if ('letterSpacing' in ctx) {
          (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
            `${item.letterSpacingEm}em`;
        }
        ctx.fillText(item.text, toPx(item.anchorXMm), toPx(item.anchorYMm));
        ctx.restore();
      }
      ctx.restore();
    }

    // 3c. Dedicated Spine Typography
    const placements = computeSpineTextPlacements(geometry, studio);
    const fontFamily = resolveFontCssFamily(studio.spineText.fontId, customFont);
    ctx.fillStyle = studio.spineText.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of placements) {
      const fontSizePx = (item.fontSizePt / 72) * dpi;
      ctx.save();
      ctx.translate(toPx(item.anchorXMm), toPx(item.anchorYMm));
      ctx.rotate((item.rotationDegCss * Math.PI) / 180);
      ctx.font = `400 ${fontSizePx}px ${fontFamily}`;
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    }
  }

  return canvas;
}

export async function exportCoverPng300Dpi(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
): Promise<Blob> {
  const canvas = await renderCoverArtworkCanvas(geometry, studio, customFont, {
    includeSpineText: true,
    dpi: PRINT_DPI,
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode 300 DPI PNG blob.'));
    }, 'image/png');
  });
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas PNG export failed.'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
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
  options?: { rasterDpi?: number; skipCanvasRaster?: boolean },
): Promise<Uint8Array> {
  const spec = computeStudioCanvasSpec(geometry, options?.rasterDpi ?? PRINT_DPI);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bookbinder — Print-Ready Outer Cover (1:1 mm)');
  pdfDoc.setCreator('Bookbinder Studio');

  const pageW = UnitConverter.mmToPoints(spec.totalWidthMm);
  const pageH = UnitConverter.mmToPoints(spec.totalHeightMm);
  const page = pdfDoc.addPage([pageW, pageH]);

  const toPdfX = (mm: number) => UnitConverter.mmToPoints(mm);
  const toPdfY = (mm: number) => UnitConverter.mmToPoints(spec.totalHeightMm - mm);

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
                acc + pdfFont.widthOfTextAtSize(ch, item.fontSizePt) + (i < chars.length - 1 ? trackingPt : 0),
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
  const bleed = spec.bleedMm;
  const shiftedCutPoly = GeometryPrimitives.translatePolygon(
    geometry.outerWrap.outerCutPolygon,
    bleed,
    bleed,
  );

  if (studio.cutLineMode === 'full-cut-miter') {
    const hairlineCut = rgb(0.92, 0.14, 0.14);
    const hairlineFold = rgb(0.12, 0.42, 0.88);
    const { outerWrap } = geometry;

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
  } else {
    // Bleed + Outer Corner Registration Marks Only (outside the trimmed wrap boundary)
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
    drawMark({ x: xL + leg, y: spec.totalHeightMm }, { x: xL + leg, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.3) });
    drawMark({ x: xR - leg, y: spec.totalHeightMm }, { x: xR - leg, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.3) });

    drawMark({ x: 0, y: yT + leg }, { x: Math.max(0.5, xL - 0.3), y: yT + leg });
    drawMark({ x: 0, y: yB - leg }, { x: Math.max(0.5, xL - 0.3), y: yB - leg });
    drawMark({ x: spec.totalWidthMm, y: yT + leg }, { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.3), y: yT + leg });
    drawMark({ x: spec.totalWidthMm, y: yB - leg }, { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.3), y: yB - leg });

    // Corner outer crop brackets if bleed >= 1mm
    if (markLen >= 1) {
      drawMark({ x: 0, y: yT }, { x: Math.max(0.5, xL - 0.5), y: yT });
      drawMark({ x: xL, y: 0 }, { x: xL, y: Math.max(0.5, yT - 0.5) });
      drawMark({ x: spec.totalWidthMm, y: yT }, { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.5), y: yT });
      drawMark({ x: xR, y: 0 }, { x: xR, y: Math.max(0.5, yT - 0.5) });
      drawMark({ x: 0, y: yB }, { x: Math.max(0.5, xL - 0.5), y: yB });
      drawMark({ x: xL, y: spec.totalHeightMm }, { x: xL, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.5) });
      drawMark({ x: spec.totalWidthMm, y: yB }, { x: Math.min(spec.totalWidthMm - 0.5, xR + 0.5), y: yB });
      drawMark({ x: xR, y: spec.totalHeightMm }, { x: xR, y: Math.min(spec.totalHeightMm - 0.5, yB + 0.5) });
    }
  }

  return pdfDoc.save();
}

/**
 * Affinity Round-Trip 1:1 mm SVG Export (`outer_cover_300dpi.svg`):
 * Embeds the 300 DPI composed artwork layer + editable native vector spine typography +
 * Affinity-ready `cut-lines` and `board-guides` groups.
 */
export function generateAffinityCoverSvg(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  artworkPngDataUrl?: string,
): string {
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const { outerWrap } = geometry;
  const bleed = spec.bleedMm;
  const fmt = (n: number) => String(roundTo(n, 3));

  const shiftedCutPoly = GeometryPrimitives.translatePolygon(
    outerWrap.outerCutPolygon,
    bleed,
    bleed,
  );
  const cutPath = GeometryPrimitives.polygonToSvgPath(shiftedCutPoly, 3);

  const fontFamily = escapeXml(resolveFontCssFamily(studio.spineText.fontId, customFont));
  const textPlacements = computeSpineTextPlacements(geometry, studio);

  const artworkLayer = artworkPngDataUrl
    ? `    <image x="0" y="0" width="${fmt(spec.totalWidthMm)}" height="${fmt(spec.totalHeightMm)}" href="${artworkPngDataUrl}" preserveAspectRatio="none" />`
    : `    <rect x="${fmt(spec.backZoneRect.x)}" y="0" width="${fmt(spec.backZoneRect.width)}" height="${fmt(spec.totalHeightMm)}" fill="${studio.backBgColor}" />
    <rect x="${fmt(spec.spineZoneRect.x)}" y="0" width="${fmt(spec.spineZoneRect.width)}" height="${fmt(spec.totalHeightMm)}" fill="${studio.spineBgColor}" />
    <rect x="${fmt(spec.frontZoneRect.x)}" y="0" width="${fmt(spec.frontZoneRect.width)}" height="${fmt(spec.totalHeightMm)}" fill="${studio.frontBgColor}" />`;

  const ornamentNodes = (studio.ornaments ?? [])
    .map((orn) => {
      const d = buildOrnamentCompoundPath(orn);
      if (!d) return '';
      const style = getOrnamentSvgStyle(orn);
      const strokeAttrs =
        style.stroke !== 'none' && style.strokeWidthMm > 0
          ? ` stroke="${escapeXml(style.stroke)}" stroke-width="${fmt(style.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round"`
          : '';
      return `    <path d="${d}" fill="${escapeXml(style.fill)}"${strokeAttrs} />`;
    })
    .filter(Boolean)
    .join('\n');

  const coverTextNodes = (studio.textLayers ?? [])
    .map((layer) => {
      const layerFont = escapeXml(resolveFontCssFamily(layer.fontId, customFont));
      const anchor = layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle';
      const flipTransform = buildPointFlipTransform(layer.xMm, layer.yMm, layer.flipX, layer.flipY);
      const indent = flipTransform ? '      ' : '    ';
      const lines = computeCoverTextLinePlacements(layer)
        .filter((item) => item.text.trim().length > 0)
        .map((item) => {
          const fontSizeMm = UnitConverter.pointsToMm(item.fontSizePt);
          const trackingAttr =
            Math.abs(item.letterSpacingEm) > 0.001
              ? ` letter-spacing="${fmt(item.letterSpacingEm)}em"`
              : '';
          return `${indent}<text x="${fmt(item.anchorXMm)}" y="${fmt(item.anchorYMm)}" font-family="${layerFont}" font-size="${fmt(fontSizeMm)}"${trackingAttr} fill="${escapeXml(item.color)}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(item.text)}</text>`;
        });
      if (lines.length === 0) return '';
      if (flipTransform) {
        return `    <g transform="${flipTransform}">\n${lines.join('\n')}\n    </g>`;
      }
      return lines.join('\n');
    })
    .filter(Boolean)
    .join('\n');

  const textNodes = textPlacements
    .map((item) => {
      const fontSizeMm = UnitConverter.pointsToMm(item.fontSizePt);
      return `    <text x="${fmt(item.anchorXMm)}" y="${fmt(item.anchorYMm)}" font-family="${fontFamily}" font-size="${fmt(fontSizeMm)}" fill="${studio.spineText.textColor}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${item.rotationDegCss} ${fmt(item.anchorXMm)} ${fmt(item.anchorYMm)})">${escapeXml(item.text)}</text>`;
    })
    .join('\n');

  const boardRects = [
    outerWrap.backBoardRect,
    outerWrap.spineRect,
    outerWrap.frontBoardRect,
  ]
    .map(
      (r) =>
        `    <rect x="${fmt(r.x + bleed)}" y="${fmt(r.y + bleed)}" width="${fmt(r.width)}" height="${fmt(r.height)}" />`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmt(spec.totalWidthMm)}mm"
     height="${fmt(spec.totalHeightMm)}mm"
     viewBox="0 0 ${fmt(spec.totalWidthMm)} ${fmt(spec.totalHeightMm)}">
  <title>Composed Outer Cover — Affinity Round-Trip (1:1 mm, 300 DPI)</title>
  <g id="artwork-layer">
${artworkLayer}
  </g>
  <g id="classic-ornaments">
${ornamentNodes}
  </g>
  <g id="cover-typography">
${coverTextNodes}
  </g>
  <g id="spine-typography">
${textNodes}
  </g>
  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.35">
    <path d="${cutPath}" />
  </g>
  <g id="board-guides" fill="none" stroke="#0066FF" stroke-width="0.3" stroke-dasharray="4 2">
${boardRects}
  </g>
</svg>
`;
}
