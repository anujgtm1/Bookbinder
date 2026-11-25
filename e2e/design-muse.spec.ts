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
});
