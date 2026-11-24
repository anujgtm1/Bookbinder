import {
  GeometryPrimitives,
  type PocketEnvelopeGeometry,
  type Rect2D,
  type SpineLinerGeometry,
} from '@/types/geometry';
import type { PocketStyleConfig } from '@/types/studio';
import { UnitConverter, type UnitSystem } from '@/types/units';
import {
  computePocketImagePlacement,
  getFoldedEndpaperHalfLabels,
  type PocketImagePlacement,
} from '../pocketRenderEngine';

export type PocketViewMode = 'styled' | 'blueprint';

export const PAPER_SHEET_FILL = '#FAF6EE';
export const PAPER_INK_FILL = '#231F1B';

export interface PocketPieceBaseProps {
  readonly idPrefix: string;
  readonly pocket: PocketEnvelopeGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly style: PocketStyleConfig;
  readonly viewMode: PocketViewMode;
}

/** Renders the paper backing, base endpaper color, and optional legacy background pattern for one pocket. */
export function PocketPieceBaseSvg({
  idPrefix,
  pocket,
  offsetX,
  offsetY,
  style,
  viewMode,
}: PocketPieceBaseProps) {
  const clipId = `${idPrefix}-clip`;
  const tilePatternId = `${idPrefix}-tile`;
  const isStyled = viewMode === 'styled';

  const styleTargetRect: Rect2D =
    style.styleScope === 'full-envelope'
      ? { x: 0, y: 0, width: pocket.totalWidthMm, height: pocket.totalHeightMm }
      : pocket.faceRect;

  const imgPlacement =
    isStyled && style.imageDataUrl
      ? computePocketImagePlacement(
          styleTargetRect,
          style.imageNaturalWidth || 100,
          style.imageNaturalHeight || 100,
          style.imageFitMode,
          style.imageScale,
        )
      : null;

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`}>
      <defs>
        <clipPath id={clipId}>
          {style.styleScope === 'full-envelope' ? (
            <path d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)} />
          ) : (
            <rect
              x={pocket.faceRect.x}
              y={pocket.faceRect.y}
              width={pocket.faceRect.width}
              height={pocket.faceRect.height}
            />
          )}
        </clipPath>
        {isStyled && style.imageDataUrl && style.imageFitMode === 'tile' && imgPlacement && (
          <pattern
            id={tilePatternId}
            x={styleTargetRect.x}
            y={styleTargetRect.y}
            width={imgPlacement.width}
            height={imgPlacement.height}
            patternUnits="userSpaceOnUse"
          >
            <image
              href={style.imageDataUrl}
              x={0}
              y={0}
              width={imgPlacement.width}
              height={imgPlacement.height}
              preserveAspectRatio="none"
            />
          </pattern>
        )}
      </defs>

      {/* Base paper sheet backing */}
      <path
        d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)}
        fill={PAPER_SHEET_FILL}
      />

      {/* Styled endpaper base fill & optional legacy pattern */}
      {isStyled && (
        <g clipPath={`url(#${clipId})`} data-testid={`styled-${pocket.side}-pocket`}>
          <rect
            x={styleTargetRect.x}
            y={styleTargetRect.y}
            width={styleTargetRect.width}
            height={styleTargetRect.height}
            fill={style.backgroundColor}
            data-testid={`styled-${pocket.side}-pocket-fill`}
          />
          {style.imageDataUrl && imgPlacement && (
            <g opacity={style.imageOpacity}>
              {style.imageFitMode === 'tile' ? (
                <rect
                  x={styleTargetRect.x}
                  y={styleTargetRect.y}
                  width={styleTargetRect.width}
                  height={styleTargetRect.height}
                  fill={`url(#${tilePatternId})`}
                />
              ) : (
                <image
                  href={style.imageDataUrl}
                  x={imgPlacement.x}
                  y={imgPlacement.y}
                  width={imgPlacement.width}
                  height={imgPlacement.height}
                  preserveAspectRatio="none"
                />
              )}
            </g>
          )}
        </g>
      )}
    </g>
  );
}

export interface PocketPieceGuidesProps {
  readonly pocket: PocketEnvelopeGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly unit: UnitSystem;
  readonly viewMode: PocketViewMode;
  readonly showGuides: boolean;
  readonly showEmptyLabel: boolean;
}

