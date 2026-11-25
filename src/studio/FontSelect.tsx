import { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StudioFontId } from '@/types/studio';
import {
  FONT_GENRE_GROUPS,
  ensureAllCuratedFontsLoaded,
  ensureCuratedFontLoaded,
  getCuratedFontsByGenreGroup,
  resolveFontCssFamily,
  type CuratedFontSpec,
  type CustomFontAsset,
} from './fonts';

export interface FontSelectProps {
  readonly id?: string;
  readonly value: StudioFontId;
  readonly customFont: CustomFontAsset | null;
  readonly onValueChange: (fontId: StudioFontId) => void;
  readonly triggerClassName?: string;
  readonly triggerTestId?: string;
  readonly customLabelStyle?: 'family' | 'filename';
}

function getFontBadge(font: CuratedFontSpec): string | null {
  if (font.casingRule === 'uppercase-only') return 'CAPS';
  if (font.category === 'script') return 'Script';
  return null;
}

export function FontSelect({
  id,
  value,
  customFont,
  onValueChange,
  triggerClassName,
  triggerTestId,
  customLabelStyle = 'family',
}: FontSelectProps) {
  useEffect(() => {
    if (value !== 'custom') {
      void ensureCuratedFontLoaded(value);
    }
  }, [value]);

  const activeFontFamily = resolveFontCssFamily(value, customFont);

  return (
    <Select
      value={value}
      onOpenChange={(open) => {
        if (open) {
          void ensureAllCuratedFontsLoaded();
        }
      }}
      onValueChange={(next) => {
        const nextId = next as StudioFontId;
        if (nextId !== 'custom') {
          void ensureCuratedFontLoaded(nextId);
        }
        onValueChange(nextId);
      }}
    >
      <SelectTrigger
        id={id}
        data-testid={triggerTestId}
        className={triggerClassName}
        style={{ fontFamily: activeFontFamily }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[16rem]">
        {FONT_GENRE_GROUPS.map((group, groupIdx) => {
          const fonts = getCuratedFontsByGenreGroup(group.id);
          if (fonts.length === 0) return null;
          return (
            <SelectGroup key={group.id}>
              {groupIdx > 0 && <SelectSeparator />}
              <SelectLabel>{group.label}</SelectLabel>
              {fonts.map((font) => {
                const badge = getFontBadge(font);
                return (
                  <SelectItem
                    key={font.id}
                    value={font.id}
                    title={`${font.label} — ${font.sampleTagline}`}
                    data-testid={`font-option-${font.id}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span style={{ fontFamily: font.cssFamily }} className="text-[13px]">
                        {font.label}
                      </span>
                      {badge && (
                        <span className="rounded border border-border/80 bg-secondary/70 px-1 py-0.2 font-sans text-[9px] font-medium tracking-wide text-muted-foreground">
                          {badge}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          );
        })}
        {customFont && (
          <SelectGroup>
            <SelectSeparator />
            <SelectLabel>Uploaded Custom Font</SelectLabel>
            <SelectItem value="custom" data-testid="font-option-custom">
              <span style={{ fontFamily: resolveFontCssFamily('custom', customFont) }}>
                {customLabelStyle === 'filename'
                  ? `Custom: ${customFont.fileName}`
                  : `Custom (${customFont.familyName})`}
              </span>
            </SelectItem>
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
