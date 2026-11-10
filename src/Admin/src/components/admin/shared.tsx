/**
 * shared — Component nhỏ dùng chung cho mọi trang admin (đợt 18):
 * Badge (nhãn trạng thái), Pagination (phân trang), EmptyState (bảng trống).
 * KHÔNG làm lại Toggle — đã có trong FormControls.tsx.
 */

import React from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

// ---------- Badge ----------

export type BadgeTone = 'yellow' | 'blue' | 'green' | 'red' | 'gray' | 'orange';

export function Badge({
  tone,
  children,
  testid,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <span className={`sa-badge sa-badge--${tone}`} data-testid={testid}>
      {children}
    </span>
  );
}

// ---------- Pagination ----------

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  testid,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  testid: string;
  onPage: (page: number) => void;
}) {
  const safeTotalPages = Math.max(totalPages, total > 0 ? 1 : 0);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="sa-pager" data-testid={testid}>
      <span className="sa-pager-info">
        Hiển thị {from}–{to} / {total} kết quả
      </span>
      <span className="sa-pager-btns">
        <button
          type="button"
          className="sa-pager-btn"
          data-testid={`${testid}-prev`}
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <span className="sa-pager-range" data-testid={`${testid}-range`}>
          Trang {page} / {safeTotalPages}
        </span>
        <button
          type="button"
          className="sa-pager-btn"
          data-testid={`${testid}-next`}
          aria-label="Trang sau"
          disabled={page >= safeTotalPages || safeTotalPages === 0}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </span>
    </div>
  );
}

// ---------- EmptyState ----------

export function EmptyState({
  title,
  desc,
  action,
  testid,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className="sa-empty-state" data-testid={testid ?? 'empty-state'}>
      <span className="sa-empty-state-icon" aria-hidden="true">
        <Inbox size={24} strokeWidth={1.8} />
      </span>
      <p className="sa-empty-state-title">{title}</p>
      {desc && <p className="sa-empty-state-desc">{desc}</p>}
      {action && <div className="sa-empty-state-action">{action}</div>}
    </div>
  );
}
