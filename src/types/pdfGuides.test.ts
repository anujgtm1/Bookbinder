import { describe, expect, it } from 'vitest';
import { PdfGuideOptionsModel } from './pdfGuides';

describe('PdfGuideOptionsModel', () => {
  it('returns exact defaults for print vs template targets', () => {
    expect(PdfGuideOptionsModel.createDefaults('print')).toEqual({
      includeCutLines: true,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });

    expect(PdfGuideOptionsModel.createDefaults('template')).toEqual({
      includeCutLines: true,
      includeFoldLines: true,
      includeFoldGuideTicks: true,
    });
  });

  it('resolves granular overrides, fallbackCutLines, and legacy includeGuides cleanly', () => {
    expect(PdfGuideOptionsModel.resolve('print', undefined, false)).toEqual({
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });

    expect(PdfGuideOptionsModel.resolve('print', { includeGuides: true })).toEqual({
      includeCutLines: true,
      includeFoldLines: true,
      includeFoldGuideTicks: true,
    });

    expect(PdfGuideOptionsModel.resolve('template', { includeGuides: false })).toEqual({
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: false,
    });

    // Explicit granular booleans override legacy includeGuides
    expect(
      PdfGuideOptionsModel.resolve('print', {
        includeGuides: false,
        includeFoldGuideTicks: true,
      }),
    ).toEqual({
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });

    expect(
      PdfGuideOptionsModel.resolve('template', {
        includeFoldLines: false,
      }),
    ).toEqual({
      includeCutLines: true,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });
  });
});
