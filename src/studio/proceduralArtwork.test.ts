import { describe, expect, it } from 'vitest';
import {
  PROCEDURAL_ARTWORKS,
  PROCEDURAL_ARTWORK_IDS,
  type ProceduralArtworkIntensity,
} from '@/resources/proceduralArtworks';
import {
  createProceduralArtworkAsset,
  generateProceduralArtworkSvg,
  isProceduralArtworkFileName,
  resolvePatternAccentColor,
  toProceduralArtworkDataUrl,
} from './proceduralArtwork';

describe('proceduralArtwork — 9 built-in procedural cover & endpaper generators', () => {
  it('registers all 9 procedural artwork specs cleanly', () => {
    expect(PROCEDURAL_ARTWORK_IDS).toHaveLength(9);
    expect(PROCEDURAL_ARTWORKS).toHaveLength(9);
    for (const id of PROCEDURAL_ARTWORK_IDS) {
      expect(PROCEDURAL_ARTWORKS.some((spec) => spec.id === id)).toBe(true);
    }
  });

  it.each(PROCEDURAL_ARTWORK_IDS)(
    'generates deterministic, self-contained vector SVG and 300 DPI metadata for %s',
    (patternId) => {
      const sizes: readonly { readonly w: number; readonly h: number }[] = [
        { w: 22, h: 210 },
        { w: 140, h: 210 },
        { w: 340, h: 245 },
      ];
      const intensities: readonly ProceduralArtworkIntensity[] = ['subtle', 'vivid'];

      for (const { w, h } of sizes) {
        for (const intensity of intensities) {
          const opts = {
            patternId,
            widthMm: w,
            heightMm: h,
            baseColor: '#1f3a52',
            accentColor: '#e6c97a',
            seed: 421,
            intensity,
          };

          const svgA = generateProceduralArtworkSvg(opts);
          const svgB = generateProceduralArtworkSvg(opts);

          // Determinism: identical inputs yield byte-identical SVG
          expect(svgA).toBe(svgB);

          // Valid SVG root with exact viewBox in mm, valid XML (zero NaN/unescaped entities), and zero text/image/transform tags
          expect(svgA.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
          expect(svgA.endsWith('</svg>')).toBe(true);
          expect(svgA).toContain(`viewBox="0 0 ${w} ${h}"`);
          expect(svgA).not.toMatch(/\bNaN\b|\bInfinity\b/);
          expect(svgA).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/);
          expect(svgA).not.toMatch(/<text\b/i);
          expect(svgA).not.toMatch(/<image\b/i);
          expect(svgA).not.toMatch(/\btransform=/i);

          if (typeof DOMParser !== 'undefined') {
            const parsed = new DOMParser().parseFromString(svgA, 'image/svg+xml');
            expect(parsed.querySelector('parsererror')).toBeNull();
            expect(parsed.documentElement.tagName.toLowerCase()).toBe('svg');
          }

          // Valid UTF-8 SVG data URL that round-trips cleanly
          const dataUrl = toProceduralArtworkDataUrl(svgA);
          expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
          const decoded = decodeURIComponent(dataUrl.slice('data:image/svg+xml;charset=utf-8,'.length));
          expect(decoded).toBe(svgA);
        }
      }

      // Different seeds produce distinct variations
      const seed1 = generateProceduralArtworkSvg({
        patternId,
        widthMm: 140,
        heightMm: 210,
        baseColor: '#1f3a52',
        accentColor: '#e6c97a',
        seed: 101,
        intensity: 'vivid',
      });
      const seed2 = generateProceduralArtworkSvg({
        patternId,
        widthMm: 140,
        heightMm: 210,
        baseColor: '#1f3a52',
        accentColor: '#e6c97a',
        seed: 987,
        intensity: 'vivid',
      });
      expect(seed1).not.toBe(seed2);

      // 300 DPI natural dimensions & pattern filename convention
      const asset = createProceduralArtworkAsset({
        patternId,
        widthMm: 152.4,
        heightMm: 228.6,
        baseColor: '#1f3a52',
        accentColor: '#e6c97a',
        seed: 77,
        intensity: 'subtle',
      });
      expect(asset.naturalWidth).toBe(Math.round((152.4 / 25.4) * 300));
      expect(asset.naturalHeight).toBe(Math.round((228.6 / 25.4) * 300));
      expect(isProceduralArtworkFileName(asset.fileName)).toBe(true);
      expect(isProceduralArtworkFileName('cover-photo.png')).toBe(false);
    },
  );

  it('auto-adjusts low-contrast pattern accent color so patterns remain visible on light endpapers', () => {
    const adjusted = resolvePatternAccentColor('#f4eee1', '#f5efe2');
    expect(adjusted).not.toBe('#f5efe2');
    expect(adjusted).toBe('#263342');
  });
});
