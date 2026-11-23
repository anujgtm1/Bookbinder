import { resolveBindingStrategy } from '@/core/bindingStyles';
import type { CaseGeometry } from '@/types/geometry';
import { clampFinite, roundTo } from '@/types/units';

export type Book3DPresetId = 'front-three-quarter' | 'spine' | 'back-three-quarter' | 'front-flat';

export interface Book3DCameraAngle {
  readonly yawDeg: number;
  readonly pitchDeg: number;
}

export interface Book3DPreset {
  readonly id: Book3DPresetId;
  readonly label: string;
  readonly angle: Book3DCameraAngle;
}

export const BOOK_3D_PRESETS: readonly Book3DPreset[] = [
  {
    id: 'front-three-quarter',
    label: 'Front 3/4',
    angle: { yawDeg: 32, pitchDeg: -10 },
  },
  {
    id: 'spine',
    label: 'Spine',
    angle: { yawDeg: 86, pitchDeg: -6 },
  },
  {
    id: 'back-three-quarter',
    label: 'Back 3/4',
    angle: { yawDeg: 148, pitchDeg: -10 },
  },
  {
    id: 'front-flat',
    label: 'Front',
    angle: { yawDeg: 0, pitchDeg: 0 },
  },
];

export const DEFAULT_BOOK_3D_ANGLE: Book3DCameraAngle = BOOK_3D_PRESETS[0].angle;

export interface Book3DDimensionsPx {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly depthPx: number;
  readonly boardThicknessPx: number;
  readonly pageInsetPx: number;
  readonly pageDepthPx: number;
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
  readonly scalePxPerMm: number;
}

export const Book3DModel = {
  /**
   * Scales physical millimeter board/spine dimensions proportionally to fit a 3D viewport stage
   * while preserving exact hardcover thickness and recessed page-block overhang.
   */
  computeDimensionsPx(
    geometry: CaseGeometry,
    maxHeightPx = 310,
    maxWidthPx = 260,
  ): Book3DDimensionsPx {
    const { capabilities } = resolveBindingStrategy(geometry);
    const boardW = Math.max(40, geometry.cutList.coverBoards.widthMm);
    const boardH = Math.max(40, geometry.cutList.coverBoards.heightMm);
    const spineW = Math.max(8, geometry.cutList.spineStrip.widthMm);

    const scalePxPerMm = Math.min(maxHeightPx / boardH, maxWidthPx / boardW);
    const widthPx = roundTo(boardW * scalePxPerMm, 1);
    const heightPx = roundTo(boardH * scalePxPerMm, 1);
    const depthPx = roundTo(Math.max(14, spineW * scalePxPerMm), 1);

    const boardThicknessPx = capabilities.usesChipboard
      ? roundTo(clampFinite(geometry.cutList.boardThicknessMm * scalePxPerMm, 2.5, 1.5, 4.5), 1)
      : capabilities.hasGlueTabs
        ? 1.0
        : capabilities.hasFlaps
          ? 1.2
          : 0.8;
    const pageInsetPx = capabilities.usesChipboard
      ? roundTo(clampFinite(3.5 * scalePxPerMm, 4.5, 3, 7), 1)
      : capabilities.hasGlueTabs
        ? 1.5
        : capabilities.hasFlaps
          ? 1.0
          : 0;
    const pageDepthPx = roundTo(Math.max(8, depthPx - boardThicknessPx * 2), 1);
    const pageWidthPx = roundTo(Math.max(20, widthPx - pageInsetPx), 1);
    const pageHeightPx = roundTo(Math.max(20, heightPx - pageInsetPx * 2), 1);

    return {
      widthPx,
      heightPx,
      depthPx,
      boardThicknessPx,
      pageInsetPx,
      pageDepthPx,
      pageWidthPx,
      pageHeightPx,
      scalePxPerMm: roundTo(scalePxPerMm, 4),
    };
  },

  /**
   * Wraps yaw into [-180, 180] and clamps pitch into [-45, 45] so orbiting stays intuitive.
   */
  normalizeAngle(angle: Book3DCameraAngle): Book3DCameraAngle {
    const rawYaw = Number.isFinite(angle.yawDeg) ? angle.yawDeg : DEFAULT_BOOK_3D_ANGLE.yawDeg;
    let yaw = ((rawYaw + 180) % 360 + 360) % 360 - 180;
    if (yaw === -180 && rawYaw > 0) yaw = 180;
    const pitch = clampFinite(angle.pitchDeg, DEFAULT_BOOK_3D_ANGLE.pitchDeg, -45, 45);
    return {
      yawDeg: roundTo(yaw, 1),
      pitchDeg: roundTo(pitch, 1),
    };
  },

  /** Applies pointer drag delta (in screen pixels) to an existing 3D camera angle. */
  orbitByPointerDelta(
    origin: Book3DCameraAngle,
    deltaXPx: number,
    deltaYPx: number,
    sensitivityDegPerPx = 0.55,
  ): Book3DCameraAngle {
    return this.normalizeAngle({
      yawDeg: origin.yawDeg + deltaXPx * sensitivityDegPerPx,
      pitchDeg: origin.pitchDeg - deltaYPx * sensitivityDegPerPx,
    });
  },

  /** Finds a matching preset id when the camera is within 1° of a preset angle. */
  matchPreset(angle: Book3DCameraAngle): Book3DPresetId | null {
    for (const preset of BOOK_3D_PRESETS) {
      if (
        Math.abs(preset.angle.yawDeg - angle.yawDeg) <= 1 &&
        Math.abs(preset.angle.pitchDeg - angle.pitchDeg) <= 1
      ) {
        return preset.id;
      }
    }
    return null;
  },
};
