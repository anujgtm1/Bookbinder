import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import {
  SERIES_BANDS_ORNAMENT_ID,
  SERIES_PANORAMA_LAYER_ID,
  SERIES_VOLUME_BADGE_LAYER_ID,
  compileSeriesBookToCoverStudio,
  computeSeriesShelfLayout,
  createSeriesBookFromSavedRecord,
} from '@/core/seriesSpines';
import {
  SERIES_WORKSPACE_STORAGE_KEY,
  loadSeriesWorkspace,
  saveSeriesWorkspace,
} from '@/core/seriesStorage';
import {
  SAMPLE_PANORAMA_NATURAL_HEIGHT,
  SAMPLE_PANORAMA_NATURAL_WIDTH,
  SERIES_STARTER_TEMPLATES,
  createSamplePanoramaDataUrl,
} from '@/resources/seriesPresets';
import { BookParametersModel } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { BookbinderProjectModel } from '@/types/project';
import { asProjectId, type SavedProjectRecord } from '@/types/projectLibrary';
import { SeriesProjectModel } from '@/types/seriesSpines';
import { CoverStudioModel } from '@/types/studio';
import { CoverImageLayerModel } from '@/types/studioLayer';

describe('seriesSpines core layout, compilation, and storage', () => {
  it('computes real physical spine widths from calculateCaseGeometry across distinct binding styles', () => {
    const base = BookParametersModel.createDefault();
    const series = {
      ...SeriesProjectModel.createDefault(),
      books: [
        SeriesProjectModel.createBookEntry({
          title: 'Hardcover',
          parameters: { ...base, bindingStyle: 'rigid-case', pbThicknessMm: 24 },
        }),
        SeriesProjectModel.createBookEntry({
          title: 'Softcover Jacket',
          parameters: { ...base, bindingStyle: 'softcover-jacket', pbThicknessMm: 24 },
        }),
        SeriesProjectModel.createBookEntry({
          title: 'Paperback Wrap',
          parameters: { ...base, bindingStyle: 'paperback-wrap', pbThicknessMm: 24 },
        }),
      ],
    };

    const layout = computeSeriesShelfLayout(series);
    for (let i = 0; i < series.books.length; i++) {
      const expectedGeom = calculateCaseGeometry(series.books[i].parameters);
      expect(layout.books[i].spineWidthMm).toBeCloseTo(expectedGeom.outerWrap.spineRect.width, 3);
      expect(layout.books[i].spineHeightMm).toBeCloseTo(expectedGeom.outerWrap.spineRect.height, 3);
    }

    // Rigid-case includes spineAllowance (24 + 4 = 28 mm) whereas paperback-wrap equals raw 24 mm
    expect(layout.books[0].spineWidthMm).toBeGreaterThan(layout.books[2].spineWidthMm);
  });

  it('bottom-aligns mixed-height collections on a shared shelf baseline with level guides', () => {
    const collectionTpl = SERIES_STARTER_TEMPLATES.find((t) => t.id === 'personal-collection');
    expect(collectionTpl).toBeDefined();
    const collection = collectionTpl!.build();

    const layout = computeSeriesShelfLayout(collection);
    expect(layout.hasMixedHeights).toBe(true);
    expect(layout.books).toHaveLength(3);

    // Every book must sit flush on the wooden shelf bottom
    for (const b of layout.books) {
      expect(b.shelfYMm + b.spineHeightMm).toBeCloseTo(layout.maxSpineHeightMm, 2);
    }

    // Under 'shelf-bottom' anchor, head bands, tail bands, and author baselines align horizontally across heights
    const [b0, b1, b2] = layout.books;
    expect(b0.headBandYMm).toBeCloseTo(b1.headBandYMm, 2);
    expect(b1.headBandYMm).toBeCloseTo(b2.headBandYMm, 2);
    expect(b0.tailBandYMm).toBeCloseTo(b1.tailBandYMm, 2);
    expect(b1.tailBandYMm).toBeCloseTo(b2.tailBandYMm, 2);
    expect(b0.authorYMm).toBeCloseTo(b2.authorYMm, 2);

    // Switching to 'book-top' lets each book's head band track its own top cap
    const topAnchored = computeSeriesShelfLayout({
      ...collection,
      shared: { ...collection.shared, alignmentAnchor: 'book-top' },
    });
    expect(topAnchored.books[0].headBandYMm).toBeGreaterThan(topAnchored.books[2].headBandYMm);
  });

  it('slices panoramic artwork continuously across adjacent spines and honors shelfGapMm', () => {
    const baseSeries = SeriesProjectModel.createDefault();
    const panoUrl = createSamplePanoramaDataUrl();

    const seamlessSeries = {
      ...baseSeries,
      shared: {
        ...baseSeries.shared,
        panorama: {
          ...baseSeries.shared.panorama,
          enabled: true,
          dataUrl: panoUrl,
          fileName: 'sample.svg',
          naturalWidth: SAMPLE_PANORAMA_NATURAL_WIDTH,
          naturalHeight: SAMPLE_PANORAMA_NATURAL_HEIGHT,
          shelfGapMm: 0,
        },
      },
    };

    const layout0 = computeSeriesShelfLayout(seamlessSeries);
    expect(layout0.panoramaShelfRect).not.toBeNull();

    // Right edge of Book 0 spine samples exact same panorama X as left edge of Book 1 spine
    const b0 = layout0.books[0];
    const b1 = layout0.books[1];
    expect(b0.panoramaLayerPlacement).not.toBeNull();
    expect(b1.panoramaLayerPlacement).not.toBeNull();

    const b0RightInPano =
      b0.spec.spineBoardRect.x + b0.spineWidthMm - b0.panoramaLayerPlacement!.xMm;
    const b1LeftInPano = b1.spec.spineBoardRect.x - b1.panoramaLayerPlacement!.xMm;
    expect(b1LeftInPano - b0RightInPano).toBeCloseTo(0, 2);

    // With shelfGapMm = 2.5, Book 1 starts exactly 2.5 mm further right in the panorama
    const gappedLayout = computeSeriesShelfLayout({
      ...seamlessSeries,
      shared: {
        ...seamlessSeries.shared,
        panorama: { ...seamlessSeries.shared.panorama, shelfGapMm: 2.5 },
      },
    });
    const gb0 = gappedLayout.books[0];
    const gb1 = gappedLayout.books[1];
    const gb0Right = gb0.spec.spineBoardRect.x + gb0.spineWidthMm - gb0.panoramaLayerPlacement!.xMm;
    const gb1Left = gb1.spec.spineBoardRect.x - gb1.panoramaLayerPlacement!.xMm;
    expect(gb1Left - gb0Right).toBeCloseTo(2.5, 2);
  });

  it('compiles a linked book into CoverStudioState while preserving existing front/back cover designs', () => {
    const series = {
      ...SeriesProjectModel.createDefault(),
      shared: {
        ...SeriesProjectModel.createDefault().shared,
        bandStyle: 'classic-rules' as const,
        volumeNumberStyle: 'roman' as const,
        panorama: {
          ...SeriesProjectModel.createDefault().shared.panorama,
          enabled: true,
          dataUrl: createSamplePanoramaDataUrl(),
          fileName: 'peaks.svg',
          naturalWidth: SAMPLE_PANORAMA_NATURAL_WIDTH,
          naturalHeight: SAMPLE_PANORAMA_NATURAL_HEIGHT,
        },
      },
    };

    const userFrontText = CoverTextLayerModel.createPreset('front-title', {
      x: 200,
      y: 20,
      width: 140,
      height: 220,
    });
    const userFrontOrnament = CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      { x: 200, y: 20, width: 140, height: 220 },
      'front',
    );
    const userFrontImg = CoverImageLayerModel.createInRect({
      id: 'user-front-art',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      fileName: 'front.png',
      naturalWidth: 800,
      naturalHeight: 1200,
      targetRect: { x: 200, y: 20, width: 140, height: 220 },
      clipZone: 'front',
    });

    const existingStudio = {
      ...CoverStudioModel.createDefault(),
      frontBgColor: '#7a2222',
      backBgColor: '#3a1a1a',
      layers: [userFrontImg],
      textLayers: [userFrontText],
      ornaments: [userFrontOrnament],
    };

    const compiled = compileSeriesBookToCoverStudio(series, 0, existingStudio);
    // Preserves front/back colors and user-authored front artwork, text, and ornaments
    expect(compiled.frontBgColor).toBe('#7a2222');
    expect(compiled.backBgColor).toBe('#3a1a1a');
    expect(compiled.layers.some((l) => l.id === 'user-front-art')).toBe(true);
    expect(compiled.textLayers.some((t) => t.id === userFrontText.id)).toBe(true);
    expect(compiled.ornaments.some((o) => o.id === userFrontOrnament.id)).toBe(true);

    // Adds deterministic series-* managed elements cleanly on the spine
    expect(compiled.layers.some((l) => l.id === SERIES_PANORAMA_LAYER_ID && l.clipZone === 'spine')).toBe(true);
    expect(compiled.textLayers.some((t) => t.id === SERIES_VOLUME_BADGE_LAYER_ID && t.text === 'I')).toBe(true);
    expect(compiled.ornaments.some((o) => o.id === SERIES_BANDS_ORNAMENT_ID)).toBe(true);

    // Re-compiling a second time must not duplicate managed series-* layers
    const recompiled = compileSeriesBookToCoverStudio(series, 0, compiled);
    expect(recompiled.layers.filter((l) => l.id === SERIES_PANORAMA_LAYER_ID)).toHaveLength(1);
    expect(recompiled.textLayers.filter((t) => t.id === SERIES_VOLUME_BADGE_LAYER_ID)).toHaveLength(1);
    expect(recompiled.ornaments.filter((o) => o.id === SERIES_BANDS_ORNAMENT_ID)).toHaveLength(1);
  });

  it('imports a SavedProjectRecord into a SeriesBookEntry preserving linkedProjectId and geometry', () => {
    const params = BookParametersModel.clampAndNormalize({
      bindingStyle: 'flexible-spine',
      pbHeightMm: 225,
      pbWidthMm: 148,
      pbThicknessMm: 31,
    });
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineBgColor: '#234a3f',
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Dune Messiah',
        author: 'Frank Herbert',
      },
    };
    const record: SavedProjectRecord = {
      id: asProjectId('proj-dune-2'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      project: BookbinderProjectModel.create(params, studio, 'Dune Messiah'),
      thumbnailDataUrl: null,
    };

    const entry = createSeriesBookFromSavedRecord(record);
    expect(entry.linkedProjectId).toBe(record.id);
    expect(entry.title).toBe('Dune Messiah');
    expect(entry.author).toBe('Frank Herbert');
    expect(entry.parameters.pbThicknessMm).toBe(31);
    expect(entry.spineBgColorOverride).toBe('#234a3f');
  });

  it('persists series workspace to storage and gracefully strips panorama data on quota overflow', () => {
    const store = new Map<string, string>();
    const mockStorage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (idx: number) => Array.from(store.keys())[idx] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        if (value.length > 4000) {
          throw new Error('QuotaExceededError');
        }
        store.set(key, value);
      },
    } as Storage;

    const series = SeriesProjectModel.createDefault();
    const hugePanoSeries = {
      ...series,
      name: 'Quota Resilient Set',
      shared: {
        ...series.shared,
        panorama: {
          ...series.shared.panorama,
          enabled: true,
          dataUrl: `data:image/png;base64,${'A'.repeat(5000)}`,
          fileName: 'huge.png',
          naturalWidth: 4000,
          naturalHeight: 1200,
        },
      },
    };

    const saveRes = saveSeriesWorkspace(
      { activeSeriesId: hugePanoSeries.id, seriesList: [hugePanoSeries] },
      mockStorage,
    );
    expect(saveRes.saved).toBe(true);
    expect(saveRes.omittedPanoramaForQuota).toBe(true);
    expect(store.has(SERIES_WORKSPACE_STORAGE_KEY)).toBe(true);

    const loaded = loadSeriesWorkspace(mockStorage);
    expect(loaded.activeSeriesId).toBe(hugePanoSeries.id);
    expect(loaded.seriesList[0].name).toBe('Quota Resilient Set');
    expect(loaded.seriesList[0].books).toHaveLength(3);
    expect(loaded.seriesList[0].shared.panorama.dataUrl).toBeNull();
  });
});
