import {
  CheckCircle2,
  Download,
  FlipHorizontal2,
  Image as ImageIcon,
  Printer,
  Scissors,
  X,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { triggerBlobDownload, triggerTextDownload } from '@/core/storage';
import { getPageSizeSpec } from '@/resources/paperSpecs';
import type { PageSizeId } from '@/types/bookParams';
import type { CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { UnitConverter, type UnitSystem } from '@/types/units';
import {
  DEFAULT_CRICUT_EXPORT_OPTIONS,
  detectCricutScopePresence,
  generateCricutHtvSvg,
  type CricutCanvasScope,
  type CricutExportOptions,
  type CricutExportResult,
} from './cricutExport';
import {
  CRICUT_PTC_SHEET_BOUNDS_MM,
  DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
  evaluatePrintThenCutBounds,
  exportCricutPrintThenCutPng,
  hasPrintThenCutContent,
  renderCricutPrintThenCutCanvas,
  resolvePrintThenCutCropRect,
  type CricutPrintThenCutOptions,
} from './cricutPrintThenCut';
import type { CustomFontAsset } from './fonts';

export type CricutExportMode = 'basic-cut' | 'print-then-cut';

export interface CricutExportDialogProps {
  readonly open: boolean;
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly unit: UnitSystem;
  readonly onOpenChange: (open: boolean) => void;
  readonly onStatusMessage: (message: string) => void;
  readonly onOpenBasePdfForHtv?: () => void;
}

const PTC_SHEET_IDS: readonly PageSizeId[] = ['letter', 'a4', 'legal', 'tabloid'];

/**
 * Native modal <dialog closedby="any"> for Cricut Design Space / Silhouette Studio / ScanNCut:
 * - Basic Cut (.SVG): Flattened 1:1 mm vector HTV & foil curves (zero <text>, <image>, or transform=)
 * - Print Then Cut (.PNG): Transparent 300 DPI printable HTV with embedded pHYs DPI & sheet bounds check
 */
export function CricutExportDialog({
  open,
  geometry,
  studio,
  customFont,
  unit,
  onOpenChange,
  onStatusMessage,
  onOpenBasePdfForHtv,
}: CricutExportDialogProps) {
  const titleId = useId();
  const basicCutTabId = useId();
  const ptcTabId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const basicCutTabRef = useRef<HTMLButtonElement>(null);
  const ptcTabRef = useRef<HTMLButtonElement>(null);

  const hasDedicatedSpineText =
    studio.spineText.title.trim().length > 0 || studio.spineText.author.trim().length > 0;
  const scopePresence = useMemo(
    () => detectCricutScopePresence(geometry, studio),
    [geometry, studio],
  );
  const { hasRasterArtwork, hasSvgArtwork } = scopePresence;

  const [mode, setMode] = useState<CricutExportMode>('basic-cut');
  const [options, setOptions] = useState<CricutExportOptions>(DEFAULT_CRICUT_EXPORT_OPTIONS);
  const [preview, setPreview] = useState<CricutExportResult | null>(null);
  const [generating, setGenerating] = useState(false);

  const [ptcOptions, setPtcOptions] = useState<CricutPrintThenCutOptions>(
    DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
  );
  const [ptcPreviewDataUrl, setPtcPreviewDataUrl] = useState<string | null>(null);
  const [ptcPreviewLoading, setPtcPreviewLoading] = useState(false);
  const [ptcExporting, setPtcExporting] = useState(false);

  // Sync open prop with native dialog.showModal() / dialog.close() and reset smart defaults on open
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setMode('basic-cut');
      const smartScope: CricutCanvasScope = hasDedicatedSpineText
        ? 'spine-only'
        : scopePresence.front
          ? 'front-cover'
          : scopePresence.back
            ? 'back-cover'
            : scopePresence.spine
              ? 'spine-only'
              : 'full-wrap';
      setOptions((prev) => ({
        ...prev,
        scope: smartScope,
        includeOuterCutOutline: smartScope === 'full-wrap',
      }));
      setPtcOptions(DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS);
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open, hasDedicatedSpineText, scopePresence.spine, scopePresence.front, scopePresence.back]);

  // Safari fallback for closedby="any" light dismiss (requires both press & release outside dialog rect)
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
        else onOpenChange(false);
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [onOpenChange]);

  // Re-generate live flattened vector preview whenever dialog is open in Basic Cut mode
  useEffect(() => {
    if (!open || mode !== 'basic-cut') return;
    let cancelled = false;
    setGenerating(true);

    void generateCricutHtvSvg(geometry, studio, customFont, options)
      .then((res) => {
        if (!cancelled) {
          setPreview(res);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, geometry, studio, customFont, options]);

  // Re-generate live transparent Print Then Cut PNG preview whenever dialog is open in PTC mode
  useEffect(() => {
    if (!open || mode !== 'print-then-cut') return;
    let cancelled = false;
    setPtcPreviewLoading(true);

    void renderCricutPrintThenCutCanvas(geometry, studio, customFont, ptcOptions, 96)
      .then(({ canvas }) => {
        if (!cancelled) {
          try {
            setPtcPreviewDataUrl(canvas.toDataURL('image/png'));
          } catch {
            setPtcPreviewDataUrl(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPtcPreviewDataUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPtcPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, geometry, studio, customFont, ptcOptions]);

  const previewDataUri = useMemo(() => {
    if (!preview) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`;
  }, [preview]);

  const ptcCropRect = useMemo(
    () => resolvePrintThenCutCropRect(geometry, studio, ptcOptions),
    [geometry, studio, ptcOptions],
  );

  const ptcBounds = useMemo(
    () =>
      evaluatePrintThenCutBounds(ptcCropRect.width, ptcCropRect.height, {
        dpi: ptcOptions.dpi ?? 300,
        studio,
        options: ptcOptions,
      }),
    [ptcCropRect.width, ptcCropRect.height, studio, ptcOptions],
  );

  const ptcHasContent = useMemo(
    () => hasPrintThenCutContent(geometry, studio, ptcOptions),
    [geometry, studio, ptcOptions],
  );

  const updateOption = <K extends keyof CricutExportOptions>(
    key: K,
    value: CricutExportOptions[K],
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const updatePtcOption = <K extends keyof CricutPrintThenCutOptions>(
    key: K,
    value: CricutPrintThenCutOptions[K],
  ) => {
    setPtcOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleScopeChange = (scope: CricutCanvasScope) => {
    setOptions((prev) => ({
      ...prev,
      scope,
      includeOuterCutOutline: scope === 'full-wrap',
    }));
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const nextMode: CricutExportMode =
      event.key === 'Home'
        ? 'basic-cut'
        : event.key === 'End'
          ? 'print-then-cut'
          : mode === 'basic-cut'
            ? 'print-then-cut'
            : 'basic-cut';
    setMode(nextMode);
    if (nextMode === 'basic-cut') {
      basicCutTabRef.current?.focus();
    } else {
      ptcTabRef.current?.focus();
    }
  };

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog?.removeAttribute('open');
      onOpenChange(false);
    }
  };

  const handleDownloadSvg = () => {
    if (!preview) return;
    triggerTextDownload(preview.svg, preview.fileName, 'image/svg+xml;charset=utf-8');
    onStatusMessage(
      `Exported ${preview.fileName} (${preview.widthMm} × ${preview.heightMm} mm, ${preview.pathCount} vector paths)`,
    );
    closeDialog();
  };

  const handleDownloadPtcPng = async () => {
    if (ptcExporting || !ptcHasContent) return;
    setPtcExporting(true);
    try {
      const { blob, summary } = await exportCricutPrintThenCutPng(
        geometry,
        studio,
        customFont,
        ptcOptions,
      );
      triggerBlobDownload(blob, summary.fileName);
      onStatusMessage(
        `Exported ${summary.fileName} (${summary.widthIn.toFixed(2)} × ${summary.heightIn.toFixed(2)}" / ${summary.widthMm} × ${summary.heightMm} mm @ ${ptcOptions.dpi ?? 300} DPI)`,
      );
      closeDialog();
    } catch (err) {
      onStatusMessage(
        err instanceof Error ? err.message : 'Failed to export Print Then Cut PNG.',
      );
    } finally {
      setPtcExporting(false);
    }
  };

  const emptyScopeHint = useMemo(() => {
    if (!scopePresence.any) {
      if (hasRasterArtwork) {
        return 'Basic Cut SVG cuts vector text, ornaments, and .svg artwork only. Switch to Print Then Cut (.PNG) for printable HTV, or use Export Printed Base PDF below.';
      }
      return 'Add Spine Typography, Front/Back Cover Text, a Classic Design ornament, or an .svg artwork file to export outlined HTV cut paths — or export the alignment & outer cut outline for bookcloth.';
    }
    if (!generating && preview && !preview.hasLettering) {
      if (
        !options.includeLettering &&
        !(options.includeOrnaments ?? true) &&
        !(options.includeSvgArtwork ?? true)
      ) {
        return 'Enable Cover & Spine Lettering, Classic Ornaments & Frames, or Uploaded SVG Artwork to include vector cut paths.';
      }
      const populatedPanels: string[] = [];
      if (scopePresence.front) populatedPanels.push('Front Cover');
      if (scopePresence.back) populatedPanels.push('Back Cover');
      if (scopePresence.spine) populatedPanels.push('Spine');
      if (populatedPanels.length > 0) {
        const rasterNote = hasRasterArtwork
          ? ' For raster artwork, switch to Print Then Cut (.PNG) or Export Printed Base PDF.'
          : '';
        return `No vector cut paths in this scope. Cuttable designs are on ${populatedPanels.join(', ')}.${rasterNote}`;
      }
      if (hasRasterArtwork) {
        return 'No vector cut paths in this scope. Switch to Print Then Cut (.PNG) or use Export Printed Base PDF below.';
      }
    }
    return null;
  }, [
    scopePresence,
    hasRasterArtwork,
    generating,
    preview,
    options.includeLettering,
    options.includeOrnaments,
    options.includeSvgArtwork,
  ]);

  const handleOpenBasePdfForHtv = () => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog?.removeAttribute('open');
    }
    onOpenChange(false);
    onOpenBasePdfForHtv?.();
  };

  const activeTabId = mode === 'basic-cut' ? basicCutTabId : ptcTabId;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="cricut-export-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onOpenChange(false);
      }}
      className="bindery-modal m-auto max-h-[90vh] w-[min(94vw,780px)] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2
            id={titleId}
            className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-foreground"
          >
            <Scissors className="h-4 w-4 text-brass" aria-hidden="true" />
            Cricut / Silhouette / ScanNCut Export
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === 'basic-cut' ? (
              <>
                Vector SVG with flattened cut paths (zero{' '}
                <code className="font-mono text-[11px]">&lt;text&gt;</code> tags or raster images).
              </>
            ) : (
              'Transparent 300 DPI PNG ready for Printable HTV / Siser EasyColor DTV kiss-cutting.'
            )}
          </p>
        </div>

        <form method="dialog">
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Close Cricut export dialog"
            data-testid="cricut-close-btn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>

      {/* Mode Switcher Tabs (modern-web-guidance tabs pattern) */}
      <div
        role="tablist"
        aria-label="Cricut export mode"
        onKeyDown={handleTabKeyDown}
        {...({ focusgroup: 'tablist nomemory' } as Record<string, string>)}
        className="flex flex-nowrap gap-1.5 border-b border-border bg-secondary/45 px-5 py-2"
      >
        <button
          ref={basicCutTabRef}
          type="button"
          role="tab"
          id={basicCutTabId}
          aria-selected={mode === 'basic-cut'}
          tabIndex={mode === 'basic-cut' ? 0 : -1}
          data-testid="cricut-mode-basic-cut"
          onClick={() => setMode('basic-cut')}
          {...(mode === 'basic-cut' ? { focusgroupstart: '' } : {})}
          className="cricut-mode-tab"
        >
          <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Basic Cut (.SVG)</span>
          <span className="hidden text-[11px] opacity-75 sm:inline">— Vector HTV / Foil</span>
        </button>

        <button
          ref={ptcTabRef}
          type="button"
          role="tab"
          id={ptcTabId}
          aria-selected={mode === 'print-then-cut'}
          tabIndex={mode === 'print-then-cut' ? 0 : -1}
          data-testid="cricut-mode-print-then-cut"
          onClick={() => setMode('print-then-cut')}
          {...(mode === 'print-then-cut' ? { focusgroupstart: '' } : {})}
          className="cricut-mode-tab"
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Print Then Cut (.PNG)</span>
          <span className="hidden text-[11px] opacity-75 sm:inline">— Printable HTV</span>
          {hasRasterArtwork && (
            <Badge
              variant="brass"
              data-testid="cricut-ptc-raster-badge"
              className="ml-0.5 rounded-full px-1.5 py-0 text-[10px]"
            >
              Artwork
            </Badge>
          )}
        </button>
      </div>

      {/* Active Mode Tabpanel */}
      <div
        role="tabpanel"
        aria-labelledby={activeTabId}
        className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[1.1fr_1fr]"
      >
        {mode === 'basic-cut' ? (
          <>
            {/* Left: Live Vector Cut Mat Preview */}
            <div className="flex flex-col gap-3">
              <div
                data-testid="cricut-preview-mat"
                className="cricut-mat-surface relative flex h-72 items-center justify-center rounded-lg border border-border p-4 shadow-inner"
              >
                {previewDataUri ? (
                  <img
                    src={previewDataUri}
                    alt="Live Cricut HTV vector cut preview"
                    data-testid="cricut-svg-preview-img"
                    className="max-h-full max-w-full object-contain drop-shadow-xs"
                  />
                ) : (
                  <span className="text-xs text-slate-600">
                    {generating ? 'Outlining font paths…' : 'Preparing vector cut preview…'}
                  </span>
                )}
                {options.mirrorForHtv && (
                  <Badge
                    variant="warning"
                    className="pointer-events-none absolute top-2.5 right-2.5 rounded-full text-[10px]"
                  >
                    <FlipHorizontal2 className="h-3 w-3" aria-hidden="true" />
                    Mirrored
                  </Badge>
                )}
              </div>

              {/* Mat Compatibility & Hygiene Badges */}
              {preview && (
                <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-foreground">
                      {UnitConverter.formatDimensions(preview.widthMm, preview.heightMm, unit)}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {preview.pathCount} cut {preview.pathCount === 1 ? 'path' : 'paths'} • 0
                      &lt;text&gt;
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5" data-testid="cricut-mat-badges">
                    <Badge
                      variant={preview.fitsCricutJoy ? 'success' : 'outline'}
                      className="rounded-full text-[10px]"
                    >
                      {preview.fitsCricutJoy && (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      )}
                      Cricut Joy (4.5×12&quot;)
                    </Badge>
                    <Badge
                      variant={preview.fitsStandard12x12 ? 'success' : 'outline'}
                      className="rounded-full text-[10px]"
                    >
                      {preview.fitsStandard12x12 && (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      )}
                      12×12&quot; Mat
                    </Badge>
                    <Badge
                      variant={preview.fitsLarge12x24 ? 'success' : 'warning'}
                      className="rounded-full text-[10px]"
                    >
                      {preview.fitsLarge12x24 && (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      )}
                      12×24&quot; Mat
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-muted-foreground">
                    {options.groupByColor && preview.foilColors.length > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1">
                          {preview.foilColors.map((hex) => (
                            <span
                              key={hex}
                              className="inline-block h-2.5 w-2.5 rounded-full border border-border/80"
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                        </span>
                        Foil Mats ({preview.foilColors.length})
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#111111]" />
                        Lettering (HTV)
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#B48327]" />
                      Corner Alignment
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#1D5BD6]" />
                      Weeding Box
                    </span>
                    {options.scope === 'full-wrap' && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#D93829]" />
                        Outer Cut
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Basic Cut SVG Controls */}
            <div className="flex flex-col justify-between gap-4">
              <div className="space-y-3.5">
                {/* Scope Toggle */}
                <div className="space-y-1.5">
                  <Label>Cut Mat Scope</Label>
                  <div
                    className="grid grid-cols-2 gap-1.5"
                    role="group"
                    aria-label="Cricut canvas scope"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={options.scope === 'spine-only' ? 'default' : 'outline'}
                      aria-pressed={options.scope === 'spine-only'}
                      data-testid="cricut-scope-spine"
                      onClick={() => handleScopeChange('spine-only')}
                    >
                      Spine Strip Only
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={options.scope === 'front-cover' ? 'default' : 'outline'}
                      aria-pressed={options.scope === 'front-cover'}
                      data-testid="cricut-scope-front"
                      onClick={() => handleScopeChange('front-cover')}
                    >
                      Front Cover
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={options.scope === 'back-cover' ? 'default' : 'outline'}
                      aria-pressed={options.scope === 'back-cover'}
                      data-testid="cricut-scope-back"
                      onClick={() => handleScopeChange('back-cover')}
                    >
                      Back Cover
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={options.scope === 'full-wrap' ? 'default' : 'outline'}
                      aria-pressed={options.scope === 'full-wrap'}
                      data-testid="cricut-scope-fullwrap"
                      onClick={() => handleScopeChange('full-wrap')}
                    >
                      Full Cover Wrap
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {options.scope === 'spine-only'
                      ? 'Compact mat sized to your spine — saves HTV and fits Cricut Joy.'
                      : options.scope === 'front-cover'
                        ? 'Exact Front Cover board area with front title, author, frames & emblems.'
                        : options.scope === 'back-cover'
                          ? 'Exact Back Cover board area with back blurb, colophon & ornaments.'
                          : 'Full wrap alignment across Back, Spine, and Front boards.'}
                  </p>
                </div>

                {emptyScopeHint && (
                  <div
                    data-testid="cricut-empty-scope-hint"
                    className="status-warning-surface space-y-2 rounded-md border px-2.5 py-2 text-[11px] font-medium"
                  >
                    <p>{emptyScopeHint}</p>
                    {hasRasterArtwork && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="status-warning-btn h-7 px-2 text-[11px]"
                          data-testid="cricut-switch-to-ptc-btn"
                          onClick={() => setMode('print-then-cut')}
                        >
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          Switch to Print Then Cut (.PNG)
                        </Button>
                        {onOpenBasePdfForHtv && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="status-warning-btn h-7 px-2 text-[11px]"
                            onClick={handleOpenBasePdfForHtv}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            Export Printed Base PDF…
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="kettle-stitch-divider space-y-3 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-lettering-switch">Cover &amp; Spine Lettering</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Converts active font glyphs into compound cut curves.
                      </p>
                    </div>
                    <Switch
                      id="cricut-lettering-switch"
                      data-testid="cricut-lettering-switch"
                      checked={options.includeLettering}
                      onCheckedChange={(v) => updateOption('includeLettering', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ornaments-switch">Classic Ornaments &amp; Frames</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Includes borders, corner flourishes, dividers &amp; spine bands.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ornaments-switch"
                      data-testid="cricut-ornaments-switch"
                      checked={options.includeOrnaments ?? true}
                      onCheckedChange={(v) => updateOption('includeOrnaments', v)}
                    />
                  </div>

                  {hasSvgArtwork && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="cricut-svg-artwork-switch">Uploaded SVG Artwork</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Converts uploaded .svg artwork layers into cuttable vector paths.
                        </p>
                      </div>
                      <Switch
                        id="cricut-svg-artwork-switch"
                        data-testid="cricut-svg-artwork-switch"
                        checked={options.includeSvgArtwork ?? true}
                        onCheckedChange={(v) => updateOption('includeSvgArtwork', v)}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-weeding-switch">Weeding Box (+4 mm)</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Tight border around text for easier HTV weeding.
                      </p>
                    </div>
                    <Switch
                      id="cricut-weeding-switch"
                      data-testid="cricut-weeding-switch"
                      checked={options.includeWeedingBox}
                      onCheckedChange={(v) => updateOption('includeWeedingBox', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-reg-switch">Alignment Corner Marks</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Corner L-ticks to center vinyl on wrapped bookcloth.
                      </p>
                    </div>
                    <Switch
                      id="cricut-reg-switch"
                      data-testid="cricut-reg-switch"
                      checked={options.includeRegistrationMarks}
                      onCheckedChange={(v) => updateOption('includeRegistrationMarks', v)}
                    />
                  </div>

                  {options.scope === 'full-wrap' && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="cricut-outer-cut-switch">Outer Wrap Cut Polygon</Label>
                        <p className="text-[11px] text-muted-foreground">
                          45°-mitered perimeter for machine-cutting bookcloth/paper.
                        </p>
                      </div>
                      <Switch
                        id="cricut-outer-cut-switch"
                        data-testid="cricut-outer-cut-switch"
                        checked={options.includeOuterCutOutline}
                        onCheckedChange={(v) => updateOption('includeOuterCutOutline', v)}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Label htmlFor="cricut-group-by-color-switch">
                          Split Mats by Foil Color
                        </Label>
                        {preview && preview.foilColors.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1"
                            data-testid="cricut-foil-color-dots"
                          >
                            {preview.foilColors.map((hex) => (
                              <span
                                key={hex}
                                className="inline-block h-2.5 w-2.5 rounded-full border border-border/80 shadow-2xs"
                                style={{ backgroundColor: hex }}
                                title={hex}
                              />
                            ))}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {preview && preview.foilColors.length > 1
                          ? `${preview.foilColors.length} foil colors detected — Cricut splits mats automatically.`
                          : 'Uses design foil colors so Cricut splits mats automatically.'}
                      </p>
                    </div>
                    <Switch
                      id="cricut-group-by-color-switch"
                      data-testid="cricut-group-by-color-switch"
                      checked={Boolean(options.groupByColor)}
                      onCheckedChange={(v) => updateOption('groupByColor', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-2.5 py-2">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-mirror-switch">Mirror Horizontally (HTV)</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Leave Off if mirroring in Cricut Design Space&apos;s Make It screen.
                      </p>
                    </div>
                    <Switch
                      id="cricut-mirror-switch"
                      data-testid="cricut-mirror-switch"
                      checked={options.mirrorForHtv}
                      onCheckedChange={(v) => updateOption('mirrorForHtv', v)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                {(onOpenBasePdfForHtv || hasRasterArtwork) && (
                  <div className="space-y-2 rounded-md border border-brass/35 bg-brass/10 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-foreground">
                        Hybrid Printed Base + Printable HTV
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Print artwork base only (no text or ornaments) to press HTV cleanly, or
                        switch to Print Then Cut (.PNG) for printable iron-on transfers.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {hasRasterArtwork && !emptyScopeHint && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          data-testid="cricut-switch-to-ptc-btn"
                          onClick={() => setMode('print-then-cut')}
                        >
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          Switch to Print Then Cut (.PNG)
                        </Button>
                      )}
                      {onOpenBasePdfForHtv && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          data-testid="cricut-open-base-pdf-btn"
                          onClick={handleOpenBasePdfForHtv}
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                          Export Printed Base PDF…
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <form method="dialog">
                    <Button type="submit" variant="outline" size="sm">
                      Cancel
                    </Button>
                  </form>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    autoFocus
                    disabled={!preview || preview.pathCount === 0 || generating}
                    onClick={handleDownloadSvg}
                    data-testid="cricut-download-btn"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download Cricut SVG
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Left: Live Transparent Print Then Cut PNG Preview & Sheet Fit */}
            <div className="flex flex-col gap-3">
              <div
                data-testid="cricut-ptc-preview-mat"
                className="cricut-mat-surface cricut-alpha-checkerboard relative flex h-72 items-center justify-center rounded-lg border border-border p-4 shadow-inner"
              >
                {ptcPreviewDataUrl ? (
                  <img
                    src={ptcPreviewDataUrl}
                    alt="Live Cricut Print Then Cut transparent PNG preview"
                    data-testid="cricut-ptc-preview-img"
                    className="max-h-full max-w-full object-contain drop-shadow-xs"
                  />
                ) : (
                  <span className="rounded bg-card/85 px-2.5 py-1 text-xs text-foreground shadow-2xs">
                    {ptcPreviewLoading
                      ? 'Rendering transparent PNG preview…'
                      : `${ptcBounds.widthIn.toFixed(2)} × ${ptcBounds.heightIn.toFixed(2)}" transparent panel preview`}
                  </span>
                )}
                {ptcOptions.mirrorForHtv && (
                  <Badge
                    variant="warning"
                    className="pointer-events-none absolute top-2.5 right-2.5 rounded-full text-[10px]"
                  >
                    <FlipHorizontal2 className="h-3 w-3" aria-hidden="true" />
                    Mirrored
                  </Badge>
                )}
                {!ptcOptions.includeBaseFill && (
                  <Badge
                    variant="secondary"
                    className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full text-[10px]"
                  >
                    Transparent Alpha
                  </Badge>
                )}
              </div>

              {/* Exact Physical Dimensions & Print Then Cut Sheet Bounds */}
              <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                <div
                  className="flex flex-wrap items-baseline justify-between gap-2"
                  data-testid="cricut-ptc-dimensions"
                >
                  <span className="font-mono font-semibold text-foreground">
                    {ptcBounds.widthIn.toFixed(2)} × {ptcBounds.heightIn.toFixed(2)}&quot;{' '}
                    <span className="font-normal text-muted-foreground">
                      ({ptcBounds.widthMm.toFixed(1)} × {ptcBounds.heightMm.toFixed(1)} mm)
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {ptcBounds.pixelWidth} × {ptcBounds.pixelHeight} px @ {ptcOptions.dpi ?? 300}{' '}
                    DPI
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5" data-testid="cricut-ptc-sheet-badges">
                  {PTC_SHEET_IDS.map((sheetId) => {
                    const sheetSpec = getPageSizeSpec(sheetId);
                    const boundsInfo = CRICUT_PTC_SHEET_BOUNDS_MM[sheetId];
                    const fits =
                      sheetId === 'letter'
                        ? ptcBounds.fitsLetter
                        : sheetId === 'a4'
                          ? ptcBounds.fitsA4
                          : sheetId === 'legal'
                            ? ptcBounds.fitsLegal
                            : ptcBounds.fitsTabloid;
                    return (
                      <Badge
                        key={sheetId}
                        data-testid={`cricut-ptc-fit-${sheetId}`}
                        data-fits={fits ? 'true' : 'false'}
                        variant={fits ? 'success' : sheetId === 'tabloid' ? 'warning' : 'outline'}
                        className="rounded-full text-[10px]"
                      >
                        {fits && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                        {sheetSpec.shortLabel} ({boundsInfo.labelIn})
                      </Badge>
                    );
                  })}
                </div>

                <p className="pt-0.5 text-[11px] text-muted-foreground">
                  In Cricut Design Space, upload as <strong>Print Then Cut</strong> and set size to{' '}
                  <span className="font-mono font-medium text-foreground">
                    {ptcBounds.widthIn.toFixed(2)} × {ptcBounds.heightIn.toFixed(2)}&quot;
                  </span>{' '}
                  ({ptcBounds.widthMm.toFixed(1)} × {ptcBounds.heightMm.toFixed(1)} mm) for exact
                  transfer sizing.
                </p>
              </div>
            </div>

            {/* Right: Print Then Cut PNG Controls */}
            <div className="flex flex-col justify-between gap-4">
              <div className="space-y-3.5">
                {/* Panel Scope */}
                <div className="space-y-1.5">
                  <Label>Printable HTV Panel Scope</Label>
                  <div
                    className="grid grid-cols-2 gap-1.5"
                    role="group"
                    aria-label="Print Then Cut panel scope"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={ptcOptions.scope === 'front-cover' ? 'default' : 'outline'}
                      aria-pressed={ptcOptions.scope === 'front-cover'}
                      data-testid="cricut-ptc-scope-front"
                      onClick={() => updatePtcOption('scope', 'front-cover')}
                    >
                      Front Cover
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={ptcOptions.scope === 'back-cover' ? 'default' : 'outline'}
                      aria-pressed={ptcOptions.scope === 'back-cover'}
                      data-testid="cricut-ptc-scope-back"
                      onClick={() => updatePtcOption('scope', 'back-cover')}
                    >
                      Back Cover
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={ptcOptions.scope === 'spine-only' ? 'default' : 'outline'}
                      aria-pressed={ptcOptions.scope === 'spine-only'}
                      data-testid="cricut-ptc-scope-spine"
                      onClick={() => updatePtcOption('scope', 'spine-only')}
                    >
                      Spine Strip
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={ptcOptions.scope === 'full-wrap' ? 'default' : 'outline'}
                      aria-pressed={ptcOptions.scope === 'full-wrap'}
                      data-testid="cricut-ptc-scope-fullwrap"
                      onClick={() => updatePtcOption('scope', 'full-wrap')}
                    >
                      Full Cover Wrap
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Individual panels target the visible cover face — excluding turn-ins, flaps, and
                    glue tabs.
                  </p>
                </div>

                {!ptcBounds.fitsAnySheet && (
                  <p
                    data-testid="cricut-ptc-overflow-warning"
                    className="status-warning-surface rounded-md border px-2.5 py-2 text-[11px] font-medium"
                  >
                    Exceeds Cricut Print Then Cut max sheet bounds (Tabloid 9.25 × 15.25&quot;).
                    Export individual Front, Back, or Spine panels — or enable{' '}
                    <strong>Trim to Design Bounds</strong>.
                  </p>
                )}

                {!ptcHasContent && (
                  <p
                    data-testid="cricut-ptc-empty-hint"
                    className="status-warning-surface rounded-md border px-2.5 py-2 text-[11px] font-medium"
                  >
                    No artwork, lettering, or ornaments intersect this panel. Switch panels or turn
                    on <strong>Include Solid Base Fill</strong>.
                  </p>
                )}

                <div className="kettle-stitch-divider space-y-3 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ptc-artwork-switch">Uploaded Artwork</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Includes full-color PNG, JPG, WEBP, and SVG artwork layers.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ptc-artwork-switch"
                      data-testid="cricut-ptc-artwork-switch"
                      checked={ptcOptions.includeArtwork}
                      onCheckedChange={(v) => updatePtcOption('includeArtwork', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ptc-lettering-switch">
                        Cover &amp; Spine Lettering
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Renders cover titles, blurbs, and spine typography at 300 DPI.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ptc-lettering-switch"
                      data-testid="cricut-ptc-lettering-switch"
                      checked={ptcOptions.includeLettering}
                      onCheckedChange={(v) => updatePtcOption('includeLettering', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ptc-ornaments-switch">Classic Ornaments</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Includes frames, corner flourishes, emblems, and SVG stamps.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ptc-ornaments-switch"
                      data-testid="cricut-ptc-ornaments-switch"
                      checked={ptcOptions.includeOrnaments}
                      onCheckedChange={(v) => updatePtcOption('includeOrnaments', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ptc-trim-switch">Trim to Design Bounds</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Tight-crops around active artwork (+2 mm margin) to save printable HTV.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ptc-trim-switch"
                      data-testid="cricut-ptc-trim-switch"
                      checked={ptcOptions.trimToDesignBounds}
                      onCheckedChange={(v) => updatePtcOption('trimToDesignBounds', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ptc-base-fill-switch">Include Solid Base Fill</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Keep Off for transparent background so Cricut kiss-cuts around graphics.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ptc-base-fill-switch"
                      data-testid="cricut-ptc-base-fill-switch"
                      checked={ptcOptions.includeBaseFill}
                      onCheckedChange={(v) => updatePtcOption('includeBaseFill', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-2.5 py-2">
                    <div className="space-y-0.5">
                      <Label htmlFor="cricut-ptc-mirror-switch">Mirror Horizontally (HTV)</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Leave Off if printing light/dark printable HTV right-side up or mirroring in
                        Design Space.
                      </p>
                    </div>
                    <Switch
                      id="cricut-ptc-mirror-switch"
                      data-testid="cricut-ptc-mirror-switch"
                      checked={ptcOptions.mirrorForHtv}
                      onCheckedChange={(v) => updatePtcOption('mirrorForHtv', v)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <form method="dialog">
                  <Button type="submit" variant="outline" size="sm">
                    Cancel
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={ptcExporting || !ptcHasContent}
                  onClick={() => void handleDownloadPtcPng()}
                  data-testid="cricut-download-ptc-png-btn"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {ptcExporting ? 'Exporting PNG…' : 'Download 300 DPI PNG'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
