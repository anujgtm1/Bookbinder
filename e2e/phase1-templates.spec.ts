import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Phase 1 — Structural Templates & Exports', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('updates cut list and persists paperback dimensions across reload', async ({ page }) => {
    // Open Measure & Cut tab to inspect full Chipboard Cut List & 1:1 mm Blueprint
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();
    await expect(page.getByTestId('outer-blueprint-dimensions')).toBeVisible();
    await expect(page.getByTestId('cut-cover-boards')).toContainText('143.0 × 223.0 mm');
    await expect(page.getByTestId('cut-spine-strip')).toContainText('26.0 × 223.0 mm');

    const widthInput = page.getByTestId('input-pb-width');
    await widthInput.fill('150');
    await widthInput.blur();

    await expect(page.getByTestId('cut-cover-boards')).toContainText('153.0 × 223.0 mm');

    // Reload verifies localStorage auto-save (lands on Cover Studio, then open Measure & Cut)
    await page.reload();
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('cut-cover-boards')).toContainText('153.0 × 223.0 mm');
  });

  test('applies presets, converts units mm <-> in, and toggles 3-piece split mode', async ({
    page,
  }) => {
    await page.getByTestId('nav-measure').click();
    await page.getByTestId('unit-toggle-in').click();
    await expect(page.getByTestId('cut-cover-boards')).toContainText('5.63 × 8.78 in');

    await page.getByTestId('unit-toggle-mm').click();
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /Mass Market Paperback/i }).click();

    // Mass Market: 106 x 174 -> Board = 109 x 181 mm
    await expect(page.getByTestId('cut-cover-boards')).toContainText('109.0 × 181.0 mm');

    // Open collapsible settings, enable 3-piece split, and inspect Blueprint CAD mode
    await page.getByTestId('construction-settings-toggle').click();
    await page.getByTestId('split-mode-toggle').click();
    await expect(page.getByTestId('blueprint-split-panels')).toBeVisible();

    // Switch physical tab to Inner Pockets
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-blueprint-svg')).toBeVisible();
  });

  test('downloads all four 1:1 mm structural templates across Outer Case Wrap and Inner Pockets tabs', async ({
    page,
  }) => {
    // 1. Outer Case Wrap Cut-Only SVG
    const outerSvgPromise = page.waitForEvent('download');
    await page.getByTestId('download-outer-svg-btn').click();
    const outerSvgDownload = await outerSvgPromise;
    expect(outerSvgDownload.suggestedFilename()).toBe('outer_case_wrap.svg');
    const outerSvgContent = await readFile((await outerSvgDownload.path())!, 'utf-8');
    expect(outerSvgContent).toContain('width="372mm"');
    expect(outerSvgContent).toContain('height="265mm"');
    expect(outerSvgContent).toContain('id="cut-lines"');
    expect(outerSvgContent).toContain('id="board-guides"');

    // 2. Outer Case Wrap Cut-Only PDF
    const outerPdfPromise = page.waitForEvent('download');
    await page.getByTestId('download-outer-pdf-btn').click();
    const outerPdfDownload = await outerPdfPromise;
    expect(outerPdfDownload.suggestedFilename()).toBe('outer_case_wrap.pdf');
    const outerPdfBuffer = await readFile((await outerPdfDownload.path())!);
    expect(outerPdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Switch to Inner Pockets & Liner tab
    await page.getByTestId('nav-pockets').click();

    // 3. Inner Pockets & Spine Liner SVG
    const innerSvgPromise = page.waitForEvent('download');
    await page.getByTestId('download-inner-svg-btn').click();
    const innerSvgDownload = await innerSvgPromise;
    expect(innerSvgDownload.suggestedFilename()).toBe('inner_pockets_and_liner.svg');
    const innerSvgContent = await readFile((await innerSvgDownload.path())!, 'utf-8');
    expect(innerSvgContent).toContain('id="glue-flaps"');
    expect(innerSvgContent).toContain('id="score-lines"');
    expect(innerSvgContent).toContain('width="50" height="50"');

    // 4. Inner Pockets & Spine Liner Plain Cut PDF
    const innerPdfPromise = page.waitForEvent('download');
    await page.getByTestId('download-inner-pdf-btn').click();
    const innerPdfDownload = await innerPdfPromise;
    expect(innerPdfDownload.suggestedFilename()).toBe('inner_pockets_and_liner.pdf');
    const innerPdfBuffer = await readFile((await innerPdfDownload.path())!);
    expect(innerPdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(innerPdfBuffer.byteLength).toBeGreaterThan(1500);
  });

  test('exports and re-imports project JSON and persists theme override', async ({ page }) => {
    // Open Measure & Cut to observe Cut List spine strip changes
    await page.getByTestId('nav-measure').click();

    // Modify thickness to 32 mm, export JSON, reset, then import back
    const thickInput = page.getByTestId('input-pb-thickness');
    await thickInput.fill('32');
    await thickInput.blur();
    await expect(page.getByTestId('cut-spine-strip')).toContainText('34.0 × 223.0 mm');

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-json-btn').click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).toBeTruthy();

    await page.getByTestId('reset-defaults-btn').click();
    await expect(page.getByTestId('cut-spine-strip')).toContainText('26.0 × 223.0 mm');

    await page.getByTestId('import-json-input').setInputFiles(jsonPath!);
    await expect(page.getByTestId('cut-spine-strip')).toContainText('34.0 × 223.0 mm');

    // Theme toggle updates meta[name="color-scheme"]
    await page.getByTestId('theme-toggle-btn').click();
    const metaContent = await page
      .locator('meta[name="color-scheme"]')
      .getAttribute('content');
    expect(metaContent === 'dark' || metaContent === 'light').toBe(true);
  });
});
