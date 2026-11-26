import { ArrowDown, ArrowUp, Layers, Sparkles, Trash2, Type } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CoverStudioState } from '@/types/studio';
import {
  getLayerDisplayMeta,
  resolveOrderedStudioElements,
  type LayerReorderDirection,
  type StudioStackElement,
} from './layerStack';

export interface LayerStackPanelProps {
  readonly studio: CoverStudioState;
  readonly selectedLayerId: string | null;
  readonly selectedTextId: string | null;
  readonly selectedOrnamentId: string | null;
  readonly onSelectElement: (kind: StudioStackElement['kind'], id: string) => void;
  readonly onReorderElement: (id: string, direction: LayerReorderDirection) => void;
  readonly onDeleteElement: (kind: StudioStackElement['kind'], id: string) => void;
}

export function LayerStackPanel({
  studio,
  selectedLayerId,
  selectedTextId,
  selectedOrnamentId,
  onSelectElement,
  onReorderElement,
  onDeleteElement,
}: LayerStackPanelProps) {
  const ordered = resolveOrderedStudioElements(studio);
  const total = ordered.length;
  const topDown = [...ordered].reverse();

  const isElementSelected = (item: StudioStackElement): boolean => {
    if (item.kind === 'image') return item.layer.id === selectedLayerId;
    if (item.kind === 'ornament') return item.layer.id === selectedOrnamentId;
    return item.layer.id === selectedTextId;
  };

  return (
    <div
      id="studio-layer-stack-panel"
      data-testid="layer-stack-panel"
      className="shrink-0 border-b border-border/90 bg-secondary/20 px-2.5 py-2"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Layers className="h-3.5 w-3.5 text-vermilion" aria-hidden="true" />
          All Layers (Front to Back)
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {total === 0 ? 'Empty' : `${total} ${total === 1 ? 'layer' : 'layers'}`}
        </span>
      </div>

      {total === 0 ? (
        <p
          data-testid="layer-stack-empty"
          className="rounded-sm border border-dashed border-border/80 bg-card/40 px-2.5 py-2 text-[11px] text-muted-foreground"
        >
          No cover layers yet. Add an image, ornament, or text to arrange front-to-back order.
        </p>
      ) : (
        <ul
          aria-label="All cover layers front to back"
          data-testid="layer-stack-list"
          className="max-h-52 space-y-1 overflow-y-auto rounded-sm border border-border/80 bg-card/65 p-1"
        >
          {topDown.map((item, revIdx) => {
            const stackIdx = total - 1 - revIdx;
            const meta = getLayerDisplayMeta(item);
            const selected = isElementSelected(item);
            const isTop = stackIdx === total - 1;
            const isBottom = stackIdx === 0;

            return (
              <li
                key={meta.id}
                data-testid={`layer-stack-row-${meta.id}`}
                data-layer-kind={meta.kind}
                data-stack-index={stackIdx}
                className={`flex items-center justify-between gap-1.5 rounded-sm px-1.5 py-1 text-xs transition-colors ${
                  selected
                    ? 'bg-primary/12 text-foreground ring-1 ring-primary/45'
                    : 'hover:bg-accent/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectElement(item.kind, meta.id)}
                  data-testid={`layer-stack-select-${meta.id}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  {meta.kind === 'image' && meta.thumbnailUrl ? (
                    <img
                      src={meta.thumbnailUrl}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded-xs border border-border object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-border bg-secondary/50 text-foreground/85"
                    >
                      {meta.kind === 'ornament' ? (
                        <Sparkles className="h-3 w-3" />
                      ) : (
                        <Type className="h-3 w-3" />
                      )}
                      {meta.swatchColor && (
                        <span
                          className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-background"
                          style={{ backgroundColor: meta.swatchColor }}
                        />
                      )}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium leading-tight">
                      {meta.label}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                      {meta.kindLabel} · {meta.zoneLabel}
                    </span>
                  </span>

                  {meta.isFromSeries && (
                    <Badge
                      variant="brass"
                      data-testid="layer-stack-from-series-badge"
                      className="shrink-0 px-1 py-0 text-[9px] font-semibold"
                    >
                      From Series
                    </Badge>
                  )}
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={isTop}
                    title="Bring forward"
                    aria-label={`Move ${meta.kindLabel} ${meta.label} up`}
                    data-testid={`layer-stack-up-${meta.id}`}
                    onClick={() => onReorderElement(meta.id, 'forward')}
                  >
                    <ArrowUp className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={isBottom}
                    title="Send backward"
                    aria-label={`Move ${meta.kindLabel} ${meta.label} down`}
                    data-testid={`layer-stack-down-${meta.id}`}
                    onClick={() => onReorderElement(meta.id, 'backward')}
                  >
                    <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    title="Delete layer"
                    aria-label={`Delete ${meta.kindLabel} ${meta.label}`}
                    data-testid={`layer-stack-delete-${meta.id}`}
                    onClick={() => onDeleteElement(item.kind, meta.id)}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
