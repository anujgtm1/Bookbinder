import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { UnitConverter } from '@/types/units';
import { layoutPdfToPrintMedia } from './pdfSheetLayout';

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

/** Extracts decoded PDF content stream text for a given page index so text overlays can be verified. */
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
});
