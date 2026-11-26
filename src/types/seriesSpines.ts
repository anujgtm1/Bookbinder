import { parseHexColor } from '@/lib/color';
import { BookParametersModel, type BookParameters } from './bookParams';
import { CLASSIC_ORNAMENT_IDS, type ClassicOrnamentId } from './coverElements';
import { asProjectId, isProjectId, type ProjectId } from './projectLibrary';
import {
  CURATED_FONT_IDS,
  STUDIO_BOUNDS,
  type AuthorOrientation,
  type CuratedFontId,
  type SpineLayoutPreset,
  type SpineOrientation,
  type StudioFontId,
} from './studio';
import { clampFinite, roundTo } from './units';

export const SERIES_SCHEMA_VERSION = 1 as const;

export type SeriesId = string & { readonly __brand: 'SeriesId' };
export type SeriesBookId = string & { readonly __brand: 'SeriesBookId' };
export type SeriesSequenceId = string & { readonly __brand: 'SeriesSequenceId' };

export type SpineTextOrientation = SpineOrientation;
export type SpineAuthorOrientation = AuthorOrientation;
export type SpineTextLayout = SpineLayoutPreset;

export type SeriesCollectionMode = 'series' | 'collection';

export type SeriesVolumeNumberStyle =
  | 'none'
  | 'roman'
  | 'arabic'
  | 'vol-arabic'
  | 'book-arabic'
  | 'custom';

export type SeriesBandStyle =
  | 'none'
  | 'classic-rules'
  | 'double-bands'
  | 'head-tail-caps'
  | 'framed-label';

export type SeriesAlignmentAnchor = 'shelf-bottom' | 'book-top' | 'spine-center';

export type SeriesPanoramaFitMode = 'cover' | 'fit-height';

export type SeriesOrnamentId = ClassicOrnamentId | 'none';

export interface SeriesPanoramaConfig {
  readonly enabled: boolean;
  readonly dataUrl: string | null;
  readonly fileName: string | null;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly fitMode: SeriesPanoramaFitMode;
  readonly offsetXMm: number;
  readonly offsetYMm: number;
  readonly scale: number;
  /** Physical gap between adjacent standing books on the shelf (mm) accounted for when slicing panoramic art */
  readonly shelfGapMm: number;
  /** Subtle dark/tinted scrim over panorama (0..0.75) so metallic/light spine lettering pops cleanly */
  readonly dimOpacity: number;
}

export interface SeriesSharedDesign {
  readonly fontId: StudioFontId;
  readonly customFontName: string | null;
  readonly titleSizePt: number;
  readonly authorSizePt: number;
  readonly volumeBadgeSizePt: number;
  readonly orientation: SpineTextOrientation;
  readonly authorOrientation: SpineAuthorOrientation;
  readonly titleLayout: SpineTextLayout;
  readonly defaultBgColor: string;
  readonly defaultTextColor: string;
  readonly accentColor: string;
  readonly alignmentAnchor: SeriesAlignmentAnchor;
  readonly volumeNumberStyle: SeriesVolumeNumberStyle;
  /** Distance from the active alignment anchor edge to the volume badge center (mm) */
  readonly volumeBadgeOffsetMm: number;
  /** Distance from the shelf bottom (or anchor reference) to horizontal author block center (mm) */
  readonly authorOffsetMm: number;
  readonly bandStyle: SeriesBandStyle;
  /** Distance from top (or anchor reference) to head band (mm) */
  readonly bandHeadOffsetMm: number;
  /** Distance from shelf bottom to tail band (mm) */
  readonly bandTailOffsetMm: number;
  readonly ornamentId: SeriesOrnamentId;
  /** Distance from shelf bottom (or anchor reference) to shared spine ornament center (mm) */
  readonly ornamentOffsetMm: number;
  readonly panorama: SeriesPanoramaConfig;
}

