import { describe, expect, it, vi } from 'vitest';
import { BookParametersModel } from './bookParams';
import { BookbinderProjectModel } from './project';
import {
  PROJECT_LIBRARY_BUNDLE_VERSION,
  ProjectLibraryModel,
  asProjectId,
  createProjectId,
  deserializeSavedCustomFont,
  deserializeSavedProjectSummary,
  isProjectId,
  type SavedCustomFontRecord,
  type SavedProjectRecord,
} from './projectLibrary';
import { CoverStudioModel } from './studio';

describe('projectLibrary types & model', () => {
  describe('ProjectId helpers', () => {
    it('creates unique non-empty branded project IDs', () => {
      const a = createProjectId();
      const b = createProjectId();
      expect(isProjectId(a)).toBe(true);
      expect(isProjectId(b)).toBe(true);
      expect(a).not.toBe(b);
    });

    it('falls back safely when crypto.randomUUID is unavailable', () => {
      const originalCrypto = globalThis.crypto;
      vi.stubGlobal('crypto', undefined);
      try {
        const id = createProjectId();
        expect(isProjectId(id)).toBe(true);
        expect(id.startsWith('book-')).toBe(true);
      } finally {
        vi.stubGlobal('crypto', originalCrypto);
      }
    });

    it('validates and brands strings with isProjectId and asProjectId', () => {
      expect(isProjectId('book-1')).toBe(true);
      expect(isProjectId('   ')).toBe(false);
      expect(isProjectId('')).toBe(false);
      expect(isProjectId(42)).toBe(false);
      expect(isProjectId(null)).toBe(false);

      expect(asProjectId('  my-book-1  ')).toBe('my-book-1');
      expect(() => asProjectId('   ')).toThrow('ProjectId must be a non-empty string.');
    });
  });

  describe('deserializeSavedCustomFont & deserializeSavedProjectSummary', () => {
    it('deserializes valid custom fonts from Uint8Array and ArrayBuffer', () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const parsed = deserializeSavedCustomFont({
        familyName: '  BookbinderCustom-MyFont  ',
        fileName: 'MyFont.ttf',
        bytes,
        pdfEmbeddable: true,
      });
      expect(parsed).not.toBeNull();
      expect(parsed?.familyName).toBe('BookbinderCustom-MyFont');
      expect(parsed?.fileName).toBe('MyFont.ttf');
      expect(parsed?.pdfEmbeddable).toBe(true);
      expect(Array.from(parsed?.bytes ?? [])).toEqual([1, 2, 3, 4]);

      const fromBuffer = deserializeSavedCustomFont({
        familyName: 'BufferFont',
        fileName: 'BufferFont.woff',
        bytes: bytes.buffer,
        pdfEmbeddable: false,
      });
      expect(fromBuffer).not.toBeNull();
      expect(Array.from(fromBuffer?.bytes ?? [])).toEqual([1, 2, 3, 4]);
    });

    it('rejects malformed or empty custom font records', () => {
      expect(deserializeSavedCustomFont(null)).toBeNull();
      expect(
        deserializeSavedCustomFont({
          familyName: '',
          fileName: 'a.ttf',
          bytes: new Uint8Array([1]),
          pdfEmbeddable: true,
        }),
      ).toBeNull();
      expect(
        deserializeSavedCustomFont({
          familyName: 'EmptyBytes',
          fileName: 'a.ttf',
          bytes: new Uint8Array([]),
          pdfEmbeddable: true,
        }),
      ).toBeNull();
    });

    it('rejects malformed summary entries and parses valid ones', () => {
      expect(deserializeSavedProjectSummary(null)).toBeNull();
      expect(deserializeSavedProjectSummary({ id: 'ok', bindingStyle: 'unknown-style' })).toBeNull();

      const valid = deserializeSavedProjectSummary({
        id: 'book-1',
        name: '  Dune Special Edition  ',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        bindingStyle: 'dust-jacket',
        pbWidthMm: 140,
        pbHeightMm: 216,
        pbThicknessMm: 24,
        wrapPdfWidthMm: 450.5,
        wrapPdfHeightMm: 222.0,
        thumbnailDataUrl: 'data:image/jpeg;base64,AAA',
        hasCustomFont: true,
      });
      expect(valid).toEqual({
        id: asProjectId('book-1'),
        name: 'Dune Special Edition',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        bindingStyle: 'dust-jacket',
        pbWidthMm: 140,
        pbHeightMm: 216,
        pbThicknessMm: 24,
        wrapPdfWidthMm: 450.5,
        wrapPdfHeightMm: 222.0,
        thumbnailDataUrl: 'data:image/jpeg;base64,AAA',
        hasCustomFont: true,
      });
    });
  });

  describe('deriveSummary', () => {
    it('derives summary fields including rounded wrap PDF dimensions and custom font flag', () => {
      const params = BookParametersModel.clampAndNormalize({
        bindingStyle: 'softcover-jacket',
        pbWidthMm: 127,
        pbHeightMm: 203,
        pbThicknessMm: 18,
      });
      const project = BookbinderProjectModel.create(
        params,
        CoverStudioModel.createDefault(),
        'Traveler Pocket Guide',
      );
      const customFont: SavedCustomFontRecord = {
        familyName: 'BookbinderCustom-Serif',
        fileName: 'Serif.ttf',
        bytes: new Uint8Array([10, 20, 30]),
        pdfEmbeddable: true,
      };
      const record: SavedProjectRecord = {
        id: asProjectId('proj-summary-1'),
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-02T12:00:00.000Z',
        project,
        thumbnailDataUrl: 'data:image/jpeg;base64,THUMB',
        customFont,
      };

      const summary = ProjectLibraryModel.deriveSummary(record, {
        wrapPdfWidthMm: 401.236,
        wrapPdfHeightMm: 225.004,
      });

      expect(summary).toEqual({
        id: asProjectId('proj-summary-1'),
        name: 'Traveler Pocket Guide',
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-02T12:00:00.000Z',
        bindingStyle: 'softcover-jacket',
        pbWidthMm: 127,
        pbHeightMm: 203,
        pbThicknessMm: 18,
        wrapPdfWidthMm: 401.24,
        wrapPdfHeightMm: 225,
        thumbnailDataUrl: 'data:image/jpeg;base64,THUMB',
        hasCustomFont: true,
      });
    });

    it('sets hasCustomFont false when customFont is null or omitted', () => {
      const project = BookbinderProjectModel.create(
        BookParametersModel.createDefault(),
        CoverStudioModel.createDefault(),
        'Plain Book',
      );
      const summary = ProjectLibraryModel.deriveSummary(
        {
          id: asProjectId('proj-plain'),
          createdAt: project.updatedAt,
          updatedAt: project.updatedAt,
          project,
          thumbnailDataUrl: null,
        },
        { wrapPdfWidthMm: 350, wrapPdfHeightMm: 260 },
      );

      expect(summary.hasCustomFont).toBe(false);
      expect(summary.thumbnailDataUrl).toBeNull();
    });
  });

  describe('backup bundle serialization & parsing', () => {
    it('round-trips valid projects via toBundleJson and fromBundleJson', () => {
      const p1 = BookbinderProjectModel.create(
        BookParametersModel.applyPreset(BookParametersModel.createDefault(), 'mass-market'),
        CoverStudioModel.createDefault(),
        'Mass Market Novel',
      );
      const p2 = BookbinderProjectModel.create(
        BookParametersModel.clampAndNormalize({ bindingStyle: 'paperback-wrap' }),
        CoverStudioModel.createDefault(),
        'Paperback Anthology',
      );

      const json = ProjectLibraryModel.toBundleJson([p1, p2], '2026-06-01T08:00:00.000Z');
      const parsed = ProjectLibraryModel.fromBundleJson(json);

      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.skippedCount).toBe(0);
        expect(parsed.bundle.schemaVersion).toBe(PROJECT_LIBRARY_BUNDLE_VERSION);
        expect(parsed.bundle.exportedAt).toBe('2026-06-01T08:00:00.000Z');
        expect(parsed.bundle.projects).toHaveLength(2);
        expect(parsed.bundle.projects[0]?.name).toBe('Mass Market Novel');
        expect(parsed.bundle.projects[1]?.parameters.bindingStyle).toBe('paperback-wrap');
      }
    });

    it('distinguishes single projects from library bundles via isLibraryBundleCandidate', () => {
      const single = BookbinderProjectModel.create();
      const bundle = ProjectLibraryModel.serializeBundle([single]);

      expect(ProjectLibraryModel.isLibraryBundleCandidate(bundle)).toBe(true);
      expect(ProjectLibraryModel.isLibraryBundleCandidate(single)).toBe(false);
      expect(ProjectLibraryModel.isLibraryBundleCandidate([])).toBe(false);
      expect(ProjectLibraryModel.isLibraryBundleCandidate(null)).toBe(false);
      expect(ProjectLibraryModel.isLibraryBundleCandidate({ projects: 'not-array' })).toBe(false);
    });

    it('skips malformed project items and reports skippedCount', () => {
      const validProject = BookbinderProjectModel.create(
        BookParametersModel.createDefault(),
        CoverStudioModel.createDefault(),
        'Valid Entry',
      );
      const json = JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-06-01T09:00:00.000Z',
        projects: [validProject, { bad: true }, null, 'corrupt'],
      });

      const result = ProjectLibraryModel.fromBundleJson(json);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.projects).toHaveLength(1);
        expect(result.bundle.projects[0]?.name).toBe('Valid Entry');
        expect(result.skippedCount).toBe(3);
      }
    });

    it('fails cleanly on invalid JSON, unsupported schemaVersion, missing projects, or zero valid items', () => {
      expect(ProjectLibraryModel.fromBundleJson('{bad-json').ok).toBe(false);
      expect(ProjectLibraryModel.fromBundleJson('[]').ok).toBe(false);
      expect(ProjectLibraryModel.fromBundleJson(JSON.stringify({ schemaVersion: 99, projects: [] })).ok).toBe(
        false,
      );
      expect(ProjectLibraryModel.fromBundleJson(JSON.stringify({ schemaVersion: 1 })).ok).toBe(false);
      expect(
        ProjectLibraryModel.fromBundleJson(
          JSON.stringify({ schemaVersion: 1, projects: [{ invalid: true }, null] }),
        ).ok,
      ).toBe(false);
    });
  });
});
