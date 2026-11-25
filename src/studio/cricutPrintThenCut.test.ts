import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import { detectCricutScopePresence, isSvgArtworkLayer } from './cricutExport';
import {
  DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
  evaluatePrintThenCutBounds,
  hasPrintThenCutContent,
  injectPngDpiChunk,
  resolvePrintThenCutCropRect,
} from './cricutPrintThenCut';

function computeTestCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  const crc = computeTestCrc32(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc, false);
  return out;
}

function createMinimalPng(width: number, height: number): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  const raw = new Uint8Array((width * 4 + 1) * height);
  const idat = new Uint8Array(deflateSync(raw));

  const chunks = [
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', new Uint8Array(0)),
  ];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function parsePngChunks(bytes: Uint8Array): { type: string; data: Uint8Array; crc: number }[] {
  const chunks: { type: string; data: Uint8Array; crc: number }[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = view.getUint32(off, false);
    const type = String.fromCharCode(
      bytes[off + 4],
      bytes[off + 5],
      bytes[off + 6],
      bytes[off + 7],
    );
    const data = bytes.subarray(off + 8, off + 8 + len);
    const crc = view.getUint32(off + 8 + len, false);
    chunks.push({ type, data, crc });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

describe('cricutPrintThenCut — Cricut Print Then Cut Printable HTV Engine', () => {
  it('evaluates portrait and landscape fit across US Letter, A4, US Legal, and Tabloid bounds', () => {
    // Standard Trade front cover (143 × 223 mm) fits US Letter, A4, Legal, and Tabloid
    const frontTrade = evaluatePrintThenCutBounds(143, 223, {
      dpi: 300,
      options: { scope: 'front-cover' },
    });
    expect(frontTrade.fitsLetter).toBe(true);
    expect(frontTrade.fitsA4).toBe(true);
    expect(frontTrade.fitsLegal).toBe(true);
    expect(frontTrade.fitsTabloid).toBe(true);
    expect(frontTrade.fitsAnySheet).toBe(true);
    expect(frontTrade.recommendedSheet).toBe('letter');
    expect(frontTrade.widthIn).toBeCloseTo(5.63, 2);
    expect(frontTrade.heightIn).toBeCloseTo(8.78, 2);
    expect(frontTrade.pixelWidth).toBe(Math.round((143 / 25.4) * 300));
    expect(frontTrade.pixelHeight).toBe(Math.round((223 / 25.4) * 300));
    expect(frontTrade.fileName).toBe('bookbinder_cricut_ptc_front.png');

    // Landscape orientation (230 × 150 mm) still fits US Letter (6.75 × 9.25" = 171.45 × 234.95 mm)
    const landscapeLetter = evaluatePrintThenCutBounds(230, 150);
    expect(landscapeLetter.fitsLetter).toBe(true);
    expect(landscapeLetter.recommendedSheet).toBe('letter');

    // Tall narrow panel (160 × 245 mm) exceeds Letter (234.95 mm) but fits A4 (252.2 mm)
    const fitsA4Only = evaluatePrintThenCutBounds(160, 245);
    expect(fitsA4Only.fitsLetter).toBe(false);
    expect(fitsA4Only.fitsA4).toBe(true);
    expect(fitsA4Only.fitsLegal).toBe(true);
    expect(fitsA4Only.recommendedSheet).toBe('a4');

    // 168 × 280 mm exceeds Letter & A4, fits Legal
    const fitsLegal = evaluatePrintThenCutBounds(168, 280);
    expect(fitsLegal.fitsLetter).toBe(false);
    expect(fitsLegal.fitsA4).toBe(false);
    expect(fitsLegal.fitsLegal).toBe(true);
    expect(fitsLegal.recommendedSheet).toBe('legal');

    // 220 × 350 mm fits Tabloid only (234.95 × 387.35 mm)
    const fitsTabloid = evaluatePrintThenCutBounds(220, 350);
    expect(fitsTabloid.fitsLegal).toBe(false);
    expect(fitsTabloid.fitsTabloid).toBe(true);
    expect(fitsTabloid.fitsAnySheet).toBe(true);
    expect(fitsTabloid.recommendedSheet).toBe('tabloid');

    // Full wrap hardcover (366 × 259 mm) exceeds even Tabloid (minSide 259 > 234.95)
    const fullWrapOverflow = evaluatePrintThenCutBounds(366, 259, {
      options: { scope: 'full-wrap', trimToDesignBounds: true, mirrorForHtv: true },
    });
    expect(fullWrapOverflow.fitsLetter).toBe(false);
    expect(fullWrapOverflow.fitsA4).toBe(false);
    expect(fullWrapOverflow.fitsLegal).toBe(false);
    expect(fullWrapOverflow.fitsTabloid).toBe(false);
    expect(fullWrapOverflow.fitsAnySheet).toBe(false);
    expect(fullWrapOverflow.recommendedSheet).toBeNull();
    expect(fullWrapOverflow.fileName).toBe('bookbinder_cricut_ptc_fullwrap_trimmed_mirrored.png');
  });

  it('resolves visible cover board crop rects excluding turn-ins, flaps, and glue tabs across binding styles', () => {
    // 1. Rigid 3-Board Hardcover: individual panels exclude turn-ins + bleed
    const rigidGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const rigidBleed = rigidGeom.outerWrap.bleedMm;
    const studio = CoverStudioModel.createDefault();

    const frontCrop = resolvePrintThenCutCropRect(rigidGeom, studio, {
      ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
      scope: 'front-cover',
    });
    expect(frontCrop.x).toBeCloseTo(rigidGeom.outerWrap.frontBoardRect.x + rigidBleed, 2);
    expect(frontCrop.y).toBeCloseTo(rigidGeom.outerWrap.frontBoardRect.y + rigidBleed, 2);
    expect(frontCrop.width).toBeCloseTo(rigidGeom.outerWrap.frontBoardRect.width, 2);
    expect(frontCrop.height).toBeCloseTo(rigidGeom.outerWrap.frontBoardRect.height, 2);

    const spineCrop = resolvePrintThenCutCropRect(rigidGeom, studio, {
      ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
      scope: 'spine-only',
    });
    expect(spineCrop.width).toBeCloseTo(rigidGeom.outerWrap.spineRect.width, 2);
    expect(spineCrop.height).toBeCloseTo(rigidGeom.outerWrap.spineRect.height, 2);

    const fullCrop = resolvePrintThenCutCropRect(rigidGeom, studio, {
      ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
      scope: 'full-wrap',
    });
    expect(fullCrop.x).toBeCloseTo(rigidBleed, 2);
    expect(fullCrop.y).toBeCloseTo(rigidBleed, 2);
    expect(fullCrop.width).toBeCloseTo(rigidGeom.outerWrap.widthMm, 2);
    expect(fullCrop.height).toBeCloseTo(rigidGeom.outerWrap.heightMm, 2);

    // 2. Softcover Slip Cover: Front/Back exclude tuck flaps and 10 mm top/bottom wrap-over glue tabs
    const slipGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      jacketFlapWidthMm: 50,
    });
    const slipBleed = slipGeom.outerWrap.bleedMm;
    const slipFrontCrop = resolvePrintThenCutCropRect(slipGeom, studio, {
      ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
      scope: 'front-cover',
    });
    expect(slipFrontCrop.x).toBeCloseTo(slipGeom.outerWrap.frontBoardRect.x + slipBleed, 2);
    expect(slipFrontCrop.y).toBeCloseTo(slipGeom.outerWrap.frontBoardRect.y + slipBleed, 2);
    expect(slipFrontCrop.width).toBeCloseTo(slipGeom.outerWrap.frontBoardRect.width, 2);
    expect(slipFrontCrop.height).toBeCloseTo(slipGeom.outerWrap.frontBoardRect.height, 2);
    expect(slipFrontCrop.height).toBeLessThan(slipGeom.outerWrap.heightMm - 15);
  });

  it('tight-crops to active design bounds + 2 mm padding clamped inside scope rect when trimToDesignBounds is true', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const frontBoard = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };

    // Place a 50 × 60 mm emblem centered on the front cover
    const emblem = {
      id: 'emblem-png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      fileName: 'emblem.png',
      naturalWidth: 500,
      naturalHeight: 600,
      xMm: frontBoard.x + 40,
      yMm: frontBoard.y + 70,
      widthMm: 50,
      heightMm: 60,
      clipZone: 'front' as const,
    };
    const title = {
      ...CoverTextLayerModel.createPreset('front-title', frontBoard),
      text: 'DUNE',
    };
    const ornament = {
      ...CoverOrnamentLayerModel.createForZone('emblem-compass-rose', frontBoard, 'front'),
      xMm: frontBoard.x + 45,
      yMm: frontBoard.y + 75,
      widthMm: 40,
      heightMm: 40,
    };

    const studio = {
      ...CoverStudioModel.createDefault(),
      layers: [emblem],
      textLayers: [title],
      ornaments: [ornament],
    };

    // Artwork-only trimmed crop -> 50 + 4 = 54 mm wide, 60 + 4 = 64 mm tall
    const artworkOnlyTrim = resolvePrintThenCutCropRect(geom, studio, {
      ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
      scope: 'front-cover',
      includeArtwork: true,
      includeLettering: false,
      includeOrnaments: false,
      trimToDesignBounds: true,
    });
    expect(artworkOnlyTrim.x).toBeCloseTo(emblem.xMm - 2, 1);
    expect(artworkOnlyTrim.y).toBeCloseTo(emblem.yMm - 2, 1);
    expect(artworkOnlyTrim.width).toBeCloseTo(54, 1);
    expect(artworkOnlyTrim.height).toBeCloseTo(64, 1);

    // Clamping test: artwork touching top-left corner of front board must clamp within frontBoard
    const cornerStudio = {
      ...CoverStudioModel.createDefault(),
      layers: [
        {
          ...emblem,
          xMm: frontBoard.x - 10,
          yMm: frontBoard.y - 10,
          widthMm: 40,
          heightMm: 40,
          clipZone: 'none' as const,
        },
      ],
    };
    const clampedTrim = resolvePrintThenCutCropRect(geom, cornerStudio, {
      ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
      scope: 'front-cover',
      trimToDesignBounds: true,
    });
    expect(clampedTrim.x).toBeCloseTo(frontBoard.x, 2);
    expect(clampedTrim.y).toBeCloseTo(frontBoard.y, 2);
    expect(clampedTrim.x + clampedTrim.width).toBeLessThanOrEqual(frontBoard.x + frontBoard.width + 0.01);
    expect(clampedTrim.y + clampedTrim.height).toBeLessThanOrEqual(frontBoard.y + frontBoard.height + 0.01);

    // Content presence check: empty back cover has no content unless includeBaseFill is true
    expect(
      hasPrintThenCutContent(geom, studio, {
        ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
        scope: 'back-cover',
        includeBaseFill: false,
      }),
    ).toBe(false);
    expect(
      hasPrintThenCutContent(geom, studio, {
        ...DEFAULT_CRICUT_PRINT_THEN_CUT_OPTIONS,
        scope: 'back-cover',
        includeBaseFill: true,
      }),
    ).toBe(true);
  });

  it('injects a valid CRC32 pHYs DPI chunk right after IHDR and replaces existing pHYs chunks', () => {
    const basePng = createMinimalPng(4, 4);
    const with300Dpi = injectPngDpiChunk(basePng, 300);

    // Valid PNG signature preserved
    expect(Array.from(with300Dpi.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const chunks = parsePngChunks(with300Dpi);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);

    const phys = chunks[1];
    expect(phys.data.length).toBe(9);
    const physView = new DataView(phys.data.buffer, phys.data.byteOffset, phys.data.byteLength);
    const expectedPpm300 = Math.round(300 / 0.0254); // 11811
    expect(physView.getUint32(0, false)).toBe(expectedPpm300);
    expect(physView.getUint32(4, false)).toBe(expectedPpm300);
    expect(phys.data[8]).toBe(1); // meter unit

    // Verify IEEE 802.3 CRC32 over ['p','H','Y','s', ...data]
    const crcPayload = new Uint8Array(13);
    crcPayload.set([0x70, 0x48, 0x59, 0x73], 0);
    crcPayload.set(phys.data, 4);
    expect(phys.crc).toBe(computeTestCrc32(crcPayload));

    // Re-injecting at 600 DPI replaces existing pHYs instead of duplicating
    const with600Dpi = injectPngDpiChunk(with300Dpi, 600);
    const chunks600 = parsePngChunks(with600Dpi);
    expect(chunks600.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    const phys600View = new DataView(
      chunks600[1].data.buffer,
      chunks600[1].data.byteOffset,
      chunks600[1].data.byteLength,
    );
    expect(phys600View.getUint32(0, false)).toBe(Math.round(600 / 0.0254));

    // Non-PNG bytes pass through unchanged
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(injectPngDpiChunk(junk, 300)).toBe(junk);
  });

  it('accurately separates true raster artwork layers from uploaded .svg artwork layers', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const frontBoard = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };
    const svgLayer = {
      id: 'svg-1',
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#111"/></svg>',
      )}`,
      fileName: 'crest.svg',
      naturalWidth: 100,
      naturalHeight: 100,
      xMm: frontBoard.x + 20,
      yMm: frontBoard.y + 20,
      widthMm: 50,
      heightMm: 50,
      clipZone: 'front' as const,
    };
    const pngLayer = {
      ...svgLayer,
      id: 'png-1',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      fileName: 'art.png',
    };

    expect(isSvgArtworkLayer(svgLayer)).toBe(true);
    expect(isSvgArtworkLayer(pngLayer)).toBe(false);

    const svgOnlyPresence = detectCricutScopePresence(geom, {
      ...CoverStudioModel.createDefault(),
      layers: [svgLayer],
    });
    expect(svgOnlyPresence.hasSvgArtwork).toBe(true);
    expect(svgOnlyPresence.hasRasterArtwork).toBe(false);
    expect(svgOnlyPresence.front).toBe(true);

    const rasterOnlyPresence = detectCricutScopePresence(geom, {
      ...CoverStudioModel.createDefault(),
      layers: [pngLayer],
    });
    expect(rasterOnlyPresence.hasSvgArtwork).toBe(false);
    expect(rasterOnlyPresence.hasRasterArtwork).toBe(true);
    expect(rasterOnlyPresence.any).toBe(false);
  });
});
