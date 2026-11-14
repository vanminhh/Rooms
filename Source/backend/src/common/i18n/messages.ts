import { ERRORS, ErrorCode } from '../errors/error-code.js';
import type { Lang } from './locale.js';

export const ERRORS_EN: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Invalid input',
  UNAUTHENTICATED: 'Please sign in to continue',
  PASSWORD_CHANGE_REQUIRED: 'Please change your password to continue',
  FORBIDDEN: 'You do not have permission to perform this action',
  OUT_OF_SCOPE: 'This data is outside your access scope',
  NOT_FOUND: 'Data not found',
  CONFLICT_STATE: 'This action is not available in the current state',
  TOO_MANY_REQUESTS: 'Too many attempts. Please try again later',
  PHONE_TAKEN: 'This phone number is already in use',
  EMAIL_TAKEN: 'This email is already used by another account',
  EMAIL_NOT_VERIFIED: 'Your email has not been verified',
  OTP_INVALID: 'The verification code is incorrect or has expired',
  MAIL_UNAVAILABLE: 'Unable to send the email. Please try again later',
  MANAGER_MAX_2_BUILDINGS: 'A manager can manage at most 2 buildings',
  ROOM_NOT_AVAILABLE: 'This room is no longer available',
  CONTRACT_TERM_TOO_SHORT: 'The minimum contract term is 3 months',
  DEPOSIT_NOT_PAID: 'The deposit invoice has not been paid',
  INVOICE_NOT_UNPAID: 'The invoice is not awaiting payment',
  PAYMENT_AMOUNT_MISMATCH: 'The payment amount does not match the invoice total',
  METER_VALUE_DECREASED: 'The new meter reading is lower than the previous reading',
  PRICE_NOT_APPROVED: 'This room does not have an approved price',
  PRICE_PROPOSAL_EXPIRED: 'The proposed effective date has passed. Please submit a new proposal',
  RATE_PLAN_MISSING: 'There is no approved rate for this period',
  PENDING_REQUEST_EXISTS: 'There is already a pending request',
  WEBHOOK_SIGNATURE_INVALID: 'Invalid webhook signature',
  INVALID_CREDENTIALS: 'Incorrect phone number or password',
  ACCOUNT_LOCKED: 'Your account is locked. Please contact the manager.',
  UPLOAD_NOT_CONFIGURED: 'Image uploads have not been configured',
  INTERNAL_ERROR: 'Something went wrong. Please try again later',
};

export const FIELDS_EN: Record<string, string> = {
  'Trường này không được phép gửi lên': 'This field is not allowed',
  'Trang không hợp lệ': 'Invalid page',
  'Số dòng mỗi trang phải từ 1 đến 100': 'The number of rows per page must be between 1 and 100',
  'Số điện thoại không hợp lệ': 'Invalid phone number',
  'Email không hợp lệ': 'Invalid email address',
  'Đường dẫn không hợp lệ': 'Invalid URL',
  'Ngôn ngữ không hợp lệ': 'Invalid language',
  'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn': 'The password reset link is invalid or has expired',
  'Vui lòng nhập mật khẩu': 'Please enter your password',
  'Giá trị ghi nhớ đăng nhập không hợp lệ': 'Invalid remember me value',
  'Vui lòng nhập mật khẩu hiện tại': 'Please enter your current password',
  'Mật khẩu tối thiểu 8 ký tự': 'Password must be at least 8 characters',
  'Vui lòng nhập họ và tên': 'Please enter your full name',
  'Mã xác minh gồm 6 chữ số': 'The verification code must contain 6 digits',
  'Họ và tên tối đa 100 ký tự': 'Full name must be at most 100 characters',
  'Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu': 'This phone number already has an account. Please sign in or use Forgot password',
  'Email đã được dùng cho tài khoản khác': 'This email is already used by another account',
  'Email đã được sử dụng': 'This email is already in use',
  'Mật khẩu hiện tại không đúng': 'The current password is incorrect',
  'Mật khẩu mới phải khác mật khẩu hiện tại': 'The new password must differ from the current password',
  'Giá trị bộ lọc không hợp lệ': 'Invalid filter value',
  'Mã không hợp lệ': 'Invalid ID',
  'Quận/huyện không hợp lệ': 'Invalid district',
  'Phường/xã không hợp lệ': 'Invalid ward',
  'Mã tòa không hợp lệ': 'Invalid building ID',
  'Giá tối thiểu không hợp lệ': 'Invalid minimum price',
  'Giá tối đa không hợp lệ': 'Invalid maximum price',
  'Thứ tự sắp xếp không hợp lệ': 'Invalid sort order',
  'Diện tích tối thiểu không hợp lệ': 'Invalid minimum area',
  'Diện tích tối đa không hợp lệ': 'Invalid maximum area',
  'Số người không hợp lệ': 'Invalid number of occupants',
  'Tầng không hợp lệ': 'Invalid floor',
  'Tiện ích không có trong danh mục': 'The amenity is not in the catalog',
  'Loại phòng không hợp lệ': 'Invalid room type',
};

export function errorMessage(code: ErrorCode, lang: Lang): string {
  return (lang === 'en' && ERRORS_EN[code]) || ERRORS[code].message;
}

export function translateField(text: string, lang: Lang): string {
  return (lang === 'en' && Object.hasOwn(FIELDS_EN, text) && FIELDS_EN[text]) || text;
}

export const ESTIMATE_EN = {
  rent: 'Rent',
  waterPerPerson: 'Water (1 person)',
  meteredNote: 'excludes electricity and water billed by room meter readings',
  missing: (name: string) => `excludes: ${name} (no rate available)`,
};
