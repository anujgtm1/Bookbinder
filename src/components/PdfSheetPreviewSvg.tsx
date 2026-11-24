import { AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { resolveBindingStrategy } from '@/core/bindingStyles';
import { evaluatePrintMediaFit } from '@/core/geometry';
import type { InnerPdfLayoutPlan, InnerPieceKind } from '@/core/pdfExport';
import {
  DEFAULT_PRINTER_MARGINS,
  clampPrinterMargins,
  computePrintableSafeBox,
  type PrinterMargins,
} from '@/core/printerMargins';
import type { RollNestPlan } from '@/core/rollNesting';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import type { PrintMediaId, SplitMode } from '@/types/bookParams';
import type { CaseGeometry, PrintMediaFitEvaluation } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface PdfSheetPreviewProps {
  readonly isOuterTarget: boolean;
  readonly geometry: CaseGeometry;
  readonly unit: UnitSystem;
  readonly printMediaId: PrintMediaId;
  readonly splitMode: SplitMode;
  readonly activeFit: PrintMediaFitEvaluation;
  readonly tileOverlapMm: number;
  readonly includeScaleBar: boolean;
  readonly innerPlan: InnerPdfLayoutPlan;
  readonly printerMargins?: PrinterMargins;
  readonly customRollWidthMm?: number;
  readonly rollNestPlan?: RollNestPlan | null;
  readonly onChangePrintMedia: (mediaId: PrintMediaId) => void;
  readonly onChangeSplitMode?: (mode: SplitMode) => void;
  readonly onReduceFlapWidth?: (widthMm: number) => void;
}

const INNER_PIECE_STYLES: Record<
  InnerPieceKind,
  { readonly label: string; readonly fill: string; readonly stroke: string; readonly text: string }
> = {
  'back-pocket': {
    label: 'Back Pocket',
    fill: 'rgba(30, 77, 68, 0.16)',
    stroke: '#1e4d44',
    text: '#1e4d44',
  },
  'front-pocket': {
    label: 'Front Pocket',
    fill: 'rgba(166, 123, 46, 0.18)',
    stroke: '#a67b2e',
    text: '#7c5918',
  },
  'spine-liner': {
    label: 'Spine Liner',
    fill: 'rgba(74, 109, 94, 0.22)',
    stroke: '#4a6d5e',
    text: '#2d4b3f',
  },
  'calibration-legend': {
    label: '50 mm Legend',
    fill: 'rgba(29, 91, 214, 0.14)',
    stroke: '#1d5bd6',
    text: '#1d5bd6',
  },
};

const ROLL_ITEM_PALETTE = [
  { fill: 'rgba(30, 77, 68, 0.18)', stroke: '#1e4d44', text: '#163a33' },
  { fill: 'rgba(166, 123, 46, 0.2)', stroke: '#a67b2e', text: '#6e4e14' },
  { fill: 'rgba(29, 91, 214, 0.16)', stroke: '#1d5bd6', text: '#16429e' },
  { fill: 'rgba(124, 58, 237, 0.16)', stroke: '#7c3aed', text: '#5b21b6' },
  { fill: 'rgba(190, 24, 93, 0.15)', stroke: '#be185d', text: '#9d174d' },
] as const;

function UnprintableMarginStrips({
  sheetW,
  sheetH,
  margins,
  hatchId,
}: {
  readonly sheetW: number;
  readonly sheetH: number;
  readonly margins: PrinterMargins;
  readonly hatchId: string;
}) {
  const top = Math.min(sheetH, Math.max(0, margins.topMm));
  const bottom = Math.min(sheetH - top, Math.max(0, margins.bottomMm));
  const left = Math.min(sheetW, Math.max(0, margins.leftMm));
  const right = Math.min(sheetW - left, Math.max(0, margins.rightMm));
  const middleH = Math.max(0, sheetH - top - bottom);

  if (top <= 0 && bottom <= 0 && left <= 0 && right <= 0) {
    return null;
  }

  return (
    <g data-testid="preview-unprintable-margin" aria-hidden="true">
      <defs>
        <pattern
          id={hatchId}
          width={6}
          height={6}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={6} height={6} fill="rgba(148, 163, 184, 0.22)" />
          <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(100, 116, 139, 0.38)" strokeWidth={1.2} />
        </pattern>
      </defs>
      {top > 0 && <rect x={0} y={0} width={sheetW} height={top} fill={`url(#${hatchId})`} />}
      {bottom > 0 && (
        <rect x={0} y={sheetH - bottom} width={sheetW} height={bottom} fill={`url(#${hatchId})`} />
      )}
      {left > 0 && middleH > 0 && (
        <rect x={0} y={top} width={left} height={middleH} fill={`url(#${hatchId})`} />
      )}
      {right > 0 && middleH > 0 && (
        <rect x={sheetW - right} y={top} width={right} height={middleH} fill={`url(#${hatchId})`} />
      )}
    </g>
  );
}

function computeReducibleFlapMm(
  geometry: CaseGeometry,
  mediaId: PrintMediaId,
  margins: PrinterMargins,
): number | null {
  const strategy = resolveBindingStrategy(geometry);
  if (
    !strategy.capabilities.hasFlaps ||
    !strategy.flapConfig ||
    !strategy.computeMaxFlapWidthForSheet
  ) {
    return null;
  }
  const spec = getPrintMediaSpec(mediaId);
  if (spec.kind !== 'sheet' || spec.longMm === null || spec.shortMm === null) return null;
  const landscapeSafe = computePrintableSafeBox(spec.longMm, spec.shortMm, margins);
  if (geometry.outerWrap.heightMm > landscapeSafe.heightMm + 0.05) return null;
  const longPrintable = landscapeSafe.widthMm;
  const rawMaxFlap =
    Math.floor(((longPrintable - geometry.outerWrap.innerWidthMm) / 2) * 10 + 1e-9) / 10;
  if (rawMaxFlap < strategy.flapConfig.minMm) return null;
  const spineEase = strategy.capabilities.hasGlueTabs ? 1.0 : 1.5;
  const maxFlap = strategy.computeMaxFlapWidthForSheet(
    {
      bindingStyle: geometry.bindingStyle,
      pbWidthMm: geometry.cutList.coverBoards.widthMm - 1.0,
      pbThicknessMm: geometry.cutList.spineStrip.widthMm - spineEase,
    },
    longPrintable,
  );
  if (maxFlap >= geometry.outerWrap.jacketFlapWidthMm - 0.1) return null;
  return roundTo(maxFlap, 1);
}

function CoverCreaseLines({
  geometry,
  originX,
  originY,
  clipId,
}: {
  readonly geometry: CaseGeometry;
  readonly originX: number;
  readonly originY: number;
  readonly clipId?: string;
}) {
  const { outerWrap } = geometry;
  const xs = [
    outerWrap.backBoardRect.x,
    outerWrap.spineRect.x,
    outerWrap.spineRect.x + outerWrap.spineRect.width,
    outerWrap.frontBoardRect.x + outerWrap.frontBoardRect.width,
  ];
  const uniqueXs: number[] = [];
  for (const x of xs) {
    if (x <= 1 || x >= outerWrap.widthMm - 1) continue;
    if (!uniqueXs.some((prev) => Math.abs(prev - x) < 1)) {
      uniqueXs.push(x);
    }
  }

  return (
    <g clipPath={clipId ? `url(#${clipId})` : undefined}>
      <rect
        x={originX}
        y={originY}
        width={outerWrap.widthMm}
        height={outerWrap.heightMm}
        fill="rgba(30, 77, 68, 0.15)"
        stroke="#1e4d44"
        strokeWidth={1.1}
        rx={1}
      />
      {/* Spine band highlight */}
      <rect
        x={originX + outerWrap.spineRect.x}
        y={originY}
        width={outerWrap.spineRect.width}
        height={outerWrap.heightMm}
        fill="rgba(166, 123, 46, 0.22)"
      />
      {/* Vertical panel fold hints */}
      {uniqueXs.map((vx) => (
        <line
          key={vx}
          x1={originX + vx}
          y1={originY}
          x2={originX + vx}
          y2={originY + outerWrap.heightMm}
          stroke="#1d5bd6"
          strokeWidth={0.75}
          strokeDasharray="3 2.5"
          opacity={0.75}
        />
      ))}
    </g>
  );
}

function ScaleBarSvg({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={54}
        height={9}
        rx={1}
        fill="rgba(255, 255, 255, 0.92)"
        stroke="#94a3b8"
        strokeWidth={0.5}
      />
      <line x1={x + 2} y1={y + 6.5} x2={x + 52} y2={y + 6.5} stroke="#1e293b" strokeWidth={0.9} />
      {[0, 10, 20, 30, 40, 50].map((mm) => (
        <line
          key={mm}
          x1={x + 2 + mm}
          y1={y + 4}
          x2={x + 2 + mm}
          y2={y + 6.5}
          stroke="#1e293b"
          strokeWidth={0.7}
        />
      ))}
      <text x={x + 2} y={y + 3.4} fontSize={3.6} fontFamily="monospace" fill="#334155">
        50 mm
      </text>
    </g>
  );
}

export function PdfSheetPreviewSvg({
  isOuterTarget,
  geometry,
  unit,
  printMediaId,
  splitMode,
  activeFit,
  tileOverlapMm,
  includeScaleBar,
  innerPlan,
  printerMargins,
  customRollWidthMm,
  rollNestPlan,
  onChangePrintMedia,
  onChangeSplitMode,
  onReduceFlapWidth,
}: PdfSheetPreviewProps) {
  const uid = useId().replace(/:/g, '');
  const tile1ClipId = `${uid}-tile-1`;
  const tile2ClipId = `${uid}-tile-2`;
  const singleHatchId = `${uid}-margin-single`;
  const tile1HatchId = `${uid}-margin-tile-1`;
  const tile2HatchId = `${uid}-margin-tile-2`;
  const rollHatchId = `${uid}-margin-roll`;
  const effectiveMargins = printerMargins
    ? clampPrinterMargins(printerMargins)
    : DEFAULT_PRINTER_MARGINS;
  const bindingStrategy = resolveBindingStrategy(geometry);
  const wrapW = geometry.outerWrap.widthMm;
  const wrapH = geometry.outerWrap.heightMm;

  // 1. Inner Pockets / Liner paginated sheet thumbnails
  if (!isOuterTarget) {
    const pageIndices = Array.from({ length: innerPlan.pageCount }, (_, idx) => idx);
    const anyClipped = innerPlan.placements.some((p) => p.clipped);

    return (
      <div
        data-testid="pdf-export-sheet-preview"
        className="drafting-surface flex flex-col gap-2.5 rounded-lg border border-border p-3.5"
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">
            Sheet Layout Preview ({innerPlan.pageCount}{' '}
            {innerPlan.pageCount === 1 ? 'page' : 'pages'})
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {roundTo(innerPlan.pageWidthMm, 1)} × {roundTo(innerPlan.pageHeightMm, 1)} mm
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 py-1">
          {pageIndices.map((pageIndex) => {
            const pagePlacements = innerPlan.placements.filter((p) => p.pageIndex === pageIndex);
            const aspect = innerPlan.pageWidthMm / innerPlan.pageHeightMm;
            const thumbH = 148;
            const thumbW = Math.round(thumbH * aspect);
            return (
              <div key={pageIndex} className="flex flex-col items-center gap-1">
                <svg
                  role="img"
                  aria-label={`Page ${pageIndex + 1} inner pieces layout`}
                  width={thumbW}
                  height={thumbH}
                  viewBox={`0 0 ${innerPlan.pageWidthMm} ${innerPlan.pageHeightMm}`}
                  className="rounded border border-border/90 bg-[#fffdf9] shadow-xs"
                >
                  {/* Printable margin guide */}
                  <rect
                    x={7.5}
                    y={7.5}
                    width={innerPlan.pageWidthMm - 15}
                    height={innerPlan.pageHeightMm - 15}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth={0.9}
                    strokeDasharray="4 3"
                  />
                  {pagePlacements.map((p) => {
                    const st = INNER_PIECE_STYLES[p.kind];
                    return (
                      <g key={`${p.kind}-${p.pageIndex}`}>
                        <rect
                          x={p.xMm}
                          y={p.yMm}
                          width={p.widthMm}
                          height={p.heightMm}
                          fill={p.clipped ? 'rgba(185, 56, 34, 0.2)' : st.fill}
                          stroke={p.clipped ? '#b93822' : st.stroke}
                          strokeWidth={1.3}
                          rx={1.5}
                        />
                        <text
                          x={p.xMm + p.widthMm / 2}
                          y={p.yMm + p.heightMm / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={Math.max(7.5, Math.min(11, p.widthMm * 0.13))}
                          fontWeight={600}
                          fill={p.clipped ? '#b93822' : st.text}
                        >
                          {st.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Page {pageIndex + 1}
                </span>
              </div>
            );
          })}
        </div>

        {anyClipped && (
          <p className="flex items-center gap-1.5 rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            At least one piece exceeds printable bounds on this paper — try{' '}
            {getPrintMediaSpec('legal').label} or {getPrintMediaSpec('tabloid').label}.
          </p>
        )}
      </div>
    );
  }

  // 2. Outer 3-Piece Quarter-Bound Split Preview
  if (splitMode === 'three-piece') {
    const maxH = Math.max(...geometry.splitPanels.map((p) => p.heightMm), 1);
    return (
      <div
        data-testid="pdf-export-sheet-preview"
        className="drafting-surface flex flex-col gap-2.5 rounded-lg border border-border p-3.5"
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Layers className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            3-Piece Split Output (3 separate pages)
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5 py-1">
          {geometry.splitPanels.map((panel) => {
            const hRatio = Math.max(0.45, panel.heightMm / maxH);
            const wScale = Math.min(1, panel.widthMm / Math.max(panel.heightMm, 1));
            return (
              <div
                key={panel.id}
                className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-card/85 p-2 text-center"
              >
                <div className="flex h-24 w-full items-center justify-center">
                  <div
                    className="flex items-center justify-center rounded-xs border border-primary/70 bg-primary/12 text-[10px] font-semibold text-primary"
                    style={{
                      height: `${Math.round(hRatio * 88)}px`,
                      width: `${Math.max(26, Math.round(hRatio * 88 * wScale))}px`,
                    }}
                  >
                    {panel.id === 'back' ? 'Back' : panel.id === 'spine' ? 'Spine' : 'Front'}
                  </div>
                </div>
                <span className="text-[11px] font-medium text-foreground">{panel.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {UnitConverter.formatDimensions(panel.widthMm, panel.heightMm, unit)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2b. Wide-Format Roll Multi-Up / Gang-Sheet Strip Preview
  if (splitMode === 'single' && rollNestPlan) {
    const rollW = Math.max(1, rollNestPlan.rollWidthMm);
    const stripH = Math.max(rollNestPlan.usedLengthMm, 80);
    const sideMargin = rollNestPlan.sideMarginMm;
    const itemColorMap = new Map<string, (typeof ROLL_ITEM_PALETTE)[number]>();
    const copyCounts = new Map<string, number>();
    for (const rect of rollNestPlan.placements) {
      copyCounts.set(rect.itemId, (copyCounts.get(rect.itemId) ?? 0) + 1);
      if (!itemColorMap.has(rect.itemId)) {
        const idx = itemColorMap.size % ROLL_ITEM_PALETTE.length;
        itemColorMap.set(rect.itemId, ROLL_ITEM_PALETTE[idx]);
      }
    }

    // Group placements into shelf rows to draw subtle dashed cut gutters
    const shelfRows = new Map<number, typeof rollNestPlan.placements[number][]>();
    for (const rect of rollNestPlan.placements) {
      const key = roundTo(rect.yMm, 1);
      const list = shelfRows.get(key) ?? [];
      list.push(rect);
      shelfRows.set(key, list);
    }
    const sortedRowYs = [...shelfRows.keys()].sort((a, b) => a - b);

    const activeRollSpec = getPrintMediaSpec(printMediaId);
    const rollTitle =
      printMediaId === 'roll-custom'
        ? `Custom Roll (${roundTo(rollW, 1)} mm)`
        : activeRollSpec.label;

    return (
      <div
        data-testid="pdf-export-sheet-preview"
        className="drafting-surface flex flex-col gap-2.5 rounded-lg border border-border p-3.5"
      >
        <div
          data-testid="pdf-roll-strip-preview"
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Roll Strip Preview — {rollTitle}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {rollNestPlan.placements.length}{' '}
            {rollNestPlan.placements.length === 1 ? 'piece' : 'pieces'} •{' '}
            {UnitConverter.format(rollNestPlan.usedLengthMm, unit)} roll length •{' '}
            {rollNestPlan.efficiencyPct}% efficiency
          </span>
        </div>

        <div className="flex items-center justify-center py-1">
          <svg
            role="img"
            aria-label={`Nested roll strip preview on ${rollTitle}`}
            viewBox={`0 0 ${rollW} ${stripH}`}
            className="max-h-56 w-full max-w-[560px] rounded border border-border/90 bg-[#fffdf9] shadow-xs"
          >
            {/* Left & Right unprintable roll side margins */}
            {sideMargin > 0 && (
              <g data-testid="preview-unprintable-margin" aria-hidden="true">
                <defs>
                  <pattern
                    id={rollHatchId}
                    width={10}
                    height={10}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width={10} height={10} fill="rgba(148, 163, 184, 0.24)" />
                    <line
                      x1={0}
                      y1={0}
                      x2={0}
                      y2={10}
                      stroke="rgba(100, 116, 139, 0.4)"
                      strokeWidth={1.8}
                    />
                  </pattern>
                </defs>
                <rect x={0} y={0} width={sideMargin} height={stripH} fill={`url(#${rollHatchId})`} />
                <rect
                  x={rollW - sideMargin}
                  y={0}
                  width={sideMargin}
                  height={stripH}
                  fill={`url(#${rollHatchId})`}
                />
              </g>
            )}

            {/* Printable width guide lines */}
            <rect
              x={sideMargin}
              y={0}
              width={rollNestPlan.printableWidthMm}
              height={stripH}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={Math.max(1, rollW * 0.002)}
              strokeDasharray="8 5"
            />

            {/* Cut gutter guides between nested pieces */}
            {sortedRowYs.map((rowY, rowIdx) => {
              const rowRects = (shelfRows.get(rowY) ?? []).slice().sort((a, b) => a.xMm - b.xMm);
              const rowMaxH = Math.max(...rowRects.map((r) => r.heightMm), 0);
              const nextRowY = sortedRowYs[rowIdx + 1];
              return (
                <g key={rowY} aria-hidden="true">
                  {rowRects.slice(0, -1).map((leftRect, i) => {
                    const rightRect = rowRects[i + 1];
                    const midX = (leftRect.xMm + leftRect.widthMm + rightRect.xMm) / 2;
                    return (
                      <line
                        key={`${leftRect.itemId}-${leftRect.copyIndex}-v`}
                        x1={midX}
                        y1={rowY}
                        x2={midX}
                        y2={rowY + rowMaxH}
                        stroke="#64748b"
                        strokeWidth={Math.max(1, rollW * 0.0018)}
                        strokeDasharray="6 4"
                      />
                    );
                  })}
                  {nextRowY !== undefined && (
                    <line
                      x1={sideMargin}
                      y1={(rowY + rowMaxH + nextRowY) / 2}
                      x2={sideMargin + rollNestPlan.printableWidthMm}
                      y2={(rowY + rowMaxH + nextRowY) / 2}
                      stroke="#64748b"
                      strokeWidth={Math.max(1, rollW * 0.0018)}
                      strokeDasharray="6 4"
                    />
                  )}
                </g>
              );
            })}

            {/* Placed nested items */}
            {rollNestPlan.placements.map((rect) => {
              const palette = itemColorMap.get(rect.itemId) ?? ROLL_ITEM_PALETTE[0];
              const totalCopies = copyCounts.get(rect.itemId) ?? 1;
              const titleLabel =
                totalCopies > 1 ? `${rect.label} #${rect.copyIndex + 1}` : rect.label;
              const fontSize = Math.max(
                10,
                Math.min(22, Math.min(rect.widthMm, rect.heightMm) * 0.11),
              );
              const dimFontSize = Math.max(8, fontSize * 0.72);
              const badgeW = Math.min(rect.widthMm * 0.35, 34);
              const badgeH = Math.min(rect.heightMm * 0.2, 16);
              return (
                <g
                  key={`${rect.itemId}-${rect.copyIndex}`}
                  data-testid="roll-nest-placed-item"
                >
                  <rect
                    x={rect.xMm}
                    y={rect.yMm}
                    width={rect.widthMm}
                    height={rect.heightMm}
                    fill={palette.fill}
                    stroke={palette.stroke}
                    strokeWidth={Math.max(1.5, rollW * 0.0025)}
                    rx={2}
                  />
                  <text
                    x={rect.xMm + rect.widthMm / 2}
                    y={rect.yMm + rect.heightMm / 2 - dimFontSize * 0.45}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                    fontWeight={600}
                    fill={palette.text}
                  >
                    {titleLabel}
                  </text>
                  <text
                    x={rect.xMm + rect.widthMm / 2}
                    y={rect.yMm + rect.heightMm / 2 + fontSize * 0.72}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={dimFontSize}
                    fontFamily="monospace"
                    fill={palette.text}
                    opacity={0.85}
                  >
                    {roundTo(rect.widthMm, 0)} × {roundTo(rect.heightMm, 0)} mm
                  </text>
                  {rect.rotated90 && badgeW >= 18 && badgeH >= 10 && (
                    <g>
                      <rect
                        x={rect.xMm + rect.widthMm - badgeW - 4}
                        y={rect.yMm + 4}
                        width={badgeW}
                        height={badgeH}
                        rx={3}
                        fill="rgba(255,255,255,0.9)"
                        stroke={palette.stroke}
                        strokeWidth={1}
                      />
                      <text
                        x={rect.xMm + rect.widthMm - badgeW / 2 - 4}
                        y={rect.yMm + 4 + badgeH / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.max(7.5, badgeH * 0.62)}
                        fontFamily="monospace"
                        fontWeight={700}
                        fill={palette.text}
                      >
                        90°
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {includeScaleBar && rollW >= 70 && stripH >= 24 && (
              <ScaleBarSvg x={sideMargin + 4} y={4} />
            )}
          </svg>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            Roll width: <strong className="font-mono">{UnitConverter.format(rollW, unit)}</strong> •
            Gutter: <strong className="font-mono">{rollNestPlan.gutterMm} mm</strong>
          </span>
          <span>
            Roll efficiency:{' '}
            <strong className="font-mono text-foreground">{rollNestPlan.efficiencyPct}%</strong>
          </span>
        </div>

        {rollNestPlan.unplacedIds.length > 0 && (
          <p className="flex items-center gap-1.5 rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {rollNestPlan.unplacedIds.length}{' '}
            {rollNestPlan.unplacedIds.length === 1 ? 'item exceeds' : 'items exceed'} the printable
            roll width ({roundTo(rollNestPlan.printableWidthMm, 1)} mm) and could not be placed.
          </p>
        )}
      </div>
    );
  }

  // 3. Outer "Does Not Fit" warning + 1-click quick-switch buttons (for specific sheets & rolls)
  if (activeFit.status === 'does-not-fit' && printMediaId !== 'exact-auto') {
    const selectedSpec = getPrintMediaSpec(printMediaId);
    const legalSpec = getPrintMediaSpec('legal');
    const tabloidSpec = getPrintMediaSpec('tabloid');
    const exactAutoSpec = getPrintMediaSpec('exact-auto');
    const fitOpts = { customRollWidthMm, margins: effectiveMargins };
    const legalFit = evaluatePrintMediaFit('legal', wrapW, wrapH, tileOverlapMm, fitOpts);
    const tabloidFit = evaluatePrintMediaFit('tabloid', wrapW, wrapH, tileOverlapMm, fitOpts);
    const reducibleFlapMm = computeReducibleFlapMm(geometry, printMediaId, effectiveMargins);

    const suggestedOther =
      activeFit.suggestedMediaId &&
      activeFit.suggestedMediaId !== 'legal' &&
      activeFit.suggestedMediaId !== 'tabloid'
        ? getPrintMediaSpec(activeFit.suggestedMediaId)
        : null;

    const selectedSafeLandscape =
      selectedSpec.kind === 'sheet' && selectedSpec.shortMm && selectedSpec.longMm
        ? computePrintableSafeBox(selectedSpec.longMm, selectedSpec.shortMm, effectiveMargins)
        : null;

    return (
      <div
        data-testid="pdf-export-sheet-preview"
        className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/8 p-4"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-destructive">
              Cover ({UnitConverter.formatDimensions(wrapW, wrapH, unit)}) does not fit on{' '}
              {selectedSpec.label}
            </p>
            <p className="text-muted-foreground">
              {selectedSafeLandscape
                ? `${selectedSpec.label} printable safe area is ${roundTo(selectedSafeLandscape.heightMm, 1)} × ${roundTo(selectedSafeLandscape.widthMm, 1)} mm (exceeds even 2 tiled sheets). Choose a larger sheet or Exact Wrap Size below:`
                : activeFit.summary}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {legalFit.status === 'fits-1-sheet' && (
            <Button
              type="button"
              size="sm"
              variant="default"
              data-testid="pdf-quick-switch-legal"
              onClick={() => onChangePrintMedia('legal')}
            >
              Switch to 1× {legalSpec.label}
            </Button>
          )}
          {tabloidFit.status === 'fits-1-sheet' && (
            <Button
              type="button"
              size="sm"
              variant={legalFit.status === 'fits-1-sheet' ? 'outline' : 'default'}
              data-testid="pdf-quick-switch-tabloid"
              onClick={() => onChangePrintMedia('tabloid')}
            >
              Switch to 1× {tabloidSpec.label}
            </Button>
          )}
          {suggestedOther && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid={`pdf-quick-switch-${suggestedOther.id}`}
              onClick={() => onChangePrintMedia(suggestedOther.id)}
            >
              Switch to {suggestedOther.label}
            </Button>
          )}
          {reducibleFlapMm !== null && onReduceFlapWidth && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="pdf-quick-reduce-flap"
              onClick={() => onReduceFlapWidth(reducibleFlapMm)}
            >
              Reduce flap to {reducibleFlapMm} mm
            </Button>
          )}
          {bindingStrategy.capabilities.supportsThreePieceSplit && onChangeSplitMode && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="pdf-quick-switch-three-piece"
              onClick={() => onChangeSplitMode('three-piece')}
            >
              Use 3-Piece Split
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="pdf-quick-switch-exact-auto"
            onClick={() => onChangePrintMedia('exact-auto')}
          >
            Use {exactAutoSpec.shortLabel}
          </Button>
        </div>
      </div>
    );
  }

  // 4. Outer Exact Wrap Size or Wide-Format Roll preview
  if (
    printMediaId === 'exact-auto' ||
    activeFit.status === 'fits-roll' ||
    activeFit.sheetPageWidthMm === null ||
    activeFit.sheetPageHeightMm === null
  ) {
    const exactAutoSpec = getPrintMediaSpec('exact-auto');
    const pad = 14;
    const vbW = wrapW + pad * 2;
    const vbH = wrapH + pad * 2;
    return (
      <div
        data-testid="pdf-export-sheet-preview"
        className="drafting-surface flex flex-col gap-2 rounded-lg border border-border p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            {printMediaId === 'exact-auto'
              ? `${exactAutoSpec.shortLabel} (${exactAutoSpec.dimensionsLabel})`
              : activeFit.summary}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {UnitConverter.formatDimensions(wrapW, wrapH, unit)}
          </span>
        </div>

        <div className="flex items-center justify-center py-1">
          <svg
            role="img"
            aria-label="Exact wrap cover layout preview"
            viewBox={`0 0 ${vbW} ${vbH}`}
            className="h-36 max-w-full"
          >
            <rect
              x={pad - 3}
              y={pad - 3}
              width={wrapW + 6}
              height={wrapH + 6}
              rx={2}
              fill="#fffdf9"
              stroke="#94a3b8"
              strokeWidth={1}
            />
            <CoverCreaseLines geometry={geometry} originX={pad} originY={pad} />
            <text
              x={pad + wrapW / 2}
              y={pad + wrapH / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.max(10, Math.min(14, wrapH * 0.08))}
              fontWeight={600}
              fill="#1e4d44"
            >
              Exact Wrap ({roundTo(wrapW, 1)} × {roundTo(wrapH, 1)} mm)
            </text>
            {includeScaleBar && <ScaleBarSvg x={pad + 5} y={pad + wrapH - 13} />}
          </svg>
        </div>

        {printMediaId === 'exact-auto' && (
          <p className="text-center text-[11px] text-muted-foreground">
            {geometry.rollRecommendation.summary}
          </p>
        )}
      </div>
    );
  }

  // 5. Outer Fits on 1 Sheet (Centered inside printable safe box)
  const activeMediaSpec = getPrintMediaSpec(printMediaId);
  const sheetW = activeFit.sheetPageWidthMm;
  const sheetH = activeFit.sheetPageHeightMm;
  const safeBox = computePrintableSafeBox(sheetW, sheetH, effectiveMargins);
  if (activeFit.status === 'fits-1-sheet') {
    const originX = safeBox.xMm + (safeBox.widthMm - wrapW) / 2;
    const originY = safeBox.yMm + (safeBox.heightMm - wrapH) / 2;
    const orientationLabel = sheetW > sheetH ? 'Landscape' : 'Portrait';

    return (
      <div
        data-testid="pdf-export-sheet-preview"
        className="drafting-surface flex flex-col gap-2 rounded-lg border border-border p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            1× {activeMediaSpec.label} {orientationLabel} — Centered
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {roundTo(sheetW, 1)} × {roundTo(sheetH, 1)} mm sheet
          </span>
        </div>

        <div className="flex items-center justify-center py-1">
          <svg
            role="img"
            aria-label={`Centered cover on 1 ${activeMediaSpec.label} ${orientationLabel} sheet`}
            viewBox={`0 0 ${sheetW} ${sheetH}`}
            className="h-40 max-w-full rounded border border-border/90 bg-[#fffdf9] shadow-xs"
          >
            <UnprintableMarginStrips
              sheetW={sheetW}
              sheetH={sheetH}
              margins={effectiveMargins}
              hatchId={singleHatchId}
            />
            {/* Printable safe-box boundary */}
            <rect
              x={safeBox.xMm}
              y={safeBox.yMm}
              width={safeBox.widthMm}
              height={safeBox.heightMm}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <CoverCreaseLines geometry={geometry} originX={originX} originY={originY} />
            {includeScaleBar && <ScaleBarSvg x={safeBox.xMm + 2} y={safeBox.yMm + 2} />}
          </svg>
        </div>
      </div>
    );
  }

  // 6. Outer Fits on 2 Tiled Sheets (Side-by-Side Sheet 1 Left & Sheet 2 Right, inside safe box)
  const halfOverlap = tileOverlapMm / 2;
  const wrapHalfWithOverlap = wrapW / 2 + halfOverlap;
  const leftMargin = safeBox.xMm + (safeBox.widthMm - wrapHalfWithOverlap) / 2;
  const drawOriginY = safeBox.yMm + (safeBox.heightMm - wrapH) / 2;
  const p1SeamX = leftMargin + wrapW / 2;
  const p2OriginX = leftMargin - (wrapW / 2 - halfOverlap);
  const p2SeamX = leftMargin + halfOverlap;
  const seamTopY = Math.max(6, safeBox.yMm + 1);
  const seamBottomY = Math.min(sheetH - 6, safeBox.yMm + safeBox.heightMm - 1);
  const seamHeight = Math.max(0, seamBottomY - seamTopY);
  const crossTopY = Math.min(seamBottomY - 6, seamTopY + 6);
  const crossBottomY = Math.max(seamTopY + 6, seamBottomY - 6);
  const orientationLabel = sheetW > sheetH ? 'Landscape' : 'Portrait';
  const reducibleFlapMm = computeReducibleFlapMm(geometry, printMediaId, effectiveMargins);

  return (
    <div
      data-testid="pdf-export-sheet-preview"
      className="drafting-surface flex flex-col gap-2.5 rounded-lg border border-border p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-amber-900 dark:text-amber-300">
          2× {activeMediaSpec.label} {orientationLabel} Tiled ({tileOverlapMm} mm overlap &amp; tape
          zone)
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {roundTo(sheetW, 1)} × {roundTo(sheetH, 1)} mm / sheet
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 py-1">
        {/* Sheet 1 (Left) */}
        <div className="flex flex-col items-center gap-1">
          <svg
            role="img"
            aria-label="Sheet 1 of 2 Left tiled cover preview"
            viewBox={`0 0 ${sheetW} ${sheetH}`}
            className="h-36 max-w-full rounded border border-border/90 bg-[#fffdf9] shadow-xs"
          >
            <defs>
              <clipPath id={tile1ClipId}>
                <rect x={Math.max(0, leftMargin)} y={0} width={wrapHalfWithOverlap} height={sheetH} />
              </clipPath>
            </defs>
            <UnprintableMarginStrips
              sheetW={sheetW}
              sheetH={sheetH}
              margins={effectiveMargins}
              hatchId={tile1HatchId}
            />
            <rect
              x={safeBox.xMm}
              y={safeBox.yMm}
              width={safeBox.widthMm}
              height={safeBox.heightMm}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <CoverCreaseLines
              geometry={geometry}
              originX={leftMargin}
              originY={drawOriginY}
              clipId={tile1ClipId}
            />
            {/* Amber overlap & tape zone */}
            <rect
              x={p1SeamX - halfOverlap}
              y={seamTopY}
              width={tileOverlapMm}
              height={seamHeight}
              fill="rgba(217, 119, 6, 0.22)"
              stroke="#d97706"
              strokeWidth={0.7}
              strokeDasharray="2.5 2"
            />
            {/* Blue alignment seam + crosshairs */}
            <line
              x1={p1SeamX}
              y1={seamTopY}
              x2={p1SeamX}
              y2={seamBottomY}
              stroke="#1d5bd6"
              strokeWidth={0.9}
              strokeDasharray="3.5 2"
            />
            {[crossTopY, crossBottomY].map((cy) => (
              <g key={cy} stroke="#1d5bd6" strokeWidth={0.9} fill="none">
                <circle cx={p1SeamX} cy={cy} r={3} />
                <line x1={p1SeamX - 5} y1={cy} x2={p1SeamX + 5} y2={cy} />
                <line x1={p1SeamX} y1={cy - 5} x2={p1SeamX} y2={cy + 5} />
              </g>
            ))}
            {includeScaleBar && <ScaleBarSvg x={safeBox.xMm + 2} y={safeBox.yMm + 2} />}
          </svg>
          <span className="font-mono text-[10px] font-medium text-muted-foreground">
            Sheet 1 (Left)
          </span>
        </div>

        {/* Sheet 2 (Right) */}
        <div className="flex flex-col items-center gap-1">
          <svg
            role="img"
            aria-label="Sheet 2 of 2 Right tiled cover preview"
            viewBox={`0 0 ${sheetW} ${sheetH}`}
            className="h-36 max-w-full rounded border border-border/90 bg-[#fffdf9] shadow-xs"
          >
            <defs>
              <clipPath id={tile2ClipId}>
                <rect x={leftMargin} y={0} width={wrapHalfWithOverlap} height={sheetH} />
              </clipPath>
            </defs>
            <UnprintableMarginStrips
              sheetW={sheetW}
              sheetH={sheetH}
              margins={effectiveMargins}
              hatchId={tile2HatchId}
            />
            <rect
              x={safeBox.xMm}
              y={safeBox.yMm}
              width={safeBox.widthMm}
              height={safeBox.heightMm}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <CoverCreaseLines
              geometry={geometry}
              originX={p2OriginX}
              originY={drawOriginY}
              clipId={tile2ClipId}
            />
            {/* Amber overlap & tape zone */}
            <rect
              x={p2SeamX - halfOverlap}
              y={seamTopY}
              width={tileOverlapMm}
              height={seamHeight}
              fill="rgba(217, 119, 6, 0.22)"
              stroke="#d97706"
              strokeWidth={0.7}
              strokeDasharray="2.5 2"
            />
            {/* Blue alignment seam + crosshairs */}
            <line
              x1={p2SeamX}
              y1={seamTopY}
              x2={p2SeamX}
              y2={seamBottomY}
              stroke="#1d5bd6"
              strokeWidth={0.9}
              strokeDasharray="3.5 2"
            />
            {[crossTopY, crossBottomY].map((cy) => (
              <g key={cy} stroke="#1d5bd6" strokeWidth={0.9} fill="none">
                <circle cx={p2SeamX} cy={cy} r={3} />
                <line x1={p2SeamX - 5} y1={cy} x2={p2SeamX + 5} y2={cy} />
                <line x1={p2SeamX} y1={cy - 5} x2={p2SeamX} y2={cy + 5} />
              </g>
            ))}
          </svg>
          <span className="font-mono text-[10px] font-medium text-muted-foreground">
            Sheet 2 (Right)
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-xs border border-amber-600 bg-amber-500/30"
            aria-hidden="true"
          />
          Overlap &amp; Tape Zone ({tileOverlapMm} mm) • Align blue crosshairs to join
        </span>
        {reducibleFlapMm !== null && onReduceFlapWidth && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            data-testid="pdf-quick-reduce-flap"
            onClick={() => onReduceFlapWidth(reducibleFlapMm)}
          >
            Fit on 1 sheet (flap → {reducibleFlapMm} mm)
          </Button>
        )}
      </div>
    </div>
  );
}
