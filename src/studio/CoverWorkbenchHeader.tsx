import {
  Copy,
  FileCode2,
  FileImage,
  FileText,
  Printer,
  Redo2,
  Scissors,
  Undo2,
} from 'lucide-react';
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
                    ? 'border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)] hover:brightness-105'
                    : 'border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)] hover:brightness-105'
                  : geometry.mediaFit.status === 'does-not-fit'
                    ? 'border-destructive/45 bg-destructive/12 text-destructive hover:bg-destructive/20'
                    : geometry.mediaFit.status === 'fits-2-sheet-tile'
                      ? 'border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)] hover:brightness-105'
                      : 'border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)] hover:brightness-105'
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
      </div>

      {/* Right Zone: Calm Primary Print CTA + Craft Cricut CTA + Utility Strip */}
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

        {/* Bordered Utility Strip: PNG, Affinity SVG, and Structural Cut-Only */}
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
      </div>
    </div>
  );
}
