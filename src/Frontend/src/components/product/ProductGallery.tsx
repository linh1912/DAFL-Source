import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IMAGE_PLACEHOLDER } from '../../utils/images';

export interface ProductGalleryProps {
  images: string[];
  alt: string;
}

const SWIPE_THRESHOLD_PX = 40;

export const ProductGallery: React.FC<ProductGalleryProps> = ({ images, alt }) => {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const touchStartX = useRef<number | null>(null);
  const count = images.length;

  // Đổi sản phẩm (danh sách ảnh khác) thì quay về ảnh đầu tiên
  const imagesKey = images.join('|');
  useEffect(() => {
    setIndex(0);
    setFailed(new Set());
  }, [imagesKey]);

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) go(delta < 0 ? index + 1 : index - 1);
  };

  const markFailed = (url: string) => setFailed(prev => new Set(prev).add(url));
  const srcOf = (url: string) => (failed.has(url) ? IMAGE_PLACEHOLDER : url);

  if (count === 0) {
    return <img src={IMAGE_PLACEHOLDER} alt={alt} className="product-detail-image" />;
  }

  return (
    <div
      className="product-gallery"
      data-testid="product-gallery"
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label={`Hình ảnh sản phẩm ${alt}`}
      onKeyDown={handleKeyDown}
    >
      <div
        className="product-gallery-stage"
        onTouchStart={e => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={images[index]}
          src={srcOf(images[index])}
          alt={`${alt} - ảnh ${index + 1}`}
          className="product-detail-image product-gallery-main"
          data-testid="product-gallery-main"
          onError={() => markFailed(images[index])}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              className="product-gallery-nav prev"
              aria-label="Ảnh trước"
              data-testid="product-gallery-prev"
              onClick={() => go(index - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="product-gallery-nav next"
              aria-label="Ảnh tiếp theo"
              data-testid="product-gallery-next"
              onClick={() => go(index + 1)}
            >
              <ChevronRight size={20} />
            </button>
            <span className="product-gallery-counter" data-testid="product-gallery-counter" aria-live="polite">
              {index + 1}/{count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="product-gallery-thumbs" role="tablist" aria-label="Chọn ảnh">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Xem ảnh ${i + 1}`}
              className={`product-gallery-thumb${i === index ? ' active' : ''}`}
              data-testid={`product-gallery-thumb-${i}`}
              onClick={() => go(i)}
            >
              <img src={srcOf(url)} alt="" loading="lazy" onError={() => markFailed(url)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
