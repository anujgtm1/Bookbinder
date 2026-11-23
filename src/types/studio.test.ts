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

  it('splits multi-word horizontal author names and clamps font size to spine width', () => {
    expect(CoverStudioModel.splitHorizontalAuthorLines('JULES VERNE')).toEqual(['JULES', 'VERNE']);
    expect(CoverStudioModel.splitHorizontalAuthorLines('Ursula K. Le Guin')).toEqual([
      'Ursula K. Le',
      'Guin',
    ]);
    expect(CoverStudioModel.splitHorizontalAuthorLines('Tolkien')).toEqual(['Tolkien']);
    expect(CoverStudioModel.splitHorizontalAuthorLines('   ')).toEqual([]);

    // On a 26 mm spine (22 mm usable), "HERBERT" (7 chars) fits around ~14.4 pt max
    const clamped = CoverStudioModel.horizontalAuthorFontSizePt(['FRANK', 'HERBERT'], 24, 26);
    expect(clamped).toBeLessThan(24);
    expect(clamped).toBeGreaterThanOrEqual(5.5);
  });

  it('serializes and deserializes multi-layer cover studio state with clamping and validation', () => {
    const raw = {
      layers: [
        {
          id: 'img-1',
          dataUrl: 'data:image/png;base64,front',
          fileName: 'front.png',
          naturalWidth: 1200,
          naturalHeight: 1800,
          xMm: 210,
          yMm: 0,
          widthMm: 162,
          heightMm: 265,
          clipZone: 'front',
        },
        {
          id: 'img-2',
          dataUrl: 'data:image/jpeg;base64,emblem',
          fileName: 'emblem.jpg',
          naturalWidth: 400,
          naturalHeight: 400,
          xMm: 170,
          yMm: 100,
          widthMm: 20,
          heightMm: 20,
          clipZone: 'none',
        },
        { id: 'bad', dataUrl: 'javascript:alert(1)' },
      ],
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
    expect(parsed.layers).toHaveLength(2);
    expect(parsed.layers[0].fileName).toBe('front.png');
    expect(parsed.layers[0].clipZone).toBe('front');
    expect(parsed.layers[1].fileName).toBe('emblem.jpg');
    expect(parsed.frontBgColor).toBe('#abcdef');
    expect(parsed.spineBgColor).toBe(DEFAULT_COVER_STUDIO_STATE.spineBgColor);
    expect(parsed.backBgColor).toBe('#123456');
    expect(parsed.spineText.layout).toBe('stacked');
    expect(parsed.spineText.orientation).toBe('bottom-to-top');
    expect(parsed.spineText.fontId).toBe('lora');
    expect(parsed.spineText.opticalNudgeMm).toBe(2.0);
    expect(parsed.cutLineMode).toBe('full-cut-miter');

    const stripped = CoverStudioModel.serialize(parsed, { includeImageData: false });
    expect(stripped.layers).toHaveLength(0);
  });

  it('falls back cleanly on null or malformed input', () => {
    expect(CoverStudioModel.deserialize(null)).toEqual(DEFAULT_COVER_STUDIO_STATE);
    expect(CoverStudioModel.deserialize('invalid')).toEqual(DEFAULT_COVER_STUDIO_STATE);
  });

  it('serializes, deserializes, clamps, and quota-strips pocketStyle settings', () => {
    const parsed = CoverStudioModel.deserialize({
      pocketStyle: {
        backgroundColor: '#1E4D44',
        imageDataUrl: 'data:image/png;base64,POCKET',
        imageFileName: 'marbled.png',
        imageNaturalWidth: 1200,
        imageNaturalHeight: 1200,
        imageFitMode: 'tile',
        imageScale: 9,
        imageOpacity: 0.01,
        styleScope: 'full-envelope',
      },
    });

    expect(parsed.pocketStyle.backgroundColor).toBe('#1e4d44');
    expect(parsed.pocketStyle.imageDataUrl).toBe('data:image/png;base64,POCKET');
    expect(parsed.pocketStyle.imageFitMode).toBe('tile');
    expect(parsed.pocketStyle.imageScale).toBe(2.5);
    expect(parsed.pocketStyle.imageOpacity).toBe(0.1);
    expect(parsed.pocketStyle.styleScope).toBe('full-envelope');

    const stripped = CoverStudioModel.serialize(parsed, { includeImageData: false });
    expect(stripped.pocketStyle.imageDataUrl).toBeNull();
    expect(stripped.pocketStyle.backgroundColor).toBe('#1e4d44');
  });
});
