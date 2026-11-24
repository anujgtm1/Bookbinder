import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  rotateOrnament90,
} from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import {
  DEFAULT_CRICUT_EXPORT_OPTIONS,
  detectCricutScopePresence,
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

    const rotatedStudio = {
      ...studio,
      textLayers: [{ ...frontTitle, text: 'MOBY\nDICK', rotationDeg: 90 as const, flipX: true }],
      ornaments: [rotateOrnament90(frame)],
    };
    const rotatedResult = await generateCricutHtvSvg(
      geom,
      rotatedStudio,
      null,
      {
        ...DEFAULT_CRICUT_EXPORT_OPTIONS,
        scope: 'front-cover',
        includeLettering: true,
        includeOrnaments: true,
        mirrorForHtv: true,
      },
      REAL_WOFF_BYTES,
    );
    expect(rotatedResult.hasLettering).toBe(true);
    expect(rotatedResult.svg).not.toBe(result.svg);
    expect(rotatedResult.svg).not.toContain('<text');
    expect(rotatedResult.svg).not.toContain('transform=');
    expect(rotatedResult.svg).not.toContain('NaN');
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

  it('includes text, ornaments, and custom SVG stamps geometrically by coordinates even when layer.zone is stale', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const backRect = {
      x: geom.outerWrap.backBoardRect.x + bleed,
      y: geom.outerWrap.backBoardRect.y + bleed,
      width: geom.outerWrap.backBoardRect.width,
      height: geom.outerWrap.backBoardRect.height,
    };

    // Simulate elements created on Front (stale zone: 'front') and dragged onto Back Cover
    const movedText = {
      ...CoverTextLayerModel.createPreset('front-title', backRect),
      zone: 'front' as const,
      text: 'BACK COLOPHON',
    };
    const movedOrnament = {
      ...CoverOrnamentLayerModel.createForZone('emblem-compass-rose', backRect, 'front'),
      zone: 'front' as const,
    };
    const movedCustomSvg = CoverOrnamentLayerModel.createCustomSvg({
      name: 'ex-libris',
      paths: ['M 0 0 L 100 0 L 100 100 L 0 100 Z'],
      viewBoxWidth: 100,
      viewBoxHeight: 100,
      renderMode: 'stroke',
      targetBoardRectMm: backRect,
      zone: 'front',
    });

    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [movedText],
      ornaments: [movedOrnament, movedCustomSvg],
    };

    const presence = detectCricutScopePresence(geom, studio);
    expect(presence).toEqual({ spine: false, front: false, back: true, any: true });

    const backResult = await generateCricutHtvSvg(
      geom,
      studio,
      null,
      {
        ...DEFAULT_CRICUT_EXPORT_OPTIONS,
        scope: 'back-cover',
        includeLettering: true,
        includeOrnaments: true,
      },
      REAL_WOFF_BYTES,
    );

    expect(backResult.hasLettering).toBe(true);
    expect(backResult.svg).toContain('id="spine-lettering"');
    expect(backResult.svg).toContain('id="classic-ornaments"');
    expect(backResult.svg).toContain(`id="custom-svg-stroke-${movedCustomSvg.id}"`);
    expect(backResult.svg).toContain('id="htv-weeding-box"');
    expect(backResult.svg).not.toContain('<text');
    expect(backResult.svg).not.toContain('<image');
    expect(backResult.svg).not.toContain('transform=');

    const backPoints = extractAllPathCoordinates(backResult.svg);
    expect(backPoints.length).toBeGreaterThan(20);
    for (const pt of backPoints) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(backResult.widthMm + 0.01);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(backResult.heightMm + 0.01);
    }

    // Must NOT leak off-canvas into front-cover scope despite stale zone: 'front'
    const frontResult = await generateCricutHtvSvg(
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

    expect(frontResult.hasLettering).toBe(false);
    expect(frontResult.svg).not.toContain('id="spine-lettering"');
    expect(frontResult.svg).not.toContain('id="classic-ornaments"');
    expect(frontResult.svg).not.toContain('id="htv-weeding-box"');
  });

  it('dynamically expands viewBox for overhanging flap/turn-in designs while keeping alignment marks anchored to the board corners', async () => {
    const geom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      jacketFlapWidthMm: 75,
    });
    const bleed = geom.outerWrap.bleedMm;
    const frontBoard = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };

    // Place a wide ornament extending 30 mm onto the front dust-jacket flap (well beyond +6 mm matPad)
    // and a second emblem overhanging 18 mm past the left edge of the front board
    const flapOrnament = {
      ...CoverOrnamentLayerModel.createForZone('emblem-compass-rose', frontBoard, 'front'),
      xMm: frontBoard.x + frontBoard.width - 10,
      yMm: frontBoard.y + 40,
      widthMm: 45,
      heightMm: 45,
    };
    const leftOverhangText = {
      ...CoverTextLayerModel.createPreset('front-title', frontBoard),
      text: 'WIDE EDITION',
      xMm: frontBoard.x + 12,
      yMm: frontBoard.y + 80,
      fontSizePt: 34,
    };

    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [leftOverhangText],
      ornaments: [flapOrnament],
    };

    for (const mirrorForHtv of [false, true]) {
      const result = await generateCricutHtvSvg(
        geom,
        studio,
        null,
        {
          ...DEFAULT_CRICUT_EXPORT_OPTIONS,
          scope: 'front-cover',
          includeLettering: true,
          includeOrnaments: true,
          includeWeedingBox: true,
          includeRegistrationMarks: true,
          mirrorForHtv,
        },
        REAL_WOFF_BYTES,
      );

      // ViewBox must expand wider than the default board + 12 mm padding
      expect(result.widthMm).toBeGreaterThan(frontBoard.width + 40);
      expect(result.svg).toContain(`width="${result.widthMm}mm"`);
      expect(result.svg).toContain(`height="${result.heightMm}mm"`);
      expect(result.svg).toContain(`viewBox="0 0 ${result.widthMm} ${result.heightMm}"`);
      expect(result.svg).not.toContain('<text');
      expect(result.svg).not.toContain('<image');
      expect(result.svg).not.toContain('transform=');

      // Zero coordinates may fall outside [0, widthMm] × [0, heightMm]
      const allPts = extractAllPathCoordinates(result.svg);
      expect(allPts.length).toBeGreaterThan(20);
      for (const pt of allPts) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(result.widthMm + 0.01);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(result.heightMm + 0.01);
      }

      // Corner alignment L-brackets must remain anchored strictly to the physical board dimensions
      const regMatch = result.svg.match(/id="alignment-registration-marks"\s+d="([^"]+)"/);
      expect(regMatch).not.toBeNull();
      const regPts = extractCoordsFromPathD(regMatch![1]);
      const regMinX = Math.min(...regPts.map((p) => p.x));
      const regMaxX = Math.max(...regPts.map((p) => p.x));
      const regMinY = Math.min(...regPts.map((p) => p.y));
      const regMaxY = Math.max(...regPts.map((p) => p.y));

      expect(regMaxX - regMinX).toBeCloseTo(frontBoard.width, 1);
      expect(regMaxY - regMinY).toBeCloseTo(frontBoard.height, 1);
      // Because design overhangs both left and right of frontBoard, marks are inset further than default 6 mm
      expect(regMinX).toBeGreaterThan(10);
      expect(result.widthMm - regMaxX).toBeGreaterThan(30);
    }
  });
});

function extractCoordsFromPathD(d: string): { readonly x: number; readonly y: number }[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const points: { readonly x: number; readonly y: number }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'Z') continue;
    const pairCount = cmd === 'M' || cmd === 'L' ? 1 : cmd === 'Q' ? 2 : cmd === 'C' ? 3 : 0;
    for (let p = 0; p < pairCount; p++) {
      const x = Number.parseFloat(tokens[i++] ?? 'NaN');
      const y = Number.parseFloat(tokens[i++] ?? 'NaN');
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

function extractAllPathCoordinates(svg: string): { readonly x: number; readonly y: number }[] {
  const points: { readonly x: number; readonly y: number }[] = [];
  for (const match of svg.matchAll(/\sd="([^"]+)"/g)) {
    points.push(...extractCoordsFromPathD(match[1]));
  }
  return points;
}
