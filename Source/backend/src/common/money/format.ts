// G-01: integer đồng shown as "2.984.000 đ".
export const formatMoney = (n: number): string => `${n.toLocaleString('vi-VN')} đ`;
