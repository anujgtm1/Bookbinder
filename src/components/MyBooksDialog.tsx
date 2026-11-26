import {
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  Copy,
  Download,
  FolderOpen,
  Library,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBindingStyleSpec } from '@/resources/paperSpecs';
import type { ProjectId, SavedProjectSummary } from '@/types/projectLibrary';
import { UnitConverter, type UnitSystem } from '@/types/units';

export interface MyBooksDialogProps {
  readonly open: boolean;
  readonly summaries: readonly SavedProjectSummary[];
  readonly activeProjectId: ProjectId | null;
  readonly unit: UnitSystem;
  readonly storageKind: 'indexeddb' | 'fallback';
  readonly onSelectBook: (id: ProjectId) => void | Promise<void>;
  readonly onNewBook: () => void | Promise<void>;
  readonly onLoadSampleBook: () => void | Promise<void>;
  readonly onRenameBook: (id: ProjectId, nextName: string) => void | Promise<void>;
  readonly onDuplicateBook: (id: ProjectId) => void | Promise<void>;
  readonly onDeleteBook: (id: ProjectId) => void | Promise<void>;
  readonly onExportBookJson: (id: ProjectId) => void | Promise<void>;
  readonly onExportAllJson: () => void | Promise<void>;
  readonly onImportJson: (file: File) => void | Promise<void>;
  readonly onClose: () => void;
}

function formatUpdatedTimestamp(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return 'Just now';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(parsed));
  } catch {
    return new Date(parsed).toLocaleDateString();
  }
}

function formatBookDimensions(
  summary: Pick<SavedProjectSummary, 'pbWidthMm' | 'pbHeightMm' | 'pbThicknessMm'>,
  unit: UnitSystem,
): string {
  const w = UnitConverter.formatValue(summary.pbWidthMm, unit);
  const h = UnitConverter.formatValue(summary.pbHeightMm, unit);
  const spine = UnitConverter.formatValue(summary.pbThicknessMm, unit);
  return `${w} × ${h} × ${spine} ${unit}`;
}

/**
 * Native modal <dialog closedby="any"> for browsing, switching, renaming, duplicating,
 * deleting, and backing up local saved books in Bookbinder Studio.
 */
