import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Copy,
  Eye,
  Layers,
  Ruler,
  Trash2,
} from 'lucide-react';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SeriesBookLayout, SeriesShelfLayout } from '@/core/seriesSpines';
import { getBindingStyleSpec } from '@/resources/paperSpecs';
import { buildOrnamentCompoundPath } from '@/studio/classicOrnaments';
import { resolveFontCssFamily, type CustomFontAsset } from '@/studio/fonts';
import type { CoverOrnamentLayer } from '@/types/coverElements';
import type { SeriesBookId, SeriesProject } from '@/types/seriesSpines';
import { CoverStudioModel } from '@/types/studio';
import { UnitConverter, type UnitSystem } from '@/types/units';

export type SeriesStageViewMode = 'flat' | 'shelf-25d';

export interface SeriesShelfStageProps {
  readonly series: SeriesProject;
  readonly layout: SeriesShelfLayout;
  readonly selectedBookId: SeriesBookId | null;
  readonly unit: UnitSystem;
  readonly customFont: CustomFontAsset | null;
  readonly onSelectBook: (id: SeriesBookId) => void;
  readonly onMoveBook: (id: SeriesBookId, direction: 'left' | 'right') => void;
  readonly onDuplicateBook: (id: SeriesBookId) => void;
  readonly onRemoveBook: (id: SeriesBookId) => void;
  readonly onOpenInCoverStudio: (bookLayout: SeriesBookLayout) => void;
}

function buildInlineOrnamentPath(
  bookLayout: SeriesBookLayout,
  series: SeriesProject,
  originX: number,
  originY: number,
): string | null {
  if (series.shared.ornamentId === 'none' || !bookLayout.ornamentRectMm) return null;
  const r = bookLayout.ornamentRectMm;
  const layer: CoverOrnamentLayer = {
    id: `stage-orn-${bookLayout.index}`,
    presetId: series.shared.ornamentId,
    zone: 'spine',
    xMm: r.x - originX,
    yMm: r.y - originY,
    widthMm: r.width,
    heightMm: r.height,
    color: bookLayout.accentColor,
    strokeWidthMm: 0.65,
  };
  return buildOrnamentCompoundPath(layer) || null;
}

