import { describe, expect, it } from 'vitest';
import { clientPointToSvgMm, isSupportedImageFile } from './useInteractiveLayers';

describe('useInteractiveLayers helpers', () => {
  it('validates supported PNG, JPG, and WEBP image files by MIME type or extension', () => {
    expect(isSupportedImageFile(new File([''], 'cover.png', { type: 'image/png' }))).toBe(true);
    expect(isSupportedImageFile(new File([''], 'cover.JPG', { type: '' }))).toBe(true);
    expect(isSupportedImageFile(new File([''], 'pattern.webp', { type: 'image/webp' }))).toBe(true);
    expect(isSupportedImageFile(new File([''], 'notes.pdf', { type: 'application/pdf' }))).toBe(
      false,
    );
  });

  it('falls back cleanly to bounding-box viewBox projection when getScreenCTM is unavailable', () => {
    const fakeSvg = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }),
    } as unknown as SVGSVGElement;

    // Midpoint of client rect -> midpoint of viewBox (-16..384, -16..184)
    const pt = clientPointToSvgMm(fakeSvg, 300, 150, {
      x: -16,
      y: -16,
      width: 400,
      height: 200,
    });
    expect(pt).toEqual({ xMm: 184, yMm: 84 });
    expect(clientPointToSvgMm(null, 0, 0, { x: 0, y: 0, width: 100, height: 100 })).toBeNull();
  });
});
