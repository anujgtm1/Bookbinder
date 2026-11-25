import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { contrastRatio } from '@/lib/color';
import {
  CONCRETE_DESIGN_GENRE_IDS,
  GENRE_PROFILES,
  type DesignGenreId,
} from '@/resources/generatorProfiles';
import { BookParametersModel } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { CURATED_FONT_IDS, CoverStudioModel, type CuratedFontId } from '@/types/studio';
import { CoverImageLayerModel, getLayerVisualRect } from '@/types/studioLayer';
import { computeStudioCanvasSpec } from './canvasSpec';
import {
  DEFAULT_DESIGN_GENERATOR_LOCKS,
  ensureAccessibleTextColor,
  generateBookCoverDesign,
  wrapTitleIntoBalancedLines,
} from './designGenerator';
import { getCuratedFont } from './fonts';
import { PreflightEngine } from './preflight';

const MIXED_CASE_ONLY_FONTS = new Set<string>([
  'great-vibes',
  'pinyon-script',
  'unifrakturmaguntia',
  'pirata-one',
]);

const TEXT_SAFE_SPINE_ORNAMENT_IDS = new Set<string>([
  'spine-head-tail-bands',
  'spine-classic-bands',
]);

function makeParamsAndGeometry(
  overrides: Partial<Parameters<typeof BookParametersModel.clampAndNormalize>[0]> = {},
) {
  const params = BookParametersModel.clampAndNormalize({
    ...BookParametersModel.createDefault(),
    ...overrides,
  });
  return { params, geometry: calculateCaseGeometry(params) };
}

function makeGeometry(overrides: Partial<Parameters<typeof BookParametersModel.clampAndNormalize>[0]> = {}) {
  return makeParamsAndGeometry(overrides).geometry;
}

