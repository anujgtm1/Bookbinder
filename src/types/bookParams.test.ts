import { describe, expect, it } from 'vitest';
import {
  BookParametersModel,
  DEFAULT_BOOK_PARAMETERS,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
} from './bookParams';

describe('BookParametersModel', () => {
  it('creates spec-accurate defaults', () => {
    const defaults = BookParametersModel.createDefault();
    expect(defaults.pbHeightMm).toBe(216.0);
    expect(defaults.pbWidthMm).toBe(140.0);
    expect(defaults.pbThicknessMm).toBe(24.0);
    expect(defaults.boardThicknessMm).toBe(2.0);
    expect(defaults.hingeWidthMm).toBe(9.0);
    expect(defaults.overhangTopBottomMm).toBe(7.0);
    expect(defaults.overhangForeEdgeMm).toBe(3.0);
    expect(defaults.spineAllowanceMm).toBe(2.0);
    expect(defaults.turnInMm).toBe(18.0);
    expect(defaults.miterFactor).toBe(1.5);
    expect(defaults.bleedMm).toBe(3.0);
    expect(defaults.pocketDepthPct).toBe(72);
    expect(defaults.pocketFlapMm).toBe(12.0);
    expect(defaults.splitMode).toBe('single');
    expect(defaults.unit).toBe('mm');
  });

  it('applies and detects paperback presets', () => {
    const base = BookParametersModel.createDefault();
    for (const preset of PAPERBACK_PRESETS) {
      const applied = BookParametersModel.applyPreset(base, preset.id);
      expect(applied.pbWidthMm).toBe(preset.pbWidthMm);
      expect(applied.pbHeightMm).toBe(preset.pbHeightMm);
      expect(BookParametersModel.detectPreset(applied)).toBe(preset.id);
    }

    const custom = { ...base, pbWidthMm: 165, pbHeightMm: 240 };
    expect(BookParametersModel.detectPreset(custom)).toBe('custom');
  });

  it('links spine allowance to board thickness when linked is true', () => {
    const linked = BookParametersModel.withBoardThickness(DEFAULT_BOOK_PARAMETERS, 3.0);
    expect(linked.boardThicknessMm).toBe(3.0);
    expect(linked.spineAllowanceMm).toBe(3.0);

    const unlinked = BookParametersModel.withBoardThickness(
      { ...DEFAULT_BOOK_PARAMETERS, spineAllowanceLinked: false, spineAllowanceMm: 4.5 },
      3.0,
    );
    expect(unlinked.boardThicknessMm).toBe(3.0);
    expect(unlinked.spineAllowanceMm).toBe(4.5);
  });

  it('clamps out-of-range values during deserialization', () => {
    const restored = BookParametersModel.deserialize({
      bindingStyle: 'flexible-spine',
      pbHeightMm: 9999,
      pbWidthMm: -5,
      pocketDepthPct: 95,
      splitMode: 'three-piece',
      pdfPageSize: 'a4',
      unit: 'in',
    });

    expect(restored.bindingStyle).toBe('flexible-spine');
    expect(restored.pbHeightMm).toBe(500);
    expect(restored.pbWidthMm).toBe(50);
    expect(restored.pocketDepthPct).toBe(80);
    expect(restored.splitMode).toBe('three-piece');
    expect(restored.pdfPageSize).toBe('a4');
    expect(restored.unit).toBe('in');
  });

  it('falls back to defaults on invalid raw input and round-trips serialization', () => {
    expect(BookParametersModel.deserialize(null)).toEqual(DEFAULT_BOOK_PARAMETERS);
    expect(BookParametersModel.deserialize('garbage')).toEqual(DEFAULT_BOOK_PARAMETERS);

    const custom = BookParametersModel.applyPreset(DEFAULT_BOOK_PARAMETERS, 'manga-b6');
    const roundTripped = BookParametersModel.deserialize(BookParametersModel.serialize(custom));
    expect(roundTripped).toEqual(custom);
  });

  it('validates warnings and errors accurately', () => {
    const valid = BookParametersModel.validate(DEFAULT_BOOK_PARAMETERS);
    expect(valid.isValid).toBe(true);
    expect(valid.warnings).toHaveLength(0);

    const tightHinge = BookParametersModel.validate({
      ...DEFAULT_BOOK_PARAMETERS,
      hingeWidthMm: 4,
      turnInMm: 10,
    });
    expect(tightHinge.isValid).toBe(true);
    expect(tightHinge.warnings.length).toBeGreaterThanOrEqual(2);

    const badMiter = BookParametersModel.validate({
      ...DEFAULT_BOOK_PARAMETERS,
      turnInMm: 4,
      boardThicknessMm: 5,
      miterFactor: 2,
    });
    expect(badMiter.isValid).toBe(false);
    expect(badMiter.errors.length).toBeGreaterThan(0);
  });

  it('defines exact physical page sizes', () => {
    expect(PAGE_SIZES.letter.widthMm).toBe(215.9);
    expect(PAGE_SIZES.a4.heightMm).toBe(297.0);
    expect(PAGE_SIZES.tabloid.widthMm).toBe(279.4);
  });
});
