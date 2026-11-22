import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import { UnitConverter } from '@/types/units';
import {
  computeImageDrawRect,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  generateAffinityCoverSvg,
  generatePrintReadyRollPdf,
  hexToRgb01,
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

    // Zones partition totalWidthMm contiguously
    expect(
      spec.backZoneRect.width + spec.spineZoneRect.width + spec.frontZoneRect.width,
    ).toBeCloseTo(spec.totalWidthMm, 5);
  });

  it('computes cover-fit image draw rect with pan and zoom', () => {
    const zone = { x: 200, y: 0, width: 160, height: 265 };
    const rect = computeImageDrawRect(zone, {
      dataUrl: 'data:image/png;base64,abc',
      fileName: 'cover.png',
      naturalWidth: 1000,
      naturalHeight: 1000,
      zoom: 1.5,
      offsetXMm: 10,
      offsetYMm: -5,
    });

    expect(rect).not.toBeNull();
    // Square image covering 160 x 265 => baseScale = 265 / 1000 => 265 * 1.5 = 397.5 mm square
    expect(rect!.width).toBeCloseTo(397.5, 4);
    expect(rect!.height).toBeCloseTo(397.5, 4);
    expect(rect!.x).toBeCloseTo(200 + (160 - 397.5) / 2 + 10, 4);
    expect(rect!.y).toBeCloseTo((265 - 397.5) / 2 - 5, 4);

    expect(
      computeImageDrawRect(zone, {
        dataUrl: null,
        fileName: null,
        naturalWidth: 0,
        naturalHeight: 0,
        zoom: 1,
        offsetXMm: 0,
        offsetYMm: 0,
      }),
    ).toBeNull();
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
