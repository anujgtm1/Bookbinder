import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { UnitConverter } from '@/types/units';
import { generateMarginTestSheetPdf } from './marginTestSheetPdf';

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

describe('marginTestSheetPdf (generateMarginTestSheetPdf)', () => {
  it('generates a valid 1-page US Letter calibration PDF with exact 1:1 mm dimensions and all guides', async () => {
    const bytes = await generateMarginTestSheetPdf({
      pageWidthMm: 215.9,
      pageHeightMm: 279.4,
      mediaLabel: 'US Letter (8.5 × 11")',
      unit: 'in',
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const sz = doc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(215.9, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(279.4, 2);

    const text = extractPageContentText(doc, 0);
    expect(text).toContain('PRINTER MARGIN CALIBRATION SHEET');
    expect(text).toContain('US Letter (8.5 x 11")');
    expect(text).toContain('TOP EDGE');
    expect(text).toContain('BOTTOM / TRAILING EDGE');
    expect(text).toContain('LEFT EDGE');
    expect(text).toContain('RIGHT EDGE');
    expect(text).toContain('50.0 x 50.0 mm');
    expect(text).toContain('Scale Check');
    expect(text).toContain('1.97 x 1.97 in');
    expect(text).toContain('Bookbinder -> Printer Margins');

    // Verify key labeled ticks and concentric guide box labels
    for (const tick of ['0', '2', '4', '6', '8', '10', '15', '20', '25', '30', '35', '40']) {
      expect(text).toContain(tick);
    }
    for (const inset of ['5 mm', '10 mm', '15 mm', '20 mm', '30 mm']) {
      expect(text).toContain(inset);
    }
  });

  it('generates exact A4 portrait dimensions in mm mode', async () => {
    const bytes = await generateMarginTestSheetPdf({
      pageWidthMm: 210,
      pageHeightMm: 297,
      mediaLabel: 'A4 (210 × 297 mm)',
      unit: 'mm',
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const sz = doc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(210, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(297, 2);

    const text = extractPageContentText(doc, 0);
    expect(text).toContain('210 x 297 mm');
    expect(text).not.toContain('1.97 x 1.97 in');
  });

  it('generates exact custom wide-format roll dimensions without crashing on special label chars', async () => {
    const bytes = await generateMarginTestSheetPdf({
      pageWidthMm: 914.4,
      pageHeightMm: 300,
      mediaLabel: '36" Custom Roll — Fine Art · Matte → Test',
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const sz = doc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(914.4, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(300, 2);

    const text = extractPageContentText(doc, 0);
    expect(text).toContain('36" Custom Roll - Fine Art | Matte -> Test');
  });
});
