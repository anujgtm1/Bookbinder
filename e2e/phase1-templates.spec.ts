import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

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
    await expect(page.getByTestId('cut-spine-strip')).toContainText('28.0 × 223.0 mm');

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
    expect(outerSvgContent).toContain('width="374mm"');
    expect(outerSvgContent).toContain('height="265mm"');
    expect(outerSvgContent).toContain('id="cut-lines"');
    expect(outerSvgContent).toContain('id="board-guides"');

    // 2. Outer Case Wrap Cut-Only PDF (via unified Print & Export PDF dialog)
    await page.getByTestId('download-outer-pdf-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeVisible();
    const outerPdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const outerPdfDownload = await outerPdfPromise;
    await expect(page.getByTestId('pdf-export-dialog')).toBeHidden();
    expect(outerPdfDownload.suggestedFilename()).toBe('outer_case_wrap.pdf');
    const outerPdfBuffer = await readFile((await outerPdfDownload.path())!);
    expect(outerPdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Switch to Inner Pockets & Liner tab
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('pocket-board-inset-callout')).toContainText(
      'Board glue inset: 2.5 mm top/bottom · 2.5 mm fore-edge',
    );

    // 3. Inner Pockets & Spine Liner SVG
    const innerSvgPromise = page.waitForEvent('download');
    await page.getByTestId('download-inner-svg-btn').click();
    const innerSvgDownload = await innerSvgPromise;
    expect(innerSvgDownload.suggestedFilename()).toBe('inner_pockets_and_liner.svg');
    const innerSvgContent = await readFile((await innerSvgDownload.path())!, 'utf-8');
    expect(innerSvgContent).toContain('id="glue-flaps"');
    expect(innerSvgContent).toContain('id="score-lines"');
    expect(innerSvgContent).toContain('width="50" height="50"');
    expect(innerSvgContent).toContain('Glue inset: 2.5 mm T/B · 2.5 mm fore-edge');

    // 4. Inner Pockets & Spine Liner Plain Cut PDF (via unified Print & Export PDF dialog)
    await page.getByTestId('download-inner-pdf-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeVisible();
    await expect(page.getByTestId('pdf-opt-legend')).toBeVisible();
    const innerPdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const innerPdfDownload = await innerPdfPromise;
    await expect(page.getByTestId('pdf-export-dialog')).toBeHidden();
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
    await expect(page.getByTestId('cut-spine-strip')).toContainText('36.0 × 223.0 mm');

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-json-btn').click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).toBeTruthy();

    await page.getByTestId('reset-defaults-btn').click();
    await expect(page.getByTestId('cut-spine-strip')).toContainText('28.0 × 223.0 mm');

    await page.getByTestId('import-json-input').setInputFiles(jsonPath!);
    await expect(page.getByTestId('cut-spine-strip')).toContainText('36.0 × 223.0 mm');

    // Theme toggle updates meta[name="color-scheme"]
    await page.getByTestId('theme-toggle-btn').click();
    const metaContent = await page
      .locator('meta[name="color-scheme"]')
      .getAttribute('content');
    expect(metaContent === 'dark' || metaContent === 'light').toBe(true);
  });

  test('packs L-shaped compact inner pockets + spine liner onto 1 US Letter page in PdfExportDialog (inner-styled and inner-blueprint)', async ({
    page,
  }) => {
    // 105 × 140 mm, 46 mm spine on US Letter requires L-shaped 2D packing
    // (1 horizontal pocket + 1 vertical pocket + spine liner in the L-corner) to fit on 1 page.
    await page.getByTestId('input-pb-width').fill('105');
    await page.getByTestId('input-pb-width').blur();
    await page.getByTestId('input-pb-height').fill('140');
    await page.getByTestId('input-pb-height').blur();
    await page.getByTestId('input-pb-thickness').fill('46');
    await page.getByTestId('input-pb-thickness').blur();

    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();

    const dialog = page.getByTestId('pdf-export-dialog');

    // 1. Styled Pockets PDF ('inner-styled') reports 1 page on US Letter
    await page.getByTestId('download-styled-inner-pdf-btn').click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pdf-page-option-letter')).toContainText('1 page');
    await expect(page.getByTestId('pdf-export-summary')).toContainText('1 page • US Letter');
    await page.getByTestId('pdf-export-close-btn').click();
    await expect(dialog).toBeHidden();

    // 2. Plain Cut PDF ('inner-blueprint') reports 1 page and exports a valid 1-page PDF
    await page.getByTestId('download-inner-pdf-btn').click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pdf-page-option-letter')).toContainText('1 page');
    await expect(page.getByTestId('pdf-export-summary')).toContainText('1 page • US Letter');

    const pdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const pdfDownload = await pdfPromise;
    await expect(dialog).toBeHidden();

    const pdfDoc = await PDFDocument.load(await readFile((await pdfDownload.path())!));
    expect(pdfDoc.getPageCount()).toBe(1);
  });
});