export function MyBooksDialog({
  open,
  summaries,
  activeProjectId,
  unit,
  storageKind,
  onSelectBook,
  onNewBook,
  onLoadSampleBook,
  onRenameBook,
  onDuplicateBook,
  onDeleteBook,
  onExportBookJson,
  onExportAllJson,
  onImportJson,
  onClose,
}: MyBooksDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [renamingId, setRenamingId] = useState<ProjectId | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<ProjectId | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function') {
      if (dialog.open) {
        dialog.close();
      } else {
        onClose();
      }
    } else {
      dialog?.removeAttribute('open');
      onClose();
    }
  }, [onClose]);

  // Sync open prop with native dialog.showModal() / dialog.close()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else {
      setRenamingId(null);
      setRenameDraft('');
      setConfirmDeleteId(null);
      if (dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
        }
      }
    }
  }, [open]);

  // Light-dismiss fallback for browsers without native HTMLDialogElement closedby support (Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
          onClose();
        }
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [onClose]);

  const runAction = async (fn: () => void | Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await fn();
    } finally {
      setIsBusy(false);
    }
  };

  const beginRename = (summary: SavedProjectSummary) => {
    setConfirmDeleteId(null);
    setRenamingId(summary.id);
    setRenameDraft(summary.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const commitRename = async (id: ProjectId) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    await runAction(async () => {
      await onRenameBook(id, trimmed);
      setRenamingId(null);
      setRenameDraft('');
    });
  };

  const handleImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void runAction(() => onImportJson(file));
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="my-books-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        setRenamingId(null);
        setRenameDraft('');
        setConfirmDeleteId(null);
        onClose();
      }}
      className="bindery-modal m-auto max-h-[90vh] w-[min(95vw,860px)] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl"
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={titleId}
                  className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-foreground"
                >
                  <Library className="h-4 w-4 text-brass" aria-hidden="true" />
                  My Books
                </h2>
                <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                  {summaries.length} {summaries.length === 1 ? 'book' : 'books'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Switch between saved bindings, duplicate editions, or back up your local library.
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close My Books dialog"
              data-testid="my-books-close-btn"
              onClick={requestClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Top Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/25 px-5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isBusy}
                data-testid="my-books-new-btn"
                onClick={() => void runAction(onNewBook)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New Book
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                data-testid="my-books-sample-btn"
                className="border-vermilion/45 hover:border-vermilion hover:bg-vermilion/10"
                onClick={() => void runAction(onLoadSampleBook)}
              >
                <Sparkles className="h-3.5 w-3.5 text-vermilion" aria-hidden="true" />
                Sample Book
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                data-testid="my-books-import-input"
                aria-label="Import book or library JSON"
                className="hidden"
                onChange={handleImportInputChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                data-testid="my-books-import-btn"
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Import .json
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || summaries.length === 0}
                data-testid="my-books-export-all-btn"
                onClick={() => void runAction(onExportAllJson)}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                Backup All (.json)
              </Button>
            </div>
          </div>

          {/* Scrollable Saved Books Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {storageKind === 'fallback' && (
              <div
                role="status"
                data-testid="my-books-fallback-warning"
                className="status-warning-surface mb-4 flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-xs"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="leading-relaxed">
                  IndexedDB is unavailable in this browser session, so saved books are stored
                  temporarily in memory. Export a backup (.json) to keep your library safe.
                </p>
              </div>
            )}

            {summaries.length === 0 ? (
              <div
                data-testid="my-books-empty"
                className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/20 px-6 py-10 text-center"
              >
                <BookOpen className="mb-2.5 h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="font-serif text-base font-medium text-foreground">
                  No saved books yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Start a blank edition with New Book or explore a finished classic with Sample
                  Book.
                </p>
              </div>
            ) : (
              <ul
                data-testid="my-books-list"
                className="grid grid-cols-1 gap-3.5 md:grid-cols-2"
              >
                {summaries.map((summary) => {
                  const isActive = summary.id === activeProjectId;
                  const isRenaming = renamingId === summary.id;
                  const isConfirmingDelete = confirmDeleteId === summary.id;
                  const bindingSpec = getBindingStyleSpec(summary.bindingStyle);

                  return (
                    <li
                      key={summary.id}
                      data-testid="my-books-item"
                      data-project-id={summary.id}
                      data-active={isActive ? 'true' : 'false'}
                      className={`flex flex-col justify-between gap-3 rounded-lg border p-3.5 transition-colors ${
                        isActive
                          ? 'border-vermilion/65 bg-secondary/40 shadow-xs'
                          : 'border-border bg-card hover:border-brass/65'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Cover Thumbnail or Tasteful Placeholder */}
                        <div className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-secondary/50">
                          {summary.thumbnailDataUrl ? (
                            <img
                              src={summary.thumbnailDataUrl}
                              alt={`Cover preview for ${summary.name}`}
                              className="h-full w-full object-contain p-1"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1 px-1.5 text-center text-muted-foreground">
                              <BookOpen className="h-4 w-4 text-brass" aria-hidden="true" />
                              <span className="font-mono text-[9.5px] leading-tight">
                                {UnitConverter.formatValue(summary.pbWidthMm, unit)} ×{' '}
                                {UnitConverter.formatValue(summary.pbHeightMm, unit)} {unit}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Book Identity & Metadata */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="text"
                                autoFocus
                                value={renameDraft}
                                aria-label="Book name"
                                data-testid="my-books-rename-input"
                                className="h-7 px-2 text-xs"
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void commitRename(summary.id);
                                  } else if (e.key === 'Escape') {
                                    // Prevent Esc from also closing the native <dialog>
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cancelRename();
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="default"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                disabled={isBusy || renameDraft.trim().length === 0}
                                aria-label="Save book name"
                                data-testid="my-books-rename-save-btn"
                                onClick={() => void commitRename(summary.id)}
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                disabled={isBusy}
                                aria-label="Cancel rename"
                                data-testid="my-books-rename-cancel-btn"
                                onClick={cancelRename}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <h3
                                data-testid={`my-books-name-${summary.id}`}
                                className="line-clamp-2 font-serif text-sm font-semibold leading-snug text-foreground"
                                title={summary.name}
                              >
                                {summary.name}
                              </h3>
                              {isActive && (
                                <Badge
                                  variant="vermilion"
                                  data-testid="my-books-active-badge"
                                  className="shrink-0 rounded-full px-2 py-0 text-[10px]"
                                >
                                  Active
                                </Badge>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              {bindingSpec.shortLabel}
                            </Badge>
                            {summary.hasCustomFont && (
                              <Badge
                                variant="brass"
                                className="gap-1 px-1.5 py-0 text-[10px]"
                                title="Includes saved custom font"
                              >
                                <Type className="h-2.5 w-2.5" aria-hidden="true" />
                                Font
                              </Badge>
                            )}
                          </div>

                          <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                            <p data-testid={`my-books-dims-${summary.id}`}>
                              {formatBookDimensions(summary, unit)}
                            </p>
                            <p className="text-[10px]">
                              Updated {formatUpdatedTimestamp(summary.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions or Inline 2-Step Delete Confirmation */}
                      {isConfirmingDelete ? (
                        <div
                          data-testid={`my-books-delete-confirm-${summary.id}`}
                          className="status-danger-surface flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-medium">Delete this book?</span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              className="h-7 bg-card px-2 text-xs text-foreground"
                              data-testid={`my-books-cancel-delete-btn-${summary.id}`}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isBusy}
                              className="h-7 px-2.5 text-xs"
                              data-testid={`my-books-confirm-delete-btn-${summary.id}`}
                              onClick={() =>
                                void runAction(async () => {
                                  await onDeleteBook(summary.id);
                                  setConfirmDeleteId(null);
                                })
                              }
                            >
                              Confirm Delete
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border/70 pt-2.5">
                          <div className="flex items-center gap-1.5">
                            {!isActive && (
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                disabled={isBusy}
                                className="h-7 gap-1 px-2.5 text-xs"
                                data-testid={`my-books-open-btn-${summary.id}`}
                                onClick={() => void runAction(() => onSelectBook(summary.id))}
                              >
                                <FolderOpen className="h-3 w-3" aria-hidden="true" />
                                Open
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              className="h-7 gap-1 px-2 text-xs"
                              data-testid={`my-books-rename-btn-${summary.id}`}
                              onClick={() => beginRename(summary)}
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              Rename
                            </Button>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                              aria-label={`Duplicate ${summary.name}`}
                              title="Duplicate book"
                              data-testid={`my-books-duplicate-btn-${summary.id}`}
                              onClick={() => void runAction(() => onDuplicateBook(summary.id))}
                            >
                              <Copy className="h-3 w-3" aria-hidden="true" />
                              <span className="hidden sm:inline">Duplicate</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                              aria-label={`Export ${summary.name} as JSON`}
                              title="Export .json"
                              data-testid={`my-books-export-btn-${summary.id}`}
                              onClick={() => void runAction(() => onExportBookJson(summary.id))}
                            >
                              <Download className="h-3 w-3" aria-hidden="true" />
                              <span className="hidden sm:inline">.json</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={isBusy}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Delete ${summary.name}`}
                              title="Delete book"
                              data-testid={`my-books-delete-btn-${summary.id}`}
                              onClick={() => {
                                setRenamingId(null);
                                setConfirmDeleteId(summary.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer Note */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/25 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Saved locally in this browser. Export a backup (.json) to move books between devices.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={requestClose}>
              Done
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