export interface SeriesSequenceGroup {
  readonly id: SeriesSequenceId;
  readonly name: string;
  /** Numbering style for volumes in this sequence (e.g., 'roman' -> I, II, III, 'arabic', 'vol-arabic', 'book-arabic', 'custom', 'none') */
  readonly volumeNumberStyle: SeriesVolumeNumberStyle;
  /** Optional starting volume number (default 1, e.g., 1..99) */
  readonly startNumber: number;
  /** Optional shared author label for the sequence (empty string / null = let each book keep its own author!) */
  readonly sharedAuthor: string | null;
}

export interface SeriesBookEntry {
  readonly id: SeriesBookId;
  readonly linkedProjectId: ProjectId | null;
  readonly sequenceId?: SeriesSequenceId | null;
  readonly title: string;
  readonly author: string;
  readonly volumeLabelOverride: string;
  readonly parameters: BookParameters;
  readonly spineBgColorOverride: string | null;
  readonly textColorOverride: string | null;
  readonly accentColorOverride: string | null;
  readonly opticalNudgeMm: number;
  readonly fontSizeOverridePt: number | null;
}

export interface SeriesProject {
  readonly schemaVersion: typeof SERIES_SCHEMA_VERSION;
  readonly id: SeriesId;
  readonly name: string;
  readonly mode: SeriesCollectionMode;
  readonly updatedAt: string;
  readonly books: readonly SeriesBookEntry[];
  readonly sequences: readonly SeriesSequenceGroup[];
  readonly shared: SeriesSharedDesign;
}

export interface SeriesValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export type SeriesParseResult =
  | { readonly ok: true; readonly series: SeriesProject }
  | { readonly ok: false; readonly error: string };

export const SERIES_BOUNDS = {
  titleSizePt: { min: 6, max: 48 },
  authorSizePt: { min: 5.5, max: 32 },
  volumeBadgeSizePt: { min: 6, max: 32 },
  volumeBadgeOffsetMm: { min: 8, max: 120 },
  authorOffsetMm: { min: 10, max: 140 },
  bandHeadOffsetMm: { min: 6, max: 90 },
  bandTailOffsetMm: { min: 6, max: 90 },
  ornamentOffsetMm: { min: 12, max: 160 },
  panoramaOffsetMm: { min: -400, max: 400 },
  panoramaScale: { min: 0.4, max: 3.0 },
  shelfGapMm: { min: 0, max: 8 },
  dimOpacity: { min: 0, max: 0.75 },
  opticalNudgeMm: STUDIO_BOUNDS.opticalNudgeMm,
  sequenceStartNumber: { min: 1, max: 99 },
  maxSequences: 12,
  maxBooks: 24,
} as const;

export const DEFAULT_SERIES_PANORAMA: Readonly<SeriesPanoramaConfig> = {
  enabled: false,
  dataUrl: null,
  fileName: null,
  naturalWidth: 0,
  naturalHeight: 0,
  fitMode: 'cover',
  offsetXMm: 0,
  offsetYMm: 0,
  scale: 1,
  shelfGapMm: 0,
  dimOpacity: 0.28,
};

export const DEFAULT_SERIES_SHARED_DESIGN: Readonly<SeriesSharedDesign> = {
  fontId: 'eb-garamond',
  customFontName: null,
  titleSizePt: 18,
  authorSizePt: 11,
  volumeBadgeSizePt: 13,
  orientation: 'top-to-bottom',
  authorOrientation: 'horizontal',
  titleLayout: 'stacked',
  defaultBgColor: '#1b222c',
  defaultTextColor: '#f5efe2',
  accentColor: '#d9b566',
  alignmentAnchor: 'shelf-bottom',
  volumeNumberStyle: 'roman',
  volumeBadgeOffsetMm: 22,
  authorOffsetMm: 24,
  bandStyle: 'classic-rules',
  bandHeadOffsetMm: 14,
  bandTailOffsetMm: 14,
  ornamentId: 'none',
  ornamentOffsetMm: 46,
  panorama: DEFAULT_SERIES_PANORAMA,
};

export function isSeriesId(value: unknown): value is SeriesId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asSeriesId(raw: string): SeriesId {
  const trimmed = raw.trim();
  if (!isSeriesId(trimmed)) {
    throw new Error('SeriesId must be a non-empty string.');
  }
  return trimmed;
}

