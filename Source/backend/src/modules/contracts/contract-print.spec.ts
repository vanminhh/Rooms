import { InternalServerErrorException } from '@nestjs/common';
import { renderContractPrint, type ContractPrintValues } from './contract-print.js';

const DRAFT_LABEL = 'BẢN NHÁP – chưa dùng để ký'; // CON-22 / Q-15.
const values: ContractPrintValues = {
  'contract.code': 'HD000042', 'contract.startDate': '31/01/2027', 'contract.endDate': '29/04/2027',
  'contract.termMonths': '3', 'contract.rent': '2.500.000 đ', 'contract.deposit': '2.500.000 đ',
  'contract.terms': 'Giữ yên tĩnh sau 22 giờ',
  'building.name': 'Tòa Cầu Giấy', 'building.code': 'CG01', 'building.address': '12 Phố A',
  'building.ward': 'Dịch Vọng', 'building.district': 'Cầu Giấy', 'room.code': 'P301',
  'tenant.fullName': 'Nguyễn Văn An', 'tenant.phone': '0900000004', 'tenant.dateOfBirth': '02/01/1995',
  'tenant.idNumberLast4': '6789',
};

function expectInvalid(setting: unknown) {
  try {
    renderContractPrint(setting, values);
    expect.unreachable('Invalid template must fail');
  } catch (error) {
    expect(error).toBeInstanceOf(InternalServerErrorException);
    const exception = error as InternalServerErrorException;
    expect(exception.getStatus()).toBe(500);
    expect(exception.getResponse()).toMatchObject({ message: 'INTERNAL_ERROR' });
  }
}

describe('CON-22 / D-36 / Q-15: plain-text contract template rendering', () => {
  it.each([undefined, null])('Q-15: missing setting %j uses the default draft and fills safe contract values', setting => {
    const result = renderContractPrint(setting, values);
    expect(result.isDraft).toBe(true);
    expect(result.content.startsWith(DRAFT_LABEL)).toBe(true);
    for (const text of ['HD000042', 'Nguyễn Văn An', 'P301', '2.500.000 đ', '31/01/2027', '29/04/2027', '6789']) {
      expect(result.content).toContain(text);
    }
    expect(result.content).not.toContain('{{');
  });

  it('Q-15: a legacy text setting is always marked draft', () => {
    expect(renderContractPrint('Hợp đồng {{contract.code}}: {{tenant.fullName}}', values)).toEqual({
      content: `${DRAFT_LABEL}\n\nHợp đồng HD000042: Nguyễn Văn An`, isDraft: true,
    });
  });

  it('CON-22: an explicitly approved object produces the filled text without a draft marker', () => {
    expect(renderContractPrint({ content: '{{contract.code}} / {{room.code}} / {{contract.rent}}', isDraft: false }, values))
      .toEqual({ content: 'HD000042 / P301 / 2.500.000 đ', isDraft: false });
  });

  it('Q-15: an explicit draft object retains the draft label exactly once', () => {
    const result = renderContractPrint({ content: `${DRAFT_LABEL}\n{{contract.code}}`, isDraft: true }, values);
    expect(result).toEqual({ content: `${DRAFT_LABEL}\nHD000042`, isDraft: true });
    expect(result.content.split(DRAFT_LABEL)).toHaveLength(2);
  });

  it('CON-22: whitespace around a known placeholder is accepted', () => {
    expect(renderContractPrint({ content: '{{ tenant.fullName }} — {{ contract.endDate }}', isDraft: false }, values))
      .toEqual({ content: 'Nguyễn Văn An — 29/04/2027', isDraft: false });
  });

  it('CON-22: inserted values stay literal through one substitution pass, including dollar replacement patterns', () => {
    const literal = "{{room.code}} $& $` $' $$";
    const input = { ...values, 'tenant.fullName': literal, 'contract.terms': '{{tenant.passwordHash}}' };
    expect(renderContractPrint({ content: '{{tenant.fullName}} | {{room.code}} | {{contract.terms}}', isDraft: false }, input))
      .toEqual({ content: `${literal} | P301 | {{tenant.passwordHash}}`, isDraft: false });
  });

  it('CON-22: script-like plain text remains data rather than executable template code', () => {
    const content = '<script>globalThis.secret = "changed";</script> {{contract.code}}';
    expect(renderContractPrint({ content, isDraft: false }, values))
      .toEqual({ content: '<script>globalThis.secret = "changed";</script> HD000042', isDraft: false });
  });

  it.each([
    '{{tenant.passwordHash}}', '{{tenant.idNumberEnc}}', '{{tenant.idNumber}}',
    '{{__proto__}}', '{{constructor}}', '{{tenant.constructor}}', '{{process.env}}',
    "{{constructor.constructor('return process')()}}",
  ])('CON-22: unknown or prototype/expression placeholder %s is rejected with a constant error', template => {
    expectInvalid({ content: template, isDraft: false });
  });

  it.each([
    '{{contract.code', 'contract.code}}', '{{{{contract.code}}}}', '{{}}', '{{ }}', '{{tenant.{{room.code}}}}',
    '{{{contract.code}}}', '{{{contract.code}}', '{{contract.code}}}',
  ])('CON-22: malformed braces %s are rejected', template => {
    expectInvalid({ content: template, isDraft: false });
  });

  it.each([
    '', ' \n\t ', 'NUL\0template', false, 0, [], ['{{contract.code}}'],
    {}, { content: '{{contract.code}}' }, { isDraft: false },
    { content: 3, isDraft: false }, { content: '{{contract.code}}', isDraft: 'false' },
    { content: null, isDraft: true },
  ])('CON-22: malformed setting %j is rejected rather than silently approved', setting => {
    expectInvalid(setting);
  });
});
