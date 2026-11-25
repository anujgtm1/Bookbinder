import { describe, expect, it } from 'vitest';
import {
  CURATED_FONTS,
  getCuratedFont,
  isSupportedCustomFontFile,
  loadCustomFontFromFile,
  resolveFontCssFamily,
} from './fonts';

describe('studio font registry', () => {
  it('provides all 23 spec-defined curated genre fonts', () => {
    expect(CURATED_FONTS).toHaveLength(23);
    expect(CURATED_FONTS.map((f) => f.label)).toEqual(
      expect.arrayContaining([
        'EB Garamond',
        'Libre Baskerville',
        'Cormorant Garamond',
        'Lora',
        'Inter',
        'Montserrat',
        'Cinzel Decorative',
        'Orbitron',
        'UnifrakturMaguntia',
        'Great Vibes',
        'Bebas Neue',
        'Poiret One',
        'Playfair Display',
      ]),
    );
    expect(getCuratedFont('lora').category).toBe('serif');
    expect(getCuratedFont('montserrat').category).toBe('sans-serif');
    expect(getCuratedFont('cinzel-decorative').casingRule).toBe('swash-on-caps');
    expect(getCuratedFont('great-vibes').cricutFriendly).toBe('large-only');
  });

  it('resolves CSS font family for curated and custom fonts', () => {
    expect(resolveFontCssFamily('eb-garamond', null)).toContain('EB Garamond');
    expect(
      resolveFontCssFamily('custom', {
        familyName: 'BookbinderCustom-MySerif',
        fileName: 'MySerif.ttf',
        bytes: new Uint8Array([1, 2, 3]),
        pdfEmbeddable: true,
      }),
    ).toContain('BookbinderCustom-MySerif');
    // Fallback when custom selected without loaded asset
    expect(resolveFontCssFamily('custom', null)).toContain('EB Garamond');
  });

  it('validates custom font extensions and loads bytes', async () => {
    expect(isSupportedCustomFontFile('Garamond.ttf')).toBe(true);
    expect(isSupportedCustomFontFile('Classic.otf')).toBe(true);
    expect(isSupportedCustomFontFile('Modern.woff2')).toBe(true);
    expect(isSupportedCustomFontFile('photo.png')).toBe(false);

    const ttfFile = new File([new Uint8Array([0, 1, 0, 0])], 'MyBook.ttf', {
      type: 'font/ttf',
    });
    const asset = await loadCustomFontFromFile(ttfFile);
    expect(asset.familyName).toBe('BookbinderCustom-MyBook');
    expect(asset.pdfEmbeddable).toBe(true);
    expect(asset.bytes.byteLength).toBe(4);

    const woff2File = new File([new Uint8Array([119, 79, 70, 50])], 'WebFont.woff2', {
      type: 'font/woff2',
    });
    const woff2Asset = await loadCustomFontFromFile(woff2File);
    expect(woff2Asset.pdfEmbeddable).toBe(false);

    const badFile = new File(['nope'], 'notes.txt', { type: 'text/plain' });
    await expect(loadCustomFontFromFile(badFile)).rejects.toThrow(/ttf/i);
  });
});
