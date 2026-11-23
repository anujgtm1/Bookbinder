import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CaseGeometry, Rect2D } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { PRINT_DPI, UnitConverter } from '@/types/units';
import {
  Book3DModel,
  DEFAULT_BOOK_3D_ANGLE,
  type Book3DCameraAngle,
} from './book3d';
import { resolveFontCssFamily, type CustomFontAsset } from './fonts';
import {
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  type SpineTextPlacement,
  type StudioCanvasSpec,
} from './renderEngine';

export interface Book3DPreviewProps {
  readonly geometry: CaseGeometry;
  readonly studio: CoverStudioState;
  readonly customFont: CustomFontAsset | null;
  readonly angle?: Book3DCameraAngle;
  readonly onAngleChange?: (next: Book3DCameraAngle) => void;
}

interface CoverFaceSvgProps {
  readonly faceId: 'front' | 'spine' | 'back';
  readonly prefix: string;
  readonly viewRect: Rect2D;
  readonly spec: StudioCanvasSpec;
  readonly studio: CoverStudioState;
  readonly spinePlacements: readonly SpineTextPlacement[];
  readonly fontFamily: string;
  readonly showSpineText?: boolean;
}

function CoverFaceSvg({
  faceId,
  prefix,
  viewRect,
  spec,
  studio,
  spinePlacements,
  fontFamily,
  showSpineText = false,
}: CoverFaceSvgProps) {
  const clipNoneId = `${prefix}-${faceId}-clip-none`;
  const clipBackId = `${prefix}-${faceId}-clip-back`;
  const clipSpineId = `${prefix}-${faceId}-clip-spine`;
  const clipFrontId = `${prefix}-${faceId}-clip-front`;

  const clipIdForZone = (zone: string) => {
    if (zone === 'back') return clipBackId;
    if (zone === 'spine') return clipSpineId;
    if (zone === 'front') return clipFrontId;
    return clipNoneId;
  };

  return (
    <svg
      aria-hidden="true"
      viewBox={`${viewRect.x} ${viewRect.y} ${viewRect.width} ${viewRect.height}`}
      preserveAspectRatio="none"
      className="h-full w-full block select-none"
    >
      <defs>
        <clipPath id={clipNoneId}>
          <rect x={0} y={0} width={spec.totalWidthMm} height={spec.totalHeightMm} />
        </clipPath>
        <clipPath id={clipBackId}>
          <rect
            x={spec.backZoneRect.x}
            y={spec.backZoneRect.y}
            width={spec.backZoneRect.width}
            height={spec.backZoneRect.height}
          />
        </clipPath>
        <clipPath id={clipSpineId}>
          <rect
            x={spec.spineZoneRect.x}
            y={spec.spineZoneRect.y}
            width={spec.spineZoneRect.width}
            height={spec.spineZoneRect.height}
          />
        </clipPath>
        <clipPath id={clipFrontId}>
          <rect
            x={spec.frontZoneRect.x}
            y={spec.frontZoneRect.y}
            width={spec.frontZoneRect.width}
            height={spec.frontZoneRect.height}
          />
        </clipPath>
      </defs>

      <rect
        x={spec.backZoneRect.x}
        y={spec.backZoneRect.y}
        width={spec.backZoneRect.width}
        height={spec.backZoneRect.height}
        fill={studio.backBgColor}
      />
      <rect
        x={spec.spineZoneRect.x}
        y={spec.spineZoneRect.y}
        width={spec.spineZoneRect.width}
        height={spec.spineZoneRect.height}
        fill={studio.spineBgColor}
      />
      <rect
        x={spec.frontZoneRect.x}
        y={spec.frontZoneRect.y}
        width={spec.frontZoneRect.width}
        height={spec.frontZoneRect.height}
        fill={studio.frontBgColor}
      />

      {studio.layers.map((layer) => (
        <g key={layer.id} clipPath={`url(#${clipIdForZone(layer.clipZone)})`}>
          <image
            href={layer.dataUrl}
            x={layer.xMm}
            y={layer.yMm}
            width={layer.widthMm}
            height={layer.heightMm}
            preserveAspectRatio="none"
          />
        </g>
      ))}

      {showSpineText && (
        <g data-testid="book3d-spine-typography">
          {spinePlacements.map((item, idx) => (
            <text
              key={`${item.kind}-${idx}`}
              x={item.anchorXMm}
              y={item.anchorYMm}
              fill={studio.spineText.textColor}
              fontFamily={fontFamily}
              fontSize={UnitConverter.pointsToMm(item.fontSizePt)}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${item.rotationDegCss} ${item.anchorXMm} ${item.anchorYMm})`}
            >
              {item.text}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * Interactive CSS 3D folded hardcover book mockup rendered at exact physical
 * BOARD_W × BOARD_H × SPINE_W proportions with live front, spine, and back artwork.
 */
export function Book3DPreview({
  geometry,
  studio,
  customFont,
  angle: controlledAngle,
  onAngleChange,
}: Book3DPreviewProps) {
  const uniquePrefix = useId().replace(/:/g, '');
  const [uncontrolledAngle, setUncontrolledAngle] = useState<Book3DCameraAngle>(
    DEFAULT_BOOK_3D_ANGLE,
  );
  const [isDragging, setIsDragging] = useState(false);

  const angle = controlledAngle ?? uncontrolledAngle;
  const onAngleChangeRef = useRef(onAngleChange);
  useEffect(() => {
    onAngleChangeRef.current = onAngleChange;
  }, [onAngleChange]);

  const setAngle = (next: Book3DCameraAngle) => {
    if (onAngleChangeRef.current) {
      onAngleChangeRef.current(next);
    } else {
      setUncontrolledAngle(next);
    }
  };

  const dragStartRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origAngle: Book3DCameraAngle;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    origAngle: DEFAULT_BOOK_3D_ANGLE,
  });

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current.active) return;
      const next = Book3DModel.orbitByPointerDelta(
        dragStartRef.current.origAngle,
        e.clientX - dragStartRef.current.startX,
        e.clientY - dragStartRef.current.startY,
      );
      if (onAngleChangeRef.current) {
        onAngleChangeRef.current(next);
      } else {
        setUncontrolledAngle(next);
      }
    };
    const onPointerEnd = () => {
      if (!dragStartRef.current.active) return;
      dragStartRef.current.active = false;
      setIsDragging(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, []);

  const spec = useMemo(() => computeStudioCanvasSpec(geometry, PRINT_DPI), [geometry]);
  const spinePlacements = useMemo(
    () => computeSpineTextPlacements(geometry, studio),
    [geometry, studio],
  );
  const activeFontFamily = resolveFontCssFamily(studio.spineText.fontId, customFont);
  const dims = useMemo(() => Book3DModel.computeDimensionsPx(geometry, 320, 260), [geometry]);

  const frontViewRect: Rect2D = {
    x: geometry.outerWrap.frontBoardRect.x + spec.bleedMm,
    y: geometry.outerWrap.frontBoardRect.y + spec.bleedMm,
    width: geometry.outerWrap.frontBoardRect.width,
    height: geometry.outerWrap.frontBoardRect.height,
  };
  const spineViewRect: Rect2D = {
    x: geometry.outerWrap.spineRect.x + spec.bleedMm,
    y: geometry.outerWrap.spineRect.y + spec.bleedMm,
    width: geometry.outerWrap.spineRect.width,
    height: geometry.outerWrap.spineRect.height,
  };
  const backViewRect: Rect2D = {
    x: geometry.outerWrap.backBoardRect.x + spec.bleedMm,
    y: geometry.outerWrap.backBoardRect.y + spec.bleedMm,
    width: geometry.outerWrap.backBoardRect.width,
    height: geometry.outerWrap.backBoardRect.height,
  };

  const halfDepth = dims.depthPx / 2;
  const halfWidth = dims.widthPx / 2;
  const halfHeight = dims.heightPx / 2;

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label="Interactive 3D folded hardcover book preview. Drag or use arrow keys to rotate."
      data-testid="book3d-stage"
      className={`book3d-stage relative flex h-full w-full flex-col items-center justify-center select-none outline-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        setIsDragging(true);
        dragStartRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          origAngle: angle,
        };
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setAngle(Book3DModel.normalizeAngle({ ...angle, yawDeg: angle.yawDeg + 15 }));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setAngle(Book3DModel.normalizeAngle({ ...angle, yawDeg: angle.yawDeg - 15 }));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAngle(Book3DModel.normalizeAngle({ ...angle, pitchDeg: angle.pitchDeg + 8 }));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAngle(Book3DModel.normalizeAngle({ ...angle, pitchDeg: angle.pitchDeg - 8 }));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setAngle(DEFAULT_BOOK_3D_ANGLE);
        }
      }}
    >
      {/* Subtle desk contact shadow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full blur-2xl"
        style={{
          width: `${Math.round(dims.widthPx * 1.15)}px`,
          height: '38px',
          transform: `translateY(${Math.round(dims.heightPx / 2 + 12)}px)`,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.52), transparent 72%)',
        }}
      />

      {/* 3D Book Volume */}
      <div
        data-testid="book3d-volume"
        className={`book3d-volume ${isDragging ? '' : 'is-animating'}`}
        style={{
          width: `${dims.widthPx}px`,
          height: `${dims.heightPx}px`,
          transform: `rotateX(${angle.pitchDeg}deg) rotateY(${angle.yawDeg}deg)`,
        }}
      >
        {/* Front Cover Outer Face */}
        <div
          data-testid="book3d-front-face"
          className="book3d-face rounded-r-[3px] shadow-md"
          style={{
            transform: `translateZ(${halfDepth}px)`,
          }}
        >
          <CoverFaceSvg
            faceId="front"
            prefix={uniquePrefix}
            viewRect={frontViewRect}
            spec={spec}
            studio={studio}
            spinePlacements={spinePlacements}
            fontFamily={activeFontFamily}
          />
          {/* Pressed bookbinding hinge groove along left spine edge */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-3.5"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,0,0,0.22) 0%, rgba(255,255,255,0.14) 36%, rgba(0,0,0,0.20) 56%, transparent 100%)',
            }}
          />
          {/* Subtle top-left paper specular sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.09) 0%, transparent 44%, rgba(0,0,0,0.12) 100%)',
            }}
          />
        </div>

        {/* Front Cover Inside Endpaper Lip (visible around overhanging page block) */}
        <div
          aria-hidden="true"
          className="book3d-face rounded-l-[3px]"
          style={{
            backgroundColor: '#e9e0cf',
            transform: `rotateY(180deg) translateZ(${-(halfDepth - dims.boardThicknessPx)}px)`,
          }}
        />

        {/* Back Cover Outer Face */}
        <div
          data-testid="book3d-back-face"
          className="book3d-face rounded-l-[3px] shadow-md"
          style={{
            transform: `rotateY(180deg) translateZ(${halfDepth}px)`,
          }}
        >
          <CoverFaceSvg
            faceId="back"
            prefix={uniquePrefix}
            viewRect={backViewRect}
            spec={spec}
            studio={studio}
            spinePlacements={spinePlacements}
            fontFamily={activeFontFamily}
          />
          {/* Pressed hinge groove along right spine edge of back cover */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-3.5"
            style={{
              background:
                'linear-gradient(270deg, rgba(0,0,0,0.22) 0%, rgba(255,255,255,0.14) 36%, rgba(0,0,0,0.20) 56%, transparent 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(225deg, rgba(255,255,255,0.08) 0%, transparent 45%, rgba(0,0,0,0.14) 100%)',
            }}
          />
        </div>

        {/* Back Cover Inside Endpaper Lip */}
        <div
          aria-hidden="true"
          className="book3d-face rounded-r-[3px]"
          style={{
            backgroundColor: '#e9e0cf',
            transform: `translateZ(${-(halfDepth - dims.boardThicknessPx)}px)`,
          }}
        />

        {/* Spine Face (left edge) */}
        <div
          data-testid="book3d-spine-face"
          className="book3d-face"
          style={{
            width: `${dims.depthPx}px`,
            height: `${dims.heightPx}px`,
            left: `${(dims.widthPx - dims.depthPx) / 2}px`,
            top: 0,
            transform: `rotateY(-90deg) translateZ(${halfWidth}px)`,
          }}
        >
          <CoverFaceSvg
            faceId="spine"
            prefix={uniquePrefix}
            viewRect={spineViewRect}
            spec={spec}
            studio={studio}
            spinePlacements={spinePlacements}
            fontFamily={activeFontFamily}
            showSpineText
          />
          {/* Subtle cylindrical bookcloth spine lighting */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,0,0,0.26) 0%, rgba(255,255,255,0.14) 22%, rgba(255,255,255,0.03) 56%, rgba(0,0,0,0.26) 100%)',
            }}
          />
        </div>

        {/* Fore-Edge Page Block (recessed inside right cover overhang) */}
        <div
          aria-hidden="true"
          className="book3d-face book3d-pages-fore"
          style={{
            width: `${dims.pageDepthPx}px`,
            height: `${dims.pageHeightPx}px`,
            left: `${(dims.widthPx - dims.pageDepthPx) / 2}px`,
            top: `${dims.pageInsetPx}px`,
            transform: `rotateY(90deg) translateZ(${halfWidth - dims.pageInsetPx}px)`,
          }}
        />

        {/* Top Head-Edge Page Block (recessed inside top overhang) */}
        <div
          aria-hidden="true"
          className="book3d-face book3d-pages-end"
          style={{
            width: `${dims.pageWidthPx}px`,
            height: `${dims.pageDepthPx}px`,
            left: 0,
            top: `${(dims.heightPx - dims.pageDepthPx) / 2}px`,
            transform: `rotateX(90deg) translateZ(${halfHeight - dims.pageInsetPx}px)`,
          }}
        />

        {/* Bottom Tail-Edge Page Block (recessed inside bottom overhang) */}
        <div
          aria-hidden="true"
          className="book3d-face book3d-pages-end"
          style={{
            width: `${dims.pageWidthPx}px`,
            height: `${dims.pageDepthPx}px`,
            left: 0,
            top: `${(dims.heightPx - dims.pageDepthPx) / 2}px`,
            transform: `rotateX(-90deg) translateZ(${halfHeight - dims.pageInsetPx}px)`,
          }}
        />
      </div>

      {/* Subtle corner orientation readout */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-3 left-3 rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-[#efe8d8]/85"
      >
        Drag to orbit • {Math.round(angle.yawDeg)}° / {Math.round(angle.pitchDeg)}°
      </div>
    </div>
  );
}
