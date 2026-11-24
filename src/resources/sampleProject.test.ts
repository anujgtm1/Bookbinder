import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { buildOrnamentClosedPaths } from '@/studio/classicOrnaments';
import { computeStudioCanvasSpec } from '@/studio/canvasSpec';
import { BookParametersModel } from '@/types/bookParams';
import { CLASSIC_ORNAMENT_IDS } from '@/types/coverElements';
import { BookbinderProjectModel } from '@/types/project';
import {
  SAMPLE_BOOK_PRESETS,
  SAMPLE_MARBLED_ENDPAPER_DATA_URL,
  createSampleBookProject,
} from './sampleProject';

describe('1-Click Sample Book Project Generator', () => {
  it('builds a valid US Trade Digest rigid-case project for Twenty Thousand Leagues Under the Seas', () => {
    const project = createSampleBookProject();

    expect(project.name).toBe('Twenty Thousand Leagues Under the Seas');
    expect(project.parameters.bindingStyle).toBe('rigid-case');
    expect(project.parameters.pbWidthMm).toBe(140);
    expect(project.parameters.pbHeightMm).toBe(216);
    expect(project.parameters.pbThicknessMm).toBe(24);
    expect(BookParametersModel.validate(project.parameters).isValid).toBe(true);

    // Palette & spine typography
    expect(project.studio.frontBgColor).toBe('#15283b');
    expect(project.studio.spineBgColor).toBe('#15283b');
    expect(project.studio.backBgColor).toBe('#15283b');
    expect(project.studio.spineText.title).toBe('Twenty Thousand Leagues');
    expect(project.studio.spineText.author).toBe('Jules Verne');
    expect(project.studio.spineText.layout).toBe('stacked');
    expect(project.studio.spineText.authorOrientation).toBe('horizontal');
    expect(project.studio.spineText.fontId).toBe('eb-garamond');
    expect(project.studio.spineText.textColor).toBe('#d8b467');
  });

  it('positions all front, spine, and back text layers & ornaments strictly inside their canvas board rects', () => {
    const project = createSampleBookProject();
    const geom = calculateCaseGeometry(project.parameters);
    const spec = computeStudioCanvasSpec(geom);
    const { bleedMm } = spec;

    const boardRectForZone = (zone: 'front' | 'back' | 'spine') => {
      const raw =
        zone === 'front'
          ? geom.outerWrap.frontBoardRect
          : zone === 'back'
            ? geom.outerWrap.backBoardRect
            : geom.outerWrap.spineRect;
      return {
        x: bleedMm + raw.x,
        y: bleedMm + raw.y,
        width: raw.width,
        height: raw.height,
      };
    };

    expect(project.studio.textLayers.length).toBeGreaterThanOrEqual(4);
    expect(project.studio.textLayers.some((t) => t.zone === 'front' && t.text.includes('TWENTY THOUSAND'))).toBe(true);
    expect(project.studio.textLayers.some((t) => t.zone === 'front' && t.text.includes('JULES VERNE'))).toBe(true);
    expect(project.studio.textLayers.some((t) => t.zone === 'back')).toBe(true);

    for (const layer of project.studio.textLayers) {
      const board = boardRectForZone(layer.zone);
      expect(layer.xMm).toBeGreaterThanOrEqual(board.x);
      expect(layer.xMm).toBeLessThanOrEqual(board.x + board.width);
      expect(layer.yMm).toBeGreaterThanOrEqual(board.y);
      expect(layer.yMm).toBeLessThanOrEqual(board.y + board.height);
    }

    expect(project.studio.ornaments.length).toBeGreaterThanOrEqual(3);
    for (const orn of project.studio.ornaments) {
      expect(CLASSIC_ORNAMENT_IDS).toContain(orn.presetId);
      const paths = buildOrnamentClosedPaths(orn);
      expect(paths.length).toBeGreaterThan(0);

      const board = boardRectForZone(orn.zone);
      expect(orn.xMm).toBeGreaterThanOrEqual(board.x);
      expect(orn.yMm).toBeGreaterThanOrEqual(board.y);
      expect(orn.xMm + orn.widthMm).toBeLessThanOrEqual(board.x + board.width + 0.05);
      expect(orn.yMm + orn.heightMm).toBeLessThanOrEqual(board.y + board.height + 0.05);
    }
  });

  it('includes a self-contained SVG marbled endpaper tile configured for seamless pocket rendering', () => {
    const project = createSampleBookProject();
    const { pocketStyle } = project.studio;

    expect(pocketStyle.backgroundColor).toBe('#f3ebdc');
    expect(pocketStyle.imageFitMode).toBe('tile');
    expect(pocketStyle.layers).toHaveLength(1);

    const tileLayer = pocketStyle.layers[0];
    expect(tileLayer.tiled).toBe(true);
    expect(tileLayer.dataUrl).toBe(SAMPLE_MARBLED_ENDPAPER_DATA_URL);
    expect(tileLayer.dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);

    const decodedSvg = decodeURIComponent(
      tileLayer.dataUrl.slice('data:image/svg+xml;charset=utf-8,'.length),
    );
    expect(decodedSvg).toContain('<svg');
    expect(decodedSvg).toContain('</svg>');
  });

  it('survives a full JSON serialize / deserialize round-trip without losing any data', () => {
    const original = createSampleBookProject();
    const json = BookbinderProjectModel.toJson(original);
    const parsed = BookbinderProjectModel.fromJson(json);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.project.name).toBe(original.name);
    expect(parsed.project.parameters).toEqual(original.parameters);
    expect(parsed.project.studio).toEqual(original.studio);
  });

  it('exposes SAMPLE_BOOK_PRESETS with runnable project builders', () => {
    expect(SAMPLE_BOOK_PRESETS.length).toBeGreaterThanOrEqual(1);
    for (const preset of SAMPLE_BOOK_PRESETS) {
      const built = preset.createProject();
      expect(built.name).toBe(preset.label);
      expect(built.studio.ornaments.length).toBeGreaterThan(0);
    }
  });
});
