import React, { useEffect, useState } from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { formatPrice } from '../../utils/formatters';

export const PaymentSuccessPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const orderCode = params.get('orderCode');
  const [totalAmount, setTotalAmount] = useState<number | null>(null);

  useEffect(() => {
    if (orderCode) {
      // Query order status from backend to verify payment confirmation
      // (and read the amount for the order summary block).
      fetch(`/api/payments/status/${orderCode}`)
        .then(r => r.json())
        .then((res: { data?: { totalAmount?: number; TotalAmount?: number } }) => {
          const amount = res?.data?.totalAmount ?? res?.data?.TotalAmount;
          if (typeof amount === 'number') setTotalAmount(amount);
        })
        .catch(console.warn);
    }
  }, [orderCode]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ground)', padding: 20, fontFamily: 'var(--font-body)' }}>
      {/* Thẻ hóa đơn giữa trang: tick vàng viền mực, mã đơn mono, các dòng ngăn bằng .tear. */}
      <div className="card card-strong ticket" style={{ maxWidth: 460, width: '100%', padding: 36, textAlign: 'center' }}>
        <div className="success-tick-wrap scale-in" style={{ width: 104, height: 104, borderRadius: '50%', background: 'var(--brand)', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle2 size={72} color="var(--ink)" />
        </div>
        <h2 style={{ fontSize: '1.7rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink)', marginBottom: 8, lineHeight: 1.3, padding: '0 8px' }}>
          Thanh toán thành công!
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 16, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
          Đơn hàng {orderCode ? <span className="mono">#{orderCode}</span> : ''} đã được xác nhận thanh toán qua PayOS. Hệ thống đang tiến hành xử lý và giao hàng.
        </p>
        {orderCode && (
          <div style={{ marginBottom: 20, fontSize: '0.9rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: 'var(--muted)' }}>Mã đơn:</span>
              <strong className="mono" style={{ color: 'var(--ink)' }}>#{orderCode}</strong>
            </div>
            {totalAmount !== null && (
              <>
                <div className="tear" />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ color: 'var(--muted)' }}>Số tiền:</span>
                  <strong className="mono" style={{ color: 'var(--ink)' }}>{formatPrice(totalAmount)}</strong>
                </div>
              </>
            )}
          </div>
        )}
        <div className="success-actions" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <a href="/orders" className="btn btn-primary">
            Xem đơn hàng <ArrowRight size={16} />
          </a>
          <a href="/" className="btn btn-secondary">
            Tiếp tục mua sắm
          </a>
        </div>
      </div>
    </div>
  );
};
