import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { CoverImageLayerModel } from '@/types/studioLayer';
import { CoverStyler } from './CoverStyler';

describe('CoverStyler', () => {
  it('renders free-form layers, supports quick-fit and scaling, and updates spine typography', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const initialLayer = CoverImageLayerModel.createInRect({
      id: 'layer-front',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front-art.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: { x: 200, y: 0, width: 150, height: 225 },
    });

    let state: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [initialLayer],
    };
    const onChange = vi.fn((next: CoverStudioState) => {
      state = next;
    });

    const { rerender } = render(
      <CoverStyler
        geometry={geom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('layer-count-badge')).toHaveTextContent('1 image');
    expect(screen.getByTestId('studio-layer-0')).toBeInTheDocument();
    expect(screen.getByTestId('studio-selection-handles')).toBeInTheDocument();

    // Quick-fit selected layer to full wrap
    await user.click(screen.getByTestId('quick-fit-fullWrap'));
    expect(state.layers[0].widthMm).toBeGreaterThanOrEqual(370);

    // Scale up selected layer
    const widthBefore = state.layers[0].widthMm;
    rerender(
      <CoverStyler
        geometry={geom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('layer-scale-up-btn'));
    expect(state.layers[0].widthMm).toBeGreaterThan(widthBefore);

    // Spine typography update
    await user.type(screen.getByTestId('studio-spine-title-input'), 'D');
    expect(state.spineText.title).toBe('D');
  });

  it('activates eyedropper sampling mode banner cleanly', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <CoverStyler
        geometry={geom}
        studio={CoverStudioModel.createDefault()}
        onChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('studio-eyedropper-both-btn'));
    expect(screen.getByTestId('eyedropper-active-banner')).toBeInTheDocument();
  });
});
