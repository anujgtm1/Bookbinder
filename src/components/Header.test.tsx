import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
