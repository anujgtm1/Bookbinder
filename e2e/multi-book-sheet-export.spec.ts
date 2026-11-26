import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const PT_TO_MM = 25.4 / 72;

test.describe('Multi-Book Cut-Sheet Printing from My Books', () => {
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
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('1');
  });

  test('combines two saved A6 books onto one Tabloid PDF, paginates on US Letter, and warns on oversized books', async ({
    page,
  }) => {
    // Expand Book Specifications sidebar to configure multiple saved books
    await page.getByTestId('toggle-sidebar-btn').click();

    // 1. Configure Book 1: A6 Replacement Paperback Cover with spine title "Volume One"
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Replacement Paperback Cover/i }).click();
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();
    await page.getByTestId('input-pb-thickness').fill('12');
    await page.getByTestId('input-pb-thickness').blur();

    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Volume One');
    await expect(page.getByTestId('studio-spine-typography')).toContainText('Volume One');

    // Open My Books and rename Book 1 -> "Volume One"
    await page.getByTestId('open-my-books-btn').click();
    const myBooksDialog = page.getByTestId('my-books-dialog');
    await expect(myBooksDialog).toBeVisible();

    const firstBookId = await myBooksDialog
      .getByTestId('my-books-item')
      .first()
      .getAttribute('data-project-id');
    expect(firstBookId).toBeTruthy();

    await myBooksDialog.getByTestId(`my-books-rename-btn-${firstBookId}`).click();
    await myBooksDialog.getByTestId('my-books-rename-input').fill('Volume One');
    await myBooksDialog.getByTestId('my-books-rename-save-btn').click();
    await expect(myBooksDialog.getByTestId(`my-books-name-${firstBookId}`)).toHaveText(
      'Volume One',
    );

    // 2. Create a 2nd book ("Giant Volume") at default US Trade Hardcover size so we can also verify oversized warning later
    await myBooksDialog.getByTestId('my-books-new-btn').click();
    await expect(myBooksDialog).toBeHidden();
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');

    await page.getByTestId('open-my-books-btn').click();
    await expect(myBooksDialog).toBeVisible();
    const giantId = await myBooksDialog
      .locator('[data-testid="my-books-item"][data-active="true"]')
      .getAttribute('data-project-id');
    expect(giantId).toBeTruthy();
    await myBooksDialog.getByTestId(`my-books-rename-btn-${giantId}`).click();
    await myBooksDialog.getByTestId('my-books-rename-input').fill('Giant Volume');
    await myBooksDialog.getByTestId('my-books-rename-save-btn').click();
    await expect(myBooksDialog.getByTestId(`my-books-name-${giantId}`)).toHaveText('Giant Volume');

    // 3. Create Book 3: A6 Replacement Paperback Cover with spine title "Volume Two"
    await myBooksDialog.getByTestId('my-books-new-btn').click();
    await expect(myBooksDialog).toBeHidden();
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('3');

    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Replacement Paperback Cover/i }).click();
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();
    await page.getByTestId('input-pb-thickness').fill('12');
    await page.getByTestId('input-pb-thickness').blur();

    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Volume Two');
    await expect(page.getByTestId('studio-spine-typography')).toContainText('Volume Two');

    await page.getByTestId('open-my-books-btn').click();
    await expect(myBooksDialog).toBeVisible();
    const volTwoId = await myBooksDialog
      .locator('[data-testid="my-books-item"][data-active="true"]')
      .getAttribute('data-project-id');
    expect(volTwoId).toBeTruthy();

    await myBooksDialog.getByTestId(`my-books-rename-btn-${volTwoId}`).click();
    await myBooksDialog.getByTestId('my-books-rename-input').fill('Volume Two');
    await myBooksDialog.getByTestId('my-books-rename-save-btn').click();
    await expect(myBooksDialog.getByTestId(`my-books-name-${volTwoId}`)).toHaveText('Volume Two');
    await myBooksDialog.getByTestId('my-books-close-btn').click();
    await expect(myBooksDialog).toBeHidden();

    // 4. Open Print Cover PDF, select Tabloid (11 x 17"), enable Combine Multiple Covers / Multi-Up
    await page.getByTestId('studio-export-pdf-btn').click();
    const pdfDialog = page.getByTestId('pdf-export-dialog');
    await expect(pdfDialog).toBeVisible();

    await pdfDialog.getByTestId('pdf-media-option-tabloid').click();
    await expect(pdfDialog.getByTestId('pdf-sheet-nesting-section')).toBeVisible();
    await pdfDialog.getByTestId('pdf-roll-nesting-toggle').click();

    // Defaults to 2 copies since 2 A6 covers fit on 1 Tabloid sheet
    await expect(pdfDialog.getByTestId('pdf-roll-copies-input')).toHaveValue('2');

    // 5. Add "Volume One" from "Add from My Books" picker
    const volOnePickerItem = pdfDialog
      .getByTestId('pdf-my-books-picker-item')
      .filter({ hasText: 'Volume One' });
    await expect(volOnePickerItem).toBeVisible();
    await volOnePickerItem.getByTestId('pdf-add-saved-book').click();

    // Copies of Current Cover automatically switches to 1 so user gets 1x Volume Two + 1x Volume One
    await expect(pdfDialog.getByTestId('pdf-roll-copies-input')).toHaveValue('1');

    // 6. Verify live cut-sheet preview renders 2 covers on 1 sheet with both book titles
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-preview')).toBeVisible();
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-count')).toHaveText('1 sheet');
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-covers')).toHaveText('2 covers');
    const placedItems = pdfDialog.getByTestId('sheet-nest-placed-item');
    await expect(placedItems).toHaveCount(2);
    await expect(pdfDialog.getByTestId('pdf-export-sheet-preview')).toContainText('Volume Two');
    await expect(pdfDialog.getByTestId('pdf-export-sheet-preview')).toContainText('Volume One');

    // 7. Export PDF and verify valid 1-page Tabloid PDF (~279.4 x 431.8 mm)
    const downloadPromise = page.waitForEvent('download');
    await pdfDialog.getByTestId('pdf-export-confirm-btn').click();
    const download = await downloadPromise;
    await expect(pdfDialog).toBeHidden();

    expect(download.suggestedFilename()).toBe('outer_cover_print.pdf');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    if (!downloadPath) {
      throw new Error('Expected downloaded PDF path');
    }

    const pdfBytes = await readFile(downloadPath);
    expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(1);
    const { width, height } = pdfDoc.getPage(0).getSize();
    const sortedMm = [width * PT_TO_MM, height * PT_TO_MM].sort((a, b) => a - b);
    expect(Math.abs(sortedMm[0] - 279.4)).toBeLessThanOrEqual(1.0);
    expect(Math.abs(sortedMm[1] - 431.8)).toBeLessThanOrEqual(1.0);

    // 8. Re-open Print Cover PDF -> verify US Letter multi-sheet pagination (2 sheets) & oversized cover warning
    await page.getByTestId('studio-export-pdf-btn').click();
    await expect(pdfDialog).toBeVisible();
    await pdfDialog.getByTestId('pdf-media-option-letter').click();

    // Volume Two + Volume One on US Letter -> 2 sheets with working Sheet 1 / Sheet 2 switcher
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-count')).toHaveText('2 sheets');
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-pagination')).toBeVisible();
    await pdfDialog.getByTestId('pdf-sheet-nest-page-2').click();
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-page-2')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Adding oversized "Giant Volume" on US Letter triggers warning with 1-click switch to Tabloid
    const giantPickerItem = pdfDialog
      .getByTestId('pdf-my-books-picker-item')
      .filter({ hasText: 'Giant Volume' });
    await giantPickerItem.getByTestId('pdf-add-saved-book').click();
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-unplaced-warning')).toContainText(
      'Giant Volume',
    );
    await pdfDialog.getByTestId('pdf-sheet-nest-switch-tabloid').click();
    await expect(pdfDialog.getByTestId('pdf-media-option-tabloid')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(pdfDialog.getByTestId('pdf-sheet-nest-unplaced-warning')).toHaveCount(0);
  });
});
