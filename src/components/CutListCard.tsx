import { Printer, Ruler, Scissors } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface CutListCardProps {
  readonly geometry: CaseGeometry;
  readonly unit: UnitSystem;
}

export function CutListCard({ geometry, unit }: CutListCardProps) {
  const { cutList, outerWrap, rollRecommendation } = geometry;
  const spacerLabel = `${roundTo(cutList.hingeSpacerMm, 1)} mm`;

  return (
    <section
      aria-label="Chipboard Cut List and Roll Sizing"
      data-testid="cut-list-card"
      className="rounded-lg border border-border bg-card px-4 py-3 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <h2 className="flex items-center gap-2 font-serif text-base font-semibold tracking-tight text-foreground">
          <Scissors className="h-4 w-4 text-brass" aria-hidden="true" />
          Chipboard Cut List &amp; Roll Sizing
        </h2>
        <Badge
          variant={rollRecommendation.fits ? 'success' : 'warning'}
          data-testid="roll-recommendation-badge"
          className="rounded-full px-2.5"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{rollRecommendation.summary}</span>
        </Badge>
      </div>

      <div className="kettle-stitch-divider grid gap-3.5 pt-2.5 lg:grid-cols-[1.35fr_1fr]">
        {/* Flat Ruled Cut List Columns (less boxy, clean editorial hierarchy) */}
        <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="py-1.5 sm:py-0 sm:pr-3.5" data-testid="cut-cover-boards">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Cover Boards</span>
              <Badge variant="brass" className="font-mono text-[10px]">
                Qty 2
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(
                cutList.coverBoards.widthMm,
                cutList.coverBoards.heightMm,
                unit,
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {roundTo(cutList.boardThicknessMm, 1)} mm chipboard • Front &amp; Back
            </p>
          </div>

          <div className="py-1.5 sm:px-3.5 sm:py-0" data-testid="cut-spine-strip">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Spine Strip</span>
              <Badge variant="brass" className="font-mono text-[10px]">
                Qty 1
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(
                cutList.spineStrip.widthMm,
                cutList.spineStrip.heightMm,
                unit,
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Includes pocket clearance allowance
            </p>
          </div>

          <div className="py-1.5 sm:pl-3.5 sm:py-0" data-testid="cut-outer-wrap">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Outer Wrap</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                1:1 mm
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(outerWrap.widthMm, outerWrap.heightMm, unit)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Turn-in {UnitConverter.format(outerWrap.turnInMm, unit)} • 45° miters
            </p>
          </div>
        </div>

        {/* Visual 9mm Hinge Spacer Assembly Reminder Diagram */}
        <figure className="drafting-surface flex flex-col justify-between rounded-md border border-dashed border-brass/45 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-foreground">
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
              Gluing Spacer Guide
            </span>
            <span className="font-mono text-[11px] text-brass">{spacerLabel} Hinge</span>
          </div>
          <svg
            role="img"
            viewBox="0 0 320 66"
            className="h-14 w-full"
            aria-label={`Assembly diagram showing Back Board, ${spacerLabel} spacer, Spine Strip, ${spacerLabel} spacer, and Front Board`}
          >
            <title>
              Place {spacerLabel} hinge spacer between spine strip and front/back boards during
              gluing
            </title>
            <rect
              x="4"
              y="5"
              width="312"
              height="56"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.26"
              strokeDasharray="4 2"
            />
            <rect
              x="16"
              y="12"
              width="104"
              height="42"
              rx="2"
              fill="currentColor"
              fillOpacity="0.08"
              stroke="currentColor"
              strokeOpacity="0.5"
            />
            <text
              x="68"
              y="36"
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill="currentColor"
            >
              Back Board
            </text>

            {/* Left hinge spacer */}
            <rect
              x="123"
              y="8"
              width="18"
              height="50"
              rx="1.5"
              fill="var(--brass-bright)"
              fillOpacity="0.22"
              stroke="var(--brass)"
              strokeWidth="1.2"
            />
            <text
              x="132"
              y="36"
              textAnchor="middle"
              fontSize="7.5"
              fontWeight="700"
              fill="var(--brass)"
              transform="rotate(-90 132 36)"
            >
              {spacerLabel}
            </text>

            {/* Spine strip */}
            <rect
              x="144"
              y="12"
              width="32"
              height="42"
              rx="2"
              fill="currentColor"
              fillOpacity="0.13"
              stroke="currentColor"
              strokeOpacity="0.6"
            />
            <text
              x="160"
              y="36"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="600"
              fill="currentColor"
              transform="rotate(-90 160 36)"
            >
              Spine
            </text>

            {/* Right hinge spacer */}
            <rect
              x="179"
              y="8"
              width="18"
              height="50"
              rx="1.5"
              fill="var(--brass-bright)"
              fillOpacity="0.22"
              stroke="var(--brass)"
              strokeWidth="1.2"
            />
            <text
              x="188"
              y="36"
              textAnchor="middle"
              fontSize="7.5"
              fontWeight="700"
              fill="var(--brass)"
              transform="rotate(-90 188 36)"
            >
              {spacerLabel}
            </text>

            {/* Front board */}
            <rect
              x="200"
              y="12"
              width="104"
              height="42"
              rx="2"
              fill="currentColor"
              fillOpacity="0.08"
              stroke="currentColor"
              strokeOpacity="0.5"
            />
            <text
              x="252"
              y="36"
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill="currentColor"
            >
              Front Board
            </text>
          </svg>
          <figcaption className="text-[11px] text-muted-foreground">
            Leave a <strong className="text-foreground">{spacerLabel}</strong> gap beside the spine
            strip so hinges flex cleanly.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
