import type { BookParameters } from '@/types/bookParams';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import {
  ProjectLibraryModel,
  asProjectId,
  deserializeSavedCustomFont,
  deserializeSavedProjectSummary,
  isProjectId,
  type ProjectId,
  type ProjectLibraryBundle,
  type SavedCustomFontRecord,
  type SavedProjectRecord,
  type SavedProjectSummary,
  type WrapPdfDimensions,
} from '@/types/projectLibrary';
import { roundTo } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import { PROJECT_STORAGE_KEY, saveProjectToStorage } from './storage';

export const DEFAULT_PROJECT_DB_NAME = 'bookbinder-studio-db';
export const DEFAULT_PROJECT_DB_VERSION = 1;
export const DEFAULT_LIBRARY_BROADCAST_CHANNEL = 'bookbinder-studio-library';
export const MIGRATED_FROM_LOCAL_STORAGE_V1_FLAG = 'migratedFromLocalStorageV1';

const STORE_SUMMARIES = 'summaries' as const;
const STORE_PROJECTS = 'projects' as const;
const STORE_FONTS = 'fonts' as const;
const STORE_META = 'meta' as const;
const INDEX_BY_UPDATED_AT = 'by_updatedAt' as const;
const META_KEY_ACTIVE_PROJECT_ID = 'activeProjectId' as const;

interface StoredProjectEntry {
  readonly id: ProjectId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly project: BookbinderProject;
  readonly thumbnailDataUrl: string | null;
}

interface StoredFontEntry extends SavedCustomFontRecord {
  readonly projectId: ProjectId;
}

interface StoredMetaEntry {
  readonly key: string;
  readonly value: unknown;
}

export interface ProjectRepository {
  readonly kind: 'indexeddb' | 'fallback';
  listSummaries(): Promise<readonly SavedProjectSummary[]>;
  getProject(id: ProjectId): Promise<SavedProjectRecord | null>;
  saveProject(record: SavedProjectRecord): Promise<SavedProjectSummary>;
  deleteProject(id: ProjectId): Promise<void>;
  getActiveProjectId(): Promise<ProjectId | null>;
  setActiveProjectId(id: ProjectId | null): Promise<void>;
  getMetaFlag(key: string): Promise<boolean>;
  setMetaFlag(key: string, value: boolean): Promise<void>;
  exportAllProjects(): Promise<ProjectLibraryBundle>;
  subscribeExternalChanges(listener: () => void): () => void;
}

export interface IndexedDbProjectRepositoryOptions {
  readonly idbFactory?: IDBFactory | null;
  readonly dbName?: string;
  readonly broadcastChannelName?: string | null;
}

export interface FallbackProjectRepositoryOptions {
  readonly storage?: Storage | null;
}

export interface CreateProjectRepositoryOptions extends IndexedDbProjectRepositoryOptions {
  readonly fallbackStorage?: Storage | null;
}

