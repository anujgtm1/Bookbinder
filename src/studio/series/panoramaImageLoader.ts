import { loadHtmlImage } from '@/lib/canvasImage';

export interface LoadedPanoramaImage {
  readonly dataUrl: string;
  readonly fileName: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

const SUPPORTED_PANORAMA_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'] as const;

export function isSupportedPanoramaImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return SUPPORTED_PANORAMA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not decode image file.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/** Reads a PNG, JPG, WebP, or SVG File into a data URL with decoded natural pixel dimensions. */
export async function readPanoramaImageFile(file: File): Promise<LoadedPanoramaImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadHtmlImage(dataUrl, 'Could not load panoramic artwork image.');
  return {
    dataUrl,
    fileName: file.name || 'pasted-panorama.png',
    naturalWidth: img.naturalWidth || 1800,
    naturalHeight: img.naturalHeight || 600,
  };
}
