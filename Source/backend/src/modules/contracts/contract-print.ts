import { InternalServerErrorException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';

export const CONTRACT_DRAFT_LABEL = 'BẢN NHÁP – chưa dùng để ký';
export const DRAFT_CONTRACT_TEMPLATE = `${CONTRACT_DRAFT_LABEL}

THÔNG TIN HỢP ĐỒNG {{contract.code}}
Tòa nhà: {{building.name}} ({{building.code}})
Địa chỉ: {{building.address}}, {{building.ward}}, {{building.district}}
Phòng: {{room.code}}
Người thuê: {{tenant.fullName}}
Số điện thoại: {{tenant.phone}}
Ngày sinh: {{tenant.dateOfBirth}}
CCCD (4 số cuối): {{tenant.idNumberLast4}}
Từ ngày {{contract.startDate}} đến ngày {{contract.endDate}}
Thời hạn: {{contract.termMonths}} tháng
Tiền phòng: {{contract.rent}}
Tiền cọc: {{contract.deposit}}
Ghi chú/thỏa thuận: {{contract.terms}}
`;

export const CONTRACT_PRINT_KEYS = [
  'contract.code', 'contract.startDate', 'contract.endDate', 'contract.termMonths',
  'contract.rent', 'contract.deposit', 'contract.terms',
  'building.name', 'building.code', 'building.address', 'building.ward', 'building.district',
  'room.code', 'tenant.fullName', 'tenant.phone', 'tenant.dateOfBirth', 'tenant.idNumberLast4',
] as const;
export type ContractPrintValues = Record<(typeof CONTRACT_PRINT_KEYS)[number], string>;
const invalidTemplate = () => new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);

// CON-22: plain text, one substitution pass; no evaluation or recursive expansion.
export function renderContractPrint(setting: unknown, values: ContractPrintValues) {
  let template: string;
  let isDraft: boolean;
  if (setting === undefined || setting === null) {
    template = DRAFT_CONTRACT_TEMPLATE;
    isDraft = true;
  } else if (typeof setting === 'string') {
    template = setting;
    isDraft = true;
  } else if (typeof setting === 'object' && !Array.isArray(setting) &&
      'content' in setting && typeof setting.content === 'string' &&
      'isDraft' in setting && typeof setting.isDraft === 'boolean') {
    template = setting.content;
    isDraft = setting.isDraft;
  } else throw invalidTemplate();
  if (!template.trim() || template.includes('\0') || template.includes('{{{') || template.includes('}}}')) {
    throw invalidTemplate();
  }
  const placeholder = /{{\s*([^{}]*?)\s*}}/g;
  const remainder = template.replace(placeholder, (_whole, raw: string) => {
    if (!Object.hasOwn(values, raw.trim())) throw invalidTemplate();
    return '';
  });
  if (remainder.includes('{{') || remainder.includes('}}')) throw invalidTemplate();
  let content = template.replace(placeholder, (_whole, raw: string) => values[raw.trim() as keyof ContractPrintValues]);
  if (isDraft && !content.startsWith(CONTRACT_DRAFT_LABEL)) content = `${CONTRACT_DRAFT_LABEL}\n\n${content}`;
  return { content, isDraft };
}
