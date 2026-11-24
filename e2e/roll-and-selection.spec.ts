import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const PT_TO_MM = 25.4 / 72;

test.describe('Contextual Selection Bar, Custom Roll Multi-Up Nesting & Printer Margins', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('renders contextual CanvasSelectionBar for frame margin presets vs. thirds alignment, static 90° rotate, foil swatches, and stays interactive in Full Screen 2D', async ({
    page,
  }) => {
    // 1. Load Sample Book ("Twenty Thousand Leagues Under the Seas")
    await page.getByTestId('load-sample-book-btn').click();
    await expect(page.getByTestId('status-message')).toContainText(
      'Twenty Thousand Leagues Under the Seas',
    );
    await expect(page.getByTestId('studio-ornament-0')).toBeVisible();
    await expect(page.getByTestId('studio-cover-text-0')).toBeVisible();

    const selectionBar = page.getByTestId('canvas-selection-bar');
    await expect(selectionBar).toHaveCount(0);

    // 2. Click the front double-rule frame ornament near its unobstructed top-left corner
    const frameOrnament = page.getByTestId('studio-ornament-0');
    await frameOrnament.click({ position: { x: 8, y: 8 } });

    await expect(selectionBar).toBeVisible();
    await expect(selectionBar).toHaveAttribute('data-selection-kind', 'ornament');
    await expect(page.getByTestId('selection-element-badge')).toContainText('Ornament');

    // Contextual Frame Margin Fit group is shown; vertical Thirds buttons are omitted
    await expect(page.getByTestId('selection-margin-6')).toBeVisible();
    await expect(page.getByTestId('selection-margin-12')).toBeVisible();
    await expect(page.getByTestId('selection-margin-18')).toBeVisible();
    await expect(page.getByTestId('selection-align-center')).toBeVisible();
    await expect(page.getByTestId('selection-align-upper')).toHaveCount(0);
    await expect(page.getByTestId('selection-align-lower')).toHaveCount(0);

    // Apply tight 6 mm vs wide 18 mm board margin presets without losing selection
    const frameHitRect = frameOrnament.locator('rect').first();
    await page.getByTestId('selection-margin-6').click();
    await expect(selectionBar).toBeVisible();
    await expect(selectionBar).toHaveAttribute('data-selection-kind', 'ornament');

    const box6 = {
      x: Number(await frameHitRect.getAttribute('x')),
      y: Number(await frameHitRect.getAttribute('y')),
      w: Number(await frameHitRect.getAttribute('width')),
      h: Number(await frameHitRect.getAttribute('height')),
    };

    await page.getByTestId('selection-margin-18').click();
    await expect(selectionBar).toBeVisible();
    await expect(selectionBar).toHaveAttribute('data-selection-kind', 'ornament');

    const box18 = {
      x: Number(await frameHitRect.getAttribute('x')),
      y: Number(await frameHitRect.getAttribute('y')),
      w: Number(await frameHitRect.getAttribute('width')),
      h: Number(await frameHitRect.getAttribute('height')),
    };

    // 18 mm inset shrinks width & height by 24 mm (12 mm per side) and shifts center-preserving origin by +12 mm
    expect(box6.w - box18.w).toBeCloseTo(24, 1);
    expect(box6.h - box18.h).toBeCloseTo(24, 1);
    expect(box18.x - box6.x).toBeCloseTo(12, 1);
    expect(box18.y - box6.y).toBeCloseTo(12, 1);

    // Apply Silver Foil swatch from the selection bar to the frame ornament
    await page.getByTestId('selection-swatch-d4d8de').click();
    await expect(page.getByTestId('selection-color-input')).toHaveValue('#d4d8de');
    await expect(frameOrnament.locator('path')).toHaveAttribute('fill', '#d4d8de');

    // 3. Click a cover text element -> selection bar switches contextually to Top ⅓ / Center / Bottom ⅓
    const coverTitle = page.getByTestId('studio-cover-text-0');
    await coverTitle.click();

    await expect(selectionBar).toBeVisible();
    await expect(selectionBar).toHaveAttribute('data-selection-kind', 'text');
    await expect(page.getByTestId('selection-align-upper')).toBeVisible();
    await expect(page.getByTestId('selection-align-center')).toBeVisible();
    await expect(page.getByTestId('selection-align-lower')).toBeVisible();
    await expect(page.getByTestId('selection-margin-6')).toHaveCount(0);
    await expect(page.getByTestId('selection-margin-12')).toHaveCount(0);
    await expect(page.getByTestId('selection-margin-18')).toHaveCount(0);

    // Align Top ⅓ vs Bottom ⅓ moves the text cleanly down the front board
    const titleTextNode = coverTitle.locator('text').first();
    await page.getByTestId('selection-align-upper').click();
    const upperY = Number(await titleTextNode.getAttribute('y'));
    await page.getByTestId('selection-align-lower').click();
    const lowerY = Number(await titleTextNode.getAttribute('y'));
    expect(lowerY).toBeGreaterThan(upperY + 40);

    // Foil swatch updates text fill color cleanly
    await page.getByTestId('selection-swatch-d48b6a').click();
    await expect(page.getByTestId('selection-color-input')).toHaveValue('#d48b6a');
    await expect(titleTextNode).toHaveAttribute('fill', '#d48b6a');

    // Flip H & Flip V toggles update aria-pressed and SVG transform
    const flipHBtn = page.getByTestId('selection-flip-h');
    const flipVBtn = page.getByTestId('selection-flip-v');
    await expect(flipHBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(flipVBtn).toHaveAttribute('aria-pressed', 'false');

    await flipHBtn.click();
    await expect(flipHBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(coverTitle).toHaveAttribute('transform', /scale\(-1 1\)/);

    await flipVBtn.click();
    await expect(flipVBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(coverTitle).toHaveAttribute('transform', /scale\(-1 -1\)/);

    // Static 90° Rotate button keeps fixed "90°" label while data-rotation & SVG transform increment
    const rotateBtn = page.getByTestId('selection-rotate-90');
    await expect(rotateBtn).toHaveText('90°');
    await expect(rotateBtn).toHaveAttribute('data-rotation', '0');

    await rotateBtn.click();
    await expect(rotateBtn).toHaveText('90°');
    await expect(rotateBtn).toHaveAttribute('data-rotation', '90');
    await expect(coverTitle).toHaveAttribute('transform', /rotate\(90\)/);

    await rotateBtn.click();
    await expect(rotateBtn).toHaveText('90°');
    await expect(rotateBtn).toHaveAttribute('data-rotation', '180');
    await expect(coverTitle).toHaveAttribute('transform', /rotate\(180\)/);

    // 4. Full Screen 2D mode: selection bar remains visible & interactive, Escape exits cleanly
    const stage = page.getByTestId('studio-canvas-stage');
    await expect(stage).toHaveAttribute('data-expanded', 'false');

    await page.getByTestId('studio-fullscreen-btn').click();
    await expect(stage).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByTestId('studio-exit-fullscreen-btn')).toBeVisible();
    await expect(selectionBar).toBeVisible();

    // Rotate once more inside Full Screen 2D mode to confirm full interactivity
    await rotateBtn.click();
    await expect(rotateBtn).toHaveText('90°');
    await expect(rotateBtn).toHaveAttribute('data-rotation', '270');
    await expect(coverTitle).toHaveAttribute('transform', /rotate\(270\)/);

    // Press Escape -> exits Full Screen cleanly while keeping selection bar visible
    await page.keyboard.press('Escape');
    await expect(stage).toHaveAttribute('data-expanded', 'false');
    await expect(page.getByTestId('studio-exit-fullscreen-btn')).toBeHidden();
    await expect(selectionBar).toBeVisible();
  });

  test('supports Custom Roll Width with Wide-Format Roll Multi-Up Nesting preview and exports exact 36" roll PDF', async ({
    page,
  }) => {
    // Open unified Print PDF dialog from Cover Studio
    await page.getByTestId('studio-export-pdf-btn').click();
    const pdfDialog = page.getByTestId('pdf-export-dialog');
    await expect(pdfDialog).toBeVisible();

    // Select Custom Roll Width… -> width input & roll nesting panel appear
    await page.getByTestId('pdf-export-roll-select').selectOption('roll-custom');
    const customWidthInput = page.getByTestId('pdf-custom-roll-width-input');
    await expect(customWidthInput).toBeVisible();
    await expect(page.getByTestId('pdf-roll-nesting-section')).toBeVisible();

    // Verify live capacity updates for 610 mm (2 across) and 914.4 mm (36" roll)
    await customWidthInput.fill('610');
    await expect(page.getByTestId('pdf-roll-capacity-badge')).toContainText(/Fits 2 across/i);

    await customWidthInput.fill('914.4');
    await customWidthInput.blur();
    await expect(page.getByTestId('pdf-roll-capacity-badge')).toContainText(
      /Fits [23] across on 914 mm roll/i,
    );

    // Enable Multi-Up / Roll Strip nesting -> live strip preview renders multiple placed items
    await page.getByTestId('pdf-roll-nesting-toggle').click();
    await expect(page.getByTestId('pdf-roll-strip-preview')).toBeVisible();
    const placedItems = page.getByTestId('roll-nest-placed-item');
    await expect(placedItems).toHaveCount(2);

    // Confirm export -> verify outer_cover_print.pdf downloads with exact 36" (~914.4 mm) page width
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const download = await downloadPromise;
    await expect(pdfDialog).toBeHidden();

    expect(download.suggestedFilename()).toBe('outer_cover_print.pdf');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const pdfBytes = await readFile(downloadPath!);
    expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(1);
    const { width, height } = pdfDoc.getPage(0).getSize();
    const widthMm = width * PT_TO_MM;
    const heightMm = height * PT_TO_MM;
    expect(widthMm).toBeCloseTo(914.4, 0);
    expect(heightMm).toBeGreaterThan(250);
  });

  test('applies asymmetric Fine-Art printer margins on US Letter preview and downloads 1-click Margin Calibration Sheet PDF', async ({
    page,
  }) => {
    // Select A6 Pocket Notebook so the cover fits US Letter cleanly even with a 20 mm bottom gripper margin
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();

    // Open Print PDF dialog and choose US Letter
    await page.getByTestId('studio-export-pdf-btn').click();
    const pdfDialog = page.getByTestId('pdf-export-dialog');
    await expect(pdfDialog).toBeVisible();

    await page.getByTestId('pdf-media-option-letter').click();
    await expect(page.getByTestId('pdf-media-option-letter')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Expand Printer Margins & Calibration section
    const marginsToggle = page.getByTestId('pdf-margins-toggle');
    await expect(marginsToggle).toHaveAttribute('aria-expanded', 'false');
    await marginsToggle.click();
    await expect(marginsToggle).toHaveAttribute('aria-expanded', 'true');

    // Select Fine-Art / Heavy Sheet preset (Top 5 · Bottom 20 · Sides 5 mm)
    await page.getByTestId('pdf-margins-preset-select').selectOption('fine-art-sheet');
    await expect(page.getByTestId('pdf-margin-top')).toHaveValue('5');
    await expect(page.getByTestId('pdf-margin-bottom')).toHaveValue('20');
    await expect(page.getByTestId('pdf-margin-left')).toHaveValue('5');
    await expect(page.getByTestId('pdf-margin-right')).toHaveValue('5');

    // Verify hatched unprintable margin dead-zone strips render in the live US Letter sheet preview
    const unprintableMargins = page.getByTestId('preview-unprintable-margin');
    await expect(unprintableMargins.first()).toBeVisible();
    await expect(unprintableMargins.first().locator('rect[height="20"]')).toHaveCount(1);

    // Download 1-click Printable Margin Calibration Sheet PDF and validate bytes + US Letter page size
    const testSheetPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-margin-test-sheet-btn').click();
    const testSheetDownload = await testSheetPromise;

    expect(testSheetDownload.suggestedFilename()).toBe('printer_margin_calibration_sheet.pdf');
    const testSheetPath = await testSheetDownload.path();
    expect(testSheetPath).toBeTruthy();

    const pdfBytes = await readFile(testSheetPath!);
    expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBytes.byteLength).toBeGreaterThan(1000);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(1);
    const { width, height } = pdfDoc.getPage(0).getSize();
    const dimsMm = [width * PT_TO_MM, height * PT_TO_MM].sort((a, b) => a - b);
    expect(dimsMm[0]).toBeCloseTo(215.9, 0);
    expect(dimsMm[1]).toBeCloseTo(279.4, 0);
  });
});
