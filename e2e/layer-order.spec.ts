import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createSolidPngBuffer(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const row = Buffer.alloc(1 + width * 4);
  row[0] = 0;
  for (let x = 0; x < width; x++) {
    row[1 + x * 4] = r;
    row[2 + x * 4] = g;
    row[3 + x * 4] = b;
    row[4 + x * 4] = 255;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function getCanvasElementTestIds(page: Page): Promise<string[]> {
  const nodes = await page
    .locator(
      '[data-testid="studio-preview-svg"] [data-testid^="studio-layer-"]:not([data-testid^="studio-layer-scrim-"]), [data-testid="studio-preview-svg"] [data-testid^="studio-ornament-"], [data-testid="studio-preview-svg"] [data-testid^="studio-cover-text-"]',
    )
    .all();
  return Promise.all(nodes.map(async (node) => (await node.getAttribute('data-testid')) ?? ''));
}

async function getPanelKindsTopDown(page: Page): Promise<string[]> {
  const rows = await page.locator('[data-testid="layer-stack-list"] > li').all();
  return Promise.all(rows.map(async (row) => (await row.getAttribute('data-layer-kind')) ?? ''));
}

test.describe('Unified Front-to-Back Layer Ordering (Cross-Type Z-Order)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('reorders image, ornament, and text across types in 2D, Layer Stack panel, Undo, 3D preview, and Affinity SVG export', async ({
    page,
  }) => {
    // 1. Place an image, an ornament, and cover text on the cover
    const coverPng = createSolidPngBuffer(64, 96, 178, 72, 48);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'crimson-cover.png',
      mimeType: 'image/png',
      buffer: coverPng,
    });
    await expect(page.getByTestId('studio-layer-0')).toBeVisible();

    await page.getByTestId('studio-tool-designs').click();
    await page.getByTestId('add-ornament-frame-double-rule').click();
    await expect(page.getByTestId('studio-ornament-0')).toBeVisible();

    await page.getByTestId('studio-tool-text').click();
    await page.getByTestId('add-front-title-btn').click();
    await expect(page.getByTestId('studio-cover-text-0')).toBeVisible();

    // Verify initial 2D bottom-to-top DOM order: image -> ornament -> text
    expect(await getCanvasElementTestIds(page)).toEqual([
      'studio-layer-0',
      'studio-ornament-0',
      'studio-cover-text-0',
    ]);

    // 2. Open unified All Layers panel -> verify top-most first visual order (text -> ornament -> image)
    const layersToggle = page.getByTestId('layer-stack-toggle-btn');
    await expect(layersToggle).toContainText('Layers (3)');
    await layersToggle.click();
    await expect(page.getByTestId('layer-stack-panel')).toBeVisible();
    expect(await getPanelKindsTopDown(page)).toEqual(['text', 'ornament', 'image']);

    // Capture the element IDs from the 2D canvas
    const imageId = await page.getByTestId('studio-layer-0').getAttribute('data-layer-id');
    const ornamentId = await page.getByTestId('studio-ornament-0').getAttribute('data-ornament-id');
    const textId = await page.getByTestId('studio-cover-text-0').getAttribute('data-text-id');
    expect(imageId).toBeTruthy();
    expect(ornamentId).toBeTruthy();
    expect(textId).toBeTruthy();

    // 3. Select the Image via Layer Stack panel and click Bring to Front in CanvasSelectionBar
    await page.getByTestId(`layer-stack-select-${imageId}`).click();
    await expect(page.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'image',
    );
    await expect(page.getByTestId('selection-send-back-btn')).toBeDisabled();
    await expect(page.getByTestId('selection-bring-front-btn')).toBeEnabled();

    await page.getByTestId('selection-bring-front-btn').click();

    // Assert studio-layer-0 now sits AFTER studio-ornament-0 and studio-cover-text-0 in SVG DOM
    expect(await getCanvasElementTestIds(page)).toEqual([
      'studio-ornament-0',
      'studio-cover-text-0',
      'studio-layer-0',
    ]);
    expect(await getPanelKindsTopDown(page)).toEqual(['image', 'text', 'ornament']);
    await expect(page.getByTestId('selection-bring-front-btn')).toBeDisabled();
    await expect(page.getByTestId('selection-bring-forward-btn')).toBeDisabled();

    // 4. Select the Text layer and click Send Backward -> Text moves behind Ornament
    await page.getByTestId(`layer-stack-select-${textId}`).click();
    await expect(page.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'text',
    );
    await page.getByTestId('selection-send-backward-btn').click();

    expect(await getCanvasElementTestIds(page)).toEqual([
      'studio-cover-text-0',
      'studio-ornament-0',
      'studio-layer-0',
    ]);
    expect(await getPanelKindsTopDown(page)).toEqual(['image', 'ornament', 'text']);

    // 5. Undo restores prior z-order (ornament -> text -> image)
    await page.keyboard.press('ControlOrMeta+z');
    expect(await getCanvasElementTestIds(page)).toEqual([
      'studio-ornament-0',
      'studio-cover-text-0',
      'studio-layer-0',
    ]);
    expect(await getPanelKindsTopDown(page)).toEqual(['image', 'text', 'ornament']);

    // Move Ornament up in the unified Layer Stack panel -> text -> ornament -> image
    await page.getByTestId(`layer-stack-up-${ornamentId}`).click();
    expect(await getCanvasElementTestIds(page)).toEqual([
      'studio-cover-text-0',
      'studio-ornament-0',
      'studio-layer-0',
    ]);

    // 6. Switch to 3D Book Preview -> verify front face SVG preserves exact custom stacking order
    await page.getByTestId('studio-view-3d-btn').click();
    await expect(page.getByTestId('book3d-front-face')).toBeVisible();
    const face3dNodes = await page
      .locator(
        '[data-testid="book3d-front-face"] svg [data-layer-id], [data-testid="book3d-front-face"] svg [data-ornament-id], [data-testid="book3d-front-face"] svg [data-text-id]',
      )
      .all();
    const face3dOrder = await Promise.all(
      face3dNodes.map(
        async (node) =>
          (await node.getAttribute('data-layer-id')) ??
          (await node.getAttribute('data-ornament-id')) ??
          (await node.getAttribute('data-text-id')) ??
          '',
      ),
    );
    expect(face3dOrder).toEqual([textId, ornamentId, imageId]);

    // 7. Export Affinity SVG -> verify custom stacking order is preserved in exported SVG markup
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('studio-export-svg-btn').click(),
    ]);
    expect(download.suggestedFilename()).toBe('outer_cover_300dpi.svg');
    const svgPath = await download.path();
    expect(svgPath).toBeTruthy();
    const svgText = await readFile(svgPath!, 'utf-8');
    expect(svgText).toContain('<g id="cover-layers">');

    const textIdx = svgText.indexOf(`data-text-id="${textId}"`);
    const ornIdx = svgText.indexOf(`data-ornament-id="${ornamentId}"`);
    const imgIdx = svgText.indexOf(`data-layer-id="${imageId}"`);
    expect(textIdx).toBeGreaterThan(-1);
    expect(ornIdx).toBeGreaterThan(textIdx);
    expect(imgIdx).toBeGreaterThan(ornIdx);
  });
});
