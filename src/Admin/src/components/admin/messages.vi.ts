/**
 * messages.vi — Chữ tiếng Việt duy nhất cho toàn bộ admin DAFL (đợt 18).
 *
 * NGUỒN: ~/workspace/dot18/messages-spec.md — mọi chuỗi chép NGUYÊN VĂN từ
 * spec đó, không tự bịa. Chuỗi validate giữ nguyên chuỗi VCB đang có trong
 * code (formUtils.ts: REQUIRED_MSG / EMAIL_FORMAT_MSG / PHONE_FORMAT_MSG
 * và các chuỗi "Mã ... đã tồn tại.").
 *
 * QUY TẮC VIẾT (spec §7): lịch sự, ngắn, câu đầy đủ kết thúc bằng dấu chấm,
 * KHÔNG dấu chấm than, KHÔNG viết hoa toàn bộ, LUÔN nêu đích danh bản ghi
 * (tên/mã/email), tiêu đề toast ≤ 40 ký tự, mô tả ≤ 100 ký tự, tiêu đề popup
 * là câu hỏi ngắn kết thúc bằng "?", KHÔNG dùng thuật ngữ kỹ thuật (API,
 * endpoint, null, exception, mã HTTP). Động từ thống nhất: "Thêm" (riêng
 * khuyến mãi dùng "Đã tạo khuyến mãi"), "Xóa", "Cập nhật", "Khóa / Mở khóa",
 * "Ẩn / Hiển thị".
 *
 * CÁCH DÙNG:
 *   import { messages, fmt, httpErrorMessage, shortName } from './messages.vi';
 *   import { notify } from './notify';
 *   notify.success(
 *     messages.toast.product.added.title,
 *     fmt(messages.toast.product.added.desc, { tên: shortName(product.name) }),
 *   );
 *   // Lỗi HTTP: notifyHttpError(status, body?.message) — xem notify.ts.
 *   // Popup: message trong messages.confirm.* giữ dấu **...** để in đậm
 *   // phần tên/mã — render bằng boldParts() rồi map sang <strong>.
 */

export type ToastMessage = { title: string; desc: string };
export type ConfirmMessage = { title: string; message: string; confirmText: string };

