/**
 * ProductPages — Trang chi tiết sản phẩm full page (đợt 21).
 *
 *   /products/:code → ProductDetailPage (chỉ xem, 4 card)
 *
 * Trang Thêm mới / Chỉnh sửa dùng lại ProductForm variant="page"
 * (AdminForms.tsx), không nằm ở file này. Sidebar + topbar do AdminPage giữ;
 * trang ở đây chỉ render breadcrumb + nội dung trong <main>.
 *
 * LƯU Ý DỮ LIỆU (không bịa): cột "Đánh giá" đã BỎ khỏi bảng danh sách SP
 * (đợt 21) nhưng dữ liệu rating/reviewCount vẫn còn — hiện ở trang chi tiết
 * này (số sao + số lượt đánh giá) và ở module Đánh giá riêng. SP chưa có
 * đánh giá thì hiện "—".
 */

import React from 'react';
import { ArrowLeft, Pencil, Star } from 'lucide-react';
import { Badge } from './shared';
import { ViewImageGallery } from './FormControls';

/** Tóm tắt SP dùng cho trang chi tiết (cấu trúc khớp PublicProduct ở AdminPage). */
export interface ProductSummary {
  id: string;
  code?: string | null;
  categoryId: string;
  categoryName?: string;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number | null;
  availableStock?: number;
  stock?: number;
  isActive?: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  rating?: number;
  reviewCount?: number;
}

const fmtMoney = (n?: number | null) => `${(n ?? 0).toLocaleString('vi-VN')}₫`;
/** % giảm giá SP (giá gốc > giá bán), null khi không có giá gốc. */
const discountPct = (price: number, originalPrice?: number | null): number | null => {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
};

/** 5 icon sao Lucide (kẹp 0–5, làm tròn xuống): sao đầy = fill vàng,
 *  sao rỗng = chỉ viền xám — cùng cách hiển thị với cột Đánh giá cũ. */
const RatingStars = ({ rating }: { rating: number }) => {
  const r = Math.max(0, Math.min(5, Math.floor(rating || 0)));
  return (
    <span className="sa-stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <Star key={i} size={14} strokeWidth={2} color={i < r ? '#f59e0b' : '#d1d5db'} fill={i < r ? '#f59e0b' : 'none'} />
      ))}
    </span>
  );
};

/** Breadcrumb "Quản lý sản phẩm > Chi tiết sản phẩm" — bấm mục đầu về danh sách.
 *  Dùng dấu ">" như spec đợt 21 viết (khác breadcrumb KM dùng "/"). */
/** Breadcrumb "Quản lý sản phẩm > Chi tiết sản phẩm" — chữ thường (đợt 26):
 *  mục đầu là <span>, không còn là nút. Prop onBackToList giữ lại vì nút
 *  "Quay lại" ở header trang chi tiết vẫn dùng nó (không dùng cho breadcrumb).
 *  Dùng dấu ">" như spec đợt 21 viết (khác breadcrumb KM dùng "/"). */
export function ProductBreadcrumb({ current, onBackToList }: { current: string; onBackToList: () => void }) {
  void onBackToList;
  return (
    <nav className="sa-breadcrumb" aria-label="Breadcrumb" data-testid="admin-product-breadcrumb">
      <span className="sa-breadcrumb-link">Quản lý sản phẩm</span>
      <span aria-hidden="true">&gt;</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

const Kv = ({ label, value, testid }: { label: string; value: React.ReactNode; testid?: string }) => (
  <div className="sa-product-kv" data-testid={testid}>
    <span className="sa-product-kv-label">{label}</span>
    <span className="sa-product-kv-value">{value}</span>
  </div>
);

// ============================================================================
// TRANG CHI TIẾT — /products/:code (chỉ xem, không sửa tại đây)
// ============================================================================

export function ProductDetailPage({ product, onBackToList, onEdit }: {
  product: ProductSummary;
  onBackToList: () => void;
  onEdit: () => void;
}) {
  const stock = product.availableStock ?? product.stock ?? 0;
  const pct = discountPct(product.price, product.originalPrice);
  const urls = product.imageUrls && product.imageUrls.length > 0
    ? product.imageUrls
    : product.imageUrl ? [product.imageUrl] : [];
  return (
    <section className="sa-product-page" data-testid="admin-product-detail-page">
      <ProductBreadcrumb current="Chi tiết sản phẩm" onBackToList={onBackToList} />
      <div className="sa-product-page-head sa-page-sticky-head">
        <div className="sa-product-page-head-text">
          <h2>Chi tiết sản phẩm</h2>
          <p><span className="sa-code">{product.code ?? '—'}</span> · {product.name}</p>
        </div>
        <div className="sa-product-page-head-actions">
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-product-detail-back-btn" onClick={onBackToList}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Quay lại
          </button>
          <button type="button" className="sa-btn" data-testid="admin-product-detail-edit-btn" onClick={onEdit}>
            <Pencil size={16} strokeWidth={2} aria-hidden="true" /> Chỉnh sửa
          </button>
        </div>
      </div>

      <div className="sa-product-detail-grid">
        <div className="sa-list-card sa-product-detail-card" data-testid="admin-product-detail-general">
          <h3>Thông tin chung</h3>
          <Kv label="Mã SP" value={<span className="sa-code">{product.code ?? '—'}</span>} testid="admin-product-detail-code" />
          <Kv label="Tên sản phẩm" value={product.name} testid="admin-product-detail-name" />
          <Kv label="Danh mục" value={product.categoryName ?? '—'} testid="admin-product-detail-category" />
          <Kv
            label="Trạng thái"
            value={<Badge tone={(product.isActive ?? true) ? 'green' : 'gray'}>{(product.isActive ?? true) ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Badge>}
            testid="admin-product-detail-status"
          />
          <Kv
            label="Đánh giá"
            value={product.rating != null
              ? (
                <span className="sa-rating-cell" data-testid="admin-product-detail-rating">
                  <RatingStars rating={product.rating} /> {product.rating} <small>({product.reviewCount ?? 0} đánh giá)</small>
                </span>
              )
              : '—'}
            testid="admin-product-detail-rating-row"
          />
        </div>

        <div className="sa-list-card sa-product-detail-card" data-testid="admin-product-detail-price-card">
          <h3>Giá &amp; tồn kho</h3>
          <Kv label="Giá bán" value={<span className="sa-money">{fmtMoney(product.price)}</span>} testid="admin-product-detail-price" />
          <Kv
            label="Giá gốc"
            value={product.originalPrice
              ? (
                <span>
                  <s>{fmtMoney(product.originalPrice)}</s>
                  {pct != null && <span className="sa-discount-badge">-{pct}%</span>}
                </span>
              )
              : '—'}
            testid="admin-product-detail-original-price"
          />
          <Kv
            label="Tồn kho"
            value={(
              <span>
                {stock}
                {stock === 0 ? <><br /><Badge tone="red">Hết hàng</Badge></> : stock < 20 ? <><br /><Badge tone="orange">Sắp hết</Badge></> : null}
              </span>
            )}
            testid="admin-product-detail-stock"
          />
        </div>

        <div className="sa-list-card sa-product-detail-card" data-testid="admin-product-detail-images">
          <h3>Hình ảnh</h3>
          <ViewImageGallery prefix="admin-product-image" urls={urls} />
        </div>

        <div className="sa-list-card sa-product-detail-card" data-testid="admin-product-detail-description">
          <h3>Mô tả</h3>
          <p className="sa-product-detail-desc" data-testid="admin-product-detail-description-text">
            {product.description?.trim() ? product.description : '—'}
          </p>
        </div>
      </div>
    </section>
  );
}
