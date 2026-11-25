import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { SERIES_STARTER_TEMPLATES } from '@/resources/seriesPresets';
import {
  DEFAULT_SERIES_CRICUT_OPTIONS,
  generateSeriesCoversPdf,
  generateSeriesCricutHtvSvg,
  generateSeriesSpineProofPdf,
} from '@/studio/seriesExporters';
import type { ProjectId } from '@/types/projectLibrary';
import { SeriesProjectModel } from '@/types/seriesSpines';
import type { CoverStudioState } from '@/types/studio';

const REAL_WOFF_BYTES = new Uint8Array(
  readFileSync(
    resolve(
      process.cwd(),
      'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff',
    ),
  ),
);

describe('seriesExporters — Cricut HTV Gang SVG, 1:1 Spine Proof PDF, and Full Cover Set PDF', () => {
  it('generates Cricut HTV gang-sheet SVG with zero <text>, zero <image>, and zero transform= attributes', async () => {
    const series = SERIES_STARTER_TEMPLATES[0].build();

    const unmirrored = await generateSeriesCricutHtvSvg(
      series,
      null,
      {
        ...DEFAULT_SERIES_CRICUT_OPTIONS,
        gapMm: 8,
        mirrorForHtv: false,
        includeWeedingBox: true,
        includeRegistrationMarks: true,
        includeBands: true,
        groupByColor: false,
      },
      REAL_WOFF_BYTES,
    );

    expect(unmirrored.spineCount).toBe(3);
    expect(unmirrored.pathCount).toBeGreaterThanOrEqual(4);
    expect(unmirrored.svg).toContain(`width="${unmirrored.widthMm}mm"`);
    expect(unmirrored.svg).toContain(`height="${unmirrored.heightMm}mm"`);
    expect(unmirrored.svg).toContain('id="series-lettering"');
    expect(unmirrored.svg).toContain('id="series-spine-bands"');
    expect(unmirrored.svg).toContain('id="series-ornaments"');
    expect(unmirrored.svg).toContain('id="series-alignment-marks"');
    expect(unmirrored.svg).toContain('id="series-weeding-box"');

    // STRICT CRICUT HYGIENE INVARIANT
    expect(unmirrored.svg).not.toContain('<text');
    expect(unmirrored.svg).not.toContain('<image');
    expect(unmirrored.svg).not.toContain('transform=');

    expect(unmirrored.matFit.mat12x12).toBe(true);
    expect(unmirrored.matFit.mat12x24).toBe(true);

    // Mirrored & color-grouped output
    const mirrored = await generateSeriesCricutHtvSvg(
      series,
      null,
      {
        ...DEFAULT_SERIES_CRICUT_OPTIONS,
        gapMm: 8,
        mirrorForHtv: true,
        groupByColor: true,
      },
      REAL_WOFF_BYTES,
    );
    expect(mirrored.svg).not.toBe(unmirrored.svg);
    expect(mirrored.svg).not.toContain('<text');
    expect(mirrored.svg).not.toContain('<image');
    expect(mirrored.svg).not.toContain('transform=');
    expect(mirrored.fileName).toContain('_mirrored_multicolor.svg');
    expect(mirrored.foilColors.length).toBeGreaterThanOrEqual(2);
  });

  it('generates valid 1:1 Spine Proof PDFs for both Custom Fit and canonical desktop sheets', async () => {
    const series = SeriesProjectModel.createDefault();

    const customFit = await generateSeriesSpineProofPdf(series, null, {
      paperSize: 'custom-fit',
      includeScaleBar: true,
      includeAlignmentGuides: true,
      skipCanvasRaster: true,
    });
    expect(new TextDecoder().decode(customFit.bytes.slice(0, 5))).toBe('%PDF-');
    expect(customFit.pageCount).toBe(1);
    const customDoc = await PDFDocument.load(customFit.bytes);
    expect(customDoc.getPageCount()).toBe(1);

    const letterProof = await generateSeriesSpineProofPdf(series, null, {
      paperSize: 'letter',
      includeScaleBar: true,
      includeAlignmentGuides: true,
      skipCanvasRaster: true,
    });
    expect(new TextDecoder().decode(letterProof.bytes.slice(0, 5))).toBe('%PDF-');
    const letterDoc = await PDFDocument.load(letterProof.bytes);
    expect(letterDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('merges all books in the series into a multi-page Full Cover Set PDF', async () => {
    const series = SeriesProjectModel.createDefault();
    const emptyMap = new Map<ProjectId, CoverStudioState>();

    const result = await generateSeriesCoversPdf(series, null, emptyMap, {
      dpi: 300,
      includeScaleBar: true,
      skipCanvasRaster: true,
    });

    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe('%PDF-');
    expect(result.bookCount).toBe(3);
    expect(result.pageCount).toBe(3);

    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(3);
  });
});
