import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { PreflightQuickFix, PreflightReport } from './preflight';

export interface PreflightCardProps {
  readonly report: PreflightReport;
  readonly showOverlays: boolean;
  readonly checkDpi: boolean;
  readonly activeIssueId: string | null;
  readonly onToggleOverlays: (next: boolean) => void;
  readonly onToggleCheckDpi: (next: boolean) => void;
  readonly onHighlightIssue: (issueId: string | null) => void;
  readonly onApplyQuickFix: (fix: PreflightQuickFix) => void;
  readonly onIgnoreIssue: (issueId: string) => void;
  readonly onRestoreIgnored: () => void;
}

export function PreflightCard({
  report,
  showOverlays,
  checkDpi,
  activeIssueId,
  onToggleOverlays,
  onToggleCheckDpi,
  onHighlightIssue,
  onApplyQuickFix,
  onIgnoreIssue,
  onRestoreIgnored,
}: PreflightCardProps) {
  const [expanded, setExpanded] = useState(true);
  const hasIssues = report.issues.length > 0;
  const hasCanvasHighlights = report.issues.some((i) => i.highlights.length > 0);

  return (
    <section
      aria-label="Print Preflight Consistency Check"
      data-testid="preflight-card"
      className={`rounded-lg border bg-card px-4 py-3 shadow-xs transition-colors ${
        report.status === 'error'
          ? 'border-destructive/55'
          : report.status === 'warning'
            ? 'border-amber-600/45'
            : 'border-emerald-700/35'
      }`}
    >
      <Collapsible open={hasIssues ? expanded : false} onOpenChange={setExpanded}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {report.status === 'error' ? (
              <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            ) : report.status === 'warning' ? (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            )}

            <h3 className="font-serif text-sm font-semibold tracking-tight text-foreground">
              Print Preflight Check
            </h3>

            {report.status === 'pass' ? (
              <Badge variant="success" data-testid="preflight-status-badge" className="rounded-full">
                All Checks Passed
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5" data-testid="preflight-status-badge">
                {report.errorCount > 0 && (
                  <Badge variant="destructive" className="rounded-full">
                    {report.errorCount} {report.errorCount === 1 ? 'Error' : 'Errors'}
                  </Badge>
                )}
                {report.warningCount > 0 && (
                  <Badge variant="warning" className="rounded-full">
                    {report.warningCount} {report.warningCount === 1 ? 'Warning' : 'Warnings'}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Compact category status indicators */}
            <div className="hidden flex-wrap items-center gap-1.5 md:flex">
              {report.checks.map((check) => (
                <span
                  key={check.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    check.status === 'error'
                      ? 'border-destructive/35 bg-destructive/10 text-destructive'
                      : check.status === 'warning'
                        ? 'border-amber-600/35 bg-amber-500/12 text-amber-800 dark:text-amber-300'
                        : check.status === 'skipped'
                          ? 'border-border/70 bg-muted/40 text-muted-foreground'
                          : 'border-emerald-700/25 bg-emerald-600/8 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {check.status === 'pass' ? (
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  ) : check.status === 'skipped' ? (
                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  )}
                  {check.label}
                </span>
              ))}
            </div>

            <Button
              variant={checkDpi ? 'outline' : 'ghost'}
              size="sm"
              className={`h-7 px-2.5 text-xs ${
                checkDpi ? '' : 'border border-dashed border-border text-muted-foreground'
              }`}
              aria-pressed={checkDpi}
              onClick={() => onToggleCheckDpi(!checkDpi)}
              data-testid="preflight-dpi-toggle"
              title={
                checkDpi
                  ? '300 DPI print check is on — click to pause DPI warnings'
                  : '300 DPI print check is off — click to re-enable'
              }
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
              {checkDpi ? 'DPI Check: On' : 'DPI Check: Off'}
            </Button>

            {report.ignoredCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={onRestoreIgnored}
                data-testid="preflight-restore-ignored-btn"
                title="Restore all ignored preflight warnings"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                {report.ignoredCount} ignored · Restore
              </Button>
            )}

            {hasCanvasHighlights && (
              <Button
                variant={showOverlays ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                aria-pressed={showOverlays}
                onClick={() => onToggleOverlays(!showOverlays)}
                data-testid="preflight-toggle-overlays-btn"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {showOverlays ? 'Red Highlights On' : 'Show Red Highlights'}
              </Button>
            )}

            {hasIssues && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  data-testid="preflight-expand-toggle"
                  aria-label={expanded ? 'Collapse preflight details' : 'Expand preflight details'}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        {hasIssues && (
          <CollapsibleContent className="kettle-stitch-divider mt-2.5 space-y-2 pt-2.5">
            <ul className="space-y-2" data-testid="preflight-issue-list">
              {report.issues.map((issue) => {
                const isActive = activeIssueId === issue.id;
                const isError = issue.severity === 'error';
                return (
                  <li
                    key={issue.id}
                    data-testid={`preflight-issue-${issue.id}`}
                    onMouseEnter={() => onHighlightIssue(issue.id)}
                    onMouseLeave={() => onHighlightIssue(null)}
                    className={`flex flex-wrap items-center justify-between gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors ${
                      isError
                        ? isActive
                          ? 'border-destructive bg-destructive/14'
                          : 'border-destructive/35 bg-destructive/7'
                        : isActive
                          ? 'border-amber-600/70 bg-amber-500/18'
                          : 'border-amber-600/30 bg-amber-500/8'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={isError ? 'destructive' : 'warning'}
                          className="h-4 px-1.5 text-[10px] uppercase tracking-wider"
                        >
                          {issue.severity}
                        </Badge>
                        <span className="font-semibold text-foreground">{issue.title}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {issue.detail}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {issue.quickFix && (
                        <Button
                          variant={isError ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 shrink-0 px-2.5 text-xs"
                          data-testid={`preflight-fix-${issue.id}`}
                          onClick={() => onApplyQuickFix(issue.quickFix!)}
                        >
                          <Wrench className="h-3 w-3" aria-hidden="true" />
                          {issue.quickFix.label}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                        data-testid={`preflight-ignore-${issue.id}`}
                        title="Ignore this warning for now"
                        onClick={() => onIgnoreIssue(issue.id)}
                      >
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        Ignore
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        )}
      </Collapsible>
    </section>
  );
}
