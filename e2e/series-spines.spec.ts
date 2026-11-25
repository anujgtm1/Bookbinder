import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Series Spines — Multi-Book Series & Collection Workbench', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      const maybeIdb: unknown =
        'indexedDB' in globalThis ? Reflect.get(globalThis, 'indexedDB') : null;
      if (
        !maybeIdb ||
        typeof maybeIdb !== 'object' ||
        typeof Reflect.get(maybeIdb, 'deleteDatabase') !== 'function'
      ) {
        return;
      }
      await new Promise<void>((resolve) => {
        const deleteDb = Reflect.get(maybeIdb, 'deleteDatabase') as (name: string) => {
          onsuccess: (() => void) | null;
          onerror: (() => void) | null;
          onblocked: (() => void) | null;
        };
        const req = deleteDb.call(maybeIdb, 'bookbinder-studio-db');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('designs a multi-volume series, edits & reorders spines, switches 2.5D view, loads sample panorama, syncs with My Books, and exports HTV SVG & 1:1 Proof PDF', async ({
    page,
  }) => {
    // 1. Switch to Series Spines tab — single-book sidebar hides & default 3-volume shelf appears
    await page.getByTestId('nav-series').click();
    await expect(page.getByTestId('series-spines-studio')).toBeVisible();
    await expect(page.getByTestId('input-pb-width')).toBeHidden();
    await expect(page.getByTestId('series-flat-shelf')).toBeVisible();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('3 books');

    // 2. Switch between Flat Shelf and 2.5D Wooden Shelf views
    await page.getByTestId('series-view-25d').click();
    await expect(page.getByTestId('series-25d-shelf')).toBeVisible();
    await expect(page.getByTestId('series-25d-book-0')).toBeVisible();
    await page.getByTestId('series-25d-book-1').click();
    await expect(page.getByTestId('series-book-title-input')).toHaveValue('The Gilded Labyrinth');

    await page.getByTestId('series-view-flat').click();
    await expect(page.getByTestId('series-flat-shelf')).toBeVisible();

    // 3. Edit title & thickness, add a 4th book, and reorder books left/right
    await page.getByTestId('series-book-title-input').fill('The Brass Citadel');
    await page.getByTestId('series-book-thickness-input').fill('38');
    await expect(page.getByTestId('series-flat-shelf')).toContainText('The Brass Citadel');

    await page.getByTestId('series-add-book-btn').click();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('4 books');
    await expect(page.getByTestId('series-roster-item-3')).toContainText('Volume 4');

    // Move newly added Volume 4 left from index 3 -> index 2
    await page.getByTestId('series-move-left-btn').click();
    await expect(page.getByTestId('series-roster-item-2')).toContainText('Volume 4');

    // 4. Switch to Collection mode with varied heights, apply a curated palette & alignment bands, load Sample Panorama
    await page.getByTestId('series-template-select').selectOption('personal-collection');
    await expect(page.getByTestId('series-mode-collection')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('3 books');

    await page.getByTestId('series-tab-style').click();
    await page.getByTestId('series-palette-jewel-editions').click();
    await page.getByTestId('series-band-style-select').selectOption('double-bands');

    await page.getByTestId('series-tab-panorama').click();
    await page.getByTestId('series-load-sample-panorama-btn').click();
    await expect(page.getByTestId('series-panorama-enable-switch')).toHaveAttribute(
      'data-state',
      'checked',
    );
    await expect(page.locator('[data-testid="series-flat-shelf"] image').first()).toBeVisible();

    // 5. Save All to My Books, verify in My Books dialog, open one in Cover Studio, and import a book back
    await page.getByTestId('series-save-all-btn').click();
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('4');

    await page.getByTestId('open-my-books-btn').click();
    const myBooksDialog = page.getByTestId('my-books-dialog');
    await expect(myBooksDialog).toBeVisible();
    await expect(myBooksDialog).toContainText('The Paper Garden');
    await expect(myBooksDialog).toContainText('Twenty Thousand Leagues');
    await page.getByTestId('my-books-close-btn').click();
    await expect(myBooksDialog).toBeHidden();

    // Import an existing book from My Books onto the shelf
    await page.getByTestId('series-header-import-books-btn').click();
    const importDialog = page.getByTestId('series-import-library-dialog');
    await expect(importDialog).toBeVisible();
    await importDialog.locator('input[type="checkbox"]').first().check();
    await page.getByTestId('series-import-confirm-btn').click();
    await expect(importDialog).toBeHidden();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('4 books');

    // Open selected book directly in Cover Studio
    await page.getByTestId('series-open-cover-studio-btn').click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();

    // Return to Series Spines and export Cricut HTV Gang-Sheet SVG & 1:1 Spine Proof PDF
    await page.getByTestId('nav-series').click();
    await page.getByTestId('series-open-export-btn').click();
    const exportDialog = page.getByTestId('series-export-dialog');
    await expect(exportDialog).toBeVisible();
    await expect(page.getByTestId('series-cricut-preview-img')).toBeVisible();

    const [svgDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('series-download-cricut-btn').click(),
    ]);
    expect(svgDownload.suggestedFilename()).toMatch(/_cricut_htv_spines.*\.svg$/);
    const svgPath = await svgDownload.path();
    expect(svgPath).toBeTruthy();
    const svgContent = await readFile(svgPath!, 'utf8');
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('<path');
    expect(svgContent).not.toContain('<text');
    expect(svgContent).not.toContain('<image');
    expect(svgContent).not.toContain('transform=');

    // Re-open Export Series dialog and download 1:1 Spine Proof PDF
    await page.getByTestId('series-open-export-btn').click();
    await expect(exportDialog).toBeVisible();
    await page.getByTestId('series-export-tab-proof').click();
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('series-download-proof-btn').click(),
    ]);
    expect(pdfDownload.suggestedFilename()).toMatch(/_spine_proof_1to1\.pdf$/);
    const pdfPath = await pdfDownload.path();
    expect(pdfPath).toBeTruthy();
    const pdfBytes = await readFile(pdfPath!);
    expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
