import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import { generatePrintReadyRollPdf } from '@/studio/exporters/coverPdfExporter';
import { BookParametersModel } from '@/types/bookParams';
import type { MultiBookQueueEntry } from '@/types/multiBookExport';
import { BookbinderProjectModel } from '@/types/project';
import {
  ProjectLibraryModel,
  asProjectId,
  type SavedProjectRecord,
} from '@/types/projectLibrary';
import { UnitConverter } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import {
  resolveMultiBookQueueSources,
  type StyledCoverPdfRenderer,
} from './multiBookExport';
import { generateOuterWrapPdf } from './pdfExport';
import { FallbackProjectRepository } from './projectLibrary';

async function createSampleUploadedPdf(widthMm: number, heightMm: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([UnitConverter.mmToPoints(widthMm), UnitConverter.mmToPoints(heightMm)]);
  page.drawRectangle({
    x: UnitConverter.mmToPoints(3),
    y: UnitConverter.mmToPoints(3),
    width: UnitConverter.mmToPoints(Math.max(1, widthMm - 6)),
    height: UnitConverter.mmToPoints(Math.max(1, heightMm - 6)),
    borderColor: rgb(0.2, 0.35, 0.55),
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

function createSavedCompactBook(
  id: string,
  name: string,
  pbWidthMm: number,
  pbHeightMm: number,
  pbThicknessMm: number,
  withCustomFont = false,
): SavedProjectRecord {
  const baseProject = BookbinderProjectModel.create(
    BookParametersModel.clampAndNormalize({
      bindingStyle: 'paperback-wrap',
      pbWidthMm,
      pbHeightMm,
      pbThicknessMm,
      bleedMm: 3,
      includeBleed: true,
    }),
    undefined,
    name,
  );
  return {
    id: asProjectId(id),
    createdAt: baseProject.updatedAt,
    updatedAt: baseProject.updatedAt,
    project: baseProject,
    thumbnailDataUrl: null,
    customFont: withCustomFont
      ? {
          familyName: 'BookbinderCustom-Serif',
          fileName: 'serif.ttf',
          bytes: new Uint8Array([0, 1, 0, 0]),
          pdfEmbeddable: true,
        }
      : null,
  };
}

describe('multiBookExport', () => {
  it('resolves saved projects and uploaded PDFs, reports progress, and records missing projects in skippedIds', async () => {
    const repo = new FallbackProjectRepository();
    const bookA = createSavedCompactBook('book-a', 'A6 Poetry Chapbook', 105, 148, 12, true);
    const bookB = createSavedCompactBook('book-b', 'Pocket Field Notes', 100, 142, 10, false);
    await repo.saveProject(bookA);
    await repo.saveProject(bookB);

    const uploadedBytes = await createSampleUploadedPdf(210, 145);
    const entries: readonly MultiBookQueueEntry[] = [
      {
        kind: 'saved-project',
        id: 'q-a',
        projectId: bookA.id,
        label: bookA.project.name,
        widthMm: 228,
        heightMm: 154,
        copies: 2,
      },
      {
        kind: 'saved-project',
        id: 'q-missing',
        projectId: ProjectLibraryModel.createProjectId(),
        label: 'Deleted Book',
        widthMm: 220,
        heightMm: 150,
        copies: 1,
      },
      {
        kind: 'saved-project',
        id: 'q-b',
        projectId: bookB.id,
        label: bookB.project.name,
        widthMm: 216,
        heightMm: 148,
        copies: 1,
      },
      {
        kind: 'uploaded-pdf',
        id: 'q-upload',
        label: 'Custom Flyer.pdf',
        pdfBytes: uploadedBytes,
        widthMm: 210,
        heightMm: 145,
        copies: 1,
      },
    ];

    const progressEvents: Array<{ completed: number; total: number; label: string }> = [];
    const result = await resolveMultiBookQueueSources(entries, {
      repository: repo,
      target: 'outer-blueprint',
      onProgress: (completed, total, label) => {
        progressEvents.push({ completed, total, label });
      },
    });

    expect(result.skippedIds).toEqual(['q-missing']);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => ({ id: item.id, copies: item.copies }))).toEqual([
      { id: 'q-a', copies: 2 },
      { id: 'q-b', copies: 1 },
      { id: 'q-upload', copies: 1 },
    ]);

    expect(progressEvents).toEqual([
      { completed: 1, total: 4, label: 'A6 Poetry Chapbook' },
      { completed: 2, total: 4, label: 'Deleted Book' },
      { completed: 3, total: 4, label: 'Pocket Field Notes' },
      { completed: 4, total: 4, label: 'Custom Flyer.pdf' },
    ]);

    // Every resolved item must be a valid 1-page PDF at exact wrap dimensions
    const docA = await PDFDocument.load(result.items[0].pdfBytes);
    expect(docA.getPageCount()).toBe(1);
    const geomA = calculateCaseGeometry(bookA.project.parameters);
    const expectedAW = geomA.outerWrap.widthMm + geomA.outerWrap.bleedMm * 2;
    const expectedAH = geomA.outerWrap.heightMm + geomA.outerWrap.bleedMm * 2;
    expect(UnitConverter.pointsToMm(docA.getPage(0).getSize().width)).toBeCloseTo(expectedAW, 1);
    expect(UnitConverter.pointsToMm(docA.getPage(0).getSize().height)).toBeCloseTo(expectedAH, 1);

    // Also verify 'cover-styled' target forwards custom font, dpi, layer mode, and exact-auto options
    const stubPdf = await createSampleUploadedPdf(228, 154);
    const renderSpy = vi.fn<StyledCoverPdfRenderer>(async () => stubPdf);
    const styledResult = await resolveMultiBookQueueSources([entries[0]], {
      repository: repo,
      target: 'cover-styled',
      dpi: 600,
      includeGuides: false,
      exportLayerMode: 'base-only',
      renderStyledCoverPdf: renderSpy,
    });

    expect(styledResult.skippedIds).toEqual([]);
    expect(styledResult.items).toHaveLength(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    const [, , passedFont, passedOptions] = renderSpy.mock.calls[0];
    expect(passedFont?.familyName).toBe('BookbinderCustom-Serif');
    expect(passedOptions).toMatchObject({
      printMediaId: 'exact-auto',
      includeScaleBar: false,
      dpi: 600,
      includeGuides: false,
      exportLayerMode: 'base-only',
    });
  });

  it('composes 2 distinct saved book covers onto 1 Tabloid sheet end-to-end via generateOuterWrapPdf and generatePrintReadyRollPdf', async () => {
    const repo = new FallbackProjectRepository();
    const bookA = createSavedCompactBook('book-alpha', 'Alpha Chapbook', 105, 148, 12);
    const bookB = createSavedCompactBook('book-beta', 'Beta Notebook', 100, 144, 10);
    await repo.saveProject(bookA);
    await repo.saveProject(bookB);

    const geomA = calculateCaseGeometry(bookA.project.parameters);
    const geomB = calculateCaseGeometry(bookB.project.parameters);

    const resolved = await resolveMultiBookQueueSources(
      [
        {
          kind: 'saved-project',
          id: 'queued-beta',
          projectId: bookB.id,
          label: bookB.project.name,
          widthMm: geomB.outerWrap.widthMm + geomB.outerWrap.bleedMm * 2,
          heightMm: geomB.outerWrap.heightMm + geomB.outerWrap.bleedMm * 2,
          copies: 1,
        },
      ],
      {
        repository: repo,
        target: 'outer-blueprint',
      },
    );
    expect(resolved.items).toHaveLength(1);

    const tabloidSpec = getPrintMediaSpec('tabloid');
    expect(tabloidSpec.shortMm).not.toBeNull();
    expect(tabloidSpec.longMm).not.toBeNull();
    if (tabloidSpec.shortMm === null || tabloidSpec.longMm === null) {
      throw new Error('Expected sheet dimensions for tabloid');
    }

    // 1. Structural Outer Blueprint PDF with sheetNesting combining Book A + Book B on 1 Tabloid page
    const blueprintBytes = await generateOuterWrapPdf(geomA, 'single', {
      printMediaId: 'tabloid',
      includeScaleBar: true,
      sheetNesting: {
        enabled: true,
        copies: 1,
        gutterMm: 10,
        packInnerPockets: false,
        allowRotation: true,
        extraQueueItems: resolved.items,
      },
    });

    const blueprintDoc = await PDFDocument.load(blueprintBytes);
    expect(blueprintDoc.getPageCount()).toBe(1);
    const bpSize = blueprintDoc.getPage(0).getSize();
    const bpDims = [
      UnitConverter.pointsToMm(bpSize.width),
      UnitConverter.pointsToMm(bpSize.height),
    ].sort((a, b) => a - b);
    expect(bpDims[0]).toBeCloseTo(tabloidSpec.shortMm, 1);
    expect(bpDims[1]).toBeCloseTo(tabloidSpec.longMm, 1);

    const bpText = extractPageContentText(blueprintDoc, 0);
    expect(bpText).toContain('Sheet 1 of 1 | Tabloid');
    expect(bpText).toContain('2 pcs');
    expect(bpText).toContain('50 mm Scale Check');

    // 2. Styled Cover Studio PDF with sheetNesting combining Book A + Book B on 1 Tabloid page
    const styledBytes = await generatePrintReadyRollPdf(geomA, bookA.project.studio, null, {
      printMediaId: 'tabloid',
      includeScaleBar: true,
      skipCanvasRaster: true,
      sheetNesting: {
        enabled: true,
        copies: 1,
        gutterMm: 10,
        packInnerPockets: false,
        allowRotation: true,
        extraQueueItems: resolved.items,
      },
    });

    const styledDoc = await PDFDocument.load(styledBytes);
    expect(styledDoc.getPageCount()).toBe(1);
    const styledText = extractPageContentText(styledDoc, 0);
    expect(styledText).toContain('Sheet 1 of 1 | Tabloid');
    expect(styledText).toContain('2 pcs');
  });
});
