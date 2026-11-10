import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm } from '../components/product/ReviewForm';

function mockReviewFetch(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response)
  );
}

function renderForm(props: Partial<{ userId: string | null; defaultName: string }> = {}) {
  const onSubmitted = vi.fn();
  render(
    <ReviewForm
      productId="prod-1"
      userId={props.userId ?? null}
      defaultName={props.defaultName ?? ''}
      onSubmitted={onSubmitted}
    />
  );
  return { onSubmitted };
}

function fillValidReview() {
  fireEvent.click(screen.getByTestId('review-star-5'));
  fireEvent.change(screen.getByTestId('review-comment-input'), {
    target: { value: 'Son đẹp, màu chuẩn, giao hàng nhanh.' },
  });
}

describe('ReviewForm — đợt 15 phần 1: gửi đánh giá sản phẩm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it('render đủ 5 nút sao, ô tên, ô bình luận và nút gửi; tên điền sẵn defaultName', () => {
    renderForm({ defaultName: 'Thủy Linh' });

    expect(screen.getByTestId('review-form')).toBeInTheDocument();
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByTestId(`review-star-${n}`)).toHaveAttribute('aria-label', `Chọn ${n} sao`);
    }
    expect(screen.getByTestId('review-name-input')).toHaveValue('Thủy Linh');
    expect(screen.getByTestId('review-comment-input')).toHaveAttribute(
      'placeholder',
      'Chia sẻ trải nghiệm của bạn về sản phẩm...'
    );
    expect(screen.getByTestId('review-submit-btn')).toHaveTextContent('Gửi đánh giá');
  });

  it('validation: chưa chọn sao → báo lỗi chọn sao', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('review-comment-input'), {
      target: { value: 'Sản phẩm tốt.' },
    });
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    expect(screen.getByTestId('review-error-msg')).toHaveTextContent(
      'Vui lòng chọn số sao đánh giá.'
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('validation: đã chọn sao nhưng bình luận rỗng → báo lỗi nhập nội dung', () => {
    renderForm();
    fireEvent.click(screen.getByTestId('review-star-4'));
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    expect(screen.getByTestId('review-error-msg')).toHaveTextContent(
      'Vui lòng nhập nội dung đánh giá.'
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('validation: bình luận quá 1000 ký tự → báo lỗi giới hạn', () => {
    renderForm();
    fireEvent.click(screen.getByTestId('review-star-5'));
    fireEvent.change(screen.getByTestId('review-comment-input'), {
      target: { value: 'x'.repeat(1001) },
    });
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    expect(screen.getByTestId('review-error-msg')).toHaveTextContent(
      'Nội dung đánh giá tối đa 1000 ký tự.'
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('gửi thành công: hiện đúng câu BE, xóa form, gọi onSubmitted, POST đúng URL/body', async () => {
    mockReviewFetch({
      success: true,
      message: 'Cảm ơn bạn đã gửi đánh giá cho sản phẩm!',
      data: { id: 'ev-1' },
    });
    const { onSubmitted } = renderForm({ userId: 'user-1', defaultName: 'Thủy Linh' });
    fireEvent.change(screen.getByTestId('review-name-input'), {
      target: { value: 'Thủy Linh' },
    });
    fillValidReview();
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('review-success-msg')).toHaveTextContent(
        'Cảm ơn bạn đã gửi đánh giá cho sản phẩm!'
      );
    });
    // Form đã xóa: sao về 0, bình luận rỗng (tên giữ lại).
    expect(screen.getByTestId('review-comment-input')).toHaveValue('');
    expect(screen.getByTestId('review-star-5')).toHaveAttribute('aria-pressed', 'false');
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    // POST đúng URL + body.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/products/prod-1/evaluations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      userId: 'user-1',
      userName: 'Thủy Linh',
      rating: 5,
      comment: 'Son đẹp, màu chuẩn, giao hàng nhanh.',
    });
  });

  it('gửi thành công khi khách vãng lai: userId null, userName rỗng', async () => {
    mockReviewFetch({ success: true, message: 'Cảm ơn bạn đã gửi đánh giá cho sản phẩm!', data: {} });
    renderForm();
    fillValidReview();
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('review-success-msg')).toBeInTheDocument();
    });
    const [, init] = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      userId: null,
      userName: '',
      rating: 5,
      comment: 'Son đẹp, màu chuẩn, giao hàng nhanh.',
    });
  });

  it('lỗi BE: hiện nguyên văn message trong review-error-msg', async () => {
    mockReviewFetch({ success: false, message: 'Không tìm thấy sản phẩm.', data: null }, 404);
    const { onSubmitted } = renderForm();
    fillValidReview();
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('review-error-msg')).toHaveTextContent('Không tìm thấy sản phẩm.');
    });
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.queryByTestId('review-success-msg')).not.toBeInTheDocument();
  });

  it('lỗi mạng: hiện thông báo không kết nối được máy chủ', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    renderForm();
    fillValidReview();
    fireEvent.click(screen.getByTestId('review-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('review-error-msg')).toHaveTextContent(
        'Không thể kết nối đến máy chủ. Vui lòng thử lại.'
      );
    });
  });
});
