import { describe, expect, it } from 'vitest';
import {
  FOIL_FINISHES,
  SURFACE_MATERIALS,
  getFoilFinishSpec,
  getFoilSvgGradientDef,
  getSurfaceMaterialSpec,
  getSurfaceOverlayStyle,
  isFoilFinishId,
  isSurfaceMaterialId,
  type FoilFinishId,
  type SurfaceMaterialId,
} from './materialPreview';

describe('Non-Printing Visual Material & Foil Preview definitions', () => {
  it('defines complete metadata for all 3 surface materials and 4 foil finishes', () => {
    expect(SURFACE_MATERIALS.map((m) => m.id)).toEqual([
      'matte-paper',
      'bookcloth-linen',
      'pebbled-leather',
    ]);
    for (const mat of SURFACE_MATERIALS) {
      expect(mat.label.length).toBeGreaterThan(3);
      expect(mat.shortLabel.length).toBeGreaterThan(3);
      expect(mat.description.length).toBeGreaterThan(10);
      expect(getSurfaceMaterialSpec(mat.id)).toEqual(mat);
      expect(isSurfaceMaterialId(mat.id)).toBe(true);
    }
    expect(isSurfaceMaterialId('velvet')).toBe(false);

    expect(FOIL_FINISHES.map((f) => f.id)).toEqual([
      'ink',
      'gold-foil',
      'silver-foil',
      'copper-foil',
    ]);
    for (const foil of FOIL_FINISHES) {
      expect(foil.label.length).toBeGreaterThan(3);
      expect(foil.shortLabel.length).toBeGreaterThan(3);
      expect(foil.swatchHex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(getFoilFinishSpec(foil.id)).toEqual(foil);
      expect(isFoilFinishId(foil.id)).toBe(true);
    }
    expect(isFoilFinishId('holographic')).toBe(false);
  });

  it('produces distinct non-printing procedural CSS overlays with pointerEvents: none for each material', () => {
    const ids: readonly SurfaceMaterialId[] = [
      'matte-paper',
      'bookcloth-linen',
      'pebbled-leather',
    ];
    const styles = ids.map((id) => getSurfaceOverlayStyle(id));

    for (const style of styles) {
      expect(style.pointerEvents).toBe('none');
      expect(typeof style.backgroundImage).toBe('string');
      expect((style.backgroundImage ?? '').length).toBeGreaterThan(20);
      // Avoid mixBlendMode / opacity < 1 so CSS 3D backface-visibility: hidden is never broken
      expect(style.mixBlendMode).toBeUndefined();
      expect(style.opacity).toBe(1);
    }

    // Bookcloth uses repeating-linear-gradient crosshatch; leather uses radial-gradient pebbles
    expect(styles[1].backgroundImage).toContain('repeating-linear-gradient');
    expect(styles[2].backgroundImage).toContain('radial-gradient');
    // All three textures are visually distinct
    expect(new Set(styles.map((s) => s.backgroundImage)).size).toBe(3);
  });

  it('returns null SVG gradient for flat ink and rich multi-stop metallic gradients for foil finishes', () => {
    expect(getFoilSvgGradientDef('ink')).toBeNull();

    const metallicFinishes: readonly Exclude<FoilFinishId, 'ink'>[] = [
      'gold-foil',
      'silver-foil',
      'copper-foil',
    ];
    for (const finish of metallicFinishes) {
      const def = getFoilSvgGradientDef(finish);
      expect(def).not.toBeNull();
      if (!def) continue;

      expect(def.finishId).toBe(finish);
      expect(def.angleDeg).toBe(135);
      expect(def.stops.length).toBeGreaterThanOrEqual(5);
      expect(def.stops[0].offset).toBe('0%');
      expect(def.stops[def.stops.length - 1].offset).toBe('100%');
      for (const stop of def.stops) {
        expect(stop.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
