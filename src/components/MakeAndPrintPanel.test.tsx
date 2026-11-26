import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { getDefaultProjectRepository } from '@/core/projectLibrary';
import { BookParametersModel } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import { MakeAndPrintPanel } from './MakeAndPrintPanel';

vi.mock('@/core/benchRecipePdf', () => ({
  generateBenchRecipePdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
}));

vi.mock('@/core/storage', async () => {
  const actual = await vi.importActual<typeof import('@/core/storage')>('@/core/storage');
  return {
    ...actual,
    triggerBytesDownload: vi.fn(),
    triggerTextDownload: vi.fn(),
    triggerBlobDownload: vi.fn(),
  };
});

describe('MakeAndPrintPanel', () => {
  function renderPanel(bindingStyle: 'rigid-case' | 'dust-jacket' = 'rigid-case') {
    const params = BookParametersModel.clampAndNormalize({ bindingStyle });
    const geometry = calculateCaseGeometry(params);
    const onDownloadOuterSvg = vi.fn();
    const onDownloadOuterPdf = vi.fn();
    const onDownloadInnerSvg = vi.fn();
    const onDownloadInnerPdf = vi.fn();
    const onStatusMessage = vi.fn();

    render(
      <MakeAndPrintPanel
        params={params}
        geometry={geometry}
        studio={CoverStudioModel.createDefault()}
        customFont={null}
        savedBookSummaries={[]}
        activeProjectId={null}
        activeBookName="Moby Dick"
        onFlushActiveBook={async () => {}}
        getProjectRepository={getDefaultProjectRepository}
        onUpdateParams={vi.fn()}
        onUpdateStudio={vi.fn()}
        onDownloadOuterSvg={onDownloadOuterSvg}
        onDownloadOuterPdf={onDownloadOuterPdf}
        onDownloadInnerSvg={onDownloadInnerSvg}
        onDownloadInnerPdf={onDownloadInnerPdf}
        onStatusMessage={onStatusMessage}
      />,
    );

    return {
      onDownloadOuterSvg,
      onDownloadOuterPdf,
      onDownloadInnerSvg,
      onDownloadInnerPdf,
      onStatusMessage,
    };
  }

  it('renders production summary and all 4 craft destination cards', () => {
    renderPanel('rigid-case');

    expect(screen.getByTestId('make-print-panel')).toBeInTheDocument();
    expect(screen.getByText(/Make & Print — Moby Dick/)).toBeInTheDocument();
    expect(screen.getByTestId('make-print-cover-pdf-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-cricut-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-bench-jigs-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-outer-cut-pdf-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-outer-cut-svg-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-inner-pdf-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-inner-svg-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-export-png-btn')).toBeInTheDocument();
    expect(screen.getByTestId('make-export-svg-btn')).toBeInTheDocument();
  });

  it('hides inner pocket/endpaper buttons on binding styles without inner pockets', () => {
    renderPanel('dust-jacket');

    expect(screen.queryByTestId('make-inner-pdf-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('make-inner-svg-btn')).not.toBeInTheDocument();
  });

  it('opens Print Cover PDF dialog, Cricut dialog, and triggers Bench Recipe & Cut SVG exports', async () => {
    const user = userEvent.setup();
    const { onDownloadOuterSvg, onStatusMessage } = renderPanel('rigid-case');

    // Open Print Cover PDF dialog
    await user.click(screen.getByTestId('make-print-cover-pdf-btn'));
    expect(screen.getByTestId('pdf-export-dialog')).toHaveAttribute('open');
    await user.click(screen.getByTestId('pdf-export-close-btn'));

    // Open Cricut dialog
    await user.click(screen.getByTestId('make-cricut-btn'));
    expect(screen.getByTestId('cricut-export-dialog')).toHaveAttribute('open');

    // Outer Cut SVG direct download
    await user.click(screen.getByTestId('make-outer-cut-svg-btn'));
    expect(onDownloadOuterSvg).toHaveBeenCalledTimes(1);

    // Bench Recipe & Jigs PDF
    await user.click(screen.getByTestId('make-bench-jigs-btn'));
    expect(onStatusMessage).toHaveBeenCalledWith('Exported bindery_bench_recipe_and_jigs.pdf');
  });
});
