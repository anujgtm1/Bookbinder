import {
  Download,
  FolderPlus,
  Library,
  Save,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calculateCaseGeometry } from '@/core/geometry';
import type { ProjectRepository } from '@/core/projectLibrary';
import {
  compileSeriesBookToCoverStudio,
  computeSeriesShelfLayout,
  createSeriesBookFromSavedRecord,
  type SeriesBookLayout,
} from '@/core/seriesSpines';
import {
  exportSeriesToJson,
  loadSeriesWorkspace,
  parseSeriesFromJson,
  saveSeriesWorkspace,
  type SeriesWorkspaceState,
} from '@/core/seriesStorage';
import { triggerTextDownload } from '@/core/storage';
import {
  SERIES_STARTER_TEMPLATES,
  type SeriesPalettePreset,
} from '@/resources/seriesPresets';
import type { CustomFontAsset } from '@/studio/fonts';
import { isEditableKeyboardTarget } from '@/studio/studioClipboard';
import { renderProjectThumbnailDataUrl } from '@/studio/thumbnailRenderer';
import { BookbinderProjectModel } from '@/types/project';
import {
  ProjectLibraryModel,
  type ProjectId,
  type SavedProjectRecord,
  type SavedProjectSummary,
} from '@/types/projectLibrary';
import {
  SERIES_BOUNDS,
  SeriesProjectModel,
  type SeriesBookEntry,
  type SeriesBookId,
  type SeriesCollectionMode,
  type SeriesPanoramaConfig,
  type SeriesProject,
  type SeriesSharedDesign,
} from '@/types/seriesSpines';
import type { UnitSystem } from '@/types/units';
import { ImportFromLibraryDialog } from './series/ImportFromLibraryDialog';
import { SeriesExportDialog } from './series/SeriesExportDialog';
import { SeriesInspectorDock } from './series/SeriesInspectorDock';
import { SeriesShelfStage } from './series/SeriesShelfStage';
import {
  isSupportedPanoramaImageFile,
  readPanoramaImageFile,
} from './series/panoramaImageLoader';

