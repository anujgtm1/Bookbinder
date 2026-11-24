import { Copy, FileCode2, FileImage, FileText, Printer, Redo2, Scissors, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, type UnitSystem } from '@/types/units';
import type { StudioCanvasSpec } from './renderEngine';

export interface CoverWorkbenchHeaderProps {
  readonly geometry: CaseGeometry;
  readonly spec: StudioCanvasSpec;
  readonly unit: UnitSystem;
  readonly exportingKind: 'pdf' | 'png' | 'svg' | null;
  readonly exportingOuterPdf: boolean;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly canDuplicate?: boolean;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  readonly onDuplicate?: () => void;
  readonly onOpenMeasureAndCut?: () => void;
  readonly onExportPrintPdf: () => void;
  readonly onExportAffinityPng: () => void;
  readonly onExportAffinitySvg: () => void;
  readonly onOpenCricutDialog: () => void;
  readonly onDownloadOuterSvg?: () => void;
  readonly onDownloadOuterPdf?: () => void;
}

export function CoverWorkbenchHeader({
  geometry,
  spec,
  unit,
  exportingKind,
  exportingOuterPdf,
  canUndo = false,
  canRedo = false,
  canDuplicate = false,
  onUndo,
  onRedo,
  onDuplicate,
  onOpenMeasureAndCut,
  onExportPrintPdf,
  onExportAffinityPng,
  onExportAffinitySvg,
  onOpenCricutDialog,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
}: CoverWorkbenchHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-base font-semibold tracking-tight text-foreground">
            Outer Case Wrap &amp; Cover Styler
          </h2>
          <button
            type="button"
            data-testid="studio-roll-badge"
            data-fit-status={geometry.mediaFit.status}
            onClick={onOpenMeasureAndCut}
            disabled={!onOpenMeasureAndCut}
            title="Open Measure & Cut tab for full chipboard cut list and cutting blueprint"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              geometry.mediaFit.mediaId === 'exact-auto'
                ? geometry.rollRecommendation.fits
                  ? 'border-emerald-700/30 bg-emerald-600/12 text-emerald-900 hover:bg-emerald-600/20 dark:text-emerald-300'
                  : 'border-amber-700/35 bg-amber-500/14 text-amber-900 hover:bg-amber-500/24 dark:text-amber-300'
                : geometry.mediaFit.status === 'does-not-fit'
                  ? 'border-destructive/40 bg-destructive/12 text-destructive hover:bg-destructive/20'
                  : geometry.mediaFit.status === 'fits-2-sheet-tile'
                    ? 'border-amber-700/35 bg-amber-500/14 text-amber-900 hover:bg-amber-500/24 dark:text-amber-300'
                    : 'border-emerald-700/30 bg-emerald-600/12 text-emerald-900 hover:bg-emerald-600/20 dark:text-emerald-300'
            } ${onOpenMeasureAndCut ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <Printer className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              {geometry.mediaFit.mediaId === 'exact-auto'
                ? geometry.rollRecommendation.summary
                : geometry.mediaFit.summary}
            </span>
            <span aria-hidden="true" className="opacity-55">
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
        <p className="mt-0.5 text-xs text-muted-foreground">
          Style artwork &amp; spine lettering, inspect the cutting blueprint, or orbit in 3D (
          {spec.pixelWidth} × {spec.pixelHeight} px @ 300 DPI).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Undo / Redo / Duplicate Edit Actions */}
        {(onUndo || onRedo || onDuplicate) && (
          <div
            role="group"
            aria-label="Edit history and duplicate actions"
            className="flex items-center gap-0.5 rounded-md border border-border bg-secondary/45 px-1 py-0.5"
          >
            {onUndo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo (Ctrl/Cmd+Z)"
                title="Undo (Ctrl/Cmd+Z)"
                data-testid="studio-undo-btn"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Undo</span>
              </Button>
            )}
            {onRedo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Redo (Ctrl/Cmd+Shift+Z)"
                title="Redo (Ctrl/Cmd+Shift+Z)"
                data-testid="studio-redo-btn"
              >
                <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Redo</span>
              </Button>
            )}
            {onDuplicate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onDuplicate}
                disabled={!canDuplicate}
                aria-label="Duplicate (Ctrl/Cmd+D)"
                title="Duplicate (Ctrl/Cmd+D)"
                data-testid="studio-duplicate-btn"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Duplicate</span>
              </Button>
            )}
          </div>
        )}

        {/* Styled Artwork Exports */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="default"
            size="sm"
            onClick={onExportPrintPdf}
            disabled={exportingKind !== null}
            data-testid="studio-export-pdf-btn"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {exportingKind === 'pdf' ? 'Rendering…' : 'Print PDF…'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExportAffinityPng}
            disabled={exportingKind !== null}
            data-testid="studio-export-png-btn"
          >
            <FileImage className="h-4 w-4" aria-hidden="true" />
            {exportingKind === 'png' ? 'Rendering…' : 'PNG'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportAffinitySvg}
            disabled={exportingKind !== null}
            data-testid="studio-export-svg-btn"
          >
            <FileCode2 className="h-4 w-4" aria-hidden="true" />
            Affinity SVG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCricutDialog}
            data-testid="studio-open-cricut-btn"
            title="Export outlined vector SVG for Cricut Design Space, Silhouette Studio, or Brother ScanNCut"
          >
            <Scissors className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            Cricut / HTV SVG
          </Button>
        </div>

        {/* Unstyled Structural Cut Templates */}
        {(onDownloadOuterSvg || onDownloadOuterPdf) && (
          <div
            className="flex items-center gap-1 rounded-md border border-border bg-secondary/45 px-2 py-1"
            aria-label="Structural cut-only outer wrap downloads"
          >
            <span className="pr-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Cut-Only
            </span>
            {onDownloadOuterSvg && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onDownloadOuterSvg}
                aria-label="Download Outer Case Wrap as SVG"
                data-testid="download-outer-svg-btn"
              >
                SVG
              </Button>
            )}
            {onDownloadOuterPdf && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onDownloadOuterPdf}
                disabled={exportingOuterPdf}
                aria-label="Open Outer Case Wrap Cut PDF export dialog"
                data-testid="download-outer-pdf-btn"
              >
                {exportingOuterPdf ? '…' : 'PDF…'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
