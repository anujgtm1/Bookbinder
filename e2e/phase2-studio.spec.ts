import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

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

test.describe('Phase 2 — Interactive Cover & Spine Styler', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('nav-studio').click();
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

    // Select 1st layer (crimson) and Quick-Fit to Front, then sample its crimson color via Eyedropper
    await page.getByTestId('layer-select-0').click();
    await page.getByTestId('quick-fit-front').click();

    await page.getByTestId('studio-eyedropper-both-btn').click();
    await expect(page.getByTestId('eyedropper-active-banner')).toBeVisible();

    const previewSvg = page.getByTestId('studio-preview-svg');
    await previewSvg.scrollIntoViewIfNeeded();
    const box = await previewSvg.boundingBox();
    expect(box).not.toBeNull();
    await previewSvg.click({ position: { x: box!.width * 0.85, y: box!.height * 0.5 } });

    await expect(page.getByTestId('studio-spine-fill')).toHaveAttribute('fill', '#c82832');
    await expect(page.getByTestId('studio-back-fill')).toHaveAttribute('fill', '#c82832');

    // Add spine title & author and switch layout to Stacked + European orientation
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
    await page.getByTestId('studio-spine-title-input').fill('Piranesi');
    await page.getByTestId('studio-spine-author-input').fill('Susanna Clarke');

    // 1. Export Print-Ready PDF (300 DPI + vector typography)
    const pdfPromise = page.waitForEvent('download');
    await page.getByTestId('studio-export-pdf-btn').click();
    const pdfDownload = await pdfPromise;
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
    await expect(page.getByTestId('preflight-issue-front-board-gap')).toBeVisible();

    // One-click Fit to Front clears the red coverage gap immediately
    await page.getByTestId('preflight-fix-front-board-gap').click();
    await expect(page.getByTestId('preflight-issue-front-board-gap')).toBeHidden();
    await expect(page.getByTestId('preflight-status-badge')).toHaveText('All Checks Passed');

    // Trigger low-contrast spine text error, verify red spine highlight, then resolve with one-click ink fix
    await page.getByTestId('studio-spine-title-input').fill('DUNE');
    await page.getByTestId('studio-spine-text-color').fill('#243f57');
    await expect(page.getByTestId('preflight-issue-spine-low-contrast-error')).toBeVisible();
    await expect(page.getByTestId('studio-preflight-overlays')).toBeVisible();

    await page.getByTestId('preflight-fix-spine-low-contrast-error').click();
    await expect(page.getByTestId('preflight-issue-spine-low-contrast-error')).toBeHidden();
    await expect(page.getByTestId('preflight-status-badge')).toHaveText('All Checks Passed');
  });
});