export interface SeriesSpinesStudioProps {
  readonly savedSummaries: readonly SavedProjectSummary[];
  readonly getProjectRepository: () => Promise<ProjectRepository>;
  readonly customFont: CustomFontAsset | null;
  readonly unit: UnitSystem;
  readonly onRefreshLibrary: () => Promise<void>;
  readonly onOpenBookInStudio: (projectId: ProjectId) => Promise<void>;
  readonly onStatusMessage: (message: string) => void;
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read file text.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

export function SeriesSpinesStudio({
  savedSummaries,
  getProjectRepository,
  customFont,
  unit,
  onRefreshLibrary,
  onOpenBookInStudio,
  onStatusMessage,
}: SeriesSpinesStudioProps) {
  const [workspace, setWorkspace] = useState<SeriesWorkspaceState>(() => loadSeriesWorkspace());
  const [selectedBookId, setSelectedBookId] = useState<SeriesBookId | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  const activeSeries: SeriesProject = useMemo(
    () =>
      workspace.seriesList.find((s) => s.id === workspace.activeSeriesId) ??
      workspace.seriesList[0],
    [workspace],
  );

  // Keep selectedBookId valid whenever activeSeries changes
  const effectiveSelectedBookId = useMemo<SeriesBookId | null>(() => {
    if (selectedBookId && activeSeries.books.some((b) => b.id === selectedBookId)) {
      return selectedBookId;
    }
    return activeSeries.books[0]?.id ?? null;
  }, [activeSeries.books, selectedBookId]);

  const layout = useMemo(() => computeSeriesShelfLayout(activeSeries), [activeSeries]);

  const existingLinkedIds = useMemo(
    () =>
      new Set<ProjectId>(
        activeSeries.books
          .map((b) => b.linkedProjectId)
          .filter((id): id is ProjectId => id !== null),
      ),
    [activeSeries.books],
  );

  // Persist workspace to localStorage whenever edited
  useEffect(() => {
    const res = saveSeriesWorkspace(workspace);
    if (res.omittedPanoramaForQuota) {
      onStatusMessage('Series saved (panorama image exceeded browser localStorage quota)');
    }
  }, [workspace, onStatusMessage]);

  const updateActiveSeries = useCallback((updater: (prev: SeriesProject) => SeriesProject) => {
    setWorkspace((prev) => ({
      ...prev,
      seriesList: prev.seriesList.map((s) =>
        s.id === prev.activeSeriesId
          ? { ...updater(s), updatedAt: new Date().toISOString() }
          : s,
      ),
    }));
  }, []);

  const handleModeChange = (mode: SeriesCollectionMode) => {
    updateActiveSeries((prev) => ({
      ...prev,
      mode,
      shared: {
        ...prev.shared,
        volumeNumberStyle:
          mode === 'collection' && prev.shared.volumeNumberStyle === 'roman'
            ? 'none'
            : mode === 'series' && prev.shared.volumeNumberStyle === 'none'
              ? 'roman'
              : prev.shared.volumeNumberStyle,
      },
    }));
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = SERIES_STARTER_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const built = template.build();
    setWorkspace((prev) => ({
      activeSeriesId: built.id,
      seriesList: [built, ...prev.seriesList.filter((s) => s.id !== activeSeries.id)],
    }));
    setSelectedBookId(built.books[0]?.id ?? null);
    onStatusMessage(`Loaded template: ${template.label}`);
  };

  const handleAddBook = () => {
    if (activeSeries.books.length >= SERIES_BOUNDS.maxBooks) return;
    const lastBook = activeSeries.books[activeSeries.books.length - 1];
    const nextIdx = activeSeries.books.length + 1;
    const newEntry = SeriesProjectModel.createBookEntry({
      title: `Volume ${nextIdx}`,
      author: activeSeries.mode === 'series' ? (lastBook?.author ?? '') : '',
      parameters: lastBook
        ? { ...lastBook.parameters }
        : undefined,
    });
    updateActiveSeries((prev) => ({
      ...prev,
      books: [...prev.books, newEntry],
    }));
    setSelectedBookId(newEntry.id);
  };

  const handleMoveBook = (id: SeriesBookId, direction: 'left' | 'right') => {
    updateActiveSeries((prev) => {
      const idx = prev.books.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const target = direction === 'left' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.books.length) return prev;
      const next = [...prev.books];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return { ...prev, books: next };
    });
  };

  const handleDuplicateBook = (id: SeriesBookId) => {
    if (activeSeries.books.length >= SERIES_BOUNDS.maxBooks) return;
    const idx = activeSeries.books.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const source = activeSeries.books[idx];
    const copy = SeriesProjectModel.createBookEntry({
      ...source,
      id: SeriesProjectModel.createSeriesBookId(),
      linkedProjectId: null,
      title: `${source.title} (Copy)`,
      parameters: { ...source.parameters },
    });
    updateActiveSeries((prev) => {
      const next = [...prev.books];
      next.splice(idx + 1, 0, copy);
      return { ...prev, books: next };
    });
    setSelectedBookId(copy.id);
  };

  const handleRemoveBook = (id: SeriesBookId) => {
    if (activeSeries.books.length <= 1) return;
    updateActiveSeries((prev) => ({
      ...prev,
      books: prev.books.filter((b) => b.id !== id),
    }));
  };

  const handleUpdateBook = (
    id: SeriesBookId,
    updater: (book: SeriesBookEntry) => SeriesBookEntry,
  ) => {
    updateActiveSeries((prev) => ({
      ...prev,
      books: prev.books.map((b) => (b.id === id ? updater(b) : b)),
    }));
  };

  const handleUpdateShared = (patch: Partial<SeriesSharedDesign>) => {
    updateActiveSeries((prev) => ({
      ...prev,
      shared: { ...prev.shared, ...patch },
    }));
  };

  const handleUpdatePanorama = useCallback(
    (patch: Partial<SeriesPanoramaConfig>) => {
      updateActiveSeries((prev) => ({
        ...prev,
        shared: {
          ...prev.shared,
          panorama: { ...prev.shared.panorama, ...patch },
        },
      }));
    },
    [updateActiveSeries],
  );

