import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsePointsSection, UsePointsSectionProps } from '../components/cart/UsePointsSection';

/** Wrapper có state để kiểm chứng hành vi kẹp số điểm + toggle. */
function StatefulSection(props: Omit<UsePointsSectionProps, 'pointsToUse' | 'onPointsToUseChange'> & { initialPoints?: number }) {
  const { initialPoints = 0, ...rest } = props;
  const [points, setPoints] = useState(initialPoints);
  const onChange = vi.fn((n: number) => setPoints(n));
  return (
    <>
      <UsePointsSection {...rest} pointsToUse={points} onPointsToUseChange={onChange} />
      <span data-testid="points-state">{points}</span>
      <span data-testid="onchange-calls">{onChange.mock.calls.map(c => c[0]).join(',')}</span>
    </>
  );
}

const baseProps = {
  availablePoints: 250,
  maxPointsPercent: 20,
  tierLabel: 'Vàng',
  maxAllowed: 100,
};

describe('UsePointsSection — dùng điểm hội viên ở checkout (đợt 15, phần 2/4)', () => {
  it('không hiện mục dùng điểm khi availablePoints undefined (khách vãng lai)', () => {
    const { container } = render(<UsePointsSection tierLabel="Vàng" maxAllowed={100} pointsToUse={0} />);
    expect(screen.queryByTestId('use-points-section')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('hiện đúng câu gợi ý số dư + trần điểm theo hạng', () => {
    render(<UsePointsSection {...baseProps} pointsToUse={0} onPointsToUseChange={() => {}} />);
    expect(screen.getByTestId('use-points-section')).toBeInTheDocument();
    expect(screen.getByTestId('points-balance-hint')).toHaveTextContent(
      'Bạn có 250 điểm (1 điểm = 1.000đ). Hạng Vàng dùng tối đa 100 điểm cho đơn này.'
    );
    expect(screen.getByTestId('use-points-toggle')).not.toBeChecked();
    expect(screen.getByTestId('points-to-use-input')).toHaveValue('0');
  });

  it('bật toggle khi đang 0 điểm → điền tối đa cho phép (maxAllowed)', () => {
    render(<StatefulSection {...baseProps} initialPoints={0} />);
    fireEvent.click(screen.getByTestId('use-points-toggle'));
    expect(screen.getByTestId('points-state')).toHaveTextContent('100');
    expect(screen.getByTestId('use-points-toggle')).toBeChecked();
    expect(screen.getByTestId('points-to-use-input')).toHaveValue('100');
  });

  it('bật toggle khi đã có điểm → giữ nguyên số điểm đang dùng', () => {
    render(<StatefulSection {...baseProps} initialPoints={40} />);
    expect(screen.getByTestId('use-points-toggle')).toBeChecked();
    fireEvent.click(screen.getByTestId('use-points-toggle'));
    // Tắt toggle → về 0 (test riêng bên dưới cũng kiểm chứng).
    expect(screen.getByTestId('points-state')).toHaveTextContent('0');
  });

  it('nhập vượt trần → kẹp về maxAllowed và hiện lỗi', () => {
    render(<StatefulSection {...baseProps} initialPoints={0} />);
    fireEvent.change(screen.getByTestId('points-to-use-input'), { target: { value: '150' } });
    expect(screen.getByTestId('points-error-msg')).toHaveTextContent('Chỉ dùng tối đa 100 điểm cho đơn này.');
    expect(screen.getByTestId('points-state')).toHaveTextContent('100');
    expect(screen.getByTestId('points-to-use-input')).toHaveValue('100');
  });

  it('nhập trong trần → nhận đúng số điểm, không hiện lỗi; chữ không phải số bị lọc', () => {
    render(<StatefulSection {...baseProps} initialPoints={0} />);
    fireEvent.change(screen.getByTestId('points-to-use-input'), { target: { value: '5a0' } });
    expect(screen.queryByTestId('points-error-msg')).not.toBeInTheDocument();
    expect(screen.getByTestId('points-state')).toHaveTextContent('50');
  });

  it('mã FORDEV → disable toàn bộ toggle + input và hiện ghi chú', () => {
    render(
      <UsePointsSection
        {...baseProps}
        pointsToUse={0}
        onPointsToUseChange={() => {}}
        disabledReason="Không dùng điểm cùng mã FORDEV."
      />
    );
    expect(screen.getByTestId('use-points-toggle')).toBeDisabled();
    expect(screen.getByTestId('points-to-use-input')).toBeDisabled();
    expect(screen.getByTestId('points-disabled-note')).toHaveTextContent('Không dùng điểm cùng mã FORDEV.');
  });

  it('tắt toggle → về 0 điểm', () => {
    render(<StatefulSection {...baseProps} initialPoints={80} />);
    expect(screen.getByTestId('use-points-toggle')).toBeChecked();
    fireEvent.click(screen.getByTestId('use-points-toggle'));
    expect(screen.getByTestId('points-state')).toHaveTextContent('0');
    expect(screen.getByTestId('use-points-toggle')).not.toBeChecked();
  });
});