export function SeriesShelfStage({
  series,
  layout,
  selectedBookId,
  unit,
  customFont,
  onSelectBook,
  onMoveBook,
  onDuplicateBook,
  onRemoveBook,
  onOpenInCoverStudio,
}: SeriesShelfStageProps) {
  const [viewMode, setViewMode] = useState<SeriesStageViewMode>('flat');
  const [showGuides, setShowGuides] = useState(true);
  const spineBtnRefs = useRef<Map<SeriesBookId, HTMLButtonElement>>(new Map());

  const fontFamily = useMemo(
    () => resolveFontCssFamily(series.shared.fontId, customFont),
    [series.shared.fontId, customFont],
  );

  const selectedLayout = useMemo(
    () => layout.books.find((b) => b.book.id === selectedBookId) ?? layout.books[0] ?? null,
    [layout.books, selectedBookId],
  );

  const handleSpineKeyDown = (event: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const count = layout.books.length;
    if (count === 0) return;
    const nextIdx =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : event.key === 'ArrowLeft'
            ? (idx - 1 + count) % count
            : (idx + 1) % count;
    const nextBook = layout.books[nextIdx];
    if (nextBook) {
      onSelectBook(nextBook.book.id);
      spineBtnRefs.current.get(nextBook.book.id)?.focus();
    }
  };

  // Flat 1:1 mm SVG viewport calculations
  const padX = 24;
  const padTop = 18;
  const shelfThicknessMm = 10;
  const padBottom = 26;
  const shelfW = Math.max(80, layout.totalShelfWidthMm);
  const shelfH = Math.max(120, layout.maxSpineHeightMm);
  const svgW = shelfW + padX * 2;
  const svgH = shelfH + padTop + shelfThicknessMm + padBottom;

  const isAuthorHorizontal = series.shared.authorOrientation === 'horizontal';
  const verticalRotDeg = series.shared.orientation === 'top-to-bottom' ? 90 : -90;

  // 2.5D shelf proportional scale (px per mm so tallest book is ~320px tall)
  const shelf25dScale = Math.min(1.65, Math.max(0.95, 310 / Math.max(120, shelfH)));

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {/* Stage Canvas Viewport */}
      <div className="cutting-mat-surface cutting-mat-on-desk relative flex min-h-[470px] flex-col overflow-hidden rounded-md">
        {/* Top Floating HUD */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brass/25 bg-black/25 px-3 py-2">
          <div className="hud-toolbar" role="toolbar" aria-label="Shelf preview mode">
            <button
              type="button"
              className="hud-toolbar-btn"
              aria-pressed={viewMode === 'flat'}
              data-testid="series-view-flat"
              onClick={() => setViewMode('flat')}
            >
              <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
              Flat Shelf (1:1 mm)
            </button>
            <button
              type="button"
              className="hud-toolbar-btn"
              aria-pressed={viewMode === 'shelf-25d'}
              data-testid="series-view-25d"
              onClick={() => setViewMode('shelf-25d')}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              2.5D Wooden Shelf
            </button>
            <span className="hud-toolbar-separator" aria-hidden="true" />
            <button
              type="button"
              className="hud-toolbar-btn"
              aria-pressed={showGuides}
              data-testid="series-toggle-guides"
              onClick={() => setShowGuides((v) => !v)}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Guides
            </button>
          </div>

          <div
            data-testid="series-shelf-telemetry"
            className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#f3ecdd]"
          >
            <span>
              {layout.books.length} {layout.books.length === 1 ? 'book' : 'books'}
            </span>
            <span aria-hidden="true" className="opacity-40">
              •
            </span>
            <span>
              Shelf Width: {UnitConverter.formatValue(layout.totalShelfWidthMm, unit)} {unit}
            </span>
            <span aria-hidden="true" className="opacity-40">
              •
            </span>
            <span>
              Tallest: {UnitConverter.formatValue(layout.maxSpineHeightMm, unit)} {unit}
            </span>
          </div>
        </div>

        {/* Thin-spine clamp alert banner */}
        {layout.clampedBookCount > 0 && (
          <div
            role="status"
            data-testid="series-clamp-warning"
            className="status-warning-surface mx-3 mt-2.5 flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-medium"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {layout.clampedBookCount}{' '}
              {layout.clampedBookCount === 1 ? 'spine is' : 'spines are'} narrower than the shared
              title size ({series.shared.titleSizePt} pt) — text is automatically clamped to keep
              hinge clearance safe.
            </span>
          </div>
        )}

        {/* Main Shelf Visual */}
        <div className="flex flex-1 flex-col items-center justify-center overflow-x-auto p-4 sm:p-6">
          {viewMode === 'flat' ? (
            <div
              data-testid="series-flat-shelf"
              className="flex w-full max-w-[960px] flex-col items-center gap-3"
            >
              <svg
                role="img"
                aria-label={`${series.name} flat 1:1 millimeter spine lineup (${layout.books.length} books)`}
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="h-auto max-h-[430px] w-full drop-shadow-xl"
              >
                <title>
                  {series.name} — {layout.books.length} standing spines at exact millimeter scale
                </title>
                <defs>
                  {/* Realistic vertical bookcloth sheen gradient (rgba only) */}
                  <linearGradient id="series-spine-sheen" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(0, 0, 0, 0.28)" />
                    <stop offset="14%" stopColor="rgba(255, 255, 255, 0.1)" />
                    <stop offset="50%" stopColor="rgba(255, 255, 255, 0.03)" />
                    <stop offset="86%" stopColor="rgba(0, 0, 0, 0.08)" />
                    <stop offset="100%" stopColor="rgba(0, 0, 0, 0.34)" />
                  </linearGradient>
                  <linearGradient id="series-shelf-wood" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6c492d" />
                    <stop offset="28%" stopColor="#4c321e" />
                    <stop offset="100%" stopColor="#2c1c10" />
                  </linearGradient>
                  {layout.books.map((b) => (
                    <clipPath key={`clip-${b.book.id}`} id={`series-spine-clip-${b.book.id}`}>
                      <rect
                        x={padX + b.shelfXMm}
                        y={padTop + b.shelfYMm}
                        width={b.spineWidthMm}
                        height={b.spineHeightMm}
                        rx="0.9"
                      />
                    </clipPath>
                  ))}
                </defs>

                {/* Wooden Shelf Plank */}
                <rect
                  x={padX - 14}
                  y={padTop + shelfH}
                  width={shelfW + 28}
                  height={shelfThicknessMm}
                  rx="1.5"
                  fill="url(#series-shelf-wood)"
                  stroke="rgba(222, 183, 101, 0.45)"
                  strokeWidth="0.45"
                />
                <line
                  x1={padX - 13}
                  y1={padTop + shelfH + 0.6}
                  x2={padX + shelfW + 13}
                  y2={padTop + shelfH + 0.6}
                  stroke="rgba(248, 224, 174, 0.28)"
                  strokeWidth="0.5"
                />

                {/* Standing Book Spines */}
                {layout.books.map((bookLayout) => {
                  const isSelected = selectedLayout?.book.id === bookLayout.book.id;
                  const sx = padX + bookLayout.shelfXMm;
                  const sy = padTop + bookLayout.shelfYMm;
                  const sw = bookLayout.spineWidthMm;
                  const sh = bookLayout.spineHeightMm;
                  const cx = padX + bookLayout.spineCenterXMm;
                  const ornPath = buildInlineOrnamentPath(bookLayout, series, 0, 0);
                  const title = bookLayout.book.title.trim();
                  const author = bookLayout.book.author.trim();
                  const inlineText =
                    series.shared.titleLayout === 'inline' && !isAuthorHorizontal
                      ? CoverStudioModel.formatInlineSpineText(title, author)
                      : null;

                  return (
                    <g
                      key={bookLayout.book.id}
                      data-testid={`series-spine-svg-${bookLayout.index}`}
                      data-book-id={bookLayout.book.id}
                      data-selected={isSelected ? 'true' : 'false'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onSelectBook(bookLayout.book.id)}
                    >
                      <g clipPath={`url(#series-spine-clip-${bookLayout.book.id})`}>
                        {/* Base Bookcloth Fill */}
                        <rect
                          x={sx}
                          y={sy}
                          width={sw}
                          height={sh}
                          fill={bookLayout.bgColor}
                        />

                        {/* Continuous Panoramic Artwork Slice */}
                        {series.shared.panorama.enabled &&
                          series.shared.panorama.dataUrl &&
                          layout.panoramaShelfRect && (
                            <>
                              <image
                                href={series.shared.panorama.dataUrl}
                                x={padX + layout.panoramaShelfRect.xMm}
                                y={padTop + layout.panoramaShelfRect.yMm}
                                width={layout.panoramaShelfRect.widthMm}
                                height={layout.panoramaShelfRect.heightMm}
                                preserveAspectRatio="none"
                              />
                              {series.shared.panorama.dimOpacity > 0 && (
                                <rect
                                  x={sx}
                                  y={sy}
                                  width={sw}
                                  height={sh}
                                  fill={`rgba(10, 12, 16, ${series.shared.panorama.dimOpacity})`}
                                />
                              )}
                            </>
                          )}

                        {/* Tactile Spine Cylindrical Lighting */}
                        <rect
                          x={sx}
                          y={sy}
                          width={sw}
                          height={sh}
                          fill="url(#series-spine-sheen)"
                        />

                        {/* Decorative Aligned Spine Bands */}
                        {bookLayout.bandRectsMm.map((band, bIdx) => (
                          <rect
                            key={`band-${bIdx}`}
                            x={padX + band.x}
                            y={padTop + band.y}
                            width={band.width}
                            height={band.height}
                            fill={bookLayout.accentColor}
                          />
                        ))}

                        {/* Shared Spine Ornament */}
                        {ornPath && (
                          <g transform={`translate(${padX} ${padTop})`}>
                            <path d={ornPath} fill={bookLayout.accentColor} />
                          </g>
                        )}

                        {/* Volume Number Badge */}
                        {bookLayout.volumeLabel && (
                          <text
                            x={cx}
                            y={padTop + bookLayout.volumeBadgeYMm}
                            fill={bookLayout.accentColor}
                            fontFamily={fontFamily}
                            fontSize={UnitConverter.pointsToMm(bookLayout.effectiveVolumeBadgeSizePt)}
                            textAnchor="middle"
                            dominantBaseline="central"
                            letterSpacing="0.08em"
                          >
                            {series.shared.volumeNumberStyle === 'roman'
                              ? bookLayout.volumeLabel.toUpperCase()
                              : bookLayout.volumeLabel}
                          </text>
                        )}

                        {/* Spine Title & Author Typography */}
                        {inlineText ? (
                          <text
                            x={cx}
                            y={padTop + bookLayout.titleCenterYMm}
                            fill={bookLayout.textColor}
                            fontFamily={fontFamily}
                            fontSize={UnitConverter.pointsToMm(bookLayout.effectiveTitleSizePt)}
                            textAnchor="middle"
                            dominantBaseline="central"
                            transform={`rotate(${verticalRotDeg} ${cx} ${padTop + bookLayout.titleCenterYMm})`}
                          >
                            {inlineText}
                          </text>
                        ) : (
                          <>
                            {title && (
                              <text
                                x={cx}
                                y={
                                  padTop +
                                  (!isAuthorHorizontal && author
                                    ? bookLayout.shelfYMm + sh * 0.38
                                    : bookLayout.titleCenterYMm)
                                }
                                fill={bookLayout.textColor}
                                fontFamily={fontFamily}
                                fontSize={UnitConverter.pointsToMm(bookLayout.effectiveTitleSizePt)}
                                textAnchor="middle"
                                dominantBaseline="central"
                                transform={`rotate(${verticalRotDeg} ${cx} ${
                                  padTop +
                                  (!isAuthorHorizontal && author
                                    ? bookLayout.shelfYMm + sh * 0.38
                                    : bookLayout.titleCenterYMm)
                                })`}
                              >
                                {title}
                              </text>
                            )}

                            {author && isAuthorHorizontal && (() => {
                              const lines = bookLayout.effectiveAuthorLines;
                              const lineH =
                                UnitConverter.pointsToMm(bookLayout.effectiveAuthorSizePt) * 1.24;
                              const firstY =
                                padTop +
                                bookLayout.authorYMm -
                                ((lines.length - 1) * lineH) / 2;
                              return lines.map((line, lIdx) => (
                                <text
                                  key={`auth-${lIdx}`}
                                  x={cx}
                                  y={firstY + lIdx * lineH}
                                  fill={bookLayout.textColor}
                                  fontFamily={fontFamily}
                                  fontSize={UnitConverter.pointsToMm(
                                    bookLayout.effectiveAuthorSizePt,
                                  )}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  letterSpacing="0.04em"
                                >
                                  {line}
                                </text>
                              ));
                            })()}

                            {author && !isAuthorHorizontal && (
                              <text
                                x={cx}
                                y={padTop + bookLayout.shelfYMm + sh * 0.78}
                                fill={bookLayout.textColor}
                                fontFamily={fontFamily}
                                fontSize={UnitConverter.pointsToMm(bookLayout.effectiveAuthorSizePt)}
                                textAnchor="middle"
                                dominantBaseline="central"
                                transform={`rotate(${verticalRotDeg} ${cx} ${padTop + bookLayout.shelfYMm + sh * 0.78})`}
                              >
                                {author}
                              </text>
                            )}
                          </>
                        )}
                      </g>

                      {/* Spine Perimeter Border & Selection Frame */}
                      <rect
                        x={sx}
                        y={sy}
                        width={sw}
                        height={sh}
                        rx="0.9"
                        fill="none"
                        stroke={isSelected ? '#ef6f54' : 'rgba(245, 239, 228, 0.22)'}
                        strokeWidth={isSelected ? 1.4 : 0.45}
                      />

                      {/* Width & Clamping Callout Underneath Shelf */}
                      <text
                        x={sx + sw / 2}
                        y={padTop + shelfH + shelfThicknessMm + 8.5}
                        fill={isSelected ? '#f6d27e' : 'rgba(243, 236, 221, 0.75)'}
                        fontSize="4.6"
                        fontFamily="ui-monospace, monospace"
                        textAnchor="middle"
                      >
                        {UnitConverter.formatValue(sw, unit)}
                      </text>
                      {bookLayout.isClamped && (
                        <circle
                          cx={sx + sw - 2.6}
                          cy={sy + 2.6}
                          r="1.8"
                          fill="#f59e0b"
                          stroke="#17130d"
                          strokeWidth="0.4"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Toggleable Horizontal Alignment Guides */}
                {showGuides && layout.books.length > 0 && (
                  <g data-testid="series-alignment-guides" pointerEvents="none">
                    {series.shared.bandStyle !== 'none' && (
                      <>
                        <line
                          x1={padX - 10}
                          y1={padTop + layout.guides.headBandYMm}
                          x2={padX + shelfW + 10}
                          y2={padTop + layout.guides.headBandYMm}
                          stroke="rgba(222, 183, 101, 0.65)"
                          strokeWidth="0.45"
                          strokeDasharray="2.2 1.8"
                        />
                        <line
                          x1={padX - 10}
                          y1={padTop + layout.guides.tailBandYMm}
                          x2={padX + shelfW + 10}
                          y2={padTop + layout.guides.tailBandYMm}
                          stroke="rgba(222, 183, 101, 0.65)"
                          strokeWidth="0.45"
                          strokeDasharray="2.2 1.8"
                        />
                      </>
                    )}
                    {series.shared.volumeNumberStyle !== 'none' && (
                      <line
                        x1={padX - 10}
                        y1={padTop + layout.guides.volumeBadgeYMm}
                        x2={padX + shelfW + 10}
                        y2={padTop + layout.guides.volumeBadgeYMm}
                        stroke="rgba(239, 111, 84, 0.55)"
                        strokeWidth="0.4"
                        strokeDasharray="1.5 2"
                      />
                    )}
                    {isAuthorHorizontal && (
                      <line
                        x1={padX - 10}
                        y1={padTop + layout.guides.authorYMm}
                        x2={padX + shelfW + 10}
                        y2={padTop + layout.guides.authorYMm}
                        stroke="rgba(125, 176, 156, 0.65)"
                        strokeWidth="0.4"
                        strokeDasharray="1.8 1.8"
                      />
                    )}
                    <text
                      x={padX - 11}
                      y={padTop + layout.guides.shelfBaselineYMm - 1.2}
                      fill="rgba(222, 183, 101, 0.85)"
                      fontSize="3.8"
                      fontFamily="ui-monospace, monospace"
                      textAnchor="end"
                    >
                      BASE
                    </text>
                  </g>
                )}
              </svg>

              {/* Accessible Native Spine Selector Strip (strictly left-to-right DOM order) */}
              <div
                role="group"
                aria-label="Select a book spine on the shelf"
                className="flex flex-wrap items-center justify-center gap-1.5"
              >
                {layout.books.map((bookLayout) => {
                  const isSelected = selectedLayout?.book.id === bookLayout.book.id;
                  const labelPrefix = bookLayout.volumeLabel
                    ? `${bookLayout.volumeLabel}: `
                    : `#${bookLayout.index + 1}: `;
                  return (
                    <button
                      key={bookLayout.book.id}
                      ref={(el) => {
                        if (el) spineBtnRefs.current.set(bookLayout.book.id, el);
                        else spineBtnRefs.current.delete(bookLayout.book.id);
                      }}
                      type="button"
                      aria-pressed={isSelected}
                      data-testid={`series-spine-btn-${bookLayout.index}`}
                      onClick={() => onSelectBook(bookLayout.book.id)}
                      onKeyDown={(e) => handleSpineKeyDown(e, bookLayout.index)}
                      className={`inline-flex min-h-7 items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-vermilion bg-card text-foreground shadow-xs'
                          : 'border-brass/35 bg-black/35 text-[#f3ecdd] hover:border-brass'
                      }`}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                        style={{ backgroundColor: bookLayout.bgColor }}
                        aria-hidden="true"
                      />
                      <span className="max-w-[130px] truncate">
                        {labelPrefix}
                        {bookLayout.book.title || 'Untitled'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 2.5D Wooden Shelf Showcase View */
            <div
              data-testid="series-25d-shelf"
              className="flex w-full flex-col items-center justify-end py-4"
            >
              <div className="series-25d-scene relative flex flex-col items-center">
                {/* Standing 2.5D Books Row (bottom-aligned on shelf, strict left-to-right DOM order) */}
                <div
                  role="group"
                  aria-label="Books standing on wooden shelf"
                  className="flex items-end justify-center px-6"
                  style={{ gap: `${Math.max(1, layout.shelfGapMm * shelf25dScale)}px` }}
                >
                  {layout.books.map((bookLayout) => {
                    const isSelected = selectedLayout?.book.id === bookLayout.book.id;
                    const pxW = Math.max(24, Math.round(bookLayout.spineWidthMm * shelf25dScale));
                    const pxH = Math.max(140, Math.round(bookLayout.spineHeightMm * shelf25dScale));
                    const ornPath = buildInlineOrnamentPath(
                      bookLayout,
                      series,
                      bookLayout.shelfXMm,
                      bookLayout.shelfYMm,
                    );
                    const title = bookLayout.book.title.trim();
                    const author = bookLayout.book.author.trim();
                    const inlineText =
                      series.shared.titleLayout === 'inline' && !isAuthorHorizontal
                        ? CoverStudioModel.formatInlineSpineText(title, author)
                        : null;

                    return (
                      <button
                        key={bookLayout.book.id}
                        ref={(el) => {
                          if (el) spineBtnRefs.current.set(bookLayout.book.id, el);
                          else spineBtnRefs.current.delete(bookLayout.book.id);
                        }}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`Select ${bookLayout.book.title || `Book ${bookLayout.index + 1}`} (${bookLayout.spineWidthMm.toFixed(1)} mm spine)`}
                        data-testid={`series-25d-book-${bookLayout.index}`}
                        onClick={() => onSelectBook(bookLayout.book.id)}
                        onKeyDown={(e) => handleSpineKeyDown(e, bookLayout.index)}
                        className={`series-25d-book group relative flex flex-col items-stretch border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermilion ${
                          isSelected ? 'series-25d-book-selected' : ''
                        }`}
                        style={{
                          width: `${pxW}px`,
                          height: `${pxH + 10}px`,
                        }}
                      >
                        {/* Top Cream Page-Block Cap (angled 2.5D depth illusion) */}
                        <span
                          aria-hidden="true"
                          className="series-25d-top-pages block w-full shrink-0"
                          style={{
                            height: '10px',
                            backgroundColor: '#ebe3d3',
                            backgroundImage:
                              'linear-gradient(90deg, rgba(60, 44, 24, 0.25), rgba(255, 252, 244, 0.4) 30%, rgba(60, 44, 24, 0.2))',
                            clipPath: 'polygon(4px 0%, calc(100% + 4px) 0%, 100% 100%, 0% 100%)',
                          }}
                        />

                        {/* Rounded Bookcloth Spine Face rendered via crisp local SVG */}
                        <span
                          className="relative block flex-1 overflow-hidden rounded-b-[2px]"
                          style={{
                            width: `${pxW}px`,
                            height: `${pxH}px`,
                            boxShadow: isSelected
                              ? '0 0 0 2px #ef6f54, 4px 10px 18px rgba(0, 0, 0, 0.55)'
                              : '3px 8px 14px rgba(0, 0, 0, 0.48)',
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox={`0 0 ${bookLayout.spineWidthMm} ${bookLayout.spineHeightMm}`}
                            className="h-full w-full"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient
                                id={`shelf25d-light-${bookLayout.book.id}`}
                                x1="0"
                                y1="0"
                                x2="1"
                                y2="0"
                              >
                                <stop offset="0%" stopColor="rgba(0, 0, 0, 0.36)" />
                                <stop offset="16%" stopColor="rgba(255, 255, 255, 0.16)" />
                                <stop offset="46%" stopColor="rgba(255, 255, 255, 0.04)" />
                                <stop offset="82%" stopColor="rgba(0, 0, 0, 0.12)" />
                                <stop offset="100%" stopColor="rgba(0, 0, 0, 0.42)" />
                              </linearGradient>
                            </defs>

                            <rect
                              x={0}
                              y={0}
                              width={bookLayout.spineWidthMm}
                              height={bookLayout.spineHeightMm}
                              fill={bookLayout.bgColor}
                            />

                            {series.shared.panorama.enabled &&
                              series.shared.panorama.dataUrl &&
                              layout.panoramaShelfRect && (
                                <>
                                  <image
                                    href={series.shared.panorama.dataUrl}
                                    x={layout.panoramaShelfRect.xMm - bookLayout.shelfXMm}
                                    y={layout.panoramaShelfRect.yMm - bookLayout.shelfYMm}
                                    width={layout.panoramaShelfRect.widthMm}
                                    height={layout.panoramaShelfRect.heightMm}
                                    preserveAspectRatio="none"
                                  />
                                  {series.shared.panorama.dimOpacity > 0 && (
                                    <rect
                                      x={0}
                                      y={0}
                                      width={bookLayout.spineWidthMm}
                                      height={bookLayout.spineHeightMm}
                                      fill={`rgba(10, 12, 16, ${series.shared.panorama.dimOpacity})`}
                                    />
                                  )}
                                </>
                              )}

                            {/* Spine Cylindrical Lighting */}
                            <rect
                              x={0}
                              y={0}
                              width={bookLayout.spineWidthMm}
                              height={bookLayout.spineHeightMm}
                              fill={`url(#shelf25d-light-${bookLayout.book.id})`}
                            />

                            {/* Bands */}
                            {bookLayout.bandRectsMm.map((band, bIdx) => (
                              <rect
                                key={`b25-${bIdx}`}
                                x={band.x - bookLayout.shelfXMm}
                                y={band.y - bookLayout.shelfYMm}
                                width={band.width}
                                height={band.height}
                                fill={bookLayout.accentColor}
                              />
                            ))}

                            {/* Ornament */}
                            {ornPath && <path d={ornPath} fill={bookLayout.accentColor} />}

                            {/* Volume Badge */}
                            {bookLayout.volumeLabel && (
                              <text
                                x={bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm}
                                y={bookLayout.volumeBadgeYMm - bookLayout.shelfYMm}
                                fill={bookLayout.accentColor}
                                fontFamily={fontFamily}
                                fontSize={UnitConverter.pointsToMm(
                                  bookLayout.effectiveVolumeBadgeSizePt,
                                )}
                                textAnchor="middle"
                                dominantBaseline="central"
                              >
                                {series.shared.volumeNumberStyle === 'roman'
                                  ? bookLayout.volumeLabel.toUpperCase()
                                  : bookLayout.volumeLabel}
                              </text>
                            )}

                            {/* Title & Author */}
                            {inlineText ? (
                              <text
                                x={bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm}
                                y={bookLayout.titleCenterYMm - bookLayout.shelfYMm}
                                fill={bookLayout.textColor}
                                fontFamily={fontFamily}
                                fontSize={UnitConverter.pointsToMm(bookLayout.effectiveTitleSizePt)}
                                textAnchor="middle"
                                dominantBaseline="central"
                                transform={`rotate(${verticalRotDeg} ${bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm} ${bookLayout.titleCenterYMm - bookLayout.shelfYMm})`}
                              >
                                {inlineText}
                              </text>
                            ) : (
                              <>
                                {title && (
                                  <text
                                    x={bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm}
                                    y={
                                      !isAuthorHorizontal && author
                                        ? bookLayout.spineHeightMm * 0.38
                                        : bookLayout.titleCenterYMm - bookLayout.shelfYMm
                                    }
                                    fill={bookLayout.textColor}
                                    fontFamily={fontFamily}
                                    fontSize={UnitConverter.pointsToMm(
                                      bookLayout.effectiveTitleSizePt,
                                    )}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    transform={`rotate(${verticalRotDeg} ${bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm} ${
                                      !isAuthorHorizontal && author
                                        ? bookLayout.spineHeightMm * 0.38
                                        : bookLayout.titleCenterYMm - bookLayout.shelfYMm
                                    })`}
                                  >
                                    {title}
                                  </text>
                                )}
                                {author && isAuthorHorizontal && (() => {
                                  const lines = bookLayout.effectiveAuthorLines;
                                  const lineH =
                                    UnitConverter.pointsToMm(bookLayout.effectiveAuthorSizePt) *
                                    1.24;
                                  const firstY =
                                    bookLayout.authorYMm -
                                    bookLayout.shelfYMm -
                                    ((lines.length - 1) * lineH) / 2;
                                  return lines.map((line, lIdx) => (
                                    <text
                                      key={`a25-${lIdx}`}
                                      x={
                                        bookLayout.spineWidthMm / 2 +
                                        bookLayout.book.opticalNudgeMm
                                      }
                                      y={firstY + lIdx * lineH}
                                      fill={bookLayout.textColor}
                                      fontFamily={fontFamily}
                                      fontSize={UnitConverter.pointsToMm(
                                        bookLayout.effectiveAuthorSizePt,
                                      )}
                                      textAnchor="middle"
                                      dominantBaseline="central"
                                    >
                                      {line}
                                    </text>
                                  ));
                                })()}
                                {author && !isAuthorHorizontal && (
                                  <text
                                    x={bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm}
                                    y={bookLayout.spineHeightMm * 0.78}
                                    fill={bookLayout.textColor}
                                    fontFamily={fontFamily}
                                    fontSize={UnitConverter.pointsToMm(
                                      bookLayout.effectiveAuthorSizePt,
                                    )}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    transform={`rotate(${verticalRotDeg} ${bookLayout.spineWidthMm / 2 + bookLayout.book.opticalNudgeMm} ${bookLayout.spineHeightMm * 0.78})`}
                                  >
                                    {author}
                                  </text>
                                )}
                              </>
                            )}
                          </svg>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Smoked Walnut Shelf Plank */}
                <div
                  aria-hidden="true"
                  className="series-walnut-plank relative h-6 w-[calc(100%+40px)] min-w-[300px] rounded-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected Book Quick Action Bar */}
      {selectedLayout && (
        <div
          data-testid="series-selection-actions"
          className="washi-sheet flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-border px-3.5 py-2.5"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-serif text-sm font-semibold text-foreground">
                {selectedLayout.volumeLabel ? `${selectedLayout.volumeLabel} — ` : ''}
                {selectedLayout.book.title || 'Untitled Volume'}
              </span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {getBindingStyleSpec(selectedLayout.book.parameters.bindingStyle).shortLabel}
              </Badge>
              {selectedLayout.book.linkedProjectId && (
                <Badge variant="brass" className="text-[10px]">
                  Linked to My Books
                </Badge>
              )}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Spine {UnitConverter.formatValue(selectedLayout.spineWidthMm, unit)} ×{' '}
              {UnitConverter.formatValue(selectedLayout.spineHeightMm, unit)} {unit} • Title{' '}
              {selectedLayout.effectiveTitleSizePt} pt
              {selectedLayout.isClamped ? ` (clamped from ${selectedLayout.requestedTitleSizePt} pt)` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={selectedLayout.index === 0}
              aria-label={`Move ${selectedLayout.book.title || 'selected book'} left`}
              data-testid="series-move-left-btn"
              onClick={() => onMoveBook(selectedLayout.book.id, 'left')}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Left</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={selectedLayout.index >= layout.books.length - 1}
              aria-label={`Move ${selectedLayout.book.title || 'selected book'} right`}
              data-testid="series-move-right-btn"
              onClick={() => onMoveBook(selectedLayout.book.id, 'right')}
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Right</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              aria-label={`Duplicate ${selectedLayout.book.title || 'selected book'}`}
              data-testid="series-duplicate-book-btn"
              onClick={() => onDuplicateBook(selectedLayout.book.id)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Duplicate</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              aria-label={`Open ${selectedLayout.book.title || 'selected book'} in Cover Studio`}
              data-testid="series-open-cover-studio-btn"
              onClick={() => onOpenInCoverStudio(selectedLayout)}
            >
              <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
              Open in Cover Studio
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={layout.books.length <= 1}
              aria-label={`Remove ${selectedLayout.book.title || 'selected book'}`}
              data-testid="series-remove-book-btn"
              onClick={() => onRemoveBook(selectedLayout.book.id)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
