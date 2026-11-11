import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { apiJson } from '../../../../Shared/utils/api';

export interface ReviewFormProps {
  productId: string;
  userId?: string | null;
  defaultName?: string;
  onSubmitted: () => void;
}

/**
 * Form gửi đánh giá trên trang chi tiết sản phẩm (đợt 15, phần 1).
 * Gọi POST /api/products/{id}/evaluations — không yêu cầu đăng nhập:
 * khách vãng lai để trống tên thì BE mặc định "Khách hàng DAFL".
 */
export const ReviewForm: React.FC<ReviewFormProps> = ({
  productId,
  userId,
  defaultName,
  onSubmitted,
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [name, setName] = useState(defaultName ?? '');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Vui lòng chọn số sao đánh giá.');
      return;
    }
    if (comment.trim() === '') {
      setError('Vui lòng nhập nội dung đánh giá.');
      return;
    }
    if (comment.trim().length > 1000) {
      setError('Nội dung đánh giá tối đa 1000 ký tự.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const { body } = await apiJson(`/api/products/${productId}/evaluations`, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId ?? null,
          userName: name.trim(),
          rating,
          comment: comment.trim(),
        }),
      });
      if (body?.success) {
        setSuccess(body.message);
        setRating(0);
        setComment('');
        onSubmitted();
      } else {
        setError(body?.message ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.');
      }
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const shownRating = hoverRating || rating;

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <h5 className="section-title" style={{ margin: '0 0 12px' }}>
        Viết đánh giá của bạn
      </h5>
      <form data-testid="review-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }} role="radiogroup" aria-label="Chọn số sao">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              data-testid={`review-star-${n}`}
              aria-label={`Chọn ${n} sao`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                lineHeight: 0,
              }}
            >
              <Star size={26} fill={n <= shownRating ? '#f5a623' : 'none'} color="#f5a623" />
            </button>
          ))}
        </div>
        <input
          type="text"
          className="input"
          data-testid="review-name-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Tên của bạn (không bắt buộc)"
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <textarea
          className="input"
          data-testid="review-comment-input"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 4 }}
        />
        <div className="mono" style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10 }}>
          {comment.length}/1000
        </div>
        {error && (
          <p className="field-error" data-testid="review-error-msg" style={{ margin: '0 0 10px' }}>
            {error}
          </p>
        )}
        {success && (
          <p data-testid="review-success-msg" style={{ color: 'var(--ok)', fontSize: '0.95rem', margin: '0 0 10px' }}>
            {success}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="review-submit-btn"
          disabled={submitting}
          style={{ opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
        </button>
      </form>
    </div>
  );
};
