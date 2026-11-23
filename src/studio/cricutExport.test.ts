import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import {
  DEFAULT_CRICUT_EXPORT_OPTIONS,
  generateCricutHtvSvg,
} from './cricutExport';

const REAL_WOFF_BYTES = new Uint8Array(
  readFileSync(
    resolve(
      process.cwd(),
      'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff',
    ),
  ),
);

describe('cricutExport — Cricut / Silhouette / ScanNCut HTV Vector SVG', () => {
  it('converts spine title & horizontal author to flattened vector paths with zero <text> or transform attributes', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'DUNE',
        author: 'FRANK HERBERT',
        layout: 'stacked' as const,
        authorOrientation: 'horizontal' as const,
      },
    };

    const result = await generateCricutHtvSvg(
      geom,
      studio,
      null,
      DEFAULT_CRICUT_EXPORT_OPTIONS,
      REAL_WOFF_BYTES,
    );

    expect(result.hasLettering).toBe(true);
    expect(result.fitsCricutJoy).toBe(true);
    expect(result.fitsStandard12x12).toBe(true);
    expect(result.fitsLarge12x24).toBe(true);
    expect(result.pathCount).toBe(3); // registration marks + weeding box + compound spine lettering
    expect(result.fileName).toBe('dune_cricut_htv_spine.svg');

    // Explicit physical mm dimensions & viewBox for 1:1 Cricut Design Space import
    expect(result.svg).toContain(`width="${result.widthMm}mm"`);
    expect(result.svg).toContain(`height="${result.heightMm}mm"`);
    expect(result.svg).toContain(`viewBox="0 0 ${result.widthMm} ${result.heightMm}"`);

    // Cricut Design Space hygiene: ZERO <text> tags, ZERO transform attributes, real M/Q/L/Z curves
    expect(result.svg).not.toContain('<text');
    expect(result.svg).not.toContain('transform=');
    expect(result.svg).toContain('id="spine-lettering"');
    expect(result.svg).toContain('id="htv-weeding-box"');
    expect(result.svg).toContain('id="alignment-registration-marks"');
  });

  it('mirrors coordinates horizontally for HTV iron-on and supports Full Wrap with Outer Cut Polygon', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'TWENTY THOUSAND LEAGUES',
        author: 'JULES VERNE',
      },
    };

    const unmirrored = await generateCricutHtvSvg(
      geom,
      studio,
      null,
      {
        scope: 'full-wrap',
        includeLettering: true,
        includeWeedingBox: true,
        includeRegistrationMarks: true,
        includeOuterCutOutline: true,
        mirrorForHtv: false,
      },
      REAL_WOFF_BYTES,
    );

    const mirrored = await generateCricutHtvSvg(
      geom,
      studio,
      null,
      {
        scope: 'full-wrap',
        includeLettering: true,
        includeWeedingBox: true,
        includeRegistrationMarks: true,
        includeOuterCutOutline: true,
        mirrorForHtv: true,
      },
      REAL_WOFF_BYTES,
    );

    expect(unmirrored.widthMm).toBeCloseTo(366, 1);
    expect(unmirrored.heightMm).toBeCloseTo(259, 1);
    expect(unmirrored.fitsCricutJoy).toBe(false);
    expect(unmirrored.fitsLarge12x24).toBe(true);
    expect(unmirrored.svg).toContain('id="outer-wrap-cut"');
    expect(mirrored.fileName).toContain('_fullwrap_mirrored.svg');
    // Mirrored SVG must differ from unmirrored SVG and still have zero transform attributes
    expect(mirrored.svg).not.toBe(unmirrored.svg);
    expect(mirrored.svg).not.toContain('transform=');
  });
});
