import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import { CoverElementsCard } from './CoverElementsCard';

describe('CoverElementsCard', () => {
  it('supports adding Front/Back cover text presets and editing selected text properties', () => {
    const onAddTextPreset = vi.fn();
    const onUpdateTextLayer = vi.fn();
    const onQuickAlignText = vi.fn();
    const onDeleteTextLayer = vi.fn();

    const frontBoard = { x: 200, y: 21, width: 143, height: 223 };
    const titleLayer = CoverTextLayerModel.createPreset('front-title', frontBoard);
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [titleLayer],
    };

    render(
      <CoverElementsCard
        studio={studio}
        customFont={null}
        selectedTextId={titleLayer.id}
        selectedOrnamentId={null}
        onSelectText={vi.fn()}
        onSelectOrnament={vi.fn()}
        onAddTextPreset={onAddTextPreset}
        onUpdateTextLayer={onUpdateTextLayer}
        onQuickAlignText={onQuickAlignText}
        onDeleteTextLayer={onDeleteTextLayer}
        onAddOrnament={vi.fn()}
        onUpdateOrnament={vi.fn()}
        onScaleOrnament={vi.fn()}
        onFitOrnamentToBoard={vi.fn()}
        onDeleteOrnament={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-front-title-btn'));
    expect(onAddTextPreset).toHaveBeenCalledWith('front-title');

    fireEvent.change(screen.getByTestId('cover-text-textarea'), {
      target: { value: 'THE ODYSSEY' },
    });
    expect(onUpdateTextLayer).toHaveBeenCalledWith(titleLayer.id, { text: 'THE ODYSSEY' });

    fireEvent.click(screen.getByRole('button', { name: 'Center' }));
    expect(onQuickAlignText).toHaveBeenCalledWith(titleLayer.id, 'center');
  });

  it('switches to Classic Designs gallery and inserts parametric ornaments', () => {
    const onAddOrnament = vi.fn();
    const onScaleOrnament = vi.fn();
    const frontBoard = { x: 200, y: 21, width: 143, height: 223 };
    const frame = CoverOrnamentLayerModel.createForZone('frame-double-rule', frontBoard, 'front');
    const studio = {
      ...CoverStudioModel.createDefault(),
      ornaments: [frame],
    };

    render(
      <CoverElementsCard
        studio={studio}
        customFont={null}
        selectedTextId={null}
        selectedOrnamentId={frame.id}
        onSelectText={vi.fn()}
        onSelectOrnament={vi.fn()}
        onAddTextPreset={vi.fn()}
        onUpdateTextLayer={vi.fn()}
        onQuickAlignText={vi.fn()}
        onDeleteTextLayer={vi.fn()}
        onAddOrnament={onAddOrnament}
        onUpdateOrnament={vi.fn()}
        onScaleOrnament={onScaleOrnament}
        onFitOrnamentToBoard={vi.fn()}
        onDeleteOrnament={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-ornament-frame-art-deco'));
    expect(onAddOrnament).toHaveBeenCalledWith('frame-art-deco', 'front', '#d9b566');

    fireEvent.click(screen.getByRole('button', { name: /Scale ornament up/i }));
    expect(onScaleOrnament).toHaveBeenCalledWith(frame.id, 1.1);
  });
});
