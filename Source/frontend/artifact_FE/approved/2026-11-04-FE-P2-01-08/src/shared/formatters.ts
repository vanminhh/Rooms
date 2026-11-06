const moneyFormatter = new Intl.NumberFormat('vi-VN')

export function formatMoney(amount: number) {
  return Number.isSafeInteger(amount) ? `${moneyFormatter.format(amount)} đ` : '—'
}

// API business dates are YYYY-MM-DD (G-02). Slicing the string keeps the day as sent, so no timezone shift.
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(isoDate)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'
}
