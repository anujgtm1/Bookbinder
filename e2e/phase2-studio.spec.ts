import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

/** Creates a minimal valid solid-color RGBA PNG buffer (no external deps needed). */
function createSolidPngBuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const idx = y * stride + 1 + x * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Phase 2 — Unified Cover & Inner Pockets Studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('uploads multiple images, drags and resizes interactively, samples color with eyedropper, and styles spine typography', async ({
    page,
  }) => {
    const crimsonPng = createSolidPngBuffer(64, 96, 200, 40, 50);
    const forestPng = createSolidPngBuffer(64, 96, 30, 110, 60);
    const goldPng = createSolidPngBuffer(40, 40, 215, 175, 55);

    // Upload 1st image (placed on Front Cover), then 2nd (Back), then 3rd (Spine)
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'crimson-front.png',
      mimeType: 'image/png',
      buffer: crimsonPng,
    });
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'forest-back.png',
      mimeType: 'image/png',
      buffer: forestPng,
    });
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'gold-emblem.png',
      mimeType: 'image/png',
      buffer: goldPng,
    });

    await expect(page.getByTestId('layer-count-badge')).toHaveText('3 images');
    await expect(page.getByTestId('studio-layer-2')).toBeVisible();

    // Drag the selected 3rd layer (gold emblem) interactively across the canvas
    const layer2 = page.getByTestId('studio-layer-2');
    await layer2.scrollIntoViewIfNeeded();
    const initialX = Number(await layer2.getAttribute('x'));
    const layerBox = await layer2.boundingBox();
    expect(layerBox).not.toBeNull();

    await page.mouse.move(layerBox!.x + layerBox!.width / 2, layerBox!.y + layerBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      layerBox!.x + layerBox!.width / 2 + 40,
      layerBox!.y + layerBox!.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();

    const movedX = Number(await layer2.getAttribute('x'));
    expect(movedX).toBeGreaterThan(initialX + 5);

    // Resize selected layer via SE corner handle
    const widthBeforeResize = Number(await layer2.getAttribute('width'));
    const seHandle = page.getByTestId('resize-handle-se');
    await seHandle.hover();
    const seBox = await seHandle.boundingBox();
    expect(seBox).not.toBeNull();
    await page.mouse.down();
    await page.mouse.move(seBox!.x + seBox!.width / 2 + 40, seBox!.y + seBox!.height / 2 + 40, {
      steps: 5,
    });
    await page.mouse.up();

    const widthAfterResize = Number(await layer2.getAttribute('width'));
    expect(widthAfterResize).toBeGreaterThan(widthBeforeResize + 2);

    // Select 1st layer (crimson) and Quick-Fit to Front, then toggle Flip H / Flip V cleanly
    await page.getByTestId('layer-select-0').click();
    await page.getByTestId('quick-fit-front').click();

    await expect(page.getByTestId('layer-flip-h-btn')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('layer-flip-h-btn').click();
    await expect(page.getByTestId('layer-flip-h-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('studio-layer-0')).toHaveAttribute('transform', /scale\(-1 1\)/);

    await page.getByTestId('layer-flip-v-btn').click();
    await expect(page.getByTestId('layer-flip-v-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('studio-layer-0')).toHaveAttribute('transform', /scale\(-1 -1\)/);

    // Toggle flips back off before continuing eyedropper sample
    await page.getByTestId('layer-flip-h-btn').click();
    await page.getByTestId('layer-flip-v-btn').click();
    await expect(page.getByTestId('layer-flip-h-btn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('layer-flip-v-btn')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('studio-eyedropper-both-btn').click();
    await expect(page.getByTestId('eyedropper-active-banner')).toBeVisible();

    const previewSvg = page.getByTestId('studio-preview-svg');
    await previewSvg.scrollIntoViewIfNeeded();
    const box = await previewSvg.boundingBox();
    expect(box).not.toBeNull();
    await previewSvg.click({ position: { x: box!.width * 0.85, y: box!.height * 0.5 } });

    await expect(page.getByTestId('studio-spine-fill')).toHaveAttribute('fill', '#c82832');
    await expect(page.getByTestId('studio-back-fill')).toHaveAttribute('fill', '#c82832');

    // Switch to Spine tab in Studio Tool Dock -> add spine title & author and switch layout to Stacked + European orientation
    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Dune');
    await page.getByTestId('studio-spine-author-input').fill('Frank Herbert');
    await expect(page.getByTestId('studio-spine-typography')).toContainText('Dune');
    await expect(page.getByTestId('studio-spine-typography')).toContainText('Frank Herbert');

    await page.getByTestId('studio-spine-layout-select').click();
    await page.getByRole('option', { name: /Stacked/i }).click();
    await expect(page.getByTestId('studio-spine-typography').locator('text')).toHaveCount(2);

    await page.getByTestId('studio-spine-orientation-select').click();
    await page.getByRole('option', { name: /Bottom-to-Top/i }).click();

    // Flip Author writing to Horizontal (2 horizontal lines: "Frank" / "Herbert" with rotate(0 ...))
    await page.getByTestId('author-orientation-horizontal').click();
    const spineTexts = page.getByTestId('studio-spine-typography').locator('text');
    await expect(spineTexts).toHaveCount(3);
    await expect(spineTexts.nth(1)).toHaveAttribute('transform', /^rotate\(0 /);
    await expect(spineTexts.nth(2)).toHaveAttribute('transform', /^rotate\(0 /);
  });

  test('exports 300 DPI Print-Ready PDF, 300 DPI Affinity PNG, and 1:1 mm Affinity SVG', async ({
    page,
  }) => {
    const pngBuffer = createSolidPngBuffer(32, 48, 36, 71, 110);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'navy-cover.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });
    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Piranesi');
    await page.getByTestId('studio-spine-author-input').fill('Susanna Clarke');

    // 1. Export Print-Ready PDF (300 DPI + vector typography via unified Print & Export PDF dialog)
    await page.getByTestId('studio-export-pdf-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeVisible();
    await expect(page.getByTestId('pdf-opt-guides')).toBeVisible();
    const pdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const pdfDownload = await pdfPromise;
    await expect(page.getByTestId('pdf-export-dialog')).toBeHidden();
    expect(pdfDownload.suggestedFilename()).toBe('outer_cover_print.pdf');
    const pdfBytes = await readFile((await pdfDownload.path())!);
    expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBytes.byteLength).toBeGreaterThan(5000);

    // 2. Export Affinity 300 DPI PNG
    const pngPromise = page.waitForEvent('download');
    await page.getByTestId('studio-export-png-btn').click();
    const pngDownload = await pngPromise;
    expect(pngDownload.suggestedFilename()).toBe('outer_cover_300dpi.png');
    const pngBytes = await readFile((await pngDownload.path())!);
    expect(pngBytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    // 3. Export Affinity 1:1 mm SVG
    const svgPromise = page.waitForEvent('download');
    await page.getByTestId('studio-export-svg-btn').click();
    const svgDownload = await svgPromise;
    expect(svgDownload.suggestedFilename()).toBe('outer_cover_300dpi.svg');
    const svgText = await readFile((await svgDownload.path())!, 'utf-8');
    expect(svgText).toContain('width="372mm"');
    expect(svgText).toContain('height="265mm"');
    expect(svgText).toContain('id="artwork-layer"');
    expect(svgText).toContain('id="spine-typography"');
    expect(svgText).toContain('Piranesi');
  });

  test('toggles collapsible book spec rail and interactive 3D folded book preview with angle presets and orbit', async ({
    page,
  }) => {
    // Collapse and re-expand the Book Spec rail in the Folio Workbench
    const toggleRailBtn = page.getByTestId('toggle-sidebar-btn');
    await expect(page.getByTestId('input-pb-width')).toBeVisible();
    await toggleRailBtn.click();
    await expect(page.getByTestId('input-pb-width')).toBeHidden();
    await toggleRailBtn.click();
    await expect(page.getByTestId('input-pb-width')).toBeVisible();

    // Populate spine title & author, then switch to 3D Book Preview via the Floating HUD
    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Twenty Thousand Leagues');
    await page.getByTestId('studio-spine-author-input').fill('Jules Verne');
    await page.getByTestId('author-orientation-horizontal').click();

    await page.getByTestId('studio-view-3d-btn').click();
    const stage = page.getByTestId('book3d-stage');
    await expect(stage).toBeVisible();
    await expect(page.getByTestId('book3d-spine-typography')).toContainText('Twenty Thousand Leagues');

    // Switch 3D camera presets
    await page.getByTestId('book3d-preset-spine').click();
    await expect(page.getByTestId('book3d-preset-spine')).toHaveAttribute('aria-pressed', 'true');
    const transformAtSpine = await page.getByTestId('book3d-volume').getAttribute('style');
    expect(transformAtSpine).toContain('rotateY(86deg)');

    // Orbit the 3D volume interactively via pointer drag
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 80, box!.y + box!.height / 2 - 20, { steps: 5 });
    await page.mouse.up();

    const transformAfterDrag = await page.getByTestId('book3d-volume').getAttribute('style');
    expect(transformAfterDrag).not.toBe(transformAtSpine);
  });

  test('runs live preflight checks, paints red warning zones on the canvas, and resolves issues via quick fixes', async ({
    page,
  }) => {
    // Upload a high-res solid cover image (auto-placed contain inside front zone, which leaves side/turn-in gaps)
    const highResCover = createSolidPngBuffer(2200, 3000, 18, 72, 92);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'high-res-cover.png',
      mimeType: 'image/png',
      buffer: highResCover,
    });

    // Shrink the cover slightly so it visibly leaves uncovered gaps on the front board
    await page.getByTestId('layer-scale-down-btn').click();
    await page.getByTestId('layer-scale-down-btn').click();

    // Red preflight warning overlay appears on canvas AND PreflightCard reports front-board-gap
    await expect(page.getByTestId('studio-preflight-overlays')).toBeVisible();
    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-issue-front-board-gap')).toBeVisible();

    // One-click Fit to Front clears the red coverage gap immediately
    await page.getByTestId('preflight-fix-front-board-gap').click();
    await expect(page.getByTestId('preflight-issue-front-board-gap')).toBeHidden();
    await expect(page.getByTestId('preflight-status-badge')).toHaveText('All Checks Passed');

    // Trigger low-contrast spine text error, verify red spine highlight, then resolve with one-click ink fix
    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('DUNE');
    await page.getByTestId('studio-spine-text-color').fill('#243f57');
    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-issue-spine-low-contrast-error')).toBeVisible();
    await expect(page.getByTestId('studio-preflight-overlays')).toBeVisible();

    await page.getByTestId('preflight-fix-spine-low-contrast-error').click();
    await expect(page.getByTestId('preflight-issue-spine-low-contrast-error')).toBeHidden();
    await expect(page.getByTestId('preflight-status-badge')).toHaveText('All Checks Passed');
  });

  test('styles Inner Pockets with Match Cover Color, interactive draggable/resizable artwork layers, and Styled Pockets PDF', async ({
    page,
  }) => {
    // Switch to Inner Pockets & Liner tab
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();

    // Match cover color (#1f3a52)
    await page.getByTestId('pocket-match-cover-btn').click();
    await expect(page.getByTestId('styled-front-pocket-fill')).toHaveAttribute('fill', '#1f3a52');

    // Upload a custom endpaper artwork image -> lands as an interactive draggable layer
    const marbledPng = createSolidPngBuffer(64, 64, 180, 140, 75);
    await page.getByTestId('pocket-upload-image-input').setInputFiles({
      name: 'marbled-endpaper.png',
      mimeType: 'image/png',
      buffer: marbledPng,
    });
    const pocketLayer = page.getByTestId('pocket-layer-0');
    await expect(pocketLayer).toBeVisible();
    await expect(page.getByTestId('pocket-remove-image-btn')).toBeVisible();

    // Drag the artwork layer interactively across the pocket envelope
    await pocketLayer.scrollIntoViewIfNeeded();
    const initialX = Number(await pocketLayer.getAttribute('x'));
    const layerBox = await pocketLayer.boundingBox();
    expect(layerBox).not.toBeNull();

    await page.mouse.move(layerBox!.x + layerBox!.width / 2, layerBox!.y + layerBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      layerBox!.x + layerBox!.width / 2 - 45,
      layerBox!.y + layerBox!.height / 2 + 15,
      { steps: 5 },
    );
    await page.mouse.up();

    const movedX = Number(await pocketLayer.getAttribute('x'));
    expect(movedX).toBeLessThan(initialX - 5);

    // Resize via SE corner handle
    const widthBeforeResize = Number(await pocketLayer.getAttribute('width'));
    const seHandle = page.getByTestId('resize-handle-se');
    const seBox = await seHandle.boundingBox();
    expect(seBox).not.toBeNull();
    await page.mouse.move(seBox!.x + seBox!.width / 2, seBox!.y + seBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(seBox!.x + seBox!.width / 2 + 30, seBox!.y + seBox!.height / 2 + 30, {
      steps: 5,
    });
    await page.mouse.up();
    const widthAfterResize = Number(await pocketLayer.getAttribute('width'));
    expect(widthAfterResize).toBeGreaterThan(widthBeforeResize + 2);

    // Copy to opposite pocket creates a 2nd interactive layer
    await page.getByTestId('pocket-copy-other-btn').click();
    await expect(page.getByTestId('pocket-layer-count-badge')).toHaveText('2 images');

    // Export Styled Pockets PDF (via unified Print & Export PDF dialog)
    await page.getByTestId('download-styled-inner-pdf-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeVisible();
    await expect(page.getByTestId('pdf-opt-guides')).toBeVisible();
    await expect(page.getByTestId('pdf-opt-legend')).toBeVisible();
    const styledPdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const styledPdfDownload = await styledPdfPromise;
    await expect(page.getByTestId('pdf-export-dialog')).toBeHidden();
    expect(styledPdfDownload.suggestedFilename()).toBe('inner_pockets_styled.pdf');
    const pdfBytes = await readFile((await styledPdfDownload.path())!);
    expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBytes.byteLength).toBeGreaterThan(2000);
  });

  test('extends a front-only cover across the turn-in pasting stub non-destructively and matches spine/back edge color', async ({
    page,
  }) => {
    // Upload a high-res front-only cover (1430x2230 matching the 143x223 mm front board)
    const frontOnlyPng = createSolidPngBuffer(1430, 2230, 22, 74, 88);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'downloaded-front-cover.png',
      mimeType: 'image/png',
      buffer: frontOnlyPng,
    });
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    // Click Edge Smear to extend outer edges cleanly across the 18 mm turn-in + 3 mm bleed stub
    await page.getByTestId('stub-extend-edge-smear').click();
    await expect(page.getByTestId('stub-extend-edge-smear')).toHaveAttribute('aria-pressed', 'true');

    // Layer now spans full front zone (board + 18mm turn-in + 3mm bleed = 164mm wide, 265mm tall)
    const layerEl = page.getByTestId('studio-layer-0');
    const extendedW = Number(await layerEl.getAttribute('width'));
    const extendedH = Number(await layerEl.getAttribute('height'));
    expect(extendedW).toBeGreaterThanOrEqual(163);
    expect(extendedH).toBeGreaterThanOrEqual(264);

    // Preflight passes with zero coverage or DPI errors
    await expect(page.getByTestId('studio-tool-preflight-badge')).toHaveText('OK');
    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-status-badge')).toHaveText('All Checks Passed');
    await page.getByTestId('studio-tool-artwork').click();

    // Match Spine & Back color to sampled cover edge (#164a58)
    await page.getByTestId('match-spine-back-edge-btn').click();
    await expect(page.getByTestId('studio-spine-fill')).toHaveAttribute('fill', '#164a58');
    await expect(page.getByTestId('studio-back-fill')).toHaveAttribute('fill', '#164a58');

    // Switch to Soft Mirror and then revert cleanly to Off (original uncropped board size)
    await page.getByTestId('stub-extend-soft-mirror').click();
    await expect(page.getByTestId('stub-extend-soft-mirror')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('stub-extend-none').click();
    const revertedW = Number(await layerEl.getAttribute('width'));
    expect(revertedW).toBeCloseTo(143, 0);
  });

  test('displays glowing brass magnetic snap guides while dragging artwork near structural lines', async ({
    page,
  }) => {
    const emblemPng = createSolidPngBuffer(200, 200, 210, 175, 70);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'emblem.png',
      mimeType: 'image/png',
      buffer: emblemPng,
    });

    // Shrink emblem slightly so its center aligns neatly on the Front Center / Centerline when dragged
    await page.getByTestId('layer-scale-down-btn').click();
    await page.getByTestId('layer-scale-down-btn').click();
    await page.getByTestId('layer-scale-down-btn').click();

    await expect(page.getByTestId('studio-snap-btn')).toHaveAttribute('aria-pressed', 'true');

    const layer = page.getByTestId('studio-layer-0');
    await layer.scrollIntoViewIfNeeded();
    const box = await layer.boundingBox();
    expect(box).not.toBeNull();

    // Drag gently near the center — magnetic snap locks onto FRONT CENTER / CENTERLINE and lights up brass guides
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 2, box!.y + box!.height / 2 + 2, { steps: 3 });

    await expect(page.getByTestId('studio-snap-guides')).toBeVisible();
    expect(await page.getByTestId('snap-guide-line').count()).toBeGreaterThanOrEqual(1);

    // Guides disappear cleanly on pointer release
    await page.mouse.up();
    await expect(page.getByTestId('studio-snap-guides')).toBeHidden();
  });

  test('re-fits artwork cleanly to front after book resize and supports optional DPI check + Ignore/Restore warnings', async ({
    page,
  }) => {
    // Upload a modest 600x900 image (will trigger low-DPI warning at full cover size)
    const modestCover = createSolidPngBuffer(600, 900, 42, 85, 108);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'modest-cover.png',
      mimeType: 'image/png',
      buffer: modestCover,
    });
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    // 1. Optional DPI check toggle turns off DPI warnings without touching other checks
    await page.getByTestId('studio-tool-preflight').click();
    const dpiIssueLocator = page.locator('[data-testid^="preflight-issue-low-dpi-"]');
    await expect(dpiIssueLocator).toBeVisible();
    await expect(page.getByTestId('preflight-dpi-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('preflight-dpi-toggle').click();
    await expect(page.getByTestId('preflight-dpi-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(dpiIssueLocator).toBeHidden();

    // Turn DPI check back on -> warning returns
    await page.getByTestId('preflight-dpi-toggle').click();
    await expect(dpiIssueLocator).toBeVisible();

    // 2. Ignore for now dismisses the specific warning + red highlight and shows Restore pill
    await page.locator('[data-testid^="preflight-ignore-low-dpi-"]').click();
    await expect(dpiIssueLocator).toBeHidden();
    await expect(page.getByTestId('preflight-restore-ignored-btn')).toContainText('1 ignored');

    // Restore brings the ignored warning back
    await page.getByTestId('preflight-restore-ignored-btn').click();
    await expect(dpiIssueLocator).toBeVisible();
    await expect(page.getByTestId('preflight-restore-ignored-btn')).toBeHidden();

    // Pause DPI check so we can verify clean Fit-to-Front coverage after resizing the book
    await page.getByTestId('preflight-dpi-toggle').click();

    // 3. Resize the book dimensions dramatically and click Fit to Front
    const widthInput = page.getByTestId('input-pb-width');
    const heightInput = page.getByTestId('input-pb-height');
    await widthInput.fill('190');
    await heightInput.fill('275');

    await page.getByTestId('studio-tool-artwork').click();
    await page.getByTestId('quick-fit-front').click();
    await expect(page.getByTestId('layer-clip-select')).toContainText('Clip to Front Cover');

    // Front cover should now pass coverage cleanly, expand to resized book, and clip to Front Cover
    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-issue-front-board-gap')).toBeHidden();
    await expect(page.getByTestId('preflight-issue-front-turnin-gap')).toBeHidden();
    await expect(page.getByTestId('preflight-status-badge')).toHaveText('All Checks Passed');

    const resizedLayer = page.getByTestId('studio-layer-0');
    const resizedW = Number(await resizedLayer.getAttribute('width'));
    const resizedH = Number(await resizedLayer.getAttribute('height'));
    expect(resizedW).toBeGreaterThanOrEqual(210);
    expect(resizedH).toBeGreaterThanOrEqual(315);
  });

  test('recommends Flexible Spine for a 5 mm A6 notebook, supports Softcover Jacket, Pocket Tile Pattern, and Openable 3D Book Cover', async ({
    page,
  }) => {
    // 1. Choose A6 Pocket Notebook preset + 5 mm spine thickness
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();
    await page.getByTestId('input-pb-thickness').fill('5');

    // Preflight recommends Flexible Spine for thin (<8 mm) notebook -> one-click switch
    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-issue-thin-book-rigid-spine')).toBeVisible();
    await page.getByTestId('preflight-fix-thin-book-rigid-spine').click();

    // Inspect Cut List on Measure & Cut tab
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('cut-spine-strip')).toContainText('Qty 0');
    await expect(page.getByTestId('cut-spine-strip')).toContainText('Cloth Gap');

    // Switch to 0-Board 1-Piece Fold-and-Glue Slip Cover via sidebar selector
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }).click();
    await expect(page.getByTestId('softcover-flap-controls')).toBeVisible();
    await expect(page.getByTestId('cut-cover-boards')).toContainText('0-Board Softcover');
    await expect(page.getByTestId('cut-spine-strip')).toContainText('Tuck Flaps');
    await expect(page.getByTestId('roll-recommendation-badge')).toContainText('US Letter / A4');

    // Adjust Slip Flap Width via quick presets: Deep (38 mm) -> US Legal, Fit Letter -> US Letter / A4
    await page.getByTestId('flap-preset-deep').click();
    await expect(page.getByTestId('roll-recommendation-badge')).toContainText('US Legal');
    await page.getByTestId('flap-preset-letter').click();
    await expect(page.getByTestId('roll-recommendation-badge')).toContainText('US Letter / A4');

    // Verify Blueprint on Measure & Cut renders the 4 mitered flap glue tabs cleanly
    await expect(page.getByTestId('blueprint-softcover-flaps-and-tabs')).toBeVisible();

    // Inner Pockets tab displays Built-In badge and shows calm notice when clicked
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Built-In');
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('pockets-not-needed-notice')).toBeVisible();

    // Switch back to Flexible Spine via the notice button -> reveals Inner Pockets Studio
    await page.getByTestId('pockets-switch-flexible-btn').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();
    const swatchPng = createSolidPngBuffer(64, 64, 195, 155, 72);
    await page.getByTestId('pocket-upload-image-input').setInputFiles({
      name: 'marbled-swatch.png',
      mimeType: 'image/png',
      buffer: swatchPng,
    });
    await page.getByTestId('pocket-tile-toggle-btn').click();
    await expect(page.getByTestId('pocket-tile-toggle-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pocket-layer-0')).toHaveAttribute('data-tiled', 'true');

    // 2. Switch back to Outer Cover -> 3D Book Preview -> Open Cover to peek inside at the styled pocket
    await page.getByTestId('nav-outer').click();
    await page.getByTestId('studio-view-3d-btn').click();
    await expect(page.getByTestId('book3d-front-hinge')).toHaveAttribute('data-open', 'false');

    await page.getByTestId('book3d-open-cover-btn').click();
    await expect(page.getByTestId('book3d-open-cover-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('book3d-front-hinge')).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('book3d-inner-pocket-face')).toBeVisible();
  });

  test('renders manual-cutting CAD dimension lines, cumulative ruler datum strip, and 45° miter callout in Blueprint mode on both tabs', async ({
    page,
  }) => {
    // 1. Outer Case Wrap Blueprint mode shows full CAD dimension chains, cumulative ruler, and miter callout
    await page.getByTestId('studio-view-blueprint-btn').click();
    const outerDims = page.getByTestId('outer-blueprint-dimensions');
    await expect(outerDims).toBeVisible();
    await expect(outerDims).toContainText('TOTAL W: 366.0 mm');
    await expect(outerDims).toContainText('TOTAL H: 259.0 mm');
    await expect(page.getByTestId('blueprint-cumulative-ruler')).toContainText('RULER (mm)');
    await expect(page.getByTestId('blueprint-miter-callout')).toContainText('45° MITER LEG');

    // Toggle unit to inches -> Blueprint dimension lines & ruler update immediately
    await page.getByTestId('unit-toggle-in').click();
    await expect(page.getByTestId('blueprint-cumulative-ruler')).toContainText('RULER (in)');

    // Toggle Dimensions off & back on via Blueprint HUD
    await page.getByTestId('blueprint-dimensions-btn').click();
    await expect(outerDims).toBeHidden();
    await page.getByTestId('blueprint-dimensions-btn').click();
    await expect(outerDims).toBeVisible();

    // 2. Inner Pockets Blueprint mode renders pocket/liner dimension chains & toggles cleanly
    await page.getByTestId('nav-pockets').click();
    await page.getByTestId('pockets-view-blueprint-btn').click();
    const pocketDims = page.getByTestId('pockets-blueprint-dimensions');
    await expect(pocketDims).toBeVisible();
    await page.getByTestId('pockets-dimensions-btn').click();
    await expect(pocketDims).toBeHidden();
  });

  test('exports Cricut / Silhouette / ScanNCut 1:1 mm HTV SVG with flattened vector glyph paths and zero <text> tags', async ({
    page,
  }) => {
    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Dune');
    await page.getByTestId('studio-spine-author-input').fill('Frank Herbert');
    await page.getByTestId('author-orientation-horizontal').click();

    await page.getByTestId('studio-open-cricut-btn').click();
    await expect(page.getByTestId('cricut-export-dialog')).toBeVisible();
    await expect(page.getByTestId('cricut-svg-preview-img')).toBeVisible();

    // Toggle Mirror Horizontally for HTV and download SVG
    await page.getByTestId('cricut-mirror-switch').click();

    const svgPromise = page.waitForEvent('download');
    await page.getByTestId('cricut-download-btn').click();
    const svgDownload = await svgPromise;
    expect(svgDownload.suggestedFilename()).toBe('dune_cricut_htv_spine_mirrored.svg');

    const svgText = await readFile((await svgDownload.path())!, 'utf-8');
    expect(svgText).toMatch(/width="[\d.]+mm"/);
    expect(svgText).toMatch(/height="[\d.]+mm"/);
    expect(svgText).toContain('id="spine-lettering"');
    expect(svgText).toContain('id="htv-weeding-box"');
    expect(svgText).toContain('id="alignment-registration-marks"');
    expect(svgText).not.toContain('<text');
    expect(svgText).not.toContain('transform=');
  });

  test('supports draggable Front/Back cover text layers, Classic Bookbindery vector designs, 3D preview, and Front Cover Cricut HTV SVG export', async ({
    page,
  }) => {
    // 1. Open Cover Text tool dock tab, add a Front Title text layer, and customize its text
    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-front-title-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toBeVisible();
    await expect(page.getByTestId('cover-text-upload-font-btn')).toBeVisible();
    await page.getByTestId('cover-text-textarea').fill('THE ODYSSEY');
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('THE ODYSSEY');

    // Toggle Cover Text Flip H -> sets aria-pressed & applies SVG flip transform on studio-cover-text-0
    await page.getByTestId('cover-text-flip-h-btn').click();
    await expect(page.getByTestId('cover-text-flip-h-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('studio-cover-text-0')).toHaveAttribute(
      'transform',
      /scale\(-1 1\)/,
    );
    await page.getByTestId('cover-text-flip-h-btn').click();
    await expect(page.getByTestId('cover-text-flip-h-btn')).toHaveAttribute('aria-pressed', 'false');

    // 2. Switch to Classic Designs tool dock tab, add a Double Rule Frame, test 1-click Margin Fit Presets, Spine Botanical Vine, and custom vector SVG stamp
    await page.getByTestId('studio-tool-designs').click();
    await page.getByTestId('add-ornament-frame-double-rule').click();
    await expect(page.getByTestId('studio-ornament-0')).toBeVisible();

    // 1-Click Snap to Margin presets (Wide 18 mm -> Tight 6 mm -> Classic 12 mm) visibly update inset & dimensions
    const frameHitRect = page.getByTestId('studio-ornament-0').locator('rect').first();
    await page.getByTestId('ornament-fit-wide').click();
    const wideX = Number(await frameHitRect.getAttribute('x'));
    const wideW = Number(await frameHitRect.getAttribute('width'));
    const wideH = Number(await frameHitRect.getAttribute('height'));

    await page.getByTestId('ornament-fit-tight').click();
    const tightX = Number(await frameHitRect.getAttribute('x'));
    const tightW = Number(await frameHitRect.getAttribute('width'));
    const tightH = Number(await frameHitRect.getAttribute('height'));

    expect(tightW).toBeGreaterThan(wideW + 20);
    expect(tightH).toBeGreaterThan(wideH + 20);
    expect(tightX).toBeLessThan(wideX - 10);

    await page.getByTestId('ornament-fit-classic').click();
    const classicW = Number(await frameHitRect.getAttribute('width'));
    expect(classicW).toBeGreaterThan(wideW + 8);
    expect(classicW).toBeLessThan(tightW - 8);

    await page.getByTestId('ornament-cat-spine').click();
    await page.getByTestId('add-ornament-spine-botanical-vine').click();

    // Flip ornament horizontally and vertically cleanly
    await page.getByTestId('ornament-flip-h-btn').click();
    await expect(page.getByTestId('ornament-flip-h-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('ornament-flip-v-btn').click();
    await expect(page.getByTestId('ornament-flip-v-btn')).toHaveAttribute('aria-pressed', 'true');

    const customSvgStamp = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 65,40 95,50 65,60 50,95 35,60 5,50 35,40" fill="#000"/></svg>',
      'utf-8',
    );
    await page.getByTestId('ornament-cat-all').click();
    await page.getByTestId('import-svg-stamp-input').setInputFiles({
      name: 'north-star.svg',
      mimeType: 'image/svg+xml',
      buffer: customSvgStamp,
    });
    await expect(page.getByTestId('studio-ornament-0')).toBeVisible();
    await expect(page.getByTestId('studio-ornament-1')).toBeVisible();
    await expect(page.getByTestId('studio-ornament-2')).toBeVisible();
    await expect(page.getByTestId('ornament-resize-se')).toBeVisible();

    // 3. Verify Front Cover text renders live in 3D Book Preview
    await page.getByTestId('studio-view-3d-btn').click();
    await expect(page.getByTestId('book3d-front-face')).toContainText('THE ODYSSEY');
    await page.getByTestId('studio-view-2d-btn').click();

    // 4. Open Cricut / HTV SVG modal -> auto-selects Front Cover scope since there is front text/ornaments
    await page.getByTestId('studio-open-cricut-btn').click();
    await expect(page.getByTestId('cricut-export-dialog')).toBeVisible();
    await expect(page.getByTestId('cricut-scope-front')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cricut-svg-preview-img')).toBeVisible();

    const frontSvgPromise = page.waitForEvent('download');
    await page.getByTestId('cricut-download-btn').click();
    const frontSvgDownload = await frontSvgPromise;
    expect(frontSvgDownload.suggestedFilename()).toBe('the_odyssey_cricut_htv_front.svg');

    const frontSvgText = await readFile((await frontSvgDownload.path())!, 'utf-8');
    expect(frontSvgText).toContain('id="spine-lettering"');
    expect(frontSvgText).toContain('id="classic-ornaments"');
    expect(frontSvgText).toContain('id="htv-weeding-box"');
    expect(frontSvgText).not.toContain('<text');
    expect(frontSvgText).not.toContain('transform=');
  });

  test('navigates 3-tab hybrid workbench (Measure & Cut, Cover Studio Tool Dock, and Built-In Softcover Inner Pockets)', async ({
    page,
  }) => {
    // 1. Lands on Cover Studio by default with clickable Roll/Spec badge & compact 5-tab Tool Dock
    await expect(page.getByTestId('studio-roll-badge')).toBeVisible();
    await expect(page.getByTestId('studio-tool-dock')).toBeVisible();

    // Switch through all 5 Cover Studio tool dock tabs in 1 click each
    await page.getByTestId('studio-tool-text').click();
    await expect(page.getByTestId('add-front-title-btn')).toBeVisible();

    await page.getByTestId('studio-tool-designs').click();
    await expect(page.getByTestId('classic-ornament-gallery')).toBeVisible();

    await page.getByTestId('studio-tool-spine').click();
    await expect(page.getByTestId('studio-spine-title-input')).toBeVisible();

    await page.getByTestId('studio-tool-preflight').click();
    await expect(page.getByTestId('preflight-card')).toBeVisible();

    await page.getByTestId('studio-tool-artwork').click();
    await expect(page.getByTestId('studio-eyedropper-both-btn')).toBeVisible();

    // 2. Clicking the Roll/Spec badge switches straight to Measure & Cut (full Cut List + CAD Blueprint)
    await page.getByTestId('studio-roll-badge').click();
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();
    await expect(page.getByTestId('cut-list-card')).toBeVisible();
    await expect(page.getByTestId('outer-blueprint-dimensions')).toBeVisible();

    // 3. Switch to Inner Pockets, then change binding style to Fold-and-Glue Slip Cover -> auto-switches to Cover Studio
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();

    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }).click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Built-In');

    // Clicking Inner Pockets while Fold-and-Glue Slip Cover is active renders calm Built-In notice
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('pockets-not-needed-notice')).toBeVisible();
    await page.getByTestId('pockets-return-studio-btn').click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('expands cutting-mat canvas to full-page focus mode and exits via Escape or Exit Full Screen pill', async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    // 1. Cover Studio full-page expand -> fills viewport -> Escape exits cleanly
    const studioStage = page.getByTestId('studio-canvas-stage');
    await expect(studioStage).toHaveAttribute('data-expanded', 'false');

    await page.getByTestId('studio-fullscreen-btn').click();
    await expect(studioStage).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByTestId('studio-exit-fullscreen-btn')).toBeVisible();

    const expandedStudioBox = await studioStage.boundingBox();
    expect(expandedStudioBox).not.toBeNull();
    expect(expandedStudioBox!.height).toBeGreaterThanOrEqual(viewport!.height - 2);

    await page.keyboard.press('Escape');
    await expect(studioStage).toHaveAttribute('data-expanded', 'false');
    await expect(page.getByTestId('studio-exit-fullscreen-btn')).toBeHidden();

    // 2. Measure & Cut full-page expand -> exits via top-right Exit Full Screen pill
    await page.getByTestId('nav-measure').click();
    const measureStage = page.getByTestId('measure-canvas-stage');
    await expect(measureStage).toHaveAttribute('data-expanded', 'false');

    await page.getByTestId('measure-fullscreen-btn').click();
    await expect(measureStage).toHaveAttribute('data-expanded', 'true');
    const expandedMeasureBox = await measureStage.boundingBox();
    expect(expandedMeasureBox).not.toBeNull();
    expect(expandedMeasureBox!.height).toBeGreaterThanOrEqual(viewport!.height - 2);

    await page.getByTestId('measure-exit-fullscreen-btn').click();
    await expect(measureStage).toHaveAttribute('data-expanded', 'false');
    await expect(page.getByTestId('measure-exit-fullscreen-btn')).toBeHidden();
  });

  test('applies starter Series Design Preset, saves custom preset across reload, and adapts proportionally to A6 Softcover Slip Cover', async ({
    page,
  }) => {
    // 1. Open Presets tab and apply Classic Clothbound Gold
    await page.getByTestId('studio-tool-presets').click();
    await page.getByTestId('apply-builtin-preset-classic-clothbound-gold').click();

    await expect(page.getByTestId('studio-ornament-0')).toBeVisible();
    await expect(page.getByTestId('studio-ornament-1')).toBeVisible();
    await expect(page.getByTestId('studio-ornament-2')).toBeVisible();
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('BOOK TITLE');
    await expect(page.getByTestId('studio-cover-text-1')).toContainText('AUTHOR NAME');

    const tradeFrameRect = page.getByTestId('studio-ornament-0').locator('rect').first();
    const tradeFrameWidth = Number(await tradeFrameRect.getAttribute('width'));
    expect(tradeFrameWidth).toBeGreaterThan(110);

    // 2. Customize cloth color and save as "My A6 Series"
    await page.getByTestId('studio-tool-artwork').click();
    await page.getByTestId('studio-front-color-input').fill('#5a1f28');
    await page.getByTestId('studio-spine-color-input').fill('#5a1f28');
    await page.getByTestId('studio-back-color-input').fill('#5a1f28');
    await expect(page.getByTestId('studio-front-fill')).toHaveAttribute('fill', '#5a1f28');

    await page.getByTestId('studio-tool-presets').click();
    await page.getByTestId('preset-name-input').fill('My A6 Series');
    await page.getByTestId('save-design-preset-btn').click();
    await expect(page.getByTestId('saved-preset-card-0')).toContainText('My A6 Series');
    await expect(page.getByTestId('studio-tool-presets-badge')).toHaveText('1');

    // Verify saved preset persists across full page reload
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
    await page.getByTestId('studio-tool-presets').click();
    await expect(page.getByTestId('saved-preset-card-0')).toContainText('My A6 Series');

    // 3. Switch to A6 Pocket Notebook + Fold-and-Glue Slip Cover and give Book 2 its own spine title
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }).click();

    await page.getByTestId('studio-tool-spine').click();
    await page.getByTestId('studio-spine-title-input').fill('Pocket Field Notes');

    // Apply saved "My A6 Series" preset onto the A6 Slip Cover
    await page.getByTestId('studio-tool-presets').click();
    await page.getByTestId('apply-saved-preset-0').click();

    await expect(page.getByTestId('studio-front-fill')).toHaveAttribute('fill', '#5a1f28');
    await expect(page.getByTestId('studio-spine-fill')).toHaveAttribute('fill', '#5a1f28');
    await expect(page.getByTestId('studio-spine-typography')).toContainText('Pocket Field Notes');
    await expect(page.getByTestId('studio-cover-text-0')).toContainText('BOOK TITLE');

    const a6FrameRect = page.getByTestId('studio-ornament-0').locator('rect').first();
    const a6FrameWidth = Number(await a6FrameRect.getAttribute('width'));
    expect(a6FrameWidth).toBeGreaterThan(70);
    expect(a6FrameWidth).toBeLessThan(100);
    expect(a6FrameWidth).toBeLessThan(tradeFrameWidth - 20);
  });

  test('evaluates Target Print Media (2-sheet tiled PDF export on US Letter, overflow error & 1-click Quick Fix)', async ({
    page,
  }) => {
    // 1. Select US Letter on default Trade Digest hardcover (366 x 259 mm -> fits as 2 Portrait tiled sheets)
    await page.getByTestId('print-media-select').click();
    await page.getByRole('option', { name: /US Letter/i }).click();

    await expect(page.getByTestId('studio-roll-badge')).toContainText(
      '2× US Letter (8.5 × 11") tiled',
    );

    // Preflight shows print-media-tiled-2-pages warning with 1-click Switch to Tabloid fix
    await page.getByTestId('studio-tool-preflight').click();
    const tiledIssue = page.getByTestId('preflight-issue-print-media-tiled-2-pages');
    await expect(tiledIssue).toBeVisible();
    await expect(tiledIssue).toContainText('2 tiled pages');

    // Export Print PDF via unified dialog and verify it produces a 2-page US Letter Portrait PDF (215.9 x 279.4 mm)
    await page.getByTestId('studio-export-pdf-btn').click();
    await expect(page.getByTestId('pdf-export-dialog')).toBeVisible();
    const pdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const pdfDownload = await pdfPromise;
    await expect(page.getByTestId('pdf-export-dialog')).toBeHidden();
    expect(pdfDownload.suggestedFilename()).toBe('outer_cover_print.pdf');
    const pdfBytes = await readFile((await pdfDownload.path())!);
    const loadedPdf = await PDFDocument.load(pdfBytes);
    expect(loadedPdf.getPageCount()).toBe(2);
    const page0Size = loadedPdf.getPage(0).getSize();
    expect(Math.round((page0Size.width * 25.4) / 72)).toBe(216);
    expect(Math.round((page0Size.height * 25.4) / 72)).toBe(279);

    // 2. Resize to an oversized book (height 275 mm -> wrap height 318 mm > US Letter printable) -> print-media-overflow error
    await page.getByTestId('input-pb-height').fill('275');
    await page.getByTestId('input-pb-width').fill('190');

    const overflowIssue = page.getByTestId('preflight-issue-print-media-overflow');
    await expect(overflowIssue).toBeVisible();
    await expect(overflowIssue).toContainText('does not fit on US Letter');
    await expect(page.getByTestId('studio-roll-badge')).toHaveAttribute(
      'data-fit-status',
      'does-not-fit',
    );

    // Click the 1-click Quick Fix ("Switch to 13" Roll") -> resolves overflow cleanly!
    await page.getByTestId('preflight-fix-print-media-overflow').click();
    await expect(overflowIssue).toBeHidden();
    await expect(page.getByTestId('studio-roll-badge')).toContainText('13" Roll');
    await expect(page.getByTestId('studio-roll-badge')).toHaveAttribute(
      'data-fit-status',
      'fits-roll',
    );
  });

  test('exercises Unified PDF Export Dialog across Cover Studio, Measure & Cut, and Inner Pockets', async ({
    page,
  }) => {
    // 1. Switch to A6 Softcover Slip Cover with 5 mm spine & 52.5 mm flaps (323 x 170 mm)
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();
    await page.getByTestId('input-pb-thickness').fill('5');
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }).click();
    await page.getByTestId('slider-jacket-flap-width').fill('52.5');

    await expect(page.getByTestId('jacket-flap-width-value')).toContainText('52.5 mm');
    await expect(page.getByTestId('studio-roll-badge')).toContainText('323.0 × 170.0 mm');

    // 2. Open Cover Studio Print PDF dialog -> Legal shows 1 sheet, Letter shows 2 sheets (tiled)
    await page.getByTestId('studio-export-pdf-btn').click();
    const pdfDialog = page.getByTestId('pdf-export-dialog');
    await expect(pdfDialog).toBeVisible();
    await expect(page.getByTestId('pdf-media-option-legal')).toContainText('1 sheet');
    await expect(page.getByTestId('pdf-media-option-letter')).toContainText('2 sheets (tiled)');

    // Select US Legal -> download -> assert 1-page US Legal Landscape (~355.6 x 215.9 mm)
    await page.getByTestId('pdf-media-option-legal').click();
    await expect(page.getByTestId('pdf-media-option-legal')).toHaveAttribute('aria-pressed', 'true');
    const legalDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const legalDownload = await legalDownloadPromise;
    await expect(pdfDialog).toBeHidden();
    const legalPdf = await PDFDocument.load(await readFile((await legalDownload.path())!));
    expect(legalPdf.getPageCount()).toBe(1);
    const legalSize = legalPdf.getPage(0).getSize();
    expect((legalSize.width * 25.4) / 72).toBeCloseTo(355.6, 0);
    expect((legalSize.height * 25.4) / 72).toBeCloseTo(215.9, 0);

    // 3. Re-open Print PDF dialog -> US Letter + 15 mm overlap + registration marks only (guides off)
    await page.getByTestId('studio-export-pdf-btn').click();
    await expect(pdfDialog).toBeVisible();
    await page.getByTestId('pdf-media-option-letter').click();
    await page.getByTestId('pdf-opt-overlap-15').click();
    await expect(page.getByTestId('pdf-opt-overlap-15')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pdf-opt-guides')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('pdf-opt-guides').click();
    await expect(page.getByTestId('pdf-opt-guides')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('pdf-opt-scale-bar')).toBeVisible();

    const tiledDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const tiledDownload = await tiledDownloadPromise;
    await expect(pdfDialog).toBeHidden();
    const tiledPdf = await PDFDocument.load(await readFile((await tiledDownload.path())!));
    expect(tiledPdf.getPageCount()).toBe(2);
    const tiledSize = tiledPdf.getPage(0).getSize();
    expect((tiledSize.width * 25.4) / 72).toBeCloseTo(215.9, 0);
    expect((tiledSize.height * 25.4) / 72).toBeCloseTo(279.4, 0);

    // 4. Switch to Hardcover -> Measure & Cut -> Cut PDF -> 3-Piece Split -> assert 3 pages
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Rigid 3-Board Hardcover/i }).click();
    await page.getByTestId('nav-measure').click();
    await expect(page.getByTestId('measure-and-cut-panel')).toBeVisible();

    await page.getByTestId('measure-download-pdf-btn').click();
    await expect(pdfDialog).toBeVisible();
    await page.getByTestId('pdf-opt-split-three').click();
    await expect(page.getByTestId('pdf-opt-split-three')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pdf-export-summary')).toContainText('3 pages');

    const splitDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const splitDownload = await splitDownloadPromise;
    await expect(pdfDialog).toBeHidden();
    expect(splitDownload.suggestedFilename()).toBe('outer_case_wrap_3piece.pdf');
    const splitPdf = await PDFDocument.load(await readFile((await splitDownload.path())!));
    expect(splitPdf.getPageCount()).toBe(3);

    // 5. Inner Pockets -> Styled Pockets PDF -> toggle Calibration & Legend on + US Legal -> valid PDF
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();
    await page.getByTestId('download-styled-inner-pdf-btn').click();
    await expect(pdfDialog).toBeVisible();
    await page.getByTestId('pdf-opt-legend').click();
    await expect(page.getByTestId('pdf-opt-legend')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('pdf-page-option-legal').click();
    await expect(page.getByTestId('pdf-page-option-legal')).toHaveAttribute('aria-pressed', 'true');

    const innerDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const innerDownload = await innerDownloadPromise;
    await expect(pdfDialog).toBeHidden();
    expect(innerDownload.suggestedFilename()).toBe('inner_pockets_styled.pdf');
    const innerBytes = await readFile((await innerDownload.path())!);
    expect(innerBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const innerPdf = await PDFDocument.load(innerBytes);
    expect(innerPdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  test('directly manipulates Cover Text and Classic Ornaments (drag, resize, Snap to Margin, Flip H/V, and keyboard delete)', async ({
    page,
  }) => {
    // 1. Add generic "Text", rename directly in the text list (stays 1:1 with canvas & textarea), and drag it
    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-cover-text-btn').click();
    const textGroup = page.getByTestId('studio-cover-text-0');
    await expect(textGroup).toBeVisible();
    await expect(textGroup).toContainText('Text');

    const inlineInput = page.getByTestId('cover-text-inline-input-0');
    await expect(inlineInput).toHaveValue('Text');
    await page.getByTestId('cover-text-rename-0').click();
    await inlineInput.fill('Field Notes');
    await inlineInput.press('Enter');
    await expect(inlineInput).toHaveValue('Field Notes');
    await expect(page.getByTestId('cover-text-textarea')).toHaveValue('Field Notes');
    await expect(textGroup).toContainText('Field Notes');

    const textEl = textGroup.locator('text').first();
    const initialTextX = Number(await textEl.getAttribute('x'));
    await textGroup.scrollIntoViewIfNeeded();
    const textBox = await textGroup.boundingBox();
    expect(textBox).not.toBeNull();

    await page.mouse.move(textBox!.x + textBox!.width / 2, textBox!.y + textBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      textBox!.x + textBox!.width / 2 + 50,
      textBox!.y + textBox!.height / 2 + 35,
      { steps: 5 },
    );
    await page.mouse.up();

    const movedTextX = Number(await textEl.getAttribute('x'));
    expect(movedTextX).toBeGreaterThan(initialTextX + 5);

    // 2. Add a Classic Botanical Emblem, drag it on canvas, resize via SE handle, Snap to Classic (12 mm), and Flip H/V
    await page.getByTestId('studio-tool-designs').click();
    await page.getByTestId('add-ornament-emblem-botanical-sprig').click();
    const ornamentGroup = page.getByTestId('studio-ornament-0');
    await expect(ornamentGroup).toBeVisible();

    const ornHitRect = ornamentGroup.locator('rect').first();
    const initialOrnX = Number(await ornHitRect.getAttribute('x'));
    await ornamentGroup.scrollIntoViewIfNeeded();
    const ornBox = await ornamentGroup.boundingBox();
    expect(ornBox).not.toBeNull();

    await page.mouse.move(ornBox!.x + ornBox!.width / 2, ornBox!.y + ornBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      ornBox!.x + ornBox!.width / 2 - 40,
      ornBox!.y + ornBox!.height / 2 - 20,
      { steps: 5 },
    );
    await page.mouse.up();

    const movedOrnX = Number(await ornHitRect.getAttribute('x'));
    expect(movedOrnX).toBeLessThan(initialOrnX - 3);

    // Resize ornament via its SE corner handle
    const widthBeforeResize = Number(await ornHitRect.getAttribute('width'));
    const ornSeHandle = page.getByTestId('ornament-resize-se');
    await expect(ornSeHandle).toBeVisible();
    const seBox = await ornSeHandle.boundingBox();
    expect(seBox).not.toBeNull();

    await page.mouse.move(seBox!.x + seBox!.width / 2, seBox!.y + seBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(seBox!.x + seBox!.width / 2 + 35, seBox!.y + seBox!.height / 2 + 35, {
      steps: 5,
    });
    await page.mouse.up();

    const widthAfterResize = Number(await ornHitRect.getAttribute('width'));
    expect(widthAfterResize).toBeGreaterThan(widthBeforeResize + 2);

    // Snap to Margin preset Classic (12 mm) + Flip H & Flip V
    await page.getByTestId('ornament-fit-classic').click();
    const classicWidth = Number(await ornHitRect.getAttribute('width'));
    expect(classicWidth).toBeGreaterThan(100);

    await page.getByTestId('ornament-flip-h-btn').click();
    await expect(page.getByTestId('ornament-flip-h-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('ornament-flip-v-btn').click();
    await expect(page.getByTestId('ornament-flip-v-btn')).toHaveAttribute('aria-pressed', 'true');

    // Delete selected ornament with Delete key, then select Cover Text and delete with Backspace
    await page.keyboard.press('Delete');
    await expect(ornamentGroup).toBeHidden();

    await textGroup.click();
    await page.keyboard.press('Backspace');
    await expect(textGroup).toBeHidden();
  });

  test('completes full Design Presets lifecycle (Save, Export JSON, Delete, and Re-Import JSON)', async ({
    page,
  }) => {
    await page.getByTestId('studio-front-color-input').fill('#3b2f4a');
    await expect(page.getByTestId('studio-front-fill')).toHaveAttribute('fill', '#3b2f4a');

    // 1. Save a custom preset
    await page.getByTestId('studio-tool-presets').click();
    await page.getByTestId('preset-name-input').fill('Archive Folio Series');
    await page.getByTestId('save-design-preset-btn').click();
    await expect(page.getByTestId('saved-preset-card-0')).toContainText('Archive Folio Series');

    // 2. Export saved presets to JSON and verify valid JSON download
    const exportPromise = page.waitForEvent('download');
    await page.getByTestId('export-presets-btn').click();
    const exportDownload = await exportPromise;
    expect(exportDownload.suggestedFilename()).toBe('bookbinder-series-presets.json');
    const exportedPath = (await exportDownload.path())!;
    const exportedRaw = await readFile(exportedPath, 'utf-8');
    const exportedParsed = JSON.parse(exportedRaw) as { presets?: Array<{ name?: string }> };
    expect(Array.isArray(exportedParsed.presets)).toBe(true);
    expect(exportedParsed.presets?.[0]?.name).toBe('Archive Folio Series');

    // 3. Delete the custom preset from the list
    await page.getByTestId('delete-saved-preset-0').click();
    await expect(page.getByTestId('saved-preset-card-0')).toBeHidden();
    await expect(page.getByTestId('export-presets-btn')).toBeDisabled();

    // 4. Re-import the exported JSON and verify the preset is restored
    await page.getByTestId('import-presets-input').setInputFiles(exportedPath);
    await expect(page.getByTestId('saved-preset-card-0')).toBeVisible();
    await expect(page.getByTestId('saved-preset-card-0')).toContainText('Archive Folio Series');
  });

  test('uploads a custom .woff font in Cover Text and activates it without errors', async ({
    page,
  }) => {
    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-front-title-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toBeVisible();

    const loraWoffPath = path.resolve(
      'node_modules/@fontsource/lora/files/lora-latin-400-normal.woff',
    );
    await page.getByTestId('cover-text-upload-font-input').setInputFiles(loraWoffPath);

    await expect(page.getByTestId('cover-text-custom-font-badge')).toBeVisible();
    await expect(page.getByTestId('cover-text-custom-font-badge')).toContainText(/lora/i);
    await expect(page.getByTestId('status-message')).toContainText('Loaded custom font');
    await expect(page.getByTestId('studio-cover-text-0').locator('text').first()).toHaveAttribute(
      'font-family',
      /lora/i,
    );
  });

  test('supports SVG Stamp render modes and Cricut HTV Back Cover / Full Cover Wrap scopes with Weeding & Registration toggles', async ({
    page,
  }) => {
    // 1. Import a custom SVG stamp in Classic Designs and toggle Outline (stroke) & Fill + Thicken (fill-and-stroke)
    await page.getByTestId('studio-tool-designs').click();
    const customStamp = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,8 62,38 94,50 62,62 50,92 38,62 6,50 38,38" fill="#000"/></svg>',
      'utf-8',
    );
    await page.getByTestId('import-svg-stamp-input').setInputFiles({
      name: 'compass-star.svg',
      mimeType: 'image/svg+xml',
      buffer: customStamp,
    });

    const stampPath = page.getByTestId('studio-ornament-0').locator('path').first();
    await expect(stampPath).toBeVisible();

    const renderModeGroup = page.getByRole('group', { name: 'Custom SVG render mode' });
    await renderModeGroup.getByRole('button', { name: 'Outline' }).click();
    await expect(stampPath).toHaveAttribute('fill', 'none');
    await expect(stampPath).toHaveAttribute('stroke', /.+/);

    await renderModeGroup.getByRole('button', { name: 'Fill + Thicken' }).click();
    await expect(stampPath).not.toHaveAttribute('fill', 'none');
    await expect(stampPath).toHaveAttribute('stroke', /.+/);

    // 2. Add a Back Cover Blurb so Back Cover and Full Wrap both contain lettering
    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-back-blurb-btn').click();
    await page.getByTestId('cover-text-textarea').fill('A timeless folio edition.');

    // 3. Open Cricut HTV SVG dialog -> switch between Back Cover & Full Cover Wrap -> toggle Weeding & Registration off
    await page.getByTestId('studio-open-cricut-btn').click();
    await expect(page.getByTestId('cricut-export-dialog')).toBeVisible();

    await page.getByTestId('cricut-scope-back').click();
    await expect(page.getByTestId('cricut-scope-back')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cricut-svg-preview-img')).toBeVisible();

    await page.getByTestId('cricut-scope-fullwrap').click();
    await expect(page.getByTestId('cricut-scope-fullwrap')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cricut-outer-cut-switch')).toBeVisible();

    await page.getByTestId('cricut-weeding-switch').click();
    await expect(page.getByTestId('cricut-weeding-switch')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('cricut-reg-switch').click();
    await expect(page.getByTestId('cricut-reg-switch')).toHaveAttribute('aria-checked', 'false');

    const fullWrapSvgPromise = page.waitForEvent('download');
    await page.getByTestId('cricut-download-btn').click();
    const fullWrapDownload = await fullWrapSvgPromise;
    expect(fullWrapDownload.suggestedFilename()).toContain('_cricut_htv_fullwrap.svg');

    const svgText = await readFile((await fullWrapDownload.path())!, 'utf-8');
    expect(svgText).toContain('id="spine-lettering"');
    expect(svgText).toContain('id="classic-ornaments"');
    expect(svgText).toContain('id="outer-wrap-cut"');
    expect(svgText).not.toContain('id="htv-weeding-box"');
    expect(svgText).not.toContain('id="alignment-registration-marks"');
    expect(svgText).not.toContain('<text');
    expect(svgText).not.toContain('transform=');
  });

  test('supports Inner Pockets full-screen expand/Escape, Full Cut Envelope clip scope, and Flip H/V toggles', async ({
    page,
  }) => {
    await page.getByTestId('nav-pockets').click();
    await expect(page.getByTestId('inner-pockets-studio')).toBeVisible();

    // 1. Expand cutting mat to full screen and exit cleanly via Escape
    const pocketsStage = page.getByTestId('pockets-canvas-stage');
    await expect(pocketsStage).toHaveAttribute('data-expanded', 'false');
    await page.getByTestId('pockets-fullscreen-btn').click();
    await expect(pocketsStage).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByTestId('pockets-exit-fullscreen-btn')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(pocketsStage).toHaveAttribute('data-expanded', 'false');
    await expect(page.getByTestId('pockets-exit-fullscreen-btn')).toBeHidden();

    // 2. Upload artwork, switch clip scope to Full Cut Envelope, and toggle Flip H / Flip V
    const endpaperPng = createSolidPngBuffer(64, 64, 52, 95, 118);
    await page.getByTestId('pocket-upload-image-input').setInputFiles({
      name: 'endpaper-motif.png',
      mimeType: 'image/png',
      buffer: endpaperPng,
    });
    const pocketLayer = page.getByTestId('pocket-layer-0');
    await expect(pocketLayer).toBeVisible();

    await page.getByTestId('pocket-scope-select').click();
    await page.getByRole('option', { name: /Full Cut Envelope/i }).click();
    await expect(page.getByTestId('pocket-scope-select')).toContainText('Full Cut Envelope');

    await expect(page.getByTestId('pocket-layer-flip-h-btn')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.getByTestId('pocket-layer-flip-h-btn').click();
    await expect(page.getByTestId('pocket-layer-flip-h-btn')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(pocketLayer).toHaveAttribute('transform', /scale\(-1 1\)/);

    await page.getByTestId('pocket-layer-flip-v-btn').click();
    await expect(page.getByTestId('pocket-layer-flip-v-btn')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(pocketLayer).toHaveAttribute('transform', /scale\(-1 -1\)/);
  });

  test('supports Replacement Paperback Cover (flush 1-sheet US Letter PDF) and Classic Dust Jacket (70 mm flaps, 4 folds, 0 glue tabs, Cut PDF)', async ({
    page,
  }) => {
    // 1. Set A6 (105 x 148 x 10 mm) and switch to Replacement Paperback Cover
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: /A6 Pocket Notebook/i }).click();
    await page.getByTestId('input-pb-thickness').fill('10');

    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Replacement Paperback Cover/i }).click();

    await expect(page.getByTestId('studio-roll-badge')).toContainText('220.0 × 148.0 mm');
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Not Needed');
    await expect(page.getByTestId('softcover-flap-controls')).toBeHidden();

    // Print PDF dialog shows 1 sheet on US Letter and downloads a valid 1-page US Letter PDF
    await page.getByTestId('studio-export-pdf-btn').click();
    const pdfDialog = page.getByTestId('pdf-export-dialog');
    await expect(pdfDialog).toBeVisible();
    await expect(page.getByTestId('pdf-media-option-letter')).toContainText('1 sheet');
    await page.getByTestId('pdf-media-option-letter').click();

    const pbPdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const pbPdfDownload = await pbPdfPromise;
    await expect(pdfDialog).toBeHidden();
    const pbPdf = await PDFDocument.load(await readFile((await pbPdfDownload.path())!));
    expect(pbPdf.getPageCount()).toBe(1);
    const pbPageSize = pbPdf.getPage(0).getSize();
    expect((pbPageSize.width * 25.4) / 72).toBeCloseTo(279.4, 0);
    expect((pbPageSize.height * 25.4) / 72).toBeCloseTo(215.9, 0);

    // 2. Switch to Classic Dust Jacket -> Jacket Flap Width controls + Classic (70 mm) preset
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Classic Dust Jacket/i }).click();

    const flapControls = page.getByTestId('softcover-flap-controls');
    await expect(flapControls).toBeVisible();
    await expect(flapControls).toContainText('Jacket Flap Width');
    await expect(page.getByTestId('pockets-builtin-badge')).toHaveText('Not Needed');

    await page.getByTestId('flap-preset-deep').click();
    await expect(page.getByTestId('jacket-flap-width-value')).toContainText('70.0 mm');
    await expect(page.getByTestId('studio-roll-badge')).toContainText('363.5 × 148.0 mm');

    // Measure & Cut blueprint shows BACK FLAP / FRONT FLAP, 4 vertical fold lines, and 0 GLUE tabs
    await page.getByTestId('nav-measure').click();
    const outerSvg = page.getByTestId('outer-blueprint-svg');
    await expect(outerSvg).toContainText('BACK FLAP');
    await expect(outerSvg).toContainText('FRONT FLAP');
    await expect(outerSvg.getByTestId('blueprint-fold-line')).toHaveCount(4);
    await expect(outerSvg.getByText('GLUE', { exact: true })).toHaveCount(0);

    // Open Cut PDF dialog and download a valid Dust Jacket Cut PDF
    await page.getByTestId('measure-download-pdf-btn').click();
    await expect(pdfDialog).toBeVisible();
    await expect(page.getByTestId('pdf-media-option-tabloid')).toContainText('1 sheet');
    await page.getByTestId('pdf-media-option-tabloid').click();

    const djPdfPromise = page.waitForEvent('download');
    await page.getByTestId('pdf-export-confirm-btn').click();
    const djPdfDownload = await djPdfPromise;
    await expect(pdfDialog).toBeHidden();
    const djPdf = await PDFDocument.load(await readFile((await djPdfDownload.path())!));
    expect(djPdf.getPageCount()).toBe(1);
  });

  test('warns inline and in Preflight when Dust Jacket flaps are too shallow for page width, and resolves via 1-click quick fixes', async ({
    page,
  }) => {
    // 1. Default Trade Digest (140 mm wide) -> switch to Classic Dust Jacket (default 70 mm flaps >= 63.0 mm rec.)
    await page.getByTestId('binding-style-select').click();
    await page.getByRole('option', { name: /Classic Dust Jacket/i }).click();

    await expect(page.getByTestId('flap-depth-ok')).toBeVisible();
    await expect(page.getByTestId('flap-shallow-warning')).toBeHidden();

    // 2. Narrow flaps to 25 mm -> inline amber warning + Preflight flap-too-shallow issue + canvas flap highlights
    const flapSlider = page.getByTestId('slider-jacket-flap-width');
    await flapSlider.fill('25');

    const shallowWarning = page.getByTestId('flap-shallow-warning');
    await expect(shallowWarning).toBeVisible();
    await expect(shallowWarning).toContainText('63.0 mm');
    await expect(page.getByTestId('studio-preflight-overlays')).toBeVisible();

    await page.getByTestId('studio-tool-preflight').click();
    const preflightIssue = page.getByTestId('preflight-issue-flap-too-shallow');
    await expect(preflightIssue).toBeVisible();
    await expect(preflightIssue).toContainText('63 mm');

    // 3. Resolve via Preflight 1-click quick fix -> clears both Preflight issue and inline slider warning
    await page.getByTestId('preflight-fix-flap-too-shallow').click();
    await expect(preflightIssue).toBeHidden();
    await expect(shallowWarning).toBeHidden();
    await expect(page.getByTestId('flap-depth-ok')).toBeVisible();
    await expect(page.getByTestId('jacket-flap-width-value')).toContainText('63.0 mm');

    // 4. Narrow flaps again to 25 mm and resolve via inline slider button ("Use 63.0 mm")
    await flapSlider.fill('25');
    await expect(shallowWarning).toBeVisible();
    await expect(preflightIssue).toBeVisible();

    await page.getByTestId('flap-set-recommended-btn').click();
    await expect(shallowWarning).toBeHidden();
    await expect(preflightIssue).toBeHidden();
    await expect(page.getByTestId('flap-depth-ok')).toBeVisible();
    await expect(page.getByTestId('jacket-flap-width-value')).toContainText('63.0 mm');
  });
});
