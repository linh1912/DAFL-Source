import React, { useState } from 'react';
import { CreditCard, QrCode, Check, Copy, ArrowLeft, CheckCircle2, Zap } from 'lucide-react';
import { formatPrice } from '../../utils/formatters';

export const MockPayOSStandalonePage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const orderCode = Number(params.get('orderCode')) || 0;
  const amount = Number(params.get('amount')) || 0;

  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const qrUrl = `https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=${amount}&addInfo=DH%20${orderCode}&accountName=DAFL%20STORE`;

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleConfirmPayment = async () => {
    setLoading(true);
    try {
      const payload = {
        code: '00',
        desc: 'success',
        data: {
          orderCode,
          amount,
          description: `DH ${orderCode}`,
          accountNumber: '9999888877',
          reference: 'SIMULATED_TX_' + Date.now(),
          transactionDateTime: new Date().toISOString(),
          currency: 'VND',
          paymentLinkId: 'demo_link_id',
          code: '00',
          desc: 'success'
        },
        signature: 'simulated_valid_hmac_signature'
      };

      await fetch('/api/payments/payos-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setIsPaid(true);
    } catch {
      setIsPaid(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ground)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-body)' }}>
      <div className="card" style={{ maxWidth: 480, width: '100%', overflow: 'hidden', padding: 0 }}>
        {/* Header: nền vàng, chữ mực */}
        <div style={{ background: 'var(--brand)', padding: '20px 24px', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Cổng thanh toán PayOS</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Môi trường giả lập VietQR Sandbox</div>
            </div>
          </div>
          <a href="/" className="btn btn-text" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
            <ArrowLeft size={14} /> Về cửa hàng
          </a>
        </div>

        {isPaid ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ width: 104, height: 104, borderRadius: '50%', background: 'var(--brand)', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={64} color="var(--ink)" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink)', marginBottom: 8 }}>
              Thanh toán thành công!
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 24 }}>
              Đơn hàng <span className="mono">#{orderCode}</span> đã được hệ thống xác nhận thanh toán qua PayOS.
            </p>
            <a href="/orders" className="btn btn-primary">
              Xem danh sách đơn hàng
            </a>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12 }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Mã đơn hàng:</span>
                <div className="mono" style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--ink)' }}>#{orderCode}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Tổng số tiền:</span>
                <div className="mono" style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ink)' }}>{formatPrice(amount)}</div>
              </div>
            </div>
            <div className="tear" style={{ marginBottom: 16 }} />

            {/* QR Code */}
            <div className="card" style={{ textAlign: 'center', background: 'var(--ground)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <QrCode size={16} color="var(--ink)" /> Quét mã VietQR chuyển khoản
              </div>
              <img
                src={qrUrl}
                alt="QR Code PayOS"
                style={{ width: '100%', maxWidth: 220, borderRadius: 12, margin: '0 auto', display: 'block', border: '1px solid var(--line)' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23F5F5F2"/><text x="100" y="100" font-size="14" text-anchor="middle" fill="%2315171A" font-weight="bold">VIETQR DEMO</text></svg>';
                }}
              />
            </div>

            {/* Account Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem', marginBottom: 20 }}>
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--ground)' }}>
                <span style={{ color: 'var(--muted)' }}>Ngân hàng:</span>
                <strong>MBBank (Quân Đội)</strong>
              </div>
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--ground)' }}>
                <span style={{ color: 'var(--muted)' }}>Số tài khoản:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong className="mono">0987654321</strong>
                  <button type="button" onClick={() => copy('0987654321', 'stk')} className="btn btn-text" style={{ padding: 4 }}>
                    {copied === 'stk' ? <Check size={14} color="var(--ok)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--ground)' }}>
                <span style={{ color: 'var(--muted)' }}>Nội dung:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong className="mono" style={{ color: 'var(--ink)' }}>DH {orderCode}</strong>
                  <button type="button" onClick={() => copy(`DH ${orderCode}`, 'nd')} className="btn btn-text" style={{ padding: 4 }}>
                    {copied === 'nd' ? <Check size={14} color="var(--ok)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Action */}
            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Zap size={16} /> {loading ? 'Đang gửi xác nhận...' : 'Xác nhận đã chuyển khoản thành công'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
