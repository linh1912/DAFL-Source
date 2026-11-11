import React, { useEffect, useState } from 'react';
import { ArrowLeft, Award, RefreshCw, Tag } from 'lucide-react';
import { apiJson } from '../../../../Shared/utils/api';
import { formatPrice } from '../../utils/formatters';

/**
 * Trang Hội viên riêng (/membership) — đợt 13, mục 2.
 * Dùng 3 endpoint đã có ở backend (Program.cs § Membership):
 *  - GET /api/membership/me — hạng, số dư điểm, chi tiêu 12 tháng, hạng tiếp theo
 *  - GET /api/membership/points — sổ cái điểm (lịch sử tích/dùng điểm)
 *  - GET /api/membership/vouchers — voucher của tôi (công khai đúng hạng + cá nhân)
 * 1 điểm = 1.000đ khi thanh toán (MembershipService.PointsValueVnd).
 */

export interface MembershipInfo {
  tier: string;
  tierLabel: string;
  availablePoints: number;
  expiringSoonPoints: number;
  totalSpent12m: number;
  nextTierSpent: number;
  nextTier?: string | null;
  nextTierLabel?: string | null;
  spendPerPoint: number;
  maxPointsPercent: number;
  freeShipThreshold?: number | null;
  autoUsePoints: boolean;
  defaultPaymentMethod?: string | null;
  birthDate?: string | null;
}

export interface PointLedgerEntry {
  id: string;
  type: string;
  points: number;
  expiresAt?: string | null;
  reason?: string | null;
  orderId?: string | null;
  createdAt: string;
}

export interface MyVoucher {
  id: string;
  code: string;
  description: string;
  discountType: string;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount?: number | null;
  expiryDate?: string | null;
  minTier?: string | null;
  isPersonal: boolean;
}

/** 1 điểm = 1.000đ (khớp MembershipService.PointsValueVnd). */
export const POINTS_VALUE_VND = 1000;

export const TIER_LABELS: Record<string, string> = {
  Member: 'Thường',
  Silver: 'Bạc',
  Gold: 'Vàng',
  Diamond: 'Kim cương',
};

const TIER_ORDER = ['Member', 'Silver', 'Gold', 'Diamond'];

