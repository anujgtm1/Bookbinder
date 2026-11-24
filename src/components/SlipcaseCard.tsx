import {
  Box,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { generateSlipcasePdf, generateSlipcaseSvg } from '@/core/slipcaseExport';
import {
  DEFAULT_SLIPCASE_OPTIONS,
  SLIPCASE_OPTION_BOUNDS,
  buildThumbNotchSideWallSvgPath,
  calculateSlipcaseGeometry,
  type SlipcaseOptions,
} from '@/core/slipcaseGeometry';
import { triggerBytesDownload, triggerTextDownload } from '@/core/storage';
import { fmtMm } from '@/lib/svgFormat';
import type { PageSizeId } from '@/types/bookParams';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, type UnitSystem } from '@/types/units';

export interface SlipcaseCardProps {
  readonly geometry: CaseGeometry;
  readonly unit: UnitSystem;
  readonly pageSizeId?: PageSizeId;
  readonly onStatusMessage?: (msg: string) => void;
}

const PREVIEW_PAD_MM = 10;
const PREVIEW_GAP_MM = 12;

export function SlipcaseCard({
  geometry,
  unit,
  pageSizeId = 'letter',
  onStatusMessage,
}: SlipcaseCardProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SlipcaseOptions>({ ...DEFAULT_SLIPCASE_OPTIONS });
  const [exportingPdf, setExportingPdf] = useState(false);

  const clearanceId = useId();
  const wallThicknessId = useId();
  const thumbNotchId = useId();
  const wrapTurnInId = useId();

  const slipcase = useMemo(
    () => calculateSlipcaseGeometry(geometry, options),
    [geometry, options],
  );

  const formatTriple = (wMm: number, hMm: number, tMm: number) =>
    `${UnitConverter.formatValue(wMm, unit)} × ${UnitConverter.formatValue(hMm, unit)} × ${UnitConverter.formatValue(tMm, unit)} ${unit}`;

  const exteriorSummary = formatTriple(
    slipcase.outerWidthMm,
    slipcase.outerHeightMm,
    slipcase.outerThicknessMm,
  );
  const cavitySummary = formatTriple(
    slipcase.cavityWidthMm,
    slipcase.cavityHeightMm,
    slipcase.cavityThicknessMm,
  );

  const isDefaultOptions =
    options.slideClearanceMm === DEFAULT_SLIPCASE_OPTIONS.slideClearanceMm &&
    options.wallBoardThicknessMm === DEFAULT_SLIPCASE_OPTIONS.wallBoardThicknessMm &&
    options.thumbNotchRadiusMm === DEFAULT_SLIPCASE_OPTIONS.thumbNotchRadiusMm &&
    options.wrapTurnInMm === DEFAULT_SLIPCASE_OPTIONS.wrapTurnInMm;

  const updateOption = <K extends keyof SlipcaseOptions>(key: K, rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) return;
    setOptions((prev) => ({ ...prev, [key]: parsed }));
  };

  const handleDownloadSvg = () => {
    const svg = generateSlipcaseSvg(slipcase);
    triggerTextDownload(svg, 'matching_slipcase.svg', 'image/svg+xml;charset=utf-8');
    onStatusMessage?.('Exported matching_slipcase.svg');
  };

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      const { bytes, pageCount } = await generateSlipcasePdf(slipcase, pageSizeId);
      triggerBytesDownload(bytes, 'matching_slipcase.pdf', 'application/pdf');
      onStatusMessage?.(
        `Exported matching_slipcase.pdf (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`,
      );
    } catch {
      onStatusMessage?.('Failed to generate matching slipcase PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Proportional 5-panel cutting preview geometry (1:1 mm coordinate space)
  const { sideWalls, spineWall, headTailWalls } = slipcase;
  const side1X = PREVIEW_PAD_MM;
  const row1Y = PREVIEW_PAD_MM;
  const spineX = side1X + sideWalls.widthMm + PREVIEW_GAP_MM;
  const spineY = row1Y + (sideWalls.heightMm - spineWall.heightMm) / 2;
  const side2X = spineX + spineWall.widthMm + PREVIEW_GAP_MM;
  const row1W = side2X + sideWalls.widthMm - PREVIEW_PAD_MM;

  const row2Y = row1Y + sideWalls.heightMm + PREVIEW_GAP_MM;
  const headX = PREVIEW_PAD_MM;
  const tailX = headX + headTailWalls.widthMm + PREVIEW_GAP_MM;
  const row2W = tailX + headTailWalls.widthMm - PREVIEW_PAD_MM;

  const viewBoxW = Math.max(row1W, row2W) + PREVIEW_PAD_MM * 2;
  const viewBoxH = row2Y + headTailWalls.heightMm + PREVIEW_PAD_MM;

  const side1PathD = buildThumbNotchSideWallSvgPath(
    sideWalls.widthMm,
    sideWalls.heightMm,
    slipcase.effectiveThumbNotchRadiusMm,
    'right',
    side1X,
    row1Y,
  );
  const side2PathD = buildThumbNotchSideWallSvgPath(
    sideWalls.widthMm,
    sideWalls.heightMm,
    slipcase.effectiveThumbNotchRadiusMm,
    'left',
    side2X,
    row1Y,
  );

  const cutStrokeW = Math.max(1.2, viewBoxW * 0.0045);
  const sideLabelSize = Math.max(9, Math.min(15, sideWalls.widthMm * 0.1));
  const subLabelSize = Math.max(7.5, Math.min(11, sideWalls.widthMm * 0.072));
  const capLabelSize = Math.max(8, Math.min(13, headTailWalls.heightMm * 0.45));
  const spineLabelSize = Math.max(7.5, Math.min(12, spineWall.widthMm * 0.45));

  const notchDisplay =
    options.thumbNotchRadiusMm <= 0
      ? 'None'
      : UnitConverter.format(options.thumbNotchRadiusMm, unit);
  const notchClamped =
    options.thumbNotchRadiusMm > 0 &&
    slipcase.effectiveThumbNotchRadiusMm < options.thumbNotchRadiusMm;

  return (
    <section
      aria-label="Matching Slipcase Box Calculator"
      data-testid="slipcase-card"
      className="washi-sheet overflow-hidden rounded-md border border-border"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Crisp Summary Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-serif text-base font-semibold tracking-tight text-foreground">
              <Box className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
              Matching Slipcase Box
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Exterior{' '}
              <span
                className="font-mono font-medium text-foreground"
                data-testid="slipcase-summary-exterior"
              >
                {exteriorSummary}
              </span>{' '}
              • Flush-stacking chipboard box sized to this case.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brass" className="font-mono text-[10px]">
              5-Panel Box
            </Badge>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="toggle-slipcase-calculator"
                aria-expanded={open}
              >
                {open ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
                {open ? 'Hide Calculator' : 'Slipcase Calculator'}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="kettle-stitch-divider space-y-4 px-4 py-3.5">
            {/* 4 Compact Slipcase Options Controls */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 rounded-md border border-border/80 bg-secondary/30 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={clearanceId}>Slide Clearance</Label>
                  <span
                    className="font-mono text-[11px] font-medium text-foreground"
                    data-testid="slipcase-slide-clearance-value"
                  >
                    {UnitConverter.format(options.slideClearanceMm, unit)}
                  </span>
                </div>
                <input
                  id={clearanceId}
                  type="range"
                  min={SLIPCASE_OPTION_BOUNDS.slideClearanceMm.min}
                  max={SLIPCASE_OPTION_BOUNDS.slideClearanceMm.max}
                  step={0.5}
                  value={options.slideClearanceMm}
                  aria-valuetext={UnitConverter.format(options.slideClearanceMm, unit)}
                  data-testid="slipcase-slide-clearance"
                  onChange={(e) => updateOption('slideClearanceMm', e.target.value)}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">Internal ease for smooth slide</p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/80 bg-secondary/30 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={wallThicknessId}>Wall Chipboard</Label>
                  <span
                    className="font-mono text-[11px] font-medium text-foreground"
                    data-testid="slipcase-wall-thickness-value"
                  >
                    {UnitConverter.format(options.wallBoardThicknessMm, unit)}
                  </span>
                </div>
                <input
                  id={wallThicknessId}
                  type="range"
                  min={SLIPCASE_OPTION_BOUNDS.wallBoardThicknessMm.min}
                  max={SLIPCASE_OPTION_BOUNDS.wallBoardThicknessMm.max}
                  step={0.5}
                  value={options.wallBoardThicknessMm}
                  aria-valuetext={UnitConverter.format(options.wallBoardThicknessMm, unit)}
                  data-testid="slipcase-wall-thickness"
                  onChange={(e) => updateOption('wallBoardThicknessMm', e.target.value)}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">Box board gauge (1.0–4.0 mm)</p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/80 bg-secondary/30 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={thumbNotchId}>Thumb-Notch Radius</Label>
                  <span
                    className="font-mono text-[11px] font-medium text-foreground"
                    data-testid="slipcase-thumb-notch-value"
                  >
                    {notchDisplay}
                  </span>
                </div>
                <input
                  id={thumbNotchId}
                  type="range"
                  min={SLIPCASE_OPTION_BOUNDS.thumbNotchRadiusMm.min}
                  max={SLIPCASE_OPTION_BOUNDS.thumbNotchRadiusMm.max}
                  step={1}
                  value={options.thumbNotchRadiusMm}
                  aria-valuetext={notchDisplay}
                  data-testid="slipcase-thumb-notch"
                  onChange={(e) => updateOption('thumbNotchRadiusMm', e.target.value)}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {notchClamped
                    ? `Capped at ${UnitConverter.format(slipcase.effectiveThumbNotchRadiusMm, unit)} for corner strength`
                    : '0 = None • Semi-circular finger pull'}
                </p>
              </div>

              <div className="space-y-1.5 rounded-md border border-border/80 bg-secondary/30 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={wrapTurnInId}>Wrap Turn-In</Label>
                  <span
                    className="font-mono text-[11px] font-medium text-foreground"
                    data-testid="slipcase-wrap-turn-in-value"
                  >
                    {UnitConverter.format(options.wrapTurnInMm, unit)}
                  </span>
                </div>
                <input
                  id={wrapTurnInId}
                  type="range"
                  min={SLIPCASE_OPTION_BOUNDS.wrapTurnInMm.min}
                  max={SLIPCASE_OPTION_BOUNDS.wrapTurnInMm.max}
                  step={1}
                  value={options.wrapTurnInMm}
                  aria-valuetext={UnitConverter.format(options.wrapTurnInMm, unit)}
                  data-testid="slipcase-wrap-turn-in"
                  onChange={(e) => updateOption('wrapTurnInMm', e.target.value)}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">Cloth/paper fold-over margin</p>
              </div>
            </div>

            {/* 5-Piece Cut Table + Outer Wrap Callouts & Proportional SVG Preview */}
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="flex flex-col gap-3">
                {/* Semantic 5-Piece Chipboard Cut Table */}
                <div className="overflow-x-auto rounded-md border border-border/80 bg-card">
                  <table
                    className="w-full border-collapse text-left text-xs"
                    data-testid="slipcase-cut-table"
                  >
                    <caption className="visually-hidden">
                      Matching slipcase 5-piece chipboard cut list
                    </caption>
                    <thead>
                      <tr className="border-b border-border/80 bg-secondary/50 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        <th scope="col" className="px-3 py-2">
                          Chipboard Piece
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Qty
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Dimensions
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      <tr>
                        <th scope="row" className="px-3 py-2 font-medium text-foreground">
                          Side Walls
                        </th>
                        <td className="px-3 py-2">
                          <Badge variant="brass" className="font-mono text-[10px]">
                            Qty {sideWalls.quantity}
                          </Badge>
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-foreground"
                          data-testid="slipcase-dim-side-walls"
                        >
                          {UnitConverter.formatDimensions(sideWalls.widthMm, sideWalls.heightMm, unit)}
                        </td>
                        <td
                          className="px-3 py-2 text-[11px] text-muted-foreground"
                          data-testid="slipcase-note-side-walls"
                        >
                          {slipcase.effectiveThumbNotchRadiusMm > 0
                            ? `Thumb-notch R ${UnitConverter.format(slipcase.effectiveThumbNotchRadiusMm, unit)} on open edge`
                            : 'No thumb-notch (flush fore-edge)'}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row" className="px-3 py-2 font-medium text-foreground">
                          Spine Wall
                        </th>
                        <td className="px-3 py-2">
                          <Badge variant="brass" className="font-mono text-[10px]">
                            Qty {spineWall.quantity}
                          </Badge>
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-foreground"
                          data-testid="slipcase-dim-spine-wall"
                        >
                          {UnitConverter.formatDimensions(spineWall.widthMm, spineWall.heightMm, unit)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">
                          Closed back • glues inside between caps &amp; sides
                        </td>
                      </tr>
                      <tr>
                        <th scope="row" className="px-3 py-2 font-medium text-foreground">
                          Head &amp; Tail Walls
                        </th>
                        <td className="px-3 py-2">
                          <Badge variant="brass" className="font-mono text-[10px]">
                            Qty {headTailWalls.quantity}
                          </Badge>
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-foreground"
                          data-testid="slipcase-dim-head-tail"
                        >
                          {UnitConverter.formatDimensions(
                            headTailWalls.widthMm,
                            headTailWalls.heightMm,
                            unit,
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">
                          Top &amp; bottom caps • grain lengthwise
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Outer Box Wrap Strips & Finished Exterior Size Callout Strip */}
                <div className="grid grid-cols-1 divide-y divide-border/70 rounded-md border border-border/80 bg-secondary/25 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="px-3 py-2" data-testid="slipcase-dim-main-wrap">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Main Wrap ×{slipcase.mainWrapStrip.quantity}
                    </div>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-foreground">
                      {UnitConverter.formatDimensions(
                        slipcase.mainWrapStrip.widthMm,
                        slipcase.mainWrapStrip.heightMm,
                        unit,
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Side + Spine + Side wrap strip
                    </p>
                  </div>

                  <div className="px-3 py-2" data-testid="slipcase-dim-cap-wrap">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Head/Tail Cap Strips ×{slipcase.capWrapStrip.quantity}
                    </div>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-foreground">
                      {UnitConverter.formatDimensions(
                        slipcase.capWrapStrip.widthMm,
                        slipcase.capWrapStrip.heightMm,
                        unit,
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Top &amp; bottom cloth/paper caps
                    </p>
                  </div>

                  <div className="px-3 py-2" data-testid="slipcase-exterior-size">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Finished Exterior Size
                    </div>
                    <p className="mt-0.5 font-mono text-xs font-semibold text-foreground">
                      {exteriorSummary}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Cavity {cavitySummary}
                    </p>
                  </div>
                </div>
              </div>

              {/* Live Proportional 5-Panel SVG Preview */}
              <figure className="drafting-surface flex flex-col justify-between rounded-md border border-dashed border-brass/45 px-3 py-2.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-foreground">
                  <span>5-Panel Cutting Layout</span>
                  <span className="font-mono text-[11px] text-brass">
                    {UnitConverter.format(options.wallBoardThicknessMm, unit)} board
                  </span>
                </div>

                <svg
                  role="img"
                  aria-label="Matching slipcase 5-panel cutting layout"
                  viewBox={`0 0 ${fmtMm(viewBoxW)} ${fmtMm(viewBoxH)}`}
                  className="my-2 h-44 w-full"
                  data-testid="slipcase-preview-svg"
                >
                  <title>
                    Proportional 5-panel slipcase layout: 2 side walls
                    {slipcase.effectiveThumbNotchRadiusMm > 0
                      ? ` with ${UnitConverter.format(slipcase.effectiveThumbNotchRadiusMm, unit)} thumb-notches`
                      : ''}
                    , 1 spine wall, and 2 head/tail cap walls.
                  </title>

                  {/* Front Side Wall (open fore-edge on right) */}
                  <path
                    d={side1PathD}
                    data-testid="slipcase-preview-side-wall-front"
                    fill="currentColor"
                    fillOpacity="0.08"
                    stroke="var(--vermilion)"
                    strokeWidth={cutStrokeW}
                    strokeLinejoin="round"
                  />
                  <text
                    x={side1X + sideWalls.widthMm / 2}
                    y={row1Y + sideWalls.heightMm / 2 - subLabelSize * 0.45}
                    textAnchor="middle"
                    fontSize={sideLabelSize}
                    fontWeight="600"
                    fill="currentColor"
                  >
                    Side Wall 1
                  </text>
                  <text
                    x={side1X + sideWalls.widthMm / 2}
                    y={row1Y + sideWalls.heightMm / 2 + subLabelSize * 0.95}
                    textAnchor="middle"
                    fontSize={subLabelSize}
                    fill="var(--brass)"
                  >
                    {slipcase.effectiveThumbNotchRadiusMm > 0
                      ? `R ${UnitConverter.format(slipcase.effectiveThumbNotchRadiusMm, unit)}`
                      : 'Open Right'}
                  </text>

                  {/* Spine Wall (Closed Back) */}
                  <rect
                    x={spineX}
                    y={spineY}
                    width={spineWall.widthMm}
                    height={spineWall.heightMm}
                    data-testid="slipcase-preview-spine-wall"
                    fill="var(--brass-bright)"
                    fillOpacity="0.16"
                    stroke="var(--vermilion)"
                    strokeWidth={cutStrokeW}
                  />
                  <text
                    x={spineX + spineWall.widthMm / 2}
                    y={spineY + spineWall.heightMm / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={spineLabelSize}
                    fontWeight="600"
                    fill="currentColor"
                    transform={`rotate(-90 ${fmtMm(spineX + spineWall.widthMm / 2)} ${fmtMm(spineY + spineWall.heightMm / 2)})`}
                  >
                    Spine Wall
                  </text>

                  {/* Back Side Wall (open fore-edge on left) */}
                  <path
                    d={side2PathD}
                    data-testid="slipcase-preview-side-wall-back"
                    fill="currentColor"
                    fillOpacity="0.08"
                    stroke="var(--vermilion)"
                    strokeWidth={cutStrokeW}
                    strokeLinejoin="round"
                  />
                  <text
                    x={side2X + sideWalls.widthMm / 2}
                    y={row1Y + sideWalls.heightMm / 2 - subLabelSize * 0.45}
                    textAnchor="middle"
                    fontSize={sideLabelSize}
                    fontWeight="600"
                    fill="currentColor"
                  >
                    Side Wall 2
                  </text>
                  <text
                    x={side2X + sideWalls.widthMm / 2}
                    y={row1Y + sideWalls.heightMm / 2 + subLabelSize * 0.95}
                    textAnchor="middle"
                    fontSize={subLabelSize}
                    fill="var(--brass)"
                  >
                    {slipcase.effectiveThumbNotchRadiusMm > 0
                      ? `R ${UnitConverter.format(slipcase.effectiveThumbNotchRadiusMm, unit)}`
                      : 'Open Left'}
                  </text>

                  {/* Head Cap Wall */}
                  <rect
                    x={headX}
                    y={row2Y}
                    width={headTailWalls.widthMm}
                    height={headTailWalls.heightMm}
                    data-testid="slipcase-preview-head-wall"
                    fill="var(--brass-bright)"
                    fillOpacity="0.14"
                    stroke="var(--vermilion)"
                    strokeWidth={cutStrokeW}
                  />
                  <text
                    x={headX + headTailWalls.widthMm / 2}
                    y={row2Y + headTailWalls.heightMm / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={capLabelSize}
                    fontWeight="600"
                    fill="currentColor"
                  >
                    Head Cap
                  </text>

                  {/* Tail Cap Wall */}
                  <rect
                    x={tailX}
                    y={row2Y}
                    width={headTailWalls.widthMm}
                    height={headTailWalls.heightMm}
                    data-testid="slipcase-preview-tail-wall"
                    fill="var(--brass-bright)"
                    fillOpacity="0.14"
                    stroke="var(--vermilion)"
                    strokeWidth={cutStrokeW}
                  />
                  <text
                    x={tailX + headTailWalls.widthMm / 2}
                    y={row2Y + headTailWalls.heightMm / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={capLabelSize}
                    fontWeight="600"
                    fill="currentColor"
                  >
                    Tail Cap
                  </text>
                </svg>

                <figcaption className="text-[11px] text-muted-foreground">
                  Glue Head &amp; Tail caps flush to the Spine Wall, then sandwich with both Side
                  Walls.
                </figcaption>
              </figure>
            </div>

            {/* Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={isDefaultOptions}
                onClick={() => setOptions({ ...DEFAULT_SLIPCASE_OPTIONS })}
                data-testid="slipcase-reset-options-btn"
                className="text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset Box Defaults
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSvg}
                  aria-label="Download Matching Slipcase Cut SVG"
                  data-testid="slipcase-download-svg-btn"
                >
                  <FileCode2 className="h-4 w-4" aria-hidden="true" />
                  Slipcase SVG
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={exportingPdf}
                  aria-label="Download Matching Slipcase Cut PDF"
                  data-testid="slipcase-download-pdf-btn"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {exportingPdf ? 'Rendering…' : 'Slipcase PDF'}
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