describe('Design Muse — Rule-Based Cover & Spine Generator', () => {
  it('references all 23 curated fonts across the 8 genre profiles', () => {
    const usedFonts = new Set<CuratedFontId>();
    for (const genreId of CONCRETE_DESIGN_GENRE_IDS) {
      const profile = GENRE_PROFILES[genreId];
      expect(profile.palettes.length).toBe(5);
      for (const f of profile.titleFonts) usedFonts.add(f);
      for (const f of profile.authorFonts) usedFonts.add(f);
    }
    for (const fontId of CURATED_FONT_IDS) {
      expect(usedFonts.has(fontId), `Expected curated font ${fontId} in GENRE_PROFILES`).toBe(true);
    }
  });

  it('ensureAccessibleTextColor guarantees WCAG contrast against dark and light backgrounds', () => {
    const onDark = ensureAccessibleTextColor('#222222', '#161920', 5.5);
    expect(contrastRatio(onDark, '#161920') ?? 0).toBeGreaterThanOrEqual(5.5);

    const onLight = ensureAccessibleTextColor('#f5efe2', '#f4eee1', 5.5);
    expect(contrastRatio(onLight, '#f4eee1') ?? 0).toBeGreaterThanOrEqual(5.5);
  });

  it('wraps long multi-word titles into 2–3 balanced lines without mangling short titles', () => {
    expect(wrapTitleIntoBalancedLines('Dune')).toBe('Dune');
    const wrapped = wrapTitleIntoBalancedLines('Twenty Thousand Leagues Under the Seas');
    const lines = wrapped.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('satisfies all mathematical invariants across 120 fuzzed seeds, all 8 genres, thick & narrow spines, and Pure Foil / +Artwork', () => {
    const standardSetup = makeParamsAndGeometry({ pbThicknessMm: 32, bindingStyle: 'rigid-case' });
    const thinSetup = makeParamsAndGeometry({
      pbWidthMm: 130,
      pbHeightMm: 200,
      pbThicknessMm: 8,
      boardThicknessMm: 1.5,
      spineAllowanceMm: 1.0,
      bindingStyle: 'rigid-case',
    });
    const baseStudio = CoverStudioModel.createDefault();
    const genres: readonly DesignGenreId[] = ['surprise', ...CONCRETE_DESIGN_GENRE_IDS];

    for (let seed = 1; seed <= 120; seed++) {
      const genre = genres[seed % genres.length];
      const includeBackgroundArt = seed % 2 === 0;
      const { params, geometry } = seed % 4 === 0 ? thinSetup : standardSetup;
      const spec = computeStudioCanvasSpec(geometry);
      const maxSpinePt = CoverStudioModel.maxSpineFontSizePt(spec.spineBoardRect.width);
      const isThinSpine = spec.spineBoardRect.width < 14;

      const { studio, summary } = generateBookCoverDesign(geometry, baseStudio, {
        genre,
        seed: seed * 97 + 13,
        includeBackgroundArt,
        locks: {
          ...DEFAULT_DESIGN_GENERATOR_LOCKS,
          lockTextContent: false,
        },
      });

      if (genre !== 'surprise') {
        expect(summary.genreId).toBe(genre);
      }

      // 1. WCAG contrast checks
      const spineContrast = contrastRatio(studio.spineText.textColor, studio.spineBgColor) ?? 0;
      expect(spineContrast, `seed ${seed} spine contrast`).toBeGreaterThanOrEqual(4.5);

      for (const layer of studio.textLayers) {
        const bg =
          layer.zone === 'back'
            ? studio.backBgColor
            : layer.zone === 'spine'
              ? studio.spineBgColor
              : studio.frontBgColor;
        const minReq = layer.role === 'title' ? 4.5 : 5.5;
        const ratio = contrastRatio(layer.color, bg) ?? 0;
        expect(ratio, `seed ${seed} ${layer.role} contrast`).toBeGreaterThanOrEqual(minReq);

        // 2. Strict font casing guard
        if (layer.fontId !== 'custom') {
          const fontSpec = getCuratedFont(layer.fontId);
          if (MIXED_CASE_ONLY_FONTS.has(layer.fontId) || fontSpec.casingRule === 'mixed-case-only') {
            expect(layer.uppercase, `seed ${seed} ${layer.fontId} must never uppercase`).not.toBe(
              true,
            );
            expect(layer.letterSpacingEm, `seed ${seed} ${layer.fontId} zero tracking`).toBe(0);
          }
          if (fontSpec.casingRule === 'uppercase-only') {
            expect(layer.uppercase, `seed ${seed} ${layer.fontId} must uppercase`).toBe(true);
          }
        }

        // 3. Safe board bounds for front text layers
        if (layer.zone === 'front') {
          const bounds = CoverTextLayerModel.estimateBounds(layer);
          expect(bounds.x, `seed ${seed} front text left`).toBeGreaterThanOrEqual(
            spec.frontBoardRect.x - 0.1,
          );
          expect(bounds.x + bounds.width, `seed ${seed} front text right`).toBeLessThanOrEqual(
            spec.frontBoardRect.x + spec.frontBoardRect.width + 0.1,
          );
          expect(bounds.y, `seed ${seed} front text top`).toBeGreaterThanOrEqual(
            spec.frontBoardRect.y - 0.1,
          );
          expect(bounds.y + bounds.height, `seed ${seed} front text bottom`).toBeLessThanOrEqual(
            spec.frontBoardRect.y + spec.frontBoardRect.height + 0.1,
          );
        }
      }

      // 4. All front ornaments strictly inside frontBoardRect
      for (const orn of studio.ornaments) {
        if (orn.zone === 'front') {
          expect(orn.xMm, `seed ${seed} orn left`).toBeGreaterThanOrEqual(spec.frontBoardRect.x - 0.1);
          expect(orn.xMm + orn.widthMm, `seed ${seed} orn right`).toBeLessThanOrEqual(
            spec.frontBoardRect.x + spec.frontBoardRect.width + 0.1,
          );
          expect(orn.yMm, `seed ${seed} orn top`).toBeGreaterThanOrEqual(spec.frontBoardRect.y - 0.1);
          expect(orn.yMm + orn.heightMm, `seed ${seed} orn bottom`).toBeLessThanOrEqual(
            spec.frontBoardRect.y + spec.frontBoardRect.height + 0.1,
          );
        }
      }

      // 5. Thin-spine, editorial spine sizing, ornament clash prevention, and zero Preflight typography warnings
      expect(studio.spineText.fontSizePt, `seed ${seed} spine font <= maxPt`).toBeLessThanOrEqual(
        maxSpinePt,
      );
      expect(studio.spineText.fontSizePt, `seed ${seed} spine editorial cap`).toBeLessThanOrEqual(
        18,
      );
      const spineOrnaments = studio.ornaments.filter((o) => o.zone === 'spine');
      if (isThinSpine) {
        expect(studio.spineText.layout).toBe('inline');
        expect(studio.spineText.authorOrientation).toBe('vertical');
        expect(spineOrnaments).toHaveLength(0);
      } else {
        for (const orn of spineOrnaments) {
          expect(
            TEXT_SAFE_SPINE_ORNAMENT_IDS.has(orn.presetId),
            `seed ${seed} spine ornament ${orn.presetId} must not clash with spine text`,
          ).toBe(true);
        }
      }

      const preflight = PreflightEngine.evaluate(params, geometry, studio);
      const typographyIssues = preflight.issues.filter((i) => i.category === 'typography');
      expect(
        typographyIssues,
        `seed ${seed} (${summary.genreId}/${summary.archetypeId}) unexpected Preflight typography issues`,
      ).toEqual([]);

      // 6. Background art inclusion matches option
      if (includeBackgroundArt) {
        expect(studio.layers).toHaveLength(1);
        expect(summary.artworkId).not.toBeNull();
      } else {
        expect(studio.layers).toHaveLength(0);
        expect(summary.artworkId).toBeNull();
      }
    }
  });

  it('clips procedural background artwork strictly to frontArtworkRect on flap/glue-tab styles (dust-jacket & softcover-jacket)', () => {
    const dustJacketGeom = makeGeometry({ bindingStyle: 'dust-jacket', jacketFlapWidthMm: 75 });
    const slipJacketGeom = makeGeometry({ bindingStyle: 'softcover-jacket', jacketFlapWidthMm: 65 });
    const baseStudio = CoverStudioModel.createDefault();

    for (const geometry of [dustJacketGeom, slipJacketGeom]) {
      const spec = computeStudioCanvasSpec(geometry);
      for (let i = 0; i < 16; i++) {
        const genre = CONCRETE_DESIGN_GENRE_IDS[i % CONCRETE_DESIGN_GENRE_IDS.length];
        const { studio } = generateBookCoverDesign(geometry, baseStudio, {
          genre,
          seed: 500 + i * 31,
          includeBackgroundArt: true,
          locks: { ...DEFAULT_DESIGN_GENERATOR_LOCKS, lockTextContent: false },
        });
        expect(studio.layers).toHaveLength(1);
        const layer = studio.layers[0];
        expect(layer.clipZone).toBe('front');
        const vis = getLayerVisualRect(layer);
        expect(Math.abs(vis.x - spec.frontArtworkRect.x)).toBeLessThan(0.25);
        expect(Math.abs(vis.y - spec.frontArtworkRect.y)).toBeLessThan(0.25);
        expect(Math.abs(vis.width - spec.frontArtworkRect.width)).toBeLessThan(0.25);
        expect(Math.abs(vis.height - spec.frontArtworkRect.height)).toBeLessThan(0.25);
      }
    }
  });

  it('honors every lock toggle (lockTextContent, lockPalette, lockFonts, lockOrnaments, lockBackground) faithfully', () => {
    const geometry = makeGeometry({ pbThicknessMm: 28, bindingStyle: 'rigid-case' });
    const spec = computeStudioCanvasSpec(geometry);

    const existingTitle = CoverTextLayerModel.createPreset('front-title', spec.frontBoardRect, {
      fontId: 'playfair-display',
      color: '#f5efe2',
    });
    const existingAuthor = CoverTextLayerModel.createPreset('front-author', spec.frontBoardRect, {
      fontId: 'lora',
      color: '#f5efe2',
    });
    const existingBlurb = CoverTextLayerModel.createPreset('back-blurb', spec.backBoardRect, {
      fontId: 'lora',
      color: '#f5efe2',
    });
    const existingOrn = CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      spec.frontBoardRect,
      'front',
      '#d9b566',
    );
    const existingImg = CoverImageLayerModel.createInRect({
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      fileName: 'custom-photo.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: spec.frontArtworkRect,
      clipZone: 'front',
    });

    const seededStudio = {
      ...CoverStudioModel.createDefault(),
      frontBgColor: '#223344',
      spineBgColor: '#112233',
      backBgColor: '#334455',
      pocketStyle: {
        ...CoverStudioModel.createDefault().pocketStyle,
        backgroundColor: '#e8dfd0',
      },
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'My Custom Spine Title',
        author: 'My Custom Author',
        fontId: 'playfair-display' as const,
      },
      textLayers: [
        { ...existingTitle, text: 'The Starless Sea' },
        { ...existingAuthor, text: 'Erin Morgenstern' },
        { ...existingBlurb, text: 'A secret subterranean harbor\nfull of timeless stories.' },
      ],
      ornaments: [existingOrn],
      layers: [existingImg],
    };

    // 1. lockTextContent: true preserves all text verbatim
    const textLocked = generateBookCoverDesign(geometry, seededStudio, {
      genre: 'scifi',
      seed: 701,
      includeBackgroundArt: false,
      locks: {
        lockTextContent: true,
        lockPalette: false,
        lockFonts: false,
        lockOrnaments: false,
        lockBackground: false,
      },
    });
    expect(textLocked.studio.textLayers.find((t) => t.role === 'title')?.text).toBe(
      'The Starless Sea',
    );
    expect(textLocked.studio.textLayers.find((t) => t.role === 'author')?.text).toBe(
      'Erin Morgenstern',
    );
    expect(textLocked.studio.textLayers.find((t) => t.role === 'blurb')?.text).toBe(
      'A secret subterranean harbor\nfull of timeless stories.',
    );
    expect(textLocked.studio.spineText.title).toBe('My Custom Spine Title');
    expect(textLocked.studio.spineText.author).toBe('My Custom Author');

    // 2. lockPalette: true preserves all 4 bg colors while maintaining WCAG text contrast
    const paletteLocked = generateBookCoverDesign(geometry, seededStudio, {
      genre: 'art-deco',
      seed: 702,
      includeBackgroundArt: false,
      locks: {
        lockTextContent: false,
        lockPalette: true,
        lockFonts: false,
        lockOrnaments: false,
        lockBackground: false,
      },
    });
    expect(paletteLocked.studio.frontBgColor).toBe('#223344');
    expect(paletteLocked.studio.spineBgColor).toBe('#112233');
    expect(paletteLocked.studio.backBgColor).toBe('#334455');
    expect(paletteLocked.studio.pocketStyle.backgroundColor).toBe('#e8dfd0');
    const lockedTitle = paletteLocked.studio.textLayers.find((t) => t.role === 'title');
    expect(contrastRatio(lockedTitle?.color ?? '#000000', '#223344') ?? 0).toBeGreaterThanOrEqual(
      4.5,
    );

    // 3. lockFonts: true preserves title, author, and spine fonts verbatim
    const fontsLocked = generateBookCoverDesign(geometry, seededStudio, {
      genre: 'scifi',
      seed: 703,
      includeBackgroundArt: false,
      locks: {
        lockTextContent: true,
        lockPalette: false,
        lockFonts: true,
        lockOrnaments: false,
        lockBackground: false,
      },
    });
    expect(fontsLocked.studio.textLayers.find((t) => t.role === 'title')?.fontId).toBe(
      'playfair-display',
    );
    expect(fontsLocked.studio.textLayers.find((t) => t.role === 'author')?.fontId).toBe('lora');
    expect(fontsLocked.studio.spineText.fontId).toBe('playfair-display');

    // 4. lockOrnaments: true preserves ornaments verbatim
    const ornamentsLocked = generateBookCoverDesign(geometry, seededStudio, {
      genre: 'fantasy',
      seed: 704,
      includeBackgroundArt: false,
      locks: {
        lockTextContent: true,
        lockPalette: false,
        lockFonts: false,
        lockOrnaments: true,
        lockBackground: false,
      },
    });
    expect(ornamentsLocked.studio.ornaments).toEqual([existingOrn]);

    // 5. lockBackground: true preserves layers verbatim even with includeBackgroundArt: true or false
    const bgLockedTrue = generateBookCoverDesign(geometry, seededStudio, {
      genre: 'botanical',
      seed: 705,
      includeBackgroundArt: true,
      locks: {
        lockTextContent: true,
        lockPalette: false,
        lockFonts: false,
        lockOrnaments: false,
        lockBackground: true,
      },
    });
    expect(bgLockedTrue.studio.layers).toEqual([existingImg]);

    const bgLockedFalse = generateBookCoverDesign(geometry, seededStudio, {
      genre: 'botanical',
      seed: 706,
      includeBackgroundArt: false,
      locks: {
        lockTextContent: true,
        lockPalette: false,
        lockFonts: false,
        lockOrnaments: false,
        lockBackground: true,
      },
    });
    expect(bgLockedFalse.studio.layers).toEqual([existingImg]);
  });

  it('produces zero Preflight typography warnings across 120 fuzzed seeds with default and long locked titles/authors', () => {
    const defaultSetup = makeParamsAndGeometry();
    const compactSetup = makeParamsAndGeometry({
      pbWidthMm: 110,
      pbHeightMm: 175,
      pbThicknessMm: 22,
      boardThicknessMm: 1.5,
      bindingStyle: 'rigid-case',
    });

    const cases = [
      {
        name: 'default Grand Pavilion / Vivian Sterling',
        setup: defaultSetup,
        title: 'The Grand Pavilion',
        author: 'Vivian Sterling',
      },
      {
        name: 'extra-long title and author on compact spine',
        setup: compactSetup,
        title: 'The Extraordinary Chronicles of the Gilded Pavilion',
        author: 'Bartholomew Worthington-Sterling',
      },
    ] as const;

    const genres: readonly DesignGenreId[] = ['surprise', ...CONCRETE_DESIGN_GENRE_IDS];

    for (const testCase of cases) {
      const { params, geometry } = testCase.setup;
      const spec = computeStudioCanvasSpec(geometry);
      const seededStudio = {
        ...CoverStudioModel.createDefault(),
        spineText: {
          ...CoverStudioModel.createDefault().spineText,
          title: testCase.title,
          author: testCase.author,
        },
        textLayers: [
          {
            ...CoverTextLayerModel.createPreset('front-title', spec.frontBoardRect),
            text: testCase.title,
          },
          {
            ...CoverTextLayerModel.createPreset('front-author', spec.frontBoardRect),
            text: testCase.author,
          },
        ],
      };

      for (let seed = 1; seed <= 120; seed++) {
        const genre = genres[seed % genres.length];
        const { studio, summary } = generateBookCoverDesign(geometry, seededStudio, {
          genre,
          seed: seed * 131 + 7,
          includeBackgroundArt: seed % 2 === 0,
          locks: {
            ...DEFAULT_DESIGN_GENERATOR_LOCKS,
            lockTextContent: true,
          },
        });

        expect(studio.spineText.fontSizePt, `${testCase.name} seed ${seed}`).toBeLessThanOrEqual(
          18,
        );
        for (const orn of studio.ornaments.filter((o) => o.zone === 'spine')) {
          expect(
            TEXT_SAFE_SPINE_ORNAMENT_IDS.has(orn.presetId),
            `${testCase.name} seed ${seed} spine ornament ${orn.presetId} clashes with text`,
          ).toBe(true);
        }

        const report = PreflightEngine.evaluate(params, geometry, studio);
        const typographyIssues = report.issues.filter((i) => i.category === 'typography');
        expect(
          typographyIssues,
          `${testCase.name} seed ${seed} (${summary.genreId}) typography issues`,
        ).toEqual([]);
      }
    }
  });
});
