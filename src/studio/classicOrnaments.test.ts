import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import {
  CLASSIC_ORNAMENT_IDS,
  CoverOrnamentLayerModel,
  rotateOrnament90,
} from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import {
  CLASSIC_ORNAMENTS,
  ORNAMENT_STYLE_FILTERS,
  buildOrnamentClosedPaths,
  buildOrnamentCompoundPath,
} from './classicOrnaments';
import { DEFAULT_CRICUT_EXPORT_OPTIONS, generateCricutHtvSvg } from './cricutExport';

describe('classicOrnaments parametric vector library', () => {
  const board = { x: 20, y: 20, width: 106, height: 150 };

  it('registers all 40 built-in ornaments with valid style tags, categories, and closed SVG contours', () => {
    expect(CLASSIC_ORNAMENTS).toHaveLength(40);
    const builtInIds = CLASSIC_ORNAMENT_IDS.filter((id) => id !== 'custom-svg');
    expect(new Set(CLASSIC_ORNAMENTS.map((o) => o.id))).toEqual(new Set(builtInIds));

    const validCategories = new Set(['frames', 'corners', 'dividers', 'emblems', 'spine']);
    const validStyles = new Set(
      ORNAMENT_STYLE_FILTERS.filter((f) => f.id !== 'all').map((f) => f.id),
    );

    for (const spec of CLASSIC_ORNAMENTS) {
      expect(validCategories.has(spec.category), `category for ${spec.id}`).toBe(true);
      expect(validStyles.has(spec.styleTag), `styleTag for ${spec.id}`).toBe(true);

      const orn = CoverOrnamentLayerModel.createForZone(spec.id, board, spec.defaultZone);
      const paths = buildOrnamentClosedPaths(orn);
      expect(paths.length, `preset ${spec.id} should produce closed contours`).toBeGreaterThan(0);

      for (const d of paths) {
        expect(d.startsWith('M '), `preset ${spec.id} path should start with M`).toBe(true);
        expect(d.endsWith(' Z'), `preset ${spec.id} path should close with Z`).toBe(true);
        expect(d).not.toContain('NaN');
      }

      const compound = buildOrnamentCompoundPath(orn, {
        originXMm: 20,
        originYMm: 20,
        canvasWidthMm: 106,
        mirrorX: true,
      });
      expect(compound.length).toBeGreaterThan(10);
      expect(compound).not.toContain('NaN');
    }
  });

  it('passes Cricut HTV SVG export hygiene (zero <text>, zero <image>, zero transform=) for all 40 ornaments', async () => {
    const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
    const frontBoard = {
      x: geometry.outerWrap.frontBoardRect.x + geometry.outerWrap.bleedMm,
      y: geometry.outerWrap.frontBoardRect.y + geometry.outerWrap.bleedMm,
      width: geometry.outerWrap.frontBoardRect.width,
      height: geometry.outerWrap.frontBoardRect.height,
    };
    const spineBoard = {
      x: geometry.outerWrap.spineRect.x + geometry.outerWrap.bleedMm,
      y: geometry.outerWrap.spineRect.y + geometry.outerWrap.bleedMm,
      width: geometry.outerWrap.spineRect.width,
      height: geometry.outerWrap.spineRect.height,
    };

    for (const spec of CLASSIC_ORNAMENTS) {
      const targetRect = spec.defaultZone === 'spine' ? spineBoard : frontBoard;
      const orn = CoverOrnamentLayerModel.createForZone(spec.id, targetRect, spec.defaultZone);
      const studio = {
        ...CoverStudioModel.createDefault(),
        ornaments: [orn],
      };

      const result = await generateCricutHtvSvg(geometry, studio, null, {
        ...DEFAULT_CRICUT_EXPORT_OPTIONS,
        scope: spec.defaultZone === 'spine' ? 'spine-only' : 'front-cover',
        includeLettering: false,
        includeOrnaments: true,
      });

      expect(result.pathCount, `Cricut pathCount for ${spec.id}`).toBeGreaterThan(0);
      expect(result.svg, `Cricut SVG <path> for ${spec.id}`).toContain('<path ');
      expect(result.svg, `Cricut SVG zero <text> for ${spec.id}`).not.toMatch(/<text\b/i);
      expect(result.svg, `Cricut SVG zero <image> for ${spec.id}`).not.toMatch(/<image\b/i);
      expect(result.svg, `Cricut SVG zero transform= for ${spec.id}`).not.toMatch(
        /\btransform\s*=/i,
      );
      expect(result.svg, `Cricut SVG zero NaN for ${spec.id}`).not.toContain('NaN');
    }
  });

  it('bakes flipX and flipY cleanly into ornament and custom SVG stamp coordinates with zero NaN', () => {
    const sprig = CoverOrnamentLayerModel.createForZone('emblem-botanical-sprig', board, 'front');
    const baseD = buildOrnamentCompoundPath(sprig);
    const flippedYD = buildOrnamentCompoundPath({ ...sprig, flipY: true });
    expect(flippedYD).not.toBe(baseD);
    expect(flippedYD).not.toContain('NaN');

    const cartouche = CoverOrnamentLayerModel.createForZone('spine-title-cartouche', board, 'spine');
    const flippedBothD = buildOrnamentCompoundPath({ ...cartouche, flipX: true, flipY: true });
    expect(flippedBothD).not.toBe(buildOrnamentCompoundPath(cartouche));
    expect(flippedBothD).not.toContain('NaN');

    const customStamp = CoverOrnamentLayerModel.createCustomSvg({
      name: 'asymmetric-arrow',
      paths: ['M 10 20 L 90 30 L 20 80 Z'],
      viewBoxWidth: 100,
      viewBoxHeight: 100,
      renderMode: 'fill',
      targetBoardRectMm: board,
      zone: 'front',
    });
    const stampBase = buildOrnamentCompoundPath(customStamp);
    const stampFlipX = buildOrnamentCompoundPath({ ...customStamp, flipX: true });
    const stampFlipY = buildOrnamentCompoundPath({ ...customStamp, flipY: true });
    expect(stampFlipX).not.toBe(stampBase);
    expect(stampFlipY).not.toBe(stampBase);
    expect(stampFlipX).not.toContain('NaN');
    expect(stampFlipY).not.toContain('NaN');
  });

  it('bakes 90°/180°/270° clockwise rotations into parametric, static, and custom SVG ornament paths with zero NaN and tight bounds', () => {
    const extractCoords = (d: string): { xs: number[]; ys: number[] } => {
      const nums = d.match(/[-+]?(?:\d*\.\d+|\d+\.?)/g)?.map(Number) ?? [];
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        xs.push(nums[i]);
        ys.push(nums[i + 1]);
      }
      return { xs, ys };
    };

    // 1. Rectangular parametric ornament (spine-title-cartouche) rotated 90° swaps bounds tightly
    const cartouche = CoverOrnamentLayerModel.createForZone('spine-title-cartouche', board, 'spine');
    const r90 = rotateOrnament90(cartouche);
    const d90 = buildOrnamentCompoundPath(r90);
    expect(d90).not.toBe(buildOrnamentCompoundPath(cartouche));
    expect(d90).not.toContain('NaN');
    expect(d90).not.toContain('transform');
    const { xs, ys } = extractCoords(d90);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(r90.xMm - 0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(r90.xMm + r90.widthMm + 0.5);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(r90.yMm - 0.5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(r90.yMm + r90.heightMm + 0.5);

    // 2. Static SVG divider rotated 90° -> 180° -> 270° -> 0°
    const divider = CoverOrnamentLayerModel.createForZone('divider-fleuron-leaf', board, 'front');
    const div90 = rotateOrnament90(divider);
    const div180 = rotateOrnament90(div90);
    const div270 = rotateOrnament90(div180);
    const div360 = rotateOrnament90(div270);
    expect(buildOrnamentCompoundPath(div90)).not.toBe(buildOrnamentCompoundPath(divider));
    expect(buildOrnamentCompoundPath(div180)).not.toBe(buildOrnamentCompoundPath(div90));
    expect(buildOrnamentCompoundPath(div270)).not.toBe(buildOrnamentCompoundPath(div180));
    expect(buildOrnamentCompoundPath(div360)).toBe(buildOrnamentCompoundPath(divider));

    // 3. Custom SVG stamp with flipX + 90° rotation + Cricut mirrorX
    const customStamp = CoverOrnamentLayerModel.createCustomSvg({
      name: 'pointer',
      paths: ['M 0 0 L 100 0 L 100 50 L 0 50 Z'],
      viewBoxWidth: 100,
      viewBoxHeight: 50,
      renderMode: 'fill',
      targetBoardRectMm: board,
      zone: 'front',
    });
    const stampRot90 = rotateOrnament90({ ...customStamp, flipX: true });
    const stampD = buildOrnamentCompoundPath(stampRot90, {
      originXMm: 20,
      originYMm: 20,
      canvasWidthMm: 106,
      mirrorX: true,
    });
    expect(stampD.startsWith('M ')).toBe(true);
    expect(stampD).not.toContain('NaN');
  });
});
