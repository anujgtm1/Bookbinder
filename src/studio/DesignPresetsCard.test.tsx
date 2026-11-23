import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_DESIGN_PRESETS, type CoverDesignPreset } from '@/types/designPreset';
import { DesignPresetsCard } from './DesignPresetsCard';

describe('DesignPresetsCard', () => {
  const sampleSaved: CoverDesignPreset = {
    ...BUILT_IN_DESIGN_PRESETS[0],
    id: 'saved-1',
    name: 'Dune Gold Series',
    isBuiltIn: undefined,
  };

  it('saves a named preset and clears the input', async () => {
    const user = userEvent.setup();
    const onSaveCurrent = vi.fn();

    render(
      <DesignPresetsCard
        savedPresets={[]}
        onSaveCurrent={onSaveCurrent}
        onApplyPreset={vi.fn()}
        onDeletePreset={vi.fn()}
        onExportPresets={vi.fn()}
        onImportPresets={vi.fn()}
      />,
    );

    const saveBtn = screen.getByTestId('save-design-preset-btn');
    expect(saveBtn).toBeDisabled();
    expect(screen.getByTestId('export-presets-btn')).toBeDisabled();

    const input = screen.getByTestId('preset-name-input');
    await user.type(input, '  My Fantasy Trilogy  ');
    expect(saveBtn).toBeEnabled();

    await user.click(saveBtn);
    expect(onSaveCurrent).toHaveBeenCalledWith('My Fantasy Trilogy');
    expect(input).toHaveValue('');
  });

  it('applies built-in starter themes and applies/deletes/exports saved presets', async () => {
    const user = userEvent.setup();
    const onApplyPreset = vi.fn();
    const onDeletePreset = vi.fn();
    const onExportPresets = vi.fn();
    const onImportPresets = vi.fn();

    render(
      <DesignPresetsCard
        savedPresets={[sampleSaved]}
        onSaveCurrent={vi.fn()}
        onApplyPreset={onApplyPreset}
        onDeletePreset={onDeletePreset}
        onExportPresets={onExportPresets}
        onImportPresets={onImportPresets}
      />,
    );

    // Saved designs section is visible
    expect(screen.getByTestId('saved-presets-section')).toHaveTextContent('Dune Gold Series');

    // Apply saved preset
    await user.click(screen.getByTestId('apply-saved-preset-0'));
    expect(onApplyPreset).toHaveBeenCalledWith(sampleSaved);

    // Apply built-in preset
    await user.click(screen.getByTestId('apply-builtin-preset-classic-clothbound-gold'));
    expect(onApplyPreset).toHaveBeenCalledWith(BUILT_IN_DESIGN_PRESETS[0]);

    // Delete saved preset
    await user.click(screen.getByTestId('delete-saved-preset-0'));
    expect(onDeletePreset).toHaveBeenCalledWith('saved-1');

    // Export saved presets
    await user.click(screen.getByTestId('export-presets-btn'));
    expect(onExportPresets).toHaveBeenCalledTimes(1);

    // Import presets file
    const file = new File(['{"presets":[]}'], 'series.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('import-presets-input'), file);
    expect(onImportPresets).toHaveBeenCalledWith(file);
  });
});
