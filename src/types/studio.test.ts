import { describe, expect, it } from 'vitest';
import { CoverStudioModel, DEFAULT_COVER_STUDIO_STATE } from './studio';

describe('CoverStudioModel', () => {
  it('clamps spine font size so height never exceeds spineWidth - 4.0 mm', () => {
    const maxPt = CoverStudioModel.maxSpineFontSizePt(14);
    expect(maxPt).toBeCloseTo(28.3, 1);

    expect(CoverStudioModel.effectiveSpineFontSizePt(48, 14)).toBe(maxPt);
    expect(CoverStudioModel.effectiveSpineFontSizePt(16, 14)).toBe(16);
    expect(CoverStudioModel.effectiveSpineFontSizePt(2, 14)).toBe(6);
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

  it('serializes and deserializes independent front, spine, back, and fullWrap images', () => {
    const raw = {
      imageMode: 'per-zone',
      images: {
        front: {
          dataUrl: 'data:image/png;base64,front',
          fileName: 'front.png',
          naturalWidth: 1200,
          naturalHeight: 1800,
          zoom: 99,
          offsetXMm: 500,
          offsetYMm: -500,
        },
        spine: {
          dataUrl: 'data:image/png;base64,spine',
          fileName: 'spine.png',
          naturalWidth: 300,
          naturalHeight: 1800,
          zoom: 1.2,
          offsetXMm: 2,
          offsetYMm: -3,
        },
        back: {
          dataUrl: 'data:image/jpeg;base64,back',
          fileName: 'back.jpg',
          naturalWidth: 1200,
          naturalHeight: 1800,
          zoom: 1.0,
          offsetXMm: 0,
          offsetYMm: 0,
        },
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
    expect(parsed.imageMode).toBe('per-zone');
    expect(parsed.images.front.zoom).toBe(5.0);
    expect(parsed.images.front.offsetXMm).toBe(300);
    expect(parsed.images.front.offsetYMm).toBe(-300);
    expect(parsed.images.spine.fileName).toBe('spine.png');
    expect(parsed.images.back.fileName).toBe('back.jpg');
    expect(parsed.images.fullWrap.dataUrl).toBeNull();
    expect(CoverStudioModel.hasAnyActiveImage(parsed)).toBe(true);
    expect(parsed.frontBgColor).toBe('#abcdef');
    expect(parsed.spineBgColor).toBe(DEFAULT_COVER_STUDIO_STATE.spineBgColor);
    expect(parsed.backBgColor).toBe('#123456');
    expect(parsed.spineText.layout).toBe('stacked');
    expect(parsed.spineText.orientation).toBe('bottom-to-top');
    expect(parsed.spineText.fontId).toBe('lora');
    expect(parsed.spineText.opticalNudgeMm).toBe(2.0);
    expect(parsed.cutLineMode).toBe('full-cut-miter');

    const stripped = CoverStudioModel.serialize(parsed, { includeImageData: false });
    expect(stripped.images.front.dataUrl).toBeNull();
    expect(stripped.images.spine.dataUrl).toBeNull();
    expect(stripped.images.back.dataUrl).toBeNull();
    expect(CoverStudioModel.hasAnyActiveImage(stripped)).toBe(false);
  });

  it('migrates legacy single-image projects cleanly and rejects non-image dataUrls', () => {
    expect(CoverStudioModel.deserialize(null)).toEqual(DEFAULT_COVER_STUDIO_STATE);

    const legacyFront = CoverStudioModel.deserialize({
      imageMode: 'front-cover',
      image: {
        dataUrl: 'data:image/png;base64,legacyFront',
        fileName: 'old-front.png',
        naturalWidth: 800,
        naturalHeight: 1200,
        zoom: 1.5,
      },
    });
    expect(legacyFront.imageMode).toBe('per-zone');
    expect(legacyFront.images.front.fileName).toBe('old-front.png');
    expect(legacyFront.images.front.zoom).toBe(1.5);

    const legacyFull = CoverStudioModel.deserialize({
      imageMode: 'full-wrap',
      image: {
        dataUrl: 'data:image/png;base64,legacyWrap',
        fileName: 'old-wrap.png',
        naturalWidth: 2400,
        naturalHeight: 1600,
      },
    });
    expect(legacyFull.imageMode).toBe('full-wrap');
    expect(legacyFull.images.fullWrap.fileName).toBe('old-wrap.png');
    expect(CoverStudioModel.hasAnyActiveImage(legacyFull)).toBe(true);

    const badImg = CoverStudioModel.deserialize({
      images: { front: { dataUrl: 'javascript:alert(1)' } },
    });
    expect(badImg.images.front.dataUrl).toBeNull();
  });
});
