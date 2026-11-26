import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Atelier Shell — Left Rail, Quick Size Popover, Clean/All Controls & Make & Print Hub', () => {
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

  test('opens on Cover Studio hero in Clean Mode with collapsed sidebar, active book switcher, and More export popover', async ({
    page,
  }) => {
    // 1. Default hero room is Cover Studio with collapsed sidebar & More popover
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Bookbinder\s+Studio/);
    await expect(page.getByTestId('nav-outer')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('input-pb-width')).toBeHidden();
    await expect(page.getByTestId('studio-more-exports-btn')).toBeVisible();
    await expect(page.getByTestId('studio-export-pdf-btn')).toBeVisible();
    await expect(page.getByTestId('studio-open-cricut-btn')).toBeVisible();
    await expect(page.getByTestId('studio-shuffle-design-btn')).toBeVisible();

    // 2. Active book switcher clearly displays edited book name & switches books in My Books
    const switcher = page.getByTestId('open-my-books-btn');
    await expect(switcher).toBeVisible();
    await expect(page.getByTestId('active-book-name')).toBeVisible();

    await page.getByTestId('load-sample-book-btn').click();
    await expect(page.getByTestId('active-book-name')).toContainText(
      'Twenty Thousand Leagues Under the Seas',
    );
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');

    // Open My Books and switch back to the original book
    await switcher.click();
    const myBooksDialog = page.getByTestId('my-books-dialog');
    await expect(myBooksDialog).toBeVisible();
    const inactiveItem = myBooksDialog
      .locator('[data-testid="my-books-item"][data-active="false"]')
      .first();
    const otherId = await inactiveItem.getAttribute('data-project-id');
    expect(otherId).toBeTruthy();
    await myBooksDialog.getByTestId(`my-books-open-btn-${otherId}`).click();
    await expect(myBooksDialog).toBeHidden();
    await expect(page.getByTestId('active-book-name')).not.toContainText(
      'Twenty Thousand Leagues Under the Seas',
    );
  });

  test('updates book dimensions & binding style live via Quick Size Popover and jumps to Measure Bench', async ({
    page,
  }) => {
    const trigger = page.getByTestId('quick-size-trigger');
    await expect(trigger).toContainText('Rigid Case');
    await expect(trigger).toContainText('140.0 × 216.0 × 24.0 mm');

    // Open native popover
    await trigger.click();
    const popover = page.getByTestId('quick-size-popover');
    await expect(popover).toBeVisible();

    // Change dimensions live
    await page.getByTestId('quick-size-pb-width').fill('155');
    await page.getByTestId('quick-size-pb-width').blur();
    await expect(trigger).toContainText('155.0 × 216.0 × 24.0 mm');

    // Switch binding style to Fold-and-Glue Slip Cover -> shows pocket mode & flap slider
    await page.getByTestId('quick-size-binding-softcover-jacket').click();
    await expect(trigger).toContainText('Slip Cover');
    await expect(page.getByTestId('quick-size-pocket-mode')).toBeVisible();
    await expect(page.getByTestId('quick-size-flap-controls')).toBeVisible();
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Built-In');

    // Jump directly to Measure Bench -> closes popover & activates Measure with sidebar visible
    await page.getByTestId('quick-size-open-measure-btn').click();
    await expect(popover).toBeHidden();
    await expect(page.getByTestId('nav-measure')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();
    await expect(page.getByTestId('input-pb-width')).toHaveValue('155.0');
  });

  test('toggles top-right isolated Clean/All Controls (persisted across reload) and Dark/Light theme buttons', async ({
    page,
  }) => {
    const densityBtn = page.getByTestId('ui-density-toggle-btn');
    const themeBtn = page.getByTestId('theme-toggle-btn');

    // Both top-right buttons are static icon-only controls
    await expect(densityBtn).toHaveText('');
    await expect(themeBtn).toHaveText('');
    await expect(densityBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('input-pb-width')).toBeHidden();
    await expect(page.getByTestId('studio-more-exports-btn')).toBeVisible();

    // Switch to All Controls -> sidebar expands, Construction Settings open, inline exports appear
    await densityBtn.click();
    await expect(densityBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('input-pb-width')).toBeVisible();
    await expect(page.getByTestId('input-hinge-width')).toBeVisible();
    await expect(page.getByTestId('studio-more-exports-btn')).toHaveCount(0);
    await expect(page.getByTestId('studio-export-png-btn')).toBeVisible();

    // Reload -> All Controls preference persists from localStorage
    await page.reload();
    await expect(page.getByTestId('ui-density-toggle-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('input-pb-width')).toBeVisible();
    await expect(page.getByTestId('studio-export-png-btn')).toBeVisible();

    // Switch back to Clean Mode
    await page.getByTestId('ui-density-toggle-btn').click();
    await expect(page.getByTestId('ui-density-toggle-btn')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByTestId('input-pb-width')).toBeHidden();
    await expect(page.getByTestId('studio-more-exports-btn')).toBeVisible();

    // Toggle Dark / Light theme
    await themeBtn.click();
    const scheme = await page.locator('meta[name="color-scheme"]').getAttribute('content');
    expect(scheme === 'dark' || scheme === 'light').toBe(true);
  });

  test('navigates all Left Atelier Rail rooms with aria-current="page" and exercises Make & Print hub exports', async ({
    page,
  }) => {
    // Measure
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('nav-measure')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();
    await expect(page.getByTestId('input-pb-width')).toBeVisible();

    // Cover
    await page.getByTestId('nav-outer').click();
    await expect(page.getByTestId('nav-outer')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('cover-styler')).toBeVisible();

    // Endpapers
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('nav-pockets')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();

    // Series Spines (full-width shelf stage, no single-book sidebar)
    await page.getByTestId('nav-series').click();
    await expect(page.getByTestId('nav-series')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('series-spines-studio')).toBeVisible();
    await expect(page.getByTestId('input-pb-width')).toBeHidden();

    // Make & Print hub (full-width stage, no sidebar)
    await page.getByTestId('nav-make').click();
    await expect(page.getByTestId('nav-make')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('make-print-panel')).toBeVisible();
    await expect(page.getByTestId('input-pb-width')).toBeHidden();

    // 1. Open Print Cover PDF dialog from Make & Print
    await page.getByTestId('make-print-cover-pdf-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeVisible();
    await page.getByTestId('pdf-export-close-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeHidden();

    // 2. Open Cricut / HTV dialog from Make & Print
    await page.getByTestId('make-cricut-btn').click();
    await expect(page.getByTestId('cricut-export-dialog')).toBeVisible();
    await page.getByTestId('cricut-close-btn').click();
    await expect(page.getByTestId('cricut-export-dialog')).toBeHidden();

    // 3. Download Bench Recipe & 45° Miter Jigs PDF from Make & Print
    const benchPromise = page.waitForEvent('download');
    await page.getByTestId('make-bench-jigs-btn').click();
    const benchDownload = await benchPromise;
    expect(benchDownload.suggestedFilename()).toBe('bindery_bench_recipe_and_jigs.pdf');
    const benchBytes = await readFile((await benchDownload.path())!);
    expect(benchBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('keeps Measure and Cover nav items unclipped inside 390×844 mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const measureBtn = page.getByTestId('nav-measure');
    const coverBtn = page.getByTestId('nav-outer');
    await expect(measureBtn).toBeVisible();
    await expect(coverBtn).toBeVisible();

    const measureBox = await measureBtn.boundingBox();
    const coverBox = await coverBtn.boundingBox();
    expect(measureBox).not.toBeNull();
    expect(coverBox).not.toBeNull();

    // Zero left-edge clipping on narrow mobile viewport
    expect(measureBox!.x).toBeGreaterThanOrEqual(0);
    expect(coverBox!.x).toBeGreaterThanOrEqual(0);
    expect(measureBox!.x + measureBox!.width).toBeLessThanOrEqual(390);
    expect(coverBox!.x + coverBox!.width).toBeLessThanOrEqual(390);

    // Every room button remains reachable on mobile
    await measureBtn.click();
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();
    await page.getByTestId('nav-make').scrollIntoViewIfNeeded();
    await page.getByTestId('nav-make').click();
    await expect(page.getByTestId('make-print-panel')).toBeVisible();
  });
});
