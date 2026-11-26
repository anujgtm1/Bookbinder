import {
  ChevronDown,
  Copy,
  Dices,
  FileCode2,
  FileImage,
  FileText,
  Printer,
  Redo2,
  Scissors,
  Undo2,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { UiDensity } from '@/core/uiDensity';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, type UnitSystem } from '@/types/units';
import type { StudioCanvasSpec } from './renderEngine';

export interface CoverWorkbenchHeaderProps {
  readonly geometry: CaseGeometry;
  readonly spec: StudioCanvasSpec;
  readonly unit: UnitSystem;
  readonly uiDensity?: UiDensity;
  readonly exportingKind: 'pdf' | 'png' | 'svg' | null;
  readonly exportingOuterPdf: boolean;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly canDuplicate?: boolean;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  readonly onDuplicate?: () => void;
  readonly onShuffleDesign?: () => void;
  readonly onOpenMeasureAndCut?: () => void;
  readonly onExportPrintPdf: () => void;
  readonly onExportAffinityPng: () => void;
  readonly onExportAffinitySvg: () => void;
  readonly onOpenCricutDialog: () => void;
  readonly onDownloadOuterSvg?: () => void;
  readonly onDownloadOuterPdf?: () => void;
}

function supportsNativePopoverApi(): boolean {
  return typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
}

