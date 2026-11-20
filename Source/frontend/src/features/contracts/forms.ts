import { z } from 'zod'

export const createContractSchema = z.object({
  signer: z.object({
    fullName: z.string().trim().min(1, 'Vui lòng nhập họ và tên người ký').max(100, 'Họ và tên tối đa 100 ký tự'),
    phone: z.string().trim().regex(/^0[0-9]{9}$/, 'Số điện thoại không hợp lệ'),
    email: z.string().trim().refine(value => !value || z.email().safeParse(value).success, 'Email không hợp lệ'),
    dateOfBirth: z.string(),
    idNumber: z.string().regex(/^(?:[0-9]{12})?$/, 'Số CCCD phải gồm đúng 12 chữ số'),
  }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày vào ở không hợp lệ'),
  termMonths: z.number().int('Thời hạn phải là số tháng nguyên').min(3, 'Thời hạn tối thiểu 3 tháng'),
  deposit: z.number().int('Tiền cọc phải là số nguyên đồng').min(0, 'Tiền cọc không được âm').max(2147483647, 'Tiền cọc vượt giới hạn lưu trữ'),
  serviceIds: z.array(z.number().int().positive()),
  terms: z.string(),
})
export type CreateContractValues = z.infer<typeof createContractSchema>

// Staff pickers must not silently omit services/rooms beyond the first API page.
export async function allPages<T>(load: (page: number) => Promise<{ data: T[]; meta: { page: number; limit: number; total: number } }>): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; ; page++) {
    const result = await load(page)
    rows.push(...result.data)
    if (page * result.meta.limit >= result.meta.total || result.data.length === 0) return rows
  }
}
