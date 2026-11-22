import { describe, expect, it } from 'vitest';
import { CoverStudioModel, DEFAULT_COVER_STUDIO_STATE } from './studio';

describe('CoverStudioModel', () => {
  it('clamps spine font size so height never exceeds spineWidth - 4.0 mm', () => {
    // 14 mm spine => 10 mm usable => ~28.3 pt max
    const maxPt = CoverStudioModel.maxSpineFontSizePt(14);
    expect(maxPt).toBeCloseTo(28.3, 1);

    expect(CoverStudioModel.effectiveSpineFontSizePt(48, 14)).toBe(maxPt);
    expect(CoverStudioModel.effectiveSpineFontSizePt(16, 14)).toBe(16);
    expect(CoverStudioModel.effectiveSpineFontSizePt(2, 14)).toBe(6);

    // Very narrow spine still yields minimum readable 6 pt
    expect(CoverStudioModel.maxSpineFontSizePt(5)).toBe(6);
  });

  it('formats inline spine text cleanly', () => {
    expect(CoverStudioModel.formatInlineSpineText('Dune', 'Frank Herbert')).toBe(
      'Dune  —  Frank Herbert',
    );
    expect(CoverStudioModel.formatInlineSpineText('Dune', '')).toBe('Dune');
    expect(CoverStudioModel.formatInlineSpineText('  ', 'Frank Herbert')).toBe('Frank Herbert');
    expect(CoverStudioModel.formatInlineSpineText('', '')).toBe('');
  });

  it('serializes and deserializes studio state with clamping and validation', () => {
    const raw = {
      imageMode: 'full-wrap',
      image: {
        dataUrl: 'data:image/png;base64,abc',
        fileName: 'cover.png',
        naturalWidth: 1200,
        naturalHeight: 1800,
        zoom: 99,
        offsetXMm: 500,
        offsetYMm: -500,
      },
      frontBgColor: '#ABCDEF',
      spineBgColor: 'not-a-color',
      backBgColor: '#123456',
      spineText: {
        title: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        layout: 'stacked',
        orientation: 'bottom-to-top',
        fontId: 'lora',
        fontSizePt: 22,
        textColor: '#FFFFFF',
        opticalNudgeMm: 5,
      },
      cutLineMode: 'full-cut-miter',
    };

    const parsed = CoverStudioModel.deserialize(raw);
    expect(parsed.imageMode).toBe('full-wrap');
    expect(parsed.image.zoom).toBe(5.0);
    expect(parsed.image.offsetXMm).toBe(300);
    expect(parsed.image.offsetYMm).toBe(-300);
    expect(parsed.frontBgColor).toBe('#abcdef');
    expect(parsed.spineBgColor).toBe(DEFAULT_COVER_STUDIO_STATE.spineBgColor);
    expect(parsed.backBgColor).toBe('#123456');
    expect(parsed.spineText.layout).toBe('stacked');
    expect(parsed.spineText.orientation).toBe('bottom-to-top');
    expect(parsed.spineText.fontId).toBe('lora');
    expect(parsed.spineText.opticalNudgeMm).toBe(2.0);
    expect(parsed.cutLineMode).toBe('full-cut-miter');

    const stripped = CoverStudioModel.serialize(parsed, { includeImageData: false });
    expect(stripped.image.dataUrl).toBeNull();
  });

  it('rejects non-image dataUrls and falls back on malformed input', () => {
    expect(CoverStudioModel.deserialize(null)).toEqual(DEFAULT_COVER_STUDIO_STATE);
    const badImg = CoverStudioModel.deserialize({
      image: { dataUrl: 'javascript:alert(1)' },
    });
    expect(badImg.image.dataUrl).toBeNull();
  });
});
