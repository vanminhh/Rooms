const moneyFormatter = new Intl.NumberFormat('vi-VN')

export function formatMoney(amount: number) {
  return Number.isSafeInteger(amount) ? `${moneyFormatter.format(amount)} đ` : '—'
}
