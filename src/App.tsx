import { BookMarked, CheckCircle2, FolderOpen, Library, Ruler } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/Header';
import { MeasureAndCutPanel } from '@/components/MeasureAndCutPanel';
import { MyBooksDialog } from '@/components/MyBooksDialog';
import type {
  InnerPdfExportOptions,
  OuterPdfExportOptions,
} from '@/components/PdfExportDialog';
import { SidebarControls } from '@/components/SidebarControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import { calculateCaseGeometry } from '@/core/geometry';
import { resolveMultiBookQueueSources } from '@/core/multiBookExport';
import { generateInnerTemplatesPdf, generateOuterWrapPdf } from '@/core/pdfExport';
import {
  bootstrapProjectLibrary,
  getDefaultProjectRepository,
  type ProjectRepository,
} from '@/core/projectLibrary';
import {
  PROJECT_STORAGE_KEY,
  clearProjectStorage,
  loadProjectFromStorage,
  saveProjectToStorage,
  triggerBytesDownload,
  triggerTextDownload,
} from '@/core/storage';
import { generateInnerTemplatesSvg, generateOuterWrapSvg } from '@/core/svgExport';
import { createSampleBookProject } from '@/resources/sampleProject';
import { CoverStyler } from '@/studio/CoverStyler';
import { InnerPocketsStudio } from '@/studio/InnerPocketsStudio';
import { SeriesSpinesStudio } from '@/studio/SeriesSpinesStudio';
import { registerCustomFontAsset, type CustomFontAsset } from '@/studio/fonts';
import { remapStudioForGeometryChange } from '@/studio/studioGeometryRemap';
import { renderProjectThumbnailDataUrl } from '@/studio/thumbnailRenderer';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import type { PdfGuideOptionsInput } from '@/types/pdfGuides';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import {
  ProjectLibraryModel,
  type ProjectId,
  type SavedProjectRecord,
  type SavedProjectSummary,
} from '@/types/projectLibrary';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';

type WorkspaceTab = 'measure' | 'outer' | 'pockets' | 'series';

const AUTO_SAVE_DEBOUNCE_MS = 350;

interface ActiveBookSnapshot {
  readonly id: ProjectId;
  readonly createdAt: string;
  readonly project: BookbinderProject;
  readonly customFont: CustomFontAsset | null;
}

