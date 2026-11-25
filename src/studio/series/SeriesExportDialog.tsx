import {
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  FlipHorizontal2,
  Scissors,
  X,
} from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { ProjectRepository } from '@/core/projectLibrary';
import { triggerBytesDownload, triggerTextDownload } from '@/core/storage';
import { PRIMARY_SHEET_MEDIA_IDS, getPageSizeSpec } from '@/resources/paperSpecs';
import type { CustomFontAsset } from '@/studio/fonts';
import {
  DEFAULT_SERIES_CRICUT_OPTIONS,
  generateSeriesCoversPdf,
  generateSeriesCricutHtvSvg,
  generateSeriesSpineProofPdf,
  type SeriesCricutHtvOptions,
  type SeriesCricutHtvResult,
  type SeriesProofPaperSize,
} from '@/studio/seriesExporters';
import type { ProjectId } from '@/types/projectLibrary';
import type { SeriesProject } from '@/types/seriesSpines';
import type { CoverStudioState } from '@/types/studio';
import { UnitConverter, type UnitSystem } from '@/types/units';

export type SeriesExportTab = 'cricut' | 'proof' | 'covers';

export interface SeriesExportDialogProps {
  readonly open: boolean;
  readonly series: SeriesProject;
  readonly customFont: CustomFontAsset | null;
  readonly unit: UnitSystem;
  readonly getProjectRepository: () => Promise<ProjectRepository>;
  readonly onStatusMessage: (message: string) => void;
  readonly onClose: () => void;
}

/**
 * Native modal <dialog closedby="any"> for exporting Series Spines:
 * 1. Cricut / HTV Gang-Sheet SVG (flattened mm paths, zero <text>/<image>/transform=)
 * 2. 1:1 Spine Proof PDF (exact millimeter lineup on Custom Fit or canonical desktop sheets)
 * 3. Full Cover Set PDF (multi-page wrap PDF merging every book in the series)
 */