export function createSeriesId(): SeriesId {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return asSeriesId(`series-${globalThis.crypto.randomUUID()}`);
  }
  return asSeriesId(`series-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
}

export function isSeriesBookId(value: unknown): value is SeriesBookId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asSeriesBookId(raw: string): SeriesBookId {
  const trimmed = raw.trim();
  if (!isSeriesBookId(trimmed)) {
    throw new Error('SeriesBookId must be a non-empty string.');
  }
  return trimmed;
}

export function createSeriesBookId(): SeriesBookId {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return asSeriesBookId(`sbook-${globalThis.crypto.randomUUID()}`);
  }
  return asSeriesBookId(`sbook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
}

export function isSeriesSequenceId(value: unknown): value is SeriesSequenceId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function asSeriesSequenceId(raw: string): SeriesSequenceId {
  const trimmed = raw.trim();
  if (!isSeriesSequenceId(trimmed)) {
    throw new Error('SeriesSequenceId must be a non-empty string.');
  }
  return trimmed;
}

export function createSeriesSequenceId(): SeriesSequenceId {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return asSeriesSequenceId(`sseq-${globalThis.crypto.randomUUID()}`);
  }
  return asSeriesSequenceId(
    `sseq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

const ROMAN_NUMERAL_TABLE: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
] as const;

export function toRomanNumeral(n: number): string {
  const safe = Math.floor(n);
  if (!Number.isFinite(safe) || safe <= 0) return '';
  if (safe > 3999) return String(safe);
  let remaining = safe;
  let out = '';
  for (const [value, symbol] of ROMAN_NUMERAL_TABLE) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out;
}

export function formatVolumeLabel(
  index: number,
  style: SeriesVolumeNumberStyle,
  override = '',
): string {
  const trimmedOverride = override.trim();
  if (style === 'none') return '';
  if (style === 'custom') return trimmedOverride;
  if (trimmedOverride) return trimmedOverride;
  const volNumber = Math.max(1, Math.floor(index) + 1);
  switch (style) {
    case 'roman':
      return toRomanNumeral(volNumber);
    case 'arabic':
      return String(volNumber);
    case 'vol-arabic':
      return `Vol. ${volNumber}`;
    case 'book-arabic':
      return `Book ${volNumber}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseCollectionMode(value: unknown): SeriesCollectionMode {
  return value === 'collection' ? 'collection' : 'series';
}

function parseVolumeStyle(value: unknown): SeriesVolumeNumberStyle {
  switch (value) {
    case 'none':
    case 'roman':
    case 'arabic':
    case 'vol-arabic':
    case 'book-arabic':
    case 'custom':
      return value;
    default:
      return DEFAULT_SERIES_SHARED_DESIGN.volumeNumberStyle;
  }
}

function parseBandStyle(value: unknown): SeriesBandStyle {
  switch (value) {
    case 'none':
    case 'classic-rules':
    case 'double-bands':
    case 'head-tail-caps':
    case 'framed-label':
      return value;
    default:
      return DEFAULT_SERIES_SHARED_DESIGN.bandStyle;
  }
}

function parseAlignmentAnchor(value: unknown): SeriesAlignmentAnchor {
  switch (value) {
    case 'shelf-bottom':
    case 'book-top':
    case 'spine-center':
      return value;
    default:
      return DEFAULT_SERIES_SHARED_DESIGN.alignmentAnchor;
  }
}

function parsePanoramaFitMode(value: unknown): SeriesPanoramaFitMode {
  return value === 'fit-height' ? 'fit-height' : 'cover';
}

function parseFontId(value: unknown): StudioFontId {
  if (value === 'custom') return 'custom';
  if (typeof value === 'string' && (CURATED_FONT_IDS as readonly string[]).includes(value)) {
    return value as CuratedFontId;
  }
  return DEFAULT_SERIES_SHARED_DESIGN.fontId;
}

function parseOrnamentId(value: unknown): SeriesOrnamentId {
  if (value === 'none') return 'none';
  if (
    typeof value === 'string' &&
    value !== 'custom-svg' &&
    (CLASSIC_ORNAMENT_IDS as readonly string[]).includes(value)
  ) {
    return value as ClassicOrnamentId;
  }
  return DEFAULT_SERIES_SHARED_DESIGN.ornamentId;
}

function parseOptionalHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = parseHexColor(value.trim(), '');
  return parsed || null;
}

