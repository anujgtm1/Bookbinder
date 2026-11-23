import {
  GrainDirectionArrow,
  HorizontalDimLine,
  VerticalDimLine,
} from '@/components/BlueprintDimensionLines';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, type UnitSystem } from '@/types/units';
import type { InnerPocketsLayout } from '../pocketRenderEngine';

export interface PocketBlueprintDimensionsProps {
  readonly geometry: CaseGeometry;
  readonly innerLayout: InnerPocketsLayout;
  readonly unit: UnitSystem;
}

/** Manual-cutting CAD dimension chains and grain-direction arrows for Back Pocket, Spine Liner, and Front Pocket. */
export function PocketBlueprintDimensions({
  geometry,
  innerLayout,
  unit,
}: PocketBlueprintDimensionsProps) {
  const { backPocket, spineLiner, frontPocket } = geometry;

  return (
    <g data-testid="pockets-blueprint-dimensions">
      {/* Grain Direction Arrows parallel to spine */}
      <GrainDirectionArrow
        x={innerLayout.backFaceRect.x + 14}
        centerY={innerLayout.backFaceRect.y + innerLayout.backFaceRect.height / 2}
        lengthMm={36}
      />
      <GrainDirectionArrow
        x={innerLayout.frontFaceRect.x + innerLayout.frontFaceRect.width - 14}
        centerY={innerLayout.frontFaceRect.y + innerLayout.frontFaceRect.height / 2}
        lengthMm={36}
      />

      {/* Back Pocket Overall Width (top) & Flap/Face Breakdown (bottom) */}
      <HorizontalDimLine
        x1={innerLayout.backX}
        x2={innerLayout.backX + backPocket.totalWidthMm}
        y={-12}
        anchorY={0}
        label={UnitConverter.format(backPocket.totalWidthMm, unit)}
        emphasized
        fontSize={4.4}
      />
      <HorizontalDimLine
        x1={innerLayout.backX}
        x2={innerLayout.backFaceRect.x}
        y={backPocket.totalHeightMm + 11}
        anchorY={backPocket.totalHeightMm}
        label={UnitConverter.formatValue(backPocket.flapWidthMm, unit)}
        fontSize={4.0}
      />
      <HorizontalDimLine
        x1={innerLayout.backFaceRect.x}
        x2={innerLayout.backFaceRect.x + backPocket.pocketWidthMm}
        y={backPocket.totalHeightMm + 11}
        anchorY={backPocket.totalHeightMm}
        label={UnitConverter.format(backPocket.pocketWidthMm, unit)}
        fontSize={4.2}
      />

      {/* Left Vertical Breakdown for Pocket Flaps & Face Height */}
      <VerticalDimLine
        y1={0}
        y2={backPocket.flapWidthMm}
        x={-12}
        anchorX={0}
        label={UnitConverter.formatValue(backPocket.flapWidthMm, unit)}
        fontSize={4.0}
      />
      <VerticalDimLine
        y1={backPocket.flapWidthMm}
        y2={backPocket.flapWidthMm + backPocket.pocketHeightMm}
        x={-12}
        anchorX={0}
        label={UnitConverter.format(backPocket.pocketHeightMm, unit)}
        fontSize={4.4}
      />
      <VerticalDimLine
        y1={backPocket.flapWidthMm + backPocket.pocketHeightMm}
        y2={backPocket.totalHeightMm}
        x={-12}
        anchorX={0}
        label={UnitConverter.formatValue(backPocket.flapWidthMm, unit)}
        fontSize={4.0}
      />

      {/* Spine Liner Overall Width (top) & Segment Breakdown (bottom) */}
      <HorizontalDimLine
        x1={innerLayout.linerX}
        x2={innerLayout.linerX + spineLiner.widthMm}
        y={-12}
        anchorY={innerLayout.linerY}
        label={UnitConverter.format(spineLiner.widthMm, unit)}
        emphasized
        fontSize={4.4}
      />
      <HorizontalDimLine
        x1={innerLayout.linerX}
        x2={innerLayout.linerX + spineLiner.boardOverlapMm}
        y={innerLayout.linerY + spineLiner.heightMm + 11}
        anchorY={innerLayout.linerY + spineLiner.heightMm}
        label={UnitConverter.formatValue(spineLiner.boardOverlapMm, unit)}
        fontSize={3.8}
      />
      <HorizontalDimLine
        x1={innerLayout.linerX + spineLiner.spineZoneRect.x}
        x2={innerLayout.linerX + spineLiner.spineZoneRect.x + spineLiner.spineZoneRect.width}
        y={innerLayout.linerY + spineLiner.heightMm + 11}
        anchorY={innerLayout.linerY + spineLiner.heightMm}
        label={UnitConverter.formatValue(spineLiner.spineZoneRect.width, unit)}
        fontSize={3.8}
      />
      <HorizontalDimLine
        x1={innerLayout.linerX + spineLiner.widthMm - spineLiner.boardOverlapMm}
        x2={innerLayout.linerX + spineLiner.widthMm}
        y={innerLayout.linerY + spineLiner.heightMm + 11}
        anchorY={innerLayout.linerY + spineLiner.heightMm}
        label={UnitConverter.formatValue(spineLiner.boardOverlapMm, unit)}
        fontSize={3.8}
      />

      {/* Front Pocket Overall Width (top), Face/Flap Breakdown (bottom) & Overall Height (right) */}
      <HorizontalDimLine
        x1={innerLayout.frontX}
        x2={innerLayout.frontX + frontPocket.totalWidthMm}
        y={-12}
        anchorY={0}
        label={UnitConverter.format(frontPocket.totalWidthMm, unit)}
        emphasized
        fontSize={4.4}
      />
      <HorizontalDimLine
        x1={innerLayout.frontFaceRect.x}
        x2={innerLayout.frontFaceRect.x + frontPocket.pocketWidthMm}
        y={frontPocket.totalHeightMm + 11}
        anchorY={frontPocket.totalHeightMm}
        label={UnitConverter.format(frontPocket.pocketWidthMm, unit)}
        fontSize={4.2}
      />
      <HorizontalDimLine
        x1={innerLayout.frontFaceRect.x + frontPocket.pocketWidthMm}
        x2={innerLayout.frontX + frontPocket.totalWidthMm}
        y={frontPocket.totalHeightMm + 11}
        anchorY={frontPocket.totalHeightMm}
        label={UnitConverter.formatValue(frontPocket.flapWidthMm, unit)}
        fontSize={4.0}
      />
      <VerticalDimLine
        y1={0}
        y2={frontPocket.totalHeightMm}
        x={innerLayout.totalWidthMm + 12}
        anchorX={innerLayout.totalWidthMm}
        label={`TOTAL H: ${UnitConverter.format(frontPocket.totalHeightMm, unit)}`}
        emphasized
        fontSize={4.4}
      />
    </g>
  );
}