/** Renders vector cut/score/glue guides and labels ABOVE the artwork layers (pointerEvents="none"). */
export function PocketPieceGuidesSvg({
  pocket,
  offsetX,
  offsetY,
  unit,
  viewMode,
  showGuides,
  showEmptyLabel,
}: PocketPieceGuidesProps) {
  const center = GeometryPrimitives.rectCenter(pocket.faceRect);
  const openX = pocket.openEdge === 'right' ? pocket.faceRect.x + pocket.faceRect.width : 0;
  const isStyled = viewMode === 'styled';
  const isFoldedEndpaper = pocket.kind === 'folded-endpaper';
  const halves = isFoldedEndpaper ? getFoldedEndpaperHalfLabels(pocket.side) : null;
  const leftHalfCenterX = pocket.pocketWidthMm / 2;
  const rightHalfCenterX = pocket.pocketWidthMm + pocket.pocketWidthMm / 2;

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`} pointerEvents="none">
      {(viewMode === 'blueprint' || showGuides) && (
        <>
          {pocket.glueFlapPolygons.map((flap, idx) => (
            <polygon
              key={idx}
              points={GeometryPrimitives.polygonToSvgPoints(flap, 2)}
              fill="url(#inner-glue-hatch)"
              fillOpacity={isStyled ? '0.45' : '0.65'}
            />
          ))}
          <path
            d={GeometryPrimitives.polygonToSvgPath(pocket.outerCutPolygon, 2)}
            fill="none"
            stroke="#D93829"
            strokeWidth="1.0"
          />
          {pocket.scoreLines.map((line, idx) => (
            <line
              key={idx}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#1D5BD6"
              strokeWidth="0.75"
              strokeDasharray="4 2.5"
            />
          ))}
          {!isFoldedEndpaper && (
            <line
              x1={openX}
              y1={pocket.faceRect.y}
              x2={openX}
              y2={pocket.faceRect.y + pocket.faceRect.height}
              stroke="#0F8A47"
              strokeWidth="1.5"
            />
          )}
        </>
      )}

      {isFoldedEndpaper && halves ? (
        viewMode === 'blueprint' ? (
          <>
            <text
              x={center.x}
              y={12}
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              fill={PAPER_INK_FILL}
            >
              {pocket.label.toUpperCase()}
            </text>
            <text
              x={center.x}
              y={19}
              textAnchor="middle"
              fontSize="4.8"
              fill={PAPER_INK_FILL}
              opacity="0.72"
            >
              Sheet: {UnitConverter.formatDimensions(pocket.totalWidthMm, pocket.totalHeightMm, unit)}
            </text>

            {/* Left Half Annotation */}
            <text
              x={leftHalfCenterX}
              y={center.y - 4}
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              letterSpacing="0.5"
              fill={PAPER_INK_FILL}
              data-testid={`endpaper-${pocket.side}-left-zone`}
            >
              {halves.left}
            </text>
            <text
              x={leftHalfCenterX}
              y={center.y + 4}
              textAnchor="middle"
              fontSize="5"
              fill={PAPER_INK_FILL}
              opacity="0.72"
            >
              {UnitConverter.formatDimensions(pocket.pocketWidthMm, pocket.pocketHeightMm, unit)}
            </text>
            <text
              x={leftHalfCenterX}
              y={center.y + 11.5}
              textAnchor="middle"
              fontSize="4.3"
              fill="#1D5BD6"
              opacity="0.85"
            >
              {halves.left === 'PASTEDOWN' ? 'Glues to board' : 'Tips onto textblock'}
            </text>

            {/* Right Half Annotation */}
            <text
              x={rightHalfCenterX}
              y={center.y - 4}
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              letterSpacing="0.5"
              fill={PAPER_INK_FILL}
              data-testid={`endpaper-${pocket.side}-right-zone`}
            >
              {halves.right}
            </text>
            <text
              x={rightHalfCenterX}
              y={center.y + 4}
              textAnchor="middle"
              fontSize="5"
              fill={PAPER_INK_FILL}
              opacity="0.72"
            >
              {UnitConverter.formatDimensions(pocket.pocketWidthMm, pocket.pocketHeightMm, unit)}
            </text>
            <text
              x={rightHalfCenterX}
              y={center.y + 11.5}
              textAnchor="middle"
              fontSize="4.3"
              fill="#1D5BD6"
              opacity="0.85"
            >
              {halves.right === 'PASTEDOWN' ? 'Glues to board' : 'Tips onto textblock'}
            </text>

            <text
              x={pocket.pocketWidthMm}
              y={pocket.totalHeightMm - 8}
              textAnchor="middle"
              fontSize="4.4"
              fontWeight="600"
              fill="#1D5BD6"
            >
              CENTER FOLD
            </text>
          </>
        ) : (
          showGuides && (
            <>
              {/* Subtle translucent zone pills so PASTEDOWN / FLYLEAF stay legible on light or dark endpapers */}
              <g opacity="0.78">
                <rect
                  x={leftHalfCenterX - 24}
                  y={6.5}
                  width={48}
                  height={9}
                  rx={2}
                  fill={PAPER_SHEET_FILL}
                  fillOpacity="0.82"
                />
                <text
                  x={leftHalfCenterX}
                  y={12.5}
                  textAnchor="middle"
                  fontSize="4.6"
                  fontWeight="700"
                  letterSpacing="0.45"
                  fill={PAPER_INK_FILL}
                  data-testid={`endpaper-${pocket.side}-left-zone`}
                >
                  {halves.left}
                </text>
                <rect
                  x={rightHalfCenterX - 24}
                  y={6.5}
                  width={48}
                  height={9}
                  rx={2}
                  fill={PAPER_SHEET_FILL}
                  fillOpacity="0.82"
                />
                <text
                  x={rightHalfCenterX}
                  y={12.5}
                  textAnchor="middle"
                  fontSize="4.6"
                  fontWeight="700"
                  letterSpacing="0.45"
                  fill={PAPER_INK_FILL}
                  data-testid={`endpaper-${pocket.side}-right-zone`}
                >
                  {halves.right}
                </text>
              </g>
              {showEmptyLabel && (
                <text
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="600"
                  fill={PAPER_INK_FILL}
                  opacity="0.32"
                >
                  {pocket.label.toUpperCase()}
                </text>
              )}
            </>
          )
        )
      ) : viewMode === 'blueprint' ? (
        <>
          <text
            x={center.x}
            y={center.y - 6}
            textAnchor="middle"
            fontSize="7"
            fontWeight="700"
            fill={PAPER_INK_FILL}
          >
            {pocket.label.toUpperCase()}
          </text>
          <text
            x={center.x}
            y={center.y + 4}
            textAnchor="middle"
            fontSize="5.5"
            fill={PAPER_INK_FILL}
            opacity="0.75"
          >
            {UnitConverter.formatDimensions(pocket.pocketWidthMm, pocket.pocketHeightMm, unit)}
          </text>
          <text
            x={center.x}
            y={center.y + 13}
            textAnchor="middle"
            fontSize="5"
            fontWeight="600"
            fill="#0F8A47"
          >
            OPEN EDGE: {pocket.openEdge.toUpperCase()} (SPINE)
          </text>
        </>
      ) : (
        showGuides &&
        showEmptyLabel && (
          <text
            x={center.x}
            y={center.y}
            textAnchor="middle"
            fontSize="6.5"
            fontWeight="600"
            fill={PAPER_INK_FILL}
            opacity="0.32"
          >
            {pocket.label.toUpperCase()}
          </text>
        )
      )}
    </g>
  );
}

export interface SpineLinerBaseProps {
  readonly uniquePrefix: string;
  readonly spineLiner: SpineLinerGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly style: PocketStyleConfig;
  readonly viewMode: PocketViewMode;
  readonly linerImgPlacement: PocketImagePlacement | null;
}

/** Renders the base fill and optional legacy background image for the Spine Reinforcement Liner. */
export function SpineLinerBaseSvg({
  uniquePrefix,
  spineLiner,
  offsetX,
  offsetY,
  style,
  viewMode,
  linerImgPlacement,
}: SpineLinerBaseProps) {
  return (
    <g transform={`translate(${offsetX}, ${offsetY})`}>
      <rect
        x={0}
        y={0}
        width={spineLiner.widthMm}
        height={spineLiner.heightMm}
        fill={viewMode === 'styled' ? style.backgroundColor : PAPER_SHEET_FILL}
      />
      {viewMode === 'styled' && style.imageDataUrl && linerImgPlacement && (
        <g clipPath={`url(#${uniquePrefix}-liner-clip)`} opacity={style.imageOpacity}>
          {style.imageFitMode === 'tile' ? (
            <rect
              x={0}
              y={0}
              width={spineLiner.widthMm}
              height={spineLiner.heightMm}
              fill={`url(#${uniquePrefix}-liner-tile)`}
            />
          ) : (
            <image
              href={style.imageDataUrl}
              x={linerImgPlacement.x}
              y={linerImgPlacement.y}
              width={linerImgPlacement.width}
              height={linerImgPlacement.height}
              preserveAspectRatio="none"
            />
          )}
        </g>
      )}
    </g>
  );
}