function parsePanoramaConfig(raw: unknown): SeriesPanoramaConfig {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SERIES_PANORAMA };
  }
  const dataUrl =
    typeof raw.dataUrl === 'string' && raw.dataUrl.startsWith('data:image/')
      ? raw.dataUrl
      : null;
  const naturalWidth = dataUrl ? clampFinite(raw.naturalWidth, 1800, 1, 20000) : 0;
  const naturalHeight = dataUrl ? clampFinite(raw.naturalHeight, 600, 1, 20000) : 0;

  return {
    enabled: Boolean(raw.enabled) && Boolean(dataUrl),
    dataUrl,
    fileName: dataUrl && typeof raw.fileName === 'string' ? raw.fileName.slice(0, 140) : null,
    naturalWidth,
    naturalHeight,
    fitMode: parsePanoramaFitMode(raw.fitMode),
    offsetXMm: roundTo(
      clampFinite(
        raw.offsetXMm,
        DEFAULT_SERIES_PANORAMA.offsetXMm,
        SERIES_BOUNDS.panoramaOffsetMm.min,
        SERIES_BOUNDS.panoramaOffsetMm.max,
      ),
      2,
    ),
    offsetYMm: roundTo(
      clampFinite(
        raw.offsetYMm,
        DEFAULT_SERIES_PANORAMA.offsetYMm,
        SERIES_BOUNDS.panoramaOffsetMm.min,
        SERIES_BOUNDS.panoramaOffsetMm.max,
      ),
      2,
    ),
    scale: roundTo(
      clampFinite(
        raw.scale,
        DEFAULT_SERIES_PANORAMA.scale,
        SERIES_BOUNDS.panoramaScale.min,
        SERIES_BOUNDS.panoramaScale.max,
      ),
      3,
    ),
    shelfGapMm: roundTo(
      clampFinite(
        raw.shelfGapMm,
        DEFAULT_SERIES_PANORAMA.shelfGapMm,
        SERIES_BOUNDS.shelfGapMm.min,
        SERIES_BOUNDS.shelfGapMm.max,
      ),
      2,
    ),
    dimOpacity: roundTo(
      clampFinite(
        raw.dimOpacity,
        DEFAULT_SERIES_PANORAMA.dimOpacity,
        SERIES_BOUNDS.dimOpacity.min,
        SERIES_BOUNDS.dimOpacity.max,
      ),
      3,
    ),
  };
}