export interface BootstrapLibraryResult {
  readonly activeRecord: SavedProjectRecord;
  readonly summaries: readonly SavedProjectSummary[];
  readonly migratedFromLegacy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeIndexedDb(): IDBFactory | null {
  try {
    return typeof globalThis !== 'undefined' && 'indexedDB' in globalThis
      ? globalThis.indexedDB ?? null
      : null;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function compareSummaries(a: SavedProjectSummary, b: SavedProjectSummary): number {
  const timeA = Date.parse(a.updatedAt);
  const timeB = Date.parse(b.updatedAt);
  const validA = !Number.isNaN(timeA);
  const validB = !Number.isNaN(timeB);
  if (validA && validB && timeA !== timeB) {
    return timeB - timeA;
  }
  if (a.updatedAt !== b.updatedAt) {
    return b.updatedAt.localeCompare(a.updatedAt);
  }
  return a.id.localeCompare(b.id);
}

function sortSummaries(summaries: readonly SavedProjectSummary[]): readonly SavedProjectSummary[] {
  return [...summaries].sort(compareSummaries);
}

function cloneCustomFont(font: SavedCustomFontRecord): SavedCustomFontRecord {
  return {
    familyName: font.familyName,
    fileName: font.fileName,
    bytes: new Uint8Array(font.bytes),
    pdfEmbeddable: font.pdfEmbeddable,
  };
}

function readRequestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function parseStoredProjectRecord(
  rawProjectEntry: unknown,
  rawFontEntry: unknown,
): SavedProjectRecord | null {
  if (!isRecord(rawProjectEntry) || !isProjectId(rawProjectEntry.id)) {
    return null;
  }

  const parsedProject = BookbinderProjectModel.fromUnknown(rawProjectEntry.project);
  if (!parsedProject.ok) {
    return null;
  }

  const updatedAt =
    typeof rawProjectEntry.updatedAt === 'string' && !Number.isNaN(Date.parse(rawProjectEntry.updatedAt))
      ? rawProjectEntry.updatedAt
      : parsedProject.project.updatedAt;
  const createdAt =
    typeof rawProjectEntry.createdAt === 'string' && !Number.isNaN(Date.parse(rawProjectEntry.createdAt))
      ? rawProjectEntry.createdAt
      : updatedAt;
  const thumbnailDataUrl =
    typeof rawProjectEntry.thumbnailDataUrl === 'string' && rawProjectEntry.thumbnailDataUrl.length > 0
      ? rawProjectEntry.thumbnailDataUrl
      : null;
  const customFont = deserializeSavedCustomFont(rawFontEntry);

  return {
    id: asProjectId(rawProjectEntry.id),
    createdAt,
    updatedAt,
    project: parsedProject.project,
    thumbnailDataUrl,
    customFont,
  };
}

export function computeWrapPdfDimensions(params: BookParameters): WrapPdfDimensions {
  const { outerWrap } = calculateCaseGeometry(params);
  const bleedDelta = outerWrap.includeBleed ? outerWrap.bleedMm * 2 : 0;
  return {
    wrapPdfWidthMm: roundTo(outerWrap.widthMm + bleedDelta, 2),
    wrapPdfHeightMm: roundTo(outerWrap.heightMm + bleedDelta, 2),
  };
}

export class IndexedDbProjectRepository implements ProjectRepository {
  readonly kind = 'indexeddb' as const;

  private readonly idbFactory: IDBFactory | null;
  private readonly dbName: string;
  private readonly broadcastChannelName: string | null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private channel: BroadcastChannel | null = null;
  private readonly changeListeners = new Set<() => void>();

  constructor(options?: IndexedDbProjectRepositoryOptions) {
    this.idbFactory =
      options && 'idbFactory' in options ? (options.idbFactory ?? null) : safeIndexedDb();
    this.dbName = options?.dbName ?? DEFAULT_PROJECT_DB_NAME;
    this.broadcastChannelName =
      options && 'broadcastChannelName' in options
        ? (options.broadcastChannelName ?? null)
        : DEFAULT_LIBRARY_BROADCAST_CHANNEL;
  }

  async open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    const factory = this.idbFactory;
    if (!factory) {
      return Promise.reject(new Error('IndexedDB is unavailable in this environment.'));
    }

    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(this.dbName, DEFAULT_PROJECT_DB_VERSION);
      } catch (err) {
        queueMicrotask(() => {
          if (this.dbPromise === pending) {
            this.dbPromise = null;
          }
        });
        reject(err instanceof Error ? err : new Error('Failed to open IndexedDB.'));
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SUMMARIES)) {
          const summariesStore = db.createObjectStore(STORE_SUMMARIES, { keyPath: 'id' });
          summariesStore.createIndex(INDEX_BY_UPDATED_AT, 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_FONTS)) {
          db.createObjectStore(STORE_FONTS, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          if (this.dbPromise === pending) {
            this.dbPromise = null;
          }
        };
        resolve(db);
      };

      request.onerror = () => {
        if (this.dbPromise === pending) {
          this.dbPromise = null;
        }
        reject(request.error ?? new Error('Failed to open IndexedDB database.'));
      };
    });

    this.dbPromise = pending;
    return pending;
  }

  async listSummaries(): Promise<readonly SavedProjectSummary[]> {
    const db = await this.open();
    const tx = db.transaction([STORE_SUMMARIES], 'readonly');
    const store = tx.objectStore(STORE_SUMMARIES);
    const rawItems: readonly unknown[] = await readRequestResult<unknown[]>(store.getAll());
    const valid: SavedProjectSummary[] = [];
    for (const item of rawItems) {
      const parsed = deserializeSavedProjectSummary(item);
      if (parsed) {
        valid.push(parsed);
      }
    }
    return sortSummaries(valid);
  }

  async getProject(id: ProjectId): Promise<SavedProjectRecord | null> {
    const db = await this.open();
    const tx = db.transaction([STORE_PROJECTS, STORE_FONTS], 'readonly');
    const projectsStore = tx.objectStore(STORE_PROJECTS);
    const fontsStore = tx.objectStore(STORE_FONTS);
    const [rawProject, rawFont] = await Promise.all([
      readRequestResult<unknown>(projectsStore.get(id)),
      readRequestResult<unknown>(fontsStore.get(id)),
    ]);
    return parseStoredProjectRecord(rawProject, rawFont);
  }

  /**
   * Saves a project record atomically across `summaries`, `projects`, and `fonts`.
   *
   * `record.customFont` tri-state semantics:
   * - `SavedCustomFontRecord`: writes/replaces the font entry in `fonts` (`hasCustomFont = true`).
   * - `null`: removes any existing font entry from `fonts` (`hasCustomFont = false`).
   * - `undefined`: preserves any existing font entry in `fonts` so auto-saving edits never wipes
   *   custom fonts, and derives `hasCustomFont` from the preserved entry.
   */
  async saveProject(record: SavedProjectRecord): Promise<SavedProjectSummary> {
    const db = await this.open();
    const serializedProject = BookbinderProjectModel.serialize(record.project);
    const wrapDims = computeWrapPdfDimensions(serializedProject.parameters);

    const tx = db.transaction([STORE_SUMMARIES, STORE_PROJECTS, STORE_FONTS], 'readwrite');
    const summariesStore = tx.objectStore(STORE_SUMMARIES);
    const projectsStore = tx.objectStore(STORE_PROJECTS);
    const fontsStore = tx.objectStore(STORE_FONTS);

    const txDone = waitForTransaction(tx);
    let summaryResult: SavedProjectSummary | null = null;

    const writeProjectAndSummary = (effectiveFont: SavedCustomFontRecord | null) => {
      const normalizedRecord: SavedProjectRecord = {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        project: serializedProject,
        thumbnailDataUrl: record.thumbnailDataUrl,
        customFont: effectiveFont,
      };

      const summary = ProjectLibraryModel.deriveSummary(normalizedRecord, wrapDims);
      const projectEntry: StoredProjectEntry = {
        id: normalizedRecord.id,
        createdAt: normalizedRecord.createdAt,
        updatedAt: normalizedRecord.updatedAt,
        project: serializedProject,
        thumbnailDataUrl: normalizedRecord.thumbnailDataUrl,
      };

      summariesStore.put(summary);
      projectsStore.put(projectEntry);
      summaryResult = summary;
    };

    if (record.customFont === undefined) {
      const getFontReq = fontsStore.get(record.id);
      getFontReq.onsuccess = () => {
        const existingFont = deserializeSavedCustomFont(getFontReq.result as unknown);
        writeProjectAndSummary(existingFont);
      };
    } else if (record.customFont === null) {
      fontsStore.delete(record.id);
      writeProjectAndSummary(null);
    } else {
      const clonedFont = cloneCustomFont(record.customFont);
      const storedFont: StoredFontEntry = {
        projectId: record.id,
        ...clonedFont,
      };
      fontsStore.put(storedFont);
      writeProjectAndSummary(clonedFont);
    }

    await txDone;
    this.notifyExternalChange();
    return (
      summaryResult ??
      ProjectLibraryModel.deriveSummary(
        {
          id: record.id,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          project: serializedProject,
          thumbnailDataUrl: record.thumbnailDataUrl,
          customFont: null,
        },
        wrapDims,
      )
    );
  }

  async deleteProject(id: ProjectId): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(
      [STORE_SUMMARIES, STORE_PROJECTS, STORE_FONTS, STORE_META],
      'readwrite',
    );
    const summariesStore = tx.objectStore(STORE_SUMMARIES);
    const projectsStore = tx.objectStore(STORE_PROJECTS);
    const fontsStore = tx.objectStore(STORE_FONTS);
    const metaStore = tx.objectStore(STORE_META);

    const txDone = waitForTransaction(tx);

    summariesStore.delete(id);
    projectsStore.delete(id);
    fontsStore.delete(id);

    const activeReq = metaStore.get(META_KEY_ACTIVE_PROJECT_ID);
    activeReq.onsuccess = () => {
      const activeMeta: unknown = activeReq.result;
      if (isRecord(activeMeta) && activeMeta.value === id) {
        metaStore.delete(META_KEY_ACTIVE_PROJECT_ID);
      }
    };

    await txDone;
    this.notifyExternalChange();
  }

  async getActiveProjectId(): Promise<ProjectId | null> {
    const db = await this.open();
    const tx = db.transaction([STORE_META], 'readonly');
    const raw = await readRequestResult<unknown>(
      tx.objectStore(STORE_META).get(META_KEY_ACTIVE_PROJECT_ID),
    );
    if (isRecord(raw) && isProjectId(raw.value)) {
      return asProjectId(raw.value);
    }
    return null;
  }

  async setActiveProjectId(id: ProjectId | null): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_META], 'readwrite');
    const metaStore = tx.objectStore(STORE_META);
    const txDone = waitForTransaction(tx);
    if (id === null) {
      metaStore.delete(META_KEY_ACTIVE_PROJECT_ID);
    } else {
      const entry: StoredMetaEntry = { key: META_KEY_ACTIVE_PROJECT_ID, value: id };
      metaStore.put(entry);
    }
    await txDone;
  }

  async getMetaFlag(key: string): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction([STORE_META], 'readonly');
    const raw = await readRequestResult<unknown>(tx.objectStore(STORE_META).get(key));
    return isRecord(raw) && raw.value === true;
  }

  async setMetaFlag(key: string, value: boolean): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_META], 'readwrite');
    const txDone = waitForTransaction(tx);
    const entry: StoredMetaEntry = { key, value };
    tx.objectStore(STORE_META).put(entry);
    await txDone;
  }

  async exportAllProjects(): Promise<ProjectLibraryBundle> {
    const summaries = await this.listSummaries();
    const projects: BookbinderProject[] = [];
    for (const summary of summaries) {
      const record = await this.getProject(summary.id);
      if (record) {
        projects.push(record.project);
      }
    }
    return ProjectLibraryModel.serializeBundle(projects);
  }

  subscribeExternalChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    this.ensureBroadcastChannel();
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.changeListeners.clear();
    if (this.dbPromise) {
      void this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
    }
  }

  private ensureBroadcastChannel(): BroadcastChannel | null {
    if (this.channel) {
      return this.channel;
    }
    if (!this.broadcastChannelName || typeof BroadcastChannel === 'undefined') {
      return null;
    }
    try {
      const ch = new BroadcastChannel(this.broadcastChannelName);
      ch.onmessage = () => {
        for (const listener of this.changeListeners) {
          try {
            listener();
          } catch {
            // Isolate listener errors
          }
        }
      };
      this.channel = ch;
      return ch;
    } catch {
      return null;
    }
  }

  private notifyExternalChange(): void {
    const ch = this.ensureBroadcastChannel();
    if (!ch) return;
    try {
      ch.postMessage({ type: 'library-updated', timestamp: Date.now() });
    } catch {
      // Ignore postMessage failures in restricted contexts
    }
  }
}