export const messages = {
  toast: {
    product: {
      added: {
        title: 'Đã thêm sản phẩm',
        desc: "Sản phẩm '{tên}' đã được thêm vào danh sách.",
      },
      updated: {
        title: 'Đã cập nhật sản phẩm',
        desc: "Thay đổi của '{tên}' đã được lưu.",
      },
      deleted: {
        title: 'Đã xóa sản phẩm',
        desc: "Sản phẩm '{tên}' đã được xóa khỏi danh sách.",
      },
      hidden: {
        title: 'Đã ẩn sản phẩm',
        desc: "'{tên}' sẽ không hiển thị trên cửa hàng.",
      },
      shown: {
        title: 'Đã hiển thị sản phẩm',
        desc: "'{tên}' đã hiển thị trở lại trên cửa hàng.",
      },
      /** Đợt 21 (22:37) — toast chung khi gạt Toggle SP: đúng chữ Matthew viết (có "!"). */
      statusChanged: {
        title: 'Đổi trạng thái sản phẩm thành công!',
        desc: "Sản phẩm '{tên}' đã được cập nhật trạng thái.",
      },
      /** Đợt 24/25/26 — form SP dùng chung một toast thành công, không nêu
       *  tên SP (added/updated cũ giữ lại để tương thích). */
      saved: {
        title: 'Đã lưu sản phẩm',
        desc: 'Sản phẩm đã được lưu.',
      },
      duplicateName: {
        title: 'Tên sản phẩm đã tồn tại',
        desc: 'Vui lòng dùng tên khác.',
      },
      outOfStock: {
        title: 'Sản phẩm đã hết hàng',
        desc: "'{tên}' sẽ hiển thị là Hết hàng.",
      },
    },
    category: {
      added: {
        title: 'Đã thêm danh mục',
        desc: "Danh mục '{tên}' đã được tạo.",
      },
      updated: {
        title: 'Đã cập nhật danh mục',
        desc: "Thay đổi của '{tên}' đã được lưu.",
      },
      deleted: {
        title: 'Đã xóa danh mục',
        desc: "Danh mục '{tên}' đã được xóa.",
      },
      /** "'{tên}' {sẽ không hiển thị | đã hiển thị} trên cửa hàng." — caller
       *  truyền params { 'sẽ không hiển thị | đã hiển thị': 'sẽ không hiển thị' }
       *  hoặc dùng thẳng hidden.desc / shown.desc đã tách sẵn dưới đây. */
      hidden: {
        title: 'Đã ẩn danh mục',
        desc: "'{tên}' sẽ không hiển thị trên cửa hàng.",
      },
      shown: {
        title: 'Đã hiển thị danh mục',
        desc: "'{tên}' đã hiển thị trên cửa hàng.",
      },
      /** Đợt 21 (22:37) — toast chung khi gạt Toggle DM (có "!"). */
      statusChanged: {
        title: 'Đổi trạng thái danh mục thành công!',
        desc: "Danh mục '{tên}' đã được cập nhật trạng thái.",
      },
      deleteBlocked: {
        title: 'Không thể xóa danh mục',
        desc: "Danh mục '{tên}' đang có {n} sản phẩm. Hãy chuyển hoặc xóa các sản phẩm trước.",
      },
      duplicateSlug: {
        title: 'Đường dẫn đã tồn tại',
        desc: 'Vui lòng đổi tên hoặc chỉnh lại slug.',
      },
    },
    promo: {
      added: {
        title: 'Đã tạo khuyến mãi',
        desc: 'Thêm khuyến mãi {mã} thành công.',
      },
      updated: {
        title: 'Đã cập nhật khuyến mãi',
        desc: 'Cập nhật khuyến mãi {mã} thành công.',
      },
      enabled: {
        title: 'Đã bật khuyến mãi',
        desc: 'Đã bật khuyến mãi {mã} thành công.',
      },
      disabled: {
        title: 'Đã tắt khuyến mãi',
        desc: 'Đã tắt khuyến mãi {mã} thành công.',
      },
      /** Đợt 21 (22:37) — toast chung khi gạt Toggle KM (có "!"); thay cho
       *  enabled/disabled ở toggle. Các key enabled/disabled cũ giữ lại. */
      statusChanged: {
        title: 'Đổi trạng thái khuyến mãi thành công!',
        desc: 'Khuyến mãi {mã} đã được cập nhật trạng thái.',
      },
      deleted: {
        title: 'Đã xóa khuyến mãi',
        desc: 'Xóa khuyến mãi {mã} thành công.',
      },
      deleteBlocked: {
        title: 'Không thể xóa khuyến mãi',
        desc: "Mã '{mã}' đã có {n} lượt sử dụng. Bạn có thể tắt khuyến mãi thay vì xóa.",
      },
      duplicateCode: {
        title: 'Mã khuyến mãi đã tồn tại',
        desc: 'Vui lòng nhập mã khác.',
      },
      expired: {
        title: 'Khuyến mãi đã hết hạn',
        desc: "Mã '{mã}' hết hạn ngày {ngày}.",
      },
    },
    customer: {
      updated: {
        title: 'Đã cập nhật khách hàng',
        desc: 'Thông tin của {tên} đã được lưu.',
      },
      locked: {
        title: 'Đã khóa tài khoản',
        desc: 'Tài khoản {email} không thể đăng nhập cho đến khi được mở khóa.',
      },
      unlocked: {
        title: 'Đã mở khóa tài khoản',
        desc: 'Tài khoản {email} có thể đăng nhập trở lại.',
      },
      deleted: {
        title: 'Đã xóa tài khoản',
        desc: 'Tài khoản {email} đã được chuyển sang trạng thái đã xóa.',
      },
      duplicateEmail: {
        title: 'Email đã tồn tại',
        desc: 'Thông tin này đang thuộc về tài khoản khác.',
      },
      duplicatePhone: {
        title: 'Số điện thoại đã tồn tại',
        desc: 'Thông tin này đang thuộc về tài khoản khác.',
      },
    },
    order: {
      statusChanged: {
        title: 'Đã cập nhật đơn hàng',
        desc: "Đơn {mã đơn} chuyển sang '{trạng thái}'.",
      },
      cancelled: {
        title: 'Đã hủy đơn hàng',
        desc: 'Đơn {mã đơn} đã được hủy.',
      },
      cancelInvalid: {
        title: 'Không thể hủy đơn hàng',
        desc: "Đơn {mã đơn} đang ở trạng thái '{trạng thái}' nên không thể hủy.",
      },
    },
    review: {
      hidden: {
        title: 'Đã ẩn đánh giá',
        desc: 'Đánh giá của {tên khách} sẽ không hiển thị trên cửa hàng.',
      },
      shown: {
        title: 'Đã hiển thị đánh giá',
        desc: 'Đánh giá của {tên khách} đã hiển thị trở lại.',
      },
      deleted: {
        title: 'Đã xóa đánh giá',
        desc: 'Đánh giá của {tên khách} đã được xóa.',
      },
    },
    membership: {
      configSaved: {
        title: 'Đã lưu cấu hình hạng',
        desc: 'Thay đổi chỉ áp dụng cho đơn hàng phát sinh sau thời điểm này.',
      },
      thresholdOrder: {
        title: 'Không thể lưu cấu hình',
        desc: 'Ngưỡng chi tiêu phải tăng dần theo thứ tự Thường, Bạc, Vàng, Kim cương.',
      },
      /** "{cộng | trừ} {n} điểm cho {email}. Số dư mới: {m} điểm." — caller
       *  truyền params { 'cộng | trừ': 'Cộng' } hoặc { 'cộng | trừ': 'Trừ' }. */
      pointsAdjusted: {
        title: 'Đã điều chỉnh điểm',
        desc: '{cộng | trừ} {n} điểm cho {email}. Số dư mới: {m} điểm.',
      },
      customerNotFound: {
        title: 'Không tìm thấy khách hàng',
        desc: 'Vui lòng kiểm tra lại email hoặc ID.',
      },
      overBalance: {
        title: 'Không thể trừ điểm',
        desc: 'Khách hàng chỉ còn {m} điểm.',
      },
    },
    returns: {
      approved: {
        title: 'Đã duyệt yêu cầu trả hàng',
        desc: 'Yêu cầu của đơn {mã đơn} đã được chấp nhận.',
      },
      rejected: {
        title: 'Đã từ chối yêu cầu trả hàng',
        desc: 'Yêu cầu của đơn {mã đơn} đã bị từ chối.',
      },
    },
    upload: {
      unsupportedFormat: {
        title: 'Định dạng ảnh không hỗ trợ',
        desc: 'Chỉ chấp nhận PNG, JPG hoặc WEBP.',
      },
      tooLarge: {
        title: 'Ảnh quá lớn',
        desc: "Mỗi ảnh tối đa 5MB. Ảnh '{tên file}' có dung lượng {x}MB.",
      },
      tooMany: {
        title: 'Đã đạt số ảnh tối đa',
        desc: 'Mỗi sản phẩm tối đa {n} ảnh.',
      },
      failed: {
        title: 'Tải ảnh thất bại',
        desc: "Không thể tải '{tên file}' lên. Vui lòng thử lại.",
      },
    },
    /** Đợt 24/25/26 — toast khi bấm Lưu mà form còn lỗi validate (hiện kèm
     *  lỗi đỏ dưới từng ô + focus ô lỗi đầu). */
    form: {
      invalid: {
        title: 'Vui lòng kiểm tra lại các trường bắt buộc',
        desc: 'Một số trường chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu.',
      },
    },
  },

  /** Lỗi hệ thống (§4) — KHÔNG bao giờ hiện mã HTTP, tên endpoint hay
   *  chữ kỹ thuật thô trong giao diện. */
  http: {
    offline: {
      title: 'Mất kết nối',
      desc: 'Vui lòng kiểm tra mạng và thử lại.',
    },
    invalid: {
      title: 'Dữ liệu chưa hợp lệ',
      desc: 'Vui lòng kiểm tra lại các trường được đánh dấu.',
    },
    unauthorized: {
      title: 'Phiên đăng nhập đã hết hạn',
      desc: 'Vui lòng đăng nhập lại để tiếp tục.',
    },
    forbidden: {
      title: 'Bạn không có quyền thực hiện',
      desc: 'Vui lòng liên hệ quản trị viên cấp cao.',
    },
    notFound: {
      title: 'Không tìm thấy dữ liệu',
      desc: 'Bản ghi có thể đã bị xóa. Danh sách sẽ được làm mới.',
    },
    conflict: {
      title: 'Dữ liệu đã thay đổi',
      desc: 'Có người khác vừa cập nhật bản ghi này. Vui lòng tải lại trang.',
    },
    tooLarge: {
      title: 'Tệp quá lớn',
      desc: 'Vui lòng chọn tệp nhỏ hơn 5MB.',
    },
    tooMany: {
      title: 'Thao tác quá nhanh',
      desc: 'Vui lòng chờ vài giây rồi thử lại.',
    },
    server: {
      title: 'Hệ thống đang gặp sự cố',
      desc: 'Chúng tôi chưa thể xử lý yêu cầu. Vui lòng thử lại sau.',
    },
    unknown: {
      title: 'Đã xảy ra lỗi',
      desc: 'Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy liên hệ bộ phận kỹ thuật.',
    },
  },

  /** Popup xác nhận (§6 + spec A–H đợt 18, 17:42 — GHI ĐÈ §6 ở chỗ khác):
   *  Mặc định ĐÚNG 2 nút [Hủy] trái + [Xác nhận cụ thể] phải. Ngoại lệ theo
   *  spec mới: A3 chặn xóa DM và G4 phiên hết hạn CHỈ 1 nút (xem singleButton
   *  trong ConfirmDialog); A5/C5/G5 có nút trái [Đóng]; D1 nút trái
   *  [Giữ đơn hàng]; G1 nút trái [Ở lại]; G6 nút trái [Giữ bản của tôi].
   *  Các mục có ghi "chưa gắn API" là popup đã định nghĩa chuỗi nhưng CHƯA
   *  nối hành động vì BE không có endpoint — KHÔNG bịa API (xem báo cáo đợt 18).
   *  Dấu **...** trong message = phần in đậm (tên/mã) — render bằng
   *  boldParts() (ConfirmDialog tự làm việc này khi nhận message dạng string). */
  confirm: {
    deleteProduct: {
      title: 'Xóa sản phẩm?',
      message:
        'Bạn sắp xóa sản phẩm **{tên}**. Sản phẩm sẽ không còn hiển thị trên cửa hàng. Hành động này không thể hoàn tác.',
      confirmText: 'Xóa sản phẩm',
    },
    deleteCategory: {
      title: 'Xóa danh mục?',
      message: 'Bạn sắp xóa danh mục **{tên}**. Hành động này không thể hoàn tác.',
      confirmText: 'Xóa danh mục',
    },
    /** A3 — CHẶN xóa DM đang có SP: tiêu đề khẳng định (KHÔNG "?"), CHỈ 1 nút
     *  [Đã hiểu] (singleButton) + link "Xem sản phẩm trong danh mục". */
    deleteCategoryBlocked: {
      title: 'Không thể xóa danh mục',
      message: 'Danh mục **{tên}** đang có {n} sản phẩm. Hãy chuyển hoặc xóa các sản phẩm trước.',
      confirmText: 'Đã hiểu',
    },
    deletePromo: {
      title: 'Xóa khuyến mãi?',
      message:
        'Bạn sắp xóa mã **{mã}**. Khách hàng sẽ không thể sử dụng mã này nữa. Hành động này không thể hoàn tác.',
      confirmText: 'Xóa khuyến mãi',
    },
    /** A5 — CHẶN xóa KM đã dùng: [Đóng] + [Tắt khuyến mãi] (nút phải mở C3).
     *  BE chỉ cho xóa voucher Draft chưa có lượt dùng (DeletePromotionCommand). */
    deletePromoBlocked: {
      title: 'Không thể xóa khuyến mãi',
      message: 'Mã **{mã}** đã có {n} lượt sử dụng. Bạn có thể tắt khuyến mãi thay vì xóa.',
      confirmText: 'Tắt khuyến mãi',
    },
    deleteReview: {
      title: 'Xóa đánh giá?',
      message:
        'Bạn sắp xóa đánh giá của **{tên khách}** cho sản phẩm **{tên sản phẩm}**. Hành động này không thể hoàn tác.',
      confirmText: 'Xóa đánh giá',
    },
    deleteCustomer: {
      title: 'Xóa tài khoản?',
      message:
        'Bạn sắp xóa tài khoản **{tên}** ({email}). Tài khoản sẽ được chuyển sang trạng thái đã xóa và khách hàng không thể đăng nhập.',
      confirmText: 'Xóa tài khoản',
    },
    lockCustomer: {
      title: 'Khóa tài khoản?',
      message:
        'Bạn sắp khóa tài khoản **{tên}** ({email}). Khách hàng sẽ không thể đăng nhập hoặc đặt hàng cho đến khi được mở khóa.',
      confirmText: 'Khóa tài khoản',
    },
    unlockCustomer: {
      title: 'Mở khóa tài khoản?',
      message: 'Tài khoản **{tên}** ({email}) sẽ có thể đăng nhập và đặt hàng trở lại.',
      confirmText: 'Mở khóa',
    },
    /** Đợt 21 (22:37) — modal xác nhận CHUNG cho mọi Toggle trạng thái (SP/DM/KM),
     *  thay nội dung C1/C2/C3/C4/C6/C7 cũ ở các toggle. {loại} = 'sản phẩm' |
     *  'danh mục' | 'khuyến mãi'; {tên} = tên/mã bản ghi. Các key C1..C7 cũ giữ
     *  lại (không xóa) vì có thể còn dùng ở chỗ khác ngoài toggle. */
    statusChange: {
      title: 'Xác nhận thay đổi trạng thái?',
      message: 'Bạn có chắc chắn muốn thay đổi trạng thái của {loại} **{tên}** không?',
      confirmText: 'Xác nhận',
    },
    hideProduct: {
      title: 'Ẩn sản phẩm?',
      message: '**{tên}** sẽ không hiển thị trên cửa hàng nhưng vẫn được giữ trong danh sách quản lý.',
      confirmText: 'Ẩn sản phẩm',
    },
    showProduct: {
      title: 'Hiển thị sản phẩm?',
      message: '**{tên}** sẽ hiển thị trở lại trên cửa hàng.',
      confirmText: 'Hiển thị',
    },
    hideCategory: {
      title: 'Ẩn danh mục?',
      message: 'Danh mục **{tên}** và {n} sản phẩm bên trong sẽ không hiển thị trên cửa hàng.',
      confirmText: 'Ẩn danh mục',
    },
    /** C7 — hiện DM (trước đây viết inline trong AdminPage, đã đưa về đây). */
    showCategory: {
      title: 'Hiển thị danh mục?',
      message: 'Danh mục **{tên}** sẽ hiển thị trở lại trên cửa hàng.',
      confirmText: 'Hiển thị',
    },
    disablePromo: {
      title: 'Tắt khuyến mãi?',
      message: "Mã **{mã}** sẽ không thể sử dụng cho đến khi được bật lại.",
      confirmText: 'Tắt khuyến mãi',
    },
    enablePromo: {
      title: 'Bật khuyến mãi?',
      /** "{, đến hết ngày dd/mm/yyyy}" là hậu tố tùy chọn: caller fmt với
       *  params { ', đến hết ngày dd/mm/yyyy': ', đến hết ngày 31/12/2026' }
       *  khi có ngày hết hạn, hoặc bỏ trống chuỗi đó khi không có. */
      message: "Mã **{mã}** sẽ có thể sử dụng trở lại{, đến hết ngày dd/mm/yyyy}.",
      confirmText: 'Bật khuyến mãi',
    },
    /** C5 — CHẶN bật KM đã hết hạn: [Đóng] + [Chỉnh sửa khuyến mãi] (nút phải
     *  mở form sửa KM). BE cũng chặn (ActivatePromotionCommand từ chối Expired). */
    enablePromoBlocked: {
      title: 'Khuyến mãi đã hết hạn',
      message: 'Mã **{mã}** hết hạn ngày {ngày}. Bạn có thể chỉnh sửa ngày hết hạn rồi bật lại.',
      confirmText: 'Chỉnh sửa khuyến mãi',
    },
    hideReview: {
      title: 'Ẩn đánh giá?',
      message: 'Đánh giá của **{tên khách}** sẽ không hiển thị trên cửa hàng.',
      confirmText: 'Ẩn đánh giá',
    },
    /** C8/C9 — CHƯA GẮN API: entity Evaluation KHÔNG có cờ ẩn/hiện, BE chỉ có
     *  DELETE /api/admin/evaluations/{id}. Chuỗi định nghĩa sẵn, chưa nối nút nào. */
    showReview: {
      title: 'Hiển thị đánh giá?',
      message: 'Đánh giá của **{tên khách}** sẽ hiển thị trở lại trên cửa hàng.',
      confirmText: 'Hiển thị',
    },
    cancelOrder: {
      title: 'Hủy đơn hàng?',
      message:
        'Bạn sắp hủy đơn **{mã đơn}** của **{tên khách}** ({tổng tiền}). Khách hàng sẽ nhận được thông báo hủy đơn.',
      confirmText: 'Hủy đơn hàng',
    },
    changeOrderStatus: {
      title: 'Cập nhật trạng thái?',
      message: 'Đơn **{mã đơn}** sẽ chuyển từ **{trạng thái cũ}** sang **{trạng thái mới}**.',
      confirmText: 'Cập nhật',
    },
    /** D2 — xác nhận đơn (Chờ xử lý → Đã xác nhận, theo nhãn thật trong code;
     *  spec ghi "Chờ xác nhận → Đang xử lý" nhưng ORDER_STATUS_LABELS dùng
     *  "Chờ xử lý"/"Đã xác nhận"). Dùng chung template với changeOrderStatus. */
    confirmOrder: {
      title: 'Xác nhận đơn?',
      message: 'Đơn **{mã đơn}** sẽ chuyển từ **{trạng thái cũ}** sang **{trạng thái mới}**.',
      confirmText: 'Xác nhận đơn',
    },
    /** D4 — CHƯA GẮN API: không có endpoint xác nhận đã thu tiền COD
     *  (không có cờ/endpoint thu tiền COD; máy trạng thái đơn cũng không có
     *  đích nào cho "đã thu tiền" sau Delivered). Chuỗi định nghĩa sẵn. */
    collectCod: {
      title: 'Xác nhận đã thu tiền?',
      message: 'Đơn **{mã đơn}** ({tổng tiền}) sẽ được ghi nhận là đã thu tiền mặt khi giao hàng.',
      confirmText: 'Xác nhận đã thu',
    },
    approveReturn: {
      title: 'Duyệt yêu cầu trả hàng?',
      message: 'Bạn sắp chấp nhận yêu cầu trả hàng **{tên sản phẩm} × {n}** của đơn **{mã đơn}**.',
      confirmText: 'Duyệt yêu cầu',
    },
    /** E3 — CHƯA GẮN API: ReturnRequest không có cờ "đã nhận hàng trả",
     *  BE chỉ có POST /api/admin/returns/{id}/resolve (duyệt/từ chối) và
     *  POST /api/admin/refunds/{id}/record (ghi nhận đã hoàn tiền).
     *  Chuỗi định nghĩa sẵn. */
    receiveReturn: {
      title: 'Xác nhận đã nhận hàng trả?',
      message: 'Bạn sắp xác nhận đã nhận lại sản phẩm **{tên sản phẩm} × {n}** của đơn **{mã đơn}**.',
      confirmText: 'Xác nhận đã nhận',
    },
    rejectReturn: {
      title: 'Từ chối yêu cầu trả hàng?',
      message:
        'Bạn sắp từ chối yêu cầu trả hàng của đơn **{mã đơn}**. Khách hàng sẽ nhận được lý do từ chối.',
      confirmText: 'Từ chối yêu cầu',
    },
    saveMembershipConfig: {
      title: 'Lưu cấu hình hạng?',
      message:
        'Thay đổi chỉ áp dụng cho đơn hàng phát sinh sau thời điểm lưu, không ảnh hưởng đơn đã tạo.',
      confirmText: 'Lưu cấu hình',
    },
    adjustPoints: {
      title: 'Xác nhận điều chỉnh điểm?',
      message:
        'Bạn sắp **{cộng | trừ} {n} điểm** cho **{email}**. Số dư sau điều chỉnh: **{m} điểm**. Lý do: {lý do}.',
      confirmText: 'Xác nhận điều chỉnh',
    },
    /** F2/F3 — spec A–H tách cộng/trừ thành 2 popup riêng (tiêu đề + nút riêng).
     *  adjustPoints ở trên giữ lại để tương thích, caller mới dùng 2 mục này. */
    addPoints: {
      title: 'Xác nhận cộng điểm?',
      message:
        'Bạn sắp **cộng {n} điểm** cho **{email}**. Số dư sau điều chỉnh: **{m} điểm**. Lý do: {lý do}.',
      confirmText: 'Xác nhận cộng điểm',
    },
    subtractPoints: {
      title: 'Xác nhận trừ điểm?',
      message:
        'Bạn sắp **trừ {n} điểm** cho **{email}**. Số dư sau điều chỉnh: **{m} điểm**. Lý do: {lý do}.',
      confirmText: 'Xác nhận trừ điểm',
    },
    discardForm: {
      title: 'Hủy các thay đổi?',
      message: 'Các thay đổi bạn vừa nhập sẽ bị mất.',
      confirmText: 'Rời trang',
    },
    /** G3 — đăng xuất (nút trong menu tài khoản, AdminPage). */
    logout: {
      title: 'Đăng xuất?',
      message: 'Bạn sắp đăng xuất khỏi tài khoản **{tên}**. Bạn sẽ cần đăng nhập lại để tiếp tục quản lý.',
      confirmText: 'Đăng xuất',
    },
    /** G4 — phiên hết hạn: tiêu đề khẳng định (KHÔNG "?"), CHỈ 1 nút
     *  [Đăng nhập lại], KHÔNG đóng được (singleButton + nonDismissable). */
    sessionExpired: {
      title: 'Phiên đăng nhập đã hết hạn',
      message: 'Vui lòng đăng nhập lại để tiếp tục.',
      confirmText: 'Đăng nhập lại',
    },
    /** G5 — mất mạng khi lưu: [Đóng] + [Thử lại]. Chỉ hiện khi fetch NÉM lỗi
     *  (mất mạng/timeout), không dùng cho lỗi validate hay lỗi server. */
    offlineRetry: {
      title: 'Mất kết nối?',
      message: 'Không thể lưu thay đổi vì mất kết nối mạng. Vui lòng kiểm tra mạng rồi thử lại.',
      confirmText: 'Thử lại',
    },
    /** G6 — CHƯA NỐI ĐƯỢC: BE không có versioning/409 cho bản ghi admin
     *  (chỉ Product có xmin RowVersion ở PostgreSQL, không có luồng If-Match
     *  hay 409 ở admin). Chuỗi định nghĩa sẵn, chưa nối vào đâu. */
    dataChanged: {
      title: 'Dữ liệu đã thay đổi?',
      message: 'Có người khác vừa cập nhật bản ghi này. Bạn có thể giữ bản của mình hoặc tải lại dữ liệu mới nhất.',
      confirmText: 'Tải lại dữ liệu',
    },
    /** H2 — CHƯA NỐI ĐƯỢC: không có UI chọn nhiều (checkbox) và không có
     *  endpoint xóa hàng loạt ở BE. Chỉ cần tiêu đề, không liệt kê tên từng
     *  bản ghi. Chuỗi định nghĩa sẵn ({loại}: sản phẩm/danh mục/khuyến mãi/đánh giá). */
    deleteBulk: {
      title: 'Xóa {n} {loại}?',
      message: 'Bạn sắp xóa {n} {loại} đã chọn. Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
    },
  } satisfies Record<string, ConfirmMessage>,

  /** Validate (§9) — chuỗi VCB đang có trong code làm chuẩn, giữ nguyên
   *  văn bản. Các mẫu có {tên trường} dùng fmt(..., { 'tên trường': 'Tên sản phẩm' }). */
  validate: {
    required: 'Vui lòng bổ sung thông tin bắt buộc.',
    emailFormat: 'Email không đúng định dạng.',
    phoneFormat: 'Số điện thoại không đúng định dạng.',
    duplicateProductCode: 'Mã sản phẩm đã tồn tại.',
    duplicateCategoryCode: 'Mã danh mục đã tồn tại.',
    duplicateCustomerCode: 'Mã khách hàng đã tồn tại.',
    duplicatePromoCode: 'Mã khuyến mãi đã tồn tại (không phân biệt hoa thường).',
    enterField: 'Vui lòng nhập {tên trường}.',
    selectField: 'Vui lòng chọn {tên trường}.',
    emailInvalid: 'Email không hợp lệ.',
    phoneInvalid: 'Số điện thoại không hợp lệ.',
    duplicateField: '{tên trường} đã tồn tại.',
    lockReasonEmpty: 'Vui lòng nhập lý do khóa.',
    /** Nhãn ô lý do khóa (B1, spec A–H — có dấu * vì bắt buộc) + nhãn ô gõ XOA (A7). */
    lockReasonLabel: 'Lý do khóa *',
    typeToConfirmLabel: 'Nhập XOA để xác nhận',
    cancelOrderReasonEmpty: 'Vui lòng nhập lý do hủy đơn.',
    rejectReturnReasonEmpty: 'Vui lòng nhập lý do từ chối.',
    /** Dòng đỏ dưới nút xác nhận của mọi popup xóa (không hoàn tác). */
    irreversible: 'Hành động này không thể hoàn tác.',
  },
} as const;

