import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import { UnitConverter } from '@/types/units';
import {
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
});
