import { Dices, Lock, Sparkles, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DESIGN_GENRE_OPTIONS,
  type DesignGenreId,
} from '@/resources/generatorProfiles';
import { getProceduralArtworkSpec } from '@/resources/proceduralArtworks';
import type { DesignGeneratorLocks, GeneratedDesignSummary } from './designGenerator';
import { getCuratedFont } from './fonts';

export interface DesignMuseCardProps {
  readonly genre: DesignGenreId;
  readonly includeBackgroundArt: boolean;
  readonly locks: DesignGeneratorLocks;
  readonly lastSummary: GeneratedDesignSummary | null;
  readonly onGenreChange: (genre: DesignGenreId) => void;
  readonly onIncludeBackgroundArtChange: (include: boolean) => void;
  readonly onToggleLock: (key: keyof DesignGeneratorLocks) => void;
  readonly onGenerate: () => void;
}

const LOCK_CONTROLS: readonly {
  readonly key: keyof DesignGeneratorLocks;
  readonly label: string;
  readonly testId: string;
  readonly title: string;
}[] = [
  {
    key: 'lockTextContent',
    label: 'Keep Text',
    testId: 'muse-lock-text',
    title: 'Preserve your current title, author & blurb text when shuffling designs',
  },
  {
    key: 'lockPalette',
    label: 'Keep Colors',
    testId: 'muse-lock-palette',
    title: 'Keep your current cloth & endpaper colors (still checking contrast)',
  },
  {
    key: 'lockFonts',
    label: 'Keep Fonts',
    testId: 'muse-lock-fonts',
    title: 'Keep your current cover & spine font pairing',
  },
  {
    key: 'lockOrnaments',
    label: 'Keep Ornaments',
    testId: 'muse-lock-ornaments',
    title: 'Keep your currently placed frames, emblems & spine bands',
  },
  {
    key: 'lockBackground',
    label: 'Keep Art',
    testId: 'muse-lock-background',
    title: 'Preserve your existing uploaded images or pattern layers',
  },
] as const;

export function DesignMuseCard({
  genre,
  includeBackgroundArt,
  locks,
  lastSummary,
  onGenreChange,
  onIncludeBackgroundArtChange,
  onToggleLock,
  onGenerate,
}: DesignMuseCardProps) {
  const titleFontLabel = lastSummary ? getCuratedFont(lastSummary.titleFontId).label : null;
  const authorFontLabel = lastSummary ? getCuratedFont(lastSummary.authorFontId).label : null;
  const artworkLabel =
    lastSummary?.artworkId ? getProceduralArtworkSpec(lastSummary.artworkId).shortLabel : null;

  return (
    <Card
      data-testid="design-muse-card"
      className="border-t-2 border-t-brass/80 bg-card/95"
    >
      <CardHeader className="pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base">
            <Sparkles className="h-4 w-4 text-vermilion" aria-hidden="true" />
            Design Muse
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px]">
            Rule-Based
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Generate bookstore-grade cover &amp; spine pairings with verified contrast, safe margins,
          and instant Undo.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Genre Pill Selector */}
        <div className="space-y-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Genre Mood
          </span>
          <div
            role="group"
            aria-label="Design Muse genre mood"
            className="flex flex-wrap gap-1"
            data-testid="muse-genre-group"
          >
            {DESIGN_GENRE_OPTIONS.map((opt) => {
              const active = genre === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`muse-genre-${opt.id}`}
                  onClick={() => onGenreChange(opt.id)}
                  className={`cursor-pointer rounded-[2px] border px-2 py-0.5 text-[11px] font-medium motion-safe:transition-colors ${
                    active
                      ? 'border-vermilion bg-vermilion/12 text-foreground shadow-2xs'
                      : 'border-border/80 bg-secondary/35 text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pure Foil vs + Artwork Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Backdrop Style
          </span>
          <div
            role="group"
            aria-label="Cover backdrop style"
            className="inline-flex rounded-[3px] border border-border bg-secondary/45 p-0.5"
          >
            <button
              type="button"
              aria-pressed={!includeBackgroundArt}
              data-testid="muse-mode-foil"
              onClick={() => onIncludeBackgroundArtChange(false)}
              className={`cursor-pointer rounded-[2px] px-2.5 py-0.5 text-[11px] font-medium motion-safe:transition-colors ${
                !includeBackgroundArt
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pure Foil
            </button>
            <button
              type="button"
              aria-pressed={includeBackgroundArt}
              data-testid="muse-mode-artwork"
              onClick={() => onIncludeBackgroundArtChange(true)}
              className={`cursor-pointer rounded-[2px] px-2.5 py-0.5 text-[11px] font-medium motion-safe:transition-colors ${
                includeBackgroundArt
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              + Artwork
            </button>
          </div>
        </div>

        {/* Compact Lock Pills */}
        <div className="space-y-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Locks
          </span>
          <div
            role="group"
            aria-label="Design Muse element locks"
            className="flex flex-wrap gap-1"
            data-testid="muse-locks-group"
          >
            {LOCK_CONTROLS.map((ctrl) => {
              const locked = locks[ctrl.key];
              return (
                <button
                  key={ctrl.key}
                  type="button"
                  aria-pressed={locked}
                  title={ctrl.title}
                  data-testid={ctrl.testId}
                  onClick={() => onToggleLock(ctrl.key)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10.5px] font-medium motion-safe:transition-colors ${
                    locked
                      ? 'border-brass bg-brass/15 text-foreground'
                      : 'border-border/80 bg-secondary/25 text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {locked ? (
                    <Lock className="h-2.5 w-2.5 text-brass" aria-hidden="true" />
                  ) : (
                    <Unlock className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
                  )}
                  {ctrl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Prominent Generate CTA */}
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-8 w-full justify-center gap-1.5 font-medium"
          data-testid="muse-generate-btn"
          onClick={onGenerate}
        >
          <Dices className="h-3.5 w-3.5" aria-hidden="true" />
          Generate Design
        </Button>

        {/* Live Generated Recipe Pill */}
        {lastSummary && (
          <div
            data-testid="muse-recipe-pill"
            className="flex flex-wrap items-center gap-1 rounded-md border border-border/90 bg-secondary/35 px-2.5 py-1.5 text-[11px] text-foreground"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-brass" aria-hidden="true" />
            <span className="font-semibold">{lastSummary.genreLabel}</span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <span>{lastSummary.archetypeLabel}</span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <span className="text-muted-foreground">
              {titleFontLabel}
              {authorFontLabel && authorFontLabel !== titleFontLabel
                ? ` + ${authorFontLabel}`
                : ''}
            </span>
            {artworkLabel && (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <span className="text-muted-foreground">{artworkLabel}</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
