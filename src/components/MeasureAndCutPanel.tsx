import { FileCode2, FileText, Maximize2, Minimize2, Ruler, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { CutListCard } from '@/components/CutListCard';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from '@/components/FloatingHudToolbar';
import { OuterBlueprintCanvas } from '@/components/OuterBlueprintCanvas';
import { Button } from '@/components/ui/button';
import {
  FULL_PAGE_EXIT_BUTTON_CLASS,
  getFullPageStageClass,
  useFullPageCanvas,
} from '@/hooks/useFullPageCanvas';
import type { SplitMode } from '@/types/bookParams';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface MeasureAndCutPanelProps {
  readonly geometry: CaseGeometry;
  readonly splitMode: SplitMode;
  readonly unit: UnitSystem;
  readonly exportingOuterPdf?: boolean;
  readonly onDownloadOuterSvg: () => void;
  readonly onDownloadOuterPdf: () => void;
}

export function MeasureAndCutPanel({
  geometry,
  splitMode,
  unit,
  exportingOuterPdf = false,
  onDownloadOuterSvg,
  onDownloadOuterPdf,
}: MeasureAndCutPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  const { isExpanded, toggleExpanded, exitExpanded } = useFullPageCanvas();

  const adjustZoom = (delta: number) => {
    setZoom((prev) => roundTo(Math.min(3.5, Math.max(0.5, prev + delta)), 2));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="measure-and-cut-panel">
      {/* Full Chipboard Cut List & Roll Sizing (flush with the Measure & Cut folder tab) */}
      <CutListCard geometry={geometry} unit={unit} className="rounded-tl-none" />

      {/* 1:1 mm Structural Cutting Blueprint & Material Layout Card */}
      <section
        aria-label="1:1 mm Cutting Blueprint and Material Layout"
        className="overflow-hidden rounded-lg border border-border bg-card shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="font-serif text-base font-semibold tracking-tight text-foreground">
              1:1 mm Cutting Blueprint &amp; Material Layout
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
              onClick={onDownloadOuterSvg}
              aria-label="Download Outer Case Wrap Cut SVG (1:1 mm)"
              data-testid="measure-download-svg-btn"
            >
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              Cut SVG (1:1 mm)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onDownloadOuterPdf}
              disabled={exportingOuterPdf}
              aria-label="Download Outer Case Wrap Cut PDF (1:1 mm)"
              data-testid="measure-download-pdf-btn"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {exportingOuterPdf ? 'Rendering…' : 'Cut PDF (1:1 mm)'}
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
            Solid Red: 45° Miter Cut Line • Dashed Blue: Board Guides • Brass: Hinge Spacers •
            Green: Bleed.
          </span>
          <span className="font-mono text-[11px] text-brass">
            {UnitConverter.formatDimensions(
              geometry.outerWrap.widthMm,
              geometry.outerWrap.heightMm,
              unit,
            )}
            {splitMode === 'three-piece' ? ' • 3-Piece Split' : ' • Single Wrap'}
          </span>
        </div>
      </section>
    </div>
  );
}
