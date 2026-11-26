import { describe, expect, it, vi } from 'vitest';
import { BookParametersModel } from '@/types/bookParams';
import { BookbinderProjectModel } from '@/types/project';
import {
  asProjectId,
  type SavedCustomFontRecord,
  type SavedProjectRecord,
} from '@/types/projectLibrary';
import { CoverStudioModel } from '@/types/studio';
import { roundTo } from '@/types/units';
import { calculateCaseGeometry } from './geometry';
import {
  FallbackProjectRepository,
  IndexedDbProjectRepository,
  MIGRATED_FROM_LOCAL_STORAGE_V1_FLAG,
  bootstrapProjectLibrary,
  computeWrapPdfDimensions,
  createProjectRepository,
} from './projectLibrary';
import { PROJECT_STORAGE_KEY } from './storage';

interface MockStoreData {
  readonly keyPath: string;
  readonly records: Map<string, unknown>;
  readonly indexes: Set<string>;
}

interface MockIndexedDbHarness {
  readonly factory: IDBFactory;
  readonly seedRawEntry: (dbName: string, storeName: string, key: string, value: unknown) => void;
}

/**
 * Lightweight, spec-faithful in-memory mock of `IDBFactory` supporting async
 * open/upgrade, multi-store transactions, structured cloning, and raw entry seeding.
 */
