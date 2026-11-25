import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import {
  DEFAULT_THUMBNAIL_MAX_WIDTH_PX,
  computeThumbnailDimensions,
  renderProjectThumbnailDataUrl,
} from './thumbnailRenderer';

describe('thumbnailRenderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('computeThumbnailDimensions', () => {
    it('computes aspect-preserving pixel dimensions and low render DPI for default width', () => {
      const params = BookParametersModel.createDefault();
      const geometry = calculateCaseGeometry(params);
      const dims = computeThumbnailDimensions(geometry);

      const expectedTotalW = geometry.outerWrap.widthMm + geometry.outerWrap.bleedMm * 2;
      const expectedTotalH = geometry.outerWrap.heightMm + geometry.outerWrap.bleedMm * 2;
      const expectedHeightPx = Math.round(
        (DEFAULT_THUMBNAIL_MAX_WIDTH_PX * expectedTotalH) / expectedTotalW,
      );

      expect(dims.widthPx).toBe(DEFAULT_THUMBNAIL_MAX_WIDTH_PX);
      expect(dims.heightPx).toBe(expectedHeightPx);
      expect(dims.renderDpi).toBeGreaterThanOrEqual(12);
      expect(dims.renderDpi).toBeLessThanOrEqual(150);
    });

    it('clamps extreme maxWidthPx values and respects includeBleed=false', () => {
      const noBleedParams = BookParametersModel.clampAndNormalize({
        includeBleed: false,
        bleedMm: 10,
      });
      const geometry = calculateCaseGeometry(noBleedParams);

      const tiny = computeThumbnailDimensions(geometry, 5);
      expect(tiny.widthPx).toBe(32);

      const huge = computeThumbnailDimensions(geometry, 5000);
      expect(huge.widthPx).toBe(1024);

      const custom = computeThumbnailDimensions(geometry, 200);
      const expectedHeight = Math.round(
        (200 * geometry.outerWrap.heightMm) / geometry.outerWrap.widthMm,
      );
      expect(custom.heightPx).toBe(expectedHeight);
    });
  });

  describe('renderProjectThumbnailDataUrl', () => {
    it('returns null gracefully when 2D canvas context is unavailable (e.g. jsdom)', async () => {
      const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
      const studio = CoverStudioModel.createDefault();

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

      const result = await renderProjectThumbnailDataUrl(geometry, studio);
      expect(result).toBeNull();
    });

    it('exports a JPEG data URL when a 2D canvas context is available', async () => {
      const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
      const studio = CoverStudioModel.createDefault();

      const fakeCtx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineJoin: 'round',
        lineCap: 'round',
        textAlign: 'center',
        textBaseline: 'middle',
        font: '',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        drawImage: vi.fn(),
        fillText: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx);
      const toDataUrlSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockReturnValue('data:image/jpeg;base64,/9j/FAKE');

      const result = await renderProjectThumbnailDataUrl(geometry, studio, {
        maxWidthPx: 200,
        quality: 0.72,
      });

      expect(result).toBe('data:image/jpeg;base64,/9j/FAKE');
      expect(toDataUrlSpy).toHaveBeenCalledWith('image/jpeg', 0.72);
    });

    it('returns null if canvas.toDataURL throws or emits an empty data URL', async () => {
      const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
      const studio = CoverStudioModel.createDefault();

      const fakeCtx = {
        fillStyle: '',
        textAlign: 'center',
        textBaseline: 'middle',
        font: '',
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx);
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,');

      expect(await renderProjectThumbnailDataUrl(geometry, studio)).toBeNull();
    });
  });
});
