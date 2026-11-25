import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { getPageSizeSpec } from '@/resources/paperSpecs';
import { DEFAULT_BOOK_PARAMETERS, type BindingStyle, type PageSizeId } from '@/types/bookParams';
import { UnitConverter } from '@/types/units';
import {
  buildBenchChecklistSteps,
  buildBenchCutListRows,
  computeMiterGaugeGeometry,
  generateBenchRecipePdf,
  sanitizePdfText,
} from './benchRecipePdf';
import { calculateCaseGeometry } from './geometry';

describe('Bench Recipe & Scrap-Chipboard Cutting Jigs PDF', () => {
  it('sanitizes Unicode punctuation, diacritics, and non-WinAnsi characters to clean ASCII', () => {
    expect(sanitizePdfText('Café — 140 × 216 mm • 45° ≥ 35 mm… “Nautilus” 🚀 日本語')).toBe(
      'Cafe - 140 x 216 mm | 45 deg >= 35 mm... "Nautilus"',
    );
    expect(sanitizePdfText('   Multiple   spaces\tand\nlines  ')).toBe('Multiple spaces and lines');
  });

  it('computes exact 45-degree corner miter gauge geometry offset by exact miterGapMm from inner board corner', () => {
    for (const miterGapMm of [1.5, 3.0, 4.5, 7.5]) {
      const gauge = computeMiterGaugeGeometry(miterGapMm);
      expect(gauge.outerArmMm).toBe(45);
      expect(gauge.armWidthMm).toBe(14);
      expect(gauge.innerCorner).toEqual({ x: 14, y: 14 });
      expect(gauge.polygon).toHaveLength(7);

      // Diagonal edge endpoints (0, k) and (k, 0) define a true 45-degree line x + y = k
      expect(gauge.diagonalStart.x).toBe(0);
      expect(gauge.diagonalEnd.y).toBe(0);
      expect(gauge.diagonalStart.y).toBeCloseTo(gauge.diagonalEnd.x, 3);

      // Perpendicular distance from inner board corner (14, 14) to line x + y = k MUST equal miterGapMm
      const k = gauge.diagonalEnd.x;
      const perpDist = Math.abs(gauge.innerCorner.x + gauge.innerCorner.y - k) / Math.SQRT2;
      expect(perpDist).toBeCloseTo(miterGapMm, 2);

      // All polygon vertices stay strictly inside [0, 45] x [0, 45]
      for (const pt of gauge.polygon) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(45);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(45);
      }
    }
  });

  it('builds capability-driven cut lists and assembly checklists across all 6 binding strategies', () => {
    const cases: {
      readonly name: string;
      readonly style: BindingStyle;
      readonly softcoverPocketMode?: 'integrated' | 'separate';
      readonly expectChipboard: boolean;
      readonly expectHinge: boolean;
      readonly expectTurnIn: boolean;
      readonly expectFlaps: boolean;
      readonly expectGlueTabs: boolean;
      readonly expectInnerPockets: boolean;
    }[] = [
      {
        name: 'rigid-case',
        style: 'rigid-case',
        expectChipboard: true,
        expectHinge: true,
        expectTurnIn: true,
        expectFlaps: false,
        expectGlueTabs: false,
        expectInnerPockets: true,
      },
      {
        name: 'flexible-spine',
        style: 'flexible-spine',
        expectChipboard: true,
        expectHinge: false,
        expectTurnIn: true,
        expectFlaps: false,
        expectGlueTabs: false,
        expectInnerPockets: true,
      },
      {
        name: 'softcover-jacket-integrated',
        style: 'softcover-jacket',
        softcoverPocketMode: 'integrated',
        expectChipboard: false,
        expectHinge: false,
        expectTurnIn: false,
        expectFlaps: true,
        expectGlueTabs: true,
        expectInnerPockets: false,
      },
      {
        name: 'softcover-jacket-separate',
        style: 'softcover-jacket',
        softcoverPocketMode: 'separate',
        expectChipboard: false,
        expectHinge: false,
        expectTurnIn: false,
        expectFlaps: false,
        expectGlueTabs: true,
        expectInnerPockets: true,
      },
      {
        name: 'dust-jacket',
        style: 'dust-jacket',
        expectChipboard: false,
        expectHinge: false,
        expectTurnIn: false,
        expectFlaps: true,
        expectGlueTabs: false,
        expectInnerPockets: false,
      },
      {
        name: 'paperback-wrap',
        style: 'paperback-wrap',
        expectChipboard: false,
        expectHinge: false,
        expectTurnIn: false,
        expectFlaps: false,
        expectGlueTabs: false,
        expectInnerPockets: false,
      },
    ];

    for (const c of cases) {
      const params = {
        ...DEFAULT_BOOK_PARAMETERS,
        bindingStyle: c.style,
        ...(c.softcoverPocketMode ? { softcoverPocketMode: c.softcoverPocketMode } : {}),
      };
      const geom = calculateCaseGeometry(params);
      const rows = buildBenchCutListRows(geom, 'mm');
      const items = rows.map((r) => r.item.toLowerCase());

      expect(items.some((s) => s.includes('outer wrap'))).toBe(true);
      expect(items.some((s) => s.includes('chipboard'))).toBe(c.expectChipboard);
      expect(items.some((s) => s.includes('hinge spacer'))).toBe(c.expectHinge);
      expect(items.some((s) => s.includes('turn-in'))).toBe(c.expectTurnIn);
      expect(items.some((s) => s.includes('flap'))).toBe(c.expectFlaps);
      expect(items.some((s) => s.includes('glue tabs'))).toBe(c.expectGlueTabs);
      expect(items.some((s) => s.includes('inner pockets'))).toBe(c.expectInnerPockets);

      const steps = buildBenchChecklistSteps(geom, 'mm');
      expect(steps.length).toBeGreaterThanOrEqual(5);
      for (const step of steps) {
        expect(step.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it('generates a valid 1-page portrait PDF at exact 1:1 mm dimensions for Letter, A4, Legal, and Tabloid', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const pageSizes: readonly PageSizeId[] = ['letter', 'a4', 'legal', 'tabloid'];

    for (const pageSizeId of pageSizes) {
      const bytes = await generateBenchRecipePdf(geom, DEFAULT_BOOK_PARAMETERS, {
        pageSizeId,
        unit: pageSizeId === 'a4' ? 'mm' : 'in',
        bookTitle: 'Twenty Thousand Leagues — Collector’s Edition (Édition №1) 🌊',
      });

      expect(bytes.byteLength).toBeGreaterThan(1500);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);

      const expected = getPageSizeSpec(pageSizeId);
      const { width, height } = doc.getPage(0).getSize();
      expect(UnitConverter.pointsToMm(width)).toBeCloseTo(expected.widthMm, 2);
      expect(UnitConverter.pointsToMm(height)).toBeCloseTo(expected.heightMm, 2);
    }
  });

  it('generates valid 1-page PDFs for all binding styles including boardless slip covers, dust jackets, and extreme hinge spacers', async () => {
    const variants = [
      { ...DEFAULT_BOOK_PARAMETERS, bindingStyle: 'rigid-case' as const, hingeWidthMm: 25 },
      { ...DEFAULT_BOOK_PARAMETERS, bindingStyle: 'flexible-spine' as const },
      {
        ...DEFAULT_BOOK_PARAMETERS,
        bindingStyle: 'softcover-jacket' as const,
        softcoverPocketMode: 'integrated' as const,
      },
      {
        ...DEFAULT_BOOK_PARAMETERS,
        bindingStyle: 'softcover-jacket' as const,
        softcoverPocketMode: 'separate' as const,
      },
      { ...DEFAULT_BOOK_PARAMETERS, bindingStyle: 'dust-jacket' as const },
      { ...DEFAULT_BOOK_PARAMETERS, bindingStyle: 'paperback-wrap' as const },
    ];

    for (const params of variants) {
      const geom = calculateCaseGeometry(params);
      const bytes = await generateBenchRecipePdf(geom, params, {
        pageSizeId: 'letter',
        unit: 'mm',
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      expect(bytes.byteLength).toBeGreaterThan(1200);
    }
  });

  it('includes exact pocket board gluing insets in cut-list notes and assembly steps for chipboard slip-pocket builds only', () => {
    const rigidGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const rigidRowsMm = buildBenchCutListRows(rigidGeom, 'mm');
    const rigidPocketRowMm = rigidRowsMm.find((r) => r.item.includes('Inner Pockets'));
    expect(rigidPocketRowMm?.dims).toBe('100.8 x 218.0 mm');
    expect(rigidPocketRowMm?.note).toContain('Inset 2.5 mm T/B, 2.5 mm fore');

    const rigidStepsMm = buildBenchChecklistSteps(rigidGeom, 'mm');
    expect(
      rigidStepsMm.some((s) => s.includes('inset 2.5 mm top/bottom & 2.5 mm fore-edge')),
    ).toBe(true);

    const rigidRowsIn = buildBenchCutListRows(rigidGeom, 'in');
    const rigidPocketRowIn = rigidRowsIn.find((r) => r.item.includes('Inner Pockets'));
    expect(rigidPocketRowIn?.note).toContain('Inset 0.10 in T/B, 0.10 in fore');

    const flexGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'flexible-spine',
      overhangTopBottomMm: 10,
      overhangForeEdgeMm: 4,
    });
    const flexSteps = buildBenchChecklistSteps(flexGeom, 'mm');
    expect(flexSteps.some((s) => s.includes('inset 4.0 mm top/bottom & 3.5 mm fore-edge'))).toBe(
      true,
    );

    // Folded endpapers & detached softcover pockets omit slip-pocket board inset callouts
    const foldedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      interiorStyle: 'folded-endpapers',
    });
    expect(
      buildBenchCutListRows(foldedGeom, 'mm').find((r) => r.item.includes('Inner Pockets'))?.note,
    ).not.toContain('Inset');

    const separateSoft = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      softcoverPocketMode: 'separate',
    });
    expect(
      buildBenchCutListRows(separateSoft, 'mm').find((r) => r.item.includes('Inner Pockets'))?.note,
    ).not.toContain('Inset');
  });
});
