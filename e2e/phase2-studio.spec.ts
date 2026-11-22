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

test.describe('Phase 2 — Cover & Spine Styler', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('nav-studio').click();
    await expect(page.getByTestId('cover-styler')).toBeVisible();
  });

  test('uploads cover artwork, samples color with eyedropper, and styles spine typography', async ({
    page,
  }) => {
    // Upload a crimson (#c82832) PNG cover image
    const pngBuffer = createSolidPngBuffer(64, 96, 200, 40, 50);
    await page.getByTestId('studio-upload-image-input').setInputFiles({
      name: 'crimson-cover.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    await expect(page.getByTestId('studio-image-front')).toBeVisible();

    // Activate Eyedropper (Spine + Back) and click on the right side (front cover artwork)
    await page.getByTestId('studio-eyedropper-both-btn').click();
    await expect(page.getByTestId('eyedropper-active-banner')).toBeVisible();

    const previewSvg = page.getByTestId('studio-preview-svg');
    await previewSvg.scrollIntoViewIfNeeded();
    const box = await previewSvg.boundingBox();
    expect(box).not.toBeNull();
    await previewSvg.click({ position: { x: box!.width * 0.8, y: box!.height * 0.5 } });

    // Spine and Back fills should now match sampled crimson #c82832
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

    await page.getByTestId('studio-full-wrap-toggle').click();
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
});
