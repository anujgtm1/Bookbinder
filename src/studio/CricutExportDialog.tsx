import { CheckCircle2, Download, FlipHorizontal2, Printer, Scissors, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { triggerTextDownload } from '@/core/storage';
import type { CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { UnitConverter, type UnitSystem } from '@/types/units';
import {
  DEFAULT_CRICUT_EXPORT_OPTIONS,
  generateCricutHtvSvg,
  type CricutCanvasScope,
  type CricutExportOptions,
  type CricutExportResult,
} from './cricutExport';
import type { CustomFontAsset } from './fonts';

export interface CricutExportDialogProps {
  readonly open: boolean;
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly unit: UnitSystem;
  readonly onOpenChange: (open: boolean) => void;
  readonly onStatusMessage: (message: string) => void;
  readonly onOpenBasePdfForHtv?: () => void;
}

/**
 * Native modal <dialog closedby="any"> for Cricut Design Space / Silhouette Studio / ScanNCut
 * Vector HTV & foil SVG export with live preview and mat compatibility badges.
 */
export function CricutExportDialog({
  open,
  geometry,
  studio,
  customFont,
  unit,
  onOpenChange,
  onStatusMessage,
  onOpenBasePdfForHtv,
}: CricutExportDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const hasSpineText =
    studio.spineText.title.trim().length > 0 || studio.spineText.author.trim().length > 0;
  const hasFrontDesign =
    (studio.textLayers ?? []).some((t) => t.zone === 'front' && t.text.trim().length > 0) ||
    (studio.ornaments ?? []).some((o) => o.zone === 'front');
  const hasAnyDesign =
    hasSpineText ||
    (studio.textLayers ?? []).some((t) => t.text.trim().length > 0) ||
    (studio.ornaments ?? []).length > 0;

  const [options, setOptions] = useState<CricutExportOptions>(DEFAULT_CRICUT_EXPORT_OPTIONS);
  const [preview, setPreview] = useState<CricutExportResult | null>(null);
  const [generating, setGenerating] = useState(false);

  // Sync open prop with native dialog.showModal() / dialog.close() and set smart default scope on open
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      const smartScope: CricutCanvasScope = hasSpineText
        ? 'spine-only'
        : hasFrontDesign
          ? 'front-cover'
          : 'full-wrap';
      setOptions((prev) => ({
        ...prev,
        scope: smartScope,
        includeOuterCutOutline: smartScope === 'full-wrap',
      }));
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open, hasSpineText, hasFrontDesign]);

  // Safari fallback for closedby="any" light dismiss (requires both press & release outside dialog rect)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        if (typeof dialog.close === 'function') dialog.close();
        else onOpenChange(false);
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [onOpenChange]);

  // Re-generate live flattened vector preview whenever dialog is open or options change
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGenerating(true);

    void generateCricutHtvSvg(geometry, studio, customFont, options)
      .then((res) => {
        if (!cancelled) {
          setPreview(res);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, geometry, studio, customFont, options]);

  const previewDataUri = useMemo(() => {
    if (!preview) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`;
  }, [preview]);

  const updateOption = <K extends keyof CricutExportOptions>(
    key: K,
    value: CricutExportOptions[K],
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleScopeChange = (scope: CricutCanvasScope) => {
    setOptions((prev) => ({
      ...prev,
      scope,
      includeOuterCutOutline: scope === 'full-wrap' ? true : false,
    }));
  };

  const handleDownload = () => {
    if (!preview) return;
    triggerTextDownload(preview.svg, preview.fileName, 'image/svg+xml;charset=utf-8');
    onStatusMessage(
      `Exported ${preview.fileName} (${preview.widthMm} × ${preview.heightMm} mm, ${preview.pathCount} vector paths)`,
    );
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function') {
      dialog.close();
    } else {
      onOpenChange(false);
    }
  };

  const handleOpenBasePdfForHtv = () => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog?.removeAttribute('open');
    }
    onOpenChange(false);
    onOpenBasePdfForHtv?.();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="cricut-export-dialog"
      {...({ closedby: 'any' } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onOpenChange(false);
      }}
      className="bindery-modal m-auto max-h-[90vh] w-[min(94vw,760px)] overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2
            id={titleId}
            className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-foreground"
          >
            <Scissors className="h-4 w-4 text-brass" aria-hidden="true" />
            Cricut / Silhouette / ScanNCut HTV &amp; Foil SVG
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vector SVG with flattened glyph paths (zero{' '}
            <code className="font-mono text-[11px]">&lt;text&gt;</code> tags or raster images).
          </p>
        </div>

        <form method="dialog">
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Close Cricut export dialog"
            data-testid="cricut-close-btn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>

      {/* Main Content */}
      <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[1.1fr_1fr]">
        {/* Left: Live Vector Cut Mat Preview */}
        <div className="flex flex-col gap-3">
          <div
            data-testid="cricut-preview-mat"
            className="cricut-mat-surface relative flex h-72 items-center justify-center rounded-lg border border-border p-4 shadow-inner"
          >
            {previewDataUri ? (
              <img
                src={previewDataUri}
                alt="Live Cricut HTV vector cut preview"
                data-testid="cricut-svg-preview-img"
                className="max-h-full max-w-full object-contain drop-shadow-xs"
              />
            ) : (
              <span className="text-xs text-slate-600">
                {generating ? 'Outlining font paths…' : 'Preparing vector cut preview…'}
              </span>
            )}
            {options.mirrorForHtv && (
              <Badge
                variant="warning"
                className="pointer-events-none absolute top-2.5 right-2.5 rounded-full text-[10px]"
              >
                <FlipHorizontal2 className="h-3 w-3" aria-hidden="true" />
                Mirrored
              </Badge>
            )}
          </div>

          {/* Mat Compatibility & Hygiene Badges */}
          {preview && (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold text-foreground">
                  {UnitConverter.formatDimensions(preview.widthMm, preview.heightMm, unit)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {preview.pathCount} cut {preview.pathCount === 1 ? 'path' : 'paths'} • 0 &lt;text&gt;
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5" data-testid="cricut-mat-badges">
                <Badge
                  variant={preview.fitsCricutJoy ? 'success' : 'outline'}
                  className="rounded-full text-[10px]"
                >
                  {preview.fitsCricutJoy && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                  Cricut Joy (4.5×12&quot;)
                </Badge>
                <Badge
                  variant={preview.fitsStandard12x12 ? 'success' : 'outline'}
                  className="rounded-full text-[10px]"
                >
                  {preview.fitsStandard12x12 && (
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  )}
                  12×12&quot; Mat
                </Badge>
                <Badge
                  variant={preview.fitsLarge12x24 ? 'success' : 'warning'}
                  className="rounded-full text-[10px]"
                >
                  {preview.fitsLarge12x24 && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                  12×24&quot; Mat
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-muted-foreground">
                {options.groupByColor && preview.foilColors.length > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1">
                      {preview.foilColors.map((hex) => (
                        <span
                          key={hex}
                          className="inline-block h-2.5 w-2.5 rounded-full border border-border/80"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </span>
                    Foil Mats ({preview.foilColors.length})
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#111111]" />
                    Lettering (HTV)
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#B48327]" />
                  Corner Alignment
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#1D5BD6]" />
                  Weeding Box
                </span>
                {options.scope === 'full-wrap' && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#D93829]" />
                    Outer Cut
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Cutter Export Controls */}
        <div className="flex flex-col justify-between gap-4">
          <div className="space-y-3.5">
            {/* Scope Toggle */}
            <div className="space-y-1.5">
              <Label>Cut Mat Scope</Label>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Cricut canvas scope">
                <Button
                  type="button"
                  size="sm"
                  variant={options.scope === 'spine-only' ? 'default' : 'outline'}
                  aria-pressed={options.scope === 'spine-only'}
                  data-testid="cricut-scope-spine"
                  onClick={() => handleScopeChange('spine-only')}
                >
                  Spine Strip Only
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={options.scope === 'front-cover' ? 'default' : 'outline'}
                  aria-pressed={options.scope === 'front-cover'}
                  data-testid="cricut-scope-front"
                  onClick={() => handleScopeChange('front-cover')}
                >
                  Front Cover
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={options.scope === 'back-cover' ? 'default' : 'outline'}
                  aria-pressed={options.scope === 'back-cover'}
                  data-testid="cricut-scope-back"
                  onClick={() => handleScopeChange('back-cover')}
                >
                  Back Cover
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={options.scope === 'full-wrap' ? 'default' : 'outline'}
                  aria-pressed={options.scope === 'full-wrap'}
                  data-testid="cricut-scope-fullwrap"
                  onClick={() => handleScopeChange('full-wrap')}
                >
                  Full Cover Wrap
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {options.scope === 'spine-only'
                  ? 'Compact mat sized to your spine — saves HTV and fits Cricut Joy.'
                  : options.scope === 'front-cover'
                    ? 'Exact Front Cover board area with front title, author, frames & emblems.'
                    : options.scope === 'back-cover'
                      ? 'Exact Back Cover board area with back blurb, colophon & ornaments.'
                      : 'Full wrap alignment across Back, Spine, and Front boards.'}
              </p>
            </div>

            {!hasAnyDesign && (
              <p className="rounded-md border border-amber-600/35 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                Add Spine Typography, Front/Back Cover Text, or a Classic Design ornament to export
                outlined HTV cut paths — or export the alignment &amp; outer cut outline for bookcloth.
              </p>
            )}

            <div className="kettle-stitch-divider space-y-3 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cricut-lettering-switch">Cover &amp; Spine Lettering</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Converts active font glyphs into compound cut curves.
                  </p>
                </div>
                <Switch
                  id="cricut-lettering-switch"
                  data-testid="cricut-lettering-switch"
                  checked={options.includeLettering}
                  onCheckedChange={(v) => updateOption('includeLettering', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cricut-ornaments-switch">Classic Ornaments &amp; Frames</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Includes borders, corner flourishes, dividers &amp; spine bands.
                  </p>
                </div>
                <Switch
                  id="cricut-ornaments-switch"
                  data-testid="cricut-ornaments-switch"
                  checked={options.includeOrnaments ?? true}
                  onCheckedChange={(v) => updateOption('includeOrnaments', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cricut-weeding-switch">Weeding Box (+4 mm)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Tight border around text for easier HTV weeding.
                  </p>
                </div>
                <Switch
                  id="cricut-weeding-switch"
                  data-testid="cricut-weeding-switch"
                  checked={options.includeWeedingBox}
                  onCheckedChange={(v) => updateOption('includeWeedingBox', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cricut-reg-switch">Alignment Corner Marks</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Corner L-ticks to center vinyl on wrapped bookcloth.
                  </p>
                </div>
                <Switch
                  id="cricut-reg-switch"
                  data-testid="cricut-reg-switch"
                  checked={options.includeRegistrationMarks}
                  onCheckedChange={(v) => updateOption('includeRegistrationMarks', v)}
                />
              </div>

              {options.scope === 'full-wrap' && (
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="cricut-outer-cut-switch">Outer Wrap Cut Polygon</Label>
                    <p className="text-[11px] text-muted-foreground">
                      45°-mitered perimeter for machine-cutting bookcloth/paper.
                    </p>
                  </div>
                  <Switch
                    id="cricut-outer-cut-switch"
                    data-testid="cricut-outer-cut-switch"
                    checked={options.includeOuterCutOutline}
                    onCheckedChange={(v) => updateOption('includeOuterCutOutline', v)}
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Label htmlFor="cricut-group-by-color-switch">Split Mats by Foil Color</Label>
                    {preview && preview.foilColors.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1"
                        data-testid="cricut-foil-color-dots"
                      >
                        {preview.foilColors.map((hex) => (
                          <span
                            key={hex}
                            className="inline-block h-2.5 w-2.5 rounded-full border border-border/80 shadow-2xs"
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {preview && preview.foilColors.length > 1
                      ? `${preview.foilColors.length} foil colors detected — Cricut splits mats automatically.`
                      : 'Uses design foil colors so Cricut splits mats automatically.'}
                  </p>
                </div>
                <Switch
                  id="cricut-group-by-color-switch"
                  data-testid="cricut-group-by-color-switch"
                  checked={Boolean(options.groupByColor)}
                  onCheckedChange={(v) => updateOption('groupByColor', v)}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-2.5 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="cricut-mirror-switch">Mirror Horizontally (HTV)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Leave Off if mirroring in Cricut Design Space&apos;s Make It screen.
                  </p>
                </div>
                <Switch
                  id="cricut-mirror-switch"
                  data-testid="cricut-mirror-switch"
                  checked={options.mirrorForHtv}
                  onCheckedChange={(v) => updateOption('mirrorForHtv', v)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {onOpenBasePdfForHtv && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-brass/35 bg-brass/10 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-foreground">
                    Hybrid Printed Base + HTV Foil
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Print artwork base only (no text or ornaments) to press HTV cleanly.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  data-testid="cricut-open-base-pdf-btn"
                  onClick={handleOpenBasePdfForHtv}
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  Export Printed Base PDF…
                </Button>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <form method="dialog">
                <Button type="submit" variant="outline" size="sm">
                  Cancel
                </Button>
              </form>
              <Button
                type="button"
                variant="default"
                size="sm"
                autoFocus
                disabled={!preview || preview.pathCount === 0 || generating}
                onClick={handleDownload}
                data-testid="cricut-download-btn"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download Cricut SVG
              </Button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
