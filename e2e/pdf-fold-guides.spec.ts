import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test.describe('Independent Cut/Fold Lines & External Fold Guide Ticks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('verifies Print defaults on Cover Studio PDF, Template HUD toggles on Measure & Cut (canvas + SVG + PDF), and Inner Pockets Print vs Template PDF toggles', async ({
    page,
  }) => {
    // 1. Cover Studio -> Print PDF dialog ('cover-styled'): Cut=ON, External Fold Guides=ON, Fold Lines=OFF
    await page.getByTestId('studio-export-pdf-btn').click();
    const dialog = page.getByTestId('pdf-export-dialog');
    await expect(dialog).toBeVisible();

    await expect(page.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'false');

    // Preview reflects ticks ON and interior fold lines OFF
    await expect(page.getByTestId('preview-fold-ticks')).toBeVisible();
    await expect(page.getByTestId('preview-fold-lines')).toHaveCount(0);

    // Toggle Fold Lines ON -> preview renders dashed fold lines
    await page.getByTestId('pdf-opt-fold-lines').click();
    await expect(page.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('preview-fold-lines')).toBeVisible();

    // Toggle External Fold Guides OFF -> preview hides external ticks
    await page.getByTestId('pdf-opt-fold-ticks').click();
    await expect(page.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('preview-fold-ticks')).toHaveCount(0);

    await page.getByTestId('pdf-export-close-btn').click();
    await expect(dialog).toBeHidden();

    // 2. Measure & Cut -> Blueprint HUD toggles (Cut Lines, Fold Lines, Fold Guides all ON by default)
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();

    await expect(page.getByTestId('measure-cut-lines-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('measure-fold-lines-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('measure-fold-ticks-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('blueprint-fold-lines')).toBeVisible();
    await expect(page.getByTestId('blueprint-fold-ticks')).toBeVisible();

    // Toggle Fold Lines OFF on HUD -> canvas hides dashed interior fold lines while keeping external ticks
    await page.getByTestId('measure-fold-lines-btn').click();
    await expect(page.getByTestId('measure-fold-lines-btn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('blueprint-fold-lines')).toHaveCount(0);
    await expect(page.getByTestId('blueprint-fold-ticks')).toBeVisible();

    // Cut SVG download respects the HUD toggle state (board-guides empty, cut-lines + fold-guide-ticks present)
    const svgPromise = page.waitForEvent('download');
    await page.getByTestId('measure-download-svg-btn').click();
    const svgDownload = await svgPromise;
    expect(svgDownload.suggestedFilename()).toBe('outer_case_wrap.svg');
    const svgText = await readFile((await svgDownload.path())!, 'utf-8');
    expect(svgText).toContain('<g id="cut-lines" fill="none" stroke="#FF0000"');
    expect(svgText).toContain('<g id="board-guides" />');
    expect(svgText).toContain('<g id="fold-guide-ticks" fill="none" stroke="#0066FF"');

    // Cut PDF dialog inherits Measure & Cut HUD defaults (Cut=ON, Fold Guides=ON, Fold Lines=OFF)
    await page.getByTestId('measure-download-pdf-btn').click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'false');

    const cutPdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const cutPdfDownload = await cutPdfPromise;
    await expect(dialog).toBeHidden();
    const cutPdf = await PDFDocument.load(await readFile((await cutPdfDownload.path())!));
    expect(cutPdf.getPageCount()).toBe(1);

    // 3. Inner Pockets -> compare Print ('inner-styled') vs Template ('inner-blueprint') defaults
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();

    // Styled Pockets PDF (Print defaults: Cut=ON, Fold Guides=ON, Fold Lines=OFF)
    await page.getByTestId('download-styled-inner-pdf-btn').click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('pdf-export-close-btn').click();
    await expect(dialog).toBeHidden();

    // Plain Cut PDF (Template defaults: Cut=ON, Fold Guides=ON, Fold Lines=ON)
    await page.getByTestId('download-inner-pdf-btn').click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'true');

    const plainInnerPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const plainInnerDownload = await plainInnerPromise;
    await expect(dialog).toBeHidden();
    const plainInnerPdf = await PDFDocument.load(await readFile((await plainInnerDownload.path())!));
    expect(plainInnerPdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
