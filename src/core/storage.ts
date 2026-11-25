import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';

export const PROJECT_STORAGE_KEY = 'bookbinder.project.v1';

export interface SaveProjectResult {
  readonly saved: boolean;
  readonly omittedImageForQuota: boolean;
}

export function loadProjectFromStorage(storage: Storage | null = safeLocalStorage()): BookbinderProject {
  if (!storage) {
    return BookbinderProjectModel.create();
  }
  try {
    const raw = storage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) {
      return BookbinderProjectModel.create();
    }
    const parsed = BookbinderProjectModel.fromJson(raw);
    return parsed.ok ? parsed.project : BookbinderProjectModel.create();
  } catch {
    return BookbinderProjectModel.create();
  }
}

export function saveProjectToStorage(
  project: BookbinderProject,
  storage: Storage | null = safeLocalStorage(),
): SaveProjectResult {
  if (!storage) {
    return { saved: false, omittedImageForQuota: false };
  }
  try {
    storage.setItem(PROJECT_STORAGE_KEY, BookbinderProjectModel.toJson(project));
    return { saved: true, omittedImageForQuota: false };
  } catch {
    // Retry without embedded cover image dataUrl in case of localStorage quota limit
    try {
      storage.setItem(
        PROJECT_STORAGE_KEY,
        BookbinderProjectModel.toJson(project, { includeImageData: false }),
      );
      return { saved: true, omittedImageForQuota: true };
    } catch {
      return { saved: false, omittedImageForQuota: false };
    }
  }
}

export function clearProjectStorage(storage: Storage | null = safeLocalStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PROJECT_STORAGE_KEY);
  } catch {
    // Ignore storage access errors in restricted browsing contexts
  }
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }, 1000);
}

export function triggerTextDownload(content: string, filename: string, mimeType: string): void {
  triggerBlobDownload(new Blob([content], { type: mimeType }), filename);
}

export function triggerBytesDownload(bytes: Uint8Array, filename: string, mimeType: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  triggerBlobDownload(new Blob([copy], { type: mimeType }), filename);
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
