import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { getPageSizeSpec } from '@/resources/paperSpecs';
import { DEFAULT_BOOK_PARAMETERS, type PageSizeId } from '@/types/bookParams';
import { UnitConverter } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import {
  generateSlipcasePdf,
  generateSlipcaseSvg,
  planSlipcasePdfLayout,
} from './slipcaseExport';
import { calculateSlipcaseGeometry } from './slipcaseGeometry';

describe('generateSlipcaseSvg', () => {
  it('generates a 1:1 physical mm SVG with all 5 board panels, arc thumb-notches, grain guides, and 50 mm scale square', () => {
    const caseGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const slipcase = calculateSlipcaseGeometry(caseGeom);
    const svg = generateSlipcaseSvg(slipcase);

    expect(svg).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toMatch(/height="[\d.]+mm"/);
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);

    // Named structural layers
    expect(svg).toContain('<g id="cut-lines"');
    expect(svg).toContain('<g id="grain-guides"');
    expect(svg).toContain('<g id="dimensions-notes"');

    // All 5 chipboard panels
    expect(svg).toContain('data-label="Front Side Wall"');
    expect(svg).toContain('data-label="Spine Wall (Closed Back)"');
    expect(svg).toContain('data-label="Back Side Wall"');
    expect(svg).toContain('data-label="Head Wall (Top Cap)"');
    expect(svg).toContain('data-label="Tail Wall (Bottom Cap)"');

    // True SVG arc command for thumb notches
    expect(svg).toContain('A 12 12 0 0 0 ');

    // 50 × 50 mm calibration square & wrap strip specs
    expect(svg).toContain('width="50" height="50"');
    expect(svg).toContain('50 mm Scale Check');
    expect(svg).toContain('Outer Wrap Strips');
  });

  it('omits SVG arc commands when thumbNotchRadiusMm is 0', () => {
    const caseGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const slipcase = calculateSlipcaseGeometry(caseGeom, { thumbNotchRadiusMm: 0 });
    const svg = generateSlipcaseSvg(slipcase);

    const cutLinesMatch = svg.match(/<g id="cut-lines"[\s\S]*?<\/g>/);
    expect(cutLinesMatch).not.toBeNull();
    expect(cutLinesMatch?.[0]).not.toMatch(/\bA\s+\d/);
    expect(svg).toContain('No Thumb Notch');
  });
});

describe('generateSlipcasePdf & planSlipcasePdfLayout', () => {
  it('generates valid loadable PDFs with exact physical mm page sizes across Letter, A4, Legal, and Tabloid', async () => {
    const caseGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const slipcase = calculateSlipcaseGeometry(caseGeom);
    const pageSizes: PageSizeId[] = ['letter', 'a4', 'legal', 'tabloid'];

    for (const pageSizeId of pageSizes) {
      const spec = getPageSizeSpec(pageSizeId);
      const plan = planSlipcasePdfLayout(slipcase, pageSizeId);

      // Header + all 5 chipboard panels placed cleanly without clipping
      expect(plan.placements).toHaveLength(6);
      expect(plan.placements.every((p) => !p.clipped)).toBe(true);
      expect(plan.placements.find((p) => p.kind === 'info-calibration')?.pageIndex).toBe(0);

      const { bytes, pageCount } = await generateSlipcasePdf(slipcase, pageSizeId);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(pageCount).toBe(plan.pageCount);
      expect(pageCount).toBeGreaterThanOrEqual(1);

      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(pageCount);

      const firstPage = doc.getPage(0);
      const { width, height } = firstPage.getSize();
      expect(UnitConverter.pointsToMm(width)).toBeCloseTo(spec.widthMm, 2);
      expect(UnitConverter.pointsToMm(height)).toBeCloseTo(spec.heightMm, 2);
    }
  });

  it('auto-rotates wide landscape panels 90 degrees to fit US Letter without clipping', async () => {
    const landscapeBook = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 220,
      pbHeightMm: 165,
      pbThicknessMm: 20,
    });
    const slipcase = calculateSlipcaseGeometry(landscapeBook);
    const plan = planSlipcasePdfLayout(slipcase, 'letter');

    // Side wall width (~226.5 mm) exceeds Letter usable width (200.9 mm) unrotated,
    // so both side walls and cap walls must auto-rotate 90° to fit cleanly.
    const frontWall = plan.placements.find((p) => p.kind === 'side-wall-front');
    expect(frontWall?.rotated90).toBe(true);
    expect(plan.placements.every((p) => !p.clipped)).toBe(true);

    const { bytes, pageCount } = await generateSlipcasePdf(slipcase, 'letter');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pageCount);
  });

  it('generates a clean PDF when thumbNotchRadiusMm is 0 and for boardless softcover books', async () => {
    const softCase = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 12,
    });
    const slipcase = calculateSlipcaseGeometry(softCase, { thumbNotchRadiusMm: 0 });
    const plan = planSlipcasePdfLayout(slipcase, 'tabloid');

    // Compact A6 slipcase fits entirely on 1 Tabloid sheet
    expect(plan.pageCount).toBe(1);
    expect(plan.placements.every((p) => !p.clipped)).toBe(true);

    const { bytes, pageCount } = await generateSlipcasePdf(slipcase, 'tabloid');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pageCount);
    expect(pageCount).toBe(1);
  });
});