function parseSharedDesign(raw: unknown): SeriesSharedDesign {
  const d = DEFAULT_SERIES_SHARED_DESIGN;
  if (!isRecord(raw)) {
    return { ...d, panorama: { ...d.panorama } };
  }
  return {
    fontId: parseFontId(raw.fontId),
    customFontName:
      typeof raw.customFontName === 'string' && raw.customFontName.trim().length > 0
        ? raw.customFontName.trim().slice(0, 80)
        : null,
    titleSizePt: roundTo(
      clampFinite(
        raw.titleSizePt,
        d.titleSizePt,
        SERIES_BOUNDS.titleSizePt.min,
        SERIES_BOUNDS.titleSizePt.max,
      ),
      1,
    ),
    authorSizePt: roundTo(
      clampFinite(
        raw.authorSizePt,
        d.authorSizePt,
        SERIES_BOUNDS.authorSizePt.min,
        SERIES_BOUNDS.authorSizePt.max,
      ),
      1,
    ),
    volumeBadgeSizePt: roundTo(
      clampFinite(
        raw.volumeBadgeSizePt,
        d.volumeBadgeSizePt,
        SERIES_BOUNDS.volumeBadgeSizePt.min,
        SERIES_BOUNDS.volumeBadgeSizePt.max,
      ),
      1,
    ),
    orientation: raw.orientation === 'bottom-to-top' ? 'bottom-to-top' : 'top-to-bottom',
    authorOrientation: raw.authorOrientation === 'vertical' ? 'vertical' : 'horizontal',
    titleLayout: raw.titleLayout === 'inline' ? 'inline' : 'stacked',
    defaultBgColor: parseHexColor(raw.defaultBgColor, d.defaultBgColor),
    defaultTextColor: parseHexColor(raw.defaultTextColor, d.defaultTextColor),
    accentColor: parseHexColor(raw.accentColor, d.accentColor),
    alignmentAnchor: parseAlignmentAnchor(raw.alignmentAnchor),
    volumeNumberStyle: parseVolumeStyle(raw.volumeNumberStyle),
    volumeBadgeOffsetMm: roundTo(
      clampFinite(
        raw.volumeBadgeOffsetMm,
        d.volumeBadgeOffsetMm,
        SERIES_BOUNDS.volumeBadgeOffsetMm.min,
        SERIES_BOUNDS.volumeBadgeOffsetMm.max,
      ),
      1,
    ),
    authorOffsetMm: roundTo(
      clampFinite(
        raw.authorOffsetMm,
        d.authorOffsetMm,
        SERIES_BOUNDS.authorOffsetMm.min,
        SERIES_BOUNDS.authorOffsetMm.max,
      ),
      1,
    ),
    bandStyle: parseBandStyle(raw.bandStyle),
    bandHeadOffsetMm: roundTo(
      clampFinite(
        raw.bandHeadOffsetMm,
        d.bandHeadOffsetMm,
        SERIES_BOUNDS.bandHeadOffsetMm.min,
        SERIES_BOUNDS.bandHeadOffsetMm.max,
      ),
      1,
    ),
    bandTailOffsetMm: roundTo(
      clampFinite(
        raw.bandTailOffsetMm,
        d.bandTailOffsetMm,
        SERIES_BOUNDS.bandTailOffsetMm.min,
        SERIES_BOUNDS.bandTailOffsetMm.max,
      ),
      1,
    ),
    ornamentId: parseOrnamentId(raw.ornamentId),
    ornamentOffsetMm: roundTo(
      clampFinite(
        raw.ornamentOffsetMm,
        d.ornamentOffsetMm,
        SERIES_BOUNDS.ornamentOffsetMm.min,
        SERIES_BOUNDS.ornamentOffsetMm.max,
      ),
      1,
    ),
    panorama: parsePanoramaConfig(raw.panorama),
  };
}

function parseSequenceGroup(raw: unknown, fallbackIndex: number): SeriesSequenceGroup | null {
  if (!isRecord(raw)) return null;
  const id = isSeriesSequenceId(raw.id) ? asSeriesSequenceId(raw.id) : createSeriesSequenceId();
  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name.trim().slice(0, 120)
      : `Series ${fallbackIndex + 1}`;
  const startNumber = Math.round(
    clampFinite(
      raw.startNumber,
      1,
      SERIES_BOUNDS.sequenceStartNumber.min,
      SERIES_BOUNDS.sequenceStartNumber.max,
    ),
  );
  const sharedAuthor =
    typeof raw.sharedAuthor === 'string' && raw.sharedAuthor.trim().length > 0
      ? raw.sharedAuthor.trim().slice(0, 100)
      : null;

  return {
    id,
    name,
    volumeNumberStyle: parseVolumeStyle(raw.volumeNumberStyle),
    startNumber,
    sharedAuthor,
  };
}

