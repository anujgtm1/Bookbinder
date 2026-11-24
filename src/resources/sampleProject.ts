import { calculateCaseGeometry } from '@/core/geometry';
import { computeStudioCanvasSpec } from '@/studio/canvasSpec';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import { BookbinderProjectModel, type BookbinderProject } from '@/types/project';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { roundTo } from '@/types/units';

export interface SampleBookPreset {
  readonly id: string;
  readonly label: string;
  readonly author: string;
  readonly summary: string;
  readonly createProject: () => BookbinderProject;
}

const SAMPLE_NAVY_HEX = '#15283b';
const SAMPLE_GOLD_HEX = '#d8b467';
const SAMPLE_LIGHT_GOLD_HEX = '#e8d4a2';
const SAMPLE_PARCHMENT_HEX = '#f3ebdc';

/**
 * Self-contained seamless 120x120 SVG tile depicting a classic combed-wave marbled endpaper
 * in Prussian navy, slate teal, antique gold, and warm cream parchment.
 */
const MARBLED_WAVE_TILE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">',
  `<rect width="120" height="120" fill="${SAMPLE_PARCHMENT_HEX}"/>`,
  '<path d="M0 15 C20 5 40 25 60 15 C80 5 100 25 120 15 L120 27 C100 37 80 17 60 27 C40 37 20 17 0 27 Z" fill="#1e3a52" opacity="0.22"/>',
  '<path d="M0 45 C20 35 40 55 60 45 C80 35 100 55 120 45 L120 58 C100 68 80 48 60 58 C40 68 20 48 0 58 Z" fill="#2d546b" opacity="0.18"/>',
  '<path d="M0 75 C20 65 40 85 60 75 C80 65 100 85 120 75 L120 87 C100 97 80 77 60 87 C40 97 20 77 0 87 Z" fill="#1e3a52" opacity="0.22"/>',
  '<path d="M0 105 C20 95 40 115 60 105 C80 95 100 115 120 105 L120 116 C100 126 80 106 60 116 C40 126 20 106 0 116 Z" fill="#2d546b" opacity="0.18"/>',
  '<path d="M0 21 C20 11 40 31 60 21 C80 11 100 31 120 21" fill="none" stroke="#c9a252" stroke-width="1.3" opacity="0.65"/>',
  '<path d="M0 51 C20 41 40 61 60 51 C80 41 100 61 120 51" fill="none" stroke="#15283b" stroke-width="1.1" opacity="0.38"/>',
  '<path d="M0 81 C20 71 40 91 60 81 C80 71 100 91 120 81" fill="none" stroke="#c9a252" stroke-width="1.3" opacity="0.65"/>',
  '<path d="M0 111 C20 101 40 121 60 111 C80 101 100 121 120 111" fill="none" stroke="#15283b" stroke-width="1.1" opacity="0.38"/>',
  '<path d="M0 34 C15 26 30 42 45 34 C60 26 75 42 90 34 C105 26 112 38 120 34" fill="none" stroke="#8aa3b0" stroke-width="0.9" opacity="0.5"/>',
  '<path d="M0 94 C15 86 30 102 45 94 C60 86 75 102 90 94 C105 86 112 98 120 94" fill="none" stroke="#8aa3b0" stroke-width="0.9" opacity="0.5"/>',
  '</svg>',
].join('');

