import {
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  PinOff,
  RotateCw,
  Sparkles,
  Trash2,
  Type,
  Unlink,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { FOIL_SWATCHES } from '@/resources/palettes';
import {
  isFrameLikeOrnament,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import {
  describeLayoutConstraint,
  hasActiveLayoutConstraint,
  type LayerLayoutConstraint,
} from '@/types/layoutConstraints';
import {
  isSeriesOriginLayer,
  normalizeQuarterTurn,
  type CoverImageLayer,
} from '@/types/studioLayer';
import { getClassicOrnamentSpec } from './classicOrnaments';
import { verticalSlotToPinKind } from './layoutConstraints';

export type VerticalAlignSlot = 'upper' | 'center' | 'lower';

export type CanvasSelectionTarget =
  | { readonly kind: 'text'; readonly layer: CoverTextLayer }
  | { readonly kind: 'ornament'; readonly layer: CoverOrnamentLayer }
  | { readonly kind: 'image'; readonly layer: CoverImageLayer };

export interface CanvasSelectionBarProps {
  readonly selection: CanvasSelectionTarget | null;
  readonly controlsId?: string;
  readonly onFlipH: () => void;
  readonly onFlipV: () => void;
  readonly onRotate90: () => void;
  readonly onQuickAlign: (slot: VerticalAlignSlot) => void;
  readonly onFitMargin?: (marginMm: number) => void;
  readonly onDetachConstraint?: () => void;
  readonly onDetachSeriesLayer?: () => void;
  readonly onChangeColor?: (hex: string) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onDeselect: () => void;
}

const ALIGN_SLOTS: readonly {
  readonly slot: VerticalAlignSlot;
  readonly label: string;
  readonly title: string;
}[] = [
  { slot: 'upper', label: 'Top ⅓', title: 'Align horizontally centered in upper third of zone' },
  { slot: 'center', label: 'Center', title: 'Center horizontally and vertically in zone' },
  { slot: 'lower', label: 'Bottom ⅓', title: 'Align horizontally centered in lower third of zone' },
];

const FRAME_MARGIN_PRESETS: readonly {
  readonly marginMm: number;
  readonly label: string;
  readonly title: string;
}[] = [
  { marginMm: 6, label: '6 mm', title: 'Fit frame inside board with tight 6 mm margin' },
  { marginMm: 12, label: '12 mm', title: 'Fit frame inside board with classic 12 mm margin' },
  { marginMm: 18, label: '18 mm', title: 'Fit frame inside board with wide 18 mm margin' },
];

function isFrameLikeSelection(selection: CanvasSelectionTarget): boolean {
  return selection.kind === 'ornament' && isFrameLikeOrnament(selection.layer);
}

function isMarginPresetPinned(
  constraint: LayerLayoutConstraint | undefined,
  marginMm: number,
): boolean {
  return (
    constraint?.horizontal?.kind === 'inset-both' &&
    constraint?.vertical?.kind === 'inset-both' &&
    Math.abs(constraint.horizontal.marginMm - marginMm) < 0.05 &&
    Math.abs(constraint.vertical.marginMm - marginMm) < 0.05
  );
}

function isAlignSlotPinned(
  constraint: LayerLayoutConstraint | undefined,
  slot: VerticalAlignSlot,
): boolean {
  if (!constraint) return false;
  if (constraint.imageFit && constraint.imageFit !== 'free') return false;
  return (
    constraint.horizontal?.kind === 'center' &&
    constraint.vertical?.kind === verticalSlotToPinKind(slot)
  );
}

const ACTION_BTN_CLASS =
  'inline-flex min-h-6.5 min-w-6.5 cursor-pointer items-center justify-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] font-medium leading-none whitespace-nowrap text-[#f6efe2]/90 motion-safe:transition-colors hover:bg-[#f6efe2]/12 hover:text-white aria-pressed:border-brass-bright/70 aria-pressed:bg-brass-bright aria-pressed:font-semibold aria-pressed:text-[#19140a] aria-pressed:hover:bg-brass-bright aria-pressed:hover:text-[#19140a] [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10';

const SEPARATOR_CLASS = 'inline-block h-4 w-px border-s border-[#f6efe2]/22';

function describeSelection(selection: CanvasSelectionTarget): {
  readonly kindLabel: string;
  readonly snippet: string;
} {
  if (selection.kind === 'text') {
    const firstLine = selection.layer.text.split(/\r?\n/)[0]?.trim() || 'Empty text';
    return { kindLabel: 'Text', snippet: firstLine };
  }
  if (selection.kind === 'ornament') {
    const label =
      selection.layer.presetId === 'custom-svg' && selection.layer.customSvgName
        ? selection.layer.customSvgName
        : getClassicOrnamentSpec(selection.layer.presetId).label;
    return { kindLabel: 'Ornament', snippet: label };
  }
  return { kindLabel: 'Image', snippet: selection.layer.fileName };
}

/**
 * Docked contextual toolbar pinned along the top rim of the Cover Studio cutting mat.
 * Follows modern-web-guidance (`toolbar`):
 * - Uses native `focusgroup="toolbar wrap"` with a roving-tabindex fallback when unsupported.
 * - Uses real `<button type="button">`, with `aria-pressed` strictly on stateful toggles
 *   (pin alignment slots, frame margin presets, `Flip H`, `Flip V`) and never on one-shot
 *   action buttons (`Unpin`, `90°`, `Duplicate`, `Delete`, `Deselect`).
 */
export function CanvasSelectionBar({
  selection,
  controlsId,
  onFlipH,
  onFlipV,
  onRotate90,
  onQuickAlign,
  onFitMargin,
  onDetachConstraint,
  onDetachSeriesLayer,
  onChangeColor,
  onDuplicate,
  onDelete,
  onDeselect,
}: CanvasSelectionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const selectionKind = selection?.kind ?? null;
  const selectionId = selection?.layer.id ?? null;
  const constraint = selection?.layer.layoutConstraint;
  const isPinned = hasActiveLayoutConstraint(constraint);
  const showUnpin = Boolean(isPinned && onDetachConstraint);
  const fromSeries = selection ? isSeriesOriginLayer(selection.layer) : false;
  const showDetachSeries = Boolean(fromSeries && onDetachSeriesLayer);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !selectionId) return;
    if ('focusGroup' in HTMLElement.prototype) return;

    const getItems = () =>
      Array.from(
        bar.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input[type="color"]:not([disabled])',
        ),
      );

    const items = getItems();
    const tabbableCount = items.filter((el) => el.tabIndex === 0).length;
    if (items.length > 0 && tabbableCount !== 1) {
      const activeEl =
        document.activeElement instanceof HTMLElement && items.includes(document.activeElement)
          ? document.activeElement
          : items[0];
      items.forEach((el) => {
        el.tabIndex = el === activeEl ? 0 : -1;
      });
    }

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      const currentItems = getItems();
      if (!(target instanceof HTMLElement) || !currentItems.includes(target)) return;
      currentItems.forEach((el) => {
        el.tabIndex = el === target ? 0 : -1;
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const currentItems = getItems();
      if (currentItems.length === 0) return;
      const activeIdx = currentItems.indexOf(document.activeElement as HTMLElement);
      if (activeIdx === -1) return;

      const rtl = getComputedStyle(bar).direction === 'rtl';
      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight') {
        nextIdx = (activeIdx + (rtl ? -1 : 1) + currentItems.length) % currentItems.length;
      } else if (e.key === 'ArrowLeft') {
        nextIdx = (activeIdx + (rtl ? 1 : -1) + currentItems.length) % currentItems.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = currentItems.length - 1;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        currentItems.forEach((el, idx) => {
          el.tabIndex = idx === nextIdx ? 0 : -1;
        });
        currentItems[nextIdx].focus();
      }
    };

    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [selectionKind, selectionId, showUnpin, showDetachSeries]);

  if (!selection) {
    return null;
  }

  const { kindLabel, snippet } = describeSelection(selection);
  const flipX = Boolean(selection.layer.flipX);
  const flipY = Boolean(selection.layer.flipY);
  const rotDeg = normalizeQuarterTurn(selection.layer.rotationDeg);
  const activeColor =
    selection.kind === 'text' || selection.kind === 'ornament' ? selection.layer.color : null;
  const constraintSummary = describeLayoutConstraint(constraint);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Selected element quick controls"
      aria-controls={controlsId}
      data-testid="canvas-selection-bar"
      data-selection-kind={selection.kind}
      {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-x-0 top-0 z-20 flex w-full shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-brass-bright/30 bg-[#12211d]/95 px-3 py-1.5 text-xs text-[#f6efe2] shadow-sm backdrop-blur-md"
    >
      {/* Active Element Badge */}
      <div className="flex min-w-0 items-center gap-1.5" data-testid="selection-element-badge">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brass-bright/45 bg-brass-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-bright">
          {selection.kind === 'text' ? (
            <Type className="h-3 w-3" aria-hidden="true" />
          ) : selection.kind === 'ornament' ? (
            <Sparkles className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-3 w-3" aria-hidden="true" />
          )}
          {kindLabel}
        </span>
        <span
          className="max-w-[130px] truncate text-[11px] font-medium text-[#f6efe2]/90"
          title={snippet}
        >
          {snippet}
        </span>
        {fromSeries && (
          <span
            data-testid="layer-from-series-badge"
            className="inline-flex shrink-0 items-center rounded-full border border-brass-bright/55 bg-brass-bright/20 px-2 py-0.5 text-[10px] font-semibold text-brass-bright"
          >
            From Series
          </span>
        )}
      </div>

      {/* Contextual Controls Row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Contextual Placement Group: Board Margin Fit for Frames/Corners, Thirds for everything else */}
        {isFrameLikeSelection(selection) && onFitMargin ? (
          <div
            role="group"
            aria-label="Frame margin fit"
            className="inline-flex items-center gap-0.5 rounded-md border border-[#f6efe2]/14 bg-white/[0.04] p-0.5"
          >
            {FRAME_MARGIN_PRESETS.map(({ marginMm, label, title }) => {
              const pinned = isMarginPresetPinned(constraint, marginMm);
              return (
                <button
                  key={marginMm}
                  type="button"
                  aria-pressed={pinned}
                  title={pinned ? `Pinned (${label} margin) — click to unpin` : title}
                  data-testid={`selection-margin-${marginMm}`}
                  onClick={() =>
                    pinned && onDetachConstraint ? onDetachConstraint() : onFitMargin(marginMm)
                  }
                  className={ACTION_BTN_CLASS}
                >
                  {label}
                </button>
              );
            })}
            {(() => {
              const centerPinned = isAlignSlotPinned(constraint, 'center');
              return (
                <button
                  type="button"
                  aria-pressed={centerPinned}
                  title={
                    centerPinned
                      ? 'Pinned (Center) — click to unpin'
                      : 'Pin horizontally and vertically centered in zone'
                  }
                  data-testid="selection-align-center"
                  onClick={() =>
                    centerPinned && onDetachConstraint
                      ? onDetachConstraint()
                      : onQuickAlign('center')
                  }
                  className={ACTION_BTN_CLASS}
                >
                  Center
                </button>
              );
            })()}
          </div>
        ) : (
          <div
            role="group"
            aria-label="Vertical alignment"
            className="inline-flex items-center gap-0.5 rounded-md border border-[#f6efe2]/14 bg-white/[0.04] p-0.5"
          >
            {ALIGN_SLOTS.map(({ slot, label, title }) => {
              const pinned = isAlignSlotPinned(constraint, slot);
              return (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={pinned}
                  title={pinned ? `Pinned (${label}) — click to unpin` : title}
                  data-testid={`selection-align-${slot}`}
                  onClick={() =>
                    pinned && onDetachConstraint ? onDetachConstraint() : onQuickAlign(slot)
                  }
                  className={ACTION_BTN_CLASS}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {showUnpin && onDetachConstraint && (
          <button
            type="button"
            title={
              constraintSummary
                ? `Unpin (${constraintSummary}) — keep current position`
                : 'Unpin layout condition — keep current position'
            }
            aria-label="Unpin layout condition"
            data-testid="selection-bar-unpin-btn"
            onClick={onDetachConstraint}
            className="inline-flex min-h-6.5 min-w-6.5 cursor-pointer items-center justify-center gap-1 rounded-md border border-brass-bright/45 bg-brass-bright/12 px-2 py-1 text-[11px] font-medium leading-none whitespace-nowrap text-brass-bright motion-safe:transition-colors hover:bg-brass-bright/22 hover:text-white [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
          >
            <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
            Unpin
          </button>
        )}

        <span role="separator" aria-orientation="vertical" className={SEPARATOR_CLASS} />

        {/* Transform Group */}
        <div
          role="group"
          aria-label="Transform element"
          className="inline-flex items-center gap-0.5"
        >
          <button
            type="button"
            aria-pressed={flipX}
            title="Flip horizontally"
            data-testid="selection-flip-h"
            onClick={onFlipH}
            className={ACTION_BTN_CLASS}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
            Flip H
          </button>
          <button
            type="button"
            aria-pressed={flipY}
            title="Flip vertically"
            data-testid="selection-flip-v"
            onClick={onFlipV}
            className={ACTION_BTN_CLASS}
          >
            <FlipVertical2 className="h-3.5 w-3.5" aria-hidden="true" />
            Flip V
          </button>
          <button
            type="button"
            aria-label="Rotate 90° clockwise"
            title="Rotate 90° clockwise"
            data-rotation={rotDeg}
            data-testid="selection-rotate-90"
            onClick={onRotate90}
            className={ACTION_BTN_CLASS}
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            90°
          </button>
        </div>

        {/* Foil & Ink Color Group (Text & Ornaments only) */}
        {activeColor !== null && onChangeColor && (
          <>
            <span role="separator" aria-orientation="vertical" className={SEPARATOR_CLASS} />
            <div
              role="group"
              aria-label="Foil and ink color"
              className="inline-flex items-center gap-0.5"
            >
              {FOIL_SWATCHES.map((swatch) => {
                const isActive = swatch.hex.toLowerCase() === activeColor.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.label}
                    aria-label={`Set color to ${swatch.label}`}
                    data-testid={`selection-swatch-${swatch.hex.slice(1).toLowerCase()}`}
                    onClick={() => onChangeColor(swatch.hex)}
                    className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-full motion-safe:transition-transform hover:scale-110 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-4 w-4 rounded-full border ${
                        isActive
                          ? 'border-white ring-2 ring-brass-bright ring-offset-1 ring-offset-[#12211d]'
                          : 'border-[#f6efe2]/35'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  </button>
                );
              })}
              <input
                type="color"
                value={activeColor}
                aria-label="Custom foil or ink color"
                title="Custom color"
                data-testid="selection-color-input"
                onChange={(e) => onChangeColor(e.target.value)}
                className="ml-0.5 min-h-6 min-w-7 cursor-pointer rounded border border-[#f6efe2]/30 bg-transparent p-0.5"
              />
            </div>
          </>
        )}

        <span role="separator" aria-orientation="vertical" className={SEPARATOR_CLASS} />

        {/* Element Action Group */}
        <div role="group" aria-label="Element actions" className="inline-flex items-center gap-0.5">
          <button
            type="button"
            title="Duplicate selected element (Cmd/Ctrl+D)"
            data-testid="selection-duplicate-btn"
            onClick={onDuplicate}
            className={ACTION_BTN_CLASS}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Duplicate
          </button>
          {showDetachSeries && onDetachSeriesLayer && (
            <button
              type="button"
              title="Detach from Series Spines so future series syncs keep your tweaks"
              aria-label="Detach layer from Series Spines"
              data-testid="selection-detach-series-btn"
              onClick={onDetachSeriesLayer}
              className="inline-flex min-h-6.5 min-w-6.5 cursor-pointer items-center justify-center gap-1 rounded-md border border-brass-bright/45 bg-brass-bright/12 px-2 py-1 text-[11px] font-medium leading-none whitespace-nowrap text-brass-bright motion-safe:transition-colors hover:bg-brass-bright/22 hover:text-white [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
            >
              <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
              Detach
            </button>
          )}
          <button
            type="button"
            title="Delete selected element"
            data-testid="selection-delete-btn"
            onClick={onDelete}
            className="inline-flex min-h-6.5 min-w-6.5 cursor-pointer items-center justify-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] font-medium leading-none whitespace-nowrap text-[#f8a08e] motion-safe:transition-colors hover:bg-red-500/20 hover:text-[#ffd2c8] [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
          <button
            type="button"
            aria-label="Deselect element"
            title="Deselect"
            data-testid="selection-deselect-btn"
            onClick={onDeselect}
            className="inline-flex min-h-6.5 min-w-6.5 cursor-pointer items-center justify-center rounded-md border border-transparent text-[#f6efe2]/70 motion-safe:transition-colors hover:bg-[#f6efe2]/12 hover:text-white [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
