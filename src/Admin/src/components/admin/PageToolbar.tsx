/**
 * PageToolbar — Thanh công cụ chuẩn cho mọi trang danh sách admin (đợt 18,
 * đợt 26 sửa lại).
 *
 * Bố cục MỘT HÀNG duy nhất, cao 38px:
 *   Trái:  [ô tìm kiếm, icon kính lúp bên trong] + filters (dropdown trạng
 *           thái, lọc... do caller truyền qua prop filters)
 *   Phải:  [icon Đặt lại (RotateCcw)] [Thêm mới primary — sát phải nhất]
 * KHÔNG có nút Export (đã bỏ hẳn theo quyết định đợt 18).
 * KHÔNG còn nút Tìm kiếm riêng và KHÔNG còn nút chữ "Đặt lại bộ lọc":
 * mọi trang lọc tự động khi gõ/đổi dropdown (debounce 300ms ở AdminPage);
 * nút Đặt lại chỉ còn dạng icon vuông 38px, tooltip + aria-label
 * "Đặt lại bộ lọc", disabled khi chưa có bộ lọc nào (prop resetDisabled).
 * Đợt 26 đã xóa hẳn prop nút Tìm, prop ẩn nút Tìm và prop nhãn nút chữ.
 * Responsive 2 hàng ở tablet do CSS (W3) — component chỉ cần class đúng.
 *
 * CÁCH DÙNG:
 *   <PageToolbar
 *     testidPrefix="admin-products"
 *     searchValue={query} onSearchChange={setQuery}
 *     searchPlaceholder="Tìm theo tên, mã sản phẩm..."
 *     onReset={() => { setQuery(''); }}
 *     filters={<select ...>...</select>}
 *     addLabel="Thêm mới" onAdd={() => openCreateForm()}
 *   />
 * Enter trong ô tìm không làm gì (lọc đã tự động). Nút "Thêm mới" chỉ hiện
 * khi có cả addLabel và onAdd (trang không có quyền thêm thì bỏ 2 prop này).
 */

import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';

export interface PageToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  onReset: () => void;
  /** Bộ lọc đặt cạnh ô tìm (bên trái): dropdown trạng thái, lọc danh mục... */
  filters?: React.ReactNode;
  addLabel?: string;
  onAdd?: () => void;
  /** Tiền tố testid, vd "admin-products" → admin-products-search-input... */
  testidPrefix: string;
  /** Đợt 21 (chỉ tab Đơn hàng): hiện nút "×" xóa nhanh trong ô tìm khi có chữ. */
  showSearchClear?: boolean;
  onClearSearch?: () => void;
  resetDisabled?: boolean;
}

export function PageToolbar(props: PageToolbarProps) {
  const {
    searchValue, onSearchChange, searchPlaceholder,
    onReset, filters, addLabel, onAdd, testidPrefix,
    showSearchClear, onClearSearch, resetDisabled,
  } = props;
  const showClear = !!showSearchClear && searchValue.length > 0;

  return (
    <div className="sa-page-toolbar" role="search">
      <div className="sa-page-toolbar-left">
        <span className={`sa-page-toolbar-search${showClear ? ' sa-page-toolbar-search--with-clear' : ''}`}>
          <span className="sa-page-toolbar-search-icon" aria-hidden="true">
            <Search size={18} strokeWidth={2} />
          </span>
          <input
            type="search"
            className="sa-page-toolbar-search-input"
            data-testid={`${testidPrefix}-search-input`}
            value={searchValue}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={e => onSearchChange(e.target.value)}
          />
          {showClear && (
            <button
              type="button"
              className="sa-page-toolbar-search-clear"
              data-testid={`${testidPrefix}-search-clear-btn`}
              aria-label="Xóa từ khóa tìm kiếm"
              title="Xóa từ khóa tìm kiếm"
              onClick={onClearSearch}
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </span>
        {filters}
      </div>
      <div className="sa-page-toolbar-right">
        <button
          type="button"
          className="sa-page-toolbar-icon-btn"
          data-testid={`${testidPrefix}-reset-btn`}
          aria-label="Đặt lại bộ lọc"
          title="Đặt lại bộ lọc"
          onClick={onReset}
          disabled={resetDisabled}
        >
          <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        {addLabel && onAdd && (
          <button
            type="button"
            className="sa-page-toolbar-add-btn"
            data-testid={`${testidPrefix}-add-btn`}
            onClick={onAdd}
          >
            + {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}
