import React from 'react';
import { Tag, Check } from 'lucide-react';
import { Voucher } from '../../../../Shared/types';
import { formatPrice } from '../../utils/formatters';

export interface VoucherSectionProps {
  vouchers: Voucher[];
  voucherCodeInput: string;
  setVoucherCodeInput: (val: string) => void;
  appliedVoucher: { code: string; discountAmount: number } | null;
  voucherMessage: string | null;
  onApplyVoucher: (code?: string) => void;
  onRemoveVoucher: () => void;
}

export const VoucherSection: React.FC<VoucherSectionProps> = ({
  vouchers,
  voucherCodeInput,
  setVoucherCodeInput,
  appliedVoucher,
  voucherMessage,
  onApplyVoucher,
  onRemoveVoucher,
}) => {
  return (
    <div className="voucher-section" data-testid="voucher-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>
        <Tag size={15} /> Mã giảm giá
      </div>
      <div className="voucher-input-group">
        <input
          className="input"
          placeholder="Nhập mã voucher (VD: DAFL10)…"
          value={voucherCodeInput}
          onChange={e => setVoucherCodeInput(e.target.value.toUpperCase())}
          data-testid="voucher-code-input"
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '0 18px', whiteSpace: 'nowrap' }}
          onClick={() => onApplyVoucher()}
          data-testid="voucher-apply-btn"
        >
          Áp dụng
        </button>
      </div>

      {/* Chip voucher nhanh: nền trắng, viền đứt nét mực; bấm để áp dụng, mã đã chọn thì nền vàng. */}
      <div className="voucher-chips" data-testid="voucher-chips">
        {vouchers.map(v => {
          const isApplied = appliedVoucher?.code === v.code;
          return (
            <span
              key={v.id}
              className="chip ticket"
              onClick={() => {
                setVoucherCodeInput(v.code);
                onApplyVoucher(v.code);
              }}
              title={v.description}
              data-testid={`voucher-chip-${v.code}`}
              style={{
                background: isApplied ? 'var(--brand)' : 'var(--paper)',
                border: '1px dashed var(--ink)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              {v.code} ({v.discountType === 'Percentage' ? `-${v.discountValue}%` : `-${formatPrice(v.discountValue)}`})
            </span>
          );
        })}
      </div>

      {appliedVoucher && (
        <div
          className="ticket"
          data-testid="applied-voucher-banner"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', marginTop: 10, background: 'var(--brand)', color: 'var(--ink)', border: '1px dashed var(--ink)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={15} /> Đã áp dụng mã <strong className="mono">{appliedVoucher.code}</strong>: <span className="mono">-{formatPrice(appliedVoucher.discountAmount)}</span>
          </span>
          <button
            type="button"
            className="btn btn-text"
            onClick={onRemoveVoucher}
            data-testid="remove-voucher-btn"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {voucherMessage && !appliedVoucher && (
        <div className="field-error" style={{ marginTop: 6 }} data-testid="voucher-error-msg">
          {voucherMessage}
        </div>
      )}
    </div>
  );
};