/**
 * Thay mọi placeholder {khóa} trong template bằng giá trị tương ứng trong
 * params. Placeholder nào không có trong params được giữ nguyên văn
 * (dùng cho các lựa chọn "A | B" trong spec, vd {cộng | trừ} — caller
 * truyền params { 'cộng | trừ': 'Cộng' } khi muốn chốt một phía).
 */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (whole, rawKey: string) => {
    const key = rawKey.trim();
    const value = params[key];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * Rút gọn tên hiển thị trong toast/popup: tối đa 40 ký tự + "..." (spec §7).
 */
export function shortName(name: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}

/**
 * Tách chuỗi có dấu **...** thành các đoạn { text, bold } để render
 * <strong> cho phần in đậm trong message popup.
 */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  const parts: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

/**
 * Map mã HTTP → cặp { title, desc } theo bảng §4. KHÔNG bao giờ trả về
 * mã HTTP hay tên kỹ thuật trong title/desc.
 *
 * - status 0 / undefined (mất mạng, timeout, fetch throw) → "Mất kết nối".
 * - 401 → "Phiên đăng nhập đã hết hạn": CALLER tự chuyển về trang đăng
 *   nhập sau 3 giây (xem notifyHttpError / ghi chú trong notify.ts).
 * - Nếu API trả message nghiệp vụ tiếng Việt (vd "Mã sản phẩm đã tồn tại.")
 *   thì ưu tiên message đó ở phần MÔ TẢ, giữ nguyên tiêu đề đã map theo
 *   status. Message chứa chữ kỹ thuật thô (api, endpoint, null, exception,
 *   stack, 500...) hoặc quá dài (> 200 ký tự) thì BỎ, dùng desc mặc định.
 */
export function httpErrorMessage(status?: number, apiMessage?: string): ToastMessage {
  let base: ToastMessage;
  switch (status) {
    case 0:
    case undefined:
      base = messages.http.offline;
      break;
    case 400:
    case 422:
      base = messages.http.invalid;
      break;
    case 401:
      base = messages.http.unauthorized;
      break;
    case 403:
      base = messages.http.forbidden;
      break;
    case 404:
      base = messages.http.notFound;
      break;
    case 409:
      base = messages.http.conflict;
      break;
    case 413:
      base = messages.http.tooLarge;
      break;
    case 429:
      base = messages.http.tooMany;
      break;
    case 500:
    case 502:
    case 503:
      base = messages.http.server;
      break;
    default:
      base = messages.http.unknown;
      break;
  }
  const api = (apiMessage ?? '').trim();
  const looksTechnical = /api|endpoint|null|exception|stack|undefined|http\s*\/|status\s*code|500|404|401|403/i.test(api);
  if (api && api.length <= 200 && !looksTechnical) return { title: base.title, desc: api };
  return { title: base.title, desc: base.desc };
}
