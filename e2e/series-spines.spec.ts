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

  test('drops panoramic image onto Series Shelf, drags & zooms artwork live on canvas, and hands off faithfully into Cover Studio', async ({
    page,
  }) => {
    await page.getByTestId('nav-series').click();
    await expect(page.getByTestId('series-spines-studio')).toBeVisible();

    const dropzone = page.getByTestId('series-shelf-dropzone');
    await expect(dropzone).toBeVisible();

    // Guides button is visible in Flat Shelf view and hidden in 2.5D Wooden Shelf view
    await expect(page.getByTestId('series-toggle-guides')).toBeVisible();
    await page.getByTestId('series-view-25d').click();
    await expect(page.getByTestId('series-toggle-guides')).toBeHidden();
    await page.getByTestId('series-view-flat').click();
    await expect(page.getByTestId('series-toggle-guides')).toBeVisible();

    // Select book #2 and customize its title so we can verify faithful handoff
    await page.getByTestId('series-roster-item-1').click();
    await page.getByTestId('series-book-title-input').fill('The Obsidian Crown');
    await expect(page.getByTestId('series-top-open-studio-btn')).toContainText(
      'Edit in Cover Studio',
    );

    // 1. Dispatch a real DataTransfer image file drop onto the Series Shelf dropzone
    const dataTransfer = await page.evaluateHandle(() => {
      const svgMarkup =
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#1e3a5f"/><stop offset="50%" stop-color="#8b4513"/><stop offset="100%" stop-color="#2b4c3f"/>' +
        '</linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/>' +
        '<circle cx="600" cy="200" r="140" fill="#e5c158"/></svg>';
      const DataTransferCtor = Reflect.get(globalThis, 'DataTransfer') as new () => {
        items: { add: (file: unknown) => void };
      };
      const FileCtor = Reflect.get(globalThis, 'File') as new (
        parts: readonly string[],
        name: string,
        opts: { readonly type: string },
      ) => unknown;
      const dt = new DataTransferCtor();
      const file = new FileCtor([svgMarkup], 'mountain-panorama.svg', { type: 'image/svg+xml' });
      dt.items.add(file);
      return dt;
    });

    await dropzone.dispatchEvent('dragover', { dataTransfer });
    await expect(page.getByTestId('series-shelf-drop-overlay')).toBeVisible();

    await dropzone.dispatchEvent('drop', { dataTransfer });
    await expect(page.getByTestId('series-shelf-drop-overlay')).toBeHidden();

    // Panoramic artwork activates and renders across all 3 spines + stage pan/zoom HUD appears
    await expect(page.getByTestId('series-pano-stage-controls')).toBeVisible();
    await expect(page.locator('[data-testid="series-flat-shelf-svg"] image')).toHaveCount(3);

    // 2. Drag panorama directly on the shelf SVG canvas and verify offsetXMm / offsetYMm update live
    const shelfSvg = page.getByTestId('series-flat-shelf-svg');
    const box = await shelfSvg.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width * 0.5;
    const startY = box!.y + box!.height * 0.45;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY - 30, { steps: 6 });
    await page.mouse.up();

    const offsetXAfterDrag = Number(await dropzone.getAttribute('data-pano-offset-x'));
    const offsetYAfterDrag = Number(await dropzone.getAttribute('data-pano-offset-y'));
    expect(offsetXAfterDrag).toBeGreaterThan(5);
    expect(offsetYAfterDrag).toBeLessThan(-2);
    // All 3 panoramic spine slices stay rendered and selected book stays Book #2 (drag did not misfire click)
    await expect(page.locator('[data-testid="series-flat-shelf-svg"] image')).toHaveCount(3);
    await expect(page.getByTestId('series-book-title-input')).toHaveValue('The Obsidian Crown');

    // Zoom in via quick stage HUD button and verify scale updates
    await page.getByTestId('series-pano-zoom-in-btn').click();
    await expect(page.getByTestId('series-pano-scale-readout')).toHaveText('110%');

    // 3. Click prominent top-bar "Edit in Cover Studio" button and verify faithful spine transfer
    await page.getByTestId('series-top-open-studio-btn').click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
    const studioSvg = page.getByTestId('studio-preview-svg');
    await expect(studioSvg).toBeVisible();

    // Exact spine title, panoramic slice layer, contrast scrim, volume badge, and bands transferred
    await expect(studioSvg).toContainText('The Obsidian Crown');
    await expect(studioSvg.locator('image[data-layer-id="series-panorama"]')).toBeVisible();
    await expect(studioSvg.locator('[data-testid="studio-layer-scrim-0"]')).toBeVisible();
    await expect(studioSvg.locator('[data-text-id="series-vol-badge"]')).toContainText('II');
    await expect(studioSvg.locator('[data-ornament-id="series-bands"]')).toBeVisible();
    await expect(studioSvg.getByTestId('studio-spine-fill')).toHaveAttribute('fill', '#1b222c');

    // Verify user can immediately tweak the opened book in Cover Studio (e.g., change spine title)
    await page.getByTestId('studio-tool-spine').click();
    const studioSpineTitle = page.getByTestId('studio-spine-title-input');
    await expect(studioSpineTitle).toHaveValue('The Obsidian Crown');
    await studioSpineTitle.fill('The Obsidian Crown — Collector Ed.');
    await expect(studioSvg).toContainText('The Obsidian Crown — Collector Ed.');

    // Round-trip: return to Series Spines, tweak the SAME linked book's spine, and re-open in Cover Studio
    await page.getByTestId('nav-series').click();
    await expect(page.getByTestId('series-spines-studio')).toBeVisible();
    await page.getByTestId('series-roster-item-1').click();
    await page.getByTestId('series-book-title-input').fill('The Obsidian Crown Revised');
    await page.getByTestId('series-top-open-studio-btn').click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
    await expect(page.getByTestId('studio-preview-svg')).toContainText('The Obsidian Crown Revised');
  });

  test('picks a genre font and built-in procedural panoramic pattern, verifies From Series badges, deletes one layer, and detaches another in Cover Studio', async ({
    page,
  }) => {
    // 1. Open Series Spines
    await page.getByTestId('nav-series').click();
    await expect(page.getByTestId('series-spines-studio')).toBeVisible();

    // 2. Style tab: pick a curated genre font from FontSelect and one of the expanded spine ornaments
    await page.getByTestId('series-tab-style').click();
    await page.getByTestId('series-font-select').click();
    await page.getByTestId('font-option-cinzel-decorative').click();
    await expect(page.getByTestId('series-font-select')).toContainText('Cinzel Decorative');

    await page.getByTestId('series-ornament-select').selectOption('spine-moon-phases');

    // 3. Panorama tab: span Built-In Procedural Panoramic Pattern (Cosmic Nebula) across all spines
    await page.getByTestId('series-tab-panorama').click();
    const patternGrid = page.getByTestId('series-procedural-panorama-grid');
    await expect(patternGrid.locator('button')).toHaveCount(9);
    await page.getByTestId('series-procedural-panorama-cosmic-nebula').click();
    await expect(page.getByTestId('series-panorama-enable-switch')).toHaveAttribute(
      'data-state',
      'checked',
    );
    await expect(page.getByTestId('series-pano-stage-controls')).toBeVisible();
    await expect(page.locator('[data-testid="series-flat-shelf-svg"] image')).toHaveCount(3);

    // 4. Edit in Cover Studio -> verify From Series badges on carried-over image, text, and ornament layers
    await page.getByTestId('series-top-open-studio-btn').click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();

    const studioSvg = page.getByTestId('studio-preview-svg');
    await expect(studioSvg).toBeVisible();

    // Artwork tab: panorama image layer carries From Series badge (both list & selection bar)
    const layerList = page.getByTestId('studio-layer-list');
    await expect(layerList).toContainText('Cosmic Nebula (Pattern).svg');
    await expect(layerList.getByTestId('layer-from-series-badge')).toHaveText('From Series');
    await page.getByTestId('layer-select-0').click();
    const selectionBar = page.getByTestId('canvas-selection-bar');
    await expect(selectionBar.getByTestId('layer-from-series-badge')).toHaveText('From Series');
    await expect(selectionBar.getByTestId('selection-detach-series-btn')).toBeVisible();

    // Designs tab: spine bands + Spine Moon Phases ornament both carry From Series badges
    await page.getByTestId('studio-tool-designs').click();
    const ornamentList = page.getByTestId('ornament-layer-list');
    await expect(ornamentList.getByTestId('layer-from-series-badge')).toHaveCount(2);

    // Text tab: volume badge carries From Series badge -> delete it individually
    await page.getByTestId('studio-tool-text').click();
    const textList = page.getByTestId('cover-text-layer-list');
    await expect(textList.getByTestId('layer-from-series-badge')).toHaveText('From Series');
    await page.getByTestId('cover-text-delete-0').click();
    await expect(page.getByTestId('cover-text-layer-list')).toBeHidden();
    await expect(studioSvg.locator('[data-text-id="series-vol-badge"]')).toHaveCount(0);

    // 5. Detach the From Series panorama image layer -> badge clears and layer remains intact
    await page.getByTestId('studio-tool-artwork').click();
    await page.getByTestId('layer-select-0').click();
    await expect(selectionBar.getByTestId('layer-from-series-badge')).toBeVisible();
    await page.getByTestId('selection-detach-series-btn').click();

    await expect(layerList.getByTestId('layer-from-series-badge')).toHaveCount(0);
    await expect(selectionBar.getByTestId('layer-from-series-badge')).toHaveCount(0);
    await expect(selectionBar.getByTestId('selection-detach-series-btn')).toHaveCount(0);
    await expect(layerList).toContainText('Cosmic Nebula (Pattern).svg');
    await expect(studioSvg.locator('image')).toHaveCount(1);

    // Verify Spine font carried over from Series Spines
    await page.getByTestId('studio-tool-spine').click();
    await expect(page.getByTestId('studio-font-select')).toContainText('Cinzel Decorative');
  });

  test('toggles differently-sized My Books onto/off the shelf inline, marks a Series Sequence with volume & author controls, renders brass shelf brackets, and preserves multi-author independence', async ({
    page,
  }) => {
    // 1. Save 2 differently-sized books into My Books
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('1');

    // Book 1: Tall Folio (152 × 236 × 32 mm)
    await page.getByTestId('input-pb-width').fill('152');
    await page.getByTestId('input-pb-width').blur();
    await page.getByTestId('input-pb-height').fill('236');
    await page.getByTestId('input-pb-height').blur();
    await page.getByTestId('input-pb-thickness').fill('32');
    await page.getByTestId('input-pb-thickness').blur();

    await page.getByTestId('open-my-books-btn').click();
    const myBooksDialog = page.getByTestId('my-books-dialog');
    await expect(myBooksDialog).toBeVisible();
    const firstId = await myBooksDialog
      .getByTestId('my-books-item')
      .first()
      .getAttribute('data-project-id');
    expect(firstId).toBeTruthy();

    await myBooksDialog.getByTestId(`my-books-rename-btn-${firstId}`).click();
    await myBooksDialog.getByTestId('my-books-rename-input').fill('Tall Folio');
    await myBooksDialog.getByTestId('my-books-rename-save-btn').click();
    await expect(myBooksDialog.getByTestId(`my-books-name-${firstId}`)).toHaveText('Tall Folio');

    // Book 2: Pocket Novella (112 × 178 × 18 mm)
    await myBooksDialog.getByTestId('my-books-new-btn').click();
    await expect(myBooksDialog).toBeHidden();
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');

    await page.getByTestId('input-pb-width').fill('112');
    await page.getByTestId('input-pb-width').blur();
    await page.getByTestId('input-pb-height').fill('178');
    await page.getByTestId('input-pb-height').blur();
    await page.getByTestId('input-pb-thickness').fill('18');
    await page.getByTestId('input-pb-thickness').blur();

    await page.getByTestId('open-my-books-btn').click();
    await expect(myBooksDialog).toBeVisible();
    const secondId = await myBooksDialog
      .locator('[data-testid="my-books-item"][data-active="true"]')
      .getAttribute('data-project-id');
    expect(secondId).toBeTruthy();
    await myBooksDialog.getByTestId(`my-books-rename-btn-${secondId}`).click();
    await myBooksDialog.getByTestId('my-books-rename-input').fill('Pocket Novella');
    await myBooksDialog.getByTestId('my-books-rename-save-btn').click();
    await expect(myBooksDialog.getByTestId(`my-books-name-${secondId}`)).toHaveText(
      'Pocket Novella',
    );
    await myBooksDialog.getByTestId('my-books-close-btn').click();
    await expect(myBooksDialog).toBeHidden();

    // 2. Open Series Spines -> verify inline My Books Library drawer shows both books
    await page.getByTestId('nav-series').click();
    await expect(page.getByTestId('series-spines-studio')).toBeVisible();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('3 books');
    await expect(page.getByTestId('series-library-count-badge')).toHaveText('0 of 2 on shelf');

    const libraryList = page.getByTestId('series-library-quick-list');
    await expect(libraryList).toContainText('Tall Folio');
    await expect(libraryList).toContainText('Pocket Novella');

    // Add both books directly onto the shelf via 1-click inline "+ Add" buttons
    await page.getByTestId('series-library-add-0').click();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('4 books');
    await expect(page.getByTestId('series-library-count-badge')).toHaveText('1 of 2 on shelf');

    await page.getByTestId('series-library-add-1').click();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('5 books');
    await expect(page.getByTestId('series-library-count-badge')).toHaveText('2 of 2 on shelf');
    // Added books retain their distinct heights (e.g., 236 mm Tall Folio vs 178 mm Pocket Novella)
    await expect(page.getByTestId('series-book-roster')).toContainText('236');
    await expect(page.getByTestId('series-book-roster')).toContainText('178');

    // Remove the first library book from the shelf inline — shelf drops to 4, My Books stays at 2
    await page.getByTestId('series-library-remove-0').click();
    await expect(page.getByTestId('series-shelf-telemetry')).toContainText('4 books');
    await expect(page.getByTestId('series-library-count-badge')).toHaveText('1 of 2 on shelf');
    await expect(page.getByTestId('my-books-count-badge')).toHaveText('2');

    // 3. Check books #1 and #2 on the shelf -> Mark Selected as Series
    await page.getByTestId('series-roster-check-0').check();
    await page.getByTestId('series-roster-check-1').check();
    await page.getByTestId('series-mark-sequence-btn').click();

    await expect(page.getByTestId('series-sequence-card-0')).toBeVisible();
    await page.getByTestId('series-sequence-name-0').fill('Obsidian Duology');
    await page.getByTestId('series-sequence-vol-style-0').selectOption('vol-arabic');
    await page.getByTestId('series-sequence-author-0').fill('R. K. Sterling');
    await page.getByTestId('series-sequence-apply-author-0').click();

    // 4. Verify brass sequence bracket renders cleanly beneath books 0..1 with Vol. 1–Vol. 2
    const bracket = page.getByTestId('series-sequence-bracket-0');
    await expect(bracket).toBeVisible();
    await expect(bracket).toHaveAttribute('data-start-index', '0');
    await expect(bracket).toHaveAttribute('data-end-index', '1');
    await expect(bracket).toContainText('Obsidian Duology (Vol. 1–Vol. 2)');

    // Grouped spines show Vol. 1 & Vol. 2; standalone book #3 beside them stays unnumbered
    await expect(page.getByTestId('series-spine-svg-0')).toContainText('Vol. 1');
    await expect(page.getByTestId('series-spine-svg-1')).toContainText('Vol. 2');
    await expect(page.getByTestId('series-spine-svg-2')).not.toContainText('Vol.');
    await expect(page.getByTestId('series-roster-item-2')).toContainText('3. The Crown of Ash');

    // 5. Edit book #2's individual author -> multi-author independence preserved
    await page.getByTestId('series-roster-item-1').click();
    await page.getByTestId('series-book-author-input').fill('M. Vance');

    await expect(page.getByTestId('series-spine-svg-0')).toContainText('Sterling');
    await expect(page.getByTestId('series-spine-svg-1')).toContainText('Vance');
    await expect(bracket).toContainText('Obsidian Duology (Vol. 1–Vol. 2)');
  });
});
