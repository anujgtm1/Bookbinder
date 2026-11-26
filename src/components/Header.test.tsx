import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookParametersModel } from '@/types/bookParams';
import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = '<meta name="color-scheme" content="light dark">';
  });

  it('displays status message and toggles color scheme', async () => {
    const user = userEvent.setup();

    render(<Header statusMessage="Saved!" />);

    expect(screen.getByTestId('status-message')).toHaveTextContent('Saved!');

    await user.click(screen.getByTestId('theme-toggle-btn'));
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    expect(meta?.content).toBe('dark');
  });

  it('renders active book switcher, quick size trigger, and isolated icon-only UI density toggle', async () => {
    const user = userEvent.setup();
    const onOpenMyBooks = vi.fn();
    const onToggleUiDensity = vi.fn();
    const onChangeParams = vi.fn();
    const onOpenMeasureBench = vi.fn();

    const { rerender } = render(
      <Header
        statusMessage="Auto-saved locally"
        activeBookName="The Odyssey"
        activeBookSwatchColor="#2a4365"
        savedBookCount={3}
        onOpenMyBooks={onOpenMyBooks}
        params={BookParametersModel.createDefault()}
        onChangeParams={onChangeParams}
        onOpenMeasureBench={onOpenMeasureBench}
        uiDensity="clean"
        onToggleUiDensity={onToggleUiDensity}
      />,
    );

    const bookBtn = screen.getByTestId('open-my-books-btn');
    expect(bookBtn).toHaveTextContent('The Odyssey');
    expect(screen.getByTestId('my-books-count-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('quick-size-trigger')).toBeInTheDocument();

    const densityBtn = screen.getByTestId('ui-density-toggle-btn');
    expect(densityBtn).toHaveAttribute('aria-pressed', 'false');
    expect(densityBtn).toHaveAttribute('aria-label', 'Switch to All Controls');
    expect(densityBtn.textContent?.trim()).toBe('');

    await user.click(bookBtn);
    expect(onOpenMyBooks).toHaveBeenCalledTimes(1);

    await user.click(densityBtn);
    expect(onToggleUiDensity).toHaveBeenCalledTimes(1);

    rerender(
      <Header
        statusMessage="Auto-saved locally"
        activeBookName="The Odyssey"
        savedBookCount={3}
        onOpenMyBooks={onOpenMyBooks}
        uiDensity="all"
        onToggleUiDensity={onToggleUiDensity}
      />,
    );

    expect(screen.getByTestId('ui-density-toggle-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ui-density-toggle-btn')).toHaveAttribute(
      'aria-label',
      'Switch to Clean Mode',
    );
  });
});
