import { Bookmark, Download, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { BUILT_IN_DESIGN_PRESETS, type CoverDesignPreset } from '@/types/designPreset';
import { DesignMuseCard, type DesignMuseCardProps } from './DesignMuseCard';

export interface DesignPresetsCardProps {
  readonly savedPresets: readonly CoverDesignPreset[];
  readonly builtInPresets?: readonly CoverDesignPreset[];
  readonly designMuse?: DesignMuseCardProps;
  readonly onSaveCurrent: (name: string) => void;
  readonly onApplyPreset: (preset: CoverDesignPreset) => void;
  readonly onDeletePreset: (id: string) => void;
  readonly onExportPresets: () => void;
  readonly onImportPresets: (file: File) => void;
}

function summarizePresetElements(preset: CoverDesignPreset): string {
  const ornCount = preset.ornamentTemplates.length;
  const txtCount = preset.textTemplates.length;
  const parts: string[] = [];
  if (ornCount > 0) parts.push(`${ornCount} ${ornCount === 1 ? 'ornament' : 'ornaments'}`);
  if (txtCount > 0) parts.push(`${txtCount} text`);
  return parts.length > 0 ? parts.join(' · ') : 'Colors & spine style';
}

export function DesignPresetsCard({
  savedPresets,
  builtInPresets = BUILT_IN_DESIGN_PRESETS,
  designMuse,
  onSaveCurrent,
  onApplyPreset,
  onDeletePreset,
  onExportPresets,
  onImportPresets,
}: DesignPresetsCardProps) {
  const [presetName, setPresetName] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setPresetName('');
  };

  const presetsCard = (
    <Card data-testid="design-presets-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base">
            <Bookmark className="h-4 w-4 text-brass" aria-hidden="true" />
            Series Design Presets
            {savedPresets.length > 0 && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {savedPresets.length} saved
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={savedPresets.length === 0}
              data-testid="export-presets-btn"
              onClick={onExportPresets}
              title="Export your saved series presets to a portable JSON file"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              data-testid="import-presets-btn"
              onClick={() => importInputRef.current?.click()}
              title="Import saved series presets from a JSON file"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Import
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              aria-label="Import series design presets JSON"
              data-testid="import-presets-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportPresets(file);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Save cloth colors, spine styling, cover typography &amp; ornaments as reusable themes that
          auto-adapt proportionally to any book size — preserving each book&apos;s own spine title
          &amp; author.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Save Current Design Bar */}
        <form onSubmit={handleSaveSubmit} className="flex flex-wrap items-center gap-2">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Series name (e.g. Dune Gold Series)…"
            aria-label="Series design preset name"
            data-testid="preset-name-input"
            className="h-8 min-w-[180px] flex-1 text-xs"
            maxLength={80}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={presetName.trim().length === 0}
            data-testid="save-design-preset-btn"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Save Current Design
          </Button>
        </form>

        {/* Your Saved Designs */}
        {savedPresets.length > 0 && (
          <div className="space-y-2" data-testid="saved-presets-section">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Your Saved Designs
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Saved in browser
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {savedPresets.map((preset, idx) => (
                <div
                  key={preset.id}
                  data-testid={`saved-preset-card-${idx}`}
                  className="flex items-center justify-between gap-2.5 rounded-md border border-border bg-secondary/20 p-2.5 transition-colors hover:border-brass/50"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* Swatch Preview: cloth tile with foil & pocket dots */}
                    <div
                      className="relative flex h-10 w-8 shrink-0 flex-col items-center justify-between rounded-[3px] border border-border/80 p-1 shadow-xs"
                      style={{ backgroundColor: preset.frontBgColor }}
                      aria-hidden="true"
                    >
                      <span
                        className="h-0.5 w-full rounded-full"
                        style={{ backgroundColor: preset.spineStyle.textColor }}
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-black/20"
                        style={{ backgroundColor: preset.spineStyle.textColor }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full border border-black/20"
                        style={{ backgroundColor: preset.pocketBgColor }}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        {preset.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {summarizePresetElements(preset)}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      data-testid={`apply-saved-preset-${idx}`}
                      onClick={() => onApplyPreset(preset)}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      aria-label={`Delete ${preset.name}`}
                      data-testid={`delete-saved-preset-${idx}`}
                      onClick={() => onDeletePreset(preset.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Starter Series Themes */}
        <div className="space-y-2" data-testid="builtin-presets-section">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Starter Series Themes
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {builtInPresets.map((preset) => (
              <div
                key={preset.id}
                data-testid={`builtin-preset-card-${preset.id}`}
                className="flex flex-col justify-between gap-2 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-brass/60"
              >
                <div className="flex items-start gap-2.5">
                  {/* Cloth + Foil Swatch Strip */}
                  <div
                    className="relative flex h-12 w-9 shrink-0 flex-col items-center justify-between rounded-[3px] border border-border/80 px-1 py-1.5 shadow-xs"
                    style={{ backgroundColor: preset.frontBgColor }}
                    aria-hidden="true"
                  >
                    <span
                      className="h-0.5 w-full rounded-full"
                      style={{ backgroundColor: preset.spineStyle.textColor }}
                    />
                    <span
                      className="h-1.5 w-4 rounded-[1px]"
                      style={{ backgroundColor: preset.spineStyle.textColor }}
                    />
                    <span
                      className="h-0.5 w-full rounded-full"
                      style={{ backgroundColor: preset.spineStyle.textColor }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {preset.name}
                      </span>
                    </div>
                    {preset.description && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {preset.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-border"
                      style={{ backgroundColor: preset.frontBgColor }}
                      title={`Cloth: ${preset.frontBgColor.toUpperCase()}`}
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-border"
                      style={{ backgroundColor: preset.spineStyle.textColor }}
                      title={`Foil: ${preset.spineStyle.textColor.toUpperCase()}`}
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-border"
                      style={{ backgroundColor: preset.pocketBgColor }}
                      title={`Pocket: ${preset.pocketBgColor.toUpperCase()}`}
                    />
                    <span className="ml-0.5">{summarizePresetElements(preset)}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2.5 text-[11px]"
                    data-testid={`apply-builtin-preset-${preset.id}`}
                    onClick={() => onApplyPreset(preset)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!designMuse) {
    return presetsCard;
  }

  return (
    <div className="space-y-3">
      <DesignMuseCard {...designMuse} />
      {presetsCard}
    </div>
  );
}
