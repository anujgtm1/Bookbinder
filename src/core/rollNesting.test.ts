import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { UnitConverter } from '@/types/units';
import {
  composeNestedRollPdf,
  evaluateSingleItemRollCapacity,
  packItemsOntoRoll,
  type RollPlacedRect,
} from './rollNesting';

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

function extractPageContentText(pdfDoc: PDFDocument, pageIndex: number): string {
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

  const rawStream = chunks.join('\n');
  const decodedHexStrings: string[] = [];
  for (const match of rawStream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    decodedHexStrings.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  return decodedHexStrings.join('\n');
}

function rectsOverlap(a: RollPlacedRect, b: RollPlacedRect): boolean {
  const eps = 0.01;
  return (
    a.xMm < b.xMm + b.widthMm - eps &&
    a.xMm + a.widthMm > b.xMm + eps &&
    a.yMm < b.yMm + b.heightMm - eps &&
    a.yMm + a.heightMm > b.yMm + eps
  );
}

describe('rollNesting', () => {
  it('evaluates single-item roll capacity accurately (e.g. 15" cover on 36" roll)', () => {
    // 15" = 381 mm wide x 260 mm tall cover on 36" = 914.4 mm roll (sideMargin=5, gutter=10)
    // Printable width = 904.4 mm -> 2 across unrotated (772 mm), 3 across rotated (800 mm)
    const cap = evaluateSingleItemRollCapacity(381, 260, 914.4, 5, 10);
    expect(cap.printableWidthMm).toBeCloseTo(904.4, 2);
    expect(cap.maxAcrossUnrotated).toBe(2);
    expect(cap.maxAcrossRotated).toBe(3);
    expect(cap.recommendedMaxAcross).toBe(3);
    expect(cap.recommendedRotated).toBe(true);
    expect(cap.widthUtilizationPct).toBeCloseTo((3 * 260 / 904.4) * 100, 1);

    // Equal count across prefers smaller strip height along the roll feed
    const tie = evaluateSingleItemRollCapacity(280, 240, 610, 5, 10);
    expect(tie.maxAcrossUnrotated).toBe(2);
    expect(tie.maxAcrossRotated).toBe(2);
    expect(tie.recommendedRotated).toBe(false);

    // Oversized item in both dimensions
    const tooBig = evaluateSingleItemRollCapacity(500, 400, 330, 5, 10);
    expect(tooBig.maxAcrossUnrotated).toBe(0);
    expect(tooBig.maxAcrossRotated).toBe(0);
    expect(tooBig.recommendedMaxAcross).toBe(0);
    expect(tooBig.widthUtilizationPct).toBe(0);
  });

  it('packs N-up single cover copies with optimal orientation and respects allowRotation=false', () => {
    // 2 copies of 381 x 260 mm on 914.4 mm roll: unrotated uses 1 row of 260 mm (+10 margins = 270 mm)
    const twoUp = packItemsOntoRoll(
      [{ id: 'cover-a', label: 'Cover A', widthMm: 381, heightMm: 260, copies: 2 }],
      { rollWidthMm: 914.4, sideMarginMm: 5, leadingMarginMm: 5, gutterMm: 10 },
    );
    expect(twoUp.placements).toHaveLength(2);
    expect(twoUp.unplacedIds).toEqual([]);
    expect(twoUp.placements.every((p) => !p.rotated90)).toBe(true);
    expect(twoUp.placements[0].xMm).toBeCloseTo(5, 2);
    expect(twoUp.placements[1].xMm).toBeCloseTo(5 + 381 + 10, 2);
    expect(twoUp.usedLengthMm).toBeCloseTo(5 + 260 + 5, 2);
    expect(twoUp.maxCopiesAcrossUnrotated).toBe(2);
    expect(twoUp.maxCopiesAcrossRotated).toBe(3);

    // 3 copies of 381 x 260 mm on 914.4 mm roll: rotated fits all 3 across on 1 shelf (391 mm total vs 540 mm unrotated!)
    const threeUp = packItemsOntoRoll(
      [{ id: 'cover-a', label: 'Cover A', widthMm: 381, heightMm: 260, copies: 3 }],
      { rollWidthMm: 914.4, sideMarginMm: 5, leadingMarginMm: 5, gutterMm: 10 },
    );
    expect(threeUp.placements).toHaveLength(3);
    expect(threeUp.placements.every((p) => p.rotated90)).toBe(true);
    expect(threeUp.usedLengthMm).toBeCloseTo(5 + 381 + 5, 2);
    expect(threeUp.efficiencyPct).toBeGreaterThan(80);

    // Disabling rotation forces unrotated 2-shelf layout for 3 copies
    const noRotate = packItemsOntoRoll(
      [{ id: 'cover-a', label: 'Cover A', widthMm: 381, heightMm: 260, copies: 3 }],
      {
        rollWidthMm: 914.4,
        sideMarginMm: 5,
        leadingMarginMm: 5,
        gutterMm: 10,
        allowRotation: false,
      },
    );
    expect(noRotate.placements).toHaveLength(3);
    expect(noRotate.placements.every((p) => !p.rotated90)).toBe(true);
    expect(noRotate.recommendedRotated).toBe(false);
    expect(noRotate.recommendedMaxAcross).toBe(2);
    expect(noRotate.usedLengthMm).toBeCloseTo(5 + 260 + 10 + 260 + 5, 2);
  });

  it('packs multi-book gang sheets without overlaps and flags oversized items in unplacedIds', () => {
    const plan = packItemsOntoRoll(
      [
        { id: 'book-1', label: 'Trade Novel', widthMm: 381, heightMm: 255, copies: 2 },
        { id: 'book-2', label: 'Pocket Notebook', widthMm: 260, heightMm: 180, copies: 3 },
        { id: 'book-3', label: 'Inner Pockets', widthMm: 215.9, heightMm: 279.4, copies: 2 },
        { id: 'too-wide', label: 'Giant Atlas', widthMm: 980, heightMm: 950, copies: 1 },
      ],
      { rollWidthMm: 914.4, sideMarginMm: 5, leadingMarginMm: 5, gutterMm: 10 },
    );

    expect(plan.unplacedIds).toEqual(['too-wide']);
    expect(plan.placements).toHaveLength(7);
    expect(plan.efficiencyPct).toBeGreaterThan(40);
    expect(plan.efficiencyPct).toBeLessThanOrEqual(100);

    // Verify zero pairwise overlaps and strict printable roll bounds
    for (let i = 0; i < plan.placements.length; i += 1) {
      const a = plan.placements[i];
      expect(a.xMm).toBeGreaterThanOrEqual(plan.sideMarginMm - 0.01);
      expect(a.xMm + a.widthMm).toBeLessThanOrEqual(plan.rollWidthMm - plan.sideMarginMm + 0.01);
      expect(a.yMm).toBeGreaterThanOrEqual(5 - 0.01);
      expect(a.yMm + a.heightMm).toBeLessThanOrEqual(plan.usedLengthMm - 5 + 0.01);

      for (let j = i + 1; j < plan.placements.length; j += 1) {
        expect(rectsOverlap(a, plan.placements[j])).toBe(false);
      }
    }
  });

  it('auto-rotates an item that only fits when rotated 90 degrees', () => {
    // 480 x 250 mm on 330 mm (13") roll -> printable 320 mm: unrotated 480 > 320, rotated 250 <= 320
    const plan = packItemsOntoRoll(
      [{ id: 'cover', label: 'Wide Cover', widthMm: 480, heightMm: 250, copies: 1 }],
      { rollWidthMm: 330, sideMarginMm: 5, leadingMarginMm: 5, gutterMm: 10 },
    );
    expect(plan.unplacedIds).toEqual([]);
    expect(plan.placements).toHaveLength(1);
    expect(plan.placements[0].rotated90).toBe(true);
    expect(plan.placements[0].widthMm).toBeCloseTo(250, 2);
    expect(plan.placements[0].heightMm).toBeCloseTo(480, 2);
    expect(plan.usedLengthMm).toBeCloseTo(490, 2);
  });

  it('composes a valid single-page roll-width PDF with exact rollWidthMm x usedLengthMm dimensions', async () => {
    const coverA = await createSamplePdf(381, 260);
    const coverB = await createSamplePdf(260, 185);

    const { bytes, plan } = await composeNestedRollPdf(
      [
        { id: 'cover-a', label: 'Hardcover A', pdfBytes: coverA, copies: 3 },
        { id: 'cover-b', label: 'Notebook B', pdfBytes: coverB, copies: 2 },
      ],
      {
        rollWidthMm: 914.4,
        sideMarginMm: 5,
        leadingMarginMm: 5,
        gutterMm: 10,
        includeScaleBar: true,
      },
    );

    expect(plan.placements).toHaveLength(5);
    expect(plan.unplacedIds).toEqual([]);
    expect(plan.placements.some((p) => p.rotated90)).toBe(true);

    const outDoc = await PDFDocument.load(bytes);
    expect(outDoc.getPageCount()).toBe(1);

    const sz = outDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(914.4, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(plan.usedLengthMm, 2);

    const text = extractPageContentText(outDoc, 0);
    expect(text).toContain('Roll 36" (914 mm)');
    expect(text).toContain(`Used ${Math.round(plan.usedLengthMm)} mm`);
    expect(text).toContain(`${plan.efficiencyPct}% efficiency`);
    expect(text).toContain('50 mm Scale Check');

    // Verify omitting scale bar leaves out the calibration bar text
    const noBar = await composeNestedRollPdf(
      [{ id: 'cover-a', label: 'Hardcover A', pdfBytes: coverA, copies: 2 }],
      { rollWidthMm: 914.4, includeScaleBar: false },
    );
    const noBarDoc = await PDFDocument.load(noBar.bytes);
    const noBarText = extractPageContentText(noBarDoc, 0);
    expect(noBarText).not.toContain('50 mm Scale Check');
    expect(UnitConverter.pointsToMm(noBarDoc.getPage(0).getSize().height)).toBeCloseTo(
      noBar.plan.usedLengthMm,
      2,
    );
  });
});
