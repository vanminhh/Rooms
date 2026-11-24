import { ConflictException } from '@nestjs/common';
import { ErrorCode } from './error-code.js';

export class SignedRenewalConflict extends ConflictException {
  readonly publicMessage = 'Hợp đồng đã có gia hạn, hãy hủy gia hạn trước';

  constructor() {
    super(ErrorCode.CONFLICT_STATE);
  }
}
