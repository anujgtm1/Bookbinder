import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { calculateCaseGeometry } from '@/core/geometry';
import { drawScaleCheckBar, layoutPdfToPrintMedia } from '@/core/pdfSheetLayout';
import {
  SCALE_BAR_BOX_H_MM,
  SCALE_BAR_BOX_W_MM,
} from '@/core/scaleBarPlacement';
import {
  compileSeriesBookToCoverStudio,
  computeSeriesShelfLayout,
  type SeriesBookLayout,
} from '@/core/seriesSpines';
import { canvasToPngBytes, loadHtmlImage } from '@/lib/canvasImage';
import { hexToRgb01 } from '@/lib/color';
import { fmtMm } from '@/lib/svgFormat';
import { getPageSizeSpec } from '@/resources/paperSpecs';
import type { PageSizeId } from '@/types/bookParams';
import type { CoverOrnamentLayer } from '@/types/coverElements';
import type { Rect2D } from '@/types/geometry';
import type { ProjectId } from '@/types/projectLibrary';
import type { SeriesProject } from '@/types/seriesSpines';
import { CoverStudioModel, type CoverStudioState, type StudioFontId } from '@/types/studio';
import { PRINT_DPI, UnitConverter, roundTo } from '@/types/units';
import { buildOrnamentCompoundPath } from './classicOrnaments';
import {
  bakeGlyphRunsToPaths,
  buildCornerBracketsPath,
  resolveFontBytesById,
  type GlyphRunPlacement,
} from './cricutExport';
import { generatePrintReadyRollPdf } from './exporters/coverPdfExporter';
import { getCuratedFont, loadCuratedFontBytes, type CustomFontAsset } from './fonts';

export interface SeriesCricutHtvOptions {
  readonly gapMm: number;
  readonly mirrorForHtv: boolean;
  readonly includeWeedingBox: boolean;
  readonly includeRegistrationMarks: boolean;
  readonly includeBands: boolean;
  readonly groupByColor: boolean;
}

export const DEFAULT_SERIES_CRICUT_OPTIONS: Readonly<SeriesCricutHtvOptions> = {
  gapMm: 6,
  mirrorForHtv: false,
  includeWeedingBox: true,
  includeRegistrationMarks: true,
  includeBands: true,
  groupByColor: false,
};

export interface SeriesCricutHtvResult {
  readonly svg: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly spineCount: number;
  readonly pathCount: number;
  readonly foilColors: readonly string[];
  readonly fileName: string;
  readonly matFit: {
    readonly joy: boolean;
    readonly mat12x12: boolean;
    readonly mat12x24: boolean;
  };
}

export type SeriesProofPaperSize = 'custom-fit' | PageSizeId;

export interface SeriesSpineProofPdfOptions {
  readonly paperSize: SeriesProofPaperSize;
  readonly includeScaleBar: boolean;
  readonly includeAlignmentGuides?: boolean;
  readonly skipCanvasRaster?: boolean;
}

export interface SeriesSpineProofPdfResult {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly fileName: string;
}

export interface SeriesCoversPdfOptions {
  readonly dpi?: 300 | 600;
  readonly includeScaleBar?: boolean;
  readonly skipCanvasRaster?: boolean;
  readonly onProgress?: (done: number, total: number, bookTitle: string) => void;
}

export interface SeriesCoversPdfResult {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly bookCount: number;
  readonly fileName: string;
}

function slugifySeriesName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return cleaned || 'series_spines';
}

