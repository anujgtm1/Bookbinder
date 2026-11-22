import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { CoverStyler } from './CoverStyler';

describe('CoverStyler', () => {
  it('renders live spine typography preview and updates title/author/full-wrap mode', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    let state: CoverStudioState = CoverStudioModel.createDefault();
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

    await user.type(screen.getByTestId('studio-spine-title-input'), 'D');
    expect(state.spineText.title).toBe('D');

    rerender(
      <CoverStyler
        geometry={geom}
        studio={{
          ...state,
          spineText: { ...state.spineText, title: 'Dune', author: 'Frank Herbert' },
        }}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('studio-spine-typography')).toHaveTextContent(
      'Dune — Frank Herbert',
    );

    await user.click(screen.getByTestId('studio-full-wrap-toggle'));
    expect(state.imageMode).toBe('full-wrap');
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
