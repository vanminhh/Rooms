import { BadRequestException } from '@nestjs/common';
import { parseDateOnly } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';

export const VIEWING_FIELDS = {
  overlap: 'Khách đã có lịch xem ở tòa khác vào cùng giờ. Bạn có muốn tiếp tục?',
  overlapDistrict: 'Khách đã có lịch xem ở tòa thuộc quận khác vào cùng giờ. Vui lòng cân nhắc thời gian di chuyển trước khi tiếp tục.',
  tenantEmail: 'Vui lòng thêm email trong tài khoản trước khi đặt lịch',
  range: 'Khoảng ngày tối đa 31 ngày và ngày kết thúc không trước ngày bắt đầu',
  cancellation: 'Cần ghi chú khi hủy lịch hẹn',
  outcome: 'Cần ghi kết quả khi đánh dấu không thành',
};

export function viewingFieldError(field: string, message: string): never {
  throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: message } });
}

export function viewingFilterDate(value: string, field: 'from' | 'to'): Date {
  const date = parseDateOnly(value);
  if (!date) viewingFieldError(field, 'Ngày lọc không hợp lệ');
  return date;
}