function normalizeFoilHex(raw: string | undefined, fallback = '#111111'): string {
  const trimmed = (raw ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[0]}${trimmed[0]}${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  return fallback.toUpperCase();
}

function mergeBounds(a: Rect2D | null, b: Rect2D | null): Rect2D | null {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function rectToClosedPath(
  rect: Rect2D,
  canvasWidthMm: number,
  mirrorX: boolean,
): string {
  const x1 = mirrorX ? canvasWidthMm - (rect.x + rect.width) : rect.x;
  const x2 = x1 + rect.width;
  const y1 = rect.y;
  const y2 = rect.y + rect.height;
  return `M ${fmtMm(x1)} ${fmtMm(y1)} L ${fmtMm(x2)} ${fmtMm(y1)} L ${fmtMm(x2)} ${fmtMm(y2)} L ${fmtMm(x1)} ${fmtMm(y2)} Z`;
}

function buildBookSpineGlyphRuns(
  bookLayout: SeriesBookLayout,
  series: SeriesProject,
  gangCenterXMm: number,
  gangOffsetYMm: number,
): { readonly textRuns: readonly GlyphRunPlacement[]; readonly badgeRuns: readonly GlyphRunPlacement[] } {
  const { shared } = series;
  const { book } = bookLayout;
  const title = book.title.trim();
  const author = book.author.trim();
  const verticalRotDeg: 90 | -90 = shared.orientation === 'top-to-bottom' ? 90 : -90;
  const isAuthorHorizontal = shared.authorOrientation === 'horizontal';

  const textRuns: GlyphRunPlacement[] = [];
  const badgeRuns: GlyphRunPlacement[] = [];

  if (bookLayout.volumeLabel) {
    badgeRuns.push({
      text:
        shared.volumeNumberStyle === 'roman'
          ? bookLayout.volumeLabel.toUpperCase()
          : bookLayout.volumeLabel,
      anchorXMm: gangCenterXMm,
      anchorYMm: gangOffsetYMm + bookLayout.volumeBadgeYMm,
      fontSizePt: bookLayout.effectiveVolumeBadgeSizePt,
      rotationDegCss: 0,
      align: 'center',
      letterSpacingEm: 0.08,
    });
  }

  if (shared.titleLayout === 'inline' && !isAuthorHorizontal) {
    const inlineText = CoverStudioModel.formatInlineSpineText(title, author);
    if (inlineText) {
      textRuns.push({
        text: inlineText,
        anchorXMm: gangCenterXMm,
        anchorYMm: gangOffsetYMm + bookLayout.titleCenterYMm,
        fontSizePt: bookLayout.effectiveTitleSizePt,
        rotationDegCss: verticalRotDeg,
        align: 'center',
        letterSpacingEm: 0,
      });
    }
    return { textRuns, badgeRuns };
  }

  if (title) {
    const titleY =
      !isAuthorHorizontal && author
        ? gangOffsetYMm + bookLayout.shelfYMm + bookLayout.spineHeightMm * 0.38
        : gangOffsetYMm + bookLayout.titleCenterYMm;
    textRuns.push({
      text: title,
      anchorXMm: gangCenterXMm,
      anchorYMm: titleY,
      fontSizePt: bookLayout.effectiveTitleSizePt,
      rotationDegCss: verticalRotDeg,
      align: 'center',
      letterSpacingEm: 0,
    });
  }

  if (author) {
    if (isAuthorHorizontal) {
      const lines = bookLayout.effectiveAuthorLines;
      const lineHeightMm = UnitConverter.pointsToMm(bookLayout.effectiveAuthorSizePt) * 1.24;
      const blockCenterY = gangOffsetYMm + bookLayout.authorYMm;
      const firstLineY = blockCenterY - ((lines.length - 1) * lineHeightMm) / 2;
      lines.forEach((line, idx) => {
        textRuns.push({
          text: line,
          anchorXMm: gangCenterXMm,
          anchorYMm: roundTo(firstLineY + idx * lineHeightMm, 2),
          fontSizePt: bookLayout.effectiveAuthorSizePt,
          rotationDegCss: 0,
          align: 'center',
          letterSpacingEm: 0.04,
        });
      });
    } else {
      textRuns.push({
        text: author,
        anchorXMm: gangCenterXMm,
        anchorYMm: gangOffsetYMm + bookLayout.shelfYMm + bookLayout.spineHeightMm * 0.78,
        fontSizePt: bookLayout.effectiveAuthorSizePt,
        rotationDegCss: verticalRotDeg,
        align: 'center',
        letterSpacingEm: 0,
      });
    }
  }

  return { textRuns, badgeRuns };
}

/**
 * Generates a Cricut Design Space / Silhouette Studio / ScanNCut gang-sheet SVG laying all
 * series spines side-by-side at 1:1 mm scale.
 *
 * STRICT INVARIANT: Zero `<text>` tags, zero `<image>` tags, zero `transform=` attributes.
 * Every glyph, band, ornament, and optional HTV mirror flip is baked into absolute mm `<path>` coordinates.
 */
export async function generateSeriesCricutHtvSvg(
  series: SeriesProject,
  customFont: CustomFontAsset | null,
  options: SeriesCricutHtvOptions = DEFAULT_SERIES_CRICUT_OPTIONS,
  overrideFontBytes?: Uint8Array | null,
): Promise<SeriesCricutHtvResult> {
  const layout = computeSeriesShelfLayout(series);
  const gapMm = Math.max(0, Math.min(30, options.gapMm));
  const matPad = 6;

  const gangPositions: {
    readonly bookLayout: SeriesBookLayout;
    readonly xMm: number;
    readonly yMm: number;
  }[] = [];

  let cursorX = matPad;
  for (const bookLayout of layout.books) {
    gangPositions.push({
      bookLayout,
      xMm: roundTo(cursorX, 3),
      yMm: roundTo(matPad + bookLayout.shelfYMm, 3),
    });
    cursorX += bookLayout.spineWidthMm + gapMm;
  }

  const contentWidthMm = Math.max(
    10,
    layout.books.length > 0 ? cursorX - gapMm - matPad : 20,
  );
  const contentHeightMm = Math.max(20, layout.maxSpineHeightMm);
  const widthMm = roundTo(contentWidthMm + matPad * 2, 2);
  const heightMm = roundTo(contentHeightMm + matPad * 2, 2);

  const fontBytes = await resolveFontBytesById(
    series.shared.fontId,
    customFont,
    overrideFontBytes,
  );

  const foilColorSet = new Set<string>();
  const filledByColor = new Map<string, string[]>();
  const appendColorPath = (hex: string, d: string) => {
    if (!d) return;
    foilColorSet.add(hex);
    const list = filledByColor.get(hex);
    if (list) list.push(d);
    else filledByColor.set(hex, [d]);
  };

  const letteringParts: string[] = [];
  const bandParts: string[] = [];
  const ornamentParts: string[] = [];
  let cutBounds: Rect2D | null = null;

  for (const pos of gangPositions) {
    const { bookLayout, xMm } = pos;
    const dxToGang = xMm - bookLayout.shelfXMm;
    const gangCenterX = bookLayout.spineCenterXMm + dxToGang;
    const textHex = normalizeFoilHex(bookLayout.textColor, '#111111');
    const accentHex = normalizeFoilHex(bookLayout.accentColor, '#B48327');

    // 1. Outlined Spine Lettering & Volume Badge
    if (fontBytes) {
      const { textRuns, badgeRuns } = buildBookSpineGlyphRuns(
        bookLayout,
        series,
        gangCenterX,
        matPad,
      );

      if (textRuns.length > 0) {
        const bakedText = bakeGlyphRunsToPaths(
          textRuns,
          fontBytes,
          0,
          0,
          widthMm,
          options.mirrorForHtv,
        );
        if (bakedText.compoundD) {
          letteringParts.push(bakedText.compoundD);
          appendColorPath(textHex, bakedText.compoundD);
          cutBounds = mergeBounds(cutBounds, bakedText.bounds);
        }
      }

      if (badgeRuns.length > 0) {
        const bakedBadge = bakeGlyphRunsToPaths(
          badgeRuns,
          fontBytes,
          0,
          0,
          widthMm,
          options.mirrorForHtv,
        );
        if (bakedBadge.compoundD) {
          letteringParts.push(bakedBadge.compoundD);
          appendColorPath(accentHex, bakedBadge.compoundD);
          cutBounds = mergeBounds(cutBounds, bakedBadge.bounds);
        }
      }
    }

    // 2. Decorative Spine Bands (baked closed polygons)
    if (options.includeBands && bookLayout.bandRectsMm.length > 0) {
      const bookBandPaths: string[] = [];
      for (const bandRect of bookLayout.bandRectsMm) {
        const shifted: Rect2D = {
          x: bandRect.x + dxToGang,
          y: bandRect.y + matPad,
          width: bandRect.width,
          height: bandRect.height,
        };
        bookBandPaths.push(rectToClosedPath(shifted, widthMm, options.mirrorForHtv));
        const bx = options.mirrorForHtv ? widthMm - (shifted.x + shifted.width) : shifted.x;
        cutBounds = mergeBounds(cutBounds, {
          x: bx,
          y: shifted.y,
          width: shifted.width,
          height: shifted.height,
        });
      }
      const joined = bookBandPaths.join(' ');
      if (joined) {
        bandParts.push(joined);
        appendColorPath(accentHex, joined);
      }
    }

    // 3. Shared Spine Ornament (baked closed Bezier contours)
    if (series.shared.ornamentId !== 'none' && bookLayout.ornamentRectMm) {
      const r = bookLayout.ornamentRectMm;
      const ornLayer: CoverOrnamentLayer = {
        id: `gang-orn-${bookLayout.index}`,
        presetId: series.shared.ornamentId,
        zone: 'spine',
        xMm: r.x + dxToGang,
        yMm: r.y + matPad,
        widthMm: r.width,
        heightMm: r.height,
        color: bookLayout.accentColor,
        strokeWidthMm: 0.65,
      };
      const ornD = buildOrnamentCompoundPath(ornLayer, {
        originXMm: 0,
        originYMm: 0,
        canvasWidthMm: widthMm,
        mirrorX: options.mirrorForHtv,
      });
      if (ornD) {
        ornamentParts.push(ornD);
        appendColorPath(accentHex, ornD);
        const ox = options.mirrorForHtv
          ? widthMm - (ornLayer.xMm + ornLayer.widthMm)
          : ornLayer.xMm;
        cutBounds = mergeBounds(cutBounds, {
          x: ox,
          y: ornLayer.yMm,
          width: ornLayer.widthMm,
          height: ornLayer.heightMm,
        });
      }
    }
  }

  const pathElements: string[] = [];

  // Alignment Corner Registration Marks for every spine
  if (options.includeRegistrationMarks && gangPositions.length > 0) {
    const spineRects: Rect2D[] = gangPositions.map((p) => ({
      x: p.xMm,
      y: p.yMm,
      width: p.bookLayout.spineWidthMm,
      height: p.bookLayout.spineHeightMm,
    }));
    const regD = buildCornerBracketsPath(spineRects, widthMm, options.mirrorForHtv);
    if (regD) {
      pathElements.push(
        `  <path id="series-alignment-marks" d="${regD}" fill="#B48327" fill-rule="nonzero" />`,
      );
    }
  }

  // Optional HTV Weeding Box (+4 mm around all gang-sheet cut vectors)
  if (options.includeWeedingBox && cutBounds) {
    const pad = 4;
    const wx = Math.max(0.5, cutBounds.x - pad);
    const wy = Math.max(0.5, cutBounds.y - pad);
    const wx2 = Math.min(widthMm - 0.5, cutBounds.x + cutBounds.width + pad);
    const wy2 = Math.min(heightMm - 0.5, cutBounds.y + cutBounds.height + pad);
    if (wx2 > wx + 2 && wy2 > wy + 2) {
      const weedD = `M ${fmtMm(wx)} ${fmtMm(wy)} L ${fmtMm(wx2)} ${fmtMm(wy)} L ${fmtMm(wx2)} ${fmtMm(wy2)} L ${fmtMm(wx)} ${fmtMm(wy2)} Z`;
      pathElements.push(
        `  <path id="series-weeding-box" d="${weedD}" fill="none" stroke="#1D5BD6" stroke-width="0.35" />`,
      );
    }
  }

  // Design vector cut layers
  if (options.groupByColor) {
    for (const [hex, parts] of filledByColor.entries()) {
      const d = parts.join(' ');
      if (!d) continue;
      pathElements.push(
        `  <path id="series-foil-${hex.slice(1).toLowerCase()}" d="${d}" fill="${hex}" fill-rule="nonzero" />`,
      );
    }
  } else {
    const bandsD = bandParts.join(' ');
    if (bandsD) {
      pathElements.push(
        `  <path id="series-spine-bands" d="${bandsD}" fill="#222222" fill-rule="nonzero" />`,
      );
    }
    const ornamentsD = ornamentParts.join(' ');
    if (ornamentsD) {
      pathElements.push(
        `  <path id="series-ornaments" d="${ornamentsD}" fill="#222222" fill-rule="nonzero" />`,
      );
    }
    const letteringD = letteringParts.join(' ');
    if (letteringD) {
      pathElements.push(
        `  <path id="series-lettering" d="${letteringD}" fill="#111111" fill-rule="nonzero" />`,
      );
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(widthMm)}mm"
     height="${fmtMm(heightMm)}mm"
     viewBox="0 0 ${fmtMm(widthMm)} ${fmtMm(heightMm)}">
${pathElements.join('\n')}
</svg>
`;

  const minSide = Math.min(widthMm, heightMm);
  const maxSide = Math.max(widthMm, heightMm);
  const matFit = {
    joy: minSide <= 114 && maxSide <= 304,
    mat12x12: widthMm <= 292 && heightMm <= 292,
    mat12x24: minSide <= 292 && maxSide <= 596,
  };

  const mirrorSlug = options.mirrorForHtv ? '_mirrored' : '';
  const colorSlug = options.groupByColor ? '_multicolor' : '';
  const fileName = `${slugifySeriesName(series.name)}_cricut_htv_spines${mirrorSlug}${colorSlug}.svg`;

  return {
    svg,
    widthMm,
    heightMm,
    spineCount: layout.books.length,
    pathCount: pathElements.length,
    foilColors: Array.from(foilColorSet),
    fileName,
    matFit,
  };
}

async function embedSeriesPdfFont(
  pdfDoc: PDFDocument,
  fontId: StudioFontId,
  customFont: CustomFontAsset | null,
): Promise<PDFFont> {
  pdfDoc.registerFontkit(fontkit);
  try {
    if (fontId === 'custom' && customFont?.pdfEmbeddable) {
      return await pdfDoc.embedFont(customFont.bytes);
    }
    const curatedId = fontId === 'custom' ? 'eb-garamond' : fontId;
    const bytes = await loadCuratedFontBytes(curatedId);
    if (bytes) {
      return await pdfDoc.embedFont(bytes);
    }
  } catch {
    // Fall back to standard PDF font below
  }
  const spec = fontId === 'custom' ? getCuratedFont('eb-garamond') : getCuratedFont(fontId);
  return pdfDoc.embedFont(
    spec.category === 'sans-serif' ? StandardFonts.Helvetica : StandardFonts.TimesRoman,
  );
}

async function rasterizeSpinePanoramaSlicePng(
  dataUrl: string,
  bookLayout: SeriesBookLayout,
  panoShelfRect: { readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number },
  dpi = PRINT_DPI,
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = await loadHtmlImage(dataUrl);
    const pxW = Math.max(1, UnitConverter.mmToPixels(bookLayout.spineWidthMm, dpi));
    const pxH = Math.max(1, UnitConverter.mmToPixels(bookLayout.spineHeightMm, dpi));
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const pxPerMm = dpi / 25.4;
    const drawX = (panoShelfRect.xMm - bookLayout.shelfXMm) * pxPerMm;
    const drawY = (panoShelfRect.yMm - bookLayout.shelfYMm) * pxPerMm;
    const drawW = panoShelfRect.widthMm * pxPerMm;
    const drawH = panoShelfRect.heightMm * pxPerMm;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    return await canvasToPngBytes(canvas);
  } catch {
    return null;
  }
}

function drawCenteredPdfText(
  page: PDFPage,
  text: string,
  centerXPt: number,
  centerYPt: number,
  fontSizePt: number,
  font: PDFFont,
  colorHex: string,
  rotDegCss: 0 | 90 | -90,
): void {
  if (!text.trim()) return;
  const c = hexToRgb01(colorHex);
  const textWidthPt = font.widthOfTextAtSize(text, fontSizePt);
  const textHeightPt = font.heightAtSize(fontSizePt, { descender: false });
  const pdfRotDeg = rotDegCss === 0 ? 0 : rotDegCss === 90 ? -90 : 90;
  const rad = (pdfRotDeg * Math.PI) / 180;
  const dxLocal = -textWidthPt / 2;
  const dyLocal = -textHeightPt * 0.36;
  const startX = centerXPt + dxLocal * Math.cos(rad) - dyLocal * Math.sin(rad);
  const startY = centerYPt + dxLocal * Math.sin(rad) + dyLocal * Math.cos(rad);

  page.drawText(text, {
    x: startX,
    y: startY,
    size: fontSizePt,
    font,
    color: rgb(c.r, c.g, c.b),
    rotate: degrees(pdfRotDeg),
  });
}

/**
 * Generates a 1:1 physical millimeter Spine Proof PDF showing all volumes standing side-by-side
 * with exact spine widths, heights, panoramic artwork slices, vector bands/ornaments/lettering,
 * dimension callouts, and an optional 50 mm Scale Check calibration ruler.
 */
export async function generateSeriesSpineProofPdf(
  series: SeriesProject,
  customFont: CustomFontAsset | null,
  options: SeriesSpineProofPdfOptions = {
    paperSize: 'custom-fit',
    includeScaleBar: true,
    includeAlignmentGuides: true,
  },
): Promise<SeriesSpineProofPdfResult> {
  const layout = computeSeriesShelfLayout(series);
  const padX = 14;
  const headerH = 14;
  const footerH = options.includeScaleBar && options.paperSize === 'custom-fit' ? 24 : 14;

  const contentW = Math.max(40, layout.totalShelfWidthMm);
  const contentH = Math.max(60, layout.maxSpineHeightMm);
  const sourceW = roundTo(contentW + padX * 2, 2);
  const sourceH = roundTo(contentH + headerH + footerH, 2);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${series.name} — 1:1 Series Spine Proof`);
  pdfDoc.setCreator('Bookbinder Studio');

  const pageWPt = UnitConverter.mmToPoints(sourceW);
  const pageHPt = UnitConverter.mmToPoints(sourceH);
  const page = pdfDoc.addPage([pageWPt, pageHPt]);

  const uiFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const uiBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const seriesFont = await embedSeriesPdfFont(pdfDoc, series.shared.fontId, customFont);

  const toPdfX = (mm: number) => UnitConverter.mmToPoints(mm);
  const toPdfY = (mm: number) => UnitConverter.mmToPoints(sourceH - mm);
  const mmToPt = UnitConverter.mmToPoints(1);

  // Header metadata
  const headerText = `${series.name} — ${layout.books.length} ${layout.books.length === 1 ? 'Volume' : 'Volumes'} • Total Shelf Width ${layout.totalShelfWidthMm.toFixed(1)} mm • Tallest Spine ${layout.maxSpineHeightMm.toFixed(1)} mm`;
  page.drawText(headerText, {
    x: toPdfX(padX),
    y: toPdfY(8.5),
    size: 7.5,
    font: uiBoldFont,
    color: rgb(0.16, 0.14, 0.12),
  });

  const shelfOriginX = padX;
  const shelfOriginY = headerH;

  // Render each spine standing bottom-aligned
  for (const bookLayout of layout.books) {
    const sx = shelfOriginX + bookLayout.shelfXMm;
    const sy = shelfOriginY + bookLayout.shelfYMm;
    const sw = bookLayout.spineWidthMm;
    const sh = bookLayout.spineHeightMm;

    // 1. Solid bookcloth base fill
    const bg = hexToRgb01(bookLayout.bgColor);
    page.drawRectangle({
      x: toPdfX(sx),
      y: toPdfY(sy + sh),
      width: UnitConverter.mmToPoints(sw),
      height: UnitConverter.mmToPoints(sh),
      color: rgb(bg.r, bg.g, bg.b),
    });

    // 2. Optional panoramic slice rasterized at 300 DPI + contrast scrim
    if (
      series.shared.panorama.enabled &&
      series.shared.panorama.dataUrl &&
      layout.panoramaShelfRect &&
      !options.skipCanvasRaster
    ) {
      const slicePng = await rasterizeSpinePanoramaSlicePng(
        series.shared.panorama.dataUrl,
        bookLayout,
        layout.panoramaShelfRect,
        PRINT_DPI,
      );
      if (slicePng) {
        const embedded = await pdfDoc.embedPng(slicePng);
        page.drawImage(embedded, {
          x: toPdfX(sx),
          y: toPdfY(sy + sh),
          width: UnitConverter.mmToPoints(sw),
          height: UnitConverter.mmToPoints(sh),
        });
      }
      if (series.shared.panorama.dimOpacity > 0) {
        page.drawRectangle({
          x: toPdfX(sx),
          y: toPdfY(sy + sh),
          width: UnitConverter.mmToPoints(sw),
          height: UnitConverter.mmToPoints(sh),
          color: rgb(0.05, 0.06, 0.09),
          opacity: series.shared.panorama.dimOpacity,
        });
      }
    }

    // 3. Vector Spine Bands
    const accentRgb = hexToRgb01(bookLayout.accentColor);
    for (const band of bookLayout.bandRectsMm) {
      page.drawRectangle({
        x: toPdfX(shelfOriginX + band.x),
        y: toPdfY(shelfOriginY + band.y + band.height),
        width: UnitConverter.mmToPoints(band.width),
        height: UnitConverter.mmToPoints(band.height),
        color: rgb(accentRgb.r, accentRgb.g, accentRgb.b),
      });
    }

    // 4. Vector Shared Spine Ornament
    if (series.shared.ornamentId !== 'none' && bookLayout.ornamentRectMm) {
      const r = bookLayout.ornamentRectMm;
      const ornLayer: CoverOrnamentLayer = {
        id: `proof-orn-${bookLayout.index}`,
        presetId: series.shared.ornamentId,
        zone: 'spine',
        xMm: shelfOriginX + r.x,
        yMm: shelfOriginY + r.y,
        widthMm: r.width,
        heightMm: r.height,
        color: bookLayout.accentColor,
        strokeWidthMm: 0.65,
      };
      const ornD = buildOrnamentCompoundPath(ornLayer);
      if (ornD) {
        page.drawSvgPath(ornD, {
          x: 0,
          y: pageHPt,
          scale: mmToPt,
          color: rgb(accentRgb.r, accentRgb.g, accentRgb.b),
        });
      }
    }

    // 5. Vector Typography (Volume Badge, Spine Title, Author)
    const centerXPt = toPdfX(shelfOriginX + bookLayout.spineCenterXMm);
    const { textRuns, badgeRuns } = buildBookSpineGlyphRuns(
      bookLayout,
      series,
      shelfOriginX + bookLayout.spineCenterXMm,
      shelfOriginY,
    );

    for (const badge of badgeRuns) {
      drawCenteredPdfText(
        page,
        badge.text,
        centerXPt,
        toPdfY(badge.anchorYMm),
        badge.fontSizePt,
        seriesFont,
        bookLayout.accentColor,
        0,
      );
    }

    for (const run of textRuns) {
      const rot: 0 | 90 | -90 =
        run.rotationDegCss === 90 ? 90 : run.rotationDegCss === -90 ? -90 : 0;
      drawCenteredPdfText(
        page,
        run.text,
        toPdfX(run.anchorXMm),
        toPdfY(run.anchorYMm),
        run.fontSizePt,
        seriesFont,
        bookLayout.textColor,
        rot,
      );
    }

    // 6. Spine cut/fold boundary border & dimension callout underneath
    page.drawRectangle({
      x: toPdfX(sx),
      y: toPdfY(sy + sh),
      width: UnitConverter.mmToPoints(sw),
      height: UnitConverter.mmToPoints(sh),
      borderColor: rgb(0.25, 0.22, 0.18),
      borderWidth: 0.5,
    });

    const dimLabel = `${sw.toFixed(1)}×${sh.toFixed(0)}`;
    const dimW = uiFont.widthOfTextAtSize(dimLabel, 5.5);
    page.drawText(dimLabel, {
      x: toPdfX(sx + sw / 2) - dimW / 2,
      y: toPdfY(shelfOriginY + contentH + 5.2),
      size: 5.5,
      font: uiFont,
      color: rgb(0.28, 0.25, 0.22),
    });
  }

  // Optional alignment baseline guide ticks on left & right margins
  if (options.includeAlignmentGuides !== false) {
    const guideYs = [
      layout.guides.headBandYMm,
      layout.guides.tailBandYMm,
      layout.guides.shelfBaselineYMm,
    ];
    for (const gy of guideYs) {
      const yPt = toPdfY(shelfOriginY + gy);
      page.drawLine({
        start: { x: toPdfX(padX - 5), y: yPt },
        end: { x: toPdfX(padX - 1), y: yPt },
        color: rgb(0.71, 0.51, 0.15),
        thickness: 0.5,
      });
      page.drawLine({
        start: { x: toPdfX(padX + contentW + 1), y: yPt },
        end: { x: toPdfX(padX + contentW + 5), y: yPt },
        color: rgb(0.71, 0.51, 0.15),
        thickness: 0.5,
      });
    }
  }

  // Stamp 50 mm Scale Check bar directly when exporting exact custom-fit sheet
  if (options.paperSize === 'custom-fit' && options.includeScaleBar) {
    const barX = Math.max(4, (sourceW - SCALE_BAR_BOX_W_MM) / 2);
    const barY = 3;
    if (barX + SCALE_BAR_BOX_W_MM <= sourceW - 2 && barY + SCALE_BAR_BOX_H_MM <= footerH) {
      drawScaleCheckBar(page, uiFont, uiBoldFont, {
        xMm: barX,
        yMm: barY,
        rotated90: false,
      });
    }
  }

  const rawBytes = await pdfDoc.save();
  const fileName = `${slugifySeriesName(series.name)}_spine_proof_1to1.pdf`;

  if (options.paperSize === 'custom-fit') {
    return {
      bytes: rawBytes,
      pageCount: 1,
      widthMm: sourceW,
      heightMm: sourceH,
      fileName,
    };
  }

  // Validate canonical sheet spec from src/resources/paperSpecs.ts and route through shared sheet layout/tiling
  const sheetSpec = getPageSizeSpec(options.paperSize);
  const laidOutBytes = await layoutPdfToPrintMedia(rawBytes, sourceW, sourceH, {
    printMediaId: sheetSpec.id,
    includeScaleBar: options.includeScaleBar,
    documentTitle: `${series.name} — 1:1 Spine Proof (${sheetSpec.label})`,
  });
  const finalDoc = await PDFDocument.load(laidOutBytes);
  const firstPage = finalDoc.getPage(0);
  const { width, height } = firstPage.getSize();

  return {
    bytes: laidOutBytes,
    pageCount: finalDoc.getPageCount(),
    widthMm: roundTo(UnitConverter.pointsToMm(width), 1),
    heightMm: roundTo(UnitConverter.pointsToMm(height), 1),
    fileName,
  };
}

/**
 * Compiles every book in the series (preserving linked front/back covers when available),
 * generates each book's 1:1 print-ready cover wrap PDF via `generatePrintReadyRollPdf`,
 * and merges all pages into a single multi-page PDF bundle.
 */
export async function generateSeriesCoversPdf(
  series: SeriesProject,
  customFont: CustomFontAsset | null,
  existingStudiosByProjectId: ReadonlyMap<ProjectId, CoverStudioState>,
  options: SeriesCoversPdfOptions = {},
): Promise<SeriesCoversPdfResult> {
  const mergedDoc = await PDFDocument.create();
  mergedDoc.setTitle(`${series.name} — Complete Cover Set`);
  mergedDoc.setCreator('Bookbinder Studio');

  const total = series.books.length;
  for (let i = 0; i < total; i++) {
    const book = series.books[i];
    options.onProgress?.(i, total, book.title);
    const existingStudio = book.linkedProjectId
      ? (existingStudiosByProjectId.get(book.linkedProjectId) ?? null)
      : null;
    const compiledStudio = compileSeriesBookToCoverStudio(series, i, existingStudio);
    const geometry = calculateCaseGeometry(book.parameters);
    const bookPdfBytes = await generatePrintReadyRollPdf(geometry, compiledStudio, customFont, {
      printMediaId: book.parameters.printMedia,
      dpi: options.dpi ?? PRINT_DPI,
      includeScaleBar: options.includeScaleBar ?? false,
      skipCanvasRaster: options.skipCanvasRaster,
    });

    const bookDoc = await PDFDocument.load(bookPdfBytes);
    const copiedPages = await mergedDoc.copyPages(bookDoc, bookDoc.getPageIndices());
    for (const p of copiedPages) {
      mergedDoc.addPage(p);
    }
  }
  options.onProgress?.(total, total, '');

  const bytes = await mergedDoc.save();
  return {
    bytes,
    pageCount: mergedDoc.getPageCount(),
    bookCount: total,
    fileName: `${slugifySeriesName(series.name)}_full_cover_set.pdf`,
  };
}
