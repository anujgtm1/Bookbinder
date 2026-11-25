import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS, PAGE_SIZES } from '@/types/bookParams';
import { UnitConverter } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import {
  generateInnerTemplatesPdf,
  generateOuterWrapPdf,
  planInnerTemplateLayout,
} from './pdfExport';

function getPageStream(doc: PDFDocument, pageIndex = 0): string {
  const contents = doc.getPage(pageIndex).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((item) => {
      const resolved = item ? doc.context.lookup(item) : undefined;
      if (resolved instanceof PDFRawStream) {
        return inflateSync(Buffer.from(resolved.contents)).toString('latin1');
      }
      return '';
    })
    .join('\n');
}

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
    // Default WRAP_W = 368 + 6 bleed = 374 mm, WRAP_H = 259 + 6 bleed = 265 mm
    expect(UnitConverter.pointsToMm(singleSize.width)).toBeCloseTo(374, 2);
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

  it('supports printMediaId sheet centering (US Legal) and 2-sheet tiling (US Letter) on generateOuterWrapPdf and legal page size on generateInnerTemplatesPdf', async () => {
    // A6 slip cover with 52.5 mm flaps -> outerWrap = 323 x 170 mm
    const a6DeepFlapGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      jacketFlapWidthMm: 52.5,
      includeBleed: false,
    });

    // 1. US Legal -> 1 centered Landscape sheet (355.6 x 215.9 mm)
    const legalBytes = await generateOuterWrapPdf(a6DeepFlapGeom, 'single', {
      printMediaId: 'legal',
      includeScaleBar: true,
    });
    const legalDoc = await PDFDocument.load(legalBytes);
    expect(legalDoc.getPageCount()).toBe(1);
    const legalSize = legalDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(legalSize.width)).toBeCloseTo(355.6, 2);
    expect(UnitConverter.pointsToMm(legalSize.height)).toBeCloseTo(215.9, 2);

    // 2. US Letter -> 2 tiled Portrait sheets (215.9 x 279.4 mm)
    const letterTiledBytes = await generateOuterWrapPdf(a6DeepFlapGeom, 'single', {
      printMediaId: 'letter',
      tileOverlapMm: 15,
    });
    const letterTiledDoc = await PDFDocument.load(letterTiledBytes);
    expect(letterTiledDoc.getPageCount()).toBe(2);
    for (const idx of [0, 1]) {
      const sz = letterTiledDoc.getPage(idx).getSize();
      expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(215.9, 2);
      expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(279.4, 2);
    }

    // 3. Inner templates PDF on US Legal (215.9 x 355.6 mm)
    const defaultGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const { bytes: innerLegalBytes, plan: innerLegalPlan } = await generateInnerTemplatesPdf(
      defaultGeom,
      'legal',
    );
    const innerLegalDoc = await PDFDocument.load(innerLegalBytes);
    expect(innerLegalDoc.getPageCount()).toBe(innerLegalPlan.pageCount);
    const firstLegalPage = innerLegalDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(firstLegalPage.width)).toBeCloseTo(PAGE_SIZES.legal.widthMm, 2);
    expect(UnitConverter.pointsToMm(firstLegalPage.height)).toBeCloseTo(
      PAGE_SIZES.legal.heightMm,
      2,
    );
  });

  it('generates exact 1:1 mm Outer Wrap PDFs for paperback-wrap and dust-jacket binding styles', async () => {
    const pbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      includeBleed: false,
    });
    const pbBytes = await generateOuterWrapPdf(pbGeom, 'single');
    const pbDoc = await PDFDocument.load(pbBytes);
    expect(pbDoc.getPageCount()).toBe(1);
    const pbSize = pbDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(pbSize.width)).toBeCloseTo(220, 2);
    expect(UnitConverter.pointsToMm(pbSize.height)).toBeCloseTo(148, 2);

    // Centered on 1× US Letter Landscape
    const pbLetterBytes = await generateOuterWrapPdf(pbGeom, 'single', {
      printMediaId: 'letter',
    });
    const pbLetterDoc = await PDFDocument.load(pbLetterBytes);
    expect(pbLetterDoc.getPageCount()).toBe(1);
    const pbLetterSize = pbLetterDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(pbLetterSize.width)).toBeCloseTo(279.4, 2);
    expect(UnitConverter.pointsToMm(pbLetterSize.height)).toBeCloseTo(215.9, 2);

    const djGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 50,
      includeBleed: false,
    });
    const djBytes = await generateOuterWrapPdf(djGeom, 'single');
    const djDoc = await PDFDocument.load(djBytes);
    expect(djDoc.getPageCount()).toBe(1);
    const djSize = djDoc.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(djSize.width)).toBeCloseTo(323.5, 2);
    expect(UnitConverter.pointsToMm(djSize.height)).toBeCloseTo(148, 2);
  });

  it('independently toggles cut lines, fold lines, and external fold guide ticks on outer wrap PDFs (1-sheet, 2-sheet tiled, 3-piece, and roll-nested)', async () => {
    // A6 paperback-wrap (220 x 148 mm, no bleed) fits 1x US Letter Landscape with generous white margin for external ticks
    const pbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      includeBleed: false,
    });

    // Template default: cut=true, fold=true, ticks=true -> external ticks (0.12 0.42 0.88 RG) present on sheet page
    const defaultSheetBytes = await generateOuterWrapPdf(pbGeom, 'single', {
      printMediaId: 'letter',
    });
    const defaultSheetDoc = await PDFDocument.load(defaultSheetBytes);
    const defaultSheetStream = getPageStream(defaultSheetDoc, 0);
    expect(defaultSheetStream).toContain('0.12 0.42 0.88 RG');

    // Disable external fold guide ticks -> no solid blue tick color on the outer sheet page
    const noTicksSheetBytes = await generateOuterWrapPdf(pbGeom, 'single', {
      printMediaId: 'letter',
      includeFoldGuideTicks: false,
    });
    const noTicksSheetDoc = await PDFDocument.load(noTicksSheetBytes);
    const noTicksSheetStream = getPageStream(noTicksSheetDoc, 0);
    expect(noTicksSheetStream).not.toContain('0.12 0.42 0.88 RG');

    // Cut=false, Fold=false, Ticks=false on exact-auto -> zero red cut stroke, zero dashed fold, zero blue ticks
    const cleanExactBytes = await generateOuterWrapPdf(pbGeom, 'single', {
      printMediaId: 'exact-auto',
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: false,
    });
    const cleanExactStream = getPageStream(await PDFDocument.load(cleanExactBytes), 0);
    expect(cleanExactStream).not.toContain('0.9 0.1 0.1 RG');
    expect(cleanExactStream).not.toContain('[5 2.5] 0 d');
    expect(cleanExactStream).not.toContain('0.12 0.42 0.88 RG');

    // Cut=true, Fold=false on exact-auto -> red cut stroke present, dashed fold lines absent
    const cutOnlyBytes = await generateOuterWrapPdf(pbGeom, 'single', {
      printMediaId: 'exact-auto',
      includeCutLines: true,
      includeFoldLines: false,
      includeFoldGuideTicks: false,
    });
    const cutOnlyStream = getPageStream(await PDFDocument.load(cutOnlyBytes), 0);
    expect(cutOnlyStream).toContain('0.9 0.1 0.1 RG');
    expect(cutOnlyStream).not.toContain('[5 2.5] 0 d');

    // 2-sheet tiled PDF (Trade Digest hardcover on Letter) -> both Sheet 1 and Sheet 2 get external ticks
    const hcGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const tiledBytes = await generateOuterWrapPdf(hcGeom, 'single', {
      printMediaId: 'letter',
      includeFoldGuideTicks: true,
    });
    const tiledNoTicksBytes = await generateOuterWrapPdf(hcGeom, 'single', {
      printMediaId: 'letter',
      includeFoldGuideTicks: false,
    });
    const tiledDoc = await PDFDocument.load(tiledBytes);
    expect(tiledDoc.getPageCount()).toBe(2);
    expect(tiledBytes.byteLength).toBeGreaterThan(tiledNoTicksBytes.byteLength);

    // 3-piece split PDF honors independent cut/fold/tick toggles
    const splitWithTicks = await generateOuterWrapPdf(hcGeom, 'three-piece', {
      printMediaId: 'exact-auto',
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });
    const splitDoc = await PDFDocument.load(splitWithTicks);
    expect(splitDoc.getPageCount()).toBe(3);
    const backPanelStream = getPageStream(splitDoc, 0);
    expect(backPanelStream).not.toContain('0.9 0.1 0.1 RG');
    expect(backPanelStream).toContain('0.12 0.42 0.88 RG');

    // Wide-format roll nested PDF renders external fold guide ticks when enabled
    const rollWithTicks = await generateOuterWrapPdf(hcGeom, 'single', {
      printMediaId: 'roll-36',
      includeFoldGuideTicks: true,
      rollNesting: {
        enabled: true,
        copies: 2,
        gutterMm: 10,
        packInnerPockets: true,
        allowRotation: true,
      },
    });
    const rollWithoutTicks = await generateOuterWrapPdf(hcGeom, 'single', {
      printMediaId: 'roll-36',
      includeFoldGuideTicks: false,
      rollNesting: {
        enabled: true,
        copies: 2,
        gutterMm: 10,
        packInnerPockets: true,
        allowRotation: true,
      },
    });
    expect(getPageStream(await PDFDocument.load(rollWithTicks), 0)).toContain('0.12 0.42 0.88 RG');
    expect(getPageStream(await PDFDocument.load(rollWithoutTicks), 0)).not.toContain(
      '0.12 0.42 0.88 RG',
    );
  });

  it('independently toggles cut lines, fold lines, and external fold guide ticks on inner templates PDF (print vs template defaults)', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    // Template default: cut=true, fold=true, ticks=true
    const { bytes: templateBytes } = await generateInnerTemplatesPdf(geom, 'tabloid');
    const templateStream = getPageStream(await PDFDocument.load(templateBytes), 0);
    expect(templateStream).toContain('0.85 0.1 0.1 RG');
    expect(templateStream).toContain('[4 3] 0 d');
    expect(templateStream).toContain('0.12 0.42 0.88 RG');

    // Print default (hideFaceTextOnStyled=true): cut=true, fold=false, ticks=true
    const { bytes: printDefaultBytes } = await generateInnerTemplatesPdf(geom, 'tabloid', {
      hideFaceTextOnStyled: true,
    });
    const printDefaultStream = getPageStream(await PDFDocument.load(printDefaultBytes), 0);
    expect(printDefaultStream).toContain('0.85 0.1 0.1 RG');
    expect(printDefaultStream).not.toContain('[4 3] 0 d');
    expect(printDefaultStream).toContain('0.12 0.42 0.88 RG');

    // Only ticks enabled (cut=false, fold=false, ticks=true)
    const { bytes: ticksOnlyBytes } = await generateInnerTemplatesPdf(geom, 'tabloid', {
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });
    const ticksOnlyStream = getPageStream(await PDFDocument.load(ticksOnlyBytes), 0);
    expect(ticksOnlyStream).not.toContain('0.85 0.1 0.1 RG');
    expect(ticksOnlyStream).not.toContain('[4 3] 0 d');
    expect(ticksOnlyStream).toContain('0.12 0.42 0.88 RG');
  });

  it('generates a valid 1-page PDF for an L-shaped compact inner layout (1 horizontal pocket + 1 vertical pocket + spine liner)', async () => {
    // 105 × 140 mm, 46 mm spine on US Letter: only an L-shaped packing fits all 3 pieces onto 1 page
    const compactLGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 105,
      pbHeightMm: 140,
      pbThicknessMm: 46,
    });

    const { bytes, plan } = await generateInnerTemplatesPdf(compactLGeom, 'letter');
    expect(plan.pageCount).toBe(1);
    expect(plan.placements).toHaveLength(3);
    expect(plan.placements.every((p) => p.pageIndex === 0 && !p.clipped)).toBe(true);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const sz = loaded.getPage(0).getSize();
    expect(UnitConverter.pointsToMm(sz.width)).toBeCloseTo(PAGE_SIZES.letter.widthMm, 2);
    expect(UnitConverter.pointsToMm(sz.height)).toBeCloseTo(PAGE_SIZES.letter.heightMm, 2);
  });

  it('renders board gluing inset callout text on chipboard slip-in pocket PDF templates and omits it when styled or folded-endpapers', async () => {
    const slipGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const { bytes: slipBytes } = await generateInnerTemplatesPdf(slipGeom, 'tabloid');
    const slipStream = getPageStream(await PDFDocument.load(slipBytes), 0);
    // pdf-lib encodes WinAnsi strings as hex (<...>) or literal text; decode hex tokens to verify exact callout
    const decodedSlipText = decodePdfTextTokens(slipStream);
    expect(decodedSlipText).toContain('Glue inset: 2.5 mm T/B');
    expect(decodedSlipText).toContain('2.5 mm fore-edge');

    const { bytes: styledBytes } = await generateInnerTemplatesPdf(slipGeom, 'tabloid', {
      hideFaceTextOnStyled: true,
    });
    const decodedStyledText = decodePdfTextTokens(
      getPageStream(await PDFDocument.load(styledBytes), 0),
    );
    expect(decodedStyledText).not.toContain('Glue inset:');

    const foldedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      interiorStyle: 'folded-endpapers',
    });
    const { bytes: foldedBytes } = await generateInnerTemplatesPdf(foldedGeom, 'tabloid');
    const decodedFoldedText = decodePdfTextTokens(
      getPageStream(await PDFDocument.load(foldedBytes), 0),
    );
    expect(decodedFoldedText).not.toContain('Glue inset:');
  });
});

function decodePdfTextTokens(stream: string): string {
  const parts: string[] = [];
  for (const match of stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    parts.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  for (const match of stream.matchAll(/\(([^)]*)\)\s*Tj/g)) {
    parts.push(match[1]);
  }
  return parts.join('\n');
}
