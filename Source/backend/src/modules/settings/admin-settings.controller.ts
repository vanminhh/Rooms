import { BadRequestException, Body, Controller, Get, Header, Ip, Patch } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsDefined, IsIn } from 'class-validator';
import { ErrorCode } from '../../common/errors/error-code.js';
import { CurrentUser, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CONTRACT_PRINT_KEYS, DRAFT_CONTRACT_TEMPLATE, renderContractPrint, type ContractPrintValues } from '../contracts/contract-print.js';
import { validEmailTemplates } from '../mailer/email-templates.js';

const writable = ['bank_account', 'default_contact', 'contract_template', 'email_templates'] as const;
type Key = typeof writable[number];
class SettingUpdate {
  @IsIn(writable) key: Key;
  @IsDefined() value: unknown;
}
const invalid = () => new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { value: 'Giá trị cài đặt không hợp lệ' } });
const templateValues = Object.fromEntries(CONTRACT_PRINT_KEYS.map(key => [key, ''])) as ContractPrintValues;

function readableSetting(key: Key, value: unknown) {
  if (key === 'contract_template') {
    try {
      renderContractPrint(value, templateValues);
      if (typeof value === 'string') return { content: value, isDraft: true };
      if (value && typeof value === 'object' && 'content' in value && 'isDraft' in value) return { content: value.content, isDraft: value.isDraft };
    } catch { /* Recover from invalid historical configuration in the editor. */ }
    return { content: DRAFT_CONTRACT_TEMPLATE, isDraft: true };
  }
  const data = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
  if (key === 'email_templates') {
    return Object.fromEntries(data.flatMap(([kind, translations]) => {
      if (!translations || typeof translations !== 'object') return [];
      const locales = Object.entries(translations).filter(([lang, template]) => validEmailTemplates({ [kind]: { [lang]: template } }));
      return locales.length ? [[kind, Object.fromEntries(locales)]] : [];
    }));
  }
  if (!value) return null;
  const fields = key === 'bank_account' ? ['bankBin', 'bankName', 'accountNo', 'accountName'] : ['phone', 'zaloUrl', 'facebookUrl'];
  return Object.fromEntries(data.filter(([name, v]) => fields.includes(name) && (typeof v === 'string' || v === null)));
}

function validContactUrl(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}

export function settingValue(key: Key, value: unknown): Prisma.InputJsonValue {
  if (key === 'contract_template' && typeof value === 'string') value = { content: value, isDraft: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  const only = (...allowed: string[]) => Object.keys(data).every(k => allowed.includes(k));
  switch (key) {
    case 'bank_account':
      if (!only('bankBin','bankName','accountNo','accountName') || typeof data.bankBin !== 'string' || !/^\d{6}$/.test(data.bankBin)
        || typeof data.accountNo !== 'string' || !/^[a-zA-Z0-9]{1,30}$/.test(data.accountNo)
        || typeof data.bankName !== 'string' || !data.bankName.trim() || typeof data.accountName !== 'string' || !data.accountName.trim()) throw invalid();
      break;
    case 'default_contact':
      if (!only('phone','zaloUrl','facebookUrl') || (data.phone != null && (typeof data.phone !== 'string' || !/^0\d{9}$/.test(data.phone)))
        || !validContactUrl(data.zaloUrl) || !validContactUrl(data.facebookUrl)) throw invalid();
      break;
    case 'email_templates':
      if (!validEmailTemplates(data)) throw invalid();
      break;
    case 'contract_template':
      if (!only('content','isDraft') || data.isDraft !== true) throw invalid();
      try { renderContractPrint(data, templateValues); } catch { throw invalid(); }
      break;
  }
  return data as Prisma.InputJsonObject;
}

@Controller('settings')
@Roles('BOSS')
export class AdminSettingsController {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list() {
    const rows = await this.db.setting.findMany({ where: { key: { in: [...writable] } }, select: { key: true, value: true } });
    const values = new Map(rows.map(row => [row.key, row.value]));
    const view = Object.fromEntries(writable.map(key => [key, readableSetting(key, values.get(key))]));
    return { ...view, webhook: { provider: 'SEPAY', enabled: !!process.env.BANK_WEBHOOK_SECRET?.trim() } };
  }

  @Patch()
  async update(@CurrentUser() actor: AuthUser, @Body() dto: SettingUpdate, @Ip() ip: string) {
    const value = settingValue(dto.key, dto.value);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('rooms.settings'), hashtext(${dto.key}))`;
      const old = await tx.setting.findUnique({ where: { key: dto.key }, select: { value: true } });
      await tx.setting.upsert({ where: { key: dto.key }, create: { key: dto.key, value, updatedById: actor.id }, update: { value, updatedById: actor.id } });
      await this.audit.log(actor.id, 'settings.change', 'setting', 0, { key: dto.key, value: old ? readableSetting(dto.key, old.value) as Prisma.InputJsonValue : null },
        { key: dto.key, value }, ip, tx);
      return { key: dto.key, value };
    });
  }
}
