export type PdfGuideTargetKind = 'print' | 'template';

export interface PdfGuideOptions {
  /** Solid red outer trim / cut outline (`outerCutPolygon`). */
  readonly includeCutLines: boolean;
  /** Dashed blue interior fold / score lines across the cover or piece. */
  readonly includeFoldLines: boolean;
  /** Short solid blue external registration ticks outside the cut perimeter aligned with fold lines. */
  readonly includeFoldGuideTicks: boolean;
}

export interface PdfGuideOptionsInput {
  readonly includeCutLines?: boolean;
  readonly includeFoldLines?: boolean;
  readonly includeFoldGuideTicks?: boolean;
  /**
   * Legacy combined guide toggle preserved for backward compatibility:
   * `true` enables all 3 marks, `false` disables all 3 marks; explicit granular booleans always win.
   */
  readonly includeGuides?: boolean;
}

const PRINT_DEFAULTS: Readonly<PdfGuideOptions> = {
  includeCutLines: true,
  includeFoldLines: false,
  includeFoldGuideTicks: true,
} as const;

const TEMPLATE_DEFAULTS: Readonly<PdfGuideOptions> = {
  includeCutLines: true,
  includeFoldLines: true,
  includeFoldGuideTicks: true,
} as const;

export const PdfGuideOptionsModel = {
  createDefaults(targetKind: PdfGuideTargetKind): PdfGuideOptions {
    return targetKind === 'print' ? { ...PRINT_DEFAULTS } : { ...TEMPLATE_DEFAULTS };
  },

  resolve(
    targetKind: PdfGuideTargetKind,
    input?: PdfGuideOptionsInput,
    fallbackCutLines?: boolean,
  ): PdfGuideOptions {
    const base: PdfGuideOptions =
      input?.includeGuides !== undefined
        ? {
            includeCutLines: input.includeGuides,
            includeFoldLines: input.includeGuides,
            includeFoldGuideTicks: input.includeGuides,
          }
        : (() => {
            const defaults = this.createDefaults(targetKind);
            return {
              ...defaults,
              includeCutLines: fallbackCutLines ?? defaults.includeCutLines,
            };
          })();

    return {
      includeCutLines: input?.includeCutLines ?? base.includeCutLines,
      includeFoldLines: input?.includeFoldLines ?? base.includeFoldLines,
      includeFoldGuideTicks: input?.includeFoldGuideTicks ?? base.includeFoldGuideTicks,
    };
  },
} as const;
