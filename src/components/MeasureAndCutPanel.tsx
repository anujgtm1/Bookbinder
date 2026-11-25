import {
  ClipboardList,
  Crosshair,
  FileCode2,
  FileText,
  FoldHorizontal,
  Maximize2,
  Minimize2,
  Ruler,
  Scissors,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { CutListCard } from '@/components/CutListCard';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { OuterBlueprintCanvas } from '@/components/OuterBlueprintCanvas';
import {
  PdfExportDialog,
  type OuterPdfExportOptions,
  type PdfExportSelection,
} from '@/components/PdfExportDialog';
import { SlipcaseCard } from '@/components/SlipcaseCard';
import { Button } from '@/components/ui/button';
import { generateBenchRecipePdf } from '@/core/benchRecipePdf';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import { triggerBytesDownload } from '@/core/storage';
import {
  FULL_PAGE_EXIT_BUTTON_CLASS,
  getFullPageStageClass,
  useFullPageCanvas,
} from '@/hooks/useFullPageCanvas';
import {
  BookParametersModel,
  type BookParameters,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import type { CaseGeometry } from '@/types/geometry';
import type { PdfGuideOptionsInput } from '@/types/pdfGuides';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface MeasureAndCutPanelProps {
  readonly geometry: CaseGeometry;
  readonly params?: BookParameters;
  readonly bookTitle?: string;
  readonly splitMode: SplitMode;
  readonly printMediaId?: PrintMediaId;
  readonly pageSizeId?: PageSizeId;
  readonly unit: UnitSystem;
  readonly exportingOuterPdf?: boolean;
  readonly onChangePrintMedia?: (mediaId: PrintMediaId) => void;
  readonly onChangePageSize?: (sizeId: PageSizeId) => void;
  readonly onChangeSplitMode?: (mode: SplitMode) => void;
  readonly onReduceFlapWidth?: (widthMm: number) => void;
  readonly onDetachSlipFlaps?: () => void;
  readonly onDownloadOuterSvg: (options?: PdfGuideOptionsInput) => void;
  readonly onDownloadOuterPdf: (options?: OuterPdfExportOptions) => void | Promise<void>;
  readonly onStatusMessage?: (message: string) => void;
}

export function MeasureAndCutPanel({
  geometry,
  params,
  bookTitle,
  splitMode,
  printMediaId = 'exact-auto',
  pageSizeId = 'letter',
  unit,
  exportingOuterPdf = false,
  onChangePrintMedia,
  onChangePageSize,
  onChangeSplitMode,
  onReduceFlapWidth,
  onDetachSlipFlaps,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
  onStatusMessage,
}: MeasureAndCutPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showFoldLines, setShowFoldLines] = useState(true);
  const [showFoldGuideTicks, setShowFoldGuideTicks] = useState(true);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportingBenchPdf, setExportingBenchPdf] = useState(false);
  const [localPrintMedia, setLocalPrintMedia] = useState<PrintMediaId>(printMediaId);
  const [localPageSize, setLocalPageSize] = useState<PageSizeId>(pageSizeId);
  const [localSplitMode, setLocalSplitMode] = useState<SplitMode>(splitMode);
  const { isExpanded, toggleExpanded, exitExpanded } = useFullPageCanvas();

  const bindingStrategy = resolveBindingStrategy(geometry);
  const { capabilities } = bindingStrategy;
  const effectivePrintMedia = onChangePrintMedia ? printMediaId : localPrintMedia;
  const effectivePageSize = onChangePageSize ? pageSizeId : localPageSize;
  const effectiveSplitMode: SplitMode = capabilities.supportsThreePieceSplit
    ? onChangeSplitMode
      ? splitMode
      : localSplitMode
    : 'single';

  const handleConfirmPdfExport = async (selection: PdfExportSelection) => {
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
    });
  };

  const handleDownloadBenchRecipePdf = async () => {
    setExportingBenchPdf(true);
    try {
      const bytes = await generateBenchRecipePdf(
        geometry,
        params ?? BookParametersModel.createDefault(),
        {
          pageSizeId: effectivePageSize,
          unit,
          bookTitle,
        },
      );
      triggerBytesDownload(bytes, 'bindery_bench_recipe_and_jigs.pdf', 'application/pdf');
      onStatusMessage?.('Exported bindery_bench_recipe_and_jigs.pdf');
    } catch {
      onStatusMessage?.('Failed to generate bench recipe & cutting jigs PDF.');
    } finally {
      setExportingBenchPdf(false);
    }
  };

  const adjustZoom = (delta: number) => {
    setZoom((prev) => roundTo(Math.min(3.5, Math.max(0.5, prev + delta)), 2));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="measure-and-cut-panel">
      {/* Full Chipboard Cut List & Roll Sizing Specimen Docket */}
      <CutListCard geometry={geometry} unit={unit} />

      {/* Structural Cutting Blueprint & Material Layout Card */}
      <section
        aria-label="Cutting Blueprint & Material Layout"
        className="washi-sheet overflow-hidden rounded-md border border-border border-t-2 border-t-brass/80"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="font-serif text-base font-semibold tracking-tight text-foreground">
              Cutting Blueprint &amp; Material Layout
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Exact cutting marks, cumulative steel-ruler stops, and 45° miter callouts for
              bookcloth, leather, or printed sheets.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadBenchRecipePdf}
              disabled={exportingBenchPdf}
              aria-label="Download Printable Bench Recipe and Cutting Jigs PDF"
              data-testid="measure-download-bench-jigs-btn"
            >
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              {exportingBenchPdf ? 'Rendering…' : 'Bench Recipe & Jigs PDF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onDownloadOuterSvg({
                  includeCutLines: showCutLines,
                  includeFoldLines: showFoldLines,
                  includeFoldGuideTicks: showFoldGuideTicks,
                })
              }
              aria-label="Download Outer Case Wrap Cut SVG"
              data-testid="measure-download-svg-btn"
            >
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              Cut SVG
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setPdfDialogOpen(true)}
              disabled={exportingOuterPdf}
              aria-label="Download Outer Case Wrap Cut PDF"
              data-testid="measure-download-pdf-btn"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {exportingOuterPdf ? 'Rendering…' : 'Cut PDF…'}
            </Button>
          </div>
        </div>

        {/* Full-Bleed Cutting Mat Viewport */}
        <div
          id="measure-mat-viewport"
          data-testid="measure-canvas-stage"
          data-expanded={isExpanded ? 'true' : 'false'}
          className={`cutting-mat-surface flex items-center justify-center overflow-hidden border-border/80 ${getFullPageStageClass(isExpanded)}`}
        >
          {isExpanded && (
            <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={exitExpanded}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                data-testid="measure-exit-fullscreen-btn"
                aria-label="Exit full screen canvas"
                title="Exit full screen (Esc)"
                className={FULL_PAGE_EXIT_BUTTON_CLASS}
              >
                <Minimize2 className="h-3.5 w-3.5 text-brass-bright" aria-hidden="true" />
                <span>Exit Full Screen</span>
                <kbd className="rounded border border-[#f6efe2]/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#f6efe2]/80">
                  Esc
                </kbd>
              </button>
            </div>
          )}

          <OuterBlueprintCanvas
            geometry={geometry}
            splitMode={splitMode}
            unit={unit}
            zoom={zoom}
            onAdjustZoom={adjustZoom}
            pan={pan}
            onPanChange={setPan}
            showDimensions={showDimensions}
            showCutLines={showCutLines}
            showFoldLines={showFoldLines}
            showFoldGuideTicks={showFoldGuideTicks}
          />

          {/* Floating Bottom-Center HUD Pill Toolbar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-20 flex justify-center px-3">
            <FloatingHudToolbar
              label="Cutting blueprint overlays and zoom controls"
              controlsId="measure-mat-viewport"
              className="pointer-events-auto max-w-full overflow-x-auto"
              testId="measure-hud-toolbar"
            >
              <HudGroup label="Blueprint overlays">
                <HudButton
                  pressed={showDimensions}
                  onClick={() => setShowDimensions((v) => !v)}
                  title="Show/hide manual-cutting dimension lines, cumulative ruler marks, and 45° miter callout"
                  data-testid="measure-dimensions-btn"
                >
                  <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                  Dimensions
                </HudButton>
                <HudButton
                  pressed={showCutLines}
                  onClick={() => setShowCutLines((v) => !v)}
                  title="Show/hide solid red outer cut lines (also applies to Cut SVG and Cut PDF defaults)"
                  data-testid="measure-cut-lines-btn"
                >
                  <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                  Cut Lines
                </HudButton>
                <HudButton
                  pressed={showFoldLines}
                  onClick={() => setShowFoldLines((v) => !v)}
                  title="Show/hide dashed blue interior fold lines (also applies to Cut SVG and Cut PDF defaults)"
                  data-testid="measure-fold-lines-btn"
                >
                  <FoldHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  Fold Lines
                </HudButton>
                <HudButton
                  pressed={showFoldGuideTicks}
                  onClick={() => setShowFoldGuideTicks((v) => !v)}
                  title="Show/hide external fold guide registration ticks outside the cut perimeter"
                  data-testid="measure-fold-ticks-btn"
                >
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  Fold Guides
                </HudButton>
              </HudGroup>

              <HudSeparator />

              <HudGroup label="Blueprint zoom">
                <HudButton
                  aria-label="Zoom out blueprint"
                  title="Zoom out"
                  onClick={() => adjustZoom(-0.25)}
                  className="px-2"
                  data-testid="measure-zoom-out-btn"
                >
                  <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                </HudButton>
                <span
                  data-testid="measure-zoom-readout"
                  className="min-w-11 text-center font-mono text-[11px] text-[#f6efe2]/90"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <HudButton
                  aria-label="Zoom in blueprint"
                  title="Zoom in"
                  onClick={() => adjustZoom(0.25)}
                  className="px-2"
                  data-testid="measure-zoom-in-btn"
                >
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                </HudButton>
                <HudButton
                  aria-label="Reset blueprint zoom and pan"
                  title="Reset zoom & pan"
                  onClick={resetView}
                  className="px-2"
                  data-testid="measure-zoom-reset-btn"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                </HudButton>
              </HudGroup>

              <HudSeparator />

              <HudGroup label="Canvas size">
                <HudButton
                  pressed={isExpanded}
                  onClick={toggleExpanded}
                  title="Expand canvas to full page (Esc to exit)"
                  data-testid="measure-fullscreen-btn"
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isExpanded ? 'Exit' : 'Full Screen'}
                </HudButton>
              </HudGroup>
            </FloatingHudToolbar>
          </div>
        </div>

        {/* Subtle Legend Footer Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {capabilities.hasTurnIns
              ? 'Solid Red: 45° Miter Cut Line • Dashed Blue: Board Guides • Brass: Hinge Spacers • Green: Bleed.'
              : capabilities.hasGlueTabs
                ? 'Solid Red: Outer Cut Outline • Dashed Blue: Fold Lines • Hatched Brass: Glue Tabs • Green: Bleed.'
                : capabilities.hasFlaps
                  ? 'Solid Red: Outer Trim Outline • Dashed Blue: 4 Vertical Fold Lines • Brass: Fold-In Flaps • Green: Bleed.'
                  : 'Solid Red: Flush Trim Outline • Dashed Blue: 2 Spine Score Folds • Green: Bleed.'}
          </span>
          <span className="font-mono text-[11px] text-brass">
            {UnitConverter.formatDimensions(
              geometry.outerWrap.widthMm,
              geometry.outerWrap.heightMm,
              unit,
            )}
            {effectiveSplitMode === 'three-piece' ? ' • 3-Piece Split' : ' • Single Wrap'}
          </span>
        </div>
      </section>

      {/* Interactive Matching Slipcase Box Calculator */}
      <SlipcaseCard
        geometry={geometry}
        unit={unit}
        pageSizeId={effectivePageSize}
        onStatusMessage={onStatusMessage}
      />

      <PdfExportDialog
        open={pdfDialogOpen}
        target="outer-blueprint"
        geometry={geometry}
        unit={unit}
        printMediaId={effectivePrintMedia}
        onChangePrintMedia={(mediaId) => {
          setLocalPrintMedia(mediaId);
          onChangePrintMedia?.(mediaId);
        }}
        pageSizeId={effectivePageSize}
        onChangePageSize={(sizeId) => {
          setLocalPageSize(sizeId);
          onChangePageSize?.(sizeId);
        }}
        splitMode={effectiveSplitMode}
        onChangeSplitMode={(mode) => {
          setLocalSplitMode(mode);
          onChangeSplitMode?.(mode);
        }}
        onReduceFlapWidth={onReduceFlapWidth}
        onDetachSlipFlaps={onDetachSlipFlaps}
        defaultIncludeCutLines={showCutLines}
        defaultIncludeFoldLines={showFoldLines}
        defaultIncludeFoldGuideTicks={showFoldGuideTicks}
        exporting={exportingOuterPdf}
        onConfirmExport={handleConfirmPdfExport}
        onClose={() => setPdfDialogOpen(false)}
      />
    </div>
  );
}
