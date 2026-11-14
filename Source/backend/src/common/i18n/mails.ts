import type { Lang } from './locale.js';

type MailText = { subject: string; text: string };
export function selectMail(lang: Lang, english: MailText, vietnamese: MailText): MailText {
  return lang === 'en' && english.subject.trim() && english.text.trim() ? english : vietnamese;
}

export const MAILS = {
  verifyCode(lang: Lang, code: string) {
    return selectMail(lang, {
      subject: 'Email verification code - Trọ Thông Minh',
      text: `Your verification code: ${code}\nThe code is valid for 5 minutes. If you did not request it, please ignore this email.`,
    }, {
      subject: 'Mã xác minh email – Trọ Thông Minh',
      text: `Mã xác minh của bạn: ${code}\nMã có hiệu lực 5 phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.`,
    });
  },
  resetLink(lang: Lang, url: string) {
    return selectMail(lang, {
      subject: 'Reset your password – Trọ Thông Minh',
      text: `Click the following link to reset your password (valid for 30 minutes):\n${url}\n\nIf you did not request it, please ignore this email.`,
    }, {
      subject: 'Đặt lại mật khẩu – Trọ Thông Minh',
      text: `Bấm vào liên kết sau để đặt lại mật khẩu (có hiệu lực 30 phút):\n${url}\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.`,
    });
  },
};
