import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import { CricutExportDialog } from './CricutExportDialog';

describe('CricutExportDialog', () => {
  it('renders native modal dialog, toggles scope & HTV mirror, and triggers SVG download', async () => {
    const user = userEvent.setup();
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-cricut-svg');
    URL.revokeObjectURL = vi.fn();

    try {
      const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
      const studio = {
        ...CoverStudioModel.createDefault(),
        spineText: {
          ...CoverStudioModel.createDefault().spineText,
          title: 'DUNE',
          author: 'FRANK HERBERT',
        },
      };
      const onOpenChange = vi.fn();
      const onStatusMessage = vi.fn();

      render(
        <CricutExportDialog
          open={true}
          geometry={geom}
          studio={studio}
          customFont={null}
          unit="mm"
          onOpenChange={onOpenChange}
          onStatusMessage={onStatusMessage}
        />,
      );

      const dialog = screen.getByTestId('cricut-export-dialog');
      expect(dialog).toHaveAttribute('closedby', 'any');
      expect(dialog).not.toHaveAttribute('role');
      expect(dialog).not.toHaveAttribute('aria-modal');

      await waitFor(() => {
        expect(screen.getByTestId('cricut-svg-preview-img')).toBeInTheDocument();
      });
      expect(screen.getByTestId('cricut-preview-mat')).toHaveClass('cricut-mat-surface');

      // Switch scope to Full Cover Wrap -> outer cut switch appears
      await user.click(screen.getByTestId('cricut-scope-fullwrap'));
      expect(screen.getByTestId('cricut-outer-cut-switch')).toBeInTheDocument();

      // Toggle Mirror Horizontally (HTV)
      await user.click(screen.getByTestId('cricut-mirror-switch'));
      expect(screen.getByText('Mirrored')).toBeInTheDocument();

      // Wait for regenerated mirrored preview before downloading
      await waitFor(() => {
        expect(screen.getByTestId('cricut-download-btn')).not.toBeDisabled();
      });

      // Download button triggers export status message
      await user.click(screen.getByTestId('cricut-download-btn'));
      expect(onStatusMessage).toHaveBeenCalledWith(
        expect.stringContaining('_cricut_htv_fullwrap_mirrored.svg'),
      );
    } finally {
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  });
});
