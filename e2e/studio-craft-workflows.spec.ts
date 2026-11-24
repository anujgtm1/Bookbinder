import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test.describe('Studio Craft Workflows — Sample Book, Undo/Duplicate, Endpapers, Slipcase & Bench Jigs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('loads 1-click Sample Book, previews Bookcloth & Gold Foil in 2D/3D, and reveals marbled endpapers when opening 3D cover', async ({
    page,
  }) => {
    // 1. Load Sample Book project
    await page.getByTestId('load-sample-book-btn').click();
    await expect(page.getByTestId('status-message')).toContainText(
      'Twenty Thousand Leagues Under the Seas',
    );

    // Verify richly populated cover text & ornaments render on the 2D canvas
    await expect(page.locator('[data-testid^="studio-cover-text-"]')).toHaveCount(4);
    await expect(page.locator('[data-testid^="studio-ornament-"]')).toHaveCount(4);
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('TWENTY THOUSAND');

    // 2. Toggle Bookcloth material preview in 2D
    await expect(page.getByTestId('cover2d-material-overlay')).toHaveCount(0);
    await page.getByTestId('material-bookcloth-linen').click();
    await expect(page.getByTestId('material-bookcloth-linen')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('cover2d-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );

    // 3. Switch to 3D Book view and enable Gold Foil alongside Bookcloth
    await page.getByTestId('studio-view-3d-btn').click();
    await expect(page.getByTestId('book3d-stage')).toBeVisible();
    await expect(page.getByTestId('material-bookcloth-linen')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('foil-gold-foil').click();
    await expect(page.getByTestId('foil-gold-foil')).toHaveAttribute('aria-pressed', 'true');

    // Verify 3D material overlays & metallic gold foil gradients render cleanly
    await expect(page.getByTestId('book3d-stage')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    await expect(page.getByTestId('book3d-stage')).toHaveAttribute(
      'data-foil-finish',
      'gold-foil',
    );
    await expect(page.getByTestId('book3d-front-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    await expect(page.getByTestId('book3d-back-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    await expect(page.getByTestId('book3d-spine-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    await expect(page.getByTestId('book3d-foil-gradient-front')).toHaveAttribute(
      'data-foil-finish',
      'gold-foil',
    );
    await expect(page.getByTestId('book3d-foil-gradient-spine')).toHaveAttribute(
      'data-foil-finish',
      'gold-foil',
    );

    // 4. Swing open the 3D front cover and verify marbled endpapers + title page appear
    const openCoverBtn = page.getByTestId('book3d-open-cover-btn');
    await expect(openCoverBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('book3d-front-hinge')).toHaveAttribute('data-open', 'false');

    await openCoverBtn.click();
    await expect(openCoverBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('book3d-front-hinge')).toHaveAttribute('data-open', 'true');

    const innerPocketFace = page.getByTestId('book3d-inner-pocket-face');
    await expect(innerPocketFace).toBeVisible();
    await expect(
      innerPocketFace.locator('pattern[id*="sample-endpaper-marbled-tile"]'),
    ).toHaveCount(1);
    await expect(
      innerPocketFace.locator('pattern[id*="sample-endpaper-marbled-tile"] image'),
    ).toHaveAttribute('href', /^data:image\/svg\+xml/);
    await expect(page.getByTestId('book3d-first-page')).toContainText('Twenty Thousand Leagues');
  });

  test('supports Cover Studio duplicate, copy/paste, and undo/redo history cleanly', async ({
    page,
  }) => {
    await page.getByTestId('load-sample-book-btn').click();

    const textLayers = page.locator('[data-testid^="studio-cover-text-"]');
    const ornaments = page.locator('[data-testid^="studio-ornament-"]');
    const undoBtn = page.getByTestId('studio-undo-btn');
    const redoBtn = page.getByTestId('studio-redo-btn');
    const duplicateBtn = page.getByTestId('studio-duplicate-btn');

    await expect(textLayers).toHaveCount(4);
    await expect(ornaments).toHaveCount(4);
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();

    // Select a cover text layer and duplicate via header button
    await page.getByTestId('studio-cover-text-0').click();
    await expect(duplicateBtn).toBeEnabled();
    await duplicateBtn.click();

    await expect(textLayers).toHaveCount(5);
    await expect(page.getByTestId('status-message')).toContainText('Duplicated element');
    await expect(undoBtn).toBeEnabled();

    // Undo via header button -> count reverts to 4
    await undoBtn.click();
    await expect(textLayers).toHaveCount(4);
    await expect(page.getByTestId('status-message')).toContainText('Undid last change');
    await expect(redoBtn).toBeEnabled();

    // Redo via header button -> count restores to 5
    await redoBtn.click();
    await expect(textLayers).toHaveCount(5);
    await expect(page.getByTestId('status-message')).toContainText('Redid change');

    // Select compass rose ornament and test keyboard Copy/Paste + Undo/Redo
    await page.getByTestId('studio-ornament-1').click();
    await page.keyboard.press('ControlOrMeta+c');
    await expect(page.getByTestId('status-message')).toContainText('Copied element');

    await page.keyboard.press('ControlOrMeta+v');
    await expect(ornaments).toHaveCount(5);
    await expect(page.getByTestId('status-message')).toContainText('Pasted element');

    // Keyboard duplicate (ControlOrMeta+d) adds one more ornament
    await page.keyboard.press('ControlOrMeta+d');
    await expect(ornaments).toHaveCount(6);

    // Keyboard Undo / Redo reverts and restores cleanly
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ornaments).toHaveCount(5);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(ornaments).toHaveCount(6);
  });

  test('switches to Folded Glue-In Endpapers mode with mirrored PASTEDOWN / FLYLEAF annotations and exports Inner SVG', async ({
    page,
  }) => {
    await page.getByTestId('nav-pockets').click();

    const slipPocketsBtn = page.getByTestId('interior-style-slip-pockets');
    const foldedBtn = page.getByTestId('interior-style-folded-endpapers');
    await expect(slipPocketsBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(foldedBtn).toHaveAttribute('aria-pressed', 'false');

    // Toggle Folded Glue-In Endpapers mode
    await foldedBtn.click();
    await expect(foldedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(slipPocketsBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { name: /Folded Glue-In Endpapers/i })).toBeVisible();

    // Verify mirrored PASTEDOWN / FLYLEAF zone labels on back and front folded sheets
    await expect(page.getByTestId('endpaper-back-left-zone')).toHaveText('FLYLEAF');
    await expect(page.getByTestId('endpaper-back-right-zone')).toHaveText('PASTEDOWN');
    await expect(page.getByTestId('endpaper-front-left-zone')).toHaveText('PASTEDOWN');
    await expect(page.getByTestId('endpaper-front-right-zone')).toHaveText('FLYLEAF');

    // Download Inner SVG and verify folded endpapers layout & annotations
    const innerSvgPromise = page.waitForEvent('download');
    await page.getByTestId('download-inner-svg-btn').click();
    const innerSvgDownload = await innerSvgPromise;
    expect(innerSvgDownload.suggestedFilename()).toBe('inner_pockets_and_liner.svg');

    const innerSvgPath = await innerSvgDownload.path();
    expect(innerSvgPath).toBeTruthy();
    const innerSvgContent = await readFile(innerSvgPath!, 'utf-8');
    expect(innerSvgContent).toContain('<svg');
    expect(innerSvgContent).toContain('FOLDED ENDPAPERS (PASTEDOWN + FLYLEAF)');
    expect(innerSvgContent).toContain('PASTEDOWN');
    expect(innerSvgContent).toContain('FLYLEAF');
  });

  test('downloads Bench Recipe & Jigs PDF and adjusts & exports Matching Slipcase Box SVG and PDF', async ({
    page,
  }) => {
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();

    // 1. Download Printable Bench Recipe & Cutting Jigs PDF
    const benchPdfPromise = page.waitForEvent('download');
    await page.getByTestId('measure-download-bench-jigs-btn').click();
    const benchPdfDownload = await benchPdfPromise;
    expect(benchPdfDownload.suggestedFilename()).toBe('bindery_bench_recipe_and_jigs.pdf');

    const benchPdfPath = await benchPdfDownload.path();
    expect(benchPdfPath).toBeTruthy();
    const benchPdfBuffer = await readFile(benchPdfPath!);
    expect(benchPdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(benchPdfBuffer.byteLength).toBeGreaterThan(2000);
    const benchPdfDoc = await PDFDocument.load(benchPdfBuffer);
    expect(benchPdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);

    // 2. Expand Matching Slipcase Box Calculator
    const toggleSlipcaseBtn = page.getByTestId('toggle-slipcase-calculator');
    await expect(toggleSlipcaseBtn).toHaveAttribute('aria-expanded', 'false');
    await toggleSlipcaseBtn.click();
    await expect(toggleSlipcaseBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('slipcase-cut-table')).toBeVisible();
    await expect(page.getByTestId('slipcase-preview-svg')).toBeVisible();

    const initialExteriorText = await page.getByTestId('slipcase-summary-exterior').textContent();
    expect(initialExteriorText).toBeTruthy();

    // Adjust slide clearance slider -> exterior box dimensions update live
    await page.getByTestId('slipcase-slide-clearance').fill('5');
    await expect(page.getByTestId('slipcase-slide-clearance-value')).toHaveText('5.0 mm');
    const updatedExteriorText = await page.getByTestId('slipcase-summary-exterior').textContent();
    expect(updatedExteriorText).not.toBe(initialExteriorText);
    await expect(page.getByTestId('slipcase-exterior-size')).toContainText(updatedExteriorText!);

    // Adjust thumb-notch radius slider -> note & SVG arc preview update live
    await page.getByTestId('slipcase-thumb-notch').fill('20');
    await expect(page.getByTestId('slipcase-thumb-notch-value')).toHaveText('20.0 mm');
    await expect(page.getByTestId('slipcase-note-side-walls')).toContainText('R 20.0 mm');
    await expect(page.getByTestId('slipcase-preview-side-wall-front')).toHaveAttribute(
      'd',
      /\bA\s+20/,
    );

    // 3. Export Matching Slipcase Cut SVG
    const slipcaseSvgPromise = page.waitForEvent('download');
    await page.getByTestId('slipcase-download-svg-btn').click();
    const slipcaseSvgDownload = await slipcaseSvgPromise;
    expect(slipcaseSvgDownload.suggestedFilename()).toBe('matching_slipcase.svg');

    const slipcaseSvgPath = await slipcaseSvgDownload.path();
    expect(slipcaseSvgPath).toBeTruthy();
    const slipcaseSvgContent = await readFile(slipcaseSvgPath!, 'utf-8');
    expect(slipcaseSvgContent).toContain('MATCHING SLIPCASE');
    expect(slipcaseSvgContent).toContain('Slide Clearance: 5 mm');
    expect(slipcaseSvgContent).toContain('Thumb Notch R = 20 mm');
    expect(slipcaseSvgContent).toContain('id="cut-lines"');
    expect(slipcaseSvgContent).toContain('id="grain-guides"');

    // 4. Export Matching Slipcase Cut PDF
    const slipcasePdfPromise = page.waitForEvent('download');
    await page.getByTestId('slipcase-download-pdf-btn').click();
    const slipcasePdfDownload = await slipcasePdfPromise;
    expect(slipcasePdfDownload.suggestedFilename()).toBe('matching_slipcase.pdf');

    const slipcasePdfPath = await slipcasePdfDownload.path();
    expect(slipcasePdfPath).toBeTruthy();
    const slipcasePdfBuffer = await readFile(slipcasePdfPath!);
    expect(slipcasePdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(slipcasePdfBuffer.byteLength).toBeGreaterThan(1500);
    const slipcasePdfDoc = await PDFDocument.load(slipcasePdfBuffer);
    expect(slipcasePdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  test('exports dragged Front Cover text and ornament cleanly inside Back Cover Cricut HTV SVG viewBox', async ({
    page,
  }) => {
    // 1. Add a Front Title text layer and a Front Compass Rose emblem ornament
    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-front-title-btn').click();
    const coverText = page.getByTestId('studio-cover-text-0');
    await expect(coverText).toBeVisible();

    await page.getByTestId('studio-tool-designs').click();
    await page.getByTestId('ornament-cat-all').click();
    await page.getByTestId('add-ornament-emblem-compass-rose').click();
    const ornament = page.getByTestId('studio-ornament-0');
    await expect(ornament).toBeVisible();

    // 2. Drag both the Front Title and Front Ornament across the spine onto the Back Cover
    const backFillBox = await page.getByTestId('studio-back-fill').boundingBox();
    expect(backFillBox).not.toBeNull();
    const backCenterX = backFillBox!.x + backFillBox!.width * 0.5;

    const textBox = await coverText.boundingBox();
    expect(textBox).not.toBeNull();
    const textStartX = textBox!.x + textBox!.width / 2;
    const textStartY = textBox!.y + textBox!.height / 2;
    await page.mouse.move(textStartX, textStartY);
    await page.mouse.down();
    await page.mouse.move(backCenterX, textStartY, { steps: 12 });
    await page.mouse.up();

    const ornBox = await ornament.boundingBox();
    expect(ornBox).not.toBeNull();
    const ornStartX = ornBox!.x + ornBox!.width / 2;
    const ornStartY = ornBox!.y + ornBox!.height / 2;
    await page.mouse.move(ornStartX, ornStartY);
    await page.mouse.down();
    await page.mouse.move(backCenterX, ornStartY, { steps: 12 });
    await page.mouse.up();

    // Confirm both elements now sit visually on the Back Cover
    const movedTextBox = await coverText.boundingBox();
    const movedOrnBox = await ornament.boundingBox();
    expect(movedTextBox!.x + movedTextBox!.width / 2).toBeLessThan(
      backFillBox!.x + backFillBox!.width,
    );
    expect(movedOrnBox!.x + movedOrnBox!.width / 2).toBeLessThan(
      backFillBox!.x + backFillBox!.width,
    );

    // 3. Open Cricut HTV dialog -> smart default selects Back Cover automatically
    await page.getByTestId('studio-open-cricut-btn').click();
    const cricutDialog = page.getByTestId('cricut-export-dialog');
    await expect(cricutDialog).toBeVisible();
    await expect(page.getByTestId('cricut-scope-back')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cricut-svg-preview-img')).toBeVisible();

    // Switching to now-empty Front Cover shows helpful empty-scope hint referencing Back Cover
    await page.getByTestId('cricut-scope-front').click();
    await expect(page.getByTestId('cricut-empty-scope-hint')).toContainText(/Back Cover/i);

    // 4. Switch back to Back Cover and download the HTV SVG
    await page.getByTestId('cricut-scope-back').click();
    await expect(page.getByTestId('cricut-scope-back')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cricut-empty-scope-hint')).toHaveCount(0);
    await expect(page.getByTestId('cricut-download-btn')).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('cricut-download-btn').click();
    const download = await downloadPromise;
    await expect(cricutDialog).toBeHidden();
    expect(download.suggestedFilename()).toContain('_cricut_htv_back.svg');

    const svgPath = await download.path();
    expect(svgPath).toBeTruthy();
    const svgText = await readFile(svgPath!, 'utf-8');

    // Verify Cricut SVG hygiene and both moved elements are present inside the Back Cover viewBox
    expect(svgText).toContain('id="spine-lettering"');
    expect(svgText).toContain('id="classic-ornaments"');
    expect(svgText).toContain('id="htv-weeding-box"');
    expect(svgText).toContain('id="alignment-registration-marks"');
    expect(svgText).not.toContain('<text');
    expect(svgText).not.toContain('<image');
    expect(svgText).not.toContain('transform=');

    const vbMatch = svgText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(vbMatch).not.toBeNull();
    const vbWidth = Number(vbMatch![1]);
    const vbHeight = Number(vbMatch![2]);
    expect(vbWidth).toBeGreaterThan(100);
    expect(vbHeight).toBeGreaterThan(150);

    let coordCount = 0;
    for (const pathMatch of svgText.matchAll(/\sd="([^"]+)"/g)) {
      const tokens =
        pathMatch[1].match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
      let i = 0;
      while (i < tokens.length) {
        const cmd = tokens[i++];
        if (cmd === 'Z') continue;
        const pairCount = cmd === 'M' || cmd === 'L' ? 1 : cmd === 'Q' ? 2 : cmd === 'C' ? 3 : 0;
        for (let p = 0; p < pairCount; p++) {
          const x = Number.parseFloat(tokens[i++] ?? 'NaN');
          const y = Number.parseFloat(tokens[i++] ?? 'NaN');
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(vbWidth + 0.01);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(vbHeight + 0.01);
          coordCount += 1;
        }
      }
    }
    expect(coordCount).toBeGreaterThan(30);
  });
});
