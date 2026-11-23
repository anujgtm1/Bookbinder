import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { DEFAULT_POCKET_STYLE, type PocketStyleConfig } from '@/types/studio';
import { InnerPocketsStudio } from './InnerPocketsStudio';

describe('InnerPocketsStudio', () => {
  it('renders styled pockets, syncs color with cover, toggles Blueprint mode, and triggers cut exports', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    let pocketStyle: PocketStyleConfig = { ...DEFAULT_POCKET_STYLE };
    const onChangePocketStyle = vi.fn((next: PocketStyleConfig) => {
      pocketStyle = next;
    });
    const onDownloadInnerSvg = vi.fn();
    const onDownloadInnerPdf = vi.fn();

    const { rerender } = render(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={onDownloadInnerSvg}
        onDownloadInnerPdf={onDownloadInnerPdf}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('inner-blueprint-svg')).toBeInTheDocument();
    expect(screen.getByText(/1 page • TABLOID/i)).toBeInTheDocument();
    expect(screen.getByTestId('styled-front-pocket-fill')).toHaveAttribute('fill', '#f4eee1');

    // Match cover color syncs pocket backgroundColor
    await user.click(screen.getByTestId('pocket-match-cover-btn'));
    expect(pocketStyle.backgroundColor).toBe('#08343f');

    rerender(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={onDownloadInnerSvg}
        onDownloadInnerPdf={onDownloadInnerPdf}
        onStatusMessage={vi.fn()}
      />,
    );
    expect(screen.getByTestId('styled-front-pocket-fill')).toHaveAttribute('fill', '#08343f');

    // Switch to Blueprint mode hides styled pocket fill and displays CAD labels
    await user.click(screen.getByTestId('pockets-view-blueprint-btn'));
    expect(screen.queryByTestId('styled-front-pocket-fill')).not.toBeInTheDocument();
    expect(screen.getByText('SPINE LINER')).toBeInTheDocument();

    // Download buttons invoke callbacks
    await user.click(screen.getByTestId('download-inner-svg-btn'));
    expect(onDownloadInnerSvg).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('download-inner-pdf-btn'));
    expect(onDownloadInnerPdf).toHaveBeenCalledTimes(1);
  });
});