export class FallbackProjectRepository implements ProjectRepository {
  readonly kind = 'fallback' as const;

  private readonly storage: Storage | null;
  private readonly summaries = new Map<ProjectId, SavedProjectSummary>();
  private readonly projects = new Map<ProjectId, StoredProjectEntry>();
  private readonly fonts = new Map<ProjectId, SavedCustomFontRecord>();
  private readonly metaFlags = new Map<string, boolean>();
  private activeProjectId: ProjectId | null = null;

  constructor(options?: FallbackProjectRepositoryOptions) {
    this.storage = options?.storage ?? null;
  }

  async listSummaries(): Promise<readonly SavedProjectSummary[]> {
    return sortSummaries(Array.from(this.summaries.values()));
  }

  async getProject(id: ProjectId): Promise<SavedProjectRecord | null> {
    const entry = this.projects.get(id);
    if (!entry) {
      return null;
    }
    const font = this.fonts.get(id);
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      project: BookbinderProjectModel.serialize(entry.project),
      thumbnailDataUrl: entry.thumbnailDataUrl,
      customFont: font ? cloneCustomFont(font) : null,
    };
  }

  async saveProject(record: SavedProjectRecord): Promise<SavedProjectSummary> {
    const serializedProject = BookbinderProjectModel.serialize(record.project);
    const wrapDims = computeWrapPdfDimensions(serializedProject.parameters);

    let effectiveFont: SavedCustomFontRecord | null = null;
    if (record.customFont === undefined) {
      const existing = this.fonts.get(record.id);
      effectiveFont = existing ? cloneCustomFont(existing) : null;
    } else if (record.customFont === null) {
      this.fonts.delete(record.id);
      effectiveFont = null;
    } else {
      const cloned = cloneCustomFont(record.customFont);
      this.fonts.set(record.id, cloned);
      effectiveFont = cloned;
    }

    const normalizedRecord: SavedProjectRecord = {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      project: serializedProject,
      thumbnailDataUrl: record.thumbnailDataUrl,
      customFont: effectiveFont,
    };

    const summary = ProjectLibraryModel.deriveSummary(normalizedRecord, wrapDims);
    this.summaries.set(record.id, summary);
    this.projects.set(record.id, {
      id: normalizedRecord.id,
      createdAt: normalizedRecord.createdAt,
      updatedAt: normalizedRecord.updatedAt,
      project: serializedProject,
      thumbnailDataUrl: normalizedRecord.thumbnailDataUrl,
    });

    if (this.storage && this.activeProjectId === record.id) {
      saveProjectToStorage(serializedProject, this.storage);
    }

    return summary;
  }

  async deleteProject(id: ProjectId): Promise<void> {
    this.summaries.delete(id);
    this.projects.delete(id);
    this.fonts.delete(id);
    if (this.activeProjectId === id) {
      this.activeProjectId = null;
    }
  }

  async getActiveProjectId(): Promise<ProjectId | null> {
    return this.activeProjectId;
  }

  async setActiveProjectId(id: ProjectId | null): Promise<void> {
    this.activeProjectId = id;
    if (this.storage && id !== null) {
      const entry = this.projects.get(id);
      if (entry) {
        saveProjectToStorage(entry.project, this.storage);
      }
    }
  }

  async getMetaFlag(key: string): Promise<boolean> {
    return this.metaFlags.get(key) === true;
  }

  async setMetaFlag(key: string, value: boolean): Promise<void> {
    this.metaFlags.set(key, value);
  }

  async exportAllProjects(): Promise<ProjectLibraryBundle> {
    const ordered = await this.listSummaries();
    const projects: BookbinderProject[] = [];
    for (const summary of ordered) {
      const entry = this.projects.get(summary.id);
      if (entry) {
        projects.push(BookbinderProjectModel.serialize(entry.project));
      }
    }
    return ProjectLibraryModel.serializeBundle(projects);
  }

  subscribeExternalChanges(listener: () => void): () => void {
    if (!this.storage || typeof window === 'undefined') {
      return () => {};
    }
    const handler = (event: StorageEvent) => {
      if (event.key === PROJECT_STORAGE_KEY) {
        listener();
      }
    };
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage', handler);
    };
  }
}

