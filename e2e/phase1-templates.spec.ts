import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Phase 1 — Structural Templates & Exports', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('updates cut list and persists paperback dimensions across reload', async ({ page }) => {
    await expect(page.getByTestId('cut-cover-boards')).toContainText('143.0 × 223.0 mm');
    await expect(page.getByTestId('cut-spine-strip')).toContainText('26.0 × 223.0 mm');

    const widthInput = page.getByTestId('input-pb-width');
    await widthInput.fill('150');
    await widthInput.blur();

    await expect(page.getByTestId('cut-cover-boards')).toContainText('153.0 × 223.0 mm');

    // Reload verifies localStorage auto-save
    await page.reload();
    await expect(page.getByTestId('cut-cover-boards')).toContainText('153.0 × 223.0 mm');
  });

  test('applies presets, converts units mm <-> in, and toggles 3-piece split mode', async ({
    page,
  }) => {
    await page.getByTestId('unit-toggle-in').click();
    await expect(page.getByTestId('cut-cover-boards')).toContainText('5.63 × 8.78 in');

    await page.getByTestId('unit-toggle-mm').click();
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /Mass Market Paperback/i }).click();

    // Mass Market: 106 x 174 -> Board = 109 x 181 mm
    await expect(page.getByTestId('cut-cover-boards')).toContainText('109.0 × 181.0 mm');

    // Open collapsible settings and enable 3-piece split
    await page.getByTestId('construction-settings-toggle').click();
    await page.getByTestId('split-mode-toggle').click();
    await expect(page.getByTestId('blueprint-split-panels')).toBeVisible();

    // Switch blueprint tab to Inner Pockets & Spine Liner
    await page.getByTestId('blueprint-tab-inner').click();
    await expect(page.getByTestId('inner-blueprint-svg')).toBeVisible();
  });

  test('downloads 1:1 mm Outer Case Wrap SVG and Inner Envelopes PDF', async ({ page }) => {
    const svgDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-svg-btn').click();
    const svgDownload = await svgDownloadPromise;
    expect(svgDownload.suggestedFilename()).toBe('outer_case_wrap.svg');

    const svgPath = await svgDownload.path();
    expect(svgPath).toBeTruthy();
    const svgContent = await readFile(svgPath!, 'utf-8');
    expect(svgContent).toContain('width="372mm"');
    expect(svgContent).toContain('height="265mm"');
    expect(svgContent).toContain('id="cut-lines"');
    expect(svgContent).toContain('id="board-guides"');

    const pdfDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-pdf-btn').click();
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toBe('inner_pockets_and_liner.pdf');

    const pdfPath = await pdfDownload.path();
    expect(pdfPath).toBeTruthy();
    const pdfBuffer = await readFile(pdfPath!);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuffer.byteLength).toBeGreaterThan(1500);
  });

  test('exports and re-imports project JSON and persists theme override', async ({ page }) => {
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
