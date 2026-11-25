import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import type { PrintMediaId } from '@/types/bookParams';
import type { Rect2D } from '@/types/geometry';
import { UnitConverter } from '@/types/units';
import type { PrinterMargins } from './printerMargins';
import {
  SCALE_BAR_BOX_H_MM,
  SCALE_BAR_BOX_W_MM,
  rectsIntersectMm,
} from './scaleBarPlacement';
import {
  composeNestedSheetPdf,
  evaluateSingleItemSheetCapacity,
  packItemsOntoSheets,
  type SheetPlacedRect,
} from './sheetNesting';

async function createSamplePdf(widthMm: number, heightMm: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([UnitConverter.mmToPoints(widthMm), UnitConverter.mmToPoints(heightMm)]);
  page.drawRectangle({
    x: UnitConverter.mmToPoints(2),
    y: UnitConverter.mmToPoints(2),
    width: UnitConverter.mmToPoints(Math.max(1, widthMm - 4)),
    height: UnitConverter.mmToPoints(Math.max(1, heightMm - 4)),
    borderColor: rgb(0.15, 0.25, 0.45),
    borderWidth: 1,
  });
  return doc.save();
}

function extractPageRawStream(pdfDoc: PDFDocument, pageIndex: number): string {
  const page = pdfDoc.getPage(pageIndex);
  const contents = page.node.Contents();
  if (!contents) return '';

  const chunks: string[] = [];
  const decodeStream = (stream: unknown) => {
    if (stream instanceof PDFRawStream) {
      const filter = stream.dict.get(PDFName.of('Filter'));
      const raw = stream.getContents();
      const bytes = filter?.toString().includes('FlateDecode') ? inflateSync(raw) : raw;
      chunks.push(Buffer.from(bytes).toString('latin1'));
    }
  };

  if (contents instanceof PDFRawStream) {
    decodeStream(contents);
  } else if ('asArray' in contents && typeof contents.asArray === 'function') {
    for (const ref of contents.asArray()) {
      decodeStream(pdfDoc.context.lookup(ref));
    }
  }

  return chunks.join('\n');
}

