import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Image, Star, TriangleAlert, X } from 'lucide-react';
import { compressImage, formatFileSizeMB, formatThousands, imageFileErrorKind, objectUrlOf, uploadImageFile, validateImageFile } from './formUtils';
import { notify } from './notify';
import { fmt, messages } from './messages.vi';

/**
 * Control dùng chung cho 3 form admin (đợt redesign form + upload ảnh).
 * Không chứa nghiệp vụ validate/payload — chỉ giao diện + tương tác.
 */

// ---------- Dòng lỗi inline dưới ô (viền đỏ ở input do class sa-input-error) ----------
export function FieldError({ id, testid, message }: { id?: string; testid?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p className="sa-field-error" id={id} data-testid={testid} role="alert">
      <span aria-hidden="true"><TriangleAlert size={14} strokeWidth={2} style={{ verticalAlign: '-2px' }} /></span> {message}
    </p>
  );
}

/** Dấu * đỏ cho trường bắt buộc. */
export const Req = () => (
  <span className="sa-req" aria-hidden="true"> *</span>
);

// ---------- Toggle switch (role="switch") ----------
export function Toggle({ checked, onChange, testid, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; testid: string; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testid}
      className={`sa-toggle${checked ? ' sa-toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="sa-toggle-knob" aria-hidden="true" />
      <span className="sa-toggle-label">{label}</span>
    </button>
  );
}

// ---------- Switch trạng thái trong bảng (đợt 17, BR-06) ----------
// Cùng cơ chế với Toggle (button role="switch" + aria-checked) nhưng gọn:
// chỉ có núm gạt, không có nhãn chữ đi kèm — trạng thái đọc qua aria-checked
// và cột Trạng thái. Selector cho test: getByTestId('admin-<loai>-status-switch-{id}')
// + getAttribute('aria-checked') === 'true' (đang hoạt động) / 'false' (ngừng).
// Bấm switch KHÔNG đổi ngay: cha mở popup "Xác nhận đổi trạng thái" trước,
// chỉ gọi API khi xác nhận; Huỷ thì switch giữ nguyên (controlled theo dữ liệu).
export function StatusSwitch({ checked, onToggle, testid, label, disabled }: {
  checked: boolean; onToggle: () => void; testid: string; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      data-testid={testid}
      className={`sa-toggle sa-status-switch${checked ? ' sa-toggle-on' : ''}`}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="sa-toggle-knob" aria-hidden="true" />
    </button>
  );
}

// ---------- Ô tiền tệ: hiển thị dấu chấm ngăn cách nghìn + hậu tố ₫, state giữ số thô ----------
// readOnly (đợt 18, chế độ xem): ô xám nhạt, cho bôi đen/copy, không sửa được.
export function MoneyInput({ id, value, onChange, testid, errorId, disabled, placeholder, readOnly, error }: {
  id: string; value: string; onChange: (digits: string) => void; testid: string;
  errorId?: string; disabled?: boolean; placeholder?: string; readOnly?: boolean;
  /** Đợt 21: true thì viền đỏ (sa-input-error) — dùng khi field tiền bị lỗi validate. */
  error?: boolean;
}) {
  return (
    <span className={`sa-money-wrap${error ? ' sa-money-wrap-error' : ''}`}>
      <input
        id={id}
        className={`sa-input sa-money-input${readOnly ? ' sa-view-input' : ''}${error ? ' sa-input-error' : ''}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatThousands(value)}
        placeholder={placeholder ?? '0'}
        aria-describedby={errorId}
        disabled={disabled}
        readOnly={readOnly}
        data-testid={testid}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      />
      <span className="sa-money-suffix" aria-hidden="true">₫</span>
    </span>
  );
}

