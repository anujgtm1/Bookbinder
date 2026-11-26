import { BookOpen, Check, Library, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getBindingStyleSpec } from '@/resources/paperSpecs';
import type { ProjectId, SavedProjectSummary } from '@/types/projectLibrary';
import { UnitConverter, type UnitSystem } from '@/types/units';

export interface ImportFromLibraryDialogProps {
  readonly open: boolean;
  readonly summaries: readonly SavedProjectSummary[];
  readonly existingLinkedIds: ReadonlySet<ProjectId>;
  readonly unit: UnitSystem;
  readonly onImportSelected: (ids: readonly ProjectId[]) => void | Promise<void>;
  readonly onClose: () => void;
}

/**
 * Native modal <dialog closedby="any"> for importing one or more saved books from
 * My Books directly onto the active Series / Collection shelf.
 */
export function ImportFromLibraryDialog({
  open,
  summaries,
  existingLinkedIds,
  unit,
  onImportSelected,
  onClose,
}: ImportFromLibraryDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<ProjectId>>(new Set());
  const [importing, setImporting] = useState(false);

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
      else onClose();
    } else {
      dialog?.removeAttribute('open');
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setSelectedIds(new Set());
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  // Safari fallback for closedby="any" light dismiss
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
        if (typeof dialog.close === 'function') dialog.close();
        else onClose();
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

  const toggleSelection = (id: ProjectId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmImport = async () => {
    if (selectedIds.size === 0 || importing) return;
    setImporting(true);
    try {
      await onImportSelected(Array.from(selectedIds));
      requestClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="series-import-library-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
      className="bindery-modal m-auto max-h-[86vh] w-[min(94vw,680px)] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl"
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0 space-y-0.5">
              <h2
                id={titleId}
                className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-foreground"
              >
                <Library className="h-4 w-4 text-brass" aria-hidden="true" />
                Import from My Books
              </h2>
              <p className="text-xs text-muted-foreground">
                Select saved books to place onto this shelf while preserving their front &amp; back
                covers.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close Import from My Books dialog"
              onClick={requestClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div
            className="flex-1 overflow-y-auto p-5"
            style={{ scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}
          >
            {summaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/20 px-6 py-10 text-center">
                <BookOpen className="mb-2 h-7 w-7 text-muted-foreground" aria-hidden="true" />
                <p className="font-serif text-sm font-medium text-foreground">
                  No saved books found in My Books
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Design books in Cover Studio or save this series first to populate your library.
                </p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="series-import-library-list">
                {summaries.map((summary) => {
                  const checked = selectedIds.has(summary.id);
                  const alreadyLinked = existingLinkedIds.has(summary.id);
                  const bindingSpec = getBindingStyleSpec(summary.bindingStyle);
                  const checkboxId = `import-book-${summary.id}`;

                  return (
                    <label
                      key={summary.id}
                      htmlFor={checkboxId}
                      data-testid={`series-import-item-${summary.id}`}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        checked
                          ? 'border-vermilion bg-secondary/45'
                          : 'border-border bg-card hover:border-brass/70'
                      }`}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        data-testid={`series-import-checkbox-${summary.id}`}
                        onChange={() => toggleSelection(summary.id)}
                        className="h-4 w-4 shrink-0 rounded accent-vermilion"
                      />
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-secondary/50">
                        {summary.thumbnailDataUrl ? (
                          <img
                            src={summary.thumbnailDataUrl}
                            alt=""
                            className="h-full w-full object-contain p-0.5"
                          />
                        ) : (
                          <BookOpen className="h-4 w-4 text-brass" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-serif text-sm font-semibold text-foreground">
                            {summary.name}
                          </span>
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {bindingSpec.shortLabel}
                          </Badge>
                          {alreadyLinked && (
                            <Badge variant="brass" className="gap-0.5 px-1.5 py-0 text-[10px]">
                              <Check className="h-2.5 w-2.5" aria-hidden="true" />
                              On Shelf
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {UnitConverter.formatValue(summary.pbWidthMm, unit)} ×{' '}
                          {UnitConverter.formatValue(summary.pbHeightMm, unit)} ×{' '}
                          {UnitConverter.formatValue(summary.pbThicknessMm, unit)} {unit}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/25 px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} {selectedIds.size === 1 ? 'book' : 'books'} selected
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                autoFocus
                disabled={selectedIds.size === 0 || importing}
                data-testid="series-import-confirm-btn"
                onClick={() => void handleConfirmImport()}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {importing
                  ? 'Importing…'
                  : `Add ${selectedIds.size || ''} ${selectedIds.size === 1 ? 'Book' : 'Books'}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
