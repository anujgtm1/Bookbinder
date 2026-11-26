import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERIES_SHARED_DESIGN,
  SERIES_BOUNDS,
  SERIES_SCHEMA_VERSION,
  SeriesProjectModel,
  formatVolumeLabel,
  toRomanNumeral,
} from './seriesSpines';

describe('SeriesProjectModel & seriesSpines domain types', () => {
  it('converts positive integers to canonical Roman numerals', () => {
    expect(toRomanNumeral(1)).toBe('I');
    expect(toRomanNumeral(4)).toBe('IV');
    expect(toRomanNumeral(9)).toBe('IX');
    expect(toRomanNumeral(14)).toBe('XIV');
    expect(toRomanNumeral(42)).toBe('XLII');
    expect(toRomanNumeral(0)).toBe('');
    expect(toRomanNumeral(-3)).toBe('');
  });

  it('formats volume labels across all supported styles and custom overrides', () => {
    expect(formatVolumeLabel(0, 'roman')).toBe('I');
    expect(formatVolumeLabel(2, 'roman')).toBe('III');
    expect(formatVolumeLabel(1, 'arabic')).toBe('2');
    expect(formatVolumeLabel(0, 'vol-arabic')).toBe('Vol. 1');
    expect(formatVolumeLabel(3, 'book-arabic')).toBe('Book 4');
    expect(formatVolumeLabel(0, 'none', 'Prologue')).toBe('');
    expect(formatVolumeLabel(0, 'custom', 'Act I')).toBe('Act I');
    expect(formatVolumeLabel(0, 'custom', '')).toBe('');
    expect(formatVolumeLabel(1, 'roman', 'Special')).toBe('Special');
  });

  it('creates a valid default 3-volume series with distinct thicknesses', () => {
    const series = SeriesProjectModel.createDefault();
    expect(series.schemaVersion).toBe(SERIES_SCHEMA_VERSION);
    expect(series.mode).toBe('series');
    expect(series.books).toHaveLength(3);
    expect(series.books.map((b) => b.parameters.pbThicknessMm)).toEqual([24, 34, 44]);

    const validation = SeriesProjectModel.validate(series);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('reports validation errors for empty name, empty books, duplicate IDs, and thin-spine warnings', () => {
    const base = SeriesProjectModel.createDefault();

    const emptyRes = SeriesProjectModel.validate({
      ...base,
      name: '   ',
      books: [],
    });
    expect(emptyRes.isValid).toBe(false);
    expect(emptyRes.errors.length).toBeGreaterThanOrEqual(2);

    const dupId = base.books[0].id;
    const dupRes = SeriesProjectModel.validate({
      ...base,
      books: [
        base.books[0],
        {
          ...base.books[1],
          id: dupId,
          parameters: { ...base.books[1].parameters, pbThicknessMm: 7 },
        },
      ],
    });
    expect(dupRes.isValid).toBe(false);
    expect(dupRes.errors.some((e) => e.includes('Duplicate'))).toBe(true);
    expect(dupRes.warnings.some((w) => w.includes('narrow'))).toBe(true);
  });

  it('round-trips through JSON and supports stripping panorama image data', () => {
    const base = SeriesProjectModel.createDefault();
    const withPano = {
      ...base,
      shared: {
        ...base.shared,
        panorama: {
          ...base.shared.panorama,
          enabled: true,
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          fileName: 'horizon.png',
          naturalWidth: 1800,
          naturalHeight: 600,
        },
      },
    };

    const json = SeriesProjectModel.toJson(withPano);
    const parsed = SeriesProjectModel.fromJson(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.series.id).toBe(withPano.id);
      expect(parsed.series.name).toBe(withPano.name);
      expect(parsed.series.books).toHaveLength(3);
      expect(parsed.series.shared.panorama.enabled).toBe(true);
      expect(parsed.series.shared.panorama.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    }

    const strippedJson = SeriesProjectModel.toJson(withPano, { includePanoramaData: false });
    const parsedStripped = SeriesProjectModel.fromJson(strippedJson);
    expect(parsedStripped.ok).toBe(true);
    if (parsedStripped.ok) {
      expect(parsedStripped.series.shared.panorama.enabled).toBe(false);
      expect(parsedStripped.series.shared.panorama.dataUrl).toBeNull();
    }
  });

  it('rejects malformed payloads and unknown schema versions while sanitizing out-of-range fields', () => {
    expect(SeriesProjectModel.fromUnknown(null).ok).toBe(false);
    expect(SeriesProjectModel.fromUnknown([]).ok).toBe(false);
    expect(SeriesProjectModel.fromUnknown({ schemaVersion: 99, books: [{}] }).ok).toBe(false);
    expect(SeriesProjectModel.fromUnknown({ schemaVersion: 1, books: [] }).ok).toBe(false);
    expect(SeriesProjectModel.fromJson('{invalid-json').ok).toBe(false);

    const messy = {
      schemaVersion: 1,
      id: 'series-sanitized',
      name: '  Clamped Set  ',
      mode: 'unknown-mode',
      books: [
        {
          id: 'book-a',
          title: 'First Book',
          author: 'Author A',
          opticalNudgeMm: 99,
          fontSizeOverridePt: 200,
          spineBgColorOverride: 'not-a-color',
          parameters: { bindingStyle: 'rigid-case', pbThicknessMm: 22 },
        },
      ],
      shared: {
        ...DEFAULT_SERIES_SHARED_DESIGN,
        titleSizePt: 999,
        bandStyle: 'invalid-band',
        alignmentAnchor: 'invalid-anchor',
        panorama: {
          enabled: true,
          dataUrl: 'javascript:alert(1)',
          scale: 50,
          dimOpacity: 2.5,
          shelfGapMm: -5,
        },
      },
    };

    const res = SeriesProjectModel.fromUnknown(messy);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.series.name).toBe('Clamped Set');
      expect(res.series.mode).toBe('series');
      expect(res.series.shared.titleSizePt).toBe(SERIES_BOUNDS.titleSizePt.max);
      expect(res.series.shared.bandStyle).toBe(DEFAULT_SERIES_SHARED_DESIGN.bandStyle);
      expect(res.series.shared.alignmentAnchor).toBe(DEFAULT_SERIES_SHARED_DESIGN.alignmentAnchor);
      expect(res.series.shared.panorama.dataUrl).toBeNull();
      expect(res.series.shared.panorama.enabled).toBe(false);
      expect(res.series.shared.panorama.scale).toBe(SERIES_BOUNDS.panoramaScale.max);
      expect(res.series.shared.panorama.dimOpacity).toBe(SERIES_BOUNDS.dimOpacity.max);
      expect(res.series.shared.panorama.shelfGapMm).toBe(0);
      expect(res.series.books[0].opticalNudgeMm).toBe(SERIES_BOUNDS.opticalNudgeMm.max);
      expect(res.series.books[0].spineBgColorOverride).toBeNull();
    }
  });
});