export interface SpineLinerGuidesProps {
  readonly spineLiner: SpineLinerGeometry;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly unit: UnitSystem;
  readonly viewMode: PocketViewMode;
  readonly showGuides: boolean;
}

/** Renders vector cut/score guides and Blueprint CAD labels for the Spine Reinforcement Liner. */
export function SpineLinerGuidesSvg({
  spineLiner,
  offsetX,
  offsetY,
  unit,
  viewMode,
  showGuides,
}: SpineLinerGuidesProps) {
  return (
    <g transform={`translate(${offsetX}, ${offsetY})`} pointerEvents="none">
      {(viewMode === 'blueprint' || showGuides) && (
        <>
          <rect
            x={0}
            y={0}
            width={spineLiner.widthMm}
            height={spineLiner.heightMm}
            fill="none"
            stroke="#D93829"
            strokeWidth="1.0"
          />
          {spineLiner.scoreLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#1D5BD6"
              strokeWidth="0.75"
              strokeDasharray="4 2.5"
            />
          ))}
        </>
      )}

      {viewMode === 'blueprint' && (
        <>
          <text
            x={spineLiner.widthMm / 2}
            y={spineLiner.heightMm / 2 - 4}
            textAnchor="middle"
            fontSize="6.5"
            fontWeight="700"
            fill={PAPER_INK_FILL}
          >
            SPINE LINER
          </text>
          <text
            x={spineLiner.widthMm / 2}
            y={spineLiner.heightMm / 2 + 5}
            textAnchor="middle"
            fontSize="5.2"
            fill={PAPER_INK_FILL}
            opacity="0.75"
          >
            {UnitConverter.formatDimensions(spineLiner.widthMm, spineLiner.heightMm, unit)}
          </text>
        </>
      )}
    </g>
  );
}
