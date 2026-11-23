import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverTextLayerModel } from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import { UnitConverter } from '@/types/units';
import {
  buildLayerFlipTransform,
  buildPointFlipTransform,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  generateAffinityCoverSvg,
  generatePrintReadyRollPdf,
  hexToRgb01,
  resolveQuickFitRect,
  resolveZoneClipRect,
} from './renderEngine';

describe('studio renderEngine', () => {
  it('computes exact 300 DPI canvas dimensions and cover/spine/back zones', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const spec = computeStudioCanvasSpec(geom, 300);

    // 366 + 6 = 372 mm, 259 + 6 = 265 mm
    expect(spec.totalWidthMm).toBeCloseTo(372, 4);
    expect(spec.totalHeightMm).toBeCloseTo(265, 4);
    expect(spec.pixelWidth).toBe(UnitConverter.mmToPixels(372, 300));
    expect(spec.pixelHeight).toBe(UnitConverter.mmToPixels(265, 300));

    expect(
      spec.backZoneRect.width + spec.spineZoneRect.width + spec.frontZoneRect.width,
    ).toBeCloseTo(spec.totalWidthMm, 5);
  });

  it('resolves clip rects and quick-fit rects for every zone cleanly', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const spec = computeStudioCanvasSpec(geom, 300);

    expect(resolveZoneClipRect(spec, 'front')).toEqual(spec.frontZoneRect);
    expect(resolveZoneClipRect(spec, 'spine')).toEqual(spec.spineZoneRect);
    expect(resolveZoneClipRect(spec, 'back')).toEqual(spec.backZoneRect);
    expect(resolveZoneClipRect(spec, 'none')).toEqual(spec.fullWrapRect);

    expect(resolveQuickFitRect(spec, 'front')).toEqual(spec.frontZoneRect);
    expect(resolveQuickFitRect(spec, 'spine')).toEqual(spec.spineZoneRect);
    expect(resolveQuickFitRect(spec, 'back')).toEqual(spec.backZoneRect);
    expect(resolveQuickFitRect(spec, 'fullWrap')).toEqual(spec.fullWrapRect);
  });

  it('scopes Fit Front/Back and clip masks to the visible cover face (excluding tuck flaps & glue tabs) on slip covers and dust jackets', () => {
    // 1. Fold-and-Glue Slip Cover (A6 with 38 mm flaps & 10 mm glue tabs)
    const slipGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      jacketFlapWidthMm: 38,
    });
    const slipSpec = computeStudioCanvasSpec(slipGeom, 300);
    const { outerWrap: slipWrap } = slipGeom;

    // Background zone bands still span the entire sheet (including flaps)
    expect(
      slipSpec.backZoneRect.width + slipSpec.spineZoneRect.width + slipSpec.frontZoneRect.width,
    ).toBeCloseTo(slipSpec.totalWidthMm, 5);
    expect(slipSpec.frontZoneRect.width).toBeGreaterThan(slipWrap.frontBoardRect.width + 30);

    // Quick-fit and clip rects exclude the 38 mm tuck flaps and 10 mm top/bottom glue tabs
    const slipFront = resolveQuickFitRect(slipSpec, 'front');
    expect(slipFront).toEqual(resolveZoneClipRect(slipSpec, 'front'));
    expect(slipFront.x).toBeCloseTo(slipSpec.bleedMm + slipWrap.frontBoardRect.x, 4);
    expect(slipFront.y).toBeCloseTo(slipSpec.bleedMm + slipWrap.frontBoardRect.y, 4);
    expect(slipFront.width).toBeCloseTo(slipWrap.frontBoardRect.width, 4);
    expect(slipFront.height).toBeCloseTo(slipWrap.frontBoardRect.height, 4);

    const slipBack = resolveQuickFitRect(slipSpec, 'back');
    expect(slipBack).toEqual(resolveZoneClipRect(slipSpec, 'back'));
    expect(slipBack.x).toBeCloseTo(slipSpec.bleedMm + slipWrap.backBoardRect.x, 4);
    expect(slipBack.y).toBeCloseTo(slipSpec.bleedMm + slipWrap.backBoardRect.y, 4);
    expect(slipBack.width).toBeCloseTo(slipWrap.backBoardRect.width, 4);
    expect(slipBack.height).toBeCloseTo(slipWrap.backBoardRect.height, 4);

    // 2. Classic Dust Jacket (Trade Digest with 70 mm flaps, flush top/bottom + bleed)
    const djGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      jacketFlapWidthMm: 70,
    });
    const djSpec = computeStudioCanvasSpec(djGeom, 300);
    const { outerWrap: djWrap } = djGeom;

    const djFront = resolveQuickFitRect(djSpec, 'front');
    expect(djFront.x).toBeCloseTo(djSpec.bleedMm + djWrap.frontBoardRect.x, 4);
    expect(djFront.y).toBe(0);
    expect(djFront.width).toBeCloseTo(djWrap.frontBoardRect.width, 4);
    expect(djFront.height).toBeCloseTo(djSpec.totalHeightMm, 4);
  });

  it('computes inline and stacked spine typography placements with font clamping and optical nudge', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const base = CoverStudioModel.createDefault();

    const inlineState = {
      ...base,
      spineText: {
        ...base.spineText,
        title: 'Dune',
        author: 'Frank Herbert',
        layout: 'inline' as const,
        orientation: 'top-to-bottom' as const,
        fontSizePt: 18,
        opticalNudgeMm: 1.5,
      },
    };
    const inlinePlacements = computeSpineTextPlacements(geom, inlineState);
    expect(inlinePlacements).toHaveLength(1);
    expect(inlinePlacements[0].text).toBe('Dune  —  Frank Herbert');
    expect(inlinePlacements[0].rotationDegCss).toBe(90);

    const stackedState = {
      ...base,
      spineText: {
        ...base.spineText,
        title: 'Dune',
        author: 'Frank Herbert',
        layout: 'stacked' as const,
        orientation: 'bottom-to-top' as const,
        fontSizePt: 99,
      },
    };
    const stackedPlacements = computeSpineTextPlacements(geom, stackedState);
    expect(stackedPlacements).toHaveLength(2);
    expect(stackedPlacements[0].rotationDegCss).toBe(-90);
    expect(stackedPlacements[0].anchorYMm).toBeLessThan(stackedPlacements[1].anchorYMm);
    expect(stackedPlacements[0].fontSizePt).toBeLessThanOrEqual(
      CoverStudioModel.maxSpineFontSizePt(geom.outerWrap.spineRect.width),
    );

    const horizontalAuthorState = {
      ...base,
      spineText: {
        ...base.spineText,
        title: 'Dune',
        author: 'Frank Herbert',
        layout: 'stacked' as const,
        orientation: 'top-to-bottom' as const,
        authorOrientation: 'horizontal' as const,
        fontSizePt: 18,
      },
    };
    const horizPlacements = computeSpineTextPlacements(geom, horizontalAuthorState);
    // Title vertical + 2 horizontal author lines ("Frank", "Herbert")
    expect(horizPlacements).toHaveLength(3);
    expect(horizPlacements[0].rotationDegCss).toBe(90);
    expect(horizPlacements[1].rotationDegCss).toBe(0);
    expect(horizPlacements[1].text).toBe('Frank');
    expect(horizPlacements[2].rotationDegCss).toBe(0);
    expect(horizPlacements[2].text).toBe('Herbert');
    expect(horizPlacements[2].anchorYMm).toBeGreaterThan(horizPlacements[1].anchorYMm);
  });

  it('generates Print-Ready Roll PDF at exact 1:1 physical mm size for both cut-line modes', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'The Hobbit',
        author: 'J.R.R. Tolkien',
      },
    };

    const bytesReg = await generatePrintReadyRollPdf(
      geom,
      { ...studio, cutLineMode: 'bleed-registration' },
      null,
      { skipCanvasRaster: true },
    );
    const loadedReg = await PDFDocument.load(bytesReg);
    expect(loadedReg.getPageCount()).toBe(1);
    const size = loadedReg.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(size.width)).toBeCloseTo(372, 2);
    expect(UnitConverter.pointsToMm(size.height)).toBeCloseTo(265, 2);

    const bytesCut = await generatePrintReadyRollPdf(
      geom,
      { ...studio, cutLineMode: 'full-cut-miter' },
      null,
      { skipCanvasRaster: true },
    );
    const loadedCut = await PDFDocument.load(bytesCut);
    expect(loadedCut.getPageCount()).toBe(1);
    // Cut & Fold Lines mode is the default and adds both outer cut & dashed fold guides
    expect(CoverStudioModel.createDefault().cutLineMode).toBe('full-cut-miter');
  });

  it('generates Affinity Round-Trip 1:1 mm SVG with artwork, vector spine text, and guide layers', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Neuromancer',
        author: 'William Gibson',
      },
    };

    const svg = generateAffinityCoverSvg(geom, studio, null, 'data:image/png;base64,AAA');
    expect(svg).toContain('width="372mm"');
    expect(svg).toContain('height="265mm"');
    expect(svg).toContain('<g id="artwork-layer">');
    expect(svg).toContain('<g id="spine-typography">');
    expect(svg).toContain('Neuromancer  —  William Gibson');
    expect(svg).toContain('<g id="cut-lines"');
    expect(svg).toContain('<g id="board-guides"');
    expect(hexToRgb01('#ff8000').r).toBeCloseTo(1, 4);
    expect(hexToRgb01('invalid').r).toBeCloseTo(0.12, 2);
  });

  it('builds flip SVG transforms and renders flipped cover text in Print PDF & Affinity SVG', async () => {
    expect(buildLayerFlipTransform(10, 20, 100, 50, false, false)).toBeUndefined();
    expect(buildLayerFlipTransform(10, 20, 100, 50, true, false)).toBe(
      'translate(60 45) scale(-1 1) translate(-60 -45)',
    );
    expect(buildPointFlipTransform(200, 100, false, true)).toBe(
      'translate(200 100) scale(1 -1) translate(-200 -100)',
    );

    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const flippedTitle = {
      ...CoverTextLayerModel.createPreset('front-title', geom.outerWrap.frontBoardRect),
      text: 'MIRRORED',
      flipX: true,
    };
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [flippedTitle],
    };

    const svg = generateAffinityCoverSvg(geom, studio, null);
    expect(svg).toContain('scale(-1 1)');
    expect(svg).toContain('MIRRORED');

    const pdfBytes = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
    });
    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('outputs centered 1-sheet Landscape PDF for A6 softcover and 2-sheet Portrait tiled PDF for Trade Digest on US Letter', async () => {
    const baseStudio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Field Notes',
        author: 'A. Binder',
      },
    };

    // 1. A6 Softcover (266.4 x 170 mm) on US Letter -> 1 exact US Letter Landscape page (279.4 x 215.9 mm)
    const a6SoftGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      printMedia: 'letter',
    });
    const a6Bytes = await generatePrintReadyRollPdf(a6SoftGeom, baseStudio, null, {
      skipCanvasRaster: true,
      printMedia: 'letter',
    });
    const a6Pdf = await PDFDocument.load(a6Bytes);
    expect(a6Pdf.getPageCount()).toBe(1);
    const a6PageSize = a6Pdf.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(a6PageSize.width)).toBeCloseTo(279.4, 2);
    expect(UnitConverter.pointsToMm(a6PageSize.height)).toBeCloseTo(215.9, 2);

    // 2. Default Trade Digest hardcover (366 x 259 mm) on US Letter -> 2 exact US Letter Portrait tiled pages (215.9 x 279.4 mm)
    const digestGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      printMedia: 'letter',
    });
    const digestBytes = await generatePrintReadyRollPdf(digestGeom, baseStudio, null, {
      skipCanvasRaster: true,
      printMedia: 'letter',
    });
    const digestPdf = await PDFDocument.load(digestBytes);
    expect(digestPdf.getPageCount()).toBe(2);
    for (const idx of [0, 1]) {
      const sz = digestPdf.getPage(idx).getSize();
      expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(215.9, 2);
      expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(279.4, 2);
    }

    // 3. Oversized book (height > 269.4 mm printable) on US Letter -> falls back to exact 1-page wrap size
    const oversizedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 190,
      pbHeightMm: 275,
      printMedia: 'letter',
    });
    const oversizedBytes = await generatePrintReadyRollPdf(oversizedGeom, baseStudio, null, {
      skipCanvasRaster: true,
      printMedia: 'letter',
    });
    const oversizedPdf = await PDFDocument.load(oversizedBytes);
    expect(oversizedPdf.getPageCount()).toBe(1);
    const oversizedSpec = computeStudioCanvasSpec(oversizedGeom, 300);
    const oversizedSz = oversizedPdf.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(oversizedSz.width)).toBeCloseTo(oversizedSpec.totalWidthMm, 2);
    expect(UnitConverter.pointsToMm(oversizedSz.height)).toBeCloseTo(oversizedSpec.totalHeightMm, 2);
  });

  it('supports dpi: 600, tileOverlapMm: 15, includeScaleBar: true, and includeGuides override on generatePrintReadyRollPdf', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Dune',
        author: 'Frank Herbert',
      },
    };

    // 600 DPI canvas spec doubles pixel resolution vs 300 DPI while keeping identical physical mm
    const spec300 = computeStudioCanvasSpec(geom, 300);
    const spec600 = computeStudioCanvasSpec(geom, 600);
    expect(spec600.totalWidthMm).toBeCloseTo(spec300.totalWidthMm, 4);
    expect(spec600.pixelWidth).toBe(UnitConverter.mmToPixels(spec300.totalWidthMm, 600));
    expect(spec600.pixelHeight).toBe(UnitConverter.mmToPixels(spec300.totalHeightMm, 600));

    // Unified options: printMediaId + dpi: 600 + tileOverlapMm: 15 + includeScaleBar: true + includeGuides: false
    const bytesNoBar = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
      dpi: 600,
      tileOverlapMm: 15,
      includeScaleBar: false,
      includeGuides: false,
    });
    const bytesWithBar = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
      dpi: 600,
      tileOverlapMm: 15,
      includeScaleBar: true,
      includeGuides: true,
    });

    const pdfNoBar = await PDFDocument.load(bytesNoBar);
    const pdfWithBar = await PDFDocument.load(bytesWithBar);
    expect(pdfNoBar.getPageCount()).toBe(2);
    expect(pdfWithBar.getPageCount()).toBe(2);
    expect(bytesWithBar.byteLength).toBeGreaterThan(bytesNoBar.byteLength);

    for (const idx of [0, 1]) {
      const sz = pdfWithBar.getPage(idx).getSize();
      expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(215.9, 2);
      expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(279.4, 2);
    }
  });

  it('generates Print-Ready Roll & Sheet PDFs cleanly for paperback-wrap and dust-jacket', async () => {
    const baseStudio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Pocket Classics',
        author: 'A. Author',
      },
    };

    // 1. Replacement Paperback Cover (A6 105×148×10 -> 220×148 mm) fits 1× US Letter Landscape
    const pbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      includeBleed: false,
    });
    const pbExactBytes = await generatePrintReadyRollPdf(pbGeom, baseStudio, null, {
      skipCanvasRaster: true,
      includeGuides: true,
    });
    const pbExactPdf = await PDFDocument.load(pbExactBytes);
    expect(pbExactPdf.getPageCount()).toBe(1);
    const pbSz = pbExactPdf.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(pbSz.width)).toBeCloseTo(220, 2);
    expect(UnitConverter.pointsToMm(pbSz.height)).toBeCloseTo(148, 2);

    const pbLetterBytes = await generatePrintReadyRollPdf(pbGeom, baseStudio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
    });
    const pbLetterPdf = await PDFDocument.load(pbLetterBytes);
    expect(pbLetterPdf.getPageCount()).toBe(1);

    // 2. Classic Dust Jacket (A6 105×148×10 with 50 mm flaps -> 323.5×148 mm)
    const djGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 50,
      includeBleed: false,
    });
    const djFullBytes = await generatePrintReadyRollPdf(djGeom, baseStudio, null, {
      skipCanvasRaster: true,
      includeGuides: true,
    });
    const djFullPdf = await PDFDocument.load(djFullBytes);
    expect(djFullPdf.getPageCount()).toBe(1);
    const djSz = djFullPdf.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(djSz.width)).toBeCloseTo(323.5, 2);
    expect(UnitConverter.pointsToMm(djSz.height)).toBeCloseTo(148, 2);

    // Registration-marks mode (bleed-registration) also exports cleanly
    const djRegBytes = await generatePrintReadyRollPdf(
      djGeom,
      { ...baseStudio, cutLineMode: 'bleed-registration' },
      null,
      { skipCanvasRaster: true, printMediaId: 'legal' },
    );
    const djRegPdf = await PDFDocument.load(djRegBytes);
    expect(djRegPdf.getPageCount()).toBe(1);
  });
});
