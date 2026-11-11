export interface ProductSpecItem {
  label: string;
  value: string;
}

export interface ProductDetailExtra {
  highlights: string[];
  specs: ProductSpecItem[];
  detailedArticle: string[];
  features: { title: string; desc: string }[];
  usageGuide: string[];
  guarantees: { title: string; desc: string }[];
}

export function getProductDetailExtra(product: {
  id: string;
  name: string;
  categoryName: string;
  description: string;
  price: number;
  rating?: number;
  reviewCount?: number;
}): ProductDetailExtra {
  const cat = (product.categoryName || '').toLowerCase();
  const productIdStr = String(product.id || '');
  const sku = `DAFL-${productIdStr.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  // 1. Determine Specs by Category Category
  let specs: ProductSpecItem[] = [
    { label: 'Mã sản phẩm (SKU)', value: sku },
    { label: 'Danh mục', value: product.categoryName || 'Sản phẩm chọn lọc' },
    { label: 'Tình trạng', value: 'Mới 100% nguyên seal hộp' },
    { label: 'Thương hiệu', value: 'Chính hãng DAFL Mall' },
  ];

  if (cat.includes('mỹ phẩm') || cat.includes('làm đẹp') || cat.includes('sức khỏe') || cat.includes('mẹ và bé')) {
    specs.push(
      { label: 'Loại da / Đối tượng', value: 'Phù hợp mọi loại da, lành tính và an toàn sức khỏe' },
      { label: 'Xuất xứ kiểm định', value: 'Đầy đủ tem phụ và phiếu công bố tiêu chuẩn chất lượng' },
      { label: 'Hạn sử dụng', value: '36 tháng kể từ ngày sản xuất' },
      { label: 'Dung tích / Trọng lượng', value: 'Định lượng tiêu chuẩn nhà sản xuất' }
    );
  } else {
    specs.push(
      { label: 'Xuất xứ', value: 'Việt Nam / Nhập khẩu chính ngạch' },
      { label: 'Tiêu chuẩn chất lượng', value: 'Đạt chứng nhận kiểm định an toàn tiêu dùng' },
      { label: 'Hạn sử dụng', value: '36 tháng kể từ ngày sản xuất' },
      { label: 'Chính sách đổi trả', value: 'Hỗ trợ đổi trả miễn phí trong 30 ngày' }
    );
  }

  // 2. Highlights
  const highlights = [
    `Chính hãng 100%, đầy đủ tem phụ và phiếu công bố tiêu chuẩn chất lượng.`,
    product.description || 'Sản phẩm mỹ phẩm chính hãng, lành tính và an toàn cho người sử dụng.',
    `Đã qua quy trình kiểm định chất lượng nghiêm ngặt trước khi đóng gói xuất xưởng.`,
    `Đóng hộp carton chống sốc chuyên dụng, bảo vệ trọn vẹn sản phẩm khi vận chuyển toàn quốc.`
  ];

  // 3. Detailed Article
  const detailedArticle = [
    `${product.name || 'Sản phẩm'} là một trong những sản phẩm được nhiều khách hàng tin dùng trong nhóm ngành hàng ${product.categoryName || 'chọn lọc'}. Với công thức dịu nhẹ, sản phẩm dễ sử dụng hằng ngày và phù hợp với nhu cầu chăm sóc da, làm đẹp của bạn.`,
    product.description
      ? `Điểm nổi bật của sản phẩm nằm ở ${(product.description || '').toLowerCase()}. Sản phẩm được kiểm định chất lượng, an toàn và lành tính cho người sử dụng.`
      : `Sản phẩm được kiểm định chất lượng, an toàn và lành tính cho người sử dụng.`,
    `Mỗi sản phẩm khi giao đến tay khách hàng đều được kiểm tra kỹ lưỡng, nguyên seal 100%. Khách hàng được quyền mở hộp đồng kiểm trước khi thanh toán, đảm bảo an tâm tuyệt đối.`
  ];

  // 4. Feature Cards
  const features = [
    {
      title: 'Thành phần lành tính',
      desc: 'Công thức dịu nhẹ, an toàn cho da, phù hợp sử dụng hằng ngày.'
    },
    {
      title: 'Hiệu quả rõ rệt',
      desc: 'Cải thiện làn da sau thời gian sử dụng đều đặn theo hướng dẫn.'
    },
    {
      title: 'Đóng gói chuẩn e-Commerce',
      desc: 'Bọc bóng khí chống va đập nhiều lớp, hạn chế tối đa trầy xước trong quá trình giao vận.'
    },
    {
      title: 'Tem phụ đầy đủ',
      desc: 'Đầy đủ tem phụ tiếng Việt và phiếu công bố sản phẩm theo quy định.'
    }
  ];

  // 5. Usage & Maintenance Guide
  const usageGuide = [
    'Làm sạch da trước khi sử dụng sản phẩm.',
    'Lấy một lượng vừa đủ, thoa đều và massage nhẹ nhàng cho thẩm thấu.',
    'Sử dụng đều đặn mỗi ngày theo hướng dẫn trên bao bì.',
    'Bảo quản nơi khô ráo, thoáng mát, tránh ánh nắng trực tiếp.'
  ];

  // 6. Guarantees
  const guarantees = [
    {
      title: '100% Chính hãng',
      desc: 'Đền bù gấp 10 lần giá trị đơn hàng nếu phát hiện hàng giả, hàng nhái.'
    },
    {
      title: 'Đổi trả trong 30 ngày',
      desc: 'Miễn phí đổi sản phẩm mới ngay lập tức nếu xuất hiện lỗi từ nhà sản xuất.'
    },
    {
      title: 'Kiểm tra trước thanh toán',
      desc: 'Hỗ trợ đồng kiểm tận tay cùng nhân viên giao hàng, ưng ý mới thanh toán (COD).'
    },
    {
      title: 'Giao hàng hỏa tốc toàn quốc',
      desc: 'Đóng gói nhanh trong ngày, giao hỏa tốc 2h tại nội thành và 24-48h liên tỉnh.'
    }
  ];

  return {
    highlights,
    specs,
    detailedArticle,
    features,
    usageGuide,
    guarantees
  };
}