const LEDGER_TYPE_LABELS: Record<string, string> = {
  EARN: 'Tích điểm',
  USE: 'Dùng điểm',
  REFUND: 'Hoàn điểm',
  REVOKE: 'Thu hồi điểm',
  EXPIRED: 'Điểm hết hạn',
  ADMIN_ADJUST: 'Quản trị viên điều chỉnh',
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';

const freeShipText = (threshold?: number | null) => {
  if (threshold == null) return 'Chưa có ưu đãi freeship riêng theo hạng';
  if (threshold === 0) return 'Miễn phí vận chuyển mọi đơn hàng';
  return `Miễn phí vận chuyển cho đơn từ ${formatPrice(threshold)}`;
};

export interface MembershipPageProps {
  onBack: () => void;
}

export const MembershipPage: React.FC<MembershipPageProps> = ({ onBack }) => {
  const [info, setInfo] = useState<MembershipInfo | null>(null);
  const [history, setHistory] = useState<PointLedgerEntry[]>([]);
  const [vouchers, setVouchers] = useState<MyVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [birthDateInput, setBirthDateInput] = useState('');
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [birthDateSuccess, setBirthDateSuccess] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherSuccess, setVoucherSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, points, voucherRes] = await Promise.all([
        apiJson<MembershipInfo>('/api/membership/me'),
        apiJson<PointLedgerEntry[]>('/api/membership/points?page=1&pageSize=20'),
        apiJson<MyVoucher[]>('/api/membership/vouchers'),
      ]);
      if (me.body?.success && me.body.data) setInfo(me.body.data);
      else {
        setError(me.body?.message || 'Không tải được thông tin hội viên. Vui lòng đăng nhập lại.');
        setLoading(false);
        return;
      }
      if (points.body?.success && Array.isArray(points.body.data)) setHistory(points.body.data);
      if (voucherRes.body?.success && Array.isArray(voucherRes.body.data)) setVouchers(voucherRes.body.data);
    } catch {
      setError('Không thể kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đồng bộ ô ngày sinh khi /me tải xong (birthDate dạng ISO, lấy phần ngày).
  useEffect(() => {
    if (info?.birthDate) setBirthDateInput(info.birthDate.slice(0, 10));
  }, [info?.birthDate]);

  /** Lưu ngày sinh — PUT /api/membership/preferences (BE validate tuổi 10–120, sửa 1 lần/90 ngày). */
  const saveBirthDate = async () => {
    setBirthDateError(null);
    setBirthDateSuccess(null);
    if (!birthDateInput) return;
    try {
      const res = await apiJson('/api/membership/preferences', {
        method: 'PUT',
        body: JSON.stringify({ birthDate: birthDateInput || null }),
      });
      if (res.body?.success) {
        setBirthDateSuccess('Đã cập nhật ngày sinh.');
        await load();
      } else {
        setBirthDateError(res.body?.message || 'Không thể cập nhật ngày sinh.');
      }
    } catch {
      setBirthDateError('Không thể kết nối đến máy chủ.');
    }
  };

  /** Nhận voucher sinh nhật — POST /api/membership/birthday-voucher. Nút luôn bấm được để BE trả lỗi thật. */
  const claimBirthdayVoucher = async () => {
    setVoucherError(null);
    setVoucherSuccess(null);
    try {
      const res = await apiJson('/api/membership/birthday-voucher', { method: 'POST' });
      if (res.body?.success) {
        setVoucherSuccess(res.body.message);
        await load();
      } else {
        setVoucherError(res.body?.message || 'Không thể nhận voucher sinh nhật.');
      }
    } catch {
      setVoucherError('Không thể kết nối đến máy chủ.');
    }
  };

  const pointsValue = (info?.availablePoints ?? 0) * POINTS_VALUE_VND;
  const nextGoal = info?.nextTierSpent ?? 0;
  const spent = info?.totalSpent12m ?? 0;
  const progress = nextGoal > 0 ? Math.min(100, Math.round((spent / nextGoal) * 100)) : 100;

  return (
    <section className="orders-page" data-testid="membership-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              onClick={onBack}
            >
              <ArrowLeft size={16} /> Tiếp tục mua sắm
            </button>
            <h1 className="page-title" style={{ margin: 0 }}>
              <Award size={26} color="var(--primary)" /> Hội viên của tôi
            </h1>
          </div>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Hạng hội viên, số dư điểm và ưu đãi của bạn — 1 điểm = 1.000đ khi thanh toán.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load()}
          disabled={loading}
          style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
          data-testid="membership-refresh-btn"
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Làm mới
        </button>
      </div>

      {loading && <p>Đang tải thông tin hội viên...</p>}
      {error && !loading && (
        <div className="empty-state-card" data-testid="membership-login-required">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && info && (
        <>
          {/* Hạng hiện tại + số dư điểm */}
          <div
            className="empty-state-card"
            style={{ textAlign: 'left', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}
            data-testid="membership-tier"
          >
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Hạng hiện tại</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d81b60' }}>{info.tierLabel}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Chi tiêu 12 tháng: {formatPrice(spent)}
                {info.nextTierLabel ? (
                  <> — còn {formatPrice(Math.max(0, nextGoal - spent))} nữa để lên hạng {info.nextTierLabel}</>
                ) : (
                  <> — bạn đang ở hạng cao nhất</>
                )}
              </div>
              {info.nextTierLabel && (
                <div
                  style={{ height: 8, background: '#f1f1f1', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div style={{ width: `${progress}%`, height: '100%', background: '#ffd900' }} />
                </div>
              )}
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Số dư điểm khả dụng</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700 }} data-testid="membership-points-balance">
                {info.availablePoints.toLocaleString('vi-VN')} điểm
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Tương đương {formatPrice(pointsValue)} khi thanh toán
                {info.expiringSoonPoints > 0 && (
                  <> — sắp hết hạn: {info.expiringSoonPoints.toLocaleString('vi-VN')} điểm</>
                )}
              </div>
            </div>
          </div>

          {/* Quyền lợi theo hạng */}
          <div style={{ marginTop: 24 }} data-testid="membership-benefits">
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 10px' }}>Quyền lợi hạng {info.tierLabel}</h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Tích 1 điểm cho mỗi {info.spendPerPoint.toLocaleString('vi-VN')}đ chi tiêu.</li>
              <li>Dùng điểm giảm tối đa {info.maxPointsPercent}% giá trị đơn hàng.</li>
              <li>{freeShipText(info.freeShipThreshold)}.</li>
              <li>1 điểm = 1.000đ khi thanh toán; điểm hết hạn sau 12 tháng.</li>
              {(info.tier === 'Gold' || info.tier === 'Diamond') && (
                <li>Voucher sinh nhật hằng năm (nhận trong 30 ngày quanh ngày sinh).</li>
              )}
            </ul>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {TIER_ORDER.map(t => (
                <span
                  key={t}
                  data-testid={`membership-tier-badge-${t}`}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: '0.85rem',
                    fontWeight: t === info.tier ? 700 : 400,
                    background: t === info.tier ? '#ffd900' : '#f1f1f1',
                    color: t === info.tier ? '#111' : 'var(--text-muted)',
                  }}
                >
                  {TIER_LABELS[t]}{t === info.tier ? ' • Hạng của bạn' : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Ngày sinh & voucher sinh nhật — đợt 15, mục 3 */}
          <div style={{ marginTop: 24 }} data-testid="birthdate-section">
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 10px' }}>Ngày sinh &amp; voucher sinh nhật</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor="birthdate-input" style={{ fontSize: '0.9rem' }}>
                Ngày sinh
              </label>
              <input
                id="birthdate-input"
                type="date"
                data-testid="birthdate-input"
                value={birthDateInput}
                onChange={e => setBirthDateInput(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                data-testid="birthdate-save-btn"
                onClick={() => void saveBirthDate()}
              >
                Lưu ngày sinh
              </button>
            </div>
            {birthDateError && (
              <p data-testid="birthdate-error-msg" style={{ color: '#d81b60', margin: '8px 0 0' }}>
                {birthDateError}
              </p>
            )}
            {birthDateSuccess && (
              <p data-testid="birthdate-success-msg" style={{ color: '#1a7f37', margin: '8px 0 0' }}>
                {birthDateSuccess}
              </p>
            )}
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '16px 0 10px' }}>
              Chỉ hạng Vàng trở lên, trong 30 ngày quanh ngày sinh, mỗi năm 1 lần.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="claim-birthday-voucher-btn"
              onClick={() => void claimBirthdayVoucher()}
            >
              Nhận voucher sinh nhật
            </button>
            {voucherError && (
              <p data-testid="birthday-voucher-error-msg" style={{ color: '#d81b60', margin: '8px 0 0' }}>
                {voucherError}
              </p>
            )}
            {voucherSuccess && (
              <p data-testid="birthday-voucher-success-msg" style={{ color: '#1a7f37', margin: '8px 0 0' }}>
                {voucherSuccess}
              </p>
            )}
          </div>

          {/* Voucher của tôi */}
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 10px' }}>
              <Tag size={18} color="var(--primary)" /> Ưu đãi của tôi
            </h2>
            {vouchers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Bạn chưa có voucher nào.</p>
            ) : (
              <div className="orders-list-container" data-testid="membership-vouchers">
                {vouchers.map(v => (
                  <div key={v.id} className="order-card" data-testid={`membership-voucher-${v.code}`}>
                    <strong>{v.code}</strong> — {v.description}
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Giảm {v.discountType === 'Percentage' ? `${v.discountValue}%` : formatPrice(v.discountValue)}
                      {v.maxDiscountAmount ? `, tối đa ${formatPrice(v.maxDiscountAmount)}` : ''}
                      {v.minOrderAmount > 0 ? `, đơn tối thiểu ${formatPrice(v.minOrderAmount)}` : ''}
                      {v.expiryDate ? ` — hết hạn ${fmtDate(v.expiryDate)}` : ''}
                      {v.isPersonal ? ' • Voucher cá nhân' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lịch sử điểm */}
          <div style={{ marginTop: 24 }} data-testid="membership-history">
            <h2 style={{ fontSize: '1.15rem', margin: '0 0 10px' }}>Lịch sử điểm</h2>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Chưa có giao dịch điểm nào.</p>
            ) : (
              <div className="orders-list-container">
                {history.map(h => (
                  <div key={h.id} className="order-card" data-testid={`membership-history-item-${h.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        <strong>{LEDGER_TYPE_LABELS[h.type] ?? h.type}</strong>
                        {h.reason ? ` — ${h.reason}` : ''}
                      </span>
                      <span style={{ fontWeight: 700, color: h.points >= 0 ? '#1a7f37' : '#d81b60' }}>
                        {h.points >= 0 ? `+${h.points}` : h.points} điểm
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {fmtDate(h.createdAt)}
                      {h.expiresAt ? ` — hết hạn ${fmtDate(h.expiresAt)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default MembershipPage;
