import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { CoverImageLayerModel } from '@/types/studioLayer';
import {
  applyStubExtensionToLayer,
  computeStubExtensionPlan,
  detectLayerCoverSide,
} from './edgeExtend';

describe('edgeExtend', () => {
  it('computes exact pasting-stub padding around the Front and Back chipboards', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const frontPlan = computeStubExtensionPlan(geom, 'front', 1430, 2230);

    // 1430px across 143mm = 10 px/mm; top/bottom/right have 18mm turn-in + 3mm bleed = 21mm (~210px)
    expect(frontPlan.pxPerMm).toBeCloseTo(10, 1);
    expect(frontPlan.boardWidthPx).toBe(1430);
    expect(frontPlan.boardHeightPx).toBe(2230);
    expect(frontPlan.padTopPx).toBeGreaterThanOrEqual(205);
    expect(frontPlan.padBottomPx).toBeGreaterThanOrEqual(205);
    expect(frontPlan.padRightPx).toBeGreaterThanOrEqual(205);
    // Front zone aligns flush with the front board's hinge edge (hinge stays in spine zone)
    expect(frontPlan.padLeftPx).toBe(0);
    expect(frontPlan.totalWidthPx).toBe(
      frontPlan.padLeftPx + frontPlan.boardWidthPx + frontPlan.padRightPx,
    );

    const backPlan = computeStubExtensionPlan(geom, 'back', 1430, 2230);
    expect(backPlan.padLeftPx).toBeGreaterThanOrEqual(205);
    expect(backPlan.padRightPx).toBe(0);
  });

  it('detects whether a layer sits on the Front or Back cover', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const frontLayer = CoverImageLayerModel.createInRect({
      id: 'l-front',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: { x: 220, y: 20, width: 140, height: 220 },
    });
    const backLayer = CoverImageLayerModel.createInRect({
      id: 'l-back',
      dataUrl: 'data:image/png;base64,BBB',
      fileName: 'back.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: { x: 20, y: 20, width: 140, height: 220 },
    });

    expect(detectLayerCoverSide(frontLayer, geom)).toBe('front');
    expect(detectLayerCoverSide(backLayer, geom)).toBe('back');
  });

  it('reverts cleanly to original untouched image when mode is set to none', async () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const extendedLayer = {
      ...CoverImageLayerModel.createInRect({
        id: 'l-ext',
        dataUrl: 'data:image/png;base64,EXTENDED',
        fileName: 'front.png',
        naturalWidth: 1800,
        naturalHeight: 2650,
        targetRect: { x: 200, y: 0, width: 172, height: 265 },
      }),
      originalDataUrl: 'data:image/png;base64,ORIGINAL',
      originalWidth: 1430,
      originalHeight: 2230,
      stubExtensionMode: 'edge-smear' as const,
      stubExtensionSide: 'front' as const,
    };

    const result = await applyStubExtensionToLayer(extendedLayer, geom, 'front', 'none');
    expect(result.layer.dataUrl).toBe('data:image/png;base64,ORIGINAL');
    expect(result.layer.naturalWidth).toBe(1430);
    expect(result.layer.naturalHeight).toBe(2230);
    expect(result.layer.widthMm).toBeCloseTo(geom.outerWrap.frontBoardRect.width, 1);
    expect(result.layer.heightMm).toBeCloseTo(geom.outerWrap.frontBoardRect.height, 1);
    expect(result.layer.originalDataUrl).toBeUndefined();
    expect(result.layer.stubExtensionMode).toBe('none');
  });
});
