import type { BindingStyle } from './bookParams';
import { BookbinderProjectModel, type BookbinderProject } from './project';
import { roundTo } from './units';

export type ProjectId = string & { readonly __brand: 'ProjectId' };

export const PROJECT_LIBRARY_BUNDLE_VERSION = 1 as const;

export interface SavedCustomFontRecord {
  readonly familyName: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly pdfEmbeddable: boolean;
}

export interface WrapPdfDimensions {
  readonly wrapPdfWidthMm: number;
  readonly wrapPdfHeightMm: number;
}

export interface SavedProjectSummary {
  readonly id: ProjectId;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly bindingStyle: BindingStyle;
  readonly pbWidthMm: number;
  readonly pbHeightMm: number;
  readonly pbThicknessMm: number;
  readonly wrapPdfWidthMm: number;
  readonly wrapPdfHeightMm: number;
  readonly thumbnailDataUrl: string | null;
  readonly hasCustomFont: boolean;
}

export interface SavedProjectRecord {
  readonly id: ProjectId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly project: BookbinderProject;
  readonly thumbnailDataUrl: string | null;
  readonly customFont?: SavedCustomFontRecord | null;
}

export interface ProjectLibraryBundle {
  readonly schemaVersion: typeof PROJECT_LIBRARY_BUNDLE_VERSION;
  readonly exportedAt: string;
  readonly projects: readonly BookbinderProject[];
}