function createMockIdbHarness(): MockIndexedDbHarness {
  const databases = new Map<string, { version: number; stores: Map<string, MockStoreData> }>();

  function getOrCreateDbState(dbName: string): { version: number; stores: Map<string, MockStoreData> } {
    let state = databases.get(dbName);
    if (!state) {
      state = { version: 0, stores: new Map() };
      databases.set(dbName, state);
    }
    return state;
  }

  function extractKey(value: unknown, keyPath: string): string {
    if (value && typeof value === 'object' && keyPath in value) {
      const key = (value as Record<string, unknown>)[keyPath];
      if (typeof key === 'string') {
        return key;
      }
    }
    throw new DOMException(`Missing key at keyPath "${keyPath}".`, 'DataError');
  }

  function buildTransaction(
    storesMap: Map<string, MockStoreData>,
    storeNames: readonly string[],
  ): IDBTransaction {
    let pendingRequests = 0;
    let finished = false;
    let completionScheduled = false;

    const tx = {
      oncomplete: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onabort: null as ((ev: Event) => void) | null,
      error: null as DOMException | null,
      objectStore(name: string): IDBObjectStore {
        if (!storeNames.includes(name)) {
          throw new DOMException(`Store "${name}" not in transaction scope.`, 'NotFoundError');
        }
        const storeData = storesMap.get(name);
        if (!storeData) {
          throw new DOMException(`Store "${name}" does not exist.`, 'NotFoundError');
        }

        function scheduleRequest<T>(executor: () => T): IDBRequest<T> {
          pendingRequests += 1;
          const req = {
            result: undefined as unknown as T,
            error: null as DOMException | null,
            onsuccess: null as ((ev: Event) => void) | null,
            onerror: null as ((ev: Event) => void) | null,
          };

          queueMicrotask(() => {
            try {
              req.result = executor();
              req.onsuccess?.(new Event('success'));
            } catch (err) {
              const domErr =
                err instanceof DOMException
                  ? err
                  : new DOMException(err instanceof Error ? err.message : 'IDB error');
              req.error = domErr;
              tx.error = domErr;
              req.onerror?.(new Event('error'));
              if (!finished) {
                finished = true;
                tx.onerror?.(new Event('error'));
              }
            } finally {
              pendingRequests -= 1;
              maybeComplete();
            }
          });

          return req as unknown as IDBRequest<T>;
        }

        return {
          name,
          keyPath: storeData.keyPath,
          createIndex(indexName: string) {
            storeData.indexes.add(indexName);
            return {} as IDBIndex;
          },
          get(key: IDBValidKey) {
            return scheduleRequest(() => {
              const found = storeData.records.get(String(key));
              return found === undefined ? undefined : structuredClone(found);
            });
          },
          getAll() {
            return scheduleRequest(() =>
              Array.from(storeData.records.values()).map((entry) => structuredClone(entry)),
            );
          },
          put(value: unknown) {
            return scheduleRequest(() => {
              const key = extractKey(value, storeData.keyPath);
              storeData.records.set(key, structuredClone(value));
              return key;
            });
          },
          delete(key: IDBValidKey) {
            return scheduleRequest(() => {
              storeData.records.delete(String(key));
              return undefined;
            });
          },
        } as unknown as IDBObjectStore;
      },
    };

    function maybeComplete(): void {
      if (finished || pendingRequests > 0 || completionScheduled) {
        return;
      }
      completionScheduled = true;
      setTimeout(() => {
        completionScheduled = false;
        if (!finished && pendingRequests === 0) {
          finished = true;
          tx.oncomplete?.(new Event('complete'));
        }
      }, 0);
    }

    maybeComplete();
    return tx as unknown as IDBTransaction;
  }

  const factory = {
    open(name: string, version = 1): IDBOpenDBRequest {
      const req = {
        result: undefined as unknown as IDBDatabase,
        error: null as DOMException | null,
        onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => void) | null,
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
      };

      queueMicrotask(() => {
        const dbState = getOrCreateDbState(name);
        const db = {
          name,
          version,
          onversionchange: null as ((ev: Event) => void) | null,
          objectStoreNames: {
            contains(storeName: string): boolean {
              return dbState.stores.has(storeName);
            },
          },
          createObjectStore(storeName: string, options?: IDBObjectStoreParameters): IDBObjectStore {
            const keyPath = typeof options?.keyPath === 'string' ? options.keyPath : 'id';
            const storeData: MockStoreData = {
              keyPath,
              records: new Map(),
              indexes: new Set(),
            };
            dbState.stores.set(storeName, storeData);
            return {
              name: storeName,
              keyPath,
              createIndex(indexName: string) {
                storeData.indexes.add(indexName);
                return {} as IDBIndex;
              },
            } as unknown as IDBObjectStore;
          },
          transaction(storeNames: string | readonly string[]): IDBTransaction {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            return buildTransaction(dbState.stores, names);
          },
          close(): void {
            // No-op in mock
          },
        } as unknown as IDBDatabase;

        req.result = db;
        if (dbState.version < version) {
          dbState.version = version;
          req.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
        }
        req.onsuccess?.(new Event('success'));
      });

      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  return {
    factory,
    seedRawEntry(dbName: string, storeName: string, key: string, value: unknown) {
      const dbState = getOrCreateDbState(dbName);
      const store = dbState.stores.get(storeName);
      if (!store) {
        throw new Error(`Store "${storeName}" not initialized in "${dbName}".`);
      }
      store.records.set(key, value);
    },
  };
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function makeRecord(
  id: string,
  name: string,
  updatedAt: string,
  customFont?: SavedCustomFontRecord | null,
): SavedProjectRecord {
  const project = BookbinderProjectModel.create(
    BookParametersModel.createDefault(),
    CoverStudioModel.createDefault(),
    name,
  );
  return {
    id: asProjectId(id),
    createdAt: updatedAt,
    updatedAt,
    project: { ...project, updatedAt },
    thumbnailDataUrl: null,
    ...(customFont !== undefined ? { customFont } : {}),
  };
}

const SAMPLE_FONT: SavedCustomFontRecord = {
  familyName: 'BookbinderCustom-Atelier',
  fileName: 'Atelier.ttf',
  bytes: new Uint8Array([0, 1, 0, 0, 42, 99]),
  pdfEmbeddable: true,
};

describe('computeWrapPdfDimensions', () => {
  it('adds bleed on both edges when includeBleed is true and omits it when false', () => {
    const withBleed = BookParametersModel.clampAndNormalize({
      bleedMm: 4,
      includeBleed: true,
    });
    const geomWithBleed = calculateCaseGeometry(withBleed);
    expect(computeWrapPdfDimensions(withBleed)).toEqual({
      wrapPdfWidthMm: roundTo(geomWithBleed.outerWrap.widthMm + 8, 2),
      wrapPdfHeightMm: roundTo(geomWithBleed.outerWrap.heightMm + 8, 2),
    });

    const withoutBleed = BookParametersModel.clampAndNormalize({
      bleedMm: 4,
      includeBleed: false,
    });
    const geomWithoutBleed = calculateCaseGeometry(withoutBleed);
    expect(computeWrapPdfDimensions(withoutBleed)).toEqual({
      wrapPdfWidthMm: roundTo(geomWithoutBleed.outerWrap.widthMm, 2),
      wrapPdfHeightMm: roundTo(geomWithoutBleed.outerWrap.heightMm, 2),
    });
  });
});

describe('FallbackProjectRepository', () => {
  it('supports CRUD, deterministic updatedAt/id sorting, tri-state custom fonts, and bundle export', async () => {
    const mirrorStorage = createMemoryStorage();
    const repo = new FallbackProjectRepository({ storage: mirrorStorage });
    expect(repo.kind).toBe('fallback');

    const older = makeRecord('book-b', 'Older Book', '2026-01-01T10:00:00.000Z', SAMPLE_FONT);
    const newerB = makeRecord('book-c', 'Tie Newer B', '2026-02-01T10:00:00.000Z', null);
    const newerA = makeRecord('book-a', 'Tie Newer A', '2026-02-01T10:00:00.000Z', null);

    const sOlder = await repo.saveProject(older);
    await repo.saveProject(newerB);
    await repo.saveProject(newerA);

    expect(sOlder.hasCustomFont).toBe(true);

    // Deterministic sort: updatedAt desc, then id asc
    const summaries = await repo.listSummaries();
    expect(summaries.map((s) => s.id)).toEqual([
      asProjectId('book-a'),
      asProjectId('book-c'),
      asProjectId('book-b'),
    ]);

    // Saving with customFont: undefined preserves existing font
    const autoSaved = await repo.saveProject({
      ...older,
      updatedAt: '2026-03-01T10:00:00.000Z',
      project: { ...older.project, name: 'Older Book Renamed' },
      customFont: undefined,
    });
    expect(autoSaved.hasCustomFont).toBe(true);
    const loadedWithFont = await repo.getProject(older.id);
    expect(loadedWithFont?.project.name).toBe('Older Book Renamed');
    expect(loadedWithFont?.customFont?.fileName).toBe('Atelier.ttf');
    expect(Array.from(loadedWithFont?.customFont?.bytes ?? [])).toEqual([0, 1, 0, 0, 42, 99]);

    // Saving with customFont: null explicitly removes the font
    const clearedFontSummary = await repo.saveProject({
      ...older,
      updatedAt: '2026-03-02T10:00:00.000Z',
      customFont: null,
    });
    expect(clearedFontSummary.hasCustomFont).toBe(false);
    expect((await repo.getProject(older.id))?.customFont).toBeNull();

    // Active ID mirroring to optional Storage
    await repo.setActiveProjectId(older.id);
    expect(await repo.getActiveProjectId()).toBe(older.id);
    expect(mirrorStorage.getItem(PROJECT_STORAGE_KEY)).toContain('Older Book');

    // Bundle export preserves sorted order
    const bundle = await repo.exportAllProjects();
    expect(bundle.projects).toHaveLength(3);
    expect(bundle.projects[0]?.name).toBe('Older Book');

    // Delete clears project and active ID
    await repo.deleteProject(older.id);
    expect(await repo.getProject(older.id)).toBeNull();
    expect(await repo.getActiveProjectId()).toBeNull();
  });
});

describe('IndexedDbProjectRepository', () => {
  it('supports full CRUD, sorting, tri-state custom fonts, meta flags, and export', async () => {
    const harness = createMockIdbHarness();
    const repo = new IndexedDbProjectRepository({
      idbFactory: harness.factory,
      dbName: 'test-bookbinder-db',
      broadcastChannelName: null,
    });
    expect(repo.kind).toBe('indexeddb');

    const first = makeRecord('id-2', 'Second Tie', '2026-04-01T00:00:00.000Z', SAMPLE_FONT);
    const second = makeRecord('id-1', 'First Tie', '2026-04-01T00:00:00.000Z', null);
    const oldest = makeRecord('id-0', 'Oldest', '2026-03-01T00:00:00.000Z', null);

    await repo.saveProject(oldest);
    await repo.saveProject(first);
    await repo.saveProject(second);

    const summaries = await repo.listSummaries();
    expect(summaries.map((s) => s.id)).toEqual([
      asProjectId('id-1'),
      asProjectId('id-2'),
      asProjectId('id-0'),
    ]);
    expect(summaries.find((s) => s.id === first.id)?.hasCustomFont).toBe(true);

    // Preserve custom font when customFont is omitted (undefined)
    const updatedSummary = await repo.saveProject({
      ...first,
      updatedAt: '2026-05-01T00:00:00.000Z',
      project: { ...first.project, name: 'Second Tie Edited' },
      customFont: undefined,
    });
    expect(updatedSummary.hasCustomFont).toBe(true);

    const loaded = await repo.getProject(first.id);
    expect(loaded?.project.name).toBe('Second Tie Edited');
    expect(loaded?.customFont?.familyName).toBe(SAMPLE_FONT.familyName);
    expect(Array.from(loaded?.customFont?.bytes ?? [])).toEqual([0, 1, 0, 0, 42, 99]);

    // Explicitly delete custom font with null
    const removedFontSummary = await repo.saveProject({
      ...first,
      updatedAt: '2026-05-02T00:00:00.000Z',
      customFont: null,
    });
    expect(removedFontSummary.hasCustomFont).toBe(false);
    expect((await repo.getProject(first.id))?.customFont).toBeNull();

    // Active ID & meta flags
    expect(await repo.getActiveProjectId()).toBeNull();
    await repo.setActiveProjectId(first.id);
    expect(await repo.getActiveProjectId()).toBe(first.id);

    expect(await repo.getMetaFlag('customFlag')).toBe(false);
    await repo.setMetaFlag('customFlag', true);
    expect(await repo.getMetaFlag('customFlag')).toBe(true);

    // Export all projects
    const bundle = await repo.exportAllProjects();
    expect(bundle.projects).toHaveLength(3);
    expect(bundle.projects[0]?.name).toBe('Second Tie');

    // Delete project also clears active ID if it matched
    await repo.deleteProject(first.id);
    expect(await repo.getProject(first.id)).toBeNull();
    expect(await repo.getActiveProjectId()).toBeNull();

    repo.close();
  });

  it('handles corrupted stored project and summary records gracefully without throwing', async () => {
    const harness = createMockIdbHarness();
    const dbName = 'test-corrupt-db';
    const repo = new IndexedDbProjectRepository({
      idbFactory: harness.factory,
      dbName,
      broadcastChannelName: null,
    });

    const healthy = makeRecord('healthy-1', 'Healthy Book', '2026-04-01T00:00:00.000Z', null);
    await repo.saveProject(healthy);

    // Seed corrupted entries directly into IndexedDB stores
    harness.seedRawEntry(dbName, 'projects', 'corrupt-1', {
      id: 'corrupt-1',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      project: { notValid: true },
      thumbnailDataUrl: null,
    });
    harness.seedRawEntry(dbName, 'summaries', 'corrupt-summary', {
      id: 'corrupt-summary',
      bindingStyle: 'broken-style',
    });

    expect(await repo.getProject(asProjectId('corrupt-1'))).toBeNull();
    const summaries = await repo.listSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe(asProjectId('healthy-1'));

    repo.close();
  });

  it('createProjectRepository falls back to FallbackProjectRepository when IndexedDB open fails', async () => {
    const failingFactory = {
      open: vi.fn(() => {
        throw new DOMException('Blocked in private mode', 'SecurityError');
      }),
    } as unknown as IDBFactory;

    const repo = await createProjectRepository({
      idbFactory: failingFactory,
      fallbackStorage: createMemoryStorage(),
      broadcastChannelName: null,
    });
    expect(repo.kind).toBe('fallback');
  });
});

describe('bootstrapProjectLibrary', () => {
  it('migrates legacy localStorage bookbinder.project.v1 once and stays idempotent on second run', async () => {
    const legacyStorage = createMemoryStorage();
    const legacyParams = BookParametersModel.applyPreset(
      BookParametersModel.createDefault(),
      'manga-b6',
    );
    const legacyProject = BookbinderProjectModel.create(
      legacyParams,
      CoverStudioModel.createDefault(),
      'My Legacy Manga',
    );
    legacyStorage.setItem(PROJECT_STORAGE_KEY, BookbinderProjectModel.toJson(legacyProject));

    const harness = createMockIdbHarness();
    const repo = new IndexedDbProjectRepository({
      idbFactory: harness.factory,
      dbName: 'test-migration-db',
      broadcastChannelName: null,
    });

    // First run migrates legacy project
    const firstRun = await bootstrapProjectLibrary(repo, legacyStorage);
    expect(firstRun.migratedFromLegacy).toBe(true);
    expect(firstRun.summaries).toHaveLength(1);
    expect(firstRun.activeRecord.project.name).toBe('My Legacy Manga');
    expect(firstRun.activeRecord.project.parameters.pbWidthMm).toBe(128);
    expect(await repo.getMetaFlag(MIGRATED_FROM_LOCAL_STORAGE_V1_FLAG)).toBe(true);

    // Second run is idempotent and does not duplicate or re-migrate
    const secondRun = await bootstrapProjectLibrary(repo, legacyStorage);
    expect(secondRun.migratedFromLegacy).toBe(false);
    expect(secondRun.summaries).toHaveLength(1);
    expect(secondRun.activeRecord.id).toBe(firstRun.activeRecord.id);

    repo.close();
  });

  it('falls back to a fresh default project when legacy storage contains corrupt JSON', async () => {
    const legacyStorage = createMemoryStorage();
    legacyStorage.setItem(PROJECT_STORAGE_KEY, '{not-valid-json');

    const repo = new FallbackProjectRepository();
    const result = await bootstrapProjectLibrary(repo, legacyStorage);

    expect(result.migratedFromLegacy).toBe(false);
    expect(result.summaries).toHaveLength(1);
    expect(result.activeRecord.project.name).toBe('Untitled Hardcover Case');
    expect(result.activeRecord.project.parameters).toEqual(BookParametersModel.createDefault());
    expect(await repo.getMetaFlag(MIGRATED_FROM_LOCAL_STORAGE_V1_FLAG)).toBe(true);
  });

  it('recovers from a dangling activeProjectId by selecting the most recent valid summary', async () => {
    const repo = new FallbackProjectRepository();
    const saved = makeRecord('existing-1', 'Saved Book', '2026-05-01T00:00:00.000Z', null);
    await repo.saveProject(saved);
    await repo.setActiveProjectId(asProjectId('missing-id'));

    const result = await bootstrapProjectLibrary(repo, null);
    expect(result.migratedFromLegacy).toBe(false);
    expect(result.activeRecord.id).toBe(asProjectId('existing-1'));
    expect(await repo.getActiveProjectId()).toBe(asProjectId('existing-1'));
  });
});
