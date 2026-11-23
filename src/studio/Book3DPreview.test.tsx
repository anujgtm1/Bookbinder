import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import { Book3DPreview } from './Book3DPreview';

describe('Book3DPreview', () => {
  it('renders front, spine (with typography), and back faces and responds to keyboard and pointer orbit', () => {
    const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Dune',
        author: 'Frank Herbert',
      },
    };
    const onAngleChange = vi.fn();

    render(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        angle={{ yawDeg: 32, pitchDeg: -10 }}
        onAngleChange={onAngleChange}
      />,
    );

    expect(screen.getByTestId('book3d-front-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-spine-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-back-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-spine-typography')).toHaveTextContent('Dune');

    const stage = screen.getByTestId('book3d-stage');
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(onAngleChange).toHaveBeenCalledWith({ yawDeg: 47, pitchDeg: -10 });

    fireEvent(
      stage,
      new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      stage,
      new MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 80 }),
    );
    fireEvent(stage, new MouseEvent('pointerup', { bubbles: true }));
    expect(onAngleChange).toHaveBeenLastCalledWith({ yawDeg: 54, pitchDeg: 1 });
  });

  it('hinges the front cover open to reveal the live styled inner pocket and first page', () => {
    const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
    const studio = {
      ...CoverStudioModel.createDefault(),
      pocketStyle: {
        ...CoverStudioModel.createDefault().pocketStyle,
        backgroundColor: '#1e4d44',
      },
    };

    const { rerender } = render(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        isCoverOpen={false}
      />,
    );

    const hinge = screen.getByTestId('book3d-front-hinge');
    expect(hinge).toHaveAttribute('data-open', 'false');
    expect(hinge.getAttribute('style')).toContain('rotateY(0deg)');
    expect(screen.getByTestId('book3d-inner-pocket-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-first-page')).toBeInTheDocument();

    rerender(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        isCoverOpen={true}
      />,
    );
    expect(screen.getByTestId('book3d-front-hinge')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('book3d-front-hinge').getAttribute('style')).toContain(
      'rotateY(-122deg)',
    );
  });

  it('renders cleanly for paperback-wrap (flush edges) and dust-jacket (folded flap) without chipboard hinge grooves', () => {
    const pbGeometry = calculateCaseGeometry({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });
    const studio = CoverStudioModel.createDefault();

    const { rerender } = render(
      <Book3DPreview geometry={pbGeometry} studio={studio} customFont={null} isCoverOpen={true} />,
    );
    expect(screen.getByTestId('book3d-front-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-inner-pocket-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-first-page').getAttribute('style')).toContain('top: 0px');

    const djGeometry = calculateCaseGeometry({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 70,
    });
    rerender(
      <Book3DPreview geometry={djGeometry} studio={studio} customFont={null} isCoverOpen={true} />,
    );
    expect(screen.getByTestId('book3d-front-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-spine-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-inner-pocket-face')).toBeInTheDocument();
  });
});