export type ProjectLibraryBundleParseResult =
  | {
      readonly ok: true;
      readonly bundle: ProjectLibraryBundle;
      readonly skippedCount: number;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

const BINDING_STYLE_SET: Readonly<Record<BindingStyle, true>> = {
  'rigid-case': true,
  'flexible-spine': true,
  'softcover-jacket': true,
  'dust-jacket': true,
  'paperback-wrap': true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBindingStyle(value: unknown): value is BindingStyle {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BINDING_STYLE_SET, value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function isProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asProjectId(raw: string): ProjectId {
  const trimmed = raw.trim();
  if (!isProjectId(trimmed)) {
    throw new Error('ProjectId must be a non-empty string.');
  }
  return trimmed;
}

export function createProjectId(): ProjectId {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return asProjectId(globalThis.crypto.randomUUID());
  }
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return asProjectId(`book-${timePart}-${randomPart}`);
}

export function deserializeSavedCustomFont(raw: unknown): SavedCustomFontRecord | null {
  if (!isRecord(raw)) {
    return null;
  }
  const { familyName, fileName, bytes, pdfEmbeddable } = raw;
  if (
    typeof familyName !== 'string' ||
    familyName.trim().length === 0 ||
    typeof fileName !== 'string' ||
    fileName.trim().length === 0 ||
    typeof pdfEmbeddable !== 'boolean'
  ) {
    return null;
  }

  let normalizedBytes: Uint8Array | null = null;
  if (bytes instanceof Uint8Array) {
    normalizedBytes = new Uint8Array(bytes);
  } else if (bytes instanceof ArrayBuffer) {
    normalizedBytes = new Uint8Array(bytes.slice(0));
  } else if (ArrayBuffer.isView(bytes)) {
    normalizedBytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  if (!normalizedBytes || normalizedBytes.byteLength === 0) {
    return null;
  }

  return {
    familyName: familyName.trim(),
    fileName: fileName.trim(),
    bytes: normalizedBytes,
    pdfEmbeddable,
  };
}

export function deserializeSavedProjectSummary(raw: unknown): SavedProjectSummary | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (!isProjectId(raw.id)) {
    return null;
  }
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    return null;
  }
  if (!isValidIsoTimestamp(raw.createdAt) || !isValidIsoTimestamp(raw.updatedAt)) {
    return null;
  }
  if (!isBindingStyle(raw.bindingStyle)) {
    return null;
  }
  if (
    !isFiniteNumber(raw.pbWidthMm) ||
    !isFiniteNumber(raw.pbHeightMm) ||
    !isFiniteNumber(raw.pbThicknessMm) ||
    !isFiniteNumber(raw.wrapPdfWidthMm) ||
    !isFiniteNumber(raw.wrapPdfHeightMm)
  ) {
    return null;
  }
  const thumbnailDataUrl =
    typeof raw.thumbnailDataUrl === 'string' && raw.thumbnailDataUrl.length > 0
      ? raw.thumbnailDataUrl
      : null;

  return {
    id: asProjectId(raw.id),
    name: raw.name.trim(),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    bindingStyle: raw.bindingStyle,
    pbWidthMm: raw.pbWidthMm,
    pbHeightMm: raw.pbHeightMm,
    pbThicknessMm: raw.pbThicknessMm,
    wrapPdfWidthMm: raw.wrapPdfWidthMm,
    wrapPdfHeightMm: raw.wrapPdfHeightMm,
    thumbnailDataUrl,
    hasCustomFont: Boolean(raw.hasCustomFont),
  };
}

export const ProjectLibraryModel = {
  createProjectId,

  deriveSummary(
    record: SavedProjectRecord,
    wrapPdfDims: WrapPdfDimensions,
  ): SavedProjectSummary {
    const { parameters } = record.project;
    return {
      id: record.id,
      name: record.project.name.trim() || 'Untitled Hardcover Case',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      bindingStyle: parameters.bindingStyle,
      pbWidthMm: parameters.pbWidthMm,
      pbHeightMm: parameters.pbHeightMm,
      pbThicknessMm: parameters.pbThicknessMm,
      wrapPdfWidthMm: roundTo(wrapPdfDims.wrapPdfWidthMm, 2),
      wrapPdfHeightMm: roundTo(wrapPdfDims.wrapPdfHeightMm, 2),
      thumbnailDataUrl: record.thumbnailDataUrl,
      hasCustomFont: Boolean(record.customFont),
    };
  },

  serializeBundle(
    projects: readonly BookbinderProject[],
    exportedAt?: string,
  ): ProjectLibraryBundle {
    const timestamp = isValidIsoTimestamp(exportedAt)
      ? exportedAt
      : new Date().toISOString();
    return {
      schemaVersion: PROJECT_LIBRARY_BUNDLE_VERSION,
      exportedAt: timestamp,
      projects: projects.map((project) => BookbinderProjectModel.serialize(project)),
    };
  },

  toBundleJson(projects: readonly BookbinderProject[], exportedAt?: string): string {
    return JSON.stringify(this.serializeBundle(projects, exportedAt), null, 2);
  },

  isLibraryBundleCandidate(raw: unknown): boolean {
    return isRecord(raw) && Array.isArray(raw.projects);
  },

  fromUnknownBundle(raw: unknown): ProjectLibraryBundleParseResult {
    if (!isRecord(raw)) {
      return { ok: false, error: 'Library backup file must be a JSON object.' };
    }

    if (
      raw.schemaVersion !== undefined &&
      raw.schemaVersion !== PROJECT_LIBRARY_BUNDLE_VERSION
    ) {
      return {
        ok: false,
        error: `Unsupported library backup schema version: ${String(raw.schemaVersion)}.`,
      };
    }

    if (!Array.isArray(raw.projects)) {
      return {
        ok: false,
        error: 'Missing or invalid "projects" array in library backup file.',
      };
    }

    const validProjects: BookbinderProject[] = [];
    let skippedCount = 0;

    for (const entry of raw.projects) {
      const parsed = BookbinderProjectModel.fromUnknown(entry);
      if (parsed.ok) {
        validProjects.push(parsed.project);
      } else {
        skippedCount += 1;
      }
    }

    if (validProjects.length === 0) {
      return {
        ok: false,
        error: 'No valid projects found in library backup file.',
      };
    }

    const exportedAt = isValidIsoTimestamp(raw.exportedAt)
      ? raw.exportedAt
      : new Date().toISOString();

    return {
      ok: true,
      bundle: {
        schemaVersion: PROJECT_LIBRARY_BUNDLE_VERSION,
        exportedAt,
        projects: validProjects,
      },
      skippedCount,
    };
  },

  fromBundleJson(jsonText: string): ProjectLibraryBundleParseResult {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      return this.fromUnknownBundle(parsed);
    } catch {
      return { ok: false, error: 'Invalid JSON syntax in library backup file.' };
    }
  },
} as const;
