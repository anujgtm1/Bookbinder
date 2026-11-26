import {
  ClipboardList,
  FileCode2,
  FileImage,
  FileText,
  FolderOpen,
  Layers,
  Printer,
  Scissors,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  PdfExportDialog,
  type InnerPdfExportOptions,
  type OuterPdfExportOptions,
  type PdfExportSelection,
  type PdfExportTarget,
} from '@/components/PdfExportDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateBenchRecipePdf } from '@/core/benchRecipePdf';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import type { ProjectRepository } from '@/core/projectLibrary';
import { triggerBytesDownload } from '@/core/storage';
import { CricutExportDialog } from '@/studio/CricutExportDialog';
import {
  runStyledCoverPdfExport,
  runStyledCoverPngExport,
  runStyledCoverSvgExport,
} from '@/studio/exporters/coverExportRunner';
import type { CustomFontAsset } from '@/studio/fonts';
import { computeStudioCanvasSpec, type CoverPdfLayerMode } from '@/studio/renderEngine';
import type { BookParameters } from '@/types/bookParams';
import type { CaseGeometry } from '@/types/geometry';
import type { PdfGuideOptionsInput } from '@/types/pdfGuides';
import type { ProjectId, SavedProjectSummary } from '@/types/projectLibrary';
import type { CoverStudioState } from '@/types/studio';
import { PRINT_DPI, UnitConverter } from '@/types/units';

export interface MakeAndPrintPanelProps {
  readonly params: BookParameters;
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly savedBookSummaries: readonly SavedProjectSummary[];
  readonly activeProjectId: ProjectId | null;
  readonly activeBookName: string;
  readonly exportProgressLabel?: string | null;
  readonly exportingOuterPdf?: boolean;
  readonly exportingInnerPdf?: boolean;
  readonly onFlushActiveBook: () => Promise<void>;
  readonly getProjectRepository: () => Promise<ProjectRepository>;
  readonly onUpdateParams: (patch: Partial<BookParameters>) => void;
  readonly onUpdateStudio: (patch: Partial<CoverStudioState>) => void;
  readonly onDownloadOuterSvg: (options?: PdfGuideOptionsInput) => void;
  readonly onDownloadOuterPdf: (options?: OuterPdfExportOptions) => void | Promise<void>;
  readonly onDownloadInnerSvg: () => void;
  readonly onDownloadInnerPdf: (options?: InnerPdfExportOptions) => void | Promise<void>;
  readonly onStatusMessage: (message: string) => void;
}