function extractPageContentText(pdfDoc: PDFDocument, pageIndex: number): string {
  const rawStream = extractPageRawStream(pdfDoc, pageIndex);
  const decodedHexStrings: string[] = [];
  for (const match of rawStream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    decodedHexStrings.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  return decodedHexStrings.join('\n');
}

function extractScaleBarBackingRectMm(
  pdfDoc: PDFDocument,
  pageIndex: number,
): (Rect2D & { readonly rotated90: boolean }) | null {
  const raw = extractPageRawStream(pdfDoc, pageIndex);
  const wPt = UnitConverter.mmToPoints(SCALE_BAR_BOX_W_MM);
  const hPt = UnitConverter.mmToPoints(SCALE_BAR_BOX_H_MM);

  const rectRegex =
    /1\s+0\s+0\s+1\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm[\s\S]{0,160}?0\s+0\s+m\s+0\s+(-?\d+(?:\.\d+)?)\s+l\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+l\s+(-?\d+(?:\.\d+)?)\s+0\s+l\s+h/g;
  for (const match of raw.matchAll(rectRegex)) {
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    const rh = Number(match[3]);
    const rw = Number(match[4]);

    const isHorizontal = Math.abs(rw - wPt) < 0.2 && Math.abs(rh - hPt) < 0.2;
    const isVertical = Math.abs(rw - hPt) < 0.2 && Math.abs(rh - wPt) < 0.2;
    if (isHorizontal || isVertical) {
      return {
        x: UnitConverter.pointsToMm(tx),
        y: UnitConverter.pointsToMm(ty),
        width: UnitConverter.pointsToMm(rw),
        height: UnitConverter.pointsToMm(rh),
        rotated90: isVertical,
      };
    }
  }
  return null;
}

function rectsOverlap(a: SheetPlacedRect, b: SheetPlacedRect): boolean {
  const eps = 0.01;
  return (
    a.xMm < b.xMm + b.widthMm - eps &&
    a.xMm + a.widthMm > b.xMm + eps &&
    a.yMm < b.yMm + b.heightMm - eps &&
    a.yMm + a.heightMm > b.yMm + eps
  );
}

describe('sheetNesting', () => {
  it('evaluates single-item sheet capacity accurately for A6 on Tabloid, compact cover on Letter, and non-sheet media', () => {
    // 2x A6 paperback wrap covers (231 x 154 mm) fit on 1 Tabloid sheet (279.4 x 431.8 mm)
    const a6Tabloid = evaluateSingleItemSheetCapacity(231, 154, 'tabloid', undefined, 10, true);
    expect(a6Tabloid.mediaId).toBe('tabloid');
    expect(a6Tabloid.maxPerSheet).toBe(2);
    expect(a6Tabloid.utilizationPct).toBeGreaterThan(50);
    expect(a6Tabloid.utilizationPct).toBeLessThanOrEqual(100);

    // 1x compact US Trade / pocket cover (250 x 195 mm) fits 1-up on US Letter Landscape
    const letterOneUp = evaluateSingleItemSheetCapacity(250, 195, 'letter', undefined, 10, true);
    expect(letterOneUp.maxPerSheet).toBe(1);
    expect(letterOneUp.orientation).toBe('landscape');
    expect(letterOneUp.utilizationPct).toBeGreaterThan(70);

    // Non-sheet media returns 0 capacity
    for (const nonSheet of ['exact-auto', 'roll-36', 'roll-custom'] as const) {
      const cap = evaluateSingleItemSheetCapacity(200, 150, nonSheet);
      expect(cap.maxPerSheet).toBe(0);
      expect(cap.utilizationPct).toBe(0);
    }
  });

  it('packs two different book covers onto 1 Tabloid sheet without overlaps', () => {
    const plan = packItemsOntoSheets(
      [
        { id: 'book-a', label: 'A6 Poetry Chapbook', widthMm: 231, heightMm: 154, copies: 1 },
        { id: 'book-b', label: 'Pocket Field Journal', widthMm: 220, heightMm: 168, copies: 1 },
      ],
      { mediaId: 'tabloid', gutterMm: 10 },
    );

    expect(plan.unplacedIds).toEqual([]);
    expect(plan.pages).toHaveLength(1);
    expect(plan.totalPlacedCount).toBe(2);
    expect(plan.overallEfficiencyPct).toBeGreaterThan(50);

    const [p0, p1] = plan.pages[0].placements;
    expect(new Set([p0.itemId, p1.itemId])).toEqual(new Set(['book-a', 'book-b']));
    expect(rectsOverlap(p0, p1)).toBe(false);
  });

  it('auto-selects portrait vs landscape orientation to minimize sheets and maximize fit', () => {
    // 340 x 210 mm cover cannot fit portrait Tabloid (269.4 mm wide) without rotating,
    // and with allowRotation=false ONLY fits landscape Tabloid (421.8 x 269.4 mm).
    const landscapeOnly = packItemsOntoSheets(
      [{ id: 'wide-cover', label: 'Wide Cover', widthMm: 340, heightMm: 210, copies: 1 }],
      { mediaId: 'tabloid', allowRotation: false, gutterMm: 10 },
    );
    expect(landscapeOnly.orientation).toBe('landscape');
    expect(landscapeOnly.pages).toHaveLength(1);
    expect(landscapeOnly.unplacedIds).toEqual([]);

    // Two 240 x 175 mm covers with allowRotation=false fit on 1 Portrait Tabloid (175+10+175=360 <= 421.8),
    // whereas Landscape Tabloid can only fit 1 per sheet (240+10+240=490 > 421.8, 175+10+175=360 > 269.4).
    const portraitBetter = packItemsOntoSheets(
      [{ id: 'digest', label: 'Digest Cover', widthMm: 240, heightMm: 175, copies: 2 }],
      { mediaId: 'tabloid', allowRotation: false, gutterMm: 10 },
    );
    expect(portraitBetter.orientation).toBe('portrait');
    expect(portraitBetter.pages).toHaveLength(1);
    expect(portraitBetter.totalPlacedCount).toBe(2);
  });

  it('strictly respects asymmetric PrinterMargins so no placement exceeds printableSafeBox', () => {
    const asymmetricMargins: PrinterMargins = {
      topMm: 6,
      bottomMm: 30,
      leftMm: 12,
      rightMm: 14,
      presetId: 'custom',
    };

    const plan = packItemsOntoSheets(
      [
        { id: 'book-1', label: 'Pocket A', widthMm: 220, heightMm: 150, copies: 2 },
        { id: 'book-2', label: 'Pocket B', widthMm: 190, heightMm: 140, copies: 2 },
      ],
      { mediaId: 'tabloid', printerMargins: asymmetricMargins, gutterMm: 8 },
    );

    expect(plan.unplacedIds).toEqual([]);
    expect(plan.totalPlacedCount).toBe(4);

    const safe = plan.printableSafeBox;
    expect(safe.xMm).toBeCloseTo(12, 2);
    expect(safe.yMm).toBeCloseTo(6, 2);
    expect(safe.widthMm).toBeCloseTo(plan.sheetWidthMm - 26, 2);
    expect(safe.heightMm).toBeCloseTo(plan.sheetHeightMm - 36, 2);

    for (const page of plan.pages) {
      for (let i = 0; i < page.placements.length; i += 1) {
        const a = page.placements[i];
        expect(a.xMm).toBeGreaterThanOrEqual(safe.xMm - 0.01);
        expect(a.xMm + a.widthMm).toBeLessThanOrEqual(safe.xMm + safe.widthMm + 0.06);
        expect(a.yMm).toBeGreaterThanOrEqual(safe.yMm - 0.01);
        expect(a.yMm + a.heightMm).toBeLessThanOrEqual(safe.yMm + safe.heightMm + 0.06);

        for (let j = i + 1; j < page.placements.length; j += 1) {
          expect(rectsOverlap(a, page.placements[j])).toBe(false);
        }
      }
    }
  });

  it('respects allowRotation=false vs true, paginates overflow, reports oversized items, and is deterministic', () => {
    // 145 x 235 mm cover: on Tabloid with allowRotation=false, 2 fit side-by-side in Landscape
    // or 1-per-row in Portrait; let's test a case where rotation explicitly reduces page count:
    // Item 1 (240 x 175) + Item 2 (175 x 240) on Tabloid:
    // Without rotation, one is wide and one is tall -> cannot share Portrait (240+10+175 > 269.4, 175+10+240=425 > 421.8)
    // and cannot share Landscape (240+10+175=425 > 421.8) -> requires 2 pages!
    // With rotation, both orient identically (240 x 175) -> stack cleanly on 1 Portrait Tabloid page!
    const mixedItems = [
      { id: 'wide', label: 'Wide Book', widthMm: 240, heightMm: 175, copies: 1 },
      { id: 'tall', label: 'Tall Book', widthMm: 175, heightMm: 240, copies: 1 },
    ] as const;

    const noRotate = packItemsOntoSheets(mixedItems, {
      mediaId: 'tabloid',
      gutterMm: 10,
      allowRotation: false,
    });
    expect(noRotate.pages).toHaveLength(2);
    expect(noRotate.pages.flatMap((p) => p.placements).every((r) => !r.rotated90)).toBe(true);

    const withRotate = packItemsOntoSheets(mixedItems, {
      mediaId: 'tabloid',
      gutterMm: 10,
      allowRotation: true,
    });
    expect(withRotate.pages).toHaveLength(1);
    expect(withRotate.pages[0].placements.some((r) => r.rotated90)).toBe(true);

    // Multi-page overflow + oversized item deduplication
    const overflowItems = [
      { id: 'small', label: 'A6 Cover', widthMm: 230, heightMm: 155, copies: 5 },
      { id: 'giant', label: 'Giant Atlas', widthMm: 500, heightMm: 350, copies: 2 },
    ] as const;

    const overflowA = packItemsOntoSheets(overflowItems, { mediaId: 'tabloid', gutterMm: 10 });
    const overflowB = packItemsOntoSheets(overflowItems, { mediaId: 'tabloid', gutterMm: 10 });

    expect(overflowA.unplacedIds).toEqual(['giant']);
    expect(overflowA.totalPlacedCount).toBe(5);
    expect(overflowA.pages).toHaveLength(3);
    expect(overflowA.pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
    expect(overflowA).toEqual(overflowB);
  });

  it('composes valid multi-page cut-sheet PDFs at exact sheet millimeter dimensions across Tabloid, Letter, A4, and Legal', async () => {
    const mediaIds: readonly PrintMediaId[] = ['tabloid', 'letter', 'a4', 'legal'];
    const sampleCover = await createSamplePdf(180, 130);

    for (const mediaId of mediaIds) {
      const spec = getPrintMediaSpec(mediaId);
      const { bytes, plan } = await composeNestedSheetPdf(
        [{ id: 'cover-1', label: 'Mini Journal', pdfBytes: sampleCover, copies: 3 }],
        { mediaId, gutterMm: 8, includeScaleBar: true },
      );

      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(plan.pages.length);

      expect(spec.shortMm).not.toBeNull();
      expect(spec.longMm).not.toBeNull();
      if (spec.shortMm === null || spec.longMm === null) {
        throw new Error(`Expected sheet dimensions for ${mediaId}`);
      }
      const expectedW = plan.orientation === 'landscape' ? spec.longMm : spec.shortMm;
      const expectedH = plan.orientation === 'landscape' ? spec.shortMm : spec.longMm;

      for (let pageIdx = 0; pageIdx < doc.getPageCount(); pageIdx += 1) {
        const size = doc.getPage(pageIdx).getSize();
        expect(UnitConverter.pointsToMm(size.width)).toBeCloseTo(expectedW, 1);
        expect(UnitConverter.pointsToMm(size.height)).toBeCloseTo(expectedH, 1);

        const text = extractPageContentText(doc, pageIdx);
        expect(text).toContain(
          `Sheet ${pageIdx + 1} of ${plan.pages.length} | ${spec.shortLabel}`,
        );
        expect(text).toContain(`${plan.pages[pageIdx].placements.length} pcs`);
        expect(text).toContain('50 mm Scale Check');
      }
    }

    // Verify scale bar is collision-free on a 2-up Tabloid sheet and omitted when includeScaleBar=false
    const coverA = await createSamplePdf(230, 154);
    const coverB = await createSamplePdf(220, 150);

    const withBar = await composeNestedSheetPdf(
      [
        { id: 'a', label: 'Book A', pdfBytes: coverA, copies: 1 },
        { id: 'b', label: 'Book B', pdfBytes: coverB, copies: 1 },
      ],
      { mediaId: 'tabloid', gutterMm: 10, includeScaleBar: true },
    );
    expect(withBar.plan.pages).toHaveLength(1);

    const withBarDoc = await PDFDocument.load(withBar.bytes);
    const barRect = extractScaleBarBackingRectMm(withBarDoc, 0);
    expect(barRect).not.toBeNull();
    if (!barRect) {
      throw new Error('Expected 50 mm scale check bar to be present on nested sheet PDF');
    }

    const pageH = withBar.plan.sheetHeightMm;
    for (const placed of withBar.plan.pages[0].placements) {
      const placedPdfRect: Rect2D = {
        x: placed.xMm,
        y: pageH - placed.yMm - placed.heightMm,
        width: placed.widthMm,
        height: placed.heightMm,
      };
      expect(rectsIntersectMm(barRect, placedPdfRect, 1.0)).toBe(false);
    }

    const withoutBar = await composeNestedSheetPdf(
      [{ id: 'a', label: 'Book A', pdfBytes: coverA, copies: 1 }],
      { mediaId: 'tabloid', includeScaleBar: false },
    );
    const withoutBarDoc = await PDFDocument.load(withoutBar.bytes);
    expect(extractPageContentText(withoutBarDoc, 0)).not.toContain('50 mm Scale Check');
  });
});
