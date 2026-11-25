import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Rect2D } from '@/types/geometry';
import { UnitConverter } from '@/types/units';
import { layoutPdfToPrintMedia } from './pdfSheetLayout';
import {
  SCALE_BAR_BOX_H_MM,
  SCALE_BAR_BOX_W_MM,
  rectsIntersectMm,
} from './scaleBarPlacement';

async function createSamplePdf(widthMm: number, heightMm: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([UnitConverter.mmToPoints(widthMm), UnitConverter.mmToPoints(heightMm)]);
  page.drawRectangle({
    x: UnitConverter.mmToPoints(2),
    y: UnitConverter.mmToPoints(2),
    width: UnitConverter.mmToPoints(Math.max(1, widthMm - 4)),
    height: UnitConverter.mmToPoints(Math.max(1, heightMm - 4)),
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1,
  });
  return doc.save();
}

/** Extracts raw decoded PDF content stream string for a given page index. */
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

/** Extracts decoded PDF content stream text for a given page index so text overlays can be verified. */
function extractPageContentText(pdfDoc: PDFDocument, pageIndex: number): string {
  const rawStream = extractPageRawStream(pdfDoc, pageIndex);
  const decodedHexStrings: string[] = [];
  for (const match of rawStream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    decodedHexStrings.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  return decodedHexStrings.join('\n');
}

/** Extracts the (xMm, yMm) translation applied when stamping the embedded source PDF page via `drawPage`. */
function extractEmbeddedPageTranslationMm(
  pdfDoc: PDFDocument,
  pageIndex: number,
): { readonly xMm: number; readonly yMm: number } {
  const raw = extractPageRawStream(pdfDoc, pageIndex);
  // pdf-lib draws an embedded page as:
  //   q 1 0 0 1 <tx> <ty> cm <rotate cm> <scale cm> ... /EmbeddedPdfPage... Do Q
  const doIndex = raw.indexOf(' Do');
  expect(doIndex).toBeGreaterThan(-1);
  const beforeDo = raw.slice(0, doIndex);
  const lastQIndex = beforeDo.lastIndexOf('q\n');
  const drawBlock = lastQIndex >= 0 ? beforeDo.slice(lastQIndex) : beforeDo;
  const match = drawBlock.match(
    /1\s+0\s+0\s+1\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm/,
  );
  expect(match).not.toBeNull();
  return {
    xMm: UnitConverter.pointsToMm(Number(match![1])),
    yMm: UnitConverter.pointsToMm(Number(match![2])),
  };
}

/** Extracts the rendered 50 mm Scale-Check backing rectangle (mm) and orientation from a PDF page stream. */
function extractScaleBarBackingRectMm(
  pdfDoc: PDFDocument,
  pageIndex: number,
): (Rect2D & { readonly rotated90: boolean }) | null {
  const raw = extractPageRawStream(pdfDoc, pageIndex);
  const wPt = UnitConverter.mmToPoints(SCALE_BAR_BOX_W_MM);
  const hPt = UnitConverter.mmToPoints(SCALE_BAR_BOX_H_MM);

  // pdf-lib drawRectangle emits:
  //   1 0 0 1 <x> <y> cm ... 0 0 m 0 <h> l <w> <h> l <w> 0 l h
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

/** Verifies an exact 50.0 mm ruler baseline segment exists inside the given bounding box. */
function hasExact50mmBaselineLine(
  pdfDoc: PDFDocument,
  pageIndex: number,
  barRect: Rect2D & { readonly rotated90: boolean },
): boolean {
  const raw = extractPageRawStream(pdfDoc, pageIndex);
  const lineRegex =
    /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+m\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+l\s+S/g;
  for (const match of raw.matchAll(lineRegex)) {
    const x1 = UnitConverter.pointsToMm(Number(match[1]));
    const y1 = UnitConverter.pointsToMm(Number(match[2]));
    const x2 = UnitConverter.pointsToMm(Number(match[3]));
    const y2 = UnitConverter.pointsToMm(Number(match[4]));
    const inBox =
      x1 >= barRect.x - 0.1 &&
      x1 <= barRect.x + barRect.width + 0.1 &&
      x2 >= barRect.x - 0.1 &&
      x2 <= barRect.x + barRect.width + 0.1 &&
      y1 >= barRect.y - 0.1 &&
      y1 <= barRect.y + barRect.height + 0.1 &&
      y2 >= barRect.y - 0.1 &&
      y2 <= barRect.y + barRect.height + 0.1;
    if (!inBox) continue;

    if (!barRect.rotated90 && Math.abs(y2 - y1) < 0.05 && Math.abs(Math.abs(x2 - x1) - 50) < 0.05) {
      return true;
    }
    if (barRect.rotated90 && Math.abs(x2 - x1) < 0.05 && Math.abs(Math.abs(y2 - y1) - 50) < 0.05) {
      return true;
    }
  }
  return false;
}

describe('pdfSheetLayout (layoutPdfToPrintMedia)', () => {
  it('returns sourceBytes directly on exact-auto without scale bar and stamps 50 mm scale bar without altering dimensions when enabled', async () => {
    const source = await createSamplePdf(366, 259);

    const passthrough = await layoutPdfToPrintMedia(source, 366, 259, {
      printMediaId: 'exact-auto',
    });
    expect(passthrough).toBe(source);

    const withBar = await layoutPdfToPrintMedia(source, 366, 259, {
      printMediaId: 'exact-auto',
      includeScaleBar: true,
    });
    expect(withBar).not.toBe(source);
    expect(withBar.byteLength).toBeGreaterThan(source.byteLength);

    const doc = await PDFDocument.load(withBar);
    expect(doc.getPageCount()).toBe(1);
    const sz = doc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(366, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(259, 2);
    expect(extractPageContentText(doc, 0)).toContain('50 mm Scale Check');
  });

  it('centers a cover onto 1 exact US Legal Landscape sheet with footer and optional 50 mm scale bar', async () => {
    const source = await createSamplePdf(323, 170);

    const outBytes = await layoutPdfToPrintMedia(source, 323, 170, {
      printMediaId: 'legal',
      includeScaleBar: true,
      documentTitle: 'Test Cover — Legal 1-Sheet',
    });

    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Test Cover — Legal 1-Sheet');

    const sz = doc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(355.6, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(215.9, 2);

    const stream = extractPageContentText(doc, 0);
    expect(stream).toContain('US Legal (8.5 × 14")');
    expect(stream).toContain('50 mm Scale Check');
  });

  it('tiles onto 2 US Letter Portrait sheets with 10 mm and 20 mm overlaps, headers, overlap zone labels, and optional scale bar on Sheet 1 only', async () => {
    const source = await createSamplePdf(366, 259);

    // 10 mm default overlap + scale bar
    const tiled10 = await layoutPdfToPrintMedia(source, 366, 259, {
      printMediaId: 'letter',
      tileOverlapMm: 10,
      includeScaleBar: true,
    });
    const doc10 = await PDFDocument.load(tiled10);
    expect(doc10.getPageCount()).toBe(2);
    for (const i of [0, 1]) {
      const sz = doc10.getPage(i).getSize();
      expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(215.9, 2);
      expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(279.4, 2);
    }
    const p1Stream10 = extractPageContentText(doc10, 0);
    const p2Stream10 = extractPageContentText(doc10, 1);
    expect(p1Stream10).toContain('SHEET 1 OF 2');
    expect(p1Stream10).toContain('US Letter (8.5 × 11")');
    expect(p1Stream10).toContain('OVERLAP & TAPE ZONE');
    expect(p1Stream10).toContain('10 mm');
    expect(p1Stream10).toContain('50 mm Scale Check');
    expect(p2Stream10).toContain('SHEET 2 OF 2');
    expect(p2Stream10).toContain('OVERLAP & TAPE ZONE');
    expect(p2Stream10).not.toContain('50 mm Scale Check');

    // 20 mm custom overlap
    const tiled20 = await layoutPdfToPrintMedia(source, 366, 259, {
      printMediaId: 'letter',
      tileOverlapMm: 20,
    });
    const doc20 = await PDFDocument.load(tiled20);
    expect(doc20.getPageCount()).toBe(2);
    const p1Stream20 = extractPageContentText(doc20, 0);
    expect(p1Stream20).toContain('20 mm');
    expect(p1Stream20).not.toContain('50 mm Scale Check');

    // Boundary check: 395 x 250 mm fits 2-sheet Letter at 10 mm overlap (max 401.8) but not at 20 mm overlap (max 391.8)
    const boundarySource = await createSamplePdf(395, 250);
    const boundary10 = await layoutPdfToPrintMedia(boundarySource, 395, 250, {
      printMediaId: 'letter',
      tileOverlapMm: 10,
    });
    expect((await PDFDocument.load(boundary10)).getPageCount()).toBe(2);

    const boundary20 = await layoutPdfToPrintMedia(boundarySource, 395, 250, {
      printMediaId: 'letter',
      tileOverlapMm: 20,
    });
    expect(boundary20).toBe(boundarySource);
  });

  it('centers 1-sheet artwork and overlays strictly inside asymmetric printable safe box (bottom gripper margin >= 20 mm)', async () => {
    // 250 x 170 mm cover on US Letter Landscape (279.4 x 215.9 mm)
    // Fine-Art Sheet margins: top=5, bottom=20, left=10, right=5
    // Safe box: left=10, width=264.4, bottom=20, height=190.9, top=210.9
    // Expected artwork x = 10 + (264.4 - 250)/2 = 17.2 mm
    // Expected artwork y (PDF bottom-up) = 20 + (190.9 - 170)/2 = 30.45 mm (>= 20 mm!)
    const source = await createSamplePdf(250, 170);
    const outBytes = await layoutPdfToPrintMedia(source, 250, 170, {
      printMediaId: 'letter',
      includeScaleBar: true,
      printerMargins: { topMm: 5, bottomMm: 20, leftMm: 10, rightMm: 5 },
    });

    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(1);
    const sz = doc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(279.4, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(215.9, 2);

    const pos = extractEmbeddedPageTranslationMm(doc, 0);
    expect(pos.xMm).toBeCloseTo(17.2, 1);
    expect(pos.yMm).toBeCloseTo(30.45, 1);
    expect(pos.yMm).toBeGreaterThanOrEqual(20);
    expect(pos.yMm + 170).toBeLessThanOrEqual(215.9 - 5 + 0.01);

    // Verify footer and scale bar text are present and positioned above bottom gripper dead zone
    const text = extractPageContentText(doc, 0);
    expect(text).toContain('Centered on US Letter');
    expect(text).toContain('50 mm Scale Check');

    const raw = extractPageRawStream(doc, 0);
    const tmMatches = [
      ...raw.matchAll(/1\s+0\s+0\s+1\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm/g),
    ];
    expect(tmMatches.length).toBeGreaterThan(0);
    for (const match of tmMatches) {
      const textYMm = UnitConverter.pointsToMm(Number(match[2]));
      expect(textYMm).toBeGreaterThanOrEqual(20);
      expect(textYMm).toBeLessThanOrEqual(215.9 - 5);
    }
  });

  it('places 2-sheet tiled artwork strictly above bottom hardware margin dead zone', async () => {
    // 360 x 220 mm cover on US Letter Portrait (215.9 x 279.4 mm) with bottom=30 mm, top=5 mm
    // Safe height = 279.4 - 35 = 244.4 mm -> expected y = 30 + (244.4 - 220)/2 = 42.2 mm (>= 30 mm)
    const source = await createSamplePdf(360, 220);
    const outBytes = await layoutPdfToPrintMedia(source, 360, 220, {
      printMediaId: 'letter',
      tileOverlapMm: 10,
      includeScaleBar: true,
      printerMargins: { topMm: 5, bottomMm: 30, leftMm: 5, rightMm: 5 },
    });

    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(2);

    for (const pageIdx of [0, 1]) {
      const pos = extractEmbeddedPageTranslationMm(doc, pageIdx);
      expect(pos.yMm).toBeCloseTo(42.2, 1);
      expect(pos.yMm).toBeGreaterThanOrEqual(30);
      expect(pos.yMm + 220).toBeLessThanOrEqual(279.4 - 5 + 0.01);
    }
  });

  it('auto-rotates the 50 mm scale bar 90° into the side margin on 1-sheet PDF when top/bottom margins are too tight', async () => {
    // Tall 305 x 198 mm cover on US Legal Landscape (355.6 x 215.9 mm, 5 mm margins -> safeBox 345.6 x 205.9)
    // Cover sits at x = 25.3..330.3, y = 8.95..206.95 (only 3.95 mm top/bottom gap, 20.3 mm side gap)
    const source = await createSamplePdf(305, 198);
    const outBytes = await layoutPdfToPrintMedia(source, 305, 198, {
      printMediaId: 'legal',
      includeScaleBar: true,
    });

    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(1);
    expect(extractPageContentText(doc, 0)).toContain('50 mm Scale Check');

    const coverPos = extractEmbeddedPageTranslationMm(doc, 0);
    const coverRect: Rect2D = { x: coverPos.xMm, y: coverPos.yMm, width: 305, height: 198 };
    const barRect = extractScaleBarBackingRectMm(doc, 0);
    expect(barRect).not.toBeNull();
    expect(barRect!.rotated90).toBe(true);
    expect(barRect!.width).toBeCloseTo(SCALE_BAR_BOX_H_MM, 2);
    expect(barRect!.height).toBeCloseTo(SCALE_BAR_BOX_W_MM, 2);
    // Strictly inside US Legal safeBox [5..350.6] x [5..210.9] and zero collision with cover
    expect(barRect!.x).toBeGreaterThanOrEqual(5 - 0.05);
    expect(barRect!.x + barRect!.width).toBeLessThanOrEqual(350.6 + 0.05);
    expect(barRect!.y).toBeGreaterThanOrEqual(5 - 0.05);
    expect(barRect!.y + barRect!.height).toBeLessThanOrEqual(210.9 + 0.05);
    expect(rectsIntersectMm(barRect!, coverRect, 1.4)).toBe(false);
    expect(hasExact50mmBaselineLine(doc, 0, barRect!)).toBe(true);
  });

  it('places horizontal 50 mm scale bar collision-free above cover on 1-sheet PDF with ample top margin', async () => {
    const source = await createSamplePdf(323, 170);
    const outBytes = await layoutPdfToPrintMedia(source, 323, 170, {
      printMediaId: 'legal',
      includeScaleBar: true,
    });

    const doc = await PDFDocument.load(outBytes);
    const coverPos = extractEmbeddedPageTranslationMm(doc, 0);
    const coverRect: Rect2D = { x: coverPos.xMm, y: coverPos.yMm, width: 323, height: 170 };
    const barRect = extractScaleBarBackingRectMm(doc, 0);
    expect(barRect).not.toBeNull();
    expect(barRect!.rotated90).toBe(false);
    expect(barRect!.width).toBeCloseTo(SCALE_BAR_BOX_W_MM, 2);
    expect(barRect!.height).toBeCloseTo(SCALE_BAR_BOX_H_MM, 2);
    expect(rectsIntersectMm(barRect!, coverRect, 1.4)).toBe(false);
    expect(hasExact50mmBaselineLine(doc, 0, barRect!)).toBe(true);
  });

  it('auto-rotates the 50 mm scale bar 90° on 2-sheet tiled Sheet 1 when top/bottom margins are tight without hitting cover or seam', async () => {
    // 340 x 255 mm cover on US Letter Portrait (215.9 x 279.4 mm, 5 mm margins -> safeBox 205.9 x 269.4)
    // Sheet 1 clipped cover spans x = 20.45..195.45 (15.45 mm left margin), y = 12.2..267.2 (7.2 mm top/bottom gap)
    const source = await createSamplePdf(340, 255);
    const outBytes = await layoutPdfToPrintMedia(source, 340, 255, {
      printMediaId: 'letter',
      tileOverlapMm: 10,
      includeScaleBar: true,
    });

    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(2);
    expect(extractPageContentText(doc, 0)).toContain('50 mm Scale Check');

    const barRect = extractScaleBarBackingRectMm(doc, 0);
    expect(barRect).not.toBeNull();
    expect(barRect!.rotated90).toBe(true);
    const clippedCoverRect: Rect2D = { x: 20.45, y: 12.2, width: 175, height: 255 };
    expect(rectsIntersectMm(barRect!, clippedCoverRect, 1.4)).toBe(false);
    expect(barRect!.x).toBeGreaterThanOrEqual(5 - 0.05);
    expect(barRect!.y).toBeGreaterThanOrEqual(5 - 0.05);
    expect(barRect!.y + barRect!.height).toBeLessThanOrEqual(274.4 + 0.05);
    expect(hasExact50mmBaselineLine(doc, 0, barRect!)).toBe(true);
  });
});