function hasStoredLegacyProject(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(PROJECT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function nextUntitledBookName(summaries: readonly SavedProjectSummary[]): string {
  const existingLower = new Set(summaries.map((s) => s.name.trim().toLowerCase()));
  let index = 1;
  while (existingLower.has(`untitled book ${index}`)) {
    index += 1;
  }
  return `Untitled Book ${index}`;
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read file text.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

export function App() {
  const initialLocalStorageHitRef = useRef<boolean>(hasStoredLegacyProject());
  const [project, setProject] = useState<BookbinderProject>(() => loadProjectFromStorage());
  const [activeProjectId, setActiveProjectId] = useState<ProjectId | null>(null);
  const [activeCreatedAt, setActiveCreatedAt] = useState<string>(() => project.updatedAt);
  const [savedSummaries, setSavedSummaries] = useState<readonly SavedProjectSummary[]>([]);
  const [storageKind, setStorageKind] = useState<'indexeddb' | 'fallback'>('indexeddb');
  const [activeCustomFont, setActiveCustomFont] = useState<CustomFontAsset | null>(null);
  const [myBooksOpen, setMyBooksOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('outer');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportingTarget, setExportingTarget] = useState<'outer-pdf' | 'inner-pdf' | null>(null);
  const [outerExportProgressLabel, setOuterExportProgressLabel] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const repoRef = useRef<ProjectRepository | null>(null);
  const bootstrapPromiseRef = useRef<Promise<ProjectRepository> | null>(null);
  const bootstrapDoneRef = useRef(false);
  const opQueueRef = useRef<Promise<void>>(Promise.resolve());
  const hasUserEditedRef = useRef(false);
  const hasUserChangedFontRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectRef = useRef<BookbinderProject>(project);
  projectRef.current = project;
  const activeProjectIdRef = useRef<ProjectId | null>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const activeCreatedAtRef = useRef<string>(activeCreatedAt);
  activeCreatedAtRef.current = activeCreatedAt;
  const activeCustomFontRef = useRef<CustomFontAsset | null>(activeCustomFont);
  activeCustomFontRef.current = activeCustomFont;
  const savedSummariesRef = useRef<readonly SavedProjectSummary[]>(savedSummaries);
  savedSummariesRef.current = savedSummaries;
  const activeTabRef = useRef<WorkspaceTab>(activeTab);
  activeTabRef.current = activeTab;

  const lastPersistedProjectRef = useRef<BookbinderProject | null>(null);
  const lastPersistedFontRef = useRef<CustomFontAsset | null>(null);

  const geometry = useMemo(
    () => calculateCaseGeometry(project.parameters),
    [project.parameters],
  );

  const clearPendingAutoSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const enqueueRepoOp = useCallback((task: (repo: ProjectRepository) => Promise<void>) => {
    const next = opQueueRef.current
      .catch(() => {})
      .then(async () => {
        while (!bootstrapDoneRef.current && bootstrapPromiseRef.current) {
          const pending = bootstrapPromiseRef.current;
          await pending;
          if (pending === bootstrapPromiseRef.current) {
            break;
          }
        }
        let repo = repoRef.current;
        if (!repo) {
          repo = await getDefaultProjectRepository();
          repoRef.current = repo;
        }
        await task(repo);
      });
    opQueueRef.current = next;
    return next;
  }, []);

  const persistSnapshotToRepo = useCallback(
    async (
      repo: ProjectRepository,
      snapshot: ActiveBookSnapshot,
      renderThumbnail: boolean,
    ): Promise<void> => {
      const existingThumb =
        savedSummariesRef.current.find((s) => s.id === snapshot.id)?.thumbnailDataUrl ?? null;
      let thumbnailDataUrl = existingThumb;
      if (renderThumbnail) {
        const rendered = await renderProjectThumbnailDataUrl(
          calculateCaseGeometry(snapshot.project.parameters),
          snapshot.project.studio,
          { customFont: snapshot.customFont },
        );
        if (rendered) {
          thumbnailDataUrl = rendered;
        }
      }

      await repo.saveProject({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.project.updatedAt,
        project: snapshot.project,
        thumbnailDataUrl,
        customFont: snapshot.customFont,
      });

      const nextSummaries = await repo.listSummaries();
      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
      }
    },
    [],
  );

  const captureActiveSnapshot = useCallback((): ActiveBookSnapshot | null => {
    const id = activeProjectIdRef.current;
    if (!id) return null;
    return {
      id,
      createdAt: activeCreatedAtRef.current,
      project: projectRef.current,
      customFont: activeCustomFontRef.current,
    };
  }, []);

  const flushActiveSave = useCallback(
    (options?: { readonly renderThumbnail?: boolean; readonly forceThumbnailIfMissing?: boolean }) => {
      clearPendingAutoSave();
      const snapshot = captureActiveSnapshot();
      if (!snapshot) {
        return Promise.resolve();
      }
      const isDirty =
        snapshot.project !== lastPersistedProjectRef.current ||
        snapshot.customFont !== lastPersistedFontRef.current;
      const missingThumbnail =
        Boolean(options?.forceThumbnailIfMissing) &&
        (savedSummariesRef.current.find((s) => s.id === snapshot.id)?.thumbnailDataUrl ?? null) ===
          null;

      if (!isDirty && !missingThumbnail) {
        return Promise.resolve();
      }

      lastPersistedProjectRef.current = snapshot.project;
      lastPersistedFontRef.current = snapshot.customFont;
      const renderThumb = Boolean(options?.renderThumbnail || missingThumbnail);
      return enqueueRepoOp((repo) => persistSnapshotToRepo(repo, snapshot, renderThumb));
    },
    [captureActiveSnapshot, clearPendingAutoSave, enqueueRepoOp, persistSnapshotToRepo],
  );

  // Sync active project to localStorage for instant first paint & legacy resilience
  useEffect(() => {
    const result = saveProjectToStorage(project);
    if (result.omittedImageForQuota) {
      setStatusMessage('Settings saved (cover image too large for localStorage)');
    }
  }, [project]);

  // Bootstrap local IndexedDB (or fallback) project library on mount
  useEffect(() => {
    isMountedRef.current = true;
    bootstrapDoneRef.current = false;
    let cancelled = false;
    let unsubscribeExternal: (() => void) | null = null;

    const init = async (): Promise<ProjectRepository> => {
      const repo = await getDefaultProjectRepository();
      if (cancelled) return repo;
      setStorageKind(repo.kind);

      const result = await bootstrapProjectLibrary(repo);
      if (cancelled) return repo;

      unsubscribeExternal = repo.subscribeExternalChanges(() => {
        void repo
          .listSummaries()
          .then((nextSummaries) => {
            if (!cancelled && isMountedRef.current) {
              savedSummariesRef.current = nextSummaries;
              setSavedSummaries(nextSummaries);
            }
          })
          .catch(() => {});
      });

      const localUpdatedMs = Date.parse(projectRef.current.updatedAt);
      const dbUpdatedMs = Date.parse(result.activeRecord.updatedAt);
      const localIsNewerThanDb =
        initialLocalStorageHitRef.current &&
        !Number.isNaN(localUpdatedMs) &&
        !Number.isNaN(dbUpdatedMs) &&
        localUpdatedMs > dbUpdatedMs;

      let initialThumbSnapshot: ActiveBookSnapshot | null = null;

      if (hasUserEditedRef.current || localIsNewerThanDb) {
        const currentProject = projectRef.current;
        const targetId = activeProjectIdRef.current ?? result.activeRecord.id;
        const targetCreatedAt = activeProjectIdRef.current
          ? activeCreatedAtRef.current
          : result.activeRecord.createdAt;
        const shouldPreserveDbFont =
          targetId === result.activeRecord.id && !hasUserChangedFontRef.current;
        const currentFont = shouldPreserveDbFont
          ? (result.activeRecord.customFont ?? null)
          : activeCustomFontRef.current;

        activeProjectIdRef.current = targetId;
        activeCreatedAtRef.current = targetCreatedAt;
        activeCustomFontRef.current = currentFont;
        lastPersistedProjectRef.current = currentProject;
        lastPersistedFontRef.current = currentFont;
        setActiveProjectId(targetId);
        setActiveCreatedAt(targetCreatedAt);
        setActiveCustomFont(currentFont);

        if (shouldPreserveDbFont && currentFont) {
          void registerCustomFontAsset(currentFont);
        }

        const thumbnailDataUrl =
          (await renderProjectThumbnailDataUrl(
            calculateCaseGeometry(currentProject.parameters),
            currentProject.studio,
            { customFont: currentFont },
          )) ?? result.activeRecord.thumbnailDataUrl;

        await repo.saveProject({
          id: targetId,
          createdAt: targetCreatedAt,
          updatedAt: currentProject.updatedAt,
          project: currentProject,
          thumbnailDataUrl,
          customFont: currentFont,
        });
        await repo.setActiveProjectId(targetId);
        if (cancelled) return repo;

        const nextSummaries = await repo.listSummaries();
        if (!cancelled && isMountedRef.current) {
          savedSummariesRef.current = nextSummaries;
          setSavedSummaries(nextSummaries);
        }
      } else {
        const restoredFont = result.activeRecord.customFont ?? null;
        activeProjectIdRef.current = result.activeRecord.id;
        activeCreatedAtRef.current = result.activeRecord.createdAt;
        activeCustomFontRef.current = restoredFont;
        lastPersistedProjectRef.current = result.activeRecord.project;
        lastPersistedFontRef.current = restoredFont;
        savedSummariesRef.current = result.summaries;

        setActiveProjectId(result.activeRecord.id);
        setActiveCreatedAt(result.activeRecord.createdAt);
        setProject(result.activeRecord.project);
        setActiveCustomFont(restoredFont);
        setSavedSummaries(result.summaries);

        if (restoredFont) {
          void registerCustomFontAsset(restoredFont);
        }

        if (!result.activeRecord.thumbnailDataUrl) {
          initialThumbSnapshot = {
            id: result.activeRecord.id,
            createdAt: result.activeRecord.createdAt,
            project: result.activeRecord.project,
            customFont: restoredFont,
          };
        }
      }

      if (!cancelled) {
        repoRef.current = repo;
        bootstrapDoneRef.current = true;
        if (initialThumbSnapshot) {
          const snapshot = initialThumbSnapshot;
          void enqueueRepoOp((r) => persistSnapshotToRepo(r, snapshot, true));
        }
      }
      return repo;
    };

    bootstrapPromiseRef.current = init();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      clearPendingAutoSave();
      unsubscribeExternal?.();
    };
  }, [clearPendingAutoSave, enqueueRepoOp, persistSnapshotToRepo]);

  // Debounced auto-save of active book edits & custom font into IndexedDB
  useEffect(() => {
    if (!activeProjectId) return;
    if (
      project === lastPersistedProjectRef.current &&
      activeCustomFont === lastPersistedFontRef.current
    ) {
      return;
    }

    clearPendingAutoSave();
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushActiveSave({ renderThumbnail: true });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return clearPendingAutoSave;
  }, [activeProjectId, project, activeCustomFont, clearPendingAutoSave, flushActiveSave]);

  // Flush pending edits when tab becomes hidden or page unloads
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushActiveSave({ renderThumbnail: false });
      }
    };
    const onPageHide = () => {
      void flushActiveSave({ renderThumbnail: false });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushActiveSave]);

  const applyActiveRecordToState = useCallback((record: SavedProjectRecord) => {
    const restoredFont = record.customFont ?? null;
    activeProjectIdRef.current = record.id;
    activeCreatedAtRef.current = record.createdAt;
    activeCustomFontRef.current = restoredFont;
    projectRef.current = record.project;
    lastPersistedProjectRef.current = record.project;
    lastPersistedFontRef.current = restoredFont;

    setActiveProjectId(record.id);
    setActiveCreatedAt(record.createdAt);
    setProject(record.project);
    setActiveCustomFont(restoredFont);

    if (
      activeTabRef.current === 'pockets' &&
      !resolveBindingStrategy(record.project.parameters).capabilities.usesInnerPockets
    ) {
      setActiveTab('outer');
    }

    if (restoredFont) {
      void registerCustomFontAsset(restoredFont);
    }
  }, []);

  const bindingStrategy = resolveBindingStrategy(project.parameters);
  const usesInnerPockets = bindingStrategy.capabilities.usesInnerPockets;

  const handleParamsChange = (parameters: BookParameters) => {
    hasUserEditedRef.current = true;
    const nextStrategy = resolveBindingStrategy(parameters);
    if (
      !nextStrategy.capabilities.usesInnerPockets &&
      bindingStrategy.capabilities.usesInnerPockets &&
      activeTab === 'pockets'
    ) {
      setActiveTab('outer');
    }
    setProject((prev) => {
      const prevGeometry = calculateCaseGeometry(prev.parameters);
      const nextGeometry = calculateCaseGeometry(parameters);
      const studio = remapStudioForGeometryChange(prev.studio, prevGeometry, nextGeometry);
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        parameters,
        studio,
      };
    });
  };

  const handleStudioChange = (studio: CoverStudioState) => {
    hasUserEditedRef.current = true;
    setProject((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      studio,
    }));
  };

  const handleCustomFontChange = useCallback((font: CustomFontAsset | null) => {
    hasUserEditedRef.current = true;
    hasUserChangedFontRef.current = true;
    activeCustomFontRef.current = font;
    setActiveCustomFont(font);
  }, []);

  const handlePatchParams = (patch: Partial<BookParameters>) => {
    handleParamsChange(
      BookParametersModel.clampAndNormalize({ ...project.parameters, ...patch }),
    );
  };

  const handleOpenMyBooks = () => {
    setMyBooksOpen(true);
    void flushActiveSave({ renderThumbnail: true, forceThumbnailIfMissing: true });
  };

  const handleSelectBook = async (id: ProjectId) => {
    if (id === activeProjectIdRef.current) {
      setMyBooksOpen(false);
      return;
    }

    clearPendingAutoSave();
    const prevSnapshot = captureActiveSnapshot();

    await enqueueRepoOp(async (repo) => {
      if (
        prevSnapshot &&
        (prevSnapshot.project !== lastPersistedProjectRef.current ||
          prevSnapshot.customFont !== lastPersistedFontRef.current)
      ) {
        await persistSnapshotToRepo(repo, prevSnapshot, true);
      }

      const record = await repo.getProject(id);
      if (!record) {
        const nextSummaries = await repo.listSummaries();
        if (isMountedRef.current) {
          savedSummariesRef.current = nextSummaries;
          setSavedSummaries(nextSummaries);
          setStatusMessage('Selected book could not be found.');
        }
        return;
      }

      await repo.setActiveProjectId(record.id);
      const nextSummaries = await repo.listSummaries();
      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
        applyActiveRecordToState(record);
        setMyBooksOpen(false);
        setStatusMessage(`Opened "${record.project.name}"`);
      }
    });
  };

  const createAndActivateNewBook = (
    nextProject: BookbinderProject,
    statusText: string,
    switchToOuterTab = false,
  ): Promise<void> => {
    hasUserEditedRef.current = true;
    clearPendingAutoSave();

    const prevSnapshot = captureActiveSnapshot();
    const nextId = ProjectLibraryModel.createProjectId();
    const nextRecord: SavedProjectRecord = {
      id: nextId,
      createdAt: nextProject.updatedAt,
      updatedAt: nextProject.updatedAt,
      project: nextProject,
      thumbnailDataUrl: null,
      customFont: null,
    };

    applyActiveRecordToState(nextRecord);
    if (switchToOuterTab) {
      setActiveTab('outer');
    }
    setMyBooksOpen(false);
    setStatusMessage(statusText);

    return enqueueRepoOp(async (repo) => {
      if (prevSnapshot) {
        await persistSnapshotToRepo(repo, prevSnapshot, true);
      }

      const thumbnailDataUrl = await renderProjectThumbnailDataUrl(
        calculateCaseGeometry(nextProject.parameters),
        nextProject.studio,
        { customFont: null },
      );

      await repo.saveProject({
        ...nextRecord,
        thumbnailDataUrl,
      });
      await repo.setActiveProjectId(nextId);

      const nextSummaries = await repo.listSummaries();
      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
      }
    });
  };

  const handleNewBook = async () => {
    const defaultName = nextUntitledBookName(savedSummariesRef.current);
    const freshProject = BookbinderProjectModel.create(
      BookParametersModel.createDefault(),
      CoverStudioModel.createDefault(),
      defaultName,
    );
    await createAndActivateNewBook(freshProject, `Created "${freshProject.name}"`, true);
  };

  const handleLoadSampleBook = (): Promise<void> => {
    const sampleProject = createSampleBookProject();
    return createAndActivateNewBook(
      sampleProject,
      'Loaded sample book: Twenty Thousand Leagues Under the Seas',
      true,
    );
  };

  const handleRenameBook = async (id: ProjectId, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();

    if (id === activeProjectIdRef.current) {
      hasUserEditedRef.current = true;
      clearPendingAutoSave();
      const updatedProject: BookbinderProject = {
        ...projectRef.current,
        name: trimmed,
        updatedAt: now,
      };
      projectRef.current = updatedProject;
      lastPersistedProjectRef.current = updatedProject;
      lastPersistedFontRef.current = activeCustomFontRef.current;
      setProject(updatedProject);
      setStatusMessage(`Renamed to "${trimmed}"`);

      const snapshot: ActiveBookSnapshot = {
        id,
        createdAt: activeCreatedAtRef.current,
        project: updatedProject,
        customFont: activeCustomFontRef.current,
      };
      await enqueueRepoOp((repo) => persistSnapshotToRepo(repo, snapshot, false));
      return;
    }

    await enqueueRepoOp(async (repo) => {
      const existing = await repo.getProject(id);
      if (!existing) return;
      const updatedProject: BookbinderProject = {
        ...existing.project,
        name: trimmed,
        updatedAt: now,
      };
      await repo.saveProject({
        ...existing,
        updatedAt: now,
        project: updatedProject,
      });
      const nextSummaries = await repo.listSummaries();
      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
        setStatusMessage(`Renamed to "${trimmed}"`);
      }
    });
  };

  const handleDuplicateBook = async (id: ProjectId) => {
    hasUserEditedRef.current = true;
    clearPendingAutoSave();
    const prevSnapshot = captureActiveSnapshot();

    await enqueueRepoOp(async (repo) => {
      if (
        prevSnapshot &&
        (prevSnapshot.project !== lastPersistedProjectRef.current ||
          prevSnapshot.customFont !== lastPersistedFontRef.current)
      ) {
        lastPersistedProjectRef.current = prevSnapshot.project;
        lastPersistedFontRef.current = prevSnapshot.customFont;
        await persistSnapshotToRepo(repo, prevSnapshot, true);
      }

      const source = await repo.getProject(id);
      if (!source) return;

      const now = new Date().toISOString();
      const copyName = `${source.project.name} (Copy)`;
      const clonedProject: BookbinderProject = {
        ...BookbinderProjectModel.serialize(source.project),
        name: copyName,
        updatedAt: now,
      };
      const newId = ProjectLibraryModel.createProjectId();
      const copyRecord: SavedProjectRecord = {
        id: newId,
        createdAt: now,
        updatedAt: now,
        project: clonedProject,
        thumbnailDataUrl: source.thumbnailDataUrl,
        customFont: source.customFont ?? null,
      };

      await repo.saveProject(copyRecord);
      await repo.setActiveProjectId(newId);
      const nextSummaries = await repo.listSummaries();
      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
        applyActiveRecordToState(copyRecord);
        setStatusMessage(`Duplicated "${source.project.name}"`);
      }
    });
  };

  const handleDeleteBook = async (id: ProjectId) => {
    hasUserEditedRef.current = true;
    if (id === activeProjectIdRef.current) {
      clearPendingAutoSave();
    }

    await enqueueRepoOp(async (repo) => {
      await repo.deleteProject(id);
      let nextSummaries = await repo.listSummaries();

      if (id === activeProjectIdRef.current) {
        let nextActive: SavedProjectRecord | null = null;
        for (const summary of nextSummaries) {
          const candidate = await repo.getProject(summary.id);
          if (candidate) {
            nextActive = candidate;
            break;
          }
        }

        if (!nextActive) {
          const freshProject = BookbinderProjectModel.create(
            BookParametersModel.createDefault(),
            CoverStudioModel.createDefault(),
            nextUntitledBookName([]),
          );
          const freshId = ProjectLibraryModel.createProjectId();
          const freshRecord: SavedProjectRecord = {
            id: freshId,
            createdAt: freshProject.updatedAt,
            updatedAt: freshProject.updatedAt,
            project: freshProject,
            thumbnailDataUrl: null,
            customFont: null,
          };
          await repo.saveProject(freshRecord);
          nextActive = freshRecord;
          nextSummaries = await repo.listSummaries();
        }

        await repo.setActiveProjectId(nextActive.id);
        if (isMountedRef.current) {
          applyActiveRecordToState(nextActive);
        }
      }

      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
        setStatusMessage('Deleted book from library');
      }
    });
  };

  const handleExportBookJson = async (id: ProjectId) => {
    if (id === activeProjectIdRef.current) {
      const current = projectRef.current;
      const json = BookbinderProjectModel.toJson(current);
      const fileName = BookbinderProjectModel.suggestFileName(
        current.name,
        current.studio.spineText.title,
      );
      triggerTextDownload(json, fileName, 'application/json;charset=utf-8');
      setStatusMessage(`Saved ${fileName}`);
      return;
    }

    await enqueueRepoOp(async (repo) => {
      const record = await repo.getProject(id);
      if (!record) return;
      const json = BookbinderProjectModel.toJson(record.project);
      const fileName = BookbinderProjectModel.suggestFileName(
        record.project.name,
        record.project.studio.spineText.title,
      );
      triggerTextDownload(json, fileName, 'application/json;charset=utf-8');
      if (isMountedRef.current) {
        setStatusMessage(`Saved ${fileName}`);
      }
    });
  };

  const handleExportAllJson = async () => {
    clearPendingAutoSave();
    const prevSnapshot = captureActiveSnapshot();

    await enqueueRepoOp(async (repo) => {
      if (
        prevSnapshot &&
        (prevSnapshot.project !== lastPersistedProjectRef.current ||
          prevSnapshot.customFont !== lastPersistedFontRef.current)
      ) {
        await persistSnapshotToRepo(repo, prevSnapshot, false);
      }

      const bundle = await repo.exportAllProjects();
      const json = JSON.stringify(bundle, null, 2);
      triggerTextDownload(json, 'bookbinder-library-backup.json', 'application/json;charset=utf-8');
      if (isMountedRef.current) {
        const count = bundle.projects.length;
        setStatusMessage(
          `Exported backup of ${count} ${count === 1 ? 'book' : 'books'}`,
        );
      }
    });
  };

  const handleDownloadOuterSvg = (options?: PdfGuideOptionsInput) => {
    const svg = generateOuterWrapSvg(geometry, project.parameters.splitMode, options);
    const filename =
      project.parameters.splitMode === 'three-piece'
        ? 'outer_case_wrap_3piece.svg'
        : 'outer_case_wrap.svg';
    triggerTextDownload(svg, filename, 'image/svg+xml;charset=utf-8');
    setStatusMessage(`Exported ${filename}`);
  };

  const getActiveProjectRepository = useCallback(async (): Promise<ProjectRepository> => {
    while (!bootstrapDoneRef.current && bootstrapPromiseRef.current) {
      const pending = bootstrapPromiseRef.current;
      await pending;
      if (pending === bootstrapPromiseRef.current) {
        break;
      }
    }
    await opQueueRef.current.catch(() => {});
    let repo = repoRef.current;
    if (!repo) {
      repo = await getDefaultProjectRepository();
      repoRef.current = repo;
    }
    return repo;
  }, []);

  const handleDownloadOuterPdf = async (options?: OuterPdfExportOptions) => {
    setExportingTarget('outer-pdf');
    try {
      const effectiveSplitMode = options?.splitMode ?? project.parameters.splitMode;
      const effectiveMediaId = options?.printMediaId ?? project.parameters.printMedia;
      let resolvedRollNesting = options?.rollNesting;
      let resolvedSheetNesting = options?.sheetNesting;
      let skippedCount = 0;

      const queueEntries = options?.multiBookQueueEntries;
      if (
        queueEntries &&
        queueEntries.length > 0 &&
        (options?.sheetNesting?.enabled || options?.rollNesting?.enabled)
      ) {
        await flushActiveSave({ renderThumbnail: false });
        const repository = await getActiveProjectRepository();
        setOuterExportProgressLabel(
          `Rendering 1/${queueEntries.length}: ${queueEntries[0].label}…`,
        );
        const resolved = await resolveMultiBookQueueSources(queueEntries, {
          repository,
          target: 'outer-blueprint',
          includeGuides: options.includeCutLines ?? true,
          onProgress: (done, total) => {
            const nextEntry = queueEntries[done];
            setOuterExportProgressLabel(
              done < total && nextEntry
                ? `Rendering ${done + 1}/${total}: ${nextEntry.label}…`
                : 'Composing PDF…',
            );
          },
        });
        skippedCount = resolved.skippedIds.length;
        if (resolvedSheetNesting?.enabled) {
          resolvedSheetNesting = {
            ...resolvedSheetNesting,
            extraQueueItems: resolved.items,
          };
        }
        if (resolvedRollNesting?.enabled) {
          resolvedRollNesting = {
            ...resolvedRollNesting,
            extraQueueItems: resolved.items,
          };
        }
      }

      const bytes = await generateOuterWrapPdf(geometry, effectiveSplitMode, {
        printMediaId: effectiveMediaId,
        tileOverlapMm: options?.tileOverlapMm,
        includeScaleBar: options?.includeScaleBar,
        includeCutLines: options?.includeCutLines,
        includeFoldLines: options?.includeFoldLines,
        includeFoldGuideTicks: options?.includeFoldGuideTicks,
        appendInnerPocketsPage: options?.appendInnerPocketsPage,
        innerPageSizeId: options?.innerPageSizeId ?? project.parameters.pdfPageSize,
        customRollWidthMm: options?.customRollWidthMm ?? project.parameters.customRollWidthMm,
        printerMargins: options?.printerMargins,
        rollNesting: resolvedRollNesting,
        sheetNesting: resolvedSheetNesting,
      });
      const filename =
        effectiveSplitMode === 'three-piece'
          ? 'outer_case_wrap_3piece.pdf'
          : 'outer_case_wrap.pdf';
      triggerBytesDownload(bytes, filename, 'application/pdf');
      const skippedNote =
        skippedCount > 0
          ? ` — ${skippedCount} saved ${skippedCount === 1 ? 'book was' : 'books were'} unavailable and skipped`
          : '';
      setStatusMessage(
        `${
          options?.appendInnerPocketsPage
            ? `Exported ${filename} + Detached Pockets`
            : `Exported ${filename}`
        }${skippedNote}`,
      );
    } catch {
      setStatusMessage('Failed to generate outer wrap PDF.');
    } finally {
      setOuterExportProgressLabel(null);
      setExportingTarget(null);
    }
  };

  const handleDownloadInnerSvg = () => {
    const svg = generateInnerTemplatesSvg(geometry);
    triggerTextDownload(svg, 'inner_pockets_and_liner.svg', 'image/svg+xml;charset=utf-8');
    setStatusMessage('Exported inner_pockets_and_liner.svg');
  };

  const handleDownloadInnerPdf = async (options?: InnerPdfExportOptions) => {
    setExportingTarget('inner-pdf');
    try {
      const effectivePageSize = options?.pageSizeId ?? project.parameters.pdfPageSize;
      const includeLegend = options?.includeLegend ?? false;
      const { bytes, plan } = await generateInnerTemplatesPdf(
        geometry,
        effectivePageSize,
        {
          includeLegend,
          includeCutLines: options?.includeCutLines,
          includeFoldLines: options?.includeFoldLines,
          includeFoldGuideTicks: options?.includeFoldGuideTicks,
        },
      );
      triggerBytesDownload(bytes, 'inner_pockets_and_liner.pdf', 'application/pdf');
      setStatusMessage(
        `Exported inner_pockets_and_liner.pdf (${plan.pageCount} ${plan.pageCount === 1 ? 'page' : 'pages'}${includeLegend ? ' with legend' : ''})`,
      );
    } catch {
      setStatusMessage('Failed to generate inner templates PDF.');
    } finally {
      setExportingTarget(null);
    }
  };

  const handleExportJson = () => {
    const json = BookbinderProjectModel.toJson(project);
    const fileName = BookbinderProjectModel.suggestFileName(
      project.name,
      project.studio.spineText.title,
    );
    triggerTextDownload(json, fileName, 'application/json;charset=utf-8');
    setStatusMessage(`Saved ${fileName}`);
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await readTextFile(file);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setStatusMessage('Import error: Invalid JSON syntax in project file.');
        return;
      }

      if (ProjectLibraryModel.isLibraryBundleCandidate(raw)) {
        const parsedBundle = ProjectLibraryModel.fromUnknownBundle(raw);
        if (!parsedBundle.ok) {
          setStatusMessage(`Import error: ${parsedBundle.error}`);
          return;
        }

        hasUserEditedRef.current = true;
        clearPendingAutoSave();
        const prevSnapshot = captureActiveSnapshot();
        const importedProjects = parsedBundle.bundle.projects;
        const skippedNote =
          parsedBundle.skippedCount > 0 ? ` (${parsedBundle.skippedCount} skipped)` : '';

        await enqueueRepoOp(async (repo) => {
          if (prevSnapshot) {
            await persistSnapshotToRepo(repo, prevSnapshot, true);
          }

          let firstRecord: SavedProjectRecord | null = null;
          for (const imported of importedProjects) {
            const now = new Date().toISOString();
            const newId = ProjectLibraryModel.createProjectId();
            const thumb = await renderProjectThumbnailDataUrl(
              calculateCaseGeometry(imported.parameters),
              imported.studio,
              { customFont: null },
            );
            const record: SavedProjectRecord = {
              id: newId,
              createdAt: now,
              updatedAt: imported.updatedAt || now,
              project: imported,
              thumbnailDataUrl: thumb,
              customFont: null,
            };
            await repo.saveProject(record);
            if (!firstRecord) {
              firstRecord = record;
            }
          }

          if (firstRecord) {
            await repo.setActiveProjectId(firstRecord.id);
          }
          const nextSummaries = await repo.listSummaries();
          if (isMountedRef.current) {
            savedSummariesRef.current = nextSummaries;
            setSavedSummaries(nextSummaries);
            if (firstRecord) {
              applyActiveRecordToState(firstRecord);
            }
            setMyBooksOpen(false);
            const count = importedProjects.length;
            setStatusMessage(
              `Imported ${count} ${count === 1 ? 'book' : 'books'}${skippedNote}`,
            );
          }
        });
        return;
      }

      const parsed = BookbinderProjectModel.fromUnknown(raw);
      if (!parsed.ok) {
        setStatusMessage(`Import error: ${parsed.error}`);
        return;
      }

      await createAndActivateNewBook(parsed.project, `Loaded ${file.name}`);
    } catch {
      setStatusMessage('Could not read selected project file.');
    }
  };

  const handleResetDefaults = () => {
    hasUserEditedRef.current = true;
    hasUserChangedFontRef.current = true;
    clearProjectStorage();
    activeCustomFontRef.current = null;
    setActiveCustomFont(null);
    setProject((prev) =>
      BookbinderProjectModel.create(
        BookParametersModel.createDefault(),
        CoverStudioModel.createDefault(),
        prev.name,
      ),
    );
    setStatusMessage('Reset to default dimensions');
  };

  const handleRefreshLibrary = useCallback(async () => {
    const repo = await getActiveProjectRepository();
    const nextSummaries = await repo.listSummaries();
    if (isMountedRef.current) {
      savedSummariesRef.current = nextSummaries;
      setSavedSummaries(nextSummaries);
    }
  }, [getActiveProjectRepository]);

  const handleOpenBookInStudio = async (projectId: ProjectId) => {
    clearPendingAutoSave();
    const prevSnapshot = captureActiveSnapshot();

    await enqueueRepoOp(async (repo) => {
      if (
        prevSnapshot &&
        prevSnapshot.id !== projectId &&
        (prevSnapshot.project !== lastPersistedProjectRef.current ||
          prevSnapshot.customFont !== lastPersistedFontRef.current)
      ) {
        await persistSnapshotToRepo(repo, prevSnapshot, true);
      }

      const record = await repo.getProject(projectId);
      if (!record) {
        const nextSummaries = await repo.listSummaries();
        if (isMountedRef.current) {
          savedSummariesRef.current = nextSummaries;
          setSavedSummaries(nextSummaries);
          setStatusMessage('Selected book could not be found.');
        }
        return;
      }

      await repo.setActiveProjectId(record.id);
      const nextSummaries = await repo.listSummaries();
      if (isMountedRef.current) {
        savedSummariesRef.current = nextSummaries;
        setSavedSummaries(nextSummaries);
        applyActiveRecordToState(record);
        setActiveTab('outer');
        setStatusMessage(
          `Opened "${record.project.name}" in Cover Studio — tweak front, back, or spine freely`,
        );
      }
    });
  };

  const showSidebar = sidebarOpen && activeTab !== 'series';

  return (
    <div className="bindery-walnut-desk flex min-h-screen flex-col text-foreground">
      <Header
        statusMessage={statusMessage}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onLoadSampleBook={() => {
          void handleLoadSampleBook();
        }}
        activeBookName={project.name}
        savedBookCount={savedSummaries.length}
        onOpenMyBooks={handleOpenMyBooks}
      />

      <main
        id="main-workspace"
        tabIndex={-1}
        className={`mx-auto grid w-full max-w-[1760px] flex-1 grid-cols-1 items-start gap-4 px-3 py-3.5 sm:px-5 ${
          showSidebar ? 'lg:grid-cols-[276px_minmax(0,1fr)]' : 'lg:grid-cols-1'
        }`}
      >
        {showSidebar && (
          <SidebarControls
            params={project.parameters}
            onChange={handleParamsChange}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
            onResetDefaults={handleResetDefaults}
          />
        )}

        <div className="flex min-w-0 flex-col">
          {/* 4-Tab Folio Workbench Navigation sitting cleanly above the active workspace */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextTab = value as WorkspaceTab;
              if (nextTab === 'series' && activeTab !== 'series') {
                void flushActiveSave({ renderThumbnail: false });
              }
              setActiveTab(nextTab);
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <TabsList
                aria-label="Workbench modes"
                className="h-auto flex-wrap justify-start gap-1.5 rounded-none bg-transparent p-0"
              >
                <TabsTrigger
                  value="measure"
                  data-testid="nav-measure"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <Ruler className="folio-index-tab-icon h-4 w-4 shrink-0" aria-hidden="true" />
                  Measure &amp; Cut
                </TabsTrigger>
                <TabsTrigger
                  value="outer"
                  data-testid="nav-outer"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <BookMarked
                    className="folio-index-tab-icon h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  Cover Studio
                </TabsTrigger>
                <TabsTrigger
                  value="pockets"
                  data-testid="nav-pockets"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <FolderOpen
                    className={`folio-index-tab-icon h-4 w-4 shrink-0 ${!usesInnerPockets ? 'opacity-65' : ''}`}
                    aria-hidden="true"
                  />
                  <span className={!usesInnerPockets ? 'opacity-75' : undefined}>Inner Pockets</span>
                  {!usesInnerPockets && bindingStrategy.innerPocketsNotice && (
                    <Badge
                      variant="outline"
                      data-testid="pockets-builtin-badge"
                      className="ml-0.5 h-4 px-1.5 font-mono text-[10px]"
                    >
                      {bindingStrategy.innerPocketsNotice.tabBadge}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="series"
                  data-testid="nav-series"
                  className="folio-index-tab px-4 py-2 text-xs font-medium tracking-tight data-[state=active]:shadow-none sm:text-sm"
                >
                  <Library className="folio-index-tab-icon h-4 w-4 shrink-0" aria-hidden="true" />
                  Series Spines
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="measure" className="mt-0">
              <MeasureAndCutPanel
                params={project.parameters}
                geometry={geometry}
                splitMode={project.parameters.splitMode}
                printMediaId={project.parameters.printMedia}
                pageSizeId={project.parameters.pdfPageSize}
                unit={project.parameters.unit}
                bookTitle={project.studio.spineText.title || undefined}
                savedBookSummaries={savedSummaries}
                activeProjectId={activeProjectId}
                activeBookName={project.name}
                exportProgressLabel={outerExportProgressLabel}
                exportingOuterPdf={exportingTarget === 'outer-pdf'}
                onChangePrintMedia={(printMedia) => handlePatchParams({ printMedia })}
                onChangePageSize={(pdfPageSize) => handlePatchParams({ pdfPageSize })}
                onChangeSplitMode={(splitMode) => handlePatchParams({ splitMode })}
                onReduceFlapWidth={(jacketFlapWidthMm) => handlePatchParams({ jacketFlapWidthMm })}
                onDetachSlipFlaps={() => handlePatchParams({ softcoverPocketMode: 'separate' })}
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
                onStatusMessage={setStatusMessage}
              />
            </TabsContent>

            <TabsContent value="outer" className="mt-0">
              <CoverStyler
                params={project.parameters}
                geometry={geometry}
                studio={project.studio}
                customFont={activeCustomFont}
                onCustomFontChange={handleCustomFontChange}
                savedBookSummaries={savedSummaries}
                activeProjectId={activeProjectId}
                activeBookName={project.name}
                exportProgressLabel={outerExportProgressLabel}
                onFlushActiveBook={() => flushActiveSave({ renderThumbnail: false })}
                getProjectRepository={getActiveProjectRepository}
                exportingOuterPdf={exportingTarget === 'outer-pdf'}
                onChange={handleStudioChange}
                onUpdateParams={handlePatchParams}
                onDownloadOuterSvg={handleDownloadOuterSvg}
                onDownloadOuterPdf={handleDownloadOuterPdf}
                onOpenMeasureAndCut={() => setActiveTab('measure')}
                onStatusMessage={setStatusMessage}
              />
            </TabsContent>

            <TabsContent value="pockets" className="mt-0">
              {!usesInnerPockets ? (
                <section
                  aria-label="Inner Pockets Notice"
                  data-testid="pockets-not-needed-notice"
                  className="washi-sheet rounded-md border border-border border-t-2 border-t-vermilion p-6 sm:p-8"
                >
                  <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                    <div className="status-success-surface mb-3 inline-flex h-11 w-11 items-center justify-center rounded-md border">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <Badge variant="outline" className="mb-2 font-mono text-[10px] uppercase">
                      {bindingStrategy.shortLabel} •{' '}
                      {bindingStrategy.innerPocketsNotice?.tabBadge ?? 'Not Needed'}
                    </Badge>
                    <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
                      {bindingStrategy.innerPocketsNotice?.heading ??
                        'Separate Inner Pockets Not Needed'}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {bindingStrategy.innerPocketsNotice?.explanation ??
                        bindingStrategy.materialNote}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        data-testid="pockets-return-studio-btn"
                        onClick={() => setActiveTab('outer')}
                      >
                        <BookMarked className="h-4 w-4" aria-hidden="true" />
                        Return to Cover Studio
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="pockets-switch-flexible-btn"
                        onClick={() =>
                          handleParamsChange(
                            BookParametersModel.clampAndNormalize({
                              ...project.parameters,
                              bindingStyle: 'flexible-spine',
                            }),
                          )
                        }
                      >
                        Switch to Flexible Spine
                      </Button>
                    </div>
                  </div>
                </section>
              ) : (
                <InnerPocketsStudio
                  geometry={geometry}
                  interiorStyle={project.parameters.interiorStyle}
                  pocketStyle={project.studio.pocketStyle}
                  coverMatchColor={project.studio.spineBgColor}
                  accentColor={project.studio.spineText.textColor}
                  pdfPageSize={project.parameters.pdfPageSize}
                  printMediaId={project.parameters.printMedia}
                  unit={project.parameters.unit}
                  exportingInnerPdf={exportingTarget === 'inner-pdf'}
                  onChangeInteriorStyle={(interiorStyle) => handlePatchParams({ interiorStyle })}
                  onChangePocketStyle={(pocketStyle) =>
                    handleStudioChange({ ...project.studio, pocketStyle })
                  }
                  onChangePageSize={(pdfPageSize) => handlePatchParams({ pdfPageSize })}
                  onDownloadInnerSvg={handleDownloadInnerSvg}
                  onDownloadInnerPdf={handleDownloadInnerPdf}
                  onStatusMessage={setStatusMessage}
                />
              )}
            </TabsContent>
            <TabsContent value="series" className="mt-0">
              <SeriesSpinesStudio
                savedSummaries={savedSummaries}
                getProjectRepository={getActiveProjectRepository}
                customFont={activeCustomFont}
                unit={project.parameters.unit}
                onRefreshLibrary={handleRefreshLibrary}
                onOpenBookInStudio={handleOpenBookInStudio}
                onStatusMessage={setStatusMessage}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <MyBooksDialog
        open={myBooksOpen}
        summaries={savedSummaries}
        activeProjectId={activeProjectId}
        unit={project.parameters.unit}
        storageKind={storageKind}
        onSelectBook={handleSelectBook}
        onNewBook={handleNewBook}
        onLoadSampleBook={handleLoadSampleBook}
        onRenameBook={handleRenameBook}
        onDuplicateBook={handleDuplicateBook}
        onDeleteBook={handleDeleteBook}
        onExportBookJson={handleExportBookJson}
        onExportAllJson={handleExportAllJson}
        onImportJson={handleImportJson}
        onClose={() => setMyBooksOpen(false)}
      />
    </div>
  );
}

export default App;
