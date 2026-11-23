import { UnitConverter, type UnitSystem } from '@/types/units';

const DIM_STROKE = '#e6c884';
const DIM_WITNESS = 'rgba(230, 200, 132, 0.52)';
const DIM_TEXT = '#faf3e1';
const DIM_PILL_BG = '#122924';
const DIM_MUTED = '#c7d3cc';

export interface HorizontalDimLineProps {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly anchorY: number;
  readonly label: string;
  readonly emphasized?: boolean;
  readonly fontSize?: number;
}

/**
 * Architectural CAD horizontal dimension line with witness extension lines,
 * 45° drafting ticks, and a high-contrast pill label legible over the dark cutting mat.
 */
export function HorizontalDimLine({
  x1,
  x2,
  y,
  anchorY,
  label,
  emphasized = false,
  fontSize = 4.8,
}: HorizontalDimLineProps) {
  const span = Math.abs(x2 - x1);
  if (span < 0.2) return null;

  const midX = (x1 + x2) / 2;
  const stroke = emphasized ? '#f5d487' : DIM_STROKE;
  const strokeWidth = emphasized ? 0.75 : 0.55;
  const tick = emphasized ? 2.0 : 1.5;
  const pillW = Math.max(12, label.length * fontSize * 0.62 + 3.5);
  const pillH = fontSize + 2.4;

  // For very tight spans (e.g. 9 mm hinge), nudge label slightly outside/compact so it never clips ticks
  const labelY = span < pillW + 2 ? y - pillH * 0.78 : y;

  return (
    <g className="blueprint-dim-h" pointerEvents="none">
      {/* Witness extension lines */}
      <line x1={x1} y1={anchorY} x2={x1} y2={y + (y < anchorY ? -2 : 2)} stroke={DIM_WITNESS} strokeWidth="0.4" />
      <line x1={x2} y1={anchorY} x2={x2} y2={y + (y < anchorY ? -2 : 2)} stroke={DIM_WITNESS} strokeWidth="0.4" />

      {/* Main dimension bar */}
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={strokeWidth} />

      {/* 45° architectural drafting slash ticks */}
      <line x1={x1 - tick} y1={y + tick} x2={x1 + tick} y2={y - tick} stroke={stroke} strokeWidth={strokeWidth + 0.2} />
      <line x1={x2 - tick} y1={y + tick} x2={x2 + tick} y2={y - tick} stroke={stroke} strokeWidth={strokeWidth + 0.2} />

      {/* Crisp monospace measurement pill */}
      <rect
        x={midX - pillW / 2}
        y={labelY - pillH / 2}
        width={pillW}
        height={pillH}
        rx={1.4}
        fill={DIM_PILL_BG}
        fillOpacity="0.92"
        stroke={emphasized ? 'rgba(245, 212, 135, 0.45)' : 'rgba(230, 200, 132, 0.24)'}
        strokeWidth="0.35"
      />
      <text
        x={midX}
        y={labelY + 0.35}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={emphasized ? '700' : '600'}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill={emphasized ? '#fef3c7' : DIM_TEXT}
      >
        {label}
      </text>
    </g>
  );
}

export interface VerticalDimLineProps {
  readonly y1: number;
  readonly y2: number;
  readonly x: number;
  readonly anchorX: number;
  readonly label: string;
  readonly emphasized?: boolean;
  readonly fontSize?: number;
}

/**
 * Architectural CAD vertical dimension line with witness lines, 45° ticks, and rotated label.
 */
