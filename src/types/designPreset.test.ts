import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import {
  DESIGN_PRESETS_STORAGE_KEY,
  exportDesignPresetsJson,
  importDesignPresetsJson,
  loadSavedDesignPresets,
  saveDesignPresets,
} from '@/core/presetStorage';
import { BookParametersModel, DEFAULT_BOOK_PARAMETERS } from './bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from './coverElements';
import {
  BUILT_IN_DESIGN_PRESETS,
  CoverDesignPresetModel,
  type CoverDesignPreset,
} from './designPreset';
import { CoverStudioModel } from './studio';

describe('CoverDesignPresetModel & presetStorage', () => {
  const a6Params = {
    ...DEFAULT_BOOK_PARAMETERS,
    pbWidthMm: 105,
    pbHeightMm: 148,
    pbThicknessMm: 5,
    bindingStyle: 'softcover-jacket' as const,
  };
  const a6Geometry = calculateCaseGeometry(a6Params);

  const usTradeParams = {
    ...BookParametersModel.applyPreset(DEFAULT_BOOK_PARAMETERS, 'us-trade-standard'),
    pbThicknessMm: 28,
  };
  const usTradeGeometry = calculateCaseGeometry(usTradeParams);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('exports 4 curated built-in series design presets with valid normalized coordinates', () => {
    expect(BUILT_IN_DESIGN_PRESETS).toHaveLength(4);
    expect(BUILT_IN_DESIGN_PRESETS.map((p) => p.id)).toEqual([
      'classic-clothbound-gold',
      'art-deco-midnight',
      'botanical-field-journal',
      'celestial-oxblood',
    ]);

    for (const preset of BUILT_IN_DESIGN_PRESETS) {
      expect(preset.isBuiltIn).toBe(true);
      expect(preset.textTemplates.length).toBeGreaterThanOrEqual(1);
      expect(preset.ornamentTemplates.length).toBeGreaterThanOrEqual(2);
      for (const t of preset.textTemplates) {
        expect(t.relX).toBeGreaterThanOrEqual(0);
        expect(t.relX).toBeLessThanOrEqual(1);
        expect(t.relY).toBeGreaterThanOrEqual(0);
        expect(t.relY).toBeLessThanOrEqual(1);
      }
      for (const o of preset.ornamentTemplates) {
        expect(o.relX).toBeGreaterThanOrEqual(0);
        expect(o.relX).toBeLessThanOrEqual(1);
        expect(o.relY).toBeGreaterThanOrEqual(0);
        expect(o.relY).toBeLessThanOrEqual(1);
        expect(o.relW).toBeGreaterThan(0);
        expect(o.relW).toBeLessThanOrEqual(1);
        expect(o.relH).toBeGreaterThan(0);
        expect(o.relH).toBeLessThanOrEqual(1);
      }
    }
  });

  it('captures a design from A6 (105x148x5 mm) and adapts proportionally to US Trade (152.4x228.6x28 mm) while preserving Book 2 spine title & author', () => {
    const a6Bleed = a6Geometry.outerWrap.includeBleed ? a6Geometry.outerWrap.bleedMm : 0;
    const a6Front = {
      x: a6Geometry.outerWrap.frontBoardRect.x + a6Bleed,
      y: a6Geometry.outerWrap.frontBoardRect.y + a6Bleed,
      width: a6Geometry.outerWrap.frontBoardRect.width,
      height: a6Geometry.outerWrap.frontBoardRect.height,
    };
    const a6Spine = {
      x: a6Geometry.outerWrap.spineRect.x + a6Bleed,
      y: a6Geometry.outerWrap.spineRect.y + a6Bleed,
      width: a6Geometry.outerWrap.spineRect.width,
      height: a6Geometry.outerWrap.spineRect.height,
    };

    const titleLayer = CoverTextLayerModel.createPreset('front-title', a6Front, {
      fontId: 'cormorant-garamond',
      color: '#e6c97a',
    });
    const frameOrn = CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      a6Front,
      'front',
      '#e6c97a',
    );
    const customSvg = CoverOrnamentLayerModel.createCustomSvg({
      name: 'Crest',
      paths: ['M 0 0 L 100 0 L 50 50 Z'],
      viewBoxWidth: 100,
      viewBoxHeight: 50, // exact 2:1 aspect ratio
      renderMode: 'fill',
      targetBoardRectMm: a6Front,
      zone: 'front',
      color: '#e6c97a',
    });
    const spineBands = CoverOrnamentLayerModel.createForZone(
      'spine-classic-bands',
      a6Spine,
      'spine',
      '#e6c97a',
    );

    const book1Studio = {
      ...CoverStudioModel.createDefault(),
      frontBgColor: '#5c1f24',
      spineBgColor: '#4a181c',
      backBgColor: '#5c1f24',
      pocketStyle: {
        ...CoverStudioModel.createDefault().pocketStyle,
        backgroundColor: '#e9e2d2',
      },
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Book One',
        author: 'First Author',
        layout: 'stacked' as const,
        orientation: 'bottom-to-top' as const,
        authorOrientation: 'horizontal' as const,
        fontId: 'cormorant-garamond' as const,
        fontSizePt: 20,
        textColor: '#e6c97a',
      },
      textLayers: [{ ...titleLayer, text: 'VOLUME I', rotationDeg: 90 as const }],
      ornaments: [{ ...frameOrn, rotationDeg: 180 as const }, customSvg, spineBands],
    };

    const captured = CoverDesignPresetModel.captureFromStudio(
      'Oxblood Collector Series',
      a6Geometry,
      book1Studio,
    );

    expect(captured.name).toBe('Oxblood Collector Series');
    expect(captured.frontBgColor).toBe('#5c1f24');
    expect(captured.pocketBgColor).toBe('#e9e2d2');
    expect(captured.textTemplates).toHaveLength(1);
    expect(captured.ornamentTemplates).toHaveLength(3);

    // Book 2 has its own spine title, author, and existing uploaded artwork layer
    const book2Studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Dune Messiah',
        author: 'Frank Herbert',
      },
    };

    const applied = CoverDesignPresetModel.applyToStudio(captured, usTradeGeometry, book2Studio);

    // Colors & pocket background transferred
    expect(applied.frontBgColor).toBe('#5c1f24');
    expect(applied.spineBgColor).toBe('#4a181c');
    expect(applied.backBgColor).toBe('#5c1f24');
    expect(applied.pocketStyle.backgroundColor).toBe('#e9e2d2');

    // Spine styling transferred, while Book 2's own spine title & author are strictly preserved!
    expect(applied.spineText.title).toBe('Dune Messiah');
    expect(applied.spineText.author).toBe('Frank Herbert');
    expect(applied.spineText.layout).toBe('stacked');
    expect(applied.spineText.orientation).toBe('bottom-to-top');
    expect(applied.spineText.authorOrientation).toBe('horizontal');
    expect(applied.spineText.fontId).toBe('cormorant-garamond');
    expect(applied.spineText.textColor).toBe('#e6c97a');

    // Frame ornament expanded proportionally onto US Trade front board
    const tradeBleed = usTradeGeometry.outerWrap.includeBleed
      ? usTradeGeometry.outerWrap.bleedMm
      : 0;
    const tradeFront = {
      x: usTradeGeometry.outerWrap.frontBoardRect.x + tradeBleed,
      y: usTradeGeometry.outerWrap.frontBoardRect.y + tradeBleed,
      width: usTradeGeometry.outerWrap.frontBoardRect.width,
      height: usTradeGeometry.outerWrap.frontBoardRect.height,
    };

    const appliedFrame = applied.ornaments[0];
    expect(appliedFrame.presetId).toBe('frame-double-rule');
    expect(appliedFrame.rotationDeg).toBe(180);
    expect(appliedFrame.widthMm).toBeGreaterThan(frameOrn.widthMm + 30);
    expect(appliedFrame.heightMm).toBeGreaterThan(frameOrn.heightMm + 60);
    expect(appliedFrame.xMm).toBeGreaterThanOrEqual(tradeFront.x);
    expect(appliedFrame.xMm + appliedFrame.widthMm).toBeLessThanOrEqual(
      tradeFront.x + tradeFront.width + 0.5,
    );

    // Custom SVG preserves exact 2:1 aspect ratio on the new board
    const appliedSvg = applied.ornaments[1];
    expect(appliedSvg.presetId).toBe('custom-svg');
    expect(appliedSvg.customSvgName).toBe('Crest');
    expect(appliedSvg.widthMm / appliedSvg.heightMm).toBeCloseTo(2.0, 1);

    // Front text remapped to US Trade front board center X and preserves user-saved fontSizePt
    const appliedText = applied.textLayers[0];
    expect(appliedText.xMm).toBeCloseTo(tradeFront.x + tradeFront.width / 2, 0);
    expect(appliedText.fontSizePt).toBe(titleLayer.fontSizePt);
    expect(appliedText.rotationDeg).toBe(90);
  });

  it('gently scales built-in text font sizes for small A6 vs large Royal covers and keeps emblems square', () => {
    const botanical = BUILT_IN_DESIGN_PRESETS.find((p) => p.id === 'botanical-field-journal')!;
    const base = CoverStudioModel.createDefault();

    const onA6 = CoverDesignPresetModel.applyToStudio(botanical, a6Geometry, base);
    const onTrade = CoverDesignPresetModel.applyToStudio(botanical, usTradeGeometry, base);

    // Built-in title font size scales down on A6 relative to US Trade
    expect(onA6.textLayers[0].fontSizePt).toBeLessThan(onTrade.textLayers[0].fontSizePt);

    // Botanical emblem preserves exact 1:1 square aspect ratio on both sizes
    const a6Emblem = onA6.ornaments.find((o) => o.presetId === 'emblem-botanical-sprig')!;
    const tradeEmblem = onTrade.ornaments.find((o) => o.presetId === 'emblem-botanical-sprig')!;
    expect(a6Emblem.widthMm).toBeCloseTo(a6Emblem.heightMm, 1);
    expect(tradeEmblem.widthMm).toBeCloseTo(tradeEmblem.heightMm, 1);
    expect(tradeEmblem.widthMm).toBeGreaterThan(a6Emblem.widthMm);
  });

  it('serializes, deserializes, clamps malformed data, and deduplicates IDs safely', () => {
    const rawJson = CoverDesignPresetModel.serializeList(BUILT_IN_DESIGN_PRESETS);
    const roundTripped = CoverDesignPresetModel.deserializeList(rawJson);
    expect(roundTripped).toHaveLength(4);
    expect(roundTripped[0].name).toBe('Classic Clothbound Gold');
    expect(roundTripped[0].ornamentTemplates).toEqual(
      BUILT_IN_DESIGN_PRESETS[0].ornamentTemplates,
    );

    // Corrupt JSON returns []
    expect(CoverDesignPresetModel.deserializeList('{bad json')).toEqual([]);

    // Out-of-bounds values get clamped and invalid entries dropped
    const dirty: unknown[] = [
      null,
      { name: '' },
      {
        id: 'dup-id',
        name: 'Clamped Theme',
        frontBgColor: 'not-a-hex',
        spineStyle: { fontSizePt: 999, fontId: 'unknown-font' },
        textTemplates: [
          { text: 'Hi', zone: 'front', relX: 99, relY: -5, fontSizePt: 500, color: '#fff' },
        ],
        ornamentTemplates: [
          {
            presetId: 'frame-double-rule',
            zone: 'front',
            relX: -2,
            relY: 3,
            relW: 9,
            relH: 0,
            strokeWidthMm: 50,
          },
          { presetId: 'nonexistent-ornament', zone: 'front' },
        ],
      },
      {
        id: 'dup-id',
        name: 'Second Theme With Duplicate ID',
      },
    ];
    const parsed = CoverDesignPresetModel.deserializeList(dirty);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].frontBgColor).toBe('#1f3a52');
    expect(parsed[0].spineStyle.fontSizePt).toBe(72);
    expect(parsed[0].spineStyle.fontId).toBe('eb-garamond');
    expect(parsed[0].textTemplates[0].relX).toBe(1);
    expect(parsed[0].textTemplates[0].relY).toBe(0);
    expect(parsed[0].textTemplates[0].fontSizePt).toBe(96);
    expect(parsed[0].ornamentTemplates).toHaveLength(1);
    expect(parsed[0].ornamentTemplates[0].relW).toBe(1);
    expect(parsed[0].ornamentTemplates[0].relH).toBe(0.02);
    expect(parsed[0].ornamentTemplates[0].strokeWidthMm).toBe(3);
    expect(parsed[1].id).not.toBe(parsed[0].id);
  });

  it('persists saved presets to localStorage and round-trips portable JSON export/import', () => {
    const customPreset: CoverDesignPreset = CoverDesignPresetModel.captureFromStudio(
      'Dune Gold Series',
      usTradeGeometry,
      CoverDesignPresetModel.applyToStudio(
        BUILT_IN_DESIGN_PRESETS[0],
        usTradeGeometry,
        CoverStudioModel.createDefault(),
      ),
    );

    saveDesignPresets([customPreset]);
    expect(window.localStorage.getItem(DESIGN_PRESETS_STORAGE_KEY)).not.toBeNull();

    const loaded = loadSavedDesignPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Dune Gold Series');
    expect(loaded[0].isBuiltIn).toBeUndefined();

    // Portable JSON export & import
    const exportedJson = exportDesignPresetsJson(loaded);
    const importRes = importDesignPresetsJson(exportedJson);
    expect(importRes.ok).toBe(true);
    if (importRes.ok) {
      expect(importRes.presets).toHaveLength(1);
      expect(importRes.presets[0].name).toBe('Dune Gold Series');
    }

    // Invalid JSON returns clean error
    expect(importDesignPresetsJson('{not json').ok).toBe(false);
    expect(importDesignPresetsJson('{"presets": []}').ok).toBe(false);

    // Graceful handling when storage throws
    const brokenStorage = {
      getItem: vi.fn(() => {
        throw new Error('Blocked');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('QuotaExceededError');
      }),
    } as unknown as Storage;
    expect(loadSavedDesignPresets(brokenStorage)).toEqual([]);
    expect(() => saveDesignPresets([customPreset], brokenStorage)).not.toThrow();
  });
});
