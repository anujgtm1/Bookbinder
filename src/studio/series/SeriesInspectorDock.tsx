import {
  BookOpen,
  Image as ImageIcon,
  Library,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { SeriesBookLayout, SeriesShelfLayout } from '@/core/seriesSpines';
import { loadHtmlImage } from '@/lib/canvasImage';
import { BINDING_STYLES } from '@/resources/paperSpecs';
import {
  SAMPLE_PANORAMA_NATURAL_HEIGHT,
  SAMPLE_PANORAMA_NATURAL_WIDTH,
  SERIES_ALIGNMENT_ANCHOR_OPTIONS,
  SERIES_BAND_OPTIONS,
  SERIES_ORNAMENT_OPTIONS,
  SERIES_PALETTE_PRESETS,
  SERIES_VOLUME_STYLE_OPTIONS,
  createSamplePanoramaDataUrl,
  type SeriesPalettePreset,
} from '@/resources/seriesPresets';
import { CURATED_FONTS, type CustomFontAsset } from '@/studio/fonts';
import { BookParametersModel, type BindingStyle } from '@/types/bookParams';
import {
  DEFAULT_SERIES_PANORAMA,
  SERIES_BOUNDS,
  type SeriesAlignmentAnchor,
  type SeriesBandStyle,
  type SeriesBookEntry,
  type SeriesBookId,
  type SeriesOrnamentId,
  type SeriesPanoramaConfig,
  type SeriesProject,
  type SeriesSharedDesign,
  type SeriesVolumeNumberStyle,
} from '@/types/seriesSpines';
import type { StudioFontId } from '@/types/studio';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export type InspectorTab = 'books' | 'style' | 'panorama';

export interface SeriesInspectorDockProps {
  readonly series: SeriesProject;
  readonly layout: SeriesShelfLayout;
  readonly selectedBookId: SeriesBookId | null;
  readonly unit: UnitSystem;
  readonly customFont: CustomFontAsset | null;
  readonly onSelectBook: (id: SeriesBookId) => void;
  readonly onAddBook: () => void;
  readonly onOpenImportLibrary: () => void;
  readonly onUpdateBook: (
    id: SeriesBookId,
    updater: (book: SeriesBookEntry) => SeriesBookEntry,
  ) => void;
  readonly onUpdateShared: (patch: Partial<SeriesSharedDesign>) => void;
  readonly onUpdatePanorama: (patch: Partial<SeriesPanoramaConfig>) => void;
  readonly onApplyPalette: (preset: SeriesPalettePreset) => void;
  readonly onStatusMessage: (message: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not decode image file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function SeriesInspectorDock({
  series,
  layout,
  selectedBookId,
  unit,
  customFont,
  onSelectBook,
  onAddBook,
  onOpenImportLibrary,
  onUpdateBook,
  onUpdateShared,
  onUpdatePanorama,
  onApplyPalette,
  onStatusMessage,
}: SeriesInspectorDockProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('books');
  const booksTabId = useId();
  const styleTabId = useId();
  const panoTabId = useId();
  const booksTabRef = useRef<HTMLButtonElement>(null);
  const styleTabRef = useRef<HTMLButtonElement>(null);
  const panoTabRef = useRef<HTMLButtonElement>(null);
  const panoFileInputRef = useRef<HTMLInputElement>(null);

  const selectedLayout: SeriesBookLayout | null =
    layout.books.find((b) => b.book.id === selectedBookId) ?? layout.books[0] ?? null;
  const selectedBook = selectedLayout?.book ?? null;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs: readonly InspectorTab[] = ['books', 'style', 'panorama'];
    const refs = [booksTabRef, styleTabRef, panoTabRef] as const;
    const idx = tabs.indexOf(activeTab);
    let nextIdx = idx;
    if (event.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabs[nextIdx]);
    refs[nextIdx].current?.focus();
  };

  const handlePanoramaUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadHtmlImage(dataUrl, 'Could not load panoramic artwork image.');
      onUpdatePanorama({
        enabled: true,
        dataUrl,
        fileName: file.name,
        naturalWidth: img.naturalWidth || 1800,
        naturalHeight: img.naturalHeight || 600,
        offsetXMm: 0,
        offsetYMm: 0,
        scale: 1,
      });
      onStatusMessage(`Loaded panorama "${file.name}" across ${series.books.length} spines`);
    } catch {
      onStatusMessage('Could not load selected panorama image.');
    }
  };

  const handleLoadSamplePanorama = () => {
    const dataUrl = createSamplePanoramaDataUrl();
    onUpdatePanorama({
      enabled: true,
      dataUrl,
      fileName: 'celestial-peaks-panorama.svg',
      naturalWidth: SAMPLE_PANORAMA_NATURAL_WIDTH,
      naturalHeight: SAMPLE_PANORAMA_NATURAL_HEIGHT,
      fitMode: 'cover',
      offsetXMm: 0,
      offsetYMm: 0,
      scale: 1,
      dimOpacity: 0.24,
    });
    onStatusMessage('Loaded sample celestial peaks panorama across all spines');
  };

  const activeTabId =
    activeTab === 'books' ? booksTabId : activeTab === 'style' ? styleTabId : panoTabId;

  return (
    <aside
      aria-label="Series Spines Inspector"
      className="washi-sheet flex min-w-0 flex-col overflow-hidden rounded-md border border-border"
    >
      {/* 3-Tab Inspector Switcher */}
      <div
        role="tablist"
        aria-label="Inspector sections"
        onKeyDown={handleTabKeyDown}
        {...({ focusgroup: 'tablist nomemory' } as Record<string, string>)}
        className="flex flex-nowrap gap-1 border-b border-border bg-secondary/45 p-1.5"
      >
        <button
          ref={booksTabRef}
          type="button"
          role="tab"
          id={booksTabId}
          aria-selected={activeTab === 'books'}
          tabIndex={activeTab === 'books' ? 0 : -1}
          data-testid="series-tab-books"
          onClick={() => setActiveTab('books')}
          {...(activeTab === 'books' ? { focusgroupstart: '' } : {})}
          className="cricut-mode-tab"
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Books ({series.books.length})</span>
        </button>
        <button
          ref={styleTabRef}
          type="button"
          role="tab"
          id={styleTabId}
          aria-selected={activeTab === 'style'}
          tabIndex={activeTab === 'style' ? 0 : -1}
          data-testid="series-tab-style"
          onClick={() => setActiveTab('style')}
          {...(activeTab === 'style' ? { focusgroupstart: '' } : {})}
          className="cricut-mode-tab"
        >
          <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Style</span>
        </button>
        <button
          ref={panoTabRef}
          type="button"
          role="tab"
          id={panoTabId}
          aria-selected={activeTab === 'panorama'}
          tabIndex={activeTab === 'panorama' ? 0 : -1}
          data-testid="series-tab-panorama"
          onClick={() => setActiveTab('panorama')}
          {...(activeTab === 'panorama' ? { focusgroupstart: '' } : {})}
          className="cricut-mode-tab"
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Panorama</span>
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div
        role="tabpanel"
        aria-labelledby={activeTabId}
        className="max-h-[640px] flex-1 overflow-y-auto p-3.5"
        style={{ scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}
      >
        {activeTab === 'books' && (
          <div className="space-y-4">
            {/* Shelf Book Roster */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Books on Shelf
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    disabled={series.books.length >= SERIES_BOUNDS.maxBooks}
                    data-testid="series-add-book-btn"
                    onClick={onAddBook}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Add Book
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    data-testid="series-import-books-btn"
                    onClick={onOpenImportLibrary}
                  >
                    <Library className="h-3 w-3" aria-hidden="true" />
                    Import
                  </Button>
                </div>
              </div>

              <ol
                data-testid="series-book-roster"
                className="max-h-40 space-y-1 overflow-y-auto pr-0.5"
              >
                {layout.books.map((bl) => {
                  const isSel = selectedBook?.id === bl.book.id;
                  return (
                    <li key={bl.book.id}>
                      <button
                        type="button"
                        aria-current={isSel ? 'true' : undefined}
                        data-testid={`series-roster-item-${bl.index}`}
                        onClick={() => onSelectBook(bl.book.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          isSel
                            ? 'border-vermilion bg-secondary/60 font-medium text-foreground'
                            : 'border-border/80 bg-card/60 text-foreground hover:border-brass/70'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-xs border border-black/25"
                            style={{ backgroundColor: bl.bgColor }}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {bl.volumeLabel ? `${bl.volumeLabel}. ` : `${bl.index + 1}. `}
                            {bl.book.title || 'Untitled'}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {UnitConverter.formatValue(bl.book.parameters.pbThicknessMm, unit)}×
                          {UnitConverter.formatValue(bl.book.parameters.pbHeightMm, unit)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Selected Book Inline Editor */}
            {selectedBook && selectedLayout && (
              <div className="kettle-stitch-divider space-y-3 pt-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-sm font-semibold text-foreground">
                    Selected Book #{selectedLayout.index + 1}
                  </h3>
                  {selectedBook.linkedProjectId && (
                    <Badge variant="brass" className="text-[10px]">
                      Linked
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="series-book-title">Title</Label>
                  <Input
                    id="series-book-title"
                    data-testid="series-book-title-input"
                    value={selectedBook.title}
                    onChange={(e) =>
                      onUpdateBook(selectedBook.id, (b) => ({ ...b, title: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="series-book-author">Author</Label>
                    <Input
                      id="series-book-author"
                      data-testid="series-book-author-input"
                      value={selectedBook.author}
                      onChange={(e) =>
                        onUpdateBook(selectedBook.id, (b) => ({ ...b, author: e.target.value }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="series-book-vol-override">Badge Override</Label>
                    <Input
                      id="series-book-vol-override"
                      data-testid="series-book-vol-override-input"
                      placeholder={selectedLayout.volumeLabel || 'Auto'}
                      value={selectedBook.volumeLabelOverride}
                      onChange={(e) =>
                        onUpdateBook(selectedBook.id, (b) => ({
                          ...b,
                          volumeLabelOverride: e.target.value,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Physical Dimensions (mm) */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="series-book-thickness" className="text-[11px]">
                      Thickness (mm)
                    </Label>
                    <Input
                      id="series-book-thickness"
                      data-testid="series-book-thickness-input"
                      type="number"
                      min={4}
                      max={120}
                      step={1}
                      value={selectedBook.parameters.pbThicknessMm}
                      onChange={(e) => {
                        const val = Number.parseFloat(e.target.value);
                        if (!Number.isFinite(val)) return;
                        onUpdateBook(selectedBook.id, (b) => ({
                          ...b,
                          parameters: BookParametersModel.clampAndNormalize({
                            ...b.parameters,
                            pbThicknessMm: val,
                          }),
                        }));
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="series-book-height" className="text-[11px]">
                      Height (mm)
                    </Label>
                    <Input
                      id="series-book-height"
                      data-testid="series-book-height-input"
                      type="number"
                      min={80}
                      max={450}
                      step={1}
                      value={selectedBook.parameters.pbHeightMm}
                      onChange={(e) => {
                        const val = Number.parseFloat(e.target.value);
                        if (!Number.isFinite(val)) return;
                        onUpdateBook(selectedBook.id, (b) => ({
                          ...b,
                          parameters: BookParametersModel.clampAndNormalize({
                            ...b.parameters,
                            pbHeightMm: val,
                          }),
                        }));
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="series-book-width" className="text-[11px]">
                      Width (mm)
                    </Label>
                    <Input
                      id="series-book-width"
                      data-testid="series-book-width-input"
                      type="number"
                      min={60}
                      max={350}
                      step={1}
                      value={selectedBook.parameters.pbWidthMm}
                      onChange={(e) => {
                        const val = Number.parseFloat(e.target.value);
                        if (!Number.isFinite(val)) return;
                        onUpdateBook(selectedBook.id, (b) => ({
                          ...b,
                          parameters: BookParametersModel.clampAndNormalize({
                            ...b.parameters,
                            pbWidthMm: val,
                          }),
                        }));
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Binding Style */}
                <div className="space-y-1.5">
                  <Label htmlFor="series-book-binding">Binding Style</Label>
                  <select
                    id="series-book-binding"
                    data-testid="series-book-binding-select"
                    value={selectedBook.parameters.bindingStyle}
                    onChange={(e) =>
                      onUpdateBook(selectedBook.id, (b) => ({
                        ...b,
                        parameters: BookParametersModel.clampAndNormalize({
                          ...b.parameters,
                          bindingStyle: e.target.value as BindingStyle,
                        }),
                      }))
                    }
                    className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                  >
                    {BINDING_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Per-Book Color Overrides */}
                <div className="space-y-2 rounded-md border border-border/80 bg-secondary/20 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-foreground">
                      Book Color Overrides
                    </span>
                    {(selectedBook.spineBgColorOverride ||
                      selectedBook.textColorOverride ||
                      selectedBook.accentColorOverride) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-1.5 text-[10px]"
                        onClick={() =>
                          onUpdateBook(selectedBook.id, (b) => ({
                            ...b,
                            spineBgColorOverride: null,
                            textColorOverride: null,
                            accentColorOverride: null,
                          }))
                        }
                      >
                        <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                        Reset
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Cloth
                      <input
                        type="color"
                        aria-label="Book spine cloth color"
                        value={selectedLayout.bgColor}
                        onChange={(e) =>
                          onUpdateBook(selectedBook.id, (b) => ({
                            ...b,
                            spineBgColorOverride: e.target.value,
                          }))
                        }
                        className="h-7 w-full cursor-pointer rounded border border-input bg-transparent p-0.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Text
                      <input
                        type="color"
                        aria-label="Book spine text color"
                        value={selectedLayout.textColor}
                        onChange={(e) =>
                          onUpdateBook(selectedBook.id, (b) => ({
                            ...b,
                            textColorOverride: e.target.value,
                          }))
                        }
                        className="h-7 w-full cursor-pointer rounded border border-input bg-transparent p-0.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Accent
                      <input
                        type="color"
                        aria-label="Book spine accent foil color"
                        value={selectedLayout.accentColor}
                        onChange={(e) =>
                          onUpdateBook(selectedBook.id, (b) => ({
                            ...b,
                            accentColorOverride: e.target.value,
                          }))
                        }
                        className="h-7 w-full cursor-pointer rounded border border-input bg-transparent p-0.5"
                      />
                    </label>
                  </div>
                </div>

                {/* Optical Nudge */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label htmlFor="series-book-nudge">Optical Center Nudge</Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {selectedBook.opticalNudgeMm >= 0 ? '+' : ''}
                      {selectedBook.opticalNudgeMm.toFixed(1)} mm
                    </span>
                  </div>
                  <Slider
                    id="series-book-nudge"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={[selectedBook.opticalNudgeMm]}
                    onValueChange={([v]) =>
                      onUpdateBook(selectedBook.id, (b) => ({
                        ...b,
                        opticalNudgeMm: roundTo(v, 1),
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Curated Palette Presets */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Curated Bookcloth Palettes
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {SERIES_PALETTE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`series-palette-${preset.id}`}
                    onClick={() => onApplyPalette(preset)}
                    className="flex flex-col gap-1.5 rounded border border-border bg-card/80 p-2 text-left transition-colors hover:border-brass"
                  >
                    <div className="flex items-center gap-1">
                      {(preset.perBookBgColors ?? [preset.defaultBgColor]).slice(0, 5).map((hex, i) => (
                        <span
                          key={`${preset.id}-${i}`}
                          className="h-3 flex-1 rounded-xs border border-black/20"
                          style={{ backgroundColor: hex }}
                          aria-hidden="true"
                        />
                      ))}
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                        style={{ backgroundColor: preset.accentColor }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-[11px] font-medium leading-tight text-foreground">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Series Base Colors */}
            <div className="kettle-stitch-divider grid grid-cols-3 gap-2 pt-3">
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Default Cloth
                <input
                  type="color"
                  aria-label="Default series cloth color"
                  value={series.shared.defaultBgColor}
                  onChange={(e) => onUpdateShared({ defaultBgColor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Lettering
                <input
                  type="color"
                  aria-label="Default series lettering color"
                  value={series.shared.defaultTextColor}
                  onChange={(e) => onUpdateShared({ defaultTextColor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Bands &amp; Foil
                <input
                  type="color"
                  aria-label="Default series accent foil color"
                  value={series.shared.accentColor}
                  onChange={(e) => onUpdateShared({ accentColor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
              </label>
            </div>

            {/* Shared Typography */}
            <div className="kettle-stitch-divider space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="series-font-select">Typography</Label>
                <select
                  id="series-font-select"
                  data-testid="series-font-select"
                  value={series.shared.fontId}
                  onChange={(e) => onUpdateShared({ fontId: e.target.value as StudioFontId })}
                  className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                >
                  {CURATED_FONTS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                  {customFont && (
                    <option value="custom">Custom: {customFont.fileName}</option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Label htmlFor="series-title-size">Title Size</Label>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {series.shared.titleSizePt} pt
                  </span>
                </div>
                <Slider
                  id="series-title-size"
                  min={SERIES_BOUNDS.titleSizePt.min}
                  max={36}
                  step={0.5}
                  value={[series.shared.titleSizePt]}
                  onValueChange={([v]) => onUpdateShared({ titleSizePt: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="series-orientation-select" className="text-[11px]">
                    Spine Direction
                  </Label>
                  <select
                    id="series-orientation-select"
                    value={series.shared.orientation}
                    onChange={(e) =>
                      onUpdateShared({
                        orientation:
                          e.target.value === 'bottom-to-top' ? 'bottom-to-top' : 'top-to-bottom',
                      })
                    }
                    className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs text-foreground"
                  >
                    <option value="top-to-bottom">Top → Bottom (US/UK)</option>
                    <option value="bottom-to-top">Bottom → Top (EU)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="series-author-orient-select" className="text-[11px]">
                    Author Layout
                  </Label>
                  <select
                    id="series-author-orient-select"
                    value={series.shared.authorOrientation}
                    onChange={(e) =>
                      onUpdateShared({
                        authorOrientation:
                          e.target.value === 'vertical' ? 'vertical' : 'horizontal',
                      })
                    }
                    className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs text-foreground"
                  >
                    <option value="horizontal">Horizontal Tail Block</option>
                    <option value="vertical">Vertical Along Spine</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Alignment Anchor & Volume Numbering */}
            <div className="kettle-stitch-divider space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="series-alignment-anchor">Alignment Anchor</Label>
                <select
                  id="series-alignment-anchor"
                  data-testid="series-alignment-anchor-select"
                  value={series.shared.alignmentAnchor}
                  onChange={(e) =>
                    onUpdateShared({ alignmentAnchor: e.target.value as SeriesAlignmentAnchor })
                  }
                  className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                >
                  {SERIES_ALIGNMENT_ANCHOR_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="series-volume-style">Volume Numbering</Label>
                <select
                  id="series-volume-style"
                  data-testid="series-volume-style-select"
                  value={series.shared.volumeNumberStyle}
                  onChange={(e) =>
                    onUpdateShared({
                      volumeNumberStyle: e.target.value as SeriesVolumeNumberStyle,
                    })
                  }
                  className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                >
                  {SERIES_VOLUME_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="series-band-style">Aligned Spine Bands</Label>
                <select
                  id="series-band-style"
                  data-testid="series-band-style-select"
                  value={series.shared.bandStyle}
                  onChange={(e) =>
                    onUpdateShared({ bandStyle: e.target.value as SeriesBandStyle })
                  }
                  className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                >
                  {SERIES_BAND_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {series.shared.bandStyle !== 'none' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <Label htmlFor="series-band-head">Head Band</Label>
                      <span className="font-mono text-muted-foreground">
                        {series.shared.bandHeadOffsetMm} mm
                      </span>
                    </div>
                    <Slider
                      id="series-band-head"
                      min={6}
                      max={60}
                      step={1}
                      value={[series.shared.bandHeadOffsetMm]}
                      onValueChange={([v]) => onUpdateShared({ bandHeadOffsetMm: v })}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <Label htmlFor="series-band-tail">Tail Band</Label>
                      <span className="font-mono text-muted-foreground">
                        {series.shared.bandTailOffsetMm} mm
                      </span>
                    </div>
                    <Slider
                      id="series-band-tail"
                      min={6}
                      max={60}
                      step={1}
                      value={[series.shared.bandTailOffsetMm]}
                      onValueChange={([v]) => onUpdateShared({ bandTailOffsetMm: v })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="series-ornament-select">Shared Spine Emblem</Label>
                <select
                  id="series-ornament-select"
                  data-testid="series-ornament-select"
                  value={series.shared.ornamentId}
                  onChange={(e) =>
                    onUpdateShared({ ornamentId: e.target.value as SeriesOrnamentId })
                  }
                  className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                >
                  {SERIES_ORNAMENT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'panorama' && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Upload one wide artwork image and slice it seamlessly across every spine in the shelf,
              compensating automatically for distinct spine widths and heights.
            </p>

            <input
              ref={panoFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              aria-label="Upload panoramic spine artwork"
              data-testid="series-panorama-upload-input"
              onChange={(e) => void handlePanoramaUpload(e)}
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                data-testid="series-upload-panorama-btn"
                onClick={() => panoFileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Upload Image
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="w-full gap-1.5 text-xs"
                data-testid="series-load-sample-panorama-btn"
                onClick={handleLoadSamplePanorama}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Sample Panorama
              </Button>
            </div>

            {series.shared.panorama.dataUrl && (
              <div className="space-y-3.5 rounded-md border border-border bg-secondary/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Label htmlFor="series-panorama-enable">Enable Panoramic Art</Label>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {series.shared.panorama.fileName ?? 'Loaded artwork'} (
                      {series.shared.panorama.naturalWidth}×{series.shared.panorama.naturalHeight})
                    </p>
                  </div>
                  <Switch
                    id="series-panorama-enable"
                    data-testid="series-panorama-enable-switch"
                    checked={series.shared.panorama.enabled}
                    onCheckedChange={(enabled) => onUpdatePanorama({ enabled })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="series-panorama-fit">Fit Mode</Label>
                  <select
                    id="series-panorama-fit"
                    value={series.shared.panorama.fitMode}
                    onChange={(e) =>
                      onUpdatePanorama({
                        fitMode: e.target.value === 'fit-height' ? 'fit-height' : 'cover',
                      })
                    }
                    className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
                  >
                    <option value="cover">Cover Entire Shelf</option>
                    <option value="fit-height">Fit Tallest Spine Height</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label htmlFor="series-panorama-scale">Zoom Scale</Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {Math.round(series.shared.panorama.scale * 100)}%
                    </span>
                  </div>
                  <Slider
                    id="series-panorama-scale"
                    min={0.5}
                    max={2.5}
                    step={0.05}
                    value={[series.shared.panorama.scale]}
                    onValueChange={([scale]) => onUpdatePanorama({ scale: roundTo(scale, 2) })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label htmlFor="series-panorama-offset-x">Horizontal Pan</Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {series.shared.panorama.offsetXMm} mm
                    </span>
                  </div>
                  <Slider
                    id="series-panorama-offset-x"
                    min={-180}
                    max={180}
                    step={1}
                    value={[series.shared.panorama.offsetXMm]}
                    onValueChange={([offsetXMm]) => onUpdatePanorama({ offsetXMm })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label htmlFor="series-panorama-offset-y">Vertical Pan</Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {series.shared.panorama.offsetYMm} mm
                    </span>
                  </div>
                  <Slider
                    id="series-panorama-offset-y"
                    min={-120}
                    max={120}
                    step={1}
                    value={[series.shared.panorama.offsetYMm]}
                    onValueChange={([offsetYMm]) => onUpdatePanorama({ offsetYMm })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label htmlFor="series-panorama-gap">Shelf Gap Compensation</Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {series.shared.panorama.shelfGapMm.toFixed(1)} mm
                    </span>
                  </div>
                  <Slider
                    id="series-panorama-gap"
                    min={0}
                    max={4}
                    step={0.5}
                    value={[series.shared.panorama.shelfGapMm]}
                    onValueChange={([shelfGapMm]) => onUpdatePanorama({ shelfGapMm })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label htmlFor="series-panorama-scrim">Contrast Scrim</Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {Math.round(series.shared.panorama.dimOpacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    id="series-panorama-scrim"
                    min={0}
                    max={0.75}
                    step={0.05}
                    value={[series.shared.panorama.dimOpacity]}
                    onValueChange={([dimOpacity]) =>
                      onUpdatePanorama({ dimOpacity: roundTo(dimOpacity, 2) })
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() =>
                      onUpdatePanorama({
                        offsetXMm: 0,
                        offsetYMm: 0,
                        scale: 1,
                        shelfGapMm: 0,
                      })
                    }
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Reset Framing
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                    data-testid="series-clear-panorama-btn"
                    onClick={() => {
                      onUpdatePanorama({ ...DEFAULT_SERIES_PANORAMA });
                      onStatusMessage('Cleared panoramic spine artwork');
                    }}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
