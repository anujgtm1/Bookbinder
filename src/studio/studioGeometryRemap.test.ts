import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { createSampleBookProject } from '@/resources/sampleProject';
import { computeStudioCanvasSpec } from '@/studio/canvasSpec';
import { computeInnerPocketsLayout } from '@/studio/pocketRenderEngine';
import { remapStudioForGeometryChange } from '@/studio/studioGeometryRemap';
import { BookParametersModel, type BookParameters, type PaperbackPresetId } from '@/types/bookParams';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { CoverImageLayerModel, type CoverImageLayer } from '@/types/studioLayer';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function getBoardRect(geometry: CaseGeometry, zone: 'front' | 'back' | 'spine'): Rect2D {
  const { outerWrap } = geometry;
  const bleedMm = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const base =
    zone === 'back'
      ? outerWrap.backBoardRect
      : zone === 'spine'
        ? outerWrap.spineRect
        : outerWrap.frontBoardRect;
  return {
    x: bleedMm + base.x,
    y: bleedMm + base.y,
    width: base.width,
    height: base.height,
  };
}

function buildRichStudioFixture(): {
  readonly params: BookParameters;
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
} {
  const sample = createSampleBookProject();
  const params = sample.parameters;
  const geometry = calculateCaseGeometry(params);
  const spec = computeStudioCanvasSpec(geometry);
  const innerLayout = computeInnerPocketsLayout(geometry);

  const frontClippedImg = CoverImageLayerModel.createInRect({
    id: 'img-front-clipped',
    dataUrl: TINY_PNG,
    fileName: 'front-art.png',
    naturalWidth: 1000,
    naturalHeight: 1500,
    targetRect: spec.frontArtworkRect,
    clipZone: 'front',
    mode: 'cover',
  });

  const backDroppedImg: CoverImageLayer = {
    ...CoverImageLayerModel.createInRect({
      id: 'img-back-dropped',
      dataUrl: TINY_PNG,
      fileName: 'back-emblem.png',
      naturalWidth: 800,
      naturalHeight: 600,
      targetRect: {
        x: spec.backArtworkRect.x + 25,
        y: spec.backArtworkRect.y + 40,
        width: 80,
        height: 60,
      },
      clipZone: 'none',
      mode: 'contain',
    }),
    rotationDeg: 90,
  };

  const fullWrapImg = CoverImageLayerModel.createInRect({
    id: 'img-full-wrap',
    dataUrl: TINY_PNG,
    fileName: 'wrap-bg.png',
    naturalWidth: 1800,
    naturalHeight: 1200,
    targetRect: {
      x: spec.bleedMm,
      y: spec.bleedMm,
      width: geometry.outerWrap.widthMm,
      height: geometry.outerWrap.heightMm,
    },
    clipZone: 'none',
    mode: 'cover',
  });

  const frontPocketImg = CoverImageLayerModel.createInRect({
    id: 'pocket-front-art',
    dataUrl: TINY_PNG,
    fileName: 'front-pocket.png',
    naturalWidth: 600,
    naturalHeight: 900,
    targetRect: innerLayout.frontFaceRect,
    clipZone: 'none',
    mode: 'cover',
  });

  const backPocketImg = CoverImageLayerModel.createInRect({
    id: 'pocket-back-art',
    dataUrl: TINY_PNG,
    fileName: 'back-pocket.png',
    naturalWidth: 500,
    naturalHeight: 500,
    targetRect: innerLayout.backFaceRect,
    clipZone: 'back',
    mode: 'contain',
  });

  const linerImg = CoverImageLayerModel.createInRect({
    id: 'pocket-liner-art',
    dataUrl: TINY_PNG,
    fileName: 'liner-stripe.png',
    naturalWidth: 400,
    naturalHeight: 1000,
    targetRect: innerLayout.linerRect,
    clipZone: 'none',
    mode: 'cover',
  });

  const studio: CoverStudioState = {
    ...sample.studio,
    layers: [fullWrapImg, frontClippedImg, backDroppedImg],
    pocketStyle: {
      ...sample.studio.pocketStyle,
      layers: [...sample.studio.pocketStyle.layers, frontPocketImg, backPocketImg, linerImg],
    },
  };

  return { params, geometry, studio };
}

