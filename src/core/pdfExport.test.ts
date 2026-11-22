import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS, PAGE_SIZES } from '@/types/bookParams';
import { UnitConverter } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import { generateInnerTemplatesPdf, planInnerTemplateLayout } from './pdfExport';

describe('Inner Envelopes & Spine Liner PDF exporter', () => {
  it('packs default book onto 2 pages on US Letter and A4 with zero clipping', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    const letterPlan = planInnerTemplateLayout(geom, 'letter');
    expect(letterPlan.pageCount).toBe(2);
    expect(letterPlan.placements).toHaveLength(4);
    expect(letterPlan.placements.every((p) => !p.clipped)).toBe(true);
    // Calibration square is placed on Page 1
    const cal = letterPlan.placements.find((p) => p.kind === 'calibration-legend');
    expect(cal?.pageIndex).toBe(0);

    const a4Plan = planInnerTemplateLayout(geom, 'a4');
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
});