  const bookCountRef = useRef(activeSeries.books.length);
  bookCountRef.current = activeSeries.books.length;

  const handleUploadPanoramaFile = useCallback(
    async (file: File) => {
      if (!isSupportedPanoramaImageFile(file)) {
        onStatusMessage('Unsupported image format — use PNG, JPG, WebP, or SVG.');
        return;
      }
      try {
        const loaded = await readPanoramaImageFile(file);
        handleUpdatePanorama({
          enabled: true,
          dataUrl: loaded.dataUrl,
          fileName: loaded.fileName,
          naturalWidth: loaded.naturalWidth,
          naturalHeight: loaded.naturalHeight,
          offsetXMm: 0,
          offsetYMm: 0,
          scale: 1,
        });
        const count = bookCountRef.current;
        onStatusMessage(
          `Loaded panorama "${loaded.fileName}" across ${count} ${count === 1 ? 'spine' : 'spines'} — drag canvas to reposition`,
        );
      } catch {
        onStatusMessage('Could not load selected panorama image.');
      }
    },
    [handleUpdatePanorama, onStatusMessage],
  );

  // OS Clipboard Image Paste (Cmd/Ctrl+V) while Series Spines is active
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (document.querySelector('dialog[open]')) return;

      const items = Array.from(event.clipboardData?.items ?? []);
      let imageFile: File | null = null;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const candidate = item.getAsFile();
          if (candidate) {
            imageFile = candidate;
            break;
          }
        }
      }
      if (!imageFile && event.clipboardData?.files) {
        for (const file of Array.from(event.clipboardData.files)) {
          if (isSupportedPanoramaImageFile(file)) {
            imageFile = file;
            break;
          }
        }
      }
      if (imageFile) {
        event.preventDefault();
        void handleUploadPanoramaFile(imageFile);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleUploadPanoramaFile]);

  const handleApplyPalette = (preset: SeriesPalettePreset) => {
    updateActiveSeries((prev) => ({
      ...prev,
      shared: {
        ...prev.shared,
        defaultBgColor: preset.defaultBgColor,
        defaultTextColor: preset.defaultTextColor,
        accentColor: preset.accentColor,
      },
      books: prev.books.map((book, idx) => ({
        ...book,
        spineBgColorOverride: preset.perBookBgColors
          ? preset.perBookBgColors[idx % preset.perBookBgColors.length]
          : null,
        textColorOverride: null,
        accentColorOverride: null,
      })),
    }));
    onStatusMessage(`Applied palette: ${preset.label}`);
  };

  const handleImportFromLibrary = async (projectIds: readonly ProjectId[]) => {
    const repo = await getProjectRepository();
    const importedEntries: SeriesBookEntry[] = [];
    for (const id of projectIds) {
      if (activeSeries.books.length + importedEntries.length >= SERIES_BOUNDS.maxBooks) {
        break;
      }
      const record = await repo.getProject(id);
      if (record) {
        importedEntries.push(createSeriesBookFromSavedRecord(record));
      }
    }
    if (importedEntries.length === 0) return;

    updateActiveSeries((prev) => ({
      ...prev,
      books: [...prev.books, ...importedEntries],
    }));
    setSelectedBookId(importedEntries[importedEntries.length - 1].id);
    onStatusMessage(
      `Imported ${importedEntries.length} ${importedEntries.length === 1 ? 'book' : 'books'} from My Books`,
    );
  };

  const persistBookToLibrary = async (
    repo: ProjectRepository,
    series: SeriesProject,
    bookIndex: number,
  ): Promise<ProjectId> => {
    const book = series.books[bookIndex];
    const existingRecord = book.linkedProjectId
      ? await repo.getProject(book.linkedProjectId)
      : null;

    const compiledStudio = compileSeriesBookToCoverStudio(
      series,
      bookIndex,
      existingRecord?.project.studio ?? null,
    );

    const now = new Date().toISOString();
    const projectId = existingRecord?.id ?? ProjectLibraryModel.createProjectId();
    const bookName =
      book.title.trim() ||
      existingRecord?.project.name ||
      `${series.name} — Book ${bookIndex + 1}`;
    const compiledProject = BookbinderProjectModel.create(
      book.parameters,
      compiledStudio,
      bookName,
    );

    const thumbnailDataUrl = await renderProjectThumbnailDataUrl(
      calculateCaseGeometry(book.parameters),
      compiledStudio,
      { customFont },
    );

    const record: SavedProjectRecord = {
      id: projectId,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      project: { ...compiledProject, updatedAt: now },
      thumbnailDataUrl,
      customFont: existingRecord?.customFont ?? customFont,
    };

    await repo.saveProject(record);
    return projectId;
  };

  const handleSaveAllToLibrary = async () => {
    if (savingAll || activeSeries.books.length === 0) return;
    setSavingAll(true);
    try {
      const repo = await getProjectRepository();
      const linkedIdsByBookId = new Map<SeriesBookId, ProjectId>();

      for (let i = 0; i < activeSeries.books.length; i++) {
        const pid = await persistBookToLibrary(repo, activeSeries, i);
        linkedIdsByBookId.set(activeSeries.books[i].id, pid);
      }

      updateActiveSeries((prev) => ({
        ...prev,
        books: prev.books.map((b) => ({
          ...b,
          linkedProjectId: linkedIdsByBookId.get(b.id) ?? b.linkedProjectId,
        })),
      }));

      await onRefreshLibrary();
      onStatusMessage(
        `Saved all ${activeSeries.books.length} ${activeSeries.books.length === 1 ? 'book' : 'books'} to My Books`,
      );
    } catch {
      onStatusMessage('Failed to save series books to My Books.');
    } finally {
      setSavingAll(false);
    }
  };

  const handleOpenBookInCoverStudio = async (bookLayout: SeriesBookLayout) => {
    try {
      const repo = await getProjectRepository();
      const pid = await persistBookToLibrary(repo, activeSeries, bookLayout.index);
      if (bookLayout.book.linkedProjectId !== pid) {
        updateActiveSeries((prev) => ({
          ...prev,
          books: prev.books.map((b) =>
            b.id === bookLayout.book.id ? { ...b, linkedProjectId: pid } : b,
          ),
        }));
      }
      await onRefreshLibrary();
      await onOpenBookInStudio(pid);
    } catch {
      onStatusMessage('Failed to open book in Cover Studio.');
    }
  };

  const handleExportSeriesJson = () => {
    const json = exportSeriesToJson(activeSeries);
    const fileName = SeriesProjectModel.suggestFileName(activeSeries.name);
    triggerTextDownload(json, fileName, 'application/json;charset=utf-8');
    onStatusMessage(`Saved ${fileName}`);
  };

  const handleImportSeriesJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await readTextFile(file);
      const parsed = parseSeriesFromJson(text);
      if (!parsed.ok) {
        onStatusMessage(`Series import error: ${parsed.error}`);
        return;
      }
      const imported = { ...parsed.series, id: SeriesProjectModel.createSeriesId() };
      setWorkspace((prev) => ({
        activeSeriesId: imported.id,
        seriesList: [imported, ...prev.seriesList],
      }));
      setSelectedBookId(imported.books[0]?.id ?? null);
      onStatusMessage(`Loaded series "${imported.name}"`);
    } catch {
      onStatusMessage('Could not read selected series JSON file.');
    }
  };

  return (
    <div
      data-testid="series-spines-studio"
      className="flex min-w-0 flex-col gap-3.5"
    >
      {/* Top Series Workbench Bar */}
      <div className="washi-sheet flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-border border-t-2 border-t-vermilion px-3.5 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            type="text"
            aria-label="Series or collection name"
            data-testid="series-name-input"
            value={activeSeries.name}
            onChange={(e) =>
              updateActiveSeries((prev) => ({ ...prev, name: e.target.value }))
            }
            className="h-8 w-52 font-serif text-sm font-semibold sm:w-60"
          />

          {/* Series vs Collection Segmented Toggle */}
          <div
            role="group"
            aria-label="Shelf mode"
            className="inline-flex rounded-md border border-border bg-secondary/60 p-0.5"
          >
            <button
              type="button"
              aria-pressed={activeSeries.mode === 'series'}
              data-testid="series-mode-series"
              onClick={() => handleModeChange('series')}
              className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                activeSeries.mode === 'series'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Series
            </button>
            <button
              type="button"
              aria-pressed={activeSeries.mode === 'collection'}
              data-testid="series-mode-collection"
              onClick={() => handleModeChange('collection')}
              className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                activeSeries.mode === 'collection'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Collection
            </button>
          </div>

          {/* Starter Templates Dropdown */}
          <select
            aria-label="Load starter shelf template"
            data-testid="series-template-select"
            value=""
            onChange={(e) => {
              if (e.target.value) handleApplyTemplate(e.target.value);
            }}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
          >
            <option value="">Starter Templates…</option>
            {SERIES_STARTER_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.label}
              </option>
            ))}
          </select>
        </div>

        {/* Right Actions: JSON Backup, Import My Books, Save All, Export Series */}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={jsonImportRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Import series JSON file"
            onChange={(e) => void handleImportSeriesJson(e)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Import Series .json"
            onClick={() => jsonImportRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Import</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Save Series .json"
            onClick={handleExportSeriesJson}
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">.json</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            data-testid="series-header-import-books-btn"
            onClick={() => setImportDialogOpen(true)}
          >
            <Library className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            Import from My Books
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={savingAll}
            className="h-8 gap-1.5 px-2.5 text-xs"
            data-testid="series-save-all-btn"
            onClick={() => void handleSaveAllToLibrary()}
          >
            <Save className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            {savingAll ? 'Saving…' : 'Save All to My Books'}
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
            data-testid="series-open-export-btn"
            onClick={() => setExportDialogOpen(true)}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export Series
          </Button>
        </div>
      </div>

      {/* Responsive 2-Pane Workbench: Shelf Stage + Inspector Dock */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_372px]">
        <SeriesShelfStage
          series={activeSeries}
          layout={layout}
          selectedBookId={effectiveSelectedBookId}
          unit={unit}
          customFont={customFont}
          onSelectBook={setSelectedBookId}
          onMoveBook={handleMoveBook}
          onDuplicateBook={handleDuplicateBook}
          onRemoveBook={handleRemoveBook}
          onUpdatePanorama={handleUpdatePanorama}
          onUploadPanoramaFile={handleUploadPanoramaFile}
          onOpenInCoverStudio={(bl) => void handleOpenBookInCoverStudio(bl)}
          onStatusMessage={onStatusMessage}
        />

        <SeriesInspectorDock
          series={activeSeries}
          layout={layout}
          selectedBookId={effectiveSelectedBookId}
          unit={unit}
          customFont={customFont}
          onSelectBook={setSelectedBookId}
          onAddBook={handleAddBook}
          onOpenImportLibrary={() => setImportDialogOpen(true)}
          onUpdateBook={handleUpdateBook}
          onUpdateShared={handleUpdateShared}
          onUpdatePanorama={handleUpdatePanorama}
          onUploadPanoramaFile={handleUploadPanoramaFile}
          onApplyPalette={handleApplyPalette}
          onStatusMessage={onStatusMessage}
        />
      </div>

      <ImportFromLibraryDialog
        open={importDialogOpen}
        summaries={savedSummaries}
        existingLinkedIds={existingLinkedIds}
        unit={unit}
        onImportSelected={handleImportFromLibrary}
        onClose={() => setImportDialogOpen(false)}
      />

      <SeriesExportDialog
        open={exportDialogOpen}
        series={activeSeries}
        customFont={customFont}
        unit={unit}
        getProjectRepository={getProjectRepository}
        onStatusMessage={onStatusMessage}
        onClose={() => setExportDialogOpen(false)}
      />
    </div>
  );
}
