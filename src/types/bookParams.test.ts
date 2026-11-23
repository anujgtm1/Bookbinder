import { describe, expect, it } from 'vitest';
import {
  BookParametersModel,
  DEFAULT_BOOK_PARAMETERS,
  PAGE_SIZES,
  PAPERBACK_PRESETS,
  hasIntegratedFlaps,
  isBoardlessBinding,
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
    expect(defaults.printMedia).toBe('exact-auto');
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
    expect(restored.jacketFlapWidthMm).toBeUndefined();

    const withFlap = BookParametersModel.deserialize({
      bindingStyle: 'softcover-jacket',
      jacketFlapWidthMm: 38,
    });
    expect(withFlap.jacketFlapWidthMm).toBe(38);

    expect(
      BookParametersModel.clampAndNormalize({ jacketFlapWidthMm: 12 }).jacketFlapWidthMm,
    ).toBe(20);
    expect(
      BookParametersModel.clampAndNormalize({ jacketFlapWidthMm: 90 }).jacketFlapWidthMm,
    ).toBe(90);
    expect(
      BookParametersModel.clampAndNormalize({ jacketFlapWidthMm: 140 }).jacketFlapWidthMm,
    ).toBe(100);
    expect(BookParametersModel.clampAndNormalize({ printMedia: 'tabloid' }).printMedia).toBe(
      'tabloid',
    );
    expect(
      BookParametersModel.deserialize({ printMedia: 'not-a-real-media' }).printMedia,
    ).toBe('exact-auto');
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
    expect(PAGE_SIZES.legal.widthMm).toBe(215.9);
    expect(PAGE_SIZES.legal.heightMm).toBe(355.6);
    expect(PAGE_SIZES.tabloid.widthMm).toBe(279.4);
    expect(PAGE_SIZES.tabloid.heightMm).toBe(431.8);
    expect(BookParametersModel.deserialize({ pdfPageSize: 'legal' }).pdfPageSize).toBe('legal');
  });

  it('parses, validates, and classifies dust-jacket and paperback-wrap binding styles', () => {
    const dustJacket = BookParametersModel.deserialize({
      bindingStyle: 'dust-jacket',
      jacketFlapWidthMm: 75,
      hingeWidthMm: 3,
      turnInMm: 8,
      boardThicknessMm: 5,
      miterFactor: 2.5,
    });
    expect(dustJacket.bindingStyle).toBe('dust-jacket');
    expect(dustJacket.jacketFlapWidthMm).toBe(75);
    const dustValidation = BookParametersModel.validate(dustJacket);
    expect(dustValidation.isValid).toBe(true);
    expect(dustValidation.warnings).toHaveLength(0);
    expect(dustValidation.errors).toHaveLength(0);

    const pbWrap = BookParametersModel.deserialize({
      bindingStyle: 'paperback-wrap',
      hingeWidthMm: 3,
      turnInMm: 8,
      boardThicknessMm: 5,
      miterFactor: 2.5,
    });
    expect(pbWrap.bindingStyle).toBe('paperback-wrap');
    const pbValidation = BookParametersModel.validate(pbWrap);
    expect(pbValidation.isValid).toBe(true);
    expect(pbValidation.warnings).toHaveLength(0);
    expect(pbValidation.errors).toHaveLength(0);

    expect(isBoardlessBinding('rigid-case')).toBe(false);
    expect(isBoardlessBinding('flexible-spine')).toBe(false);
    expect(isBoardlessBinding('softcover-jacket')).toBe(true);
    expect(isBoardlessBinding('dust-jacket')).toBe(true);
    expect(isBoardlessBinding('paperback-wrap')).toBe(true);

    expect(hasIntegratedFlaps('rigid-case')).toBe(false);
    expect(hasIntegratedFlaps('flexible-spine')).toBe(false);
    expect(hasIntegratedFlaps('paperback-wrap')).toBe(false);
    expect(hasIntegratedFlaps('softcover-jacket')).toBe(true);
    expect(hasIntegratedFlaps('dust-jacket')).toBe(true);
  });
});
