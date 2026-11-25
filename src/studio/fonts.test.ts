import fs from 'node:fs';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';
import { CURATED_FONT_IDS, CoverStudioModel } from '@/types/studio';
import {
  CURATED_FONTS,
  FONT_GENRE_GROUPS,
  collectStudioCuratedFontIds,
  ensureCuratedFontLoaded,
  ensureCuratedFontsLoaded,
  ensureGenreFontsLoaded,
  getCuratedFont,
  getCuratedFontsByGenreGroup,
  isSupportedCustomFontFile,
  loadCustomFontFromFile,
  resolveFontCssFamily,
} from './fonts';

interface FontkitTestFont {
  readonly unitsPerEm: number;
  layout(text: string): {
    readonly glyphs: readonly {
      readonly path?: { readonly commands?: readonly unknown[] };
    }[];
  };
}

interface FontkitTestModule {
  create(bytes: Uint8Array): FontkitTestFont;
}

describe('studio font registry', () => {
  it('provides all 23 curated genre fonts with valid declarative metadata', () => {
    expect(CURATED_FONTS).toHaveLength(23);
    expect(new Set(CURATED_FONTS.map((f) => f.id))).toEqual(new Set(CURATED_FONT_IDS));

    const validGroupIds = new Set(FONT_GENRE_GROUPS.map((g) => g.id));
    const validCategories = new Set(['serif', 'sans-serif', 'display', 'script', 'blackletter']);
    const validCasingRules = new Set(['any', 'uppercase-only', 'mixed-case-only', 'swash-on-caps']);
    const validCricutFlags = new Set(['excellent', 'large-only']);

    for (const font of CURATED_FONTS) {
      expect(font.label.trim().length).toBeGreaterThan(0);
      expect(font.cssFamily.trim().length).toBeGreaterThan(0);
      expect(validCategories.has(font.category), `category for ${font.id}`).toBe(true);
      expect(validGroupIds.has(font.genreGroup), `genreGroup for ${font.id}`).toBe(true);
      expect(font.genres.length, `genres for ${font.id}`).toBeGreaterThan(0);
      expect(validCasingRules.has(font.casingRule), `casingRule for ${font.id}`).toBe(true);
      expect(validCricutFlags.has(font.cricutFriendly), `cricutFriendly for ${font.id}`).toBe(
        true,
      );
      expect(font.sampleTagline.trim().length, `sampleTagline for ${font.id}`).toBeGreaterThan(0);
      expect(font.woffUrl, `woffUrl for ${font.id}`).toContain(`${font.id}-latin-400-normal.woff`);
    }

    for (const group of FONT_GENRE_GROUPS) {
      expect(getCuratedFontsByGenreGroup(group.id).length, `group ${group.id}`).toBeGreaterThan(0);
    }

    expect(getCuratedFont('lora').category).toBe('serif');
    expect(getCuratedFont('montserrat').category).toBe('sans-serif');
    expect(getCuratedFont('cinzel-decorative').casingRule).toBe('swash-on-caps');
    expect(getCuratedFont('bebas-neue').casingRule).toBe('uppercase-only');
    expect(getCuratedFont('unifrakturmaguntia').casingRule).toBe('mixed-case-only');
    expect(getCuratedFont('great-vibes').cricutFriendly).toBe('large-only');
    expect(getCuratedFont('pinyon-script').cricutFriendly).toBe('large-only');
    expect(getCuratedFont('special-elite').cricutFriendly).toBe('large-only');
  });

  it('has an existing .woff file on disk that parses cleanly with @pdf-lib/fontkit for all 23 fonts', () => {
    const fk = fontkit as unknown as FontkitTestModule;
    const nodeModulesFontsource = path.resolve(process.cwd(), 'node_modules/@fontsource');

    for (const fontId of CURATED_FONT_IDS) {
      const woffPath = path.join(
        nodeModulesFontsource,
        fontId,
        'files',
        `${fontId}-latin-400-normal.woff`,
      );
      expect(fs.existsSync(woffPath), `missing WOFF file for ${fontId}: ${woffPath}`).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(woffPath));
      expect(bytes.byteLength, `empty WOFF bytes for ${fontId}`).toBeGreaterThan(1000);

      const parsed = fk.create(bytes);
      expect(parsed.unitsPerEm, `invalid unitsPerEm for ${fontId}`).toBeGreaterThan(0);

      const sample = getCuratedFont(fontId).casingRule === 'uppercase-only' ? 'BOOKBINDER' : 'Bookbinder';
      const run = parsed.layout(sample);
      expect(run.glyphs.length, `empty glyph run for ${fontId}`).toBeGreaterThan(0);
      const totalCommands = run.glyphs.reduce(
        (sum, glyph) => sum + (glyph.path?.commands?.length ?? 0),
        0,
      );
      expect(totalCommands, `no glyph outline commands for ${fontId}`).toBeGreaterThan(10);
    }
  });

  it('lazy-loads curated font CSS chunks with promise deduplication and collects studio fonts', async () => {
    const p1 = ensureCuratedFontLoaded('orbitron');
    const p2 = ensureCuratedFontLoaded('orbitron');
    expect(p1).toBe(p2);
    await expect(p1).resolves.toBeUndefined();

    await expect(
      ensureCuratedFontsLoaded(['eb-garamond', 'cinzel-decorative', 'custom']),
    ).resolves.toBeUndefined();
    await expect(ensureGenreFontsLoaded('art-deco')).resolves.toBeUndefined();

    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        fontId: 'poiret-one' as const,
      },
      textLayers: [
        {
          id: 'txt-1',
          text: 'Dune',
          zone: 'front' as const,
          xMm: 100,
          yMm: 80,
          fontId: 'orbitron' as const,
          fontSizePt: 24,
          letterSpacingEm: 0.08,
          lineHeight: 1.2,
          align: 'center' as const,
          color: '#f5efe2',
        },
        {
          id: 'txt-2',
          text: 'Custom',
          zone: 'front' as const,
          xMm: 100,
          yMm: 120,
          fontId: 'custom' as const,
          fontSizePt: 14,
          letterSpacingEm: 0,
          lineHeight: 1.2,
          align: 'center' as const,
          color: '#f5efe2',
        },
      ],
    };
    expect(collectStudioCuratedFontIds(studio)).toEqual(['poiret-one', 'orbitron']);
  });

  it('resolves CSS font family for curated and custom fonts', () => {
    expect(resolveFontCssFamily('eb-garamond', null)).toContain('EB Garamond');
    expect(resolveFontCssFamily('unifrakturmaguntia', null)).toContain('UnifrakturMaguntia');
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
