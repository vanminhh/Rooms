// Error codes of 01-architecture#error-codes, plus INVALID_CREDENTIALS (AUTH-01),
// ACCOUNT_LOCKED (AUTH-02) and INTERNAL_ERROR (API-04, 500).
export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT_STATE = 'CONFLICT_STATE',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  PHONE_TAKEN = 'PHONE_TAKEN',
  MANAGER_MAX_2_BUILDINGS = 'MANAGER_MAX_2_BUILDINGS',
  ROOM_NOT_AVAILABLE = 'ROOM_NOT_AVAILABLE',
  CONTRACT_TERM_TOO_SHORT = 'CONTRACT_TERM_TOO_SHORT',
  DEPOSIT_NOT_PAID = 'DEPOSIT_NOT_PAID',
  INVOICE_NOT_UNPAID = 'INVOICE_NOT_UNPAID',
  PAYMENT_AMOUNT_MISMATCH = 'PAYMENT_AMOUNT_MISMATCH',
  METER_VALUE_DECREASED = 'METER_VALUE_DECREASED',
  PRICE_NOT_APPROVED = 'PRICE_NOT_APPROVED',
  RATE_PLAN_MISSING = 'RATE_PLAN_MISSING',
  PENDING_REQUEST_EXISTS = 'PENDING_REQUEST_EXISTS',
  WEBHOOK_SIGNATURE_INVALID = 'WEBHOOK_SIGNATURE_INVALID',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// [ASSUMPTION] wording outside AUTH-01/AUTH-02 is proposed; the owner may edit it.
export const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  [ErrorCode.VALIDATION_FAILED]: { status: 400, message: 'Dữ liệu không hợp lệ' },
  [ErrorCode.UNAUTHENTICATED]: { status: 401, message: 'Bạn cần đăng nhập để tiếp tục' },
  [ErrorCode.PASSWORD_CHANGE_REQUIRED]: {
    status: 403,
    message: 'Bạn cần đổi mật khẩu trước khi tiếp tục',
  },
  [ErrorCode.FORBIDDEN]: { status: 403, message: 'Bạn không có quyền thực hiện thao tác này' },
  [ErrorCode.OUT_OF_SCOPE]: { status: 403, message: 'Dữ liệu này nằm ngoài phạm vi của bạn' },
  [ErrorCode.NOT_FOUND]: { status: 404, message: 'Không tìm thấy dữ liệu' },
  [ErrorCode.CONFLICT_STATE]: {
    status: 409,
    message: 'Thao tác không hợp lệ ở trạng thái hiện tại',
  },
  [ErrorCode.TOO_MANY_REQUESTS]: {
    status: 429,
    message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau',
  },
  [ErrorCode.PHONE_TAKEN]: { status: 409, message: 'Số điện thoại đã được sử dụng' },
  [ErrorCode.MANAGER_MAX_2_BUILDINGS]: {
    status: 409,
    message: 'Mỗi quản lý chỉ phụ trách tối đa 2 tòa',
  },
  [ErrorCode.ROOM_NOT_AVAILABLE]: { status: 409, message: 'Phòng không còn trống' },
  [ErrorCode.CONTRACT_TERM_TOO_SHORT]: {
    status: 400,
    message: 'Thời hạn hợp đồng tối thiểu 3 tháng',
  },
  [ErrorCode.DEPOSIT_NOT_PAID]: { status: 409, message: 'Hóa đơn cọc chưa được thanh toán' },
  [ErrorCode.INVOICE_NOT_UNPAID]: {
    status: 409,
    message: 'Hóa đơn không ở trạng thái chờ thanh toán',
  },
  [ErrorCode.PAYMENT_AMOUNT_MISMATCH]: {
    status: 409,
    message: 'Số tiền thanh toán không khớp tổng hóa đơn',
  },
  [ErrorCode.METER_VALUE_DECREASED]: {
    status: 400,
    message: 'Chỉ số mới nhỏ hơn chỉ số trước',
  },
  [ErrorCode.PRICE_NOT_APPROVED]: { status: 409, message: 'Phòng chưa có giá được duyệt' },
  [ErrorCode.RATE_PLAN_MISSING]: {
    status: 409,
    message: 'Chưa có đơn giá được duyệt cho kỳ này',
  },
  [ErrorCode.PENDING_REQUEST_EXISTS]: {
    status: 409,
    message: 'Đã có yêu cầu đang chờ xử lý',
  },
  [ErrorCode.WEBHOOK_SIGNATURE_INVALID]: {
    status: 401,
    message: 'Chữ ký webhook không hợp lệ',
  },
  [ErrorCode.INVALID_CREDENTIALS]: {
    status: 401,
    message: 'Số điện thoại hoặc mật khẩu không đúng',
  },
  [ErrorCode.ACCOUNT_LOCKED]: { status: 403, message: 'Tài khoản đã bị khóa. Liên hệ quản lý.' },
  [ErrorCode.INTERNAL_ERROR]: {
    status: 500,
    message: 'Có lỗi xảy ra, vui lòng thử lại sau',
  },
};