export function SeriesExportDialog({
  open,
  series,
  customFont,
  unit,
  getProjectRepository,
  onStatusMessage,
  onClose,
}: SeriesExportDialogProps) {
  const titleId = useId();
  const cricutTabId = useId();
  const proofTabId = useId();
  const coversTabId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cricutTabRef = useRef<HTMLButtonElement>(null);
  const proofTabRef = useRef<HTMLButtonElement>(null);
  const coversTabRef = useRef<HTMLButtonElement>(null);

  const [activeTab, setActiveTab] = useState<SeriesExportTab>('cricut');
  const [cricutOptions, setCricutOptions] = useState<SeriesCricutHtvOptions>(
    DEFAULT_SERIES_CRICUT_OPTIONS,
  );
  const [cricutPreview, setCricutPreview] = useState<SeriesCricutHtvResult | null>(null);
  const [cricutGenerating, setCricutGenerating] = useState(false);

  const [proofPaperSize, setProofPaperSize] = useState<SeriesProofPaperSize>('custom-fit');
  const [proofIncludeScaleBar, setProofIncludeScaleBar] = useState(true);
  const [proofIncludeGuides, setProofIncludeGuides] = useState(true);
  const [proofExporting, setProofExporting] = useState(false);

  const [coversDpi, setCoversDpi] = useState<300 | 600>(300);
  const [coversScaleBar, setCoversScaleBar] = useState(true);
  const [coversExporting, setCoversExporting] = useState(false);
  const [coversProgress, setCoversProgress] = useState<string | null>(null);

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

  // Live Cricut gang-sheet SVG preview
  useEffect(() => {
    if (!open || activeTab !== 'cricut') return;
    let cancelled = false;
    setCricutGenerating(true);

    void generateSeriesCricutHtvSvg(series, customFont, cricutOptions)
      .then((res) => {
        if (!cancelled) setCricutPreview(res);
      })
      .finally(() => {
        if (!cancelled) setCricutGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeTab, series, customFont, cricutOptions]);

  const previewDataUri = useMemo(() => {
    if (!cricutPreview) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cricutPreview.svg)}`;
  }, [cricutPreview]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs: readonly SeriesExportTab[] = ['cricut', 'proof', 'covers'];
    const refs = [cricutTabRef, proofTabRef, coversTabRef] as const;
    const currentIdx = tabs.indexOf(activeTab);
    let nextIdx = currentIdx;

    if (event.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = tabs.length - 1;
    else return;

    event.preventDefault();
    setActiveTab(tabs[nextIdx]);
    refs[nextIdx].current?.focus();
  };

  const handleDownloadCricutSvg = () => {
    if (!cricutPreview) return;
    triggerTextDownload(cricutPreview.svg, cricutPreview.fileName, 'image/svg+xml;charset=utf-8');
    onStatusMessage(
      `Exported ${cricutPreview.fileName} (${cricutPreview.spineCount} spines, ${cricutPreview.pathCount} paths)`,
    );
    requestClose();
  };

  const handleDownloadProofPdf = async () => {
    if (proofExporting) return;
    setProofExporting(true);
    try {
      const res = await generateSeriesSpineProofPdf(series, customFont, {
        paperSize: proofPaperSize,
        includeScaleBar: proofIncludeScaleBar,
        includeAlignmentGuides: proofIncludeGuides,
      });
      triggerBytesDownload(res.bytes, res.fileName, 'application/pdf');
      onStatusMessage(
        `Exported ${res.fileName} (${res.pageCount} ${res.pageCount === 1 ? 'page' : 'pages'})`,
      );
      requestClose();
    } catch {
      onStatusMessage('Failed to generate 1:1 Spine Proof PDF.');
    } finally {
      setProofExporting(false);
    }
  };

  const handleDownloadCoversPdf = async () => {
    if (coversExporting) return;
    setCoversExporting(true);
    setCoversProgress('Loading linked books…');
    try {
      const existingStudios = new Map<ProjectId, CoverStudioState>();
      const linkedIds = series.books
        .map((b) => b.linkedProjectId)
        .filter((id): id is ProjectId => id !== null);
      if (linkedIds.length > 0) {
        const repo = await getProjectRepository();
        for (const id of linkedIds) {
          const rec = await repo.getProject(id);
          if (rec) {
            existingStudios.set(id, rec.project.studio);
          }
        }
      }

      const res = await generateSeriesCoversPdf(series, customFont, existingStudios, {
        dpi: coversDpi,
        includeScaleBar: coversScaleBar,
        onProgress: (done, total, title) => {
          setCoversProgress(
            done < total ? `Rendering ${done + 1}/${total}: ${title}…` : 'Merging cover set PDF…',
          );
        },
      });
      triggerBytesDownload(res.bytes, res.fileName, 'application/pdf');
      onStatusMessage(
        `Exported ${res.fileName} (${res.bookCount} covers, ${res.pageCount} pages)`,
      );
      requestClose();
    } catch {
      onStatusMessage('Failed to generate Full Cover Set PDF.');
    } finally {
      setCoversProgress(null);
      setCoversExporting(false);
    }
  };

  const activeTabId =
    activeTab === 'cricut' ? cricutTabId : activeTab === 'proof' ? proofTabId : coversTabId;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="series-export-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
      className="bindery-modal m-auto max-h-[90vh] w-[min(95vw,820px)] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl"
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2
                id={titleId}
                className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-foreground"
              >
                <Download className="h-4 w-4 text-brass" aria-hidden="true" />
                Export Series Spines
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Export all {series.books.length} spines as a single HTV cut gang sheet, 1:1 proof
                lineup, or complete cover wrap set.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close Export Series dialog"
              data-testid="series-export-close-btn"
              onClick={requestClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* 3-Tab Export Mode Switcher */}
          <div
            role="tablist"
            aria-label="Series export formats"
            onKeyDown={handleTabKeyDown}
            {...({ focusgroup: 'tablist nomemory' } as Record<string, string>)}
            className="flex flex-nowrap gap-1.5 border-b border-border bg-secondary/45 px-5 py-2"
          >
            <button
              ref={cricutTabRef}
              type="button"
              role="tab"
              id={cricutTabId}
              aria-selected={activeTab === 'cricut'}
              tabIndex={activeTab === 'cricut' ? 0 : -1}
              data-testid="series-export-tab-cricut"
              onClick={() => setActiveTab('cricut')}
              {...(activeTab === 'cricut' ? { focusgroupstart: '' } : {})}
              className="cricut-mode-tab"
            >
              <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Cricut / HTV Gang SVG</span>
            </button>
            <button
              ref={proofTabRef}
              type="button"
              role="tab"
              id={proofTabId}
              aria-selected={activeTab === 'proof'}
              tabIndex={activeTab === 'proof' ? 0 : -1}
              data-testid="series-export-tab-proof"
              onClick={() => setActiveTab('proof')}
              {...(activeTab === 'proof' ? { focusgroupstart: '' } : {})}
              className="cricut-mode-tab"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>1:1 Spine Proof PDF</span>
            </button>
            <button
              ref={coversTabRef}
              type="button"
              role="tab"
              id={coversTabId}
              aria-selected={activeTab === 'covers'}
              tabIndex={activeTab === 'covers' ? 0 : -1}
              data-testid="series-export-tab-covers"
              onClick={() => setActiveTab('covers')}
              {...(activeTab === 'covers' ? { focusgroupstart: '' } : {})}
              className="cricut-mode-tab"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Full Cover Set PDF</span>
            </button>
          </div>

          {/* Active Export Tab Panel */}
          <div
            role="tabpanel"
            aria-labelledby={activeTabId}
            className="flex-1 overflow-y-auto p-5"
            style={{ scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}
          >
            {activeTab === 'cricut' && (
              <div className="grid gap-5 md:grid-cols-[1.15fr_1fr]">
                {/* Always-light Cricut Mat Preview */}
                <div className="flex flex-col gap-3">
                  <div
                    data-testid="series-cricut-preview-mat"
                    className="cricut-mat-surface relative flex h-72 items-center justify-center rounded-lg border border-border p-4 shadow-inner"
                  >
                    {previewDataUri ? (
                      <img
                        src={previewDataUri}
                        alt="Live Cricut HTV series gang-sheet vector preview"
                        data-testid="series-cricut-preview-img"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-slate-600">
                        {cricutGenerating ? 'Outlining series font paths…' : 'Preparing preview…'}
                      </span>
                    )}
                    {cricutOptions.mirrorForHtv && (
                      <Badge
                        variant="warning"
                        className="pointer-events-none absolute top-2.5 right-2.5 rounded-full text-[10px]"
                      >
                        <FlipHorizontal2 className="h-3 w-3" aria-hidden="true" />
                        Mirrored
                      </Badge>
                    )}
                  </div>

                  {cricutPreview && (
                    <div className="space-y-2 rounded-lg border border-border bg-secondary/35 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-foreground">
                          {UnitConverter.formatDimensions(
                            cricutPreview.widthMm,
                            cricutPreview.heightMm,
                            unit,
                          )}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {cricutPreview.spineCount} spines • {cricutPreview.pathCount} paths • 0
                          &lt;text&gt;
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5" data-testid="series-cricut-mat-badges">
                        <Badge
                          variant={cricutPreview.matFit.joy ? 'success' : 'outline'}
                          className="rounded-full text-[10px]"
                        >
                          {cricutPreview.matFit.joy && (
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          Cricut Joy
                        </Badge>
                        <Badge
                          variant={cricutPreview.matFit.mat12x12 ? 'success' : 'outline'}
                          className="rounded-full text-[10px]"
                        >
                          {cricutPreview.matFit.mat12x12 && (
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          12×12&quot; Mat
                        </Badge>
                        <Badge
                          variant={cricutPreview.matFit.mat12x24 ? 'success' : 'warning'}
                          className="rounded-full text-[10px]"
                        >
                          {cricutPreview.matFit.mat12x24 && (
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          12×24&quot; Mat
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cricut Gang-Sheet Options */}
                <div className="flex flex-col justify-between gap-4">
                  <div className="space-y-3.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="series-cricut-gap-slider">Gap Between Spines</Label>
                        <span className="font-mono text-xs text-muted-foreground">
                          {cricutOptions.gapMm} mm
                        </span>
                      </div>
                      <Slider
                        id="series-cricut-gap-slider"
                        min={0}
                        max={20}
                        step={1}
                        value={[cricutOptions.gapMm]}
                        onValueChange={([v]) =>
                          setCricutOptions((prev) => ({ ...prev, gapMm: v }))
                        }
                      />
                    </div>

                    <div className="kettle-stitch-divider space-y-3 pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="series-cricut-mirror">Mirror for Iron-On HTV</Label>
                        <Switch
                          id="series-cricut-mirror"
                          data-testid="series-cricut-mirror-switch"
                          checked={cricutOptions.mirrorForHtv}
                          onCheckedChange={(v) =>
                            setCricutOptions((prev) => ({ ...prev, mirrorForHtv: v }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="series-cricut-weed">Weeding Box (+4 mm)</Label>
                        <Switch
                          id="series-cricut-weed"
                          checked={cricutOptions.includeWeedingBox}
                          onCheckedChange={(v) =>
                            setCricutOptions((prev) => ({ ...prev, includeWeedingBox: v }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="series-cricut-reg">Corner Alignment Marks</Label>
                        <Switch
                          id="series-cricut-reg"
                          checked={cricutOptions.includeRegistrationMarks}
                          onCheckedChange={(v) =>
                            setCricutOptions((prev) => ({
                              ...prev,
                              includeRegistrationMarks: v,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="series-cricut-bands">Include Spine Bands</Label>
                        <Switch
                          id="series-cricut-bands"
                          checked={cricutOptions.includeBands}
                          onCheckedChange={(v) =>
                            setCricutOptions((prev) => ({ ...prev, includeBands: v }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="series-cricut-color">Group Layers by Foil Color</Label>
                        <Switch
                          id="series-cricut-color"
                          checked={cricutOptions.groupByColor}
                          onCheckedChange={(v) =>
                            setCricutOptions((prev) => ({ ...prev, groupByColor: v }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    autoFocus
                    disabled={!cricutPreview || cricutGenerating}
                    data-testid="series-download-cricut-btn"
                    onClick={handleDownloadCricutSvg}
                    className="w-full"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download Gang-Sheet SVG
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'proof' && (
              <div className="mx-auto max-w-lg space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Prints all spines side-by-side at physical millimeter scale with cut boundaries,
                  width/height callouts, panoramic slices, and alignment baseline ticks so you can
                  hold the proof directly against your book blocks before cutting cloth or foil.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="series-proof-paper-select">Paper Size</Label>
                  <select
                    id="series-proof-paper-select"
                    data-testid="series-proof-paper-select"
                    value={proofPaperSize}
                    onChange={(e) => setProofPaperSize(e.target.value as SeriesProofPaperSize)}
                    className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground"
                  >
                    <option value="custom-fit">Auto Exact Fit (Single Sheet)</option>
                    {PRIMARY_SHEET_MEDIA_IDS.map((sheetId) => {
                      const spec = getPageSizeSpec(sheetId);
                      return (
                        <option key={sheetId} value={sheetId}>
                          {spec.label}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-3 rounded-lg border border-border bg-secondary/25 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="series-proof-scalebar">50 mm Scale Check Ruler</Label>
                    <Switch
                      id="series-proof-scalebar"
                      checked={proofIncludeScaleBar}
                      onCheckedChange={setProofIncludeScaleBar}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="series-proof-guides">Margin Alignment Ticks</Label>
                    <Switch
                      id="series-proof-guides"
                      checked={proofIncludeGuides}
                      onCheckedChange={setProofIncludeGuides}
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="default"
                  disabled={proofExporting}
                  data-testid="series-download-proof-btn"
                  onClick={() => void handleDownloadProofPdf()}
                  className="w-full"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {proofExporting ? 'Generating Spine Proof PDF…' : 'Download 1:1 Spine Proof PDF'}
                </Button>
              </div>
            )}

            {activeTab === 'covers' && (
              <div className="mx-auto max-w-lg space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Compiles every volume into a complete print-ready outer cover wrap PDF and merges
                  all pages into a single download. Linked books keep their front &amp; back covers
                  intact while applying the coordinated series spine.
                </p>

                <ul className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                  {series.books.map((book, idx) => (
                    <li
                      key={book.id}
                      className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 last:border-b-0 last:pb-0"
                    >
                      <span className="truncate font-medium text-foreground">
                        {idx + 1}. {book.title || 'Untitled Volume'}
                      </span>
                      <Badge
                        variant={book.linkedProjectId ? 'brass' : 'outline'}
                        className="shrink-0 text-[10px]"
                      >
                        {book.linkedProjectId ? 'Preserves Front/Back' : 'Coordinated Wrap'}
                      </Badge>
                    </li>
                  ))}
                </ul>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="series-covers-dpi">Artwork Resolution</Label>
                    <select
                      id="series-covers-dpi"
                      value={coversDpi}
                      onChange={(e) => setCoversDpi(Number(e.target.value) === 600 ? 600 : 300)}
                      className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground"
                    >
                      <option value={300}>300 DPI (Standard Print)</option>
                      <option value={600}>600 DPI (Fine Detail)</option>
                    </select>
                  </div>
                  <div className="flex items-end justify-between rounded-md border border-border bg-secondary/25 px-3 py-2">
                    <Label htmlFor="series-covers-scalebar" className="text-xs">
                      50 mm Ruler
                    </Label>
                    <Switch
                      id="series-covers-scalebar"
                      checked={coversScaleBar}
                      onCheckedChange={setCoversScaleBar}
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="default"
                  disabled={coversExporting}
                  data-testid="series-download-covers-btn"
                  onClick={() => void handleDownloadCoversPdf()}
                  className="w-full"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {coversProgress ?? `Download Full Cover Set (${series.books.length} Books)`}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
