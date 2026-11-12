import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../../../common/crypto/password.js';

// G-04: Vietnamese phone, 10 digits starting with 0.
const PHONE_RE = /^0[0-9]{9}$/;
const PHONE_MSG = 'Số điện thoại không hợp lệ';
const EMAIL_MSG = 'Email không hợp lệ';
const URL_MSG = 'Đường dẫn không hợp lệ';
// Shared with AuthService (wrong / used / expired token) so both paths show the same text.
export const RESET_LINK_MSG = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn';
const URL_OPTIONS = { protocols: ['https'], require_protocol: true };

// [ASSUMPTION] Vietnamese wording of the messages is proposed by the plan; the owner may edit it.
export class LoginDto {
  @Matches(PHONE_RE, { message: PHONE_MSG })
  phone: string;

  // No length check at login: only a new password is held to AUTH-03.
  @IsString({ message: 'Vui lòng nhập mật khẩu' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  password: string;

  @IsOptional()
  @IsBoolean({ message: 'Giá trị ghi nhớ đăng nhập không hợp lệ' })
  remember?: boolean;
}

export class ChangePasswordDto {
  @IsString({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  currentPassword: string;

  @IsString({ message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  newPassword: string;
}

const PASSWORD_MSG = `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`;
const NAME_MSG = 'Vui lòng nhập họ và tên';
const CODE_RE = /^[0-9]{6}$/;
const CODE_MSG = 'Mã xác minh gồm 6 chữ số';

// AUTH-11. Phone G-04, email required, password AUTH-03.
export class RegisterDto {
  @IsString({ message: NAME_MSG })
  @Matches(/\S/, { message: NAME_MSG })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  fullName: string;

  @Matches(PHONE_RE, { message: PHONE_MSG })
  phone: string;

  @IsEmail({}, { message: EMAIL_MSG })
  @MaxLength(255, { message: EMAIL_MSG })
  email: string;

  @IsString({ message: PASSWORD_MSG })
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MSG })
  password: string;
}

// AUTH-12, AUTH-13: the account is found by its phone; the code was mailed to its email.
export class VerifyEmailDto {
  @Matches(PHONE_RE, { message: PHONE_MSG })
  phone: string;

  @Matches(CODE_RE, { message: CODE_MSG })
  code: string;
}

export class ResendCodeDto {
  @Matches(PHONE_RE, { message: PHONE_MSG })
  phone: string;
}

export class ForgotPasswordDto {
  @Matches(PHONE_RE, { message: PHONE_MSG })
  phone: string;
}

export class ResetPasswordDto {
  @IsString({ message: RESET_LINK_MSG })
  @IsNotEmpty({ message: RESET_LINK_MSG })
  token: string;

  @IsString({ message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  newPassword: string;
}

// AUTH-09. `@IsOptional` also lets `null` through: null clears the field (Q5b).
export class UpdateMeDto {
  @IsOptional()
  @IsEmail({}, { message: EMAIL_MSG })
  @MaxLength(255, { message: EMAIL_MSG })
  email?: string | null;

  @IsOptional()
  @Matches(PHONE_RE, { message: PHONE_MSG })
  contactPhone?: string | null;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: URL_MSG })
  zaloUrl?: string | null;

  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: URL_MSG })
  facebookUrl?: string | null;
}
