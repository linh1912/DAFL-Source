import React, { useState } from 'react';
import { Coins } from 'lucide-react';

export interface UsePointsSectionProps {
  availablePoints?: number;
  maxPointsPercent?: number;
  tierLabel?: string;
  maxAllowed?: number;
  pointsToUse?: number;
  onPointsToUseChange?: (n: number) => void;
  disabledReason?: string | null;
}

/**
 * Dùng điểm hội viên ở checkout (đợt 15, phần 2/4).
 * - Khách vãng lai (availablePoints === undefined) → không hiện mục.
 * - 1 điểm = 1.000đ. Trần điểm (maxAllowed) do App tính từ BE
 *   (min(số dư, floor(tiền hàng sau voucher × maxPointsPercent% / 1000)))
 *   và truyền xuống; component chỉ kẹp + báo lỗi, không tự tính trần.
 * - App.tsx nối sau: trừ pointsToUse * 1000 vào finalTotal và gửi
 *   pointsToUse trong payload checkout (CheckoutCommand.PointsToUse).
 */
export const UsePointsSection: React.FC<UsePointsSectionProps> = ({
  availablePoints,
  tierLabel,
  maxAllowed,
  pointsToUse,
  onPointsToUseChange,
  disabledReason,
}) => {
  const [error, setError] = useState<string | null>(null);

  // Khách vãng lai chưa có số dư điểm → không hiện mục dùng điểm.
  if (availablePoints === undefined) return null;

  const max = maxAllowed ?? availablePoints ?? 0;
  const used = pointsToUse ?? 0;
  const isOn = used > 0;
  const disabled = !!disabledReason;

  const handleToggle = (checked: boolean) => {
    if (disabled) return;
    setError(null);
    if (checked) {
      // Bật toggle: nếu chưa dùng điểm thì điền tối đa cho phép.
      if (used === 0) onPointsToUseChange?.(max);
    } else {
      onPointsToUseChange?.(0);
    }
  };

  const handleInputChange = (raw: string) => {
    if (disabled) return;
    // Chỉ nhập chữ số.
    const digits = raw.replace(/\D/g, '');
    if (digits === '') {
      setError(null);
      onPointsToUseChange?.(0);
      return;
    }
    const value = parseInt(digits, 10);
    if (value > max) {
      setError(`Chỉ dùng tối đa ${max} điểm cho đơn này.`);
      onPointsToUseChange?.(max);
    } else {
      setError(null);
      onPointsToUseChange?.(value);
    }
  };

  return (
    <div
      data-testid="use-points-section"
      style={{
        borderTop: '1px dashed var(--border-subtle)',
        paddingTop: 10,
        marginBottom: 8,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.9rem',
          fontWeight: 700,
          color: 'var(--text-main)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={isOn}
          disabled={disabled}
          onChange={e => handleToggle(e.target.checked)}
          data-testid="use-points-toggle"
          style={{ width: 16, height: 16, accentColor: '#d81b60', cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
        <Coins size={15} color="#d81b60" />
        Dùng điểm hội viên
      </label>

      <p
        style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '6px 0 8px 24px', lineHeight: 1.5 }}
        data-testid="points-balance-hint"
      >
        Bạn có {availablePoints} điểm (1 điểm = 1.000đ). Hạng {tierLabel} dùng tối đa {max} điểm cho đơn này.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 24 }}>
        <input
          type="text"
          inputMode="numeric"
          value={String(used)}
          disabled={disabled}
          onChange={e => handleInputChange(e.target.value)}
          data-testid="points-to-use-input"
          aria-label="Số điểm muốn dùng"
          style={{
            width: 110,
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            fontSize: '0.9rem',
            background: disabled ? 'var(--bg-subtle)' : '#fff',
            color: 'var(--text-main)',
          }}
        />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>điểm</span>
      </div>

      {error && (
        <p
          style={{ fontSize: '0.85rem', color: '#dc2626', margin: '8px 0 0 24px', lineHeight: 1.5 }}
          data-testid="points-error-msg"
        >
          {error}
        </p>
      )}

      {disabledReason && (
        <p
          style={{ fontSize: '0.85rem', color: '#dc2626', margin: '8px 0 0 24px', lineHeight: 1.5 }}
          data-testid="points-disabled-note"
        >
          {disabledReason}
        </p>
      )}
    </div>
  );
};
