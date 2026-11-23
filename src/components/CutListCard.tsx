import { Printer, Ruler, Scissors } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CaseGeometry } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface CutListCardProps {
  readonly geometry: CaseGeometry;
  readonly unit: UnitSystem;
  readonly className?: string;
}

export function CutListCard({ geometry, unit, className }: CutListCardProps) {
  const { cutList, outerWrap, rollRecommendation, mediaFit, bindingStyle } = geometry;
  const isFlexible = bindingStyle === 'flexible-spine';
  const isSoftcover = bindingStyle === 'softcover-jacket';
  const spacerLabel = isFlexible
    ? `${roundTo(cutList.spineStrip.widthMm, 1)} mm`
    : `${roundTo(cutList.hingeSpacerMm, 1)} mm`;
  const flapLabel = `${roundTo(outerWrap.jacketFlapWidthMm, 1)} mm`;
  const tabLabel = `${roundTo(outerWrap.jacketGlueTabHeightMm, 1)} mm`;
  const fitBadgeVariant =
    mediaFit.mediaId === 'exact-auto'
      ? rollRecommendation.fits
        ? 'success'
        : 'warning'
      : mediaFit.status === 'does-not-fit'
        ? 'destructive'
        : mediaFit.status === 'fits-2-sheet-tile'
          ? 'warning'
          : 'success';
  const fitBadgeSummary =
    mediaFit.mediaId === 'exact-auto' ? rollRecommendation.summary : mediaFit.summary;

  return (
    <section
      aria-label="Chipboard Cut List and Roll Sizing"
      data-testid="cut-list-card"
      className={cn('rounded-lg border border-border bg-card px-4 py-3 shadow-xs', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
        <h2 className="flex items-center gap-2 font-serif text-base font-semibold tracking-tight text-foreground">
          <Scissors className="h-4 w-4 text-brass" aria-hidden="true" />
          {isSoftcover
            ? 'Fold-and-Glue Slip Cover & Sheet Sizing'
            : 'Chipboard Cut List & Roll Sizing'}
        </h2>
        <Badge
          variant={fitBadgeVariant}
          data-testid="roll-recommendation-badge"
          data-fit-status={mediaFit.status}
          className="rounded-full px-2.5"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{fitBadgeSummary}</span>
        </Badge>
      </div>

      <div className="kettle-stitch-divider grid gap-3.5 pt-2.5 lg:grid-cols-[1.35fr_1fr]">
        {/* Flat Ruled Cut List Columns (adapts cleanly to Rigid, Flexible Spine, or Softcover Jacket) */}
        <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="py-1.5 sm:py-0 sm:pr-3.5" data-testid="cut-cover-boards">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{isSoftcover ? 'Chipboard' : 'Cover Boards'}</span>
              <Badge variant={isSoftcover ? 'outline' : 'brass'} className="font-mono text-[10px]">
                {isSoftcover ? 'None' : `Qty ${cutList.coverBoards.quantity}`}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {isSoftcover
                ? '0-Board Softcover'
                : UnitConverter.formatDimensions(
                    cutList.coverBoards.widthMm,
                    cutList.coverBoards.heightMm,
                    unit,
                  )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isSoftcover
                ? 'Print on heavy cardstock, kraft, or bookcloth'
                : `${roundTo(cutList.boardThicknessMm, 1)} mm chipboard • Front & Back`}
            </p>
          </div>

          <div className="py-1.5 sm:px-3.5 sm:py-0" data-testid="cut-spine-strip">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{isSoftcover ? 'Slip-In Flaps' : 'Spine Strip'}</span>
              <Badge
                variant={isFlexible || isSoftcover ? 'outline' : 'brass'}
                className="font-mono text-[10px]"
              >
                {isSoftcover ? 'Qty 2' : isFlexible ? 'Qty 0' : `Qty ${cutList.spineStrip.quantity}`}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {isSoftcover
                ? `${UnitConverter.format(outerWrap.jacketFlapWidthMm, unit)} Tuck Flaps`
                : isFlexible
                  ? `${UnitConverter.format(cutList.spineStrip.widthMm, unit)} Cloth Gap`
                  : UnitConverter.formatDimensions(
                      cutList.spineStrip.widthMm,
                      cutList.spineStrip.heightMm,
                      unit,
                    )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isSoftcover
                ? 'Integrated left & right slip-in pockets'
                : isFlexible
                  ? 'No rigid spine strip — opens flat'
                  : 'Includes pocket clearance allowance'}
            </p>
          </div>

          <div className="py-1.5 sm:pl-3.5 sm:py-0" data-testid="cut-outer-wrap">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{isSoftcover ? 'Jacket Sheet' : 'Outer Wrap'}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                1:1 mm
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {UnitConverter.formatDimensions(outerWrap.widthMm, outerWrap.heightMm, unit)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isSoftcover
                ? `Fold ${tabLabel} glue tabs & ${flapLabel} flaps inward`
                : `Turn-in ${UnitConverter.format(outerWrap.turnInMm, unit)} • 45° miters`}
            </p>
          </div>
        </div>

        {/* Visual Assembly Diagram (adapts for Rigid 3-Board, Flexible 2-Board, or 0-Board Softcover Jacket) */}
        <figure className="drafting-surface flex flex-col justify-between rounded-md border border-dashed border-brass/45 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-foreground">
            <span className="flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
              {isSoftcover
                ? '1-Piece Fold & Glue Guide'
                : isFlexible
                  ? 'Flexible Spine Assembly'
                  : 'Gluing Spacer Guide'}
            </span>
            <span className="font-mono text-[11px] text-brass">
              {isSoftcover
                ? `${flapLabel} Flaps + 4 Tabs`
                : isFlexible
                  ? `${spacerLabel} Gap`
                  : `${spacerLabel} Hinge`}
            </span>
          </div>
          {isSoftcover ? (
            <svg
              role="img"
              viewBox="0 0 320 66"
              className="h-14 w-full"
              aria-label={`Fold-and-glue slip cover diagram showing ${flapLabel} Back Flap, Back Cover with top and bottom wrap-over glue tabs, Spine, Front Cover with top and bottom wrap-over glue tabs, and ${flapLabel} Front Flap`}
            >
              <title>
                1. Fold side flaps inward. 2. Apply glue to blank back of 4 cover tabs. 3. Fold tabs down over flaps.
              </title>
              {/* Back Cover top & bottom wrap-over glue tabs (sit directly above/below where Back Flap lands) */}
              <polygon points="46,13 53,5 77,5 84,13" fill="var(--brass-bright)" fillOpacity="0.34" stroke="var(--brass)" strokeWidth="1" />
              <polygon points="46,53 84,53 77,61 53,61" fill="var(--brass-bright)" fillOpacity="0.34" stroke="var(--brass)" strokeWidth="1" />
              {/* Front Cover top & bottom wrap-over glue tabs (sit directly above/below where Front Flap lands) */}
              <polygon points="236,13 243,5 267,5 274,13" fill="var(--brass-bright)" fillOpacity="0.34" stroke="var(--brass)" strokeWidth="1" />
              <polygon points="236,53 274,53 267,61 243,61" fill="var(--brass-bright)" fillOpacity="0.34" stroke="var(--brass)" strokeWidth="1" />
              {/* Left & Right pocket flaps */}
              <rect x="8" y="13" width="38" height="40" fill="var(--brass-bright)" fillOpacity="0.18" stroke="var(--brass)" strokeWidth="1.1" strokeDasharray="3 2" />
              <text x="27" y="36" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--brass)">Flap</text>
              <rect x="46" y="13" width="102" height="40" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.5" />
              <text x="97" y="36" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor">Back</text>
              <rect x="148" y="13" width="24" height="40" fill="var(--brass-bright)" fillOpacity="0.14" stroke="var(--brass)" strokeWidth="1" strokeDasharray="3 2" />
              <text x="160" y="36" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" transform="rotate(-90 160 36)">Spine</text>
              <rect x="172" y="13" width="102" height="40" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.5" />
              <text x="223" y="36" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor">Front</text>
              <rect x="274" y="13" width="38" height="40" fill="var(--brass-bright)" fillOpacity="0.18" stroke="var(--brass)" strokeWidth="1.1" strokeDasharray="3 2" />
              <text x="293" y="36" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--brass)">Flap</text>
            </svg>
          ) : isFlexible ? (
            <svg
              role="img"
              viewBox="0 0 320 66"
              className="h-14 w-full"
              aria-label={`Flexible spine assembly showing Back Board, ${spacerLabel} open cloth spine gap, and Front Board`}
            >
              <title>Leave a {spacerLabel} flexible cloth gap between Back and Front boards (no spine chipboard)</title>
              <rect x="4" y="5" width="312" height="56" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.26" strokeDasharray="4 2" />
              <rect x="16" y="12" width="122" height="42" rx="2" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.5" />
              <text x="77" y="36" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor">Back Board</text>
              <rect x="141" y="8" width="38" height="50" rx="2" fill="var(--brass-bright)" fillOpacity="0.24" stroke="var(--brass)" strokeWidth="1.2" strokeDasharray="3 2" />
              <text x="160" y="33" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--brass)">{spacerLabel}</text>
              <text x="160" y="43" textAnchor="middle" fontSize="6.5" fontWeight="600" fill="var(--brass)">FLEX</text>
              <rect x="182" y="12" width="122" height="42" rx="2" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.5" />
              <text x="243" y="36" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor">Front Board</text>
            </svg>
          ) : (
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
          )}
          <figcaption className="text-[11px] text-muted-foreground">
            {isSoftcover ? (
              <>
                <strong className="text-foreground">1.</strong> Fold {flapLabel} flaps inward ·{' '}
                <strong className="text-foreground">2.</strong> Glue blank back of 4 tabs ·{' '}
                <strong className="text-foreground">3.</strong> Fold tabs over flaps.
              </>
            ) : isFlexible ? (
              <>
                Glue Front &amp; Back boards with a{' '}
                <strong className="text-foreground">{spacerLabel}</strong> flexible cloth gap (no
                rigid spine board).
              </>
            ) : (
              <>
                Leave a <strong className="text-foreground">{spacerLabel}</strong> gap beside the
                spine strip so hinges flex cleanly.
              </>
            )}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
