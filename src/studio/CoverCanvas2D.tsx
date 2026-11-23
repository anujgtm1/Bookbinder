import { useMemo, type RefObject } from 'react';
import { getBindingStrategy } from '@/core/bindingStyles';
import {
  CoverTextLayerModel,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import type { CoverImageLayer, ResizeCorner } from '@/types/studioLayer';
import { UnitConverter } from '@/types/units';
import type { EyedropperTarget } from './ArtworkControlsCard';
import { LayerSelectionOverlay } from './LayerSelectionOverlay';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from './classicOrnaments';
import { resolveFontCssFamily, type CustomFontAsset } from './fonts';
import type { PreflightReport } from './preflight';
import {
  buildLayerFlipTransform,
  buildPointFlipTransform,
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  resolveZoneClipRect,
  type StudioCanvasSpec,
} from './renderEngine';
import type { ActiveSnapGuide } from './snapGuides';

export interface CoverCanvas2DProps {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly geometry: CaseGeometry;
  readonly spec: StudioCanvasSpec;
  readonly canvasBounds: Rect2D;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly selectedLayer: CoverImageLayer | null;
  readonly selectedTextId: string | null;
  readonly selectedOrnamentId: string | null;
  readonly eyedropperTarget: EyedropperTarget;
  readonly showGuides: boolean;
  readonly showPreflightOverlays: boolean;
  readonly preflight: PreflightReport;
  readonly activeIssueId: string | null;
  readonly visibleSnapGuides: readonly ActiveSnapGuide[];
  readonly suppressNextClickRef: RefObject<boolean>;
  readonly onClearSelection: () => void;
  readonly onSampleColorAtClick: (
    clientX: number,
    clientY: number,
    target: Exclude<EyedropperTarget, null>,
  ) => void;
  readonly onSelectImageLayer: (id: string) => void;
  readonly onStartLayerMove: (layer: CoverImageLayer, clientX: number, clientY: number) => void;
  readonly onStartLayerResize: (layer: CoverImageLayer, corner: ResizeCorner) => void;
  readonly onLayerWheel: (layer: CoverImageLayer, deltaY: number) => void;
  readonly onSelectText: (id: string) => void;
  readonly onStartTextDrag: (layer: CoverTextLayer, clientX: number, clientY: number) => void;
  readonly onSelectOrnament: (id: string) => void;
  readonly onStartOrnamentDrag: (
    ornament: CoverOrnamentLayer,
    clientX: number,
    clientY: number,
  ) => void;
  readonly onStartOrnamentResize: (ornament: CoverOrnamentLayer, corner: ResizeCorner) => void;
}

export function CoverCanvas2D({
  svgRef,
  geometry,
  spec,
  canvasBounds,
  studio,
  customFont,
  selectedLayer,
  selectedTextId,
  selectedOrnamentId,
  eyedropperTarget,
  showGuides,
  showPreflightOverlays,
  preflight,
  activeIssueId,
  visibleSnapGuides,
  suppressNextClickRef,
  onClearSelection,
  onSampleColorAtClick,
  onSelectImageLayer,
  onStartLayerMove,
  onStartLayerResize,
  onLayerWheel,
  onSelectText,
  onStartTextDrag,
  onSelectOrnament,
  onStartOrnamentDrag,
  onStartOrnamentResize,
}: CoverCanvas2DProps) {
  const bindingStrategy = getBindingStrategy(geometry.bindingStyle);
  const spinePlacements = useMemo(
    () => computeSpineTextPlacements(geometry, studio),
    [geometry, studio],
  );
  const activeFontFamily = resolveFontCssFamily(studio.spineText.fontId, customFont);
  const shiftedCutPolygon = useMemo(
    () =>
      GeometryPrimitives.translatePolygon(
        geometry.outerWrap.outerCutPolygon,
        spec.bleedMm,
        spec.bleedMm,
      ),
    [geometry.outerWrap.outerCutPolygon, spec.bleedMm],
  );
  const handleCornerSize = Math.max(7.5, spec.totalWidthMm * 0.022);

  return (
    <div className="flex h-full w-full items-center justify-center p-6 pb-16">
      <svg
        ref={svgRef}
        role="img"
        aria-label="Interactive hardcover outer wrap canvas with draggable images and spine typography"
        data-testid="studio-preview-svg"
        viewBox={`0 0 ${spec.totalWidthMm} ${spec.totalHeightMm}`}
        className={`max-h-full max-w-full select-none drop-shadow-[0_16px_28px_rgba(0,0,0,0.48)] ${
          eyedropperTarget ? 'cursor-crosshair' : 'cursor-default'
        }`}
        style={{ touchAction: 'none' }}
        onClick={(e) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (eyedropperTarget) {
            onSampleColorAtClick(e.clientX, e.clientY, eyedropperTarget);
          } else if (e.target === e.currentTarget) {
            onClearSelection();
          }
        }}
        onWheel={(e) => {
          if (!selectedLayer) return;
          e.preventDefault();
          onLayerWheel(selectedLayer, e.deltaY);
        }}
      >
        <title>Outer Cover Styler Interactive Canvas</title>
        <defs>
          <clipPath id="studio-clip-none">
            <rect x={0} y={0} width={spec.totalWidthMm} height={spec.totalHeightMm} />
          </clipPath>
          <clipPath id="studio-clip-back">
            <rect
              x={spec.backArtworkRect.x}
              y={spec.backArtworkRect.y}
              width={spec.backArtworkRect.width}
              height={spec.backArtworkRect.height}
            />
          </clipPath>
          <clipPath id="studio-clip-spine">
            <rect
              x={spec.spineArtworkRect.x}
              y={spec.spineArtworkRect.y}
              width={spec.spineArtworkRect.width}
              height={spec.spineArtworkRect.height}
            />
          </clipPath>
          <clipPath id="studio-clip-front">
            <rect
              x={spec.frontArtworkRect.x}
              y={spec.frontArtworkRect.y}
              width={spec.frontArtworkRect.width}
              height={spec.frontArtworkRect.height}
            />
          </clipPath>
          <pattern
            id="preflight-hatch-error"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="rgba(239, 68, 68, 0.24)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="1.6" />
          </pattern>
          <pattern
            id="preflight-hatch-warning"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="rgba(249, 115, 22, 0.20)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f97316" strokeWidth="1.4" />
          </pattern>
          <pattern
            id="studio-glue-tab-hatch"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill="rgba(197, 155, 72, 0.22)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#facc15" strokeWidth="0.9" strokeOpacity="0.7" />
          </pattern>
          <filter id="brass-snap-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#facc15" floodOpacity="0.9" />
          </filter>
        </defs>

        {/* Base Zone Background Fills */}
        <rect
          x={spec.backZoneRect.x}
          y={spec.backZoneRect.y}
          width={spec.backZoneRect.width}
          height={spec.backZoneRect.height}
          fill={studio.backBgColor}
          data-testid="studio-back-fill"
          onClick={(e) => {
            if (!eyedropperTarget) {
              e.stopPropagation();
              onClearSelection();
            }
          }}
        />
        <rect
          x={spec.spineZoneRect.x}
          y={spec.spineZoneRect.y}
          width={spec.spineZoneRect.width}
          height={spec.spineZoneRect.height}
          fill={studio.spineBgColor}
          data-testid="studio-spine-fill"
          onClick={(e) => {
            if (!eyedropperTarget) {
              e.stopPropagation();
              onClearSelection();
            }
          }}
        />
        <rect
          x={spec.frontZoneRect.x}
          y={spec.frontZoneRect.y}
          width={spec.frontZoneRect.width}
          height={spec.frontZoneRect.height}
          fill={studio.frontBgColor}
          data-testid="studio-front-fill"
          onClick={(e) => {
            if (!eyedropperTarget) {
              e.stopPropagation();
              onClearSelection();
            }
          }}
        />

        {/* Free-Form Draggable & Resizable Artwork Layers */}
        {studio.layers.map((layer, index) => {
          const clipId = `studio-clip-${layer.clipZone}`;
          return (
            <g key={layer.id} clipPath={`url(#${clipId})`}>
              <image
                href={layer.dataUrl}
                x={layer.xMm}
                y={layer.yMm}
                width={layer.widthMm}
                height={layer.heightMm}
                transform={buildLayerFlipTransform(
                  layer.xMm,
                  layer.yMm,
                  layer.widthMm,
                  layer.heightMm,
                  layer.flipX,
                  layer.flipY,
                )}
                preserveAspectRatio="none"
                data-testid={`studio-layer-${index}`}
                className={
                  eyedropperTarget ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                }
                onClick={(e) => {
                  if (eyedropperTarget) return;
                  e.stopPropagation();
                  onSelectImageLayer(layer.id);
                }}
                onPointerDown={(e) => {
                  if (eyedropperTarget) return;
                  e.stopPropagation();
                  onStartLayerMove(layer, e.clientX, e.clientY);
                }}
              />
            </g>
          );
        })}

        {/* Classic Bookbindery Vector Ornaments & Custom SVG Stamps (draggable & 4-corner resizable) */}
        {(studio.ornaments ?? []).map((orn, index) => {
          const compoundD = buildOrnamentCompoundPath(orn);
          if (!compoundD) return null;
          const style = getOrnamentSvgStyle(orn);
          const isSelected = orn.id === selectedOrnamentId && !eyedropperTarget;
          const ornHandleHalf = Math.min(3.2, handleCornerSize * 0.42);
          const ornCorners: readonly {
            readonly corner: ResizeCorner;
            readonly cx: number;
            readonly cy: number;
            readonly cursor: string;
          }[] = [
            { corner: 'nw', cx: orn.xMm, cy: orn.yMm, cursor: 'nwse-resize' },
            { corner: 'ne', cx: orn.xMm + orn.widthMm, cy: orn.yMm, cursor: 'nesw-resize' },
            {
              corner: 'se',
              cx: orn.xMm + orn.widthMm,
              cy: orn.yMm + orn.heightMm,
              cursor: 'nwse-resize',
            },
            { corner: 'sw', cx: orn.xMm, cy: orn.yMm + orn.heightMm, cursor: 'nesw-resize' },
          ];
          return (
            <g
              key={orn.id}
              data-testid={`studio-ornament-${index}`}
              className={
                eyedropperTarget ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
              }
              onClick={(e) => {
                if (eyedropperTarget) return;
                e.stopPropagation();
                onSelectOrnament(orn.id);
              }}
              onPointerDown={(e) => {
                if (eyedropperTarget) return;
                e.stopPropagation();
                onStartOrnamentDrag(orn, e.clientX, e.clientY);
              }}
            >
              {/* Transparent hit target so thin frames/dividers are easy to grab */}
              <rect
                x={orn.xMm}
                y={orn.yMm}
                width={orn.widthMm}
                height={orn.heightMm}
                fill="transparent"
              />
              <path
                d={compoundD}
                fill={style.fill}
                stroke={style.stroke !== 'none' ? style.stroke : undefined}
                strokeWidth={style.strokeWidthMm > 0 ? style.strokeWidthMm : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {isSelected && (
                <>
                  <rect
                    x={orn.xMm - 1.5}
                    y={orn.yMm - 1.5}
                    width={orn.widthMm + 3}
                    height={orn.heightMm + 3}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="0.9"
                    strokeDasharray="3.5 2"
                    pointerEvents="none"
                  />
                  {ornCorners.map(({ corner, cx, cy, cursor }) => (
                    <rect
                      key={corner}
                      x={cx - ornHandleHalf}
                      y={cy - ornHandleHalf}
                      width={ornHandleHalf * 2}
                      height={ornHandleHalf * 2}
                      rx={0.8}
                      fill="#faf6ee"
                      stroke="#b48327"
                      strokeWidth="0.85"
                      style={{ cursor }}
                      data-testid={`ornament-resize-${corner}`}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onStartOrnamentResize(orn, corner);
                      }}
                    />
                  ))}
                </>
              )}
            </g>
          );
        })}

        {/* Draggable Front / Back / Spine Cover Text Layers */}
        {(studio.textLayers ?? []).map((layer, index) => {
          const lineItems = computeCoverTextLinePlacements(layer);
          const layerFamily = resolveFontCssFamily(layer.fontId, customFont);
          const anchor =
            layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle';
          const bounds = CoverTextLayerModel.estimateBounds(layer);
          const isSelected = layer.id === selectedTextId && !eyedropperTarget;
          return (
            <g
              key={layer.id}
              data-testid={`studio-cover-text-${index}`}
              transform={buildPointFlipTransform(layer.xMm, layer.yMm, layer.flipX, layer.flipY)}
              className={
                eyedropperTarget ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
              }
              onClick={(e) => {
                if (eyedropperTarget) return;
                e.stopPropagation();
                onSelectText(layer.id);
              }}
              onPointerDown={(e) => {
                if (eyedropperTarget) return;
                e.stopPropagation();
                onStartTextDrag(layer, e.clientX, e.clientY);
              }}
            >
              <rect
                x={bounds.x - 2}
                y={bounds.y - 2}
                width={bounds.width + 4}
                height={bounds.height + 4}
                fill="transparent"
                stroke={isSelected ? '#facc15' : 'none'}
                strokeWidth={isSelected ? '0.9' : '0'}
                strokeDasharray={isSelected ? '3.5 2' : undefined}
              />
              {lineItems.map((item, lineIdx) => (
                <text
                  key={`${layer.id}-${lineIdx}`}
                  x={item.anchorXMm}
                  y={item.anchorYMm}
                  fill={item.color}
                  fontFamily={layerFamily}
                  fontSize={UnitConverter.pointsToMm(item.fontSizePt)}
                  letterSpacing={`${item.letterSpacingEm}em`}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                >
                  {item.text}
                </text>
              ))}
            </g>
          );
        })}

        {/* Spine Typography Overlay */}
        <g data-testid="studio-spine-typography" pointerEvents="none">
          {spinePlacements.map((item, idx) => (
            <text
              key={`${item.kind}-${idx}`}
              x={item.anchorXMm}
              y={item.anchorYMm}
              fill={studio.spineText.textColor}
              fontFamily={activeFontFamily}
              fontSize={UnitConverter.pointsToMm(item.fontSizePt)}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${item.rotationDegCss} ${item.anchorXMm} ${item.anchorYMm})`}
            >
              {item.text}
            </text>
          ))}
        </g>

        {/* Fold, Board & Cut Guides Overlay */}
        {showGuides && (
          <g pointerEvents="none">
            {bindingStrategy.capabilities.hasGlueTabs &&
              geometry.outerWrap.jacketGlueTabPolygons.map((tabPoly, idx) => (
                <path
                  key={`studio-glue-tab-${idx}`}
                  d={GeometryPrimitives.polygonToSvgPath(
                    GeometryPrimitives.translatePolygon(tabPoly, spec.bleedMm, spec.bleedMm),
                    2,
                  )}
                  fill="url(#studio-glue-tab-hatch)"
                  stroke="#facc15"
                  strokeOpacity="0.8"
                  strokeWidth="0.65"
                  strokeDasharray="3 2"
                />
              ))}
            <path
              d={GeometryPrimitives.polygonToSvgPath(shiftedCutPolygon, 2)}
              fill="none"
              stroke="#FF4D3D"
              strokeWidth="0.95"
              strokeDasharray={
                studio.cutLineMode === 'bleed-registration' ? '4 2.5' : undefined
              }
            />
            {geometry.outerWrap.foldLines.map((line, i) => (
              <line
                key={`studio-fold-${i}`}
                data-testid="studio-fold-line"
                x1={line.x1 + spec.bleedMm}
                y1={line.y1 + spec.bleedMm}
                x2={line.x2 + spec.bleedMm}
                y2={line.y2 + spec.bleedMm}
                stroke="#ffffff"
                strokeOpacity="0.68"
                strokeWidth="0.7"
                strokeDasharray="5 3"
              />
            ))}
            {bindingStrategy.capabilities.hasFlaps &&
              geometry.outerWrap.jacketFlapWidthMm > 0 &&
              [
                {
                  key: 'left-flap-hint',
                  label: bindingStrategy.panelLabels.leftFlap ?? 'BACK FLAP',
                  cx: spec.bleedMm + geometry.outerWrap.jacketFlapWidthMm / 2,
                  cy:
                    spec.bleedMm +
                    geometry.outerWrap.backBoardRect.y +
                    geometry.outerWrap.backBoardRect.height / 2,
                },
                {
                  key: 'right-flap-hint',
                  label: bindingStrategy.panelLabels.rightFlap ?? 'FRONT FLAP',
                  cx:
                    spec.bleedMm +
                    geometry.outerWrap.widthMm -
                    geometry.outerWrap.jacketFlapWidthMm / 2,
                  cy:
                    spec.bleedMm +
                    geometry.outerWrap.frontBoardRect.y +
                    geometry.outerWrap.frontBoardRect.height / 2,
                },
              ].map(({ key, label, cx, cy }) => (
                <text
                  key={key}
                  x={cx}
                  y={cy}
                  fill="#ffffff"
                  fillOpacity="0.45"
                  fontSize="5.5"
                  fontWeight="600"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(-90 ${cx} ${cy})`}
                >
                  {label}
                </text>
              ))}
            {studio.layers.length === 0 &&
              (studio.textLayers ?? []).length === 0 &&
              (studio.ornaments ?? []).length === 0 && (
                <>
                  <text
                    x={
                      spec.bleedMm +
                      geometry.outerWrap.backBoardRect.x +
                      geometry.outerWrap.backBoardRect.width / 2
                    }
                    y={spec.totalHeightMm / 2}
                    fill="#ffffff"
                    fillOpacity="0.45"
                    fontSize="7.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {bindingStrategy.panelLabels.back}
                  </text>
                  <text
                    x={
                      spec.bleedMm +
                      geometry.outerWrap.frontBoardRect.x +
                      geometry.outerWrap.frontBoardRect.width / 2
                    }
                    y={spec.totalHeightMm / 2}
                    fill="#ffffff"
                    fillOpacity="0.45"
                    fontSize="7.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    DROP IMAGES ANYWHERE
                  </text>
                </>
              )}
          </g>
        )}

        {/* Preview-Only Red/Amber Preflight Consistency Overlays */}
        {(showPreflightOverlays || activeIssueId !== null) &&
          preflight.issues.some((i) => i.highlights.length > 0) && (
            <g data-testid="studio-preflight-overlays" pointerEvents="none">
              {preflight.issues.map((issue) => {
                if (issue.highlights.length === 0) return null;
                if (!showPreflightOverlays && activeIssueId !== issue.id) return null;
                const dimmed = activeIssueId !== null && activeIssueId !== issue.id;
                return (
                  <g key={issue.id} opacity={dimmed ? 0.22 : 1}>
                    {issue.highlights.map((hl, idx) => {
                      const isErr = hl.severity === 'error';
                      const isOutline = hl.style === 'outline';
                      const strokeColor = isErr ? '#ef4444' : '#f97316';
                      const fillValue = isOutline
                        ? 'none'
                        : isErr
                          ? 'url(#preflight-hatch-error)'
                          : 'url(#preflight-hatch-warning)';
                      const pillW = Math.min(hl.rect.width * 0.9, 44);
                      const cx = isOutline
                        ? hl.rect.x + hl.rect.width - pillW / 2 - 3
                        : hl.rect.x + hl.rect.width / 2;
                      const cy = isOutline ? hl.rect.y + 7 : hl.rect.y + hl.rect.height / 2;
                      const showTag =
                        Boolean(hl.label) && hl.rect.width >= 16 && hl.rect.height >= 7;
                      return (
                        <g key={idx}>
                          <rect
                            x={hl.rect.x}
                            y={hl.rect.y}
                            width={hl.rect.width}
                            height={hl.rect.height}
                            fill={fillValue}
                            stroke={strokeColor}
                            strokeWidth={isErr ? '1.3' : '1.0'}
                            strokeDasharray={isErr ? undefined : '4 2'}
                            data-testid="preflight-highlight-rect"
                          />
                          {showTag && (
                            <g>
                              <rect
                                x={cx - pillW / 2}
                                y={cy - 4.2}
                                width={pillW}
                                height={8.4}
                                rx={2}
                                fill={isErr ? '#991b1b' : '#9a3412'}
                                fillOpacity="0.92"
                              />
                              <text
                                x={cx}
                                y={cy + 0.4}
                                fill="#fff7ed"
                                fontSize="4.8"
                                fontWeight="700"
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                {hl.label}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          )}

        <LayerSelectionOverlay
          canvasBounds={canvasBounds}
          activeSnapGuides={visibleSnapGuides}
          selectedLayer={selectedLayer}
          clipBoundaryRect={
            selectedLayer && selectedLayer.clipZone !== 'none'
              ? resolveZoneClipRect(spec, selectedLayer.clipZone)
              : null
          }
          hideSelection={Boolean(eyedropperTarget)}
          handleCornerSizeMm={handleCornerSize}
          onStartResize={onStartLayerResize}
        />
      </svg>
    </div>
  );
}