export function MakeAndPrintPanel({
  params,
  geometry,
  studio,
  customFont,
  savedBookSummaries,
  activeProjectId,
  activeBookName,
  exportProgressLabel = null,
  exportingOuterPdf = false,
  exportingInnerPdf = false,
  onFlushActiveBook,
  getProjectRepository,
  onUpdateParams,
  onUpdateStudio,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
  onDownloadInnerSvg,
  onDownloadInnerPdf,
  onStatusMessage,
}: MakeAndPrintPanelProps) {
  const [pdfDialogTarget, setPdfDialogTarget] = useState<PdfExportTarget | null>(null);
  const [pdfLayerModeDefault, setPdfLayerModeDefault] = useState<CoverPdfLayerMode>('full');
  const [cricutDialogOpen, setCricutDialogOpen] = useState(false);
  const [exportingKind, setExportingKind] = useState<'pdf' | 'png' | 'svg' | 'bench' | null>(null);
  const [localProgressLabel, setLocalProgressLabel] = useState<string | null>(null);

  const strategy = resolveBindingStrategy(params);
  const usesInnerPockets = strategy.capabilities.usesInnerPockets;
  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);

  const mediaFitToneClass =
    geometry.mediaFit.mediaId === 'exact-auto'
      ? geometry.rollRecommendation.fits
        ? 'status-success-surface'
        : 'status-warning-surface'
      : geometry.mediaFit.status === 'does-not-fit'
        ? 'status-danger-surface'
        : geometry.mediaFit.status === 'fits-2-sheet-tile'
          ? 'status-warning-surface'
          : 'status-success-surface';

  const mediaFitSummary =
    geometry.mediaFit.mediaId === 'exact-auto'
      ? geometry.rollRecommendation.summary
      : geometry.mediaFit.summary;

  const handleConfirmPdfExport = async (selection: PdfExportSelection) => {
    if (selection.target === 'inner-blueprint' || selection.target === 'inner-styled') {
      await onDownloadInnerPdf({
        pageSizeId: selection.pageSizeId,
        includeLegend: selection.includeLegend,
        includeCutLines: selection.includeCutLines,
        includeFoldLines: selection.includeFoldLines,
        includeFoldGuideTicks: selection.includeFoldGuideTicks,
      });
      return;
    }

    if (
      selection.target === 'outer-blueprint' ||
      (selection.target === 'cover-styled' && selection.splitMode === 'three-piece')
    ) {
      await onDownloadOuterPdf({
        splitMode: selection.splitMode,
        printMediaId: selection.printMediaId,
        tileOverlapMm: selection.tileOverlapMm,
        includeScaleBar: selection.includeScaleBar,
        includeCutLines: selection.includeCutLines,
        includeFoldLines: selection.includeFoldLines,
        includeFoldGuideTicks: selection.includeFoldGuideTicks,
        appendInnerPocketsPage: selection.appendInnerPocketsPage,
        innerPageSizeId: selection.pageSizeId,
        customRollWidthMm: selection.customRollWidthMm,
        printerMargins: selection.printerMargins,
        rollNesting: selection.rollNesting,
        sheetNesting: selection.sheetNesting,
        multiBookQueueEntries: selection.multiBookQueueEntries,
      });
      return;
    }

    setExportingKind('pdf');
    try {
      const resolvedCutLines = selection.includeCutLines ?? selection.includeGuides;
      if (resolvedCutLines !== undefined) {
        const nextCutLineMode = resolvedCutLines ? 'full-cut-miter' : 'bleed-registration';
        if (nextCutLineMode !== studio.cutLineMode) {
          onUpdateStudio({ cutLineMode: nextCutLineMode });
        }
      }

      const { statusMessage } = await runStyledCoverPdfExport({
        geometry,
        studio,
        customFont,
        params,
        includeCutLines: selection.includeCutLines,
        includeFoldLines: selection.includeFoldLines,
        includeFoldGuideTicks: selection.includeFoldGuideTicks,
        includeGuides: selection.includeGuides,
        printMediaId: selection.printMediaId,
        dpi: selection.dpi,
        tileOverlapMm: selection.tileOverlapMm,
        includeScaleBar: selection.includeScaleBar,
        splitMode: selection.splitMode,
        exportLayerMode: selection.exportLayerMode,
        appendInnerPocketsPage: selection.appendInnerPocketsPage,
        innerPageSizeId: selection.pageSizeId,
        customRollWidthMm: selection.customRollWidthMm,
        printerMargins: selection.printerMargins,
        rollNesting: selection.rollNesting,
        sheetNesting: selection.sheetNesting,
        multiBookQueueEntries: selection.multiBookQueueEntries,
        onFlushActiveBook,
        getProjectRepository,
        onProgressLabel: setLocalProgressLabel,
      });
      onStatusMessage(statusMessage);
    } catch {
      onStatusMessage('Failed to generate Print-Ready Roll PDF.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleDownloadBenchRecipe = async () => {
    setExportingKind('bench');
    try {
      const bytes = await generateBenchRecipePdf(geometry, params, {
        pageSizeId: params.pdfPageSize,
        unit: params.unit,
        bookTitle: studio.spineText.title || activeBookName || undefined,
      });
      triggerBytesDownload(bytes, 'bindery_bench_recipe_and_jigs.pdf', 'application/pdf');
      onStatusMessage('Exported bindery_bench_recipe_and_jigs.pdf');
    } catch {
      onStatusMessage('Failed to generate bench recipe & cutting jigs PDF.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportPng = async () => {
    setExportingKind('png');
    try {
      const { statusMessage } = await runStyledCoverPngExport(geometry, studio, customFont);
      onStatusMessage(statusMessage);
    } catch {
      onStatusMessage('Failed to export 300 DPI PNG.');
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportSvg = async () => {
    setExportingKind('svg');
    try {
      const { statusMessage } = await runStyledCoverSvgExport(geometry, studio, customFont);
      onStatusMessage(statusMessage);
    } catch {
      onStatusMessage('Failed to export Affinity SVG.');
    } finally {
      setExportingKind(null);
    }
  };

  const isAnyExporting =
    exportingKind !== null || exportingOuterPdf || exportingInnerPdf;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4" data-testid="make-print-panel">
      {/* Live Book Wrap & Print Media Fit Summary */}
      <section
        aria-label="Production Summary"
        className="washi-sheet rounded-md border border-border border-t-2 border-t-vermilion p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              PRODUCTION HUB · OUTPUT
            </span>
            <h2 className="mt-0.5 font-serif text-xl font-semibold tracking-tight text-foreground">
              Make &amp; Print — {activeBookName || 'Untitled Book'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Export print-ready PDFs, cutting-machine HTV/foil vectors, chipboard bench jigs, or
              design-app handoff files.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[11px]">
              {strategy.shortLabel}
            </Badge>
            <span
              data-testid="make-media-fit-badge"
              className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-xs font-medium ${mediaFitToneClass}`}
            >
              <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {mediaFitSummary}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2.5 border-t border-border/80 pt-3.5 sm:grid-cols-3">
          <div className="rounded-[3px] border border-border/80 bg-secondary/45 px-3 py-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Outer Wrap Size
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(
                geometry.outerWrap.widthMm,
                geometry.outerWrap.heightMm,
                params.unit,
              )}
            </dd>
          </div>
          <div className="rounded-[3px] border border-border/80 bg-secondary/45 px-3 py-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Book Block (W × H × Spine)
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatValue(params.pbWidthMm, params.unit)} ×{' '}
              {UnitConverter.formatValue(params.pbHeightMm, params.unit)} ×{' '}
              {UnitConverter.formatValue(params.pbThicknessMm, params.unit)} {params.unit}
            </dd>
          </div>
          <div className="rounded-[3px] border border-border/80 bg-secondary/45 px-3 py-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Print Canvas
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              {spec.pixelWidth} × {spec.pixelHeight} px @ 300 DPI
            </dd>
          </div>
        </dl>
      </section>

      {/* 4 Craft Destination Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Card 1: Print Cover PDF */}
        <section
          aria-label="Print Cover PDF"
          className="washi-sheet flex flex-col justify-between gap-4 rounded-md border border-border border-t-2 border-t-brass p-4 sm:p-5"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-vermilion/40 bg-vermilion/10 text-vermilion">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="font-serif text-base font-semibold text-foreground">
                Print Cover PDF
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Print your styled cover on desktop sheets (Letter, A4, Legal, Tabloid) with automatic
              2-sheet tiling, or nest multiple books onto wide-format rolls with printer margin
              calibration and a 50 mm Scale Check ruler.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isAnyExporting}
              data-testid="make-print-cover-pdf-btn"
              onClick={() => {
                setPdfLayerModeDefault('full');
                setPdfDialogTarget('cover-styled');
              }}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {exportingKind === 'pdf' ? 'Rendering…' : 'Open Print Cover PDF…'}
            </Button>
          </div>
        </section>

        {/* Card 2: Cricut / HTV Foil */}
        <section
          aria-label="Cricut and HTV Foil"
          className="washi-sheet flex flex-col justify-between gap-4 rounded-md border border-border border-t-2 border-t-brass p-4 sm:p-5"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-brass/50 bg-brass/15 text-brass">
                <Scissors className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="font-serif text-base font-semibold text-foreground">
                Cricut / HTV Foil
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Export flattened vector curves for Basic Cut HTV &amp; foil (zero text tags or
              transforms) or transparent 300 DPI Print Then Cut PNGs for Cricut Design Space,
              Silhouette Studio, and ScanNCut.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-brass/70 bg-brass/10 text-foreground hover:border-brass hover:bg-brass/20"
              data-testid="make-cricut-btn"
              onClick={() => setCricutDialogOpen(true)}
            >
              <Scissors className="h-4 w-4 text-brass" aria-hidden="true" />
              Open Cricut / HTV Export…
            </Button>
          </div>
        </section>

        {/* Card 3: Cutting Blueprint & Bench Jigs */}
        <section
          aria-label="Cutting Blueprint and Bench Jigs"
          className="washi-sheet flex flex-col justify-between gap-4 rounded-md border border-border border-t-2 border-t-brass p-4 sm:p-5"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-border bg-secondary text-foreground">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="font-serif text-base font-semibold text-foreground">
                Cutting Blueprint &amp; Bench Jigs
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Print your physical bench checklist with chipboard cut list, hinge spacer strips, and
              45° miter corner jigs, or download clean structural cut outlines for bookcloth and
              inner endpapers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isAnyExporting}
              data-testid="make-bench-jigs-btn"
              onClick={() => void handleDownloadBenchRecipe()}
            >
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              {exportingKind === 'bench' ? 'Rendering…' : 'Bench Recipe & Jigs PDF'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAnyExporting}
              data-testid="make-outer-cut-pdf-btn"
              onClick={() => {
                setPdfLayerModeDefault('full');
                setPdfDialogTarget('outer-blueprint');
              }}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Outer Cut PDF…
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="make-outer-cut-svg-btn"
              onClick={() => onDownloadOuterSvg()}
            >
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              Outer Cut SVG
            </Button>
            {usesInnerPockets && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isAnyExporting}
                  data-testid="make-inner-pdf-btn"
                  onClick={() => setPdfDialogTarget('inner-blueprint')}
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Endpapers PDF…
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="make-inner-svg-btn"
                  onClick={onDownloadInnerSvg}
                >
                  <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Endpapers SVG
                </Button>
              </>
            )}
          </div>
        </section>

        {/* Card 4: Design App Handoff */}
        <section
          aria-label="Design App Handoff"
          className="washi-sheet flex flex-col justify-between gap-4 rounded-md border border-border border-t-2 border-t-brass p-4 sm:p-5"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-border bg-secondary text-foreground">
                <Layers className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="font-serif text-base font-semibold text-foreground">
                Design App Handoff
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Continue illustrating or fine-tuning in Affinity Designer, Adobe Illustrator, or
              Procreate with a crisp 300 DPI flat cover PNG or layered millimeter SVG with exact
              board and fold guides.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAnyExporting}
              data-testid="make-export-png-btn"
              onClick={() => void handleExportPng()}
            >
              <FileImage className="h-3.5 w-3.5" aria-hidden="true" />
              {exportingKind === 'png' ? 'Rendering…' : '300 DPI Cover PNG'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAnyExporting}
              data-testid="make-export-svg-btn"
              onClick={() => void handleExportSvg()}
            >
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              {exportingKind === 'svg' ? 'Rendering…' : 'Affinity / Illustrator SVG'}
            </Button>
          </div>
        </section>
      </div>

      {/* Cricut / HTV Modal */}
      <CricutExportDialog
        open={cricutDialogOpen}
        geometry={geometry}
        studio={studio}
        customFont={customFont}
        unit={params.unit}
        onOpenChange={setCricutDialogOpen}
        onStatusMessage={onStatusMessage}
        onOpenBasePdfForHtv={() => {
          setPdfLayerModeDefault('base-only');
          setPdfDialogTarget('cover-styled');
        }}
      />

      {/* Unified Print & Export PDF Modal */}
      <PdfExportDialog
        open={pdfDialogTarget !== null}
        target={pdfDialogTarget ?? 'cover-styled'}
        geometry={geometry}
        unit={params.unit}
        printMediaId={params.printMedia}
        onChangePrintMedia={(printMedia) => onUpdateParams({ printMedia })}
        customRollWidthMm={params.customRollWidthMm}
        onChangeCustomRollWidthMm={(customRollWidthMm) => onUpdateParams({ customRollWidthMm })}
        pageSizeId={params.pdfPageSize}
        onChangePageSize={(pdfPageSize) => onUpdateParams({ pdfPageSize })}
        splitMode={params.splitMode}
        onChangeSplitMode={(splitMode) => onUpdateParams({ splitMode })}
        onReduceFlapWidth={(jacketFlapWidthMm) => onUpdateParams({ jacketFlapWidthMm })}
        onDetachSlipFlaps={() => onUpdateParams({ softcoverPocketMode: 'separate' })}
        defaultIncludeGuides={studio.cutLineMode === 'full-cut-miter'}
        defaultExportLayerMode={pdfLayerModeDefault}
        savedBookSummaries={savedBookSummaries}
        activeProjectId={activeProjectId}
        activeBookName={activeBookName}
        exportProgressLabel={localProgressLabel ?? exportProgressLabel}
        exporting={exportingKind === 'pdf' || exportingOuterPdf || exportingInnerPdf}
        onConfirmExport={handleConfirmPdfExport}
        onClose={() => setPdfDialogTarget(null)}
      />
    </div>
  );
}
