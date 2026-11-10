import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PHONE_FORMAT_MSG, PHONE_RE, REQUIRED_MSG, passwordPolicyError } from './formUtils';
import { FieldError, Req } from './FormControls';
import { FormShell } from './FormShell';
import type { FormSaveResult } from './AdminForms';

/**
 * Trang Hồ sơ quản trị (đợt 17, FR-ACC — mẫu VCB SCR_02/SCR_04).
 * KHÔNG thêm Ngày sinh / Giới tính (Q5).
 *
 * - Thẻ đầu trang: avatar, họ tên, vai trò "Quản trị hệ thống",
 *   "Tham gia từ" = CreatedAt, "Hoạt động lần cuối" = LastLoginAt,
 *   nút "Sửa thông tin" (admin-profile-edit-btn) mở form sửa.
 * - Thẻ "Thông tin cá nhân": Họ tên* / Email* chỉ xem / SĐT / Địa chỉ;
 *   Lưu → PUT /api/admin/profile (cha xử lý). Validate theo mẫu VCB §2:
 *   trống → "Vui lòng bổ sung thông tin bắt buộc.", SĐT sai → "Số điện thoại không đúng định dạng.".
 * - Thẻ "Bảo mật tài khoản": nút "Đổi mật khẩu" (admin-change-password-btn)
 *   mở form Mật khẩu hiện tại* / Mật khẩu mới* / Xác nhận* → POST /api/admin/change-password.
 *   Mật khẩu mới theo đúng policy BE (≥8 ký tự + chữ hoa + chữ số + ký tự đặc biệt).
 *   Đổi thành công thì BE vô hiệu mọi JWT → cha đăng xuất về /login.
 */

export interface AdminProfileData {
  id: string; email: string; fullName: string;
  phoneNumber?: string | null; address?: string | null; role: string;
  createdAt?: string | null; lastLoginAt?: string | null;
}

const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('vi-VN');
};

