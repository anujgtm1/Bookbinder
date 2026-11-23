/** Decodes a data URL or image source into a loaded `HTMLImageElement`. */
export function loadHtmlImage(
  src: string,
  errorMessage = 'Failed to decode cover artwork image.',
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(errorMessage));
    img.src = src;
  });
}

/** Encodes an `HTMLCanvasElement` into PNG bytes, falling back to `toDataURL` if `toBlob` is unavailable. */
export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      return new Uint8Array(await blob.arrayBuffer());
    }
  }
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