function parseBookEntry(
  raw: unknown,
  fallbackIndex: number,
  validSequenceIds?: ReadonlySet<SeriesSequenceId>,
): SeriesBookEntry | null {
  if (!isRecord(raw)) return null;
  const id = isSeriesBookId(raw.id) ? asSeriesBookId(raw.id) : createSeriesBookId();
  const linkedProjectId = isProjectId(raw.linkedProjectId)
    ? asProjectId(raw.linkedProjectId)
    : null;
  const rawSequenceId = isSeriesSequenceId(raw.sequenceId)
    ? asSeriesSequenceId(raw.sequenceId)
    : null;
  const sequenceId =
    rawSequenceId && (!validSequenceIds || validSequenceIds.has(rawSequenceId))
      ? rawSequenceId
      : null;
  const title =
    typeof raw.title === 'string' && raw.title.trim().length > 0
      ? raw.title.slice(0, 140)
      : `Volume ${fallbackIndex + 1}`;
  const author = typeof raw.author === 'string' ? raw.author.slice(0, 100) : '';
  const volumeLabelOverride =
    typeof raw.volumeLabelOverride === 'string' ? raw.volumeLabelOverride.slice(0, 24) : '';
  const parameters = BookParametersModel.deserialize(raw.parameters);
  const opticalNudgeMm = roundTo(
    clampFinite(
      raw.opticalNudgeMm,
      0,
      SERIES_BOUNDS.opticalNudgeMm.min,
      SERIES_BOUNDS.opticalNudgeMm.max,
    ),
    2,
  );
  const fontSizeOverridePt =
    typeof raw.fontSizeOverridePt === 'number' && Number.isFinite(raw.fontSizeOverridePt)
      ? roundTo(
          clampFinite(
            raw.fontSizeOverridePt,
            DEFAULT_SERIES_SHARED_DESIGN.titleSizePt,
            SERIES_BOUNDS.titleSizePt.min,
            SERIES_BOUNDS.titleSizePt.max,
          ),
          1,
        )
      : null;

  return {
    id,
    linkedProjectId,
    sequenceId,
    title,
    author,
    volumeLabelOverride,
    parameters,
    spineBgColorOverride: parseOptionalHexColor(raw.spineBgColorOverride),
    textColorOverride: parseOptionalHexColor(raw.textColorOverride),
    accentColorOverride: parseOptionalHexColor(raw.accentColorOverride),
    opticalNudgeMm,
    fontSizeOverridePt,
  };
}