const AVATAR_COLORS = ['#051c12', '#0e7490', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#7c3aed', '#9f1239'];
const avatarColor = (name: string) => {
  let h = 0;
  for (const ch of (name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export default function AdminProfilePage({ profile, onSaveProfile, onChangePassword, onBack, initialPwOpen }: {
  profile: AdminProfileData;
  onSaveProfile: (payload: { fullName: string; phoneNumber: string | null; address: string | null }) => Promise<FormSaveResult>;
  onChangePassword: (payload: { currentPassword: string; newPassword: string; confirmNewPassword: string }) => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
  /** Đợt 20: mở trang Hồ sơ với form Đổi mật khẩu mở sẵn (menu chân sidebar). */
  initialPwOpen?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile.fullName);
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pwOpen, setPwOpen] = useState(initialPwOpen ?? false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwFormError, setPwFormError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Hồ sơ vừa lưu xong ở cha thì đồng bộ lại các ô (khi không đang sửa).
  useEffect(() => {
    if (!editing) {
      setFullName(profile.fullName);
      setPhoneNumber(profile.phoneNumber ?? '');
      setAddress(profile.address ?? '');
    }
  }, [profile, editing]);

  const roleLabel = profile.role === 'SuperAdmin' ? 'Quản trị hệ thống' : 'Quản trị viên';
  const initial = (profile.fullName?.trim()?.[0] ?? '?').toUpperCase();

  const validateProfile = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (fullName.trim().length === 0) errs.fullName = REQUIRED_MSG;
    const phone = phoneNumber.trim();
    if (phone !== '' && !PHONE_RE.test(phone)) errs.phoneNumber = PHONE_FORMAT_MSG;
    return errs;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validateProfile();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = errs.fullName ? 'admin-profile-name-input' : 'admin-profile-phone-input';
      (document.querySelector(`[data-testid="${first}"]`) as HTMLElement | null)?.focus();
      return;
    }
    setSaving(true);
    const res = await onSaveProfile({
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim() === '' ? null : phoneNumber.trim(),
      address: address.trim() === '' ? null : address.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
        const mapped: Record<string, string> = {};
        if (res.fieldErrors.fullName) mapped.fullName = res.fieldErrors.fullName;
        if (res.fieldErrors.phoneNumber) mapped.phoneNumber = res.fieldErrors.phoneNumber;
        if (res.fieldErrors.email) mapped.email = res.fieldErrors.email;
        setErrors(prev => ({ ...prev, ...mapped }));
      } else setFormError(res.error || 'Không lưu được thông tin cá nhân.');
      return;
    }
    setEditing(false);
  };

  const validatePassword = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (currentPassword === '') errs.currentPassword = REQUIRED_MSG;
    if (newPassword === '') errs.newPassword = REQUIRED_MSG;
    else {
      const policyErr = passwordPolicyError(newPassword);
      if (policyErr) errs.newPassword = policyErr;
    }
    if (confirmPassword === '') errs.confirmPassword = REQUIRED_MSG;
    else if (confirmPassword !== newPassword) errs.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    return errs;
  };

  const closePwForm = () => {
    setPwOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwErrors({});
    setPwFormError(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwFormError(null);
    const errs = validatePassword();
    setPwErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setPwBusy(true);
    const res = await onChangePassword({ currentPassword, newPassword, confirmNewPassword: confirmPassword });
    setPwBusy(false);
    if (!res.ok) {
      const msg = res.error || 'Không đổi được mật khẩu.';
      // Map message BE xuống đúng ô (vd "Mật khẩu hiện tại không đúng" → ô mật khẩu hiện tại).
      const mapped: Record<string, string> = {};
      if (/hiện tại/i.test(msg)) mapped.currentPassword = msg;
      else if (/Mật khẩu mới/i.test(msg)) mapped.newPassword = msg;
      else if (/xác nhận/i.test(msg)) mapped.confirmPassword = msg;
      if (Object.keys(mapped).length > 0) setPwErrors(prev => ({ ...prev, ...mapped }));
      else setPwFormError(msg);
      return;
    }
    // Thành công: cha đăng xuất (JWT cũ bị vô hiệu) + về /login.
  };

  return (
    <div data-testid="admin-profile-page" className="sa-profile-page">
      <div className="sa-form-page-head">
        <div className="sa-form-head-text">
          <h3>Hồ sơ quản trị</h3>
          <p>Thông tin tài khoản quản trị hệ thống.</p>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-profile-back-btn" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> Quay lại
        </button>
      </div>

      {/* Thẻ đầu trang */}
      <section className="sa-card sa-profile-head">
        <span className="sa-avatar sa-avatar-lg" style={{ background: avatarColor(profile.fullName) }}>{initial}</span>
        <div className="sa-profile-head-info">
          <h2>{profile.fullName}</h2>
          <p>{profile.email}</p>
          <p><span className="sa-pill sa-pill-green"><span className="sa-dot" aria-hidden="true" />{roleLabel}</span></p>
          <p>
            <span data-testid="admin-profile-joined-at">Tham gia từ: {fmtDate(profile.createdAt)}</span>
            {' — '}
            <span data-testid="admin-profile-last-login-at">Hoạt động lần cuối: {fmtDate(profile.lastLoginAt)}</span>
          </p>
        </div>
        <button type="button" className="sa-btn" data-testid="admin-profile-edit-btn" onClick={() => setEditing(v => !v)}>
          {editing ? 'Đóng form sửa' : 'Sửa thông tin'}
        </button>
      </section>

      {/* Thẻ Thông tin cá nhân */}
      <section className="sa-card sa-profile-card">
        <h3>Thông tin cá nhân</h3>
        {editing ? (
          <form onSubmit={handleSaveProfile} data-testid="admin-profile-form" noValidate>
            {formError && <p className="sa-error" role="alert">{formError}</p>}
            <div className="sa-form-grid">
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-profile-name">Họ tên<Req /></label>
                <input
                  id="admin-profile-name"
                  className={`sa-input${errors.fullName ? ' sa-input-error' : ''}`}
                  value={fullName}
                  data-testid="admin-profile-name-input"
                  aria-describedby={errors.fullName ? 'admin-profile-name-error' : undefined}
                  onChange={e => setFullName(e.target.value)}
                />
                <FieldError id="admin-profile-name-error" testid="admin-profile-name-error" message={errors.fullName} />
              </div>
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-profile-email">Email<Req /></label>
                <input
                  id="admin-profile-email"
                  className="sa-input"
                  value={profile.email}
                  data-testid="admin-profile-email-input"
                  disabled
                  readOnly
                />
                <span className="sa-field-meta"><span className="sa-hint">Email là định danh đăng nhập — chỉ xem, không sửa.</span></span>
                <FieldError id="admin-profile-email-error" testid="admin-profile-email-error" message={errors.email} />
              </div>
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-profile-phone">Số điện thoại</label>
                <input
                  id="admin-profile-phone"
                  className={`sa-input${errors.phoneNumber ? ' sa-input-error' : ''}`}
                  value={phoneNumber}
                  data-testid="admin-profile-phone-input"
                  aria-describedby={errors.phoneNumber ? 'admin-profile-phone-error' : undefined}
                  onChange={e => setPhoneNumber(e.target.value)}
                />
                <span className="sa-field-meta"><span className="sa-hint">Bắt đầu bằng 0, gồm 10 chữ số.</span></span>
                <FieldError id="admin-profile-phone-error" testid="admin-profile-phone-error" message={errors.phoneNumber} />
              </div>
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-profile-address">Địa chỉ</label>
                <input
                  id="admin-profile-address"
                  className="sa-input"
                  value={address}
                  data-testid="admin-profile-address-input"
                  onChange={e => setAddress(e.target.value)}
                />
              </div>
            </div>
            <div className="sa-form-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-profile-cancel-btn" onClick={() => setEditing(false)}>Hủy</button>
              <button type="submit" className="sa-btn" data-testid="admin-profile-save-btn" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p><strong>Họ tên:</strong> {profile.fullName}</p>
            <p><strong>Email:</strong> {profile.email}</p>
            <p><strong>Số điện thoại:</strong> {profile.phoneNumber ?? '—'}</p>
            <p><strong>Địa chỉ:</strong> {profile.address ?? '—'}</p>
          </div>
        )}
      </section>

      {/* Thẻ Bảo mật tài khoản — đổi mật khẩu mở bằng FormShell Drawer 680px (đợt 18 wave D),
          đúng 2 nút [Hủy] + [Đổi mật khẩu]; đóng bằng X/ESC/nút Hủy. */}
      <section className="sa-card sa-profile-card">
        <h3>Bảo mật tài khoản</h3>
        <button type="button" className="sa-btn" data-testid="admin-change-password-btn" onClick={() => setPwOpen(true)}>
          Đổi mật khẩu
        </button>
        {pwOpen && (
          <FormShell
            width={680}
            testid="admin-change-password-modal"
            formTestid="admin-change-password-form"
            title="Đổi mật khẩu"
            description="Mật khẩu mới tối thiểu 8 ký tự, gồm chữ hoa, chữ số và ký tự đặc biệt."
            onClose={closePwForm}
            onSubmit={handleChangePassword}
            footer={(
              <>
                <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-change-password-cancel-btn" onClick={closePwForm}>Hủy</button>
                <button type="submit" className="sa-btn" data-testid="admin-change-password-save-btn" disabled={pwBusy}>
                  {pwBusy ? 'Đang lưu...' : 'Đổi mật khẩu'}
                </button>
              </>
            )}
          >
            {pwFormError && <p className="sa-error" role="alert">{pwFormError}</p>}
            <div className="sa-form-grid">
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-change-password-current">Mật khẩu hiện tại<Req /></label>
                <input
                  id="admin-change-password-current"
                  type="password"
                  className={`sa-input${pwErrors.currentPassword ? ' sa-input-error' : ''}`}
                  value={currentPassword}
                  data-testid="admin-change-password-current-input"
                  aria-describedby={pwErrors.currentPassword ? 'admin-change-password-current-error' : undefined}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <FieldError id="admin-change-password-current-error" testid="admin-change-password-current-error" message={pwErrors.currentPassword} />
              </div>
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-change-password-new">Mật khẩu mới<Req /></label>
                <input
                  id="admin-change-password-new"
                  type="password"
                  className={`sa-input${pwErrors.newPassword ? ' sa-input-error' : ''}`}
                  value={newPassword}
                  data-testid="admin-change-password-new-input"
                  aria-describedby={pwErrors.newPassword ? 'admin-change-password-new-error' : undefined}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <span className="sa-field-meta"><span className="sa-hint">Tối thiểu 8 ký tự, gồm chữ hoa, chữ số và ký tự đặc biệt.</span></span>
                <FieldError id="admin-change-password-new-error" testid="admin-change-password-new-error" message={pwErrors.newPassword} />
              </div>
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-change-password-confirm">Xác nhận mật khẩu mới<Req /></label>
                <input
                  id="admin-change-password-confirm"
                  type="password"
                  className={`sa-input${pwErrors.confirmPassword ? ' sa-input-error' : ''}`}
                  value={confirmPassword}
                  data-testid="admin-change-password-confirm-input"
                  aria-describedby={pwErrors.confirmPassword ? 'admin-change-password-confirm-error' : undefined}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <FieldError id="admin-change-password-confirm-error" testid="admin-change-password-confirm-error" message={pwErrors.confirmPassword} />
              </div>
            </div>
          </FormShell>
        )}
      </section>
    </div>
  );
}
