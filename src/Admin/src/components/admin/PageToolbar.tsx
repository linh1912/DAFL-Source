/**
 * PageToolbar — Thanh công cụ chuẩn cho mọi trang danh sách admin (đợt 18).
 *
 * Bố cục MỘT HÀNG duy nhất, cao 40px:
 *   Trái:  [ô tìm kiếm, icon kính lúp bên trong] + filters (dropdown trạng
 *           thái, lọc... do caller truyền qua prop filters)
 *   Phải:  [icon Tìm kiếm] [icon Đặt lại] [Thêm mới primary — sát phải nhất]
 * KHÔNG có nút Export (đã bỏ hẳn theo quyết định đợt 18).
 * Responsive 2 hàng ở tablet do CSS (W3) — component chỉ cần class đúng.
 *
 * CÁCH DÙNG:
 *   <PageToolbar
 *     testidPrefix="admin-products"
 *     searchValue={query} onSearchChange={setQuery}
 *     searchPlaceholder="Tìm theo tên, mã sản phẩm..."
 *     onSearch={() => load(1, query)} onReset={() => { setQuery(''); load(1, ''); }}
 *     filters={<select ...>...</select>}
 *     addLabel="Thêm mới" onAdd={() => openCreateForm()}
 *   />
 * Enter trong ô tìm → onSearch. Nút "Thêm mới" chỉ hiện khi có cả
 * addLabel và onAdd (trang không có quyền thêm thì bỏ 2 prop này).
 */

import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';

export interface PageToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Đợt 21: tùy chọn — tab Đơn hàng lọc client-side nên không cần nút Tìm/Enter
   *  (bỏ qua prop này thì Enter không làm gì). Các tab khác giữ nguyên. */
  onSearch?: () => void;
  onReset: () => void;
  /** Bộ lọc đặt cạnh ô tìm (bên trái): dropdown trạng thái, lọc danh mục... */
  filters?: React.ReactNode;
  addLabel?: string;
  onAdd?: () => void;
  /** Tiền tố testid, vd "admin-products" → admin-products-search-input... */
  testidPrefix: string;
  /** Đợt 21 (chỉ tab Đơn hàng): ẩn nút icon Tìm kiếm bên phải — lọc áp dụng
   *  ngay khi gõ (debounce) / khi đổi dropdown, không bắt bấm nút. */
  hideSearchButton?: boolean;
  /** Đợt 21 (chỉ tab Đơn hàng): hiện nút "×" xóa nhanh trong ô tìm khi có chữ. */
  showSearchClear?: boolean;
  onClearSearch?: () => void;
  /** Đợt 21 (chỉ tab Đơn hàng): nút Đặt lại dạng nút chữ thay vì nút icon,
   *  vd "Đặt lại bộ lọc". Không truyền thì giữ nút icon cũ. */
  resetLabel?: string;
  resetDisabled?: boolean;
}

export function PageToolbar(props: PageToolbarProps) {
  const {
    searchValue, onSearchChange, searchPlaceholder,
    onSearch, onReset, filters, addLabel, onAdd, testidPrefix,
    hideSearchButton, showSearchClear, onClearSearch, resetLabel, resetDisabled,
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
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearch?.();
              }
            }}
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
        {!hideSearchButton && (
          <button
            type="button"
            className="sa-page-toolbar-icon-btn"
            data-testid={`${testidPrefix}-search-btn`}
            aria-label="Tìm kiếm"
            title="Tìm kiếm"
            onClick={onSearch}
          >
            <Search size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        {resetLabel ? (
          <button
            type="button"
            className="sa-page-toolbar-reset-btn"
            data-testid={`${testidPrefix}-reset-btn`}
            onClick={onReset}
            disabled={resetDisabled}
          >
            {resetLabel}
          </button>
        ) : (
          <button
            type="button"
            className="sa-page-toolbar-icon-btn"
            data-testid={`${testidPrefix}-reset-btn`}
            aria-label="Đặt lại"
            title="Đặt lại"
            onClick={onReset}
          >
            <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
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
