import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('My Books — Local IndexedDB Project Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      const maybeIdb: unknown = 'indexedDB' in globalThis ? Reflect.get(globalThis, 'indexedDB') : null;
      if (
        !maybeIdb ||
        typeof maybeIdb !== 'object' ||
        typeof Reflect.get(maybeIdb, 'deleteDatabase') !== 'function'
      ) {
        return;
      }
      await new Promise<void>((resolve) => {
        const deleteDb = Reflect.get(maybeIdb, 'deleteDatabase') as (
          name: string,
        ) => {
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

  test('persists multiple books across reload in IndexedDB, switches cleanly, duplicates, deletes with 2-step confirm, and exports backup bundle', async ({
    page,
  }) => {
    // Enable All Controls so Book Specifications sidebar stays visible across reloads
    await page.getByTestId('ui-density-toggle-btn').click();

    // 1. Customize Book A dimensions and spine title
    await page.getByTestId('input-pb-width').fill('152');
    await page.getByTestId('input-pb-width').blur();
    await page.getByTestId('input-pb-height').fill('228');
    await page.getByTestId('input-pb-height').blur();
    await page.getByTestId('input-pb-thickness').fill('31');
    await page.getByTestId('input-pb-thickness').blur();

    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Alpha Chronicles');
    await expect(page.getByTestId('studio-spine-typography')).toContainText('Alpha Chronicles');

    // 2. Open My Books and rename Book A -> "Book Alpha"
    await page.getByTestId('open-my-books-btn').click();
    const dialog = page.getByTestId('my-books-dialog');
    await expect(dialog).toBeVisible();

    const firstItem = dialog.getByTestId('my-books-item').first();
    const alphaId = await firstItem.getAttribute('data-project-id');
    expect(alphaId).toBeTruthy();

    await dialog.getByTestId(`my-books-rename-btn-${alphaId}`).click();
    const renameInput = dialog.getByTestId('my-books-rename-input');
    await renameInput.fill('Book Alpha');
    await dialog.getByTestId('my-books-rename-save-btn').click();
    await expect(dialog.getByTestId(`my-books-name-${alphaId}`)).toHaveText('Book Alpha');

    // 3. Create Book B via + New Book, rename to "Book Beta", and customize binding style + dimensions
    await dialog.getByTestId('my-books-new-btn').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');

    // Change binding style to Fold-and-Glue Slip Cover & set distinct dimensions
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }).click();
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Built-In');

    await page.getByTestId('input-pb-width').fill('112');
    await page.getByTestId('input-pb-width').blur();
    await page.getByTestId('input-pb-height').fill('165');
    await page.getByTestId('input-pb-height').blur();
    await page.getByTestId('input-pb-thickness').fill('16');
    await page.getByTestId('input-pb-thickness').blur();

    // Open My Books and rename the active book to "Book Beta" (also flushes edits to IndexedDB)
    await page.getByTestId('open-my-books-btn').click();
    await expect(dialog).toBeVisible();

    const activeBetaItem = dialog.locator('[data-testid="my-books-item"][data-active="true"]');
    const betaId = await activeBetaItem.getAttribute('data-project-id');
    expect(betaId).toBeTruthy();
    expect(betaId).not.toBe(alphaId);

    await dialog.getByTestId(`my-books-rename-btn-${betaId}`).click();
    await dialog.getByTestId('my-books-rename-input').fill('Book Beta');
    await dialog.getByTestId('my-books-rename-save-btn').click();
    await expect(dialog.getByTestId(`my-books-name-${betaId}`)).toHaveText('Book Beta');
    await expect(dialog.getByTestId(`my-books-dims-${betaId}`)).toContainText(
      '112.0 × 165.0 × 16.0 mm',
    );

    // 4. Reload browser page and verify "Book Beta" persists from IndexedDB
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');
    await expect(page.getByTestId('input-pb-width')).toHaveValue('112.0');
    await expect(page.getByTestId('input-pb-height')).toHaveValue('165.0');
    await expect(page.getByTestId('input-pb-thickness')).toHaveValue('16.0');
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Built-In');

    // 5. Open My Books and verify both "Book Alpha" and "Book Beta" are listed
    await page.getByTestId('open-my-books-btn').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('my-books-item')).toHaveCount(2);
    await expect(dialog.getByTestId(`my-books-name-${alphaId}`)).toHaveText('Book Alpha');
    await expect(dialog.getByTestId(`my-books-name-${betaId}`)).toHaveText('Book Beta');

    // 6. Switch back to "Book Alpha" and confirm its custom dimensions & spine title are restored
    await dialog.getByTestId(`my-books-open-btn-${alphaId}`).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('input-pb-width')).toHaveValue('152.0');
    await expect(page.getByTestId('input-pb-height')).toHaveValue('228.0');
    await expect(page.getByTestId('input-pb-thickness')).toHaveValue('31.0');
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveCount(0);

    await page.getByTestId('studio-tool-spine').click();
    await expect(page.getByTestId('studio-spine-title-input')).toHaveValue('Alpha Chronicles');

    // 7. Duplicate "Book Alpha" -> verify 3 books exist -> delete duplicate via 2-step inline confirm
    await page.getByTestId('open-my-books-btn').click();
    await expect(dialog).toBeVisible();

    await dialog.getByTestId(`my-books-duplicate-btn-${alphaId}`).click();
    await expect(dialog.getByTestId('my-books-item')).toHaveCount(3);

    const copyItem = dialog
      .getByTestId('my-books-item')
      .filter({ hasText: 'Book Alpha (Copy)' });
    await expect(copyItem).toHaveCount(1);
    const copyId = await copyItem.getAttribute('data-project-id');
    expect(copyId).toBeTruthy();

    await dialog.getByTestId(`my-books-delete-btn-${copyId}`).click();
    await expect(dialog.getByTestId(`my-books-delete-confirm-${copyId}`)).toBeVisible();
    await dialog.getByTestId(`my-books-confirm-delete-btn-${copyId}`).click();

    await expect(dialog.getByTestId('my-books-item')).toHaveCount(2);
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');

    // 8. Backup All (.json) downloads a valid library bundle JSON file
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByTestId('my-books-export-all-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('bookbinder-library-backup.json');

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    if (!downloadPath) {
      throw new Error('Expected downloaded backup file path');
    }

    const rawJson = await readFile(downloadPath, 'utf-8');
    const bundle = JSON.parse(rawJson) as {
      schemaVersion: number;
      exportedAt: string;
      projects: Array<{ name: string; parameters: { pbWidthMm: number; pbHeightMm: number } }>;
    };

    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');
    expect(bundle.projects).toHaveLength(2);
    const names = bundle.projects.map((p) => p.name).sort();
    expect(names).toEqual(['Book Alpha', 'Book Beta']);
    const exportedAlpha = bundle.projects.find((p) => p.name === 'Book Alpha');
    expect(exportedAlpha?.parameters.pbWidthMm).toBe(152);
    expect(exportedAlpha?.parameters.pbHeightMm).toBe(228);
  });
});