// ---------- Dropdown danh mục TỰ LÀM (trigger + listbox có ô tìm kiếm) ----------
// disabled (đợt 18, chế độ xem): chỉ hiện tên đã chọn, không mở danh sách.
export function CategoryPicker({ value, categories, onChange, testid, errorId, placeholder, disabled }: {
  value: string;
  categories: Array<{ id: string; name: string }>;
  onChange: (id: string) => void;
  testid: string;
  errorId?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = categories.find(c => c.id === value);
  const filtered = categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open ]);

  return (
    <div className="sa-picker" ref={wrapRef}>
      <button
        type="button"
        className={`sa-input sa-picker-trigger${disabled ? ' sa-view-input' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-describedby={errorId}
        aria-label="Danh mục"
        data-testid={testid}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      >
        <span className={selected ? '' : 'sa-picker-placeholder'}>{selected ? selected.name : (placeholder ?? 'Chọn danh mục')}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div className="sa-picker-list" role="listbox" aria-label="Danh sách danh mục">
          <input
            className="sa-input sa-picker-search"
            placeholder="Tìm danh mục..."
            value={query}
            aria-label="Tìm danh mục"
            onChange={e => setQuery(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {filtered.length === 0 && <div className="sa-picker-empty">Không tìm thấy danh mục.</div>}
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === value}
              className={`sa-picker-option${c.id === value ? ' sa-picker-selected' : ''}`}
              onClick={() => { onChange(c.id); setOpen(false); setQuery(''); }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Upload ảnh ----------

export interface UploadImageItem {
  id: string;
  /** URL ảnh đã upload xong (hoặc ảnh cũ). */
  url: string;
  /** Preview local (object URL) trong lúc chờ upload; mặc định = url. */
  previewUrl: string;
  status: 'ready' | 'uploading' | 'error';
  progress: number;
  error?: string | null;
  name?: string;
}

let imageSeq = 0;
const nextImageId = () => `img-${Date.now()}-${++imageSeq}`;

export function imageItemFromUrl(url: string): UploadImageItem {
  return { id: nextImageId(), url, previewUrl: url, status: 'ready', progress: 100 };
}

interface ImageUploaderProps {
  /** Tiền tố testid, vd "admin-product-image" / "admin-category-image". */
  prefix: string;
  images: UploadImageItem[];
  onChange: (images: UploadImageItem[]) => void;
  multiple: boolean;
  max?: number;
}

/**
 * Dropzone upload ảnh: bấm chọn file / kéo-thả / dán Ctrl+V.
 * Preview ngay (object URL), nén/resize client rồi POST /api/admin/upload
 * (field "file", trả { url }), progress % thật qua XHR, lỗi inline + Thử lại.
 * Input file thật luôn present trong DOM (visually-hidden, không display:none)
 * để Selenium sendKeys được.
 */
export function ImageUploader({ prefix, images, onChange, multiple, max }: ImageUploaderProps) {
  const maxImages = max ?? (multiple ? 8 : 1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const patchItem = (id: string, patch: Partial<UploadImageItem>) => {
    onChange(imagesRef.current.map(it => (it.id === id ? { ...it, ...patch } : it)));
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!multiple && list.length > 1) setDropError('Chỉ chọn 1 ảnh cho danh mục.');
    const room = maxImages - imagesRef.current.length;
    if (room <= 0) {
      setDropError(`Tối đa ${maxImages} ảnh.`);
      notify.warning(messages.toast.upload.tooMany.title, fmt(messages.toast.upload.tooMany.desc, { n: maxImages }));
      return;
    }
    const accepted = list.slice(0, multiple ? room : 1);
    if (list.length > accepted.length) {
      setDropError(`Tối đa ${maxImages} ảnh — chỉ nhận ${accepted.length} ảnh đầu.`);
      notify.warning(messages.toast.upload.tooMany.title, fmt(messages.toast.upload.tooMany.desc, { n: maxImages }));
    } else setDropError(null);
    accepted.forEach(file => {
      const err = validateImageFile(file);
      const item: UploadImageItem = {
        id: nextImageId(), url: '', previewUrl: objectUrlOf(file),
        status: err ? 'error' : 'uploading', progress: 0, error: err, name: file.name,
      };
      onChange([...imagesRef.current, item]);
      if (err) {
        // Lỗi validate: inline dưới dropzone + toast §3.9 (đúng loại lỗi).
        const kind = imageFileErrorKind(file);
        if (kind === 'format') {
          notify.warning(messages.toast.upload.unsupportedFormat.title, messages.toast.upload.unsupportedFormat.desc);
        } else if (kind === 'size') {
          notify.warning(messages.toast.upload.tooLarge.title,
            fmt(messages.toast.upload.tooLarge.desc, { 'tên file': file.name, x: formatFileSizeMB(file.size) }));
        }
        return;
      }
      void (async () => {
        const compressed = await compressImage(file);
        const res = await uploadImageFile(compressed, pct => patchItem(item.id, { progress: pct }));
        if (res.ok && res.url) patchItem(item.id, { status: 'ready', progress: 100, url: res.url, error: null });
        else {
          patchItem(item.id, { status: 'error', error: res.error || 'Upload thất bại.' });
          notify.error(messages.toast.upload.failed.title,
            fmt(messages.toast.upload.failed.desc, { 'tên file': file.name }));
        }
      })();
    });
  };

  const retryItem = (item: UploadImageItem) => {
    // Chỉ thử lại được khi còn file gốc — item lỗi validate/upload đều giữ
    // preview local nhưng không giữ File; vì vậy retry = mở lại hộp chọn file.
    // (Giữ nút Thử lại theo spec; bấm sẽ mở hộp chọn để chọn lại ảnh đó.)
    fileInputRef.current?.click();
    void item;
  };

  const removeItem = (id: string) => onChange(imagesRef.current.filter(it => it.id !== id));

  const setMain = (index: number) => {
    if (!multiple || index === 0) return;
    const next = [...imagesRef.current];
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    onChange(next);
  };

  const thumbTestid = (i: number) => (multiple ? `${prefix}-thumb-${i}` : `${prefix}-thumb`);
  const removeTestid = (i: number) => (multiple ? `${prefix}-remove-btn-${i}` : `${prefix}-remove-btn`);

  return (
    <div className="sa-uploader">
      <div
        className={`sa-dropzone${dragOver ? ' sa-dropzone-over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Kéo thả ảnh vào đây hoặc bấm để chọn từ máy tính"
        data-testid={`${prefix}-dropzone`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); }
        }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        onPaste={e => {
          const files = e.clipboardData?.files;
          if (files && files.length > 0) { e.preventDefault(); addFiles(files); }
        }}
      >
        <span className="sa-dropzone-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4" />
            <path d="m6 10 6-6 6 6" />
            <path d="M4 20h16" />
          </svg>
        </span>
        <span className="sa-dropzone-text">Kéo thả ảnh vào đây hoặc bấm để chọn từ máy tính</span>
        <span className="sa-dropzone-sub">PNG, JPG, WEBP – tối đa 5MB{multiple ? ` – tối đa ${maxImages} ảnh` : ''}</span>
        {/* Input file thật, chỉ visually-hidden (không display:none) để Selenium sendKeys được. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple={multiple}
          className="sa-visually-hidden"
          data-testid={`${prefix}-input`}
          aria-label="Chọn ảnh từ máy tính"
          onChange={e => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
          onClick={e => e.stopPropagation()}
        />
      </div>
      {dropError && (
        <p className="sa-field-error" data-testid={`${prefix}-error`} role="alert">
          <span aria-hidden="true"><TriangleAlert size={14} strokeWidth={2} style={{ verticalAlign: '-2px' }} /></span> {dropError}
        </p>
      )}
      {images.length > 0 && (
        <div className="sa-thumbs">
          {images.map((it, i) => (
            <div
              key={it.id}
              className={`sa-thumb-item${it.status === 'error' ? ' sa-thumb-error' : ''}`}
              data-testid={thumbTestid(i)}
              draggable={multiple && it.status === 'ready'}
              onDragStart={() => { dragIndexRef.current = i; }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const from = dragIndexRef.current;
                dragIndexRef.current = null;
                if (from === null || from === i) return;
                const next = [...imagesRef.current];
                const [moved] = next.splice(from, 1);
                next.splice(i, 0, moved);
                onChange(next);
              }}
            >
              {it.previewUrl
                ? <img src={it.previewUrl} alt={it.name ?? `Ảnh ${i + 1}`} className="sa-thumb-img" />
                : <span className="sa-thumb-ph" aria-hidden="true"><Image size={24} strokeWidth={1.8} /></span>}
              {multiple && i === 0 && it.status === 'ready' && <span className="sa-thumb-main">Ảnh chính</span>}
              {it.status === 'uploading' && (
                <span className="sa-thumb-progress" data-testid={`${prefix}-progress-${i}`}>
                  <span className="sa-progress-bar"><span style={{ width: `${it.progress}%` }} /></span>
                  {it.progress}%
                </span>
              )}
              {it.status === 'error' && (
                <span className="sa-thumb-retry">
                  <span className="sa-thumb-err-text">{it.error || 'Upload thất bại.'}</span>
                  <button type="button" className="sa-btn sa-btn-ghost sa-thumb-retry-btn" onClick={() => retryItem(it)}>Thử lại</button>
                </span>
              )}
              <span className="sa-thumb-actions">
                {multiple && i !== 0 && it.status === 'ready' && (
                  <button
                    type="button"
                    className="sa-thumb-btn"
                    data-testid={`${prefix}-set-main-btn-${i}`}
                    title="Đặt làm ảnh chính"
                    aria-label={`Đặt ảnh ${i + 1} làm ảnh chính`}
                    onClick={() => setMain(i)}
                  >
                    <Star size={16} strokeWidth={2} fill="currentColor" />
                  </button>
                )}
                <button
                  type="button"
                  className="sa-thumb-btn sa-thumb-remove"
                  data-testid={removeTestid(i)}
                  title="Xóa ảnh"
                  aria-label={`Xóa ảnh ${i + 1}`}
                  onClick={() => removeItem(it.id)}
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Thư viện ảnh CHỈ XEM (chế độ xem của form, đợt 18) ----------
// Thumbnail 96×96, ảnh đầu nhãn "Ảnh chính", bấm phóng to (lightbox tối giản
// trong form, đóng bằng X/ESC/bấm nền). KHÔNG có khung upload, nút xóa hay
// đổi thứ tự. Testid thumbnail giữ cùng quy ước với ImageUploader
// (`${prefix}-thumb` / `${prefix}-thumb-${i}`) để test tìm được ở mọi mode.
export function ViewImageGallery({ prefix, urls }: { prefix: string; urls: string[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (lightbox === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setLightbox(null); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [lightbox]);

  if (urls.length === 0) return <p className="fs-view-desc">—</p>;
  const multiple = urls.length > 1;

  return (
    <>
      <div className="fs-view-gallery">
        {urls.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            className="fs-view-thumb"
            data-testid={multiple ? `${prefix}-thumb-${i}` : `${prefix}-thumb`}
            aria-label={`Xem ảnh ${i + 1}${i === 0 ? ' (ảnh chính)' : ''}`}
            title="Bấm để phóng to"
            onClick={() => setLightbox(i)}
          >
            <img src={url} alt={`Ảnh ${i + 1}`} />
            {multiple && i === 0 && <span className="fs-view-thumb-main">Ảnh chính</span>}
          </button>
        ))}
      </div>
      {lightbox !== null && (
        <div
          className="fs-lightbox"
          data-testid={`${prefix}-lightbox`}
          role="dialog"
          aria-modal="true"
          aria-label={`Ảnh ${lightbox + 1} / ${urls.length}`}
          onClick={() => setLightbox(null)}
        >
          <img src={urls[lightbox]} alt={`Ảnh ${lightbox + 1}`} data-testid={`${prefix}-lightbox-img`} onClick={e => e.stopPropagation()} />
          <button
            type="button"
            className="fs-lightbox-close"
            data-testid={`${prefix}-lightbox-close-btn`}
            aria-label="Đóng"
            onClick={() => setLightbox(null)}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      )}
    </>
  );
}
