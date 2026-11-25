import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
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

    // 368 + 6 = 374 mm, 259 + 6 = 265 mm
    expect(spec.totalWidthMm).toBeCloseTo(374, 4);
    expect(spec.totalHeightMm).toBeCloseTo(265, 4);
    expect(spec.pixelWidth).toBe(UnitConverter.mmToPixels(374, 300));
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
    expect(UnitConverter.pointsToMm(size.width)).toBeCloseTo(374, 2);
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
    expect(svg).toContain('width="374mm"');
    expect(svg).toContain('height="265mm"');
    expect(svg).toContain('<g id="artwork-layer">');
    expect(svg).toContain('<g id="spine-typography">');
    expect(svg).toContain('Neuromancer  —  William Gibson');
    expect(svg).toContain('<g id="cut-lines"');
    expect(svg).toContain('<g id="board-guides"');
    expect(hexToRgb01('#ff8000').r).toBeCloseTo(1, 4);
    expect(hexToRgb01('invalid').r).toBeCloseTo(0.12, 2);
  });

  it('builds flip and 90° rotation SVG transforms and renders rotated/flipped cover text in Print PDF & Affinity SVG', async () => {
    expect(buildLayerFlipTransform(10, 20, 100, 50, false, false)).toBeUndefined();
    expect(buildLayerFlipTransform(10, 20, 100, 50, false, false, 0)).toBeUndefined();
    expect(buildLayerFlipTransform(10, 20, 100, 50, true, false)).toBe(
      'translate(60 45) scale(-1 1) translate(-60 -45)',
    );
    expect(buildLayerFlipTransform(10, 20, 100, 50, false, false, 90)).toBe(
      'translate(60 45) rotate(90) translate(-60 -45)',
    );
    expect(buildLayerFlipTransform(10, 20, 100, 50, true, false, 90)).toBe(
      'translate(60 45) rotate(90) scale(-1 1) translate(-60 -45)',
    );
    expect(buildPointFlipTransform(200, 100, false, true)).toBe(
      'translate(200 100) scale(1 -1) translate(-200 -100)',
    );
    expect(buildPointFlipTransform(200, 100, false, false, 270)).toBe(
      'translate(200 100) rotate(270) translate(-200 -100)',
    );

    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const flippedTitle = {
      ...CoverTextLayerModel.createPreset('front-title', geom.outerWrap.frontBoardRect),
      text: 'MIRRORED',
      flipX: true,
      rotationDeg: 90 as const,
    };
    const rotatedOnlyBlurb = {
      ...CoverTextLayerModel.createPreset('back-blurb', geom.outerWrap.backBoardRect),
      text: 'LINE ONE\nLINE TWO',
      rotationDeg: 270 as const,
    };
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [flippedTitle, rotatedOnlyBlurb],
    };

    const svg = generateAffinityCoverSvg(geom, studio, null);
    expect(svg).toContain('rotate(90) scale(-1 1)');
    expect(svg).toContain('rotate(270)');
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

  it('omits cover text, spine text, and ornaments in exportLayerMode: base-only while keeping base geometry, guides, and HTV center ticks', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const frontRect = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };
    const frontTitle = {
      ...CoverTextLayerModel.createPreset('front-title', frontRect),
      text: 'THE ODYSSEY',
      color: '#d4af37',
    };
    const ornament = CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      frontRect,
      'front',
      '#f5efe2',
    );
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'THE ODYSSEY',
        author: 'HOMER',
      },
      textLayers: [frontTitle],
      ornaments: [ornament],
    };

    const fullBytes = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
      includeGuides: true,
      includeScaleBar: false,
      exportLayerMode: 'full',
    });
    const baseOnlyBytes = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
      includeGuides: true,
      includeScaleBar: false,
      exportLayerMode: 'base-only',
    });

    const fullPdf = await PDFDocument.load(fullBytes);
    const basePdf = await PDFDocument.load(baseOnlyBytes);

    expect(basePdf.getPageCount()).toBe(1);
    const baseSize = basePdf.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(baseSize.width)).toBeCloseTo(374, 2);
    expect(UnitConverter.pointsToMm(baseSize.height)).toBeCloseTo(265, 2);
    expect(basePdf.getTitle()).toContain('For HTV');

    // Full mode embeds font resources and BT/ET text streams; Base-Only omits text streams & fonts entirely
    const getFontCount = (doc: PDFDocument): number => {
      const resources = doc.getPage(0).node.Resources();
      const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
      return fontDict ? fontDict.entries().length : 0;
    };
    const getDecompressedPageStream = (doc: PDFDocument): string => {
      const pageNode = doc.getPage(0).node;
      const contents = pageNode.Contents();
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
      return refs
        .map((item) => {
          const resolved = item ? doc.context.lookup(item) : undefined;
          if (resolved instanceof PDFRawStream) {
            return inflateSync(Buffer.from(resolved.contents)).toString('latin1');
          }
          return '';
        })
        .join('\n');
    };

    expect(getFontCount(fullPdf)).toBeGreaterThan(0);
    expect(getFontCount(basePdf)).toBe(0);

    const fullStream = getDecompressedPageStream(fullPdf);
    const baseStream = getDecompressedPageStream(basePdf);
    expect(fullStream).toContain('\nBT\n');
    expect(baseStream).not.toContain('\nBT\n');
    // Base-Only retains background fills (f), cut/fold guides, and brass HTV center-alignment ticks (0.71 0.51 0.15 RG)
    expect(baseStream).toContain('\nf\n');
    expect(baseStream).toContain('0.92 0.14 0.14 RG');
    expect(baseStream).toContain('0.12 0.42 0.88 RG');
    expect(baseStream).toContain('0.71 0.51 0.15 RG');

    // Base-Only PDF is valid and meaningfully smaller without embedded fonts / text streams / ornament paths
    expect(baseOnlyBytes.byteLength).toBeGreaterThan(500);
    expect(baseOnlyBytes.byteLength).toBeLessThan(fullBytes.byteLength);

    // Also works with outer registration marks only (includeGuides: false)
    const baseNoGuidesBytes = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
      includeGuides: false,
      includeScaleBar: false,
      exportLayerMode: 'base-only',
    });
    const baseNoGuidesPdf = await PDFDocument.load(baseNoGuidesBytes);
    expect(baseNoGuidesPdf.getPageCount()).toBe(1);
    expect(getFontCount(baseNoGuidesPdf)).toBe(0);
    expect(getDecompressedPageStream(baseNoGuidesPdf)).not.toContain('\nBT\n');
  });

  it('appends detached inner pockets as Page 2 when appendInnerPocketsPage: true on A6 softcover-jacket (separate) + US Letter', async () => {
    const a6SeparateGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      softcoverPocketMode: 'separate',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      printMedia: 'letter',
    });
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Pocket Journal',
        author: 'A. Binder',
      },
    };

    // With appendInnerPocketsPage: true -> 2 pages (Page 1 = US Letter Landscape outer shell, Page 2 = US Letter Portrait detached pockets)
    const mergedBytes = await generatePrintReadyRollPdf(a6SeparateGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
      appendInnerPocketsPage: true,
      innerPageSizeId: 'letter',
    });
    const mergedPdf = await PDFDocument.load(mergedBytes);
    expect(mergedPdf.getPageCount()).toBe(2);

    const page1 = mergedPdf.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(page1.width)).toBeCloseTo(279.4, 2);
    expect(UnitConverter.pointsToMm(page1.height)).toBeCloseTo(215.9, 2);

    const page2 = mergedPdf.getPage(1).getSize();
    expect(UnitConverter.pointsToMm(page2.width)).toBeCloseTo(215.9, 2);
    expect(UnitConverter.pointsToMm(page2.height)).toBeCloseTo(279.4, 2);

    // Without appendInnerPocketsPage -> 1 page only
    const singleBytes = await generatePrintReadyRollPdf(a6SeparateGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
      appendInnerPocketsPage: false,
    });
    const singlePdf = await PDFDocument.load(singleBytes);
    expect(singlePdf.getPageCount()).toBe(1);
  });

  it('uses Print defaults (cut=true, external fold ticks=true, interior fold lines=false) and supports independent toggles across sheet, tiled, and roll-nested PDFs', async () => {
    const getPageStream = (doc: PDFDocument, pageIndex = 0): string => {
      const contents = doc.getPage(pageIndex).node.Contents();
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
      return refs
        .map((item) => {
          const resolved = item ? doc.context.lookup(item) : undefined;
          if (resolved instanceof PDFRawStream) {
            return inflateSync(Buffer.from(resolved.contents)).toString('latin1');
          }
          return '';
        })
        .join('\n');
    };

    const a6PbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      includeBleed: false,
    });
    const studio = CoverStudioModel.createDefault();

    // 1. Default Print PDF on exact-auto: red cut lines ON, interior dashed fold lines OFF
    const defaultExactBytes = await generatePrintReadyRollPdf(a6PbGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'exact-auto',
    });
    const defaultExactStream = getPageStream(await PDFDocument.load(defaultExactBytes), 0);
    expect(defaultExactStream).toContain('0.92 0.14 0.14 RG');
    expect(defaultExactStream).not.toContain('[4 2.5] 0 d');

    // 2. Explicit includeFoldLines: true emits interior dashed fold lines
    const withFoldLinesBytes = await generatePrintReadyRollPdf(a6PbGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'exact-auto',
      includeFoldLines: true,
    });
    const withFoldLinesStream = getPageStream(await PDFDocument.load(withFoldLinesBytes), 0);
    expect(withFoldLinesStream).toContain('[4 2.5] 0 d');

    // 3. Default Print PDF on 1-sheet US Letter: external blue fold guide ticks ON in sheet margin
    const letterDefaultBytes = await generatePrintReadyRollPdf(a6PbGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
    });
    const letterDefaultStream = getPageStream(await PDFDocument.load(letterDefaultBytes), 0);
    expect(letterDefaultStream).toContain('0.12 0.42 0.88 RG');

    // 4. Turning external fold guide ticks OFF removes blue ticks from sheet margin
    const letterNoTicksBytes = await generatePrintReadyRollPdf(a6PbGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
      includeFoldGuideTicks: false,
    });
    const letterNoTicksStream = getPageStream(await PDFDocument.load(letterNoTicksBytes), 0);
    expect(letterNoTicksStream).not.toContain('0.12 0.42 0.88 RG');

    // 5. Cut lines OFF + Fold lines OFF + External ticks ON on 1-sheet Letter
    const ticksOnlyBytes = await generatePrintReadyRollPdf(a6PbGeom, studio, null, {
      skipCanvasRaster: true,
      printMediaId: 'letter',
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });
    const ticksOnlyStream = getPageStream(await PDFDocument.load(ticksOnlyBytes), 0);
    expect(ticksOnlyStream).toContain('0.12 0.42 0.88 RG');
    expect(ticksOnlyStream).not.toContain('0.92 0.14 0.14 RG');
  });
});
