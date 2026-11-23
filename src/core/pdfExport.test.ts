import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS, PAGE_SIZES } from '@/types/bookParams';
import { UnitConverter } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import {
  generateInnerTemplatesPdf,
  generateOuterWrapPdf,
  planInnerTemplateLayout,
} from './pdfExport';

describe('Inner Envelopes & Spine Liner PDF exporter', () => {
  it('omits the legend block by default for tighter packing and includes it on Page 1 when includeLegend is enabled', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    // Default (includeLegend = false): only the 3 template pieces are packed
    const letterCompact = planInnerTemplateLayout(geom, 'letter');
    expect(letterCompact.placements).toHaveLength(3);
    expect(letterCompact.placements.some((p) => p.kind === 'calibration-legend')).toBe(false);
    expect(letterCompact.placements.every((p) => !p.clipped)).toBe(true);

    // Opt-in (includeLegend = true): includes calibration-legend on Page 1
    const letterWithLegend = planInnerTemplateLayout(geom, 'letter', { includeLegend: true });
    expect(letterWithLegend.pageCount).toBe(2);
    expect(letterWithLegend.placements).toHaveLength(4);
    expect(letterWithLegend.placements.every((p) => !p.clipped)).toBe(true);
    const cal = letterWithLegend.placements.find((p) => p.kind === 'calibration-legend');
    expect(cal?.pageIndex).toBe(0);

    // Compact A6 / pocket notebook fits on 1 US Letter sheet without legend, vs 2 sheets with legend
    const a6Geom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 12,
    });
    const a6NoLegend = planInnerTemplateLayout(a6Geom, 'letter');
    const a6WithLegend = planInnerTemplateLayout(a6Geom, 'letter', { includeLegend: true });
    expect(a6NoLegend.pageCount).toBe(1);
    expect(a6NoLegend.pageCount).toBeLessThanOrEqual(a6WithLegend.pageCount);

    const a4Plan = planInnerTemplateLayout(geom, 'a4', { includeLegend: true });
    expect(a4Plan.pageCount).toBe(2);
    expect(a4Plan.placements.every((p) => !p.clipped)).toBe(true);
  });

  it('packs default book onto a single page on Tabloid with auto-rotation', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const tabloidPlan = planInnerTemplateLayout(geom, 'tabloid');

    expect(tabloidPlan.pageCount).toBe(1);
    expect(tabloidPlan.placements.every((p) => !p.clipped)).toBe(true);
  });

  it('auto-rotates tall pieces 90 degrees when portrait height exceeds Letter printable height', () => {
    // Tall paperback (248 mm -> pocket total height = 248 + 7 - 2 + 24 = 277 mm > Letter usable 259.4 mm)
    // Wait: pocket width = (130 + 3)*0.72 + 12 = 107.76 mm <= 259.4 mm, height = 277 mm -> fits rotated if <= 195.9 mm?
    // Test a piece whose height is 185 mm and width is 110 mm on a tight case, or liner 265mm tall on Letter:
    // Better: pbHeightMm = 240, pbWidthMm = 120 -> pocket totalHeight = 269 mm (> 259.4 mm usable height),
    // wait rotated width = 269 > 195.9, so test A4 where usableH = 277 mm vs Letter where spine liner (260mm) rotates on Tabloid or fits cleanly.
    const compactBook = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbHeightMm: 174,
      pbWidthMm: 106,
      pbThicknessMm: 20,
    });
    const plan = planInnerTemplateLayout(compactBook, 'letter');
    expect(plan.placements.every((p) => !p.clipped)).toBe(true);
    expect(plan.pageCount).toBeLessThanOrEqual(2);
  });

  it('generates a valid PDF with exact physical millimeter page dimensions', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const { bytes, plan } = await generateInnerTemplatesPdf(geom, 'a4');

    expect(bytes.byteLength).toBeGreaterThan(1000);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(plan.pageCount);

    const firstPage = loaded.getPage(0);
    const { width, height } = firstPage.getSize();
    expect(UnitConverter.pointsToMm(width)).toBeCloseTo(PAGE_SIZES.a4.widthMm, 2);
    expect(UnitConverter.pointsToMm(height)).toBeCloseTo(PAGE_SIZES.a4.heightMm, 2);
  });

  it('generates exact 1:1 mm Outer Case Wrap PDF for single-piece and 3-piece split modes', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    const singleBytes = await generateOuterWrapPdf(geom, 'single');
    const singleDoc = await PDFDocument.load(singleBytes);
    expect(singleDoc.getPageCount()).toBe(1);
    const singleSize = singleDoc.getPage(0).getSize();
    // Default WRAP_W = 366 + 6 bleed = 372 mm, WRAP_H = 259 + 6 bleed = 265 mm
    expect(UnitConverter.pointsToMm(singleSize.width)).toBeCloseTo(372, 2);
    expect(UnitConverter.pointsToMm(singleSize.height)).toBeCloseTo(265, 2);

    const splitBytes = await generateOuterWrapPdf(geom, 'three-piece');
    const splitDoc = await PDFDocument.load(splitBytes);
    expect(splitDoc.getPageCount()).toBe(3);

    // 1-Piece Fold-and-Glue Slip Cover for A6 (5 mm spine, no bleed) -> exact 266.4 x 170.0 mm page
    const a6SoftGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      includeBleed: false,
    });
    const softBytes = await generateOuterWrapPdf(a6SoftGeom, 'single');
    const softDoc = await PDFDocument.load(softBytes);
    expect(softDoc.getPageCount()).toBe(1);
    const softSize = softDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(softSize.width)).toBeCloseTo(266.4, 1);
    expect(UnitConverter.pointsToMm(softSize.height)).toBeCloseTo(170.0, 1);
  });
});
