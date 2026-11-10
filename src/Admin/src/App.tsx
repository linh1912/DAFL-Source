import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import AdminPage from './components/admin/AdminPage';
import { AuthModal } from '../../Shared/components/auth/AuthModal';
import type { AuthResult } from '../../Shared/types';
import { apiJson, setSessionExpiredHandler, setToken } from '../../Shared/utils/api';

/**
 * App ADMIN riêng (localhost:3001) — đợt 13 tách khỏi app shop.
 * Trước đây là nhánh `IS_ADMIN_ONLY` trong src/Frontend/src/App.tsx
 * (cờ build VITE_ADMIN_ONLY=true); nay là app độc lập, không còn cờ đó.
 *
 * Chỉ có các màn: /login (AuthModal adminOnly — form cơ bản, không tab đăng ký,
 * không social), /admin (AdminPage, tự chặn quyền: chưa đăng nhập hoặc
 * không phải SuperAdmin thì chuyển về /login), /orders/:code (AdminPage
 * hiển thị trang chi tiết đơn — đợt 21, bỏ Drawer chi tiết đơn) và
 * /promotions/* (AdminPage hiển thị các trang Khuyến mãi full page — đợt 21:
 * /promotions/new thêm mới, /promotions/:code chi tiết,
 * /promotions/:code/edit chỉnh sửa, /promotions/:code/usages lịch sử sử dụng;
 * danh sách KM vẫn ở tab Khuyến mãi trong /admin).
 * /products/* (AdminPage hiển thị các trang Sản phẩm full page — đợt 21:
 * /products/new thêm mới, /products/:code chi tiết, /products/:code/edit
 * chỉnh sửa; danh sách SP vẫn ở tab Sản phẩm trong /admin).
 * Route / và * đều về /admin.
 * Đợt 21 — trang con Danh mục/Khách hàng/Trả hàng/Đánh giá (full page):
 * /categories/new, /categories/:code, /categories/:code/edit,
 * /customers/:code, /customers/:code/edit, /returns/:code, /reviews/:id
 * (AdminPage hiển thị trang tương ứng; :code = mã DM/mã KH/mã đơn hiển thị,
 * :id = Guid đánh giá).
 * Đăng nhập thành công chỉ lưu JWT rồi vào /admin; mọi dữ liệu lấy qua
 * /api/admin/* chung backend với shop (1 API chung, không tách backend).
 */
export default function App() {
  const navigate = useNavigate();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginEmailError, setLoginEmailError] = useState<string | null>(null);
  const [loginPasswordError, setLoginPasswordError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    document.title = 'DAFL Admin — Quản trị';
  }, []);

  // 401 (CN-02 E3): phiên hết hạn → về màn hình đăng nhập kèm thông báo.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setSessionExpired(true);
      navigate('/login');
    });
    return () => setSessionExpiredHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAuthErrors = () => {
    setAuthError(null);
    setLoginEmailError(null);
    setLoginPasswordError(null);
  };

  const updateLoginEmail = (value: string) => {
    setLoginEmail(value);
    if (loginEmailError) setLoginEmailError(null);
  };

  const updateLoginPassword = (value: string) => {
    setLoginPassword(value);
    if (loginPasswordError) setLoginPasswordError(null);
  };

  const handleLogin = async (e: React.FormEvent, values?: { email: string; password: string }) => {
    e.preventDefault();
    clearAuthErrors();

    // Nhập "admin" cũng đăng nhập bằng tài khoản admin@dafl.vn
    // (AuthModal đã chuẩn hóa; đây là lớp đảm bảo nếu email đi qua state App).
    const rawEmail = (values?.email ?? loginEmail).trim().toLowerCase();
    const email = rawEmail === 'admin' ? 'admin@dafl.vn' : rawEmail;
    const password = values?.password ?? loginPassword;
    if (email !== loginEmail) setLoginEmail(email);

    if (!email) {
      setLoginEmailError('Email không được để trống.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLoginEmailError('Email không đúng định dạng.');
      return;
    }
    if (!password) {
      setLoginPasswordError('Mật khẩu không được để trống.');
      return;
    }

    setAuthLoading(true);
    try {
      const { body } = await apiJson<AuthResult>('/api/auth/login', {
        method: 'POST',
        skipAuthHandler: true,
        body: JSON.stringify({ email, password }),
      });
      if (body?.success && body.data && body.data.token && body.data.user) {
        setToken(body.data.token);
        setSessionExpired(false);
        clearAuthErrors();
        navigate('/admin');
      } else {
        // CN-02.3: một thông điệp chung, hiện dưới ô mật khẩu (một chỗ duy nhất).
        setLoginPasswordError(
          body?.message || 'Email hoặc mật khẩu không đúng'
        );
      }
    } catch {
      setAuthError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại sau.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="admin-app" data-testid="admin-app">
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/orders/:code" element={<AdminPage />} />
        {/* Đợt 21 — Khuyến mãi full page: /promotions/new PHẢI khai trước
          * /promotions/:code để "new" không bị bắt làm :code. */}
        <Route path="/promotions/new" element={<AdminPage />} />
        <Route path="/promotions/:code/usages" element={<AdminPage />} />
        <Route path="/promotions/:code/edit" element={<AdminPage />} />
        <Route path="/promotions/:code" element={<AdminPage />} />
        {/* Đợt 21 — Sản phẩm full page: /products/new PHẢI khai trước
          * /products/:code để "new" không bị bắt làm :code. */}
        <Route path="/products/new" element={<AdminPage />} />
        <Route path="/products/:code/edit" element={<AdminPage />} />
        <Route path="/products/:code" element={<AdminPage />} />
        {/* Đợt 21 — Danh mục full page: /categories/new PHẢI khai trước
          * /categories/:code để "new" không bị bắt làm :code. */}
        <Route path="/categories/new" element={<AdminPage />} />
        <Route path="/categories/:code/edit" element={<AdminPage />} />
        <Route path="/categories/:code" element={<AdminPage />} />
        {/* Đợt 21 — Khách hàng full page (không có trang thêm mới). */}
        <Route path="/customers/:code/edit" element={<AdminPage />} />
        <Route path="/customers/:code" element={<AdminPage />} />
        {/* Đợt 21 — Trả hàng / Đánh giá full page. */}
        <Route path="/returns/:code" element={<AdminPage />} />
        <Route path="/reviews/:id" element={<AdminPage />} />
        <Route
          path="/login"
          element={(
            <AuthModal
              isOpen={true}
              isModal={false}
              adminOnly
              onClose={() => navigate('/admin')}
              authTab="login"
              setAuthTab={() => {}}
              authError={authError}
              authLoading={authLoading}
              loginEmail={loginEmail}
              setLoginEmail={updateLoginEmail}
              loginPassword={loginPassword}
              setLoginPassword={updateLoginPassword}
              registerName=""
              setRegisterName={() => {}}
              registerEmail=""
              setRegisterEmail={() => {}}
              registerPassword=""
              setRegisterPassword={() => {}}
              registerPhone=""
              setRegisterPhone={() => {}}
              onLogin={handleLogin}
              onRegister={() => {}}
              onClearAuthErrors={clearAuthErrors}
              loginEmailError={loginEmailError}
              loginPasswordError={loginPasswordError}
              sessionExpired={sessionExpired}
            />
          )}
        />
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  );
}