export function VerticalDimLine({
  y1,
  y2,
  x,
  anchorX,
  label,
  emphasized = false,
  fontSize = 4.8,
}: VerticalDimLineProps) {
  const span = Math.abs(y2 - y1);
  if (span < 0.2) return null;

  const midY = (y1 + y2) / 2;
  const stroke = emphasized ? '#f5d487' : DIM_STROKE;
  const strokeWidth = emphasized ? 0.75 : 0.55;
  const tick = emphasized ? 2.0 : 1.5;
  const pillW = Math.max(12, label.length * fontSize * 0.62 + 3.5);
  const pillH = fontSize + 2.4;

  const isTight = span < pillW + 2;
  const labelX = isTight ? x + (x < anchorX ? -pillH * 0.85 : pillH * 0.85) : x;

  return (
    <g className="blueprint-dim-v" pointerEvents="none">
      <line x1={anchorX} y1={y1} x2={x + (x < anchorX ? -2 : 2)} y2={y1} stroke={DIM_WITNESS} strokeWidth="0.4" />
      <line x1={anchorX} y1={y2} x2={x + (x < anchorX ? -2 : 2)} y2={y2} stroke={DIM_WITNESS} strokeWidth="0.4" />

      <line x1={x} y1={y1} x2={x} y2={y2} stroke={stroke} strokeWidth={strokeWidth} />

      <line x1={x - tick} y1={y1 + tick} x2={x + tick} y2={y1 - tick} stroke={stroke} strokeWidth={strokeWidth + 0.2} />
      <line x1={x - tick} y1={y2 + tick} x2={x + tick} y2={y2 - tick} stroke={stroke} strokeWidth={strokeWidth + 0.2} />

      <g transform={`rotate(-90 ${labelX} ${midY})`}>
        <rect
          x={labelX - pillW / 2}
          y={midY - pillH / 2}
          width={pillW}
          height={pillH}
          rx={1.4}
          fill={DIM_PILL_BG}
          fillOpacity="0.92"
          stroke={emphasized ? 'rgba(245, 212, 135, 0.45)' : 'rgba(230, 200, 132, 0.24)'}
          strokeWidth="0.35"
        />
        <text
          x={labelX}
          y={midY + 0.35}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight={emphasized ? '700' : '600'}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill={emphasized ? '#fef3c7' : DIM_TEXT}
        >
          {label}
        </text>
      </g>
    </g>
  );
}

export interface CumulativeRulerStop {
  readonly xMm: number;
  readonly tag?: string;
}

export interface CumulativeRulerStripProps {
  /** Absolute X coordinates in mm measured from the left edge (0 mm) */
  readonly stops: readonly CumulativeRulerStop[];
  readonly y: number;
  readonly anchorY: number;
  readonly unit: UnitSystem;
}

/**
 * Running steel-ruler datum strip from 0 at the left edge to Total Width at the right edge.
 * Lets leather/cloth binders lay one ruler down and tick every fold/board mark without adding.
 */
