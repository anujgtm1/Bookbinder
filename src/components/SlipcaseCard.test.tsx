import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import * as storage from '@/core/storage';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { SlipcaseCard } from './SlipcaseCard';

describe('SlipcaseCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts collapsed with a crisp exterior summary and expands to show controls, 5-piece cut table, wrap strips, and proportional SVG preview', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(<SlipcaseCard geometry={geom} unit="mm" />);

    expect(screen.getByTestId('slipcase-card')).toBeInTheDocument();
    expect(screen.getByTestId('slipcase-summary-exterior')).toHaveTextContent(
      '146.5 × 229.0 × 38.0 mm',
    );
    expect(screen.getByTestId('toggle-slipcase-calculator')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('slipcase-cut-table')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-slipcase-calculator'));

    expect(screen.getByTestId('toggle-slipcase-calculator')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('slipcase-cut-table')).toBeInTheDocument();

    // Verify proper <label htmlFor> associations for all 4 controls
    expect(screen.getByLabelText(/Slide Clearance/i)).toHaveValue('2');
    expect(screen.getByLabelText(/Wall Chipboard/i)).toHaveValue('2');
    expect(screen.getByLabelText(/Thumb-Notch Radius/i)).toHaveValue('12');
    expect(screen.getByLabelText(/Wrap Turn-In/i)).toHaveValue('18');

    // Verify 5-piece chipboard cut table dimensions
    expect(screen.getByTestId('slipcase-dim-side-walls')).toHaveTextContent('146.5 × 229.0 mm');
    expect(screen.getByTestId('slipcase-note-side-walls')).toHaveTextContent(
      'Thumb-notch R 12.0 mm',
    );
    expect(screen.getByTestId('slipcase-dim-spine-wall')).toHaveTextContent('34.0 × 225.0 mm');
    expect(screen.getByTestId('slipcase-dim-head-tail')).toHaveTextContent('146.5 × 34.0 mm');

    // Verify outer box wrap strips & finished exterior size
    expect(screen.getByTestId('slipcase-dim-main-wrap')).toHaveTextContent('367.0 × 265.0 mm');
    expect(screen.getByTestId('slipcase-dim-cap-wrap')).toHaveTextContent('182.5 × 74.0 mm');
    expect(screen.getByTestId('slipcase-exterior-size')).toHaveTextContent(
      '146.5 × 229.0 × 38.0 mm',
    );

    // Verify live proportional SVG preview includes true semi-circular arc for thumb-notch
    expect(
      screen.getByRole('img', { name: 'Matching slipcase 5-panel cutting layout' }),
    ).toBeInTheDocument();
    const frontWallPath = screen.getByTestId('slipcase-preview-side-wall-front').getAttribute('d');
    expect(frontWallPath).toContain('A 12 12 0 0 0');
  });

  it('updates cut-list dimensions, wrap strips, and SVG thumb-notch arc live when controls change', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(<SlipcaseCard geometry={geom} unit="mm" />);
    await user.click(screen.getByTestId('toggle-slipcase-calculator'));

    // Increase slide clearance from 2.0 mm -> 4.0 mm
    fireEvent.change(screen.getByTestId('slipcase-slide-clearance'), { target: { value: '4' } });
    expect(screen.getByTestId('slipcase-slide-clearance-value')).toHaveTextContent('4.0 mm');
    expect(screen.getByTestId('slipcase-dim-side-walls')).toHaveTextContent('148.0 × 231.0 mm');
    expect(screen.getByTestId('slipcase-dim-spine-wall')).toHaveTextContent('36.0 × 227.0 mm');
    expect(screen.getByTestId('slipcase-dim-head-tail')).toHaveTextContent('148.0 × 36.0 mm');
    expect(screen.getByTestId('slipcase-exterior-size')).toHaveTextContent(
      '148.0 × 231.0 × 40.0 mm',
    );

    // Disable thumb-notch (0 = None)
    fireEvent.change(screen.getByTestId('slipcase-thumb-notch'), { target: { value: '0' } });
    expect(screen.getByTestId('slipcase-thumb-notch-value')).toHaveTextContent('None');
    expect(screen.getByTestId('slipcase-note-side-walls')).toHaveTextContent('No thumb-notch');
    const straightPath = screen.getByTestId('slipcase-preview-side-wall-front').getAttribute('d');
    expect(straightPath).not.toMatch(/\bA\s+\d/);

    // Increase wall chipboard to 3.0 mm & wrap turn-in to 24 mm
    fireEvent.change(screen.getByTestId('slipcase-wall-thickness'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('slipcase-wrap-turn-in'), { target: { value: '24' } });
    expect(screen.getByTestId('slipcase-wall-thickness-value')).toHaveTextContent('3.0 mm');
    expect(screen.getByTestId('slipcase-wrap-turn-in-value')).toHaveTextContent('24.0 mm');
    expect(screen.getByTestId('slipcase-dim-side-walls')).toHaveTextContent('149.0 × 233.0 mm');

    // Reset restores defaults
    await user.click(screen.getByTestId('slipcase-reset-options-btn'));
    expect(screen.getByTestId('slipcase-dim-side-walls')).toHaveTextContent('146.5 × 229.0 mm');
    expect(screen.getByTestId('slipcase-thumb-notch-value')).toHaveTextContent('12.0 mm');
  });

  it('formats slipcase dimensions in inches when unit is set to in', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(<SlipcaseCard geometry={geom} unit="in" />);
    await user.click(screen.getByTestId('toggle-slipcase-calculator'));

    expect(screen.getByTestId('slipcase-dim-side-walls')).toHaveTextContent('5.77 × 9.02 in');
    expect(screen.getByTestId('slipcase-dim-spine-wall')).toHaveTextContent('1.34 × 8.86 in');
    expect(screen.getByTestId('slipcase-exterior-size')).toHaveTextContent(
      '5.77 × 9.02 × 1.50 in',
    );
  });

  it('exports matching slipcase SVG and paginated PDF and reports status messages', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onStatusMessage = vi.fn();
    const textDownloadSpy = vi.spyOn(storage, 'triggerTextDownload').mockImplementation(() => {});
    const bytesDownloadSpy = vi.spyOn(storage, 'triggerBytesDownload').mockImplementation(() => {});

    render(
      <SlipcaseCard
        geometry={geom}
        unit="mm"
        pageSizeId="a4"
        onStatusMessage={onStatusMessage}
      />,
    );

    await user.click(screen.getByTestId('toggle-slipcase-calculator'));

    // Export Slipcase SVG
    await user.click(screen.getByTestId('slipcase-download-svg-btn'));
    expect(textDownloadSpy).toHaveBeenCalledTimes(1);
    const [svgText, svgFilename, svgMime] = textDownloadSpy.mock.calls[0];
    expect(svgFilename).toBe('matching_slipcase.svg');
    expect(svgMime).toBe('image/svg+xml;charset=utf-8');
    expect(svgText).toContain('data-label="Front Side Wall"');
    expect(svgText).toContain('A 12 12 0 0 0');
    expect(onStatusMessage).toHaveBeenCalledWith('Exported matching_slipcase.svg');

    // Export Slipcase PDF
    await user.click(screen.getByTestId('slipcase-download-pdf-btn'));
    await waitFor(() => {
      expect(bytesDownloadSpy).toHaveBeenCalledTimes(1);
    });
    const [pdfBytes, pdfFilename, pdfMime] = bytesDownloadSpy.mock.calls[0];
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.byteLength).toBeGreaterThan(1000);
    expect(pdfFilename).toBe('matching_slipcase.pdf');
    expect(pdfMime).toBe('application/pdf');
    expect(onStatusMessage).toHaveBeenCalledWith(
      expect.stringMatching(/^Exported matching_slipcase\.pdf \(\d+ pages?\)$/),
    );
  });
});