export const SeriesProjectModel = {
  createSeriesId,
  createSeriesBookId,
  createSeriesSequenceId,
  toRomanNumeral,
  formatVolumeLabel,

  createSequenceGroup(partial?: Partial<SeriesSequenceGroup>): SeriesSequenceGroup {
    const startNumber = Math.round(
      clampFinite(
        partial?.startNumber,
        1,
        SERIES_BOUNDS.sequenceStartNumber.min,
        SERIES_BOUNDS.sequenceStartNumber.max,
      ),
    );
    const sharedAuthor =
      typeof partial?.sharedAuthor === 'string' && partial.sharedAuthor.trim().length > 0
        ? partial.sharedAuthor.trim().slice(0, 100)
        : null;

    return {
      id: partial?.id ?? createSeriesSequenceId(),
      name: partial?.name?.trim() ? partial.name.trim().slice(0, 120) : 'Untitled Series',
      volumeNumberStyle: partial?.volumeNumberStyle ?? 'roman',
      startNumber,
      sharedAuthor,
    };
  },

  createBookEntry(partial?: Partial<SeriesBookEntry>): SeriesBookEntry {
    return {
      id: partial?.id ?? createSeriesBookId(),
      linkedProjectId: partial?.linkedProjectId ?? null,
      sequenceId: partial?.sequenceId ?? null,
      title: partial?.title ?? 'Untitled Volume',
      author: partial?.author ?? '',
      volumeLabelOverride: partial?.volumeLabelOverride ?? '',
      parameters: BookParametersModel.clampAndNormalize(
        partial?.parameters ?? BookParametersModel.createDefault(),
      ),
      spineBgColorOverride: partial?.spineBgColorOverride ?? null,
      textColorOverride: partial?.textColorOverride ?? null,
      accentColorOverride: partial?.accentColorOverride ?? null,
      opticalNudgeMm: roundTo(
        clampFinite(
          partial?.opticalNudgeMm,
          0,
          SERIES_BOUNDS.opticalNudgeMm.min,
          SERIES_BOUNDS.opticalNudgeMm.max,
        ),
        2,
      ),
      fontSizeOverridePt:
        typeof partial?.fontSizeOverridePt === 'number' &&
        Number.isFinite(partial.fontSizeOverridePt)
          ? roundTo(
              clampFinite(
                partial.fontSizeOverridePt,
                DEFAULT_SERIES_SHARED_DESIGN.titleSizePt,
                SERIES_BOUNDS.titleSizePt.min,
                SERIES_BOUNDS.titleSizePt.max,
              ),
              1,
            )
          : null,
    };
  },

  createDefault(): SeriesProject {
    const baseParams = BookParametersModel.createDefault();
    return {
      schemaVersion: SERIES_SCHEMA_VERSION,
      id: createSeriesId(),
      name: 'The Obsidian Chronicles',
      mode: 'series',
      updatedAt: new Date().toISOString(),
      books: [
        this.createBookEntry({
          title: 'The Shadow Archive',
          author: 'E. V. Hawthorne',
          parameters: { ...baseParams, pbThicknessMm: 24 },
        }),
        this.createBookEntry({
          title: 'The Gilded Labyrinth',
          author: 'E. V. Hawthorne',
          parameters: { ...baseParams, pbThicknessMm: 34 },
        }),
        this.createBookEntry({
          title: 'The Crown of Ash',
          author: 'E. V. Hawthorne',
          parameters: { ...baseParams, pbThicknessMm: 44 },
        }),
      ],
      sequences: [],
      shared: {
        ...DEFAULT_SERIES_SHARED_DESIGN,
        panorama: { ...DEFAULT_SERIES_PANORAMA },
      },
    };
  },

  validate(series: SeriesProject): SeriesValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!series.name.trim()) {
      errors.push('Series or collection name cannot be empty.');
    }
    if (series.books.length === 0) {
      errors.push('Add at least one book to the shelf.');
    }
    if (series.books.length > SERIES_BOUNDS.maxBooks) {
      errors.push(`A shelf may contain at most ${SERIES_BOUNDS.maxBooks} books.`);
    }

    const seenSequenceIds = new Set<SeriesSequenceId>();
    for (let i = 0; i < series.sequences.length; i++) {
      const seq = series.sequences[i];
      if (seenSequenceIds.has(seq.id)) {
        errors.push(`Duplicate sequence ID at position ${i + 1}.`);
      }
      seenSequenceIds.add(seq.id);
      if (!seq.name.trim()) {
        errors.push(`Sequence ${i + 1} name cannot be empty.`);
      }
    }

    const seenIds = new Set<string>();
    for (let i = 0; i < series.books.length; i++) {
      const book = series.books[i];
      if (seenIds.has(book.id)) {
        errors.push(`Duplicate book ID at position ${i + 1}.`);
      }
      seenIds.add(book.id);

      if (book.sequenceId && !seenSequenceIds.has(book.sequenceId)) {
        warnings.push(
          `Book ${i + 1} (${book.title || 'Untitled'}) references an unknown sequence ID.`,
        );
      }

      const paramValidation = BookParametersModel.validate(book.parameters);
      if (!paramValidation.isValid) {
        errors.push(`Book ${i + 1} (${book.title || 'Untitled'}): ${paramValidation.errors[0]}`);
      }
      if (book.parameters.pbThicknessMm < 10) {
        warnings.push(
          `Book ${i + 1} (${book.title || 'Untitled'}) has a narrow ${book.parameters.pbThicknessMm.toFixed(1)} mm thickness — lettering will clamp automatically.`,
        );
      }
    }

    if (series.shared.panorama.enabled && !series.shared.panorama.dataUrl) {
      warnings.push('Panoramic artwork is enabled, but no image is loaded.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  },

  serialize(
    series: SeriesProject,
    options?: { readonly includePanoramaData?: boolean },
  ): SeriesProject {
    const includePanoramaData = options?.includePanoramaData ?? true;

    const validSequences: SeriesSequenceGroup[] = [];
    const validSequenceIds = new Set<SeriesSequenceId>();
    for (const seq of series.sequences ?? []) {
      if (validSequenceIds.has(seq.id)) continue;
      validSequenceIds.add(seq.id);
      validSequences.push({
        id: seq.id,
        name: seq.name.trim().slice(0, 120) || 'Untitled Series',
        volumeNumberStyle: seq.volumeNumberStyle,
        startNumber: Math.round(
          clampFinite(
            seq.startNumber,
            1,
            SERIES_BOUNDS.sequenceStartNumber.min,
            SERIES_BOUNDS.sequenceStartNumber.max,
          ),
        ),
        sharedAuthor:
          typeof seq.sharedAuthor === 'string' && seq.sharedAuthor.trim().length > 0
            ? seq.sharedAuthor.trim().slice(0, 100)
            : null,
      });
    }

    return {
      schemaVersion: SERIES_SCHEMA_VERSION,
      id: series.id,
      name: series.name.trim() || 'Untitled Series',
      mode: series.mode,
      updatedAt: series.updatedAt || new Date().toISOString(),
      books: series.books.map((book) => ({
        ...book,
        sequenceId:
          book.sequenceId && validSequenceIds.has(book.sequenceId) ? book.sequenceId : null,
        parameters: BookParametersModel.serialize(book.parameters),
      })),
      sequences: validSequences,
      shared: {
        ...series.shared,
        panorama: {
          ...series.shared.panorama,
          enabled: includePanoramaData ? series.shared.panorama.enabled : false,
          dataUrl: includePanoramaData ? series.shared.panorama.dataUrl : null,
          fileName: includePanoramaData ? series.shared.panorama.fileName : null,
          naturalWidth: includePanoramaData ? series.shared.panorama.naturalWidth : 0,
          naturalHeight: includePanoramaData ? series.shared.panorama.naturalHeight : 0,
        },
      },
    };
  },

  toJson(
    series: SeriesProject,
    options?: { readonly includePanoramaData?: boolean },
  ): string {
    return JSON.stringify(this.serialize(series, options), null, 2);
  },

  fromUnknown(raw: unknown): SeriesParseResult {
    if (!isRecord(raw)) {
      return { ok: false, error: 'Series file must be a JSON object.' };
    }
    if (raw.schemaVersion !== SERIES_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported series schema version: ${String(raw.schemaVersion)}.`,
      };
    }
    if (!Array.isArray(raw.books) || raw.books.length === 0) {
      return { ok: false, error: 'Series file must include a non-empty "books" array.' };
    }

    const parsedSequences: SeriesSequenceGroup[] = [];
    const validSequenceIds = new Set<SeriesSequenceId>();
    if (Array.isArray(raw.sequences)) {
      for (let i = 0; i < Math.min(raw.sequences.length, SERIES_BOUNDS.maxSequences); i++) {
        const seq = parseSequenceGroup(raw.sequences[i], i);
        if (seq && !validSequenceIds.has(seq.id)) {
          validSequenceIds.add(seq.id);
          parsedSequences.push(seq);
        }
      }
    }

    const parsedBooks: SeriesBookEntry[] = [];
    for (let i = 0; i < Math.min(raw.books.length, SERIES_BOUNDS.maxBooks); i++) {
      const entry = parseBookEntry(raw.books[i], i, validSequenceIds);
      if (entry) {
        parsedBooks.push(entry);
      }
    }

    if (parsedBooks.length === 0) {
      return { ok: false, error: 'No valid book entries found in series file.' };
    }

    const id = isSeriesId(raw.id) ? asSeriesId(raw.id) : createSeriesId();
    const name =
      typeof raw.name === 'string' && raw.name.trim().length > 0
        ? raw.name.trim().slice(0, 120)
        : 'Imported Series';
    const updatedAt =
      typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
        ? raw.updatedAt
        : new Date().toISOString();

    return {
      ok: true,
      series: {
        schemaVersion: SERIES_SCHEMA_VERSION,
        id,
        name,
        mode: parseCollectionMode(raw.mode),
        updatedAt,
        books: parsedBooks,
        sequences: parsedSequences,
        shared: parseSharedDesign(raw.shared),
      },
    };
  },

  fromJson(jsonText: string): SeriesParseResult {
    try {
      const parsed: unknown = JSON.parse(jsonText);
      return this.fromUnknown(parsed);
    } catch {
      return { ok: false, error: 'Invalid JSON syntax in series file.' };
    }
  },

  suggestFileName(seriesName: string): string {
    const slug = (seriesName.trim() || 'bookbinder-series')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56);
    return `${slug || 'bookbinder-series'}-series.json`;
  },
} as const;