export function CumulativeRulerStrip({
  stops,
  y,
  anchorY,
  unit,
}: CumulativeRulerStripProps) {
  if (stops.length < 2) return null;
  const firstX = stops[0].xMm;
  const lastX = stops[stops.length - 1].xMm;

  // Dedupe stops within 0.2 mm
  const uniqueStops: CumulativeRulerStop[] = [];
  for (const s of stops) {
    if (uniqueStops.length === 0 || Math.abs(s.xMm - uniqueStops[uniqueStops.length - 1].xMm) > 0.2) {
      uniqueStops.push(s);
    }
  }

  return (
    <g data-testid="blueprint-cumulative-ruler" pointerEvents="none">
      {/* Baseline ruler bar */}
      <line x1={firstX} y1={y} x2={lastX} y2={y} stroke="#c59b48" strokeWidth="0.65" />

      {/* Caption on far left */}
      <text
        x={firstX - 3}
        y={y + 0.3}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize="3.8"
        fontWeight="700"
        fill={DIM_MUTED}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        RULER ({unit})
      </text>

      {uniqueStops.map((stop, idx) => {
        const prev = uniqueStops[idx - 1];
        const isTightToPrev = prev !== undefined && stop.xMm - prev.xMm < 18;
        const labelOffsetY = isTightToPrev ? 9.8 : 5.2;
        const valueStr = UnitConverter.formatValue(stop.xMm - firstX, unit);

        return (
          <g key={`ruler-stop-${idx}`}>
            {/* Faint witness tick from wrap bottom down to ruler */}
            <line
              x1={stop.xMm}
              y1={anchorY}
              x2={stop.xMm}
              y2={y + (isTightToPrev ? 6.8 : 2.4)}
              stroke={DIM_WITNESS}
              strokeWidth="0.35"
              strokeDasharray="1.5 1.5"
            />
            {/* Brass ruler tick */}
            <line
              x1={stop.xMm}
              y1={y - 1.8}
              x2={stop.xMm}
              y2={y + 2.2}
              stroke="#f5d487"
              strokeWidth="0.7"
            />
            <text
              x={stop.xMm}
              y={y + labelOffsetY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="4.1"
              fontWeight="600"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill={DIM_TEXT}
            >
              {valueStr}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export interface CornerMiterCalloutProps {
  readonly miterCutLegMm: number;
  readonly miterGapMm: number;
  readonly unit: UnitSystem;
}

/**
 * Highlights the exact top-left 45° corner bevel leg and board-tip clearance gap
 * so leather/cloth cutters can measure and slice perfect mitered corners with a ruler.
 */
export function CornerMiterCallout({
  miterCutLegMm,
  miterGapMm,
  unit,
}: CornerMiterCalloutProps) {
  if (miterCutLegMm <= 0.5) return null;
  const legText = UnitConverter.format(miterCutLegMm, unit);
  const gapText = UnitConverter.format(miterGapMm, unit);

  return (
    <g data-testid="blueprint-miter-callout" pointerEvents="none">
      {/* Dashed virtual corner square showing where the uncut 90° corner was */}
      <polyline
        points={`${miterCutLegMm},0 0,0 0,${miterCutLegMm}`}
        fill="none"
        stroke="#f5d487"
        strokeWidth="0.55"
        strokeDasharray="2 1.5"
      />
      {/* Highlighted 45° cut bevel */}
      <line
        x1={miterCutLegMm}
        y1={0}
        x2={0}
        y2={miterCutLegMm}
        stroke="#ef4444"
        strokeWidth="1.2"
      />
      {/* Leader line from corner bevel out to top-left callout badge */}
      <polyline
        points={`${miterCutLegMm * 0.42},${miterCutLegMm * 0.42} -6,-10 -24,-10`}
        fill="none"
        stroke="#f5d487"
        strokeWidth="0.55"
      />
      <circle cx={miterCutLegMm * 0.42} cy={miterCutLegMm * 0.42} r="1.2" fill="#f5d487" />
      <rect
        x={-26}
        y={-19.5}
        width={68}
        height={13}
        rx={2}
        fill={DIM_PILL_BG}
        fillOpacity="0.94"
        stroke="rgba(245, 212, 135, 0.55)"
        strokeWidth="0.45"
      />
      <text
        x={8}
        y={-15}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="4.1"
        fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill="#fef3c7"
      >
        45° MITER LEG: {legText}
      </text>
      <text
        x={8}
        y={-10}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="3.7"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill={DIM_MUTED}
      >
        Board Corner Gap: {gapText}
      </text>
    </g>
  );
}

export interface GrainDirectionArrowProps {
  readonly x: number;
  readonly centerY: number;
  readonly lengthMm?: number;
}

/**
 * Traditional bookbinding vertical double-headed grain-direction arrow (parallel to spine).
 */
export function GrainDirectionArrow({
  x,
  centerY,
  lengthMm = 44,
}: GrainDirectionArrowProps) {
  const half = lengthMm / 2;
  const topY = centerY - half;
  const botY = centerY + half;

  return (
    <g data-testid="blueprint-grain-arrow" pointerEvents="none" opacity="0.72">
      <line x1={x} y1={topY + 2} x2={x} y2={botY - 2} stroke="#8A6019" strokeWidth="0.75" />
      <polygon points={`${x},${topY} ${x - 1.8},${topY + 3.6} ${x + 1.8},${topY + 3.6}`} fill="#8A6019" />
      <polygon points={`${x},${botY} ${x - 1.8},${botY - 3.6} ${x + 1.8},${botY - 3.6}`} fill="#8A6019" />
      <text
        x={x + 4.2}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="3.8"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#8A6019"
        transform={`rotate(-90 ${x + 4.2} ${centerY})`}
      >
        GRAIN ↕
      </text>
    </g>
  );
}
