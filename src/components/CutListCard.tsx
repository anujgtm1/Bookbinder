import { Printer, Ruler, Scissors } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card data-testid="cut-list-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-serif text-base">
            <Scissors className="h-4 w-4 text-primary" aria-hidden="true" />
            Chipboard Cut List &amp; Roll Sizing
          </CardTitle>
          <Badge
            variant={rollRecommendation.fits ? 'success' : 'warning'}
            data-testid="roll-recommendation-badge"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{rollRecommendation.summary}</span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        {/* Exact Cut List Table */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div
            className="rounded-md border border-border bg-secondary/45 p-3"
            data-testid="cut-cover-boards"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Cover Boards</span>
              <Badge variant="outline" className="font-mono text-[11px]">
                Qty 2
              </Badge>
            </div>
            <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(
                cutList.coverBoards.widthMm,
                cutList.coverBoards.heightMm,
                unit,
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {roundTo(cutList.boardThicknessMm, 1)} mm chipboard (Front &amp; Back)
            </p>
          </div>

          <div
            className="rounded-md border border-border bg-secondary/45 p-3"
            data-testid="cut-spine-strip"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Spine Strip</span>
              <Badge variant="outline" className="font-mono text-[11px]">
                Qty 1
              </Badge>
            </div>
            <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">
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

          <div
            className="rounded-md border border-border bg-secondary/45 p-3"
            data-testid="cut-outer-wrap"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Outer Wrap</span>
              <Badge variant="outline" className="font-mono text-[11px]">
                1:1 mm
              </Badge>
            </div>
            <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(outerWrap.widthMm, outerWrap.heightMm, unit)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Turn-in {UnitConverter.format(outerWrap.turnInMm, unit)} • 45° miters
            </p>
          </div>
        </div>

        {/* Visual 9mm Hinge Spacer Assembly Reminder Diagram */}
        <figure className="flex flex-col justify-between rounded-md border border-dashed border-primary/40 bg-drafting-bg/70 p-2.5">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-primary">
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
              Case Gluing Reminder
            </span>
            <span className="font-mono">{spacerLabel} Hinge Spacer</span>
          </div>
          <svg
            role="img"
            viewBox="0 0 320 74"
            className="h-16 w-full"
            aria-label={`Assembly diagram showing Back Board, ${spacerLabel} spacer, Spine Strip, ${spacerLabel} spacer, and Front Board`}
          >
            <title>
              Place {spacerLabel} hinge spacer between spine strip and front/back boards during
              gluing
            </title>
            {/* Outer wrap backing */}
            <rect
              x="4"
              y="6"
              width="312"
              height="62"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeDasharray="4 2"
            />
            {/* Back board */}
            <rect
              x="16"
              y="14"
              width="104"
              height="46"
              rx="2"
              fill="currentColor"
              fillOpacity="0.1"
              stroke="currentColor"
              strokeOpacity="0.55"
            />
            <text
              x="68"
              y="40"
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="currentColor"
            >
              Back Board
            </text>

            {/* Left hinge spacer */}
            <rect
              x="123"
              y="10"
              width="18"
              height="54"
              rx="1.5"
              fill="#0066FF"
              fillOpacity="0.18"
              stroke="#0066FF"
              strokeWidth="1.2"
            />
            <text
              x="132"
              y="40"
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="#0066FF"
              transform="rotate(-90 132 40)"
            >
              {spacerLabel}
            </text>

            {/* Spine strip */}
            <rect
              x="144"
              y="14"
              width="32"
              height="46"
              rx="2"
              fill="currentColor"
              fillOpacity="0.14"
              stroke="currentColor"
              strokeOpacity="0.65"
            />
            <text
              x="160"
              y="40"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="600"
              fill="currentColor"
              transform="rotate(-90 160 40)"
            >
              Spine
            </text>

            {/* Right hinge spacer */}
            <rect
              x="179"
              y="10"
              width="18"
              height="54"
              rx="1.5"
              fill="#0066FF"
              fillOpacity="0.18"
              stroke="#0066FF"
              strokeWidth="1.2"
            />
            <text
              x="188"
              y="40"
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="#0066FF"
              transform="rotate(-90 188 40)"
            >
              {spacerLabel}
            </text>

            {/* Front board */}
            <rect
              x="200"
              y="14"
              width="104"
              height="46"
              rx="2"
              fill="currentColor"
              fillOpacity="0.1"
              stroke="currentColor"
              strokeOpacity="0.55"
            />
            <text
              x="252"
              y="40"
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="currentColor"
            >
              Front Board
            </text>
          </svg>
          <figcaption className="text-[11px] text-muted-foreground">
            Use a <strong className="text-foreground">{spacerLabel}</strong> spacer on both sides of
            the spine strip so hinges flex cleanly.
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