export const SAMPLE_MARBLED_ENDPAPER_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MARBLED_WAVE_TILE_SVG)}`;

/**
 * Generates a richly styled, ready-to-orbit US Trade Digest hardcover sample project:
 * "Twenty Thousand Leagues Under the Seas" by Jules Verne (140 x 216 x 24 mm, rigid-case).
 */
export function createSampleBookProject(): BookbinderProject {
  const parameters: BookParameters = BookParametersModel.clampAndNormalize({
    bindingStyle: 'rigid-case',
    pbWidthMm: 140.0,
    pbHeightMm: 216.0,
    pbThicknessMm: 24.0,
    boardThicknessMm: 2.0,
    hingeWidthMm: 9.0,
    overhangTopBottomMm: 7.0,
    overhangForeEdgeMm: 3.0,
    spineAllowanceLinked: true,
    turnInMm: 18.0,
    miterFactor: 1.5,
    bleedMm: 3.0,
    includeBleed: true,
    pocketDepthPct: 72,
    pocketFlapMm: 12.0,
    splitMode: 'single',
    pdfPageSize: 'letter',
    printMedia: 'exact-auto',
    unit: 'mm',
  });

  const geometry = calculateCaseGeometry(parameters);
  const canvasSpec = computeStudioCanvasSpec(geometry);

  const frontCanvas = canvasSpec.frontBoardRect;
  const backCanvas = canvasSpec.backBoardRect;
  const spineCanvas = canvasSpec.spineBoardRect;

  const frontCx = roundTo(frontCanvas.x + frontCanvas.width / 2, 2);
  const backCx = roundTo(backCanvas.x + backCanvas.width / 2, 2);

  const frameInset = 11.0;
  const compassSize = 46.0;
  const spinePadX = 2.2;
  const spinePadY = 9.0;

  const ornaments: readonly CoverOrnamentLayer[] = [
    {
      id: 'sample-orn-front-frame',
      presetId: 'frame-double-rule',
      zone: 'front',
      xMm: roundTo(frontCanvas.x + frameInset, 2),
      yMm: roundTo(frontCanvas.y + frameInset, 2),
      widthMm: roundTo(frontCanvas.width - frameInset * 2, 2),
      heightMm: roundTo(frontCanvas.height - frameInset * 2, 2),
      color: SAMPLE_GOLD_HEX,
      strokeWidthMm: 0.7,
    },
    {
      id: 'sample-orn-front-compass',
      presetId: 'emblem-compass-rose',
      zone: 'front',
      xMm: roundTo(frontCx - compassSize / 2, 2),
      yMm: roundTo(frontCanvas.y + frontCanvas.height * 0.59 - compassSize / 2, 2),
      widthMm: compassSize,
      heightMm: compassSize,
      color: SAMPLE_GOLD_HEX,
      strokeWidthMm: 0.7,
    },
    {
      id: 'sample-orn-spine-bands',
      presetId: 'spine-head-tail-bands',
      zone: 'spine',
      xMm: roundTo(spineCanvas.x + spinePadX, 2),
      yMm: roundTo(spineCanvas.y + spinePadY, 2),
      widthMm: roundTo(spineCanvas.width - spinePadX * 2, 2),
      heightMm: roundTo(spineCanvas.height - spinePadY * 2, 2),
      color: SAMPLE_GOLD_HEX,
      strokeWidthMm: 0.65,
    },
    {
      id: 'sample-orn-back-divider',
      presetId: 'divider-diamond-rule',
      zone: 'back',
      xMm: roundTo(backCx - 30, 2),
      yMm: roundTo(backCanvas.y + backCanvas.height * 0.31, 2),
      widthMm: 60,
      heightMm: 10,
      color: SAMPLE_GOLD_HEX,
      strokeWidthMm: 0.65,
    },
  ];

  const textLayers: readonly CoverTextLayer[] = [
    {
      id: 'sample-txt-front-title',
      text: 'TWENTY THOUSAND\nLEAGUES',
      zone: 'front',
      xMm: frontCx,
      yMm: roundTo(frontCanvas.y + frontCanvas.height * 0.25, 2),
      fontId: 'eb-garamond',
      fontSizePt: 22,
      letterSpacingEm: 0.09,
      lineHeight: 1.22,
      align: 'center',
      color: SAMPLE_GOLD_HEX,
      uppercase: true,
      role: 'title',
    },
    {
      id: 'sample-txt-front-subtitle',
      text: 'UNDER THE SEAS',
      zone: 'front',
      xMm: frontCx,
      yMm: roundTo(frontCanvas.y + frontCanvas.height * 0.38, 2),
      fontId: 'eb-garamond',
      fontSizePt: 11.5,
      letterSpacingEm: 0.18,
      lineHeight: 1.25,
      align: 'center',
      color: SAMPLE_LIGHT_GOLD_HEX,
      uppercase: true,
      role: 'subtitle',
    },
    {
      id: 'sample-txt-front-author',
      text: 'JULES VERNE',
      zone: 'front',
      xMm: frontCx,
      yMm: roundTo(frontCanvas.y + frontCanvas.height * 0.8, 2),
      fontId: 'eb-garamond',
      fontSizePt: 13,
      letterSpacingEm: 0.2,
      lineHeight: 1.25,
      align: 'center',
      color: SAMPLE_GOLD_HEX,
      uppercase: true,
      role: 'author',
    },
    {
      id: 'sample-txt-back-blurb',
      text: '"The sea is everything.\nIt covers seven tenths of the\nterrestrial globe. Its breath is\npure and healthy."\n\n- Captain Nemo',
      zone: 'back',
      xMm: backCx,
      yMm: roundTo(backCanvas.y + backCanvas.height * 0.51, 2),
      fontId: 'eb-garamond',
      fontSizePt: 10.5,
      letterSpacingEm: 0.03,
      lineHeight: 1.44,
      align: 'center',
      color: SAMPLE_LIGHT_GOLD_HEX,
      role: 'blurb',
    },
  ];

  const baseStudio = CoverStudioModel.createDefault();
  const studio: CoverStudioState = CoverStudioModel.deserialize({
    ...baseStudio,
    frontBgColor: SAMPLE_NAVY_HEX,
    spineBgColor: SAMPLE_NAVY_HEX,
    backBgColor: SAMPLE_NAVY_HEX,
    textLayers,
    ornaments,
    spineText: {
      title: 'Twenty Thousand Leagues',
      author: 'Jules Verne',
      layout: 'stacked',
      orientation: 'top-to-bottom',
      authorOrientation: 'horizontal',
      fontId: 'eb-garamond',
      customFontName: null,
      fontSizePt: 18,
      textColor: SAMPLE_GOLD_HEX,
      opticalNudgeMm: 0,
    },
    cutLineMode: 'full-cut-miter',
    pocketStyle: {
      ...baseStudio.pocketStyle,
      backgroundColor: SAMPLE_PARCHMENT_HEX,
      layers: [
        {
          id: 'sample-endpaper-marbled-tile',
          dataUrl: SAMPLE_MARBLED_ENDPAPER_DATA_URL,
          fileName: 'nautilus-marbled-endpaper.svg',
          naturalWidth: 120,
          naturalHeight: 120,
          xMm: 0,
          yMm: 0,
          widthMm: 36,
          heightMm: 36,
          clipZone: 'none',
          tiled: true,
        },
      ],
      imageFitMode: 'tile',
      imageOpacity: 0.92,
      styleScope: 'faces-only',
    },
  });

  return BookbinderProjectModel.create(
    parameters,
    studio,
    'Twenty Thousand Leagues Under the Seas',
  );
}

export const SAMPLE_BOOK_PRESETS: readonly SampleBookPreset[] = [
  {
    id: 'twenty-thousand-leagues',
    label: 'Twenty Thousand Leagues Under the Seas',
    author: 'Jules Verne',
    summary:
      'US Trade Digest hardcover in Prussian navy & antique gold foil with compass rose, spine bands, and marbled endpapers.',
    createProject: createSampleBookProject,
  },
] as const;