export async function createProjectRepository(
  options?: CreateProjectRepositoryOptions,
): Promise<ProjectRepository> {
  const idbRepo = new IndexedDbProjectRepository(options);
  try {
    await idbRepo.open();
    return idbRepo;
  } catch {
    idbRepo.close();
    return new FallbackProjectRepository({
      storage: options?.fallbackStorage ?? safeLocalStorage(),
    });
  }
}

let defaultRepositoryPromise: Promise<ProjectRepository> | null = null;

export function getDefaultProjectRepository(): Promise<ProjectRepository> {
  if (!defaultRepositoryPromise) {
    defaultRepositoryPromise = createProjectRepository();
  }
  return defaultRepositoryPromise;
}

export function resetDefaultProjectRepository(): void {
  defaultRepositoryPromise = null;
}

export async function bootstrapProjectLibrary(
  repo: ProjectRepository,
  legacyStorage?: Storage | null,
): Promise<BootstrapLibraryResult> {
  let summaries = await repo.listSummaries();
  let migratedFromLegacy = false;

  const alreadyMigrated = await repo.getMetaFlag(MIGRATED_FROM_LOCAL_STORAGE_V1_FLAG);
  if (summaries.length === 0 && !alreadyMigrated) {
    const storage = legacyStorage !== undefined ? legacyStorage : safeLocalStorage();
    if (storage) {
      try {
        const legacyRaw = storage.getItem(PROJECT_STORAGE_KEY);
        if (legacyRaw) {
          const parsed = BookbinderProjectModel.fromJson(legacyRaw);
          if (parsed.ok) {
            const migratedId = ProjectLibraryModel.createProjectId();
            const migratedRecord: SavedProjectRecord = {
              id: migratedId,
              createdAt: parsed.project.updatedAt,
              updatedAt: parsed.project.updatedAt,
              project: parsed.project,
              thumbnailDataUrl: null,
              customFont: null,
            };
            await repo.saveProject(migratedRecord);
            await repo.setActiveProjectId(migratedId);
            migratedFromLegacy = true;
          }
        }
      } catch {
        // Ignore storage read errors in restricted browsing contexts
      }
    }
    await repo.setMetaFlag(MIGRATED_FROM_LOCAL_STORAGE_V1_FLAG, true);
    summaries = await repo.listSummaries();
  }

  let activeRecord: SavedProjectRecord | null = null;
  const activeId = await repo.getActiveProjectId();
  if (activeId) {
    activeRecord = await repo.getProject(activeId);
  }

  if (!activeRecord) {
    for (const summary of summaries) {
      const candidate = await repo.getProject(summary.id);
      if (candidate) {
        activeRecord = candidate;
        await repo.setActiveProjectId(candidate.id);
        break;
      }
    }
  }

  if (!activeRecord) {
    const freshProject = BookbinderProjectModel.create();
    const freshRecord: SavedProjectRecord = {
      id: ProjectLibraryModel.createProjectId(),
      createdAt: freshProject.updatedAt,
      updatedAt: freshProject.updatedAt,
      project: freshProject,
      thumbnailDataUrl: null,
      customFont: null,
    };
    await repo.saveProject(freshRecord);
    await repo.setActiveProjectId(freshRecord.id);
    summaries = await repo.listSummaries();
    activeRecord = freshRecord;
  }

  return {
    activeRecord,
    summaries,
    migratedFromLegacy,
  };
}
