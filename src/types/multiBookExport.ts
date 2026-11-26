import type { ProjectId } from './projectLibrary';

export type MultiBookExportTarget = 'cover-styled' | 'outer-blueprint';

export interface SavedProjectQueueEntry {
  readonly kind: 'saved-project';
  readonly id: string;
  readonly projectId: ProjectId;
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly copies: number;
}

export interface UploadedPdfQueueEntry {
  readonly kind: 'uploaded-pdf';
  readonly id: string;
  readonly label: string;
  readonly pdfBytes: Uint8Array;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly copies: number;
}

export type MultiBookQueueEntry = SavedProjectQueueEntry | UploadedPdfQueueEntry;

export function isSavedProjectQueueEntry(
  entry: MultiBookQueueEntry,
): entry is SavedProjectQueueEntry {
  return entry.kind === 'saved-project';
}

export function isUploadedPdfQueueEntry(
  entry: MultiBookQueueEntry,
): entry is UploadedPdfQueueEntry {
  return entry.kind === 'uploaded-pdf';
}

export function clampQueueEntryCopies(copies: number): number {
  if (!Number.isFinite(copies)) return 1;
  return Math.max(1, Math.floor(copies));
}
