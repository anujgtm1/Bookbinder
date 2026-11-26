import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Design Muse, Genre Fonts, Foil Ornaments & Procedural Artworks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('selects genre fonts, filters foil ornaments by style, applies procedural cover & endpaper patterns, runs Design Muse with Keep Text + Undo, and exports clean Cricut HTV SVG', async ({
    page,
  }) => {
    // 1. Add a Front Title, set custom text, and select Cinzel Decorative from the grouped Font picker
    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-front-title-btn').click();
    await expect(page.getByTestId('selected-cover-text-controls')).toBeVisible();

    await page.getByTestId('cover-text-textarea').fill('The Starless Sea');
    await expect(page.getByTestId('studio-cover-text-0')).toContainText(/The Starless Sea/i);

    await page.getByTestId('cover-text-font-select').click();
    await page.getByTestId('font-option-cinzel-decorative').click();
    await expect(page.getByTestId('cover-text-font-select')).toContainText('Cinzel Decorative');
    const titleSvgText = page.getByTestId('studio-cover-text-0').locator('text').first();
    await expect(titleSvgText).toHaveAttribute('font-family', /Cinzel Decorative/);

    // Switch to Orbitron to confirm Sci-Fi genre group works as well
    await page.getByTestId('cover-text-font-select').click();
    await page.getByTestId('font-option-orbitron').click();
    await expect(page.getByTestId('cover-text-font-select')).toContainText('Orbitron');
    await expect(titleSvgText).toHaveAttribute('font-family', /Orbitron/);

    // 2. Filter ornaments by style (Fantasy & Art Deco) and place a new foil ornament
    await page.getByTestId('studio-tool-designs').click();
    await expect(page.getByTestId('ornament-style-filter-bar')).toBeVisible();

    await page.getByTestId('ornament-style-fantasy').click();
    await expect(page.getByTestId('ornament-style-fantasy')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('add-ornament-emblem-crescent-stars')).toBeVisible();
    await page.getByTestId('add-ornament-emblem-crescent-stars').click();
    await expect(page.locator('[data-testid^="studio-ornament-"]')).toHaveCount(1);

    await page.getByTestId('ornament-style-art-deco').click();
    await expect(page.getByTestId('add-ornament-frame-deco-archway')).toBeVisible();

    // 3. Apply Built-In Procedural Artworks (Suminagashi Marble & Cosmic Nebula) from Artwork tab
    await page.getByTestId('studio-tool-artwork').click();
    await expect(page.getByTestId('procedural-artwork-section')).toBeVisible();

    await page.getByTestId('procedural-pattern-suminagashi-marble').click();
    await page.getByTestId('procedural-target-front').click();
    await page.getByTestId('procedural-apply-btn').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('1 image');
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    // Switch to Cosmic Nebula (replaces existing procedural pattern on front cover cleanly)
    await page.getByTestId('procedural-pattern-cosmic-nebula').click();
    await page.getByTestId('procedural-intensity-vivid').click();
    await page.getByTestId('procedural-apply-btn').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('1 image');
    await expect(page.getByTestId('status-message')).toContainText('Cosmic Nebula');

    // 4. Run Design Muse with Art Deco + Artwork + Keep Text locked
    await page.getByTestId('studio-tool-presets').click();
    await expect(page.getByTestId('design-muse-card')).toBeVisible();

    await page.getByTestId('muse-genre-art-deco').click();
    await expect(page.getByTestId('muse-genre-art-deco')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('muse-mode-artwork').click();
    await expect(page.getByTestId('muse-mode-artwork')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('muse-lock-text')).toHaveAttribute('aria-pressed', 'true');

    // First Generate Design click
    await page.getByTestId('muse-generate-btn').click();
    await expect(page.getByTestId('muse-recipe-pill')).toContainText('Art Deco');
    await expect(page.getByTestId('studio-cover-text-0')).toContainText(/The Starless Sea/i);
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    const firstFont = await titleSvgText.getAttribute('font-family');
    const firstColor = await titleSvgText.getAttribute('fill');
    const firstRecipe = await page.getByTestId('muse-recipe-pill').textContent();

    // Second Generate Design click
    await page.getByTestId('muse-generate-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toContainText(/The Starless Sea/i);
    const secondRecipe = await page.getByTestId('muse-recipe-pill').textContent();
    const secondFont = await titleSvgText.getAttribute('font-family');
    const secondColor = await titleSvgText.getAttribute('fill');
    expect(
      secondRecipe !== firstRecipe || secondFont !== firstFont || secondColor !== firstColor,
    ).toBe(true);

    // 5. Undo via header Undo button and confirm previous generated style returns
    await expect(page.getByTestId('studio-undo-btn')).toBeEnabled();
    await page.getByTestId('studio-undo-btn').click();
    await expect(page.getByTestId('status-message')).toContainText('Undid last change');
    await expect(page.getByTestId('studio-cover-text-0')).toContainText(/The Starless Sea/i);
    await expect(titleSvgText).toHaveAttribute('font-family', firstFont ?? '');

    // 6. Export Cricut HTV SVG and assert strict vector hygiene (zero <text>, <image>, transform=)
    await page.getByTestId('studio-open-cricut-btn').click();
    await expect(page.getByTestId('cricut-export-dialog')).toBeVisible();
    await page.getByTestId('cricut-scope-front').click();

    const downloadBtn = page.getByTestId('cricut-download-btn');
    await expect(downloadBtn).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const svgContent = await readFile(filePath as string, 'utf-8');

    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('<path');
    expect(svgContent).not.toMatch(/<text\b/i);
    expect(svgContent).not.toMatch(/<image\b/i);
    expect(svgContent).not.toMatch(/\btransform=/i);

    // 7. Quick Shuffle Design button in Cover Studio header preserves custom text
    await page.getByTestId('studio-shuffle-design-btn').click();
    await expect(page.getByTestId('status-message')).toContainText('Design Muse:');
    await expect(page.getByTestId('studio-cover-text-0')).toContainText(/The Starless Sea/i);

    // 8. Built-In Endpaper Patterns strip in Inner Pockets tab works in 1 click
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('endpaper-patterns-strip')).toBeVisible();
    await page.getByTestId('endpaper-pattern-seigaiha-waves').click();
    await expect(page.getByTestId('pocket-layer-0')).toBeVisible();
    await expect(page.getByTestId('status-message')).toContainText('Seigaiha Waves');
  });

  test('applies built-in procedural cover artwork immediately on thumbnail click, stacks visibly above existing images and full-wrap patterns, and live-updates intensity and target', async ({
    page,
  }) => {
    // 1. Seed an existing uploaded image on the cover (e.g. photo / sample book cover)
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'existing-cover-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(tinyPngBase64, 'base64'),
    });
    await expect(page.getByTestId('layer-count-badge')).toContainText('1 image');
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    // 2. Default pattern intensity should be Vivid so clicked patterns are immediately bold
    await expect(page.getByTestId('procedural-intensity-vivid')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 3. Clicking a pattern thumbnail directly applies immediately on TOP of studio.layers (no Apply click needed)
    await page.getByTestId('procedural-pattern-art-deco-fans').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('2 images');
    await expect(page.getByTestId('status-message')).toContainText('Art Deco Fans (vivid)');

    const topFrontLayer = page.getByTestId('studio-layer-1');
    await expect(topFrontLayer).toBeVisible();
    const firstPatternHref = await topFrontLayer.getAttribute('href');
    expect(firstPatternHref).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    await expect(topFrontLayer.locator('..')).toHaveAttribute('clip-path', 'url(#studio-clip-front)');
    const frontBox = await topFrontLayer.boundingBox();
    expect(frontBox).not.toBeNull();
    expect((frontBox?.width ?? 0) > 20 && (frontBox?.height ?? 0) > 20).toBe(true);

    // 4. Clicking another pattern thumbnail replaces the front procedural layer live (stays on top)
    await page.getByTestId('procedural-pattern-cosmic-nebula').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('2 images');
    await expect(page.getByTestId('status-message')).toContainText('Cosmic Nebula (vivid)');
    const vividHref = await page.getByTestId('studio-layer-1').getAttribute('href');
    expect(vividHref).not.toBe(firstPatternHref);

    // 5. Toggling Subtle / Vivid live-updates the applied pattern immediately
    await page.getByTestId('procedural-intensity-subtle').click();
    await expect(page.getByTestId('status-message')).toContainText('Cosmic Nebula (subtle)');
    const subtleHref = await page.getByTestId('studio-layer-1').getAttribute('href');
    expect(subtleHref).not.toBe(vividHref);

    await page.getByTestId('procedural-intensity-vivid').click();
    await expect(page.getByTestId('status-message')).toContainText('Cosmic Nebula (vivid)');
    const vividAgainHref = await page.getByTestId('studio-layer-1').getAttribute('href');
    expect(vividAgainHref).toBe(vividHref);

    // 6. Switching target to Spine appends a visible spine pattern at the top of studio.layers
    await page.getByTestId('procedural-target-spine').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('3 images');
    const spineLayer = page.getByTestId('studio-layer-2');
    await expect(spineLayer).toBeVisible();
    await expect(spineLayer.locator('..')).toHaveAttribute('clip-path', 'url(#studio-clip-spine)');
    const spineBox = await spineLayer.boundingBox();
    expect((spineBox?.width ?? 0) > 5 && (spineBox?.height ?? 0) > 20).toBe(true);

    // 7. Switching target to Full Cover replaces prior procedural layers cleanly on top of the uploaded photo
    await page.getByTestId('procedural-target-fullWrap').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('2 images');
    const fullWrapLayer = page.getByTestId('studio-layer-1');
    await expect(fullWrapLayer.locator('..')).toHaveAttribute('clip-path', 'url(#studio-clip-none)');

    // 8. Applying Front target on top of an existing Full Cover pattern stacks Front visibly ABOVE Full Cover
    await page.getByTestId('procedural-target-front').click();
    await expect(page.getByTestId('layer-count-badge')).toContainText('3 images');
    const topFrontOverFullWrap = page.getByTestId('studio-layer-2');
    await expect(topFrontOverFullWrap.locator('..')).toHaveAttribute(
      'clip-path',
      'url(#studio-clip-front)',
    );
  });

  test('visibly transforms the spine across Design Muse generations and quick shuffles with zero Preflight warnings', async ({
    page,
  }) => {
    // Open Design Muse tab and confirm + Artwork mode is enabled by default
    await page.getByTestId('studio-tool-presets').click();
    await expect(page.getByTestId('design-muse-card')).toBeVisible();
    await expect(page.getByTestId('muse-mode-artwork')).toHaveAttribute('aria-pressed', 'true');

    // Allow sample titles/authors so spine typography is always populated on fresh canvas
    await page.getByTestId('muse-lock-text').click();
    await expect(page.getByTestId('muse-lock-text')).toHaveAttribute('aria-pressed', 'false');

    const spineFills = new Set<string>();
    const spineFonts = new Set<string>();
    const spineOrnamentSigs = new Set<string>();
    const spineArtHrefs = new Set<string>();

    const captureSpineSnapshot = async () => {
      const spineFillRect = page.getByTestId('studio-spine-fill');
      const spineFill = (await spineFillRect.getAttribute('fill')) ?? '';
      const spineX = Number((await spineFillRect.getAttribute('x')) ?? '0');
      const spineW = Number((await spineFillRect.getAttribute('width')) ?? '0');

      const spineTexts = page.locator('[data-testid="studio-spine-typography"] text');
      const spineTextCount = await spineTexts.count();
      expect(spineTextCount).toBeGreaterThan(0);
      const spineFont = (await spineTexts.first().getAttribute('font-family')) ?? '';

      const ornLocators = await page.locator('[data-testid^="studio-ornament-"]').all();
      const spineOrns: string[] = [];
      for (const ornGroup of ornLocators) {
        const hitRect = ornGroup.locator('rect').first();
        const x = Number((await hitRect.getAttribute('x')) ?? '-999');
        const w = Number((await hitRect.getAttribute('width')) ?? '0');
        const centerX = x + w / 2;
        if (centerX >= spineX && centerX <= spineX + spineW) {
          const pathEl = ornGroup.locator('path').first();
          const fill = (await pathEl.getAttribute('fill')) ?? '';
          const d = ((await pathEl.getAttribute('d')) ?? '').slice(0, 80);
          spineOrns.push(`${fill}:${d}`);
        }
      }

      const layerLocators = await page.locator('[data-testid^="studio-layer-"]').all();
      const spineArts: string[] = [];
      for (const img of layerLocators) {
        const clip = (await img.locator('..').getAttribute('clip-path')) ?? '';
        if (clip === 'url(#studio-clip-spine)' || clip === 'url(#studio-clip-none)') {
          const href = ((await img.getAttribute('href')) ?? '').slice(0, 140);
          spineArts.push(`${clip}:${href}`);
        }
      }

      expect(spineOrns.length).toBeGreaterThan(0);
      expect(spineArts.length).toBeGreaterThan(0);
      spineFills.add(spineFill);
      spineFonts.add(spineFont);
      spineOrnamentSigs.add(spineOrns.join('|'));
      spineArtHrefs.add(spineArts.join('|'));
    };

    // Run 4 Design Muse generations + 2 quick shuffles
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('muse-generate-btn').click();
      await expect(page.getByTestId('muse-recipe-pill')).toBeVisible();
      await captureSpineSnapshot();
    }
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('studio-shuffle-design-btn').click();
      await expect(page.getByTestId('status-message')).toContainText('Design Muse:');
      await captureSpineSnapshot();
    }

    // Assert every aspect of the spine visibly changed across generations
    expect(spineFills.size).toBeGreaterThanOrEqual(2);
    expect(spineFonts.size).toBeGreaterThanOrEqual(2);
    expect(spineOrnamentSigs.size).toBeGreaterThanOrEqual(2);
    expect(spineArtHrefs.size).toBeGreaterThanOrEqual(2);

    // Assert 0 Preflight warnings/errors
    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-status-badge')).toContainText('All Checks Passed');
  });
});
