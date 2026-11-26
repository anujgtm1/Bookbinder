import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERIES_SHARED_DESIGN,
  SERIES_BOUNDS,
  SERIES_SCHEMA_VERSION,
  SeriesProjectModel,
  asSeriesSequenceId,
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
      expect(res.series.sequences).toEqual([]);
      expect(res.series.books[0].sequenceId).toBeNull();
    }
  });

  it('serializes and deserializes SeriesSequenceGroup records and clears dangling sequenceId references', () => {
    const seq1 = SeriesProjectModel.createSequenceGroup({
      name: '  The Obsidian Trilogy  ',
      volumeNumberStyle: 'roman',
      startNumber: 1,
      sharedAuthor: '  E. V. Hawthorne  ',
    });
    const seq2 = SeriesProjectModel.createSequenceGroup({
      name: 'Short Stories',
      volumeNumberStyle: 'vol-arabic',
      startNumber: 4,
      sharedAuthor: '   ',
    });

    const base = SeriesProjectModel.createDefault();
    const withSequences = {
      ...base,
      sequences: [seq1, seq2],
      books: [
        { ...base.books[0], sequenceId: seq1.id },
        { ...base.books[1], sequenceId: asSeriesSequenceId('sseq-dangling-missing') },
        { ...base.books[2], sequenceId: seq2.id },
      ],
    };

    // Validation warns on dangling sequence reference
    const validation = SeriesProjectModel.validate(withSequences);
    expect(validation.isValid).toBe(true);
    expect(validation.warnings.some((w) => w.includes('unknown sequence ID'))).toBe(true);

    // serialize() trims fields, converts blank sharedAuthor -> null, and clears dangling sequenceId
    const serialized = SeriesProjectModel.serialize(withSequences);
    expect(serialized.sequences).toHaveLength(2);
    expect(serialized.sequences[0].name).toBe('The Obsidian Trilogy');
    expect(serialized.sequences[0].sharedAuthor).toBe('E. V. Hawthorne');
    expect(serialized.sequences[1].sharedAuthor).toBeNull();
    expect(serialized.books[0].sequenceId).toBe(seq1.id);
    expect(serialized.books[1].sequenceId).toBeNull();
    expect(serialized.books[2].sequenceId).toBe(seq2.id);

    // JSON round-trip preserves valid sequences and drops dangling sequenceId on fromUnknown()
    const rawWithDangling = {
      ...serialized,
      sequences: [
        {
          id: seq1.id,
          name: 'The Obsidian Trilogy',
          volumeNumberStyle: 'roman',
          startNumber: 150, // out of range -> clamps to 99
          sharedAuthor: 'E. V. Hawthorne',
        },
        {
          id: seq2.id,
          name: 'Short Stories',
          volumeNumberStyle: 'invalid-style',
          startNumber: -5, // out of range -> clamps to 1
          sharedAuthor: '',
        },
      ],
      books: [
        { ...serialized.books[0], sequenceId: seq1.id },
        { ...serialized.books[1], sequenceId: 'sseq-deleted-id' },
        { ...serialized.books[2], sequenceId: seq2.id },
      ],
    };

    const parsed = SeriesProjectModel.fromUnknown(rawWithDangling);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.series.sequences).toHaveLength(2);
      expect(parsed.series.sequences[0].startNumber).toBe(SERIES_BOUNDS.sequenceStartNumber.max);
      expect(parsed.series.sequences[1].startNumber).toBe(SERIES_BOUNDS.sequenceStartNumber.min);
      expect(parsed.series.sequences[1].volumeNumberStyle).toBe(
        DEFAULT_SERIES_SHARED_DESIGN.volumeNumberStyle,
      );
      expect(parsed.series.sequences[1].sharedAuthor).toBeNull();
      expect(parsed.series.books[0].sequenceId).toBe(seq1.id);
      expect(parsed.series.books[1].sequenceId).toBeNull();
      expect(parsed.series.books[2].sequenceId).toBe(seq2.id);
    }
  });
});
