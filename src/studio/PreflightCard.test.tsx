import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PreflightReport } from './preflight';
import { PreflightCard } from './PreflightCard';

describe('PreflightCard', () => {
  it('displays a clean All Checks Passed badge when zero issues exist', () => {
    const passReport: PreflightReport = {
      issues: [],
      checks: [
        { id: 'coverage', label: 'Cover & Turn-In Coverage', status: 'pass' },
        { id: 'resolution', label: '300 DPI Print Resolution', status: 'pass' },
      ],
      errorCount: 0,
      warningCount: 0,
      ignoredCount: 0,
      status: 'pass',
    };

    render(
      <PreflightCard
        report={passReport}
        showOverlays={true}
        checkDpi={true}
        activeIssueId={null}
        onToggleOverlays={vi.fn()}
        onToggleCheckDpi={vi.fn()}
        onHighlightIssue={vi.fn()}
        onApplyQuickFix={vi.fn()}
        onIgnoreIssue={vi.fn()}
        onRestoreIgnored={vi.fn()}
      />,
    );

    expect(screen.getByTestId('preflight-status-badge')).toHaveTextContent('All Checks Passed');
    expect(screen.queryByTestId('preflight-issue-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preflight-restore-ignored-btn')).not.toBeInTheDocument();
  });

  it('lists errors and warnings, triggers quick fixes, DPI check toggle, ignore, and restore', async () => {
    const user = userEvent.setup();
    const onApplyQuickFix = vi.fn();
    const onToggleOverlays = vi.fn();
    const onToggleCheckDpi = vi.fn();
    const onIgnoreIssue = vi.fn();
    const onRestoreIgnored = vi.fn();

    const errorReport: PreflightReport = {
      issues: [
        {
          id: 'front-board-gap',
          severity: 'error',
          category: 'coverage',
          title: 'Front cover artwork leaves an uncovered board gap',
          detail: 'Artwork stops short on top (12 mm).',
          highlights: [{ rect: { x: 200, y: 10, width: 140, height: 12 }, severity: 'error' }],
          quickFix: {
            kind: 'fit-layer',
            layerId: 'layer-1',
            target: 'front',
            label: 'Fit to Front',
          },
        },
      ],
      checks: [
        { id: 'coverage', label: 'Cover & Turn-In Coverage', status: 'error' },
        { id: 'resolution', label: 'DPI Check (Off)', status: 'skipped' },
      ],
      errorCount: 1,
      warningCount: 0,
      ignoredCount: 2,
      status: 'error',
    };

    render(
      <PreflightCard
        report={errorReport}
        showOverlays={true}
        checkDpi={false}
        activeIssueId={null}
        onToggleOverlays={onToggleOverlays}
        onToggleCheckDpi={onToggleCheckDpi}
        onHighlightIssue={vi.fn()}
        onApplyQuickFix={onApplyQuickFix}
        onIgnoreIssue={onIgnoreIssue}
        onRestoreIgnored={onRestoreIgnored}
      />,
    );

    expect(screen.getByTestId('preflight-status-badge')).toHaveTextContent('1 Error');
    await user.click(screen.getByTestId('preflight-fix-front-board-gap'));
    expect(onApplyQuickFix).toHaveBeenCalledWith({
      kind: 'fit-layer',
      layerId: 'layer-1',
      target: 'front',
      label: 'Fit to Front',
    });

    await user.click(screen.getByTestId('preflight-ignore-front-board-gap'));
    expect(onIgnoreIssue).toHaveBeenCalledWith('front-board-gap');

    const dpiBtn = screen.getByTestId('preflight-dpi-toggle');
    expect(dpiBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(dpiBtn);
    expect(onToggleCheckDpi).toHaveBeenCalledWith(true);

    const restoreBtn = screen.getByTestId('preflight-restore-ignored-btn');
    expect(restoreBtn).toHaveTextContent('2 ignored · Restore');
    await user.click(restoreBtn);
    expect(onRestoreIgnored).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId('preflight-toggle-overlays-btn'));
    expect(onToggleOverlays).toHaveBeenCalledWith(false);
  });
});