export function CoverWorkbenchHeader({
  geometry,
  spec,
  unit,
  uiDensity = 'clean',
  exportingKind,
  exportingOuterPdf,
  canUndo = false,
  canRedo = false,
  canDuplicate = false,
  onUndo,
  onRedo,
  onDuplicate,
  onShuffleDesign,
  onOpenMeasureAndCut,
  onExportPrintPdf,
  onExportAffinityPng,
  onExportAffinitySvg,
  onOpenCricutDialog,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
}: CoverWorkbenchHeaderProps) {
  const morePopoverId = useId();
  const hasNativePopover = supportsNativePopoverApi();
  const [fallbackMoreOpen, setFallbackMoreOpen] = useState(false);
  const moreContainerRef = useRef<HTMLDivElement>(null);
  const morePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasNativePopover || !fallbackMoreOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFallbackMoreOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (moreContainerRef.current && !moreContainerRef.current.contains(e.target as Node)) {
        setFallbackMoreOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [hasNativePopover, fallbackMoreOpen]);

  const closeMorePopover = () => {
    if (hasNativePopover) {
      const el = morePopoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
      try {
        el?.hidePopover?.();
      } catch {
        // Ignore if already closed
      }
    } else {
      setFallbackMoreOpen(false);
    }
  };

  return (
    <div className="washi-sheet flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-border border-t-2 border-t-brass/80 px-3.5 py-2.5">
      {/* Left Zone: Cover Title, Roll-Fit Stamp & Compact History Controls */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-base font-semibold leading-tight tracking-tight text-foreground">
              Cover Studio
            </h2>
            <button
              type="button"
              data-testid="studio-roll-badge"
              data-fit-status={geometry.mediaFit.status}
              onClick={onOpenMeasureAndCut}
              disabled={!onOpenMeasureAndCut}
              title="Open Measure & Cut tab for full chipboard cut list and cutting blueprint"
              className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[11px] font-medium motion-safe:transition-colors ${
                geometry.mediaFit.mediaId === 'exact-auto'
                  ? geometry.rollRecommendation.fits
                    ? 'status-success-surface hover:brightness-95'
                    : 'status-warning-surface hover:brightness-95'
                  : geometry.mediaFit.status === 'does-not-fit'
                    ? 'status-danger-surface hover:brightness-95'
                    : geometry.mediaFit.status === 'fits-2-sheet-tile'
                      ? 'status-warning-surface hover:brightness-95'
                      : 'status-success-surface hover:brightness-95'
              } ${onOpenMeasureAndCut ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <Printer className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {geometry.mediaFit.mediaId === 'exact-auto'
                  ? geometry.rollRecommendation.summary
                  : geometry.mediaFit.summary}
              </span>
              <span aria-hidden="true" className="opacity-50">
                ·
              </span>
              <span className="font-mono">
                {UnitConverter.formatDimensions(
                  geometry.outerWrap.widthMm,
                  geometry.outerWrap.heightMm,
                  unit,
                )}
              </span>
            </button>
          </div>
          <p className="mt-0.5 hidden font-mono text-[10.5px] text-muted-foreground sm:block">
            {spec.pixelWidth} × {spec.pixelHeight} px @ 300 DPI · Drop artwork or style in the right
            inspector
          </p>
        </div>

        {(onUndo || onRedo || onDuplicate) && (
          <div
            role="group"
            aria-label="Edit history and duplicate actions"
            className="inline-flex items-center divide-x divide-border/70 rounded-[3px] border border-border bg-secondary/50"
          >
            {onUndo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo (Ctrl/Cmd+Z)"
                title="Undo (Ctrl/Cmd+Z)"
                data-testid="studio-undo-btn"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Undo</span>
              </Button>
            )}
            {onRedo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Redo (Ctrl/Cmd+Shift+Z)"
                title="Redo (Ctrl/Cmd+Shift+Z)"
                data-testid="studio-redo-btn"
              >
                <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Redo</span>
              </Button>
            )}
            {onDuplicate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={onDuplicate}
                disabled={!canDuplicate}
                aria-label="Duplicate (Ctrl/Cmd+D)"
                title="Duplicate (Ctrl/Cmd+D)"
                data-testid="studio-duplicate-btn"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Duplicate</span>
              </Button>
            )}
          </div>
        )}

        {onShuffleDesign && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-brass/70 bg-brass/10 px-2.5 text-xs text-foreground hover:border-brass hover:bg-brass/20"
            onClick={onShuffleDesign}
            title="Design Muse: generate a fresh cover & spine pairing in 1 click (keeps your current text; Undo anytime)"
            data-testid="studio-shuffle-design-btn"
          >
            <Dices className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            Shuffle Design
          </Button>
        )}
      </div>

      {/* Right Zone: Calm Primary Print CTA + Craft Cricut CTA + Density-Aware Secondary Exports */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="default"
          size="sm"
          className="h-8 px-3 font-medium"
          onClick={onExportPrintPdf}
          disabled={exportingKind !== null}
          data-testid="studio-export-pdf-btn"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {exportingKind === 'pdf' ? 'Rendering…' : 'Print PDF…'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 border-brass/70 bg-brass/10 px-2.5 text-foreground hover:border-brass hover:bg-brass/20"
          onClick={onOpenCricutDialog}
          data-testid="studio-open-cricut-btn"
          title="Export outlined vector SVG for Cricut Design Space, Silhouette Studio, or Brother ScanNCut"
        >
          <Scissors className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
          Cricut / HTV SVG
        </Button>

        {uiDensity === 'all' ? (
          /* Bordered Utility Strip: PNG, Affinity SVG, and Structural Cut-Only */
          <div
            className="inline-flex flex-wrap items-center divide-x divide-border/80 rounded-[3px] border border-border bg-secondary/45"
            aria-label="Additional artwork and cut exports"
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 text-[11px]"
              onClick={onExportAffinityPng}
              disabled={exportingKind !== null}
              data-testid="studio-export-png-btn"
            >
              <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
              {exportingKind === 'png' ? '…' : 'PNG'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 text-[11px]"
              onClick={onExportAffinitySvg}
              disabled={exportingKind !== null}
              data-testid="studio-export-svg-btn"
            >
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              Affinity SVG
            </Button>
            {onDownloadOuterSvg && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-none px-2 text-[11px]"
                onClick={onDownloadOuterSvg}
                aria-label="Download Outer Case Wrap as SVG"
                data-testid="download-outer-svg-btn"
              >
                Cut SVG
              </Button>
            )}
            {onDownloadOuterPdf && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-none px-2 text-[11px]"
                onClick={onDownloadOuterPdf}
                disabled={exportingOuterPdf}
                aria-label="Open Outer Case Wrap Cut PDF export dialog"
                data-testid="download-outer-pdf-btn"
              >
                {exportingOuterPdf ? '…' : 'Cut PDF…'}
              </Button>
            )}
          </div>
        ) : (
          /* Clean Mode: Native Popover Overflow for Secondary Exports */
          <div ref={moreContainerRef} className="relative inline-flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              popoverTarget={hasNativePopover ? morePopoverId : undefined}
              onClick={hasNativePopover ? undefined : () => setFallbackMoreOpen((open) => !open)}
              data-testid="studio-more-exports-btn"
              aria-label="More cover and cut export formats"
            >
              <span>More</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>

            <div
              ref={morePopoverRef}
              id={morePopoverId}
              popover={hasNativePopover ? 'auto' : undefined}
              hidden={!hasNativePopover && !fallbackMoreOpen}
              data-testid="studio-more-exports-popover"
              className={
                hasNativePopover
                  ? 'atelier-popover atelier-popover--end min-w-44'
                  : `atelier-popover-fallback atelier-popover-fallback--end min-w-44 ${fallbackMoreOpen ? ':popover-open' : ''}`
              }
            >
              <div className="flex flex-col gap-0.5 p-1.5">
                <button
                  type="button"
                  disabled={exportingKind !== null}
                  data-testid="studio-export-png-btn"
                  onClick={() => {
                    closeMorePopover();
                    onExportAffinityPng();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-left text-xs text-foreground motion-safe:transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <FileImage className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>{exportingKind === 'png' ? 'Rendering PNG…' : '300 DPI PNG'}</span>
                </button>
                <button
                  type="button"
                  disabled={exportingKind !== null}
                  data-testid="studio-export-svg-btn"
                  onClick={() => {
                    closeMorePopover();
                    onExportAffinitySvg();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-left text-xs text-foreground motion-safe:transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Affinity SVG</span>
                </button>
                {(onDownloadOuterSvg || onDownloadOuterPdf) && (
                  <div className="my-1 border-t border-border/80" role="separator" />
                )}
                {onDownloadOuterSvg && (
                  <button
                    type="button"
                    data-testid="download-outer-svg-btn"
                    aria-label="Download Outer Case Wrap as SVG"
                    onClick={() => {
                      closeMorePopover();
                      onDownloadOuterSvg();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-left text-xs text-foreground motion-safe:transition-colors hover:bg-accent"
                  >
                    <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Cut SVG</span>
                  </button>
                )}
                {onDownloadOuterPdf && (
                  <button
                    type="button"
                    disabled={exportingOuterPdf}
                    data-testid="download-outer-pdf-btn"
                    aria-label="Open Outer Case Wrap Cut PDF export dialog"
                    onClick={() => {
                      closeMorePopover();
                      onDownloadOuterPdf();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-left text-xs text-foreground motion-safe:transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>{exportingOuterPdf ? 'Rendering Cut PDF…' : 'Cut PDF…'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
