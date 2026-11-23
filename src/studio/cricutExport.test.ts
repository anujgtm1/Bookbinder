import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
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

  it('exports Front Cover text layers and Classic Ornaments in front-cover scope with zero <text> tags', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const frontRect = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };
    const frontTitle = {
      ...CoverTextLayerModel.createPreset('front-title', frontRect),
      text: 'MOBY DICK',
    };
    const frame = CoverOrnamentLayerModel.createForZone('frame-double-rule', frontRect, 'front');
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [frontTitle],
      ornaments: [frame],
    };

    const result = await generateCricutHtvSvg(
      geom,
      studio,
      null,
      {
        ...DEFAULT_CRICUT_EXPORT_OPTIONS,
        scope: 'front-cover',
        includeLettering: true,
        includeOrnaments: true,
      },
      REAL_WOFF_BYTES,
    );

    expect(result.hasLettering).toBe(true);
    expect(result.fileName).toBe('moby_dick_cricut_htv_front.svg');
    expect(result.widthMm).toBeCloseTo(geom.outerWrap.frontBoardRect.width + 12, 1);
    expect(result.svg).toContain('id="classic-ornaments"');
    expect(result.svg).toContain('id="spine-lettering"');
    expect(result.svg).toContain('id="htv-weeding-box"');
    expect(result.svg).not.toContain('<text');
    expect(result.svg).not.toContain('transform=');

    const flippedStudio = {
      ...studio,
      textLayers: [{ ...frontTitle, flipX: true, flipY: true }],
    };
    const flippedResult = await generateCricutHtvSvg(
      geom,
      flippedStudio,
      null,
      {
        ...DEFAULT_CRICUT_EXPORT_OPTIONS,
        scope: 'front-cover',
        includeLettering: true,
        includeOrnaments: true,
      },
      REAL_WOFF_BYTES,
    );
    expect(flippedResult.svg).not.toBe(result.svg);
    expect(flippedResult.svg).not.toContain('transform=');
    expect(flippedResult.svg).not.toContain('NaN');
  });

  it('groups filled paths by normalized foil color when groupByColor is true and populates foilColors', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const frontRect = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };
    const goldTitle = {
      ...CoverTextLayerModel.createPreset('front-title', frontRect),
      text: 'ILIAD',
      color: '#d4af37',
    };
    const creamFrame = CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      frontRect,
      'front',
      '#f5efe2',
    );
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [goldTitle],
      ornaments: [creamFrame],
    };

    const result = await generateCricutHtvSvg(
      geom,
      studio,
      null,
      {
        ...DEFAULT_CRICUT_EXPORT_OPTIONS,
        scope: 'front-cover',
        includeLettering: true,
        includeOrnaments: true,
        groupByColor: true,
      },
      REAL_WOFF_BYTES,
    );

    expect(result.hasLettering).toBe(true);
    expect(result.foilColors).toEqual(['#D4AF37', '#F5EFE2']);
    expect(result.fileName).toBe('iliad_cricut_htv_front_multicolor.svg');

    // Distinct per-color compound paths with lowercase hex id and uppercase hex fill
    expect(result.svg).toContain('id="foil-color-d4af37"');
    expect(result.svg).toContain('fill="#D4AF37"');
    expect(result.svg).toContain('id="foil-color-f5efe2"');
    expect(result.svg).toContain('fill="#F5EFE2"');
    expect(result.svg).not.toContain('id="classic-ornaments"');
    expect(result.svg).not.toContain('id="spine-lettering"');

    // Cricut hygiene preserved
    expect(result.svg).not.toContain('<text');
    expect(result.svg).not.toContain('transform=');
  });
});
