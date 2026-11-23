import { describe, expect, it } from 'vitest';
import { CoverOrnamentLayerModel } from '@/types/coverElements';
import {
  CLASSIC_ORNAMENTS,
  buildOrnamentClosedPaths,
  buildOrnamentCompoundPath,
} from './classicOrnaments';

describe('classicOrnaments parametric vector library', () => {
  const board = { x: 20, y: 20, width: 106, height: 150 };

  it('generates valid closed SVG contours (M ... Z) for every classic bookbindery ornament', () => {
    expect(CLASSIC_ORNAMENTS.length).toBeGreaterThanOrEqual(12);

    for (const spec of CLASSIC_ORNAMENTS) {
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
});