function expectStudioCoordsClose(
  actual: CoverStudioState,
  expected: CoverStudioState,
  toleranceMm = 0.01,
): void {
  expect(actual.textLayers).toHaveLength(expected.textLayers.length);
  expected.textLayers.forEach((exp, i) => {
    const act = actual.textLayers[i];
    expect(Math.abs(act.xMm - exp.xMm), `text[${exp.id}].xMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.yMm - exp.yMm), `text[${exp.id}].yMm`).toBeLessThan(toleranceMm);
  });

  expect(actual.ornaments).toHaveLength(expected.ornaments.length);
  expected.ornaments.forEach((exp, i) => {
    const act = actual.ornaments[i];
    expect(Math.abs(act.xMm - exp.xMm), `orn[${exp.id}].xMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.yMm - exp.yMm), `orn[${exp.id}].yMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.widthMm - exp.widthMm), `orn[${exp.id}].widthMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.heightMm - exp.heightMm), `orn[${exp.id}].heightMm`).toBeLessThan(
      toleranceMm,
    );
  });

  expect(actual.layers).toHaveLength(expected.layers.length);
  expected.layers.forEach((exp, i) => {
    const act = actual.layers[i];
    expect(Math.abs(act.xMm - exp.xMm), `layer[${exp.id}].xMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.yMm - exp.yMm), `layer[${exp.id}].yMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.widthMm - exp.widthMm), `layer[${exp.id}].widthMm`).toBeLessThan(
      toleranceMm,
    );
    expect(Math.abs(act.heightMm - exp.heightMm), `layer[${exp.id}].heightMm`).toBeLessThan(
      toleranceMm,
    );
  });

  expect(actual.pocketStyle.layers).toHaveLength(expected.pocketStyle.layers.length);
  expected.pocketStyle.layers.forEach((exp, i) => {
    const act = actual.pocketStyle.layers[i];
    expect(Math.abs(act.xMm - exp.xMm), `pocket[${exp.id}].xMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.yMm - exp.yMm), `pocket[${exp.id}].yMm`).toBeLessThan(toleranceMm);
    expect(Math.abs(act.widthMm - exp.widthMm), `pocket[${exp.id}].widthMm`).toBeLessThan(
      toleranceMm,
    );
    expect(Math.abs(act.heightMm - exp.heightMm), `pocket[${exp.id}].heightMm`).toBeLessThan(
      toleranceMm,
    );
  });
}

describe('remapStudioForGeometryChange', () => {
  it('short-circuits and returns the exact same studio reference when geometry rects do not change', () => {
    const { params, geometry, studio } = buildRichStudioFixture();

    const unrelatedChanges: Partial<BookParameters>[] = [
      { unit: 'in' },
      { pdfPageSize: 'a4' },
      { printMedia: 'letter' },
      { splitMode: 'three-piece' },
      { quarterBoundOverlapMm: 25 },
      { miterFactor: 2.0 },
    ];

    for (const patch of unrelatedChanges) {
      const nextParams = BookParametersModel.clampAndNormalize({ ...params, ...patch });
      const nextGeometry = calculateCaseGeometry(nextParams);
      const remapped = remapStudioForGeometryChange(studio, geometry, nextGeometry);
      expect(remapped).toBe(studio);
    }
  });

  it.each<Exclude<PaperbackPresetId, 'custom'>>([
    'a6-notebook',
    'mass-market',
    'us-trade-standard',
  ])(
    'keeps Front Title, Frame, Compass Emblem, Spine Bands, and Front Image centered when switching to %s',
    (presetId) => {
      const { params, geometry, studio } = buildRichStudioFixture();
      const nextParams = BookParametersModel.applyPreset(params, presetId);
      const nextGeometry = calculateCaseGeometry(nextParams);
      const nextSpec = computeStudioCanvasSpec(nextGeometry);
      const remapped = remapStudioForGeometryChange(studio, geometry, nextGeometry);

      const nextFrontBoard = getBoardRect(nextGeometry, 'front');
      const nextBackBoard = getBoardRect(nextGeometry, 'back');
      const nextSpineBoard = getBoardRect(nextGeometry, 'spine');

      // Front Title stays dead-centered horizontally on the new front cover board
      const frontTitle = remapped.textLayers.find((t) => t.id === 'sample-txt-front-title')!;
      expect(frontTitle.xMm).toBeCloseTo(nextFrontBoard.x + nextFrontBoard.width / 2, 2);
      expect(frontTitle.yMm).toBeCloseTo(nextFrontBoard.y + nextFrontBoard.height * 0.25, 1);

      // Back Blurb stays dead-centered on the new back cover board
      const backBlurb = remapped.textLayers.find((t) => t.id === 'sample-txt-back-blurb')!;
      expect(backBlurb.xMm).toBeCloseTo(nextBackBoard.x + nextBackBoard.width / 2, 2);

      // Front double-rule frame stays centered with symmetric left/right and top/bottom margins
      const frontFrame = remapped.ornaments.find((o) => o.id === 'sample-orn-front-frame')!;
      const leftMargin = frontFrame.xMm - nextFrontBoard.x;
      const rightMargin = nextFrontBoard.x + nextFrontBoard.width - (frontFrame.xMm + frontFrame.widthMm);
      const topMargin = frontFrame.yMm - nextFrontBoard.y;
      const bottomMargin =
        nextFrontBoard.y + nextFrontBoard.height - (frontFrame.yMm + frontFrame.heightMm);
      expect(leftMargin).toBeGreaterThan(0);
      expect(leftMargin).toBeCloseTo(rightMargin, 2);
      expect(topMargin).toBeGreaterThan(0);
      expect(topMargin).toBeCloseTo(bottomMargin, 2);

      // Compass rose stays circular (1:1 aspect ratio) and centered horizontally on front cover
      const compass = remapped.ornaments.find((o) => o.id === 'sample-orn-front-compass')!;
      expect(compass.widthMm).toBeCloseTo(compass.heightMm, 3);
      expect(compass.xMm + compass.widthMm / 2).toBeCloseTo(
        nextFrontBoard.x + nextFrontBoard.width / 2,
        2,
      );

      // Spine bands stay centered inside the new spine rect
      const spineBands = remapped.ornaments.find((o) => o.id === 'sample-orn-spine-bands')!;
      expect(spineBands.xMm + spineBands.widthMm / 2).toBeCloseTo(
        nextSpineBoard.x + nextSpineBoard.width / 2,
        2,
      );
      expect(spineBands.widthMm).toBeLessThan(nextSpineBoard.width);

      // Clipped front image preserves its exact relative center on nextSpec.frontArtworkRect and 1000:1500 aspect
      const origSpec = computeStudioCanvasSpec(geometry);
      const origFrontImg = studio.layers.find((l) => l.id === 'img-front-clipped')!;
      const origRelX =
        (origFrontImg.xMm + origFrontImg.widthMm / 2 - origSpec.frontArtworkRect.x) /
        origSpec.frontArtworkRect.width;
      const origRelY =
        (origFrontImg.yMm + origFrontImg.heightMm / 2 - origSpec.frontArtworkRect.y) /
        origSpec.frontArtworkRect.height;
      const frontImg = remapped.layers.find((l) => l.id === 'img-front-clipped')!;
      expect(frontImg.xMm + frontImg.widthMm / 2).toBeCloseTo(
        nextSpec.frontArtworkRect.x + origRelX * nextSpec.frontArtworkRect.width,
        3,
      );
      expect(frontImg.yMm + frontImg.heightMm / 2).toBeCloseTo(
        nextSpec.frontArtworkRect.y + origRelY * nextSpec.frontArtworkRect.height,
        3,
      );
      expect(frontImg.widthMm / frontImg.heightMm).toBeCloseTo(1000 / 1500, 3);
    },
  );

  it('keeps front designs dead-centered when switching across every Binding Style', () => {
    const { params, geometry, studio } = buildRichStudioFixture();
    const targetPatches: readonly Partial<BookParameters>[] = [
      { bindingStyle: 'flexible-spine' },
      { bindingStyle: 'softcover-jacket', softcoverPocketMode: 'integrated' },
      { bindingStyle: 'softcover-jacket', softcoverPocketMode: 'separate' },
      { bindingStyle: 'dust-jacket' },
      { bindingStyle: 'paperback-wrap' },
    ];

    for (const patch of targetPatches) {
      const nextParams = BookParametersModel.clampAndNormalize({ ...params, ...patch });
      const nextGeometry = calculateCaseGeometry(nextParams);
      const remapped = remapStudioForGeometryChange(studio, geometry, nextGeometry);
      const nextFrontBoard = getBoardRect(nextGeometry, 'front');
      const nextBackBoard = getBoardRect(nextGeometry, 'back');

      const frontTitle = remapped.textLayers.find((t) => t.id === 'sample-txt-front-title')!;
      const frontFrame = remapped.ornaments.find((o) => o.id === 'sample-orn-front-frame')!;
      const backBlurb = remapped.textLayers.find((t) => t.id === 'sample-txt-back-blurb')!;

      expect(frontTitle.xMm).toBeCloseTo(nextFrontBoard.x + nextFrontBoard.width / 2, 2);
      expect(frontFrame.xMm + frontFrame.widthMm / 2).toBeCloseTo(
        nextFrontBoard.x + nextFrontBoard.width / 2,
        2,
      );
      expect(frontFrame.xMm).toBeGreaterThan(nextFrontBoard.x);
      expect(frontFrame.xMm + frontFrame.widthMm).toBeLessThan(
        nextFrontBoard.x + nextFrontBoard.width,
      );
      expect(backBlurb.xMm).toBeCloseTo(nextBackBoard.x + nextBackBoard.width / 2, 2);
    }
  });

  it.each<{ readonly label: string; readonly patch: Partial<BookParameters> }>([
    {
      label: 'rigid-case <-> softcover-jacket (integrated)',
      patch: { bindingStyle: 'softcover-jacket', softcoverPocketMode: 'integrated' },
    },
    {
      label: 'rigid-case <-> softcover-jacket (separate)',
      patch: { bindingStyle: 'softcover-jacket', softcoverPocketMode: 'separate' },
    },
    {
      label: 'rigid-case <-> dust-jacket',
      patch: { bindingStyle: 'dust-jacket' },
    },
    {
      label: 'rigid-case <-> paperback-wrap',
      patch: { bindingStyle: 'paperback-wrap' },
    },
    {
      label: 'rigid-case <-> flexible-spine',
      patch: { bindingStyle: 'flexible-spine' },
    },
    {
      label: 'US Trade <-> A6 Pocket Notebook',
      patch: { pbWidthMm: 105, pbHeightMm: 148 },
    },
    {
      label: 'slip-pockets <-> folded-endpapers',
      patch: { interiorStyle: 'folded-endpapers' },
    },
    {
      label: 'bleed on <-> bleed off',
      patch: { includeBleed: false },
    },
  ])(
    'round-trips $label 5 consecutive times with < 0.01 mm cumulative drift on every element',
    ({ patch }) => {
      const { params: paramsA, geometry: geomA, studio: originalStudio } = buildRichStudioFixture();
      const paramsB = BookParametersModel.clampAndNormalize({ ...paramsA, ...patch });
      const geomB = calculateCaseGeometry(paramsB);

      let current = originalStudio;
      for (let trip = 0; trip < 5; trip++) {
        current = remapStudioForGeometryChange(current, geomA, geomB);
        current = remapStudioForGeometryChange(current, geomB, geomA);
      }

      expectStudioCoordsClose(current, originalStudio, 0.01);
    },
  );

  it('round-trips a full multi-hop binding chain back to rigid-case with < 0.01 mm drift', () => {
    const { params: baseParams, geometry: baseGeom, studio: originalStudio } =
      buildRichStudioFixture();

    const chain: readonly Partial<BookParameters>[] = [
      { bindingStyle: 'softcover-jacket', softcoverPocketMode: 'integrated' },
      { bindingStyle: 'softcover-jacket', softcoverPocketMode: 'separate' },
      { bindingStyle: 'dust-jacket' },
      { bindingStyle: 'paperback-wrap' },
      { bindingStyle: 'flexible-spine' },
      { pbWidthMm: 105, pbHeightMm: 148, bindingStyle: 'rigid-case' },
      {},
    ];

    let curGeom = baseGeom;
    let curStudio = originalStudio;
    for (const stepPatch of chain) {
      const nextParams = BookParametersModel.clampAndNormalize({ ...baseParams, ...stepPatch });
      const nextGeom = calculateCaseGeometry(nextParams);
      curStudio = remapStudioForGeometryChange(curStudio, curGeom, nextGeom);
      curGeom = nextGeom;
    }

    expectStudioCoordsClose(curStudio, originalStudio, 0.01);
  });

  it('does not touch outer cover layers or tiled endpapers when switching slip-pockets <-> folded-endpapers', () => {
    const { params, geometry, studio } = buildRichStudioFixture();
    const foldedParams = BookParametersModel.clampAndNormalize({
      ...params,
      interiorStyle: 'folded-endpapers',
    });
    const foldedGeom = calculateCaseGeometry(foldedParams);

    const remapped = remapStudioForGeometryChange(studio, geometry, foldedGeom);

    // Outer cover arrays must be exact same references (0.000 mm drift)
    expect(remapped.layers).toBe(studio.layers);
    expect(remapped.textLayers).toBe(studio.textLayers);
    expect(remapped.ornaments).toBe(studio.ornaments);

    // Seamless marbled tile pattern must stay untouched
    const tiledOrig = studio.pocketStyle.layers.find((l) => l.tiled)!;
    const tiledNext = remapped.pocketStyle.layers.find((l) => l.tiled)!;
    expect(tiledNext).toBe(tiledOrig);

    // Placed front pocket artwork remaps onto the folded front endpaper center
    const origLayout = computeInnerPocketsLayout(geometry);
    const origFrontPocketArt = studio.pocketStyle.layers.find((l) => l.id === 'pocket-front-art')!;
    const origPocketRelX =
      (origFrontPocketArt.xMm + origFrontPocketArt.widthMm / 2 - origLayout.frontFaceRect.x) /
      origLayout.frontFaceRect.width;
    const foldedLayout = computeInnerPocketsLayout(foldedGeom);
    const frontPocketArt = remapped.pocketStyle.layers.find((l) => l.id === 'pocket-front-art')!;
    expect(frontPocketArt.xMm + frontPocketArt.widthMm / 2).toBeCloseTo(
      foldedLayout.frontFaceRect.x + origPocketRelX * foldedLayout.frontFaceRect.width,
      3,
    );
  });

  it('keeps inner pocket layers synchronized when transitioning through non-pocket styles to another pocket style or back', () => {
    const { params, geometry, studio } = buildRichStudioFixture();
    const dustJacketGeom = calculateCaseGeometry(
      BookParametersModel.clampAndNormalize({ ...params, bindingStyle: 'dust-jacket' }),
    );
    const integratedSlipGeom = calculateCaseGeometry(
      BookParametersModel.clampAndNormalize({
        ...params,
        bindingStyle: 'softcover-jacket',
        softcoverPocketMode: 'integrated',
      }),
    );
    const separateSlipGeom = calculateCaseGeometry(
      BookParametersModel.clampAndNormalize({
        ...params,
        bindingStyle: 'softcover-jacket',
        softcoverPocketMode: 'separate',
      }),
    );
    const flexSpineGeom = calculateCaseGeometry(
      BookParametersModel.clampAndNormalize({ ...params, bindingStyle: 'flexible-spine' }),
    );

    const onDust = remapStudioForGeometryChange(studio, geometry, dustJacketGeom);
    const onSlip = remapStudioForGeometryChange(onDust, dustJacketGeom, integratedSlipGeom);
    const onSeparate = remapStudioForGeometryChange(onSlip, integratedSlipGeom, separateSlipGeom);

    // Front pocket art lands dead-centered on detached 2-sheet front pocket
    const sepLayout = computeInnerPocketsLayout(separateSlipGeom);
    const sepFrontArt = onSeparate.pocketStyle.layers.find((l) => l.id === 'pocket-front-art')!;
    expect(
      Math.abs(
        sepFrontArt.xMm +
          sepFrontArt.widthMm / 2 -
          (sepLayout.frontFaceRect.x + sepLayout.frontFaceRect.width / 2),
      ),
    ).toBeLessThan(0.05);

    // Transitioning through Dust Jacket -> Flexible Spine keeps pocket art centered on Flexible Spine
    const onFlex = remapStudioForGeometryChange(onDust, dustJacketGeom, flexSpineGeom);
    const flexLayout = computeInnerPocketsLayout(flexSpineGeom);
    const flexFrontArt = onFlex.pocketStyle.layers.find((l) => l.id === 'pocket-front-art')!;
    expect(
      Math.abs(
        flexFrontArt.xMm +
          flexFrontArt.widthMm / 2 -
          (flexLayout.frontFaceRect.x + flexLayout.frontFaceRect.width / 2),
      ),
    ).toBeLessThan(0.05);

    // Returning to rigid-case restores every layer with < 0.01 mm drift
    const backOnRigid = remapStudioForGeometryChange(onSlip, integratedSlipGeom, geometry);
    expectStudioCoordsClose(backOnRigid, studio, 0.01);
  });
});
