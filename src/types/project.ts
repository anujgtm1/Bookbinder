import { BookParametersModel, type BookParameters } from './bookParams';
import { CoverStudioModel, type CoverStudioState } from './studio';

export const PROJECT_SCHEMA_VERSION = 1 as const;

export interface BookbinderProject {
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly name: string;
  readonly updatedAt: string;
  readonly parameters: BookParameters;
  readonly studio: CoverStudioState;
}

export type ProjectParseResult =
  | { readonly ok: true; readonly project: BookbinderProject }
  | { readonly ok: false; readonly error: string };

export const BookbinderProjectModel = {
  create(
    parameters: BookParameters = BookParametersModel.createDefault(),
    studio: CoverStudioState = CoverStudioModel.createDefault(),
    name = 'Untitled Hardcover Case',
  ): BookbinderProject {
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: name.trim() || 'Untitled Hardcover Case',
      updatedAt: new Date().toISOString(),
      parameters: BookParametersModel.serialize(parameters),
      studio: CoverStudioModel.serialize(studio),
    };
  },

  serialize(
    project: BookbinderProject,
    options?: { includeImageData?: boolean },
  ): BookbinderProject {
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: project.name.trim() || 'Untitled Hardcover Case',
      updatedAt: project.updatedAt || new Date().toISOString(),
      parameters: BookParametersModel.serialize(project.parameters),
      studio: CoverStudioModel.serialize(project.studio, options),
    };
  },

  toJson(project: BookbinderProject, options?: { includeImageData?: boolean }): string {
    return JSON.stringify(this.serialize(project, options), null, 2);
  },

  fromUnknown(raw: unknown): ProjectParseResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Project file must be a JSON object.' };
    }
    const obj = raw as Record<string, unknown>;
    if (!obj.parameters || typeof obj.parameters !== 'object') {
      return { ok: false, error: 'Missing or invalid "parameters" object in project file.' };
    }

    const name =
      typeof obj.name === 'string' && obj.name.trim().length > 0
        ? obj.name.trim()
        : 'Imported Hardcover Case';

    const updatedAt =
      typeof obj.updatedAt === 'string' && !Number.isNaN(Date.parse(obj.updatedAt))
        ? obj.updatedAt
        : new Date().toISOString();

    return {
      ok: true,
      project: {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        name,
        updatedAt,
        parameters: BookParametersModel.deserialize(obj.parameters),
        studio: CoverStudioModel.deserialize(obj.studio),
      },
    };
  },

  fromJson(jsonText: string): ProjectParseResult {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      return this.fromUnknown(parsed);
    } catch {
      return { ok: false, error: 'Invalid JSON syntax in project file.' };
    }
  },

  suggestFileName(projectName: string, spineTitle?: string): string {
    const base = (spineTitle?.trim() || projectName.trim() || 'bookbinder-project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return `${base || 'bookbinder-project'}.json`;
  },
} as const;
