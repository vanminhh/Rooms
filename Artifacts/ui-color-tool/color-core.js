globalThis.RoomsColorCore = (() => {
  const byte = value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    let hex = value.trim().toLowerCase().replace(/^#/, '');
    if (!/^(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(hex)) return null;
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    if (hex.length === 8 && hex.endsWith('ff')) hex = hex.slice(0, 6);
    return '#' + hex;
  }
  function rgba(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) throw new Error('Mã HEX không hợp lệ');
    const raw = normalized.slice(1);
    return [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16)).concat(raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1);
  }
  function toHex(r, g, b, a = 1) { return normalizeHex('#' + byte(r) + byte(g) + byte(b) + byte(a * 255)); }
  function fromCss(css) {
    const hex = normalizeHex(css);
    if (hex) return hex;
    if (css === 'transparent') return '#00000000';
    if (/^rgba?\(/.test(css)) {
      const values = css.match(/[\d.]+%?/g).map((v, i) => v.endsWith('%') ? parseFloat(v) * (i < 3 ? 2.55 : .01) : Number(v));
      return toHex(...values);
    }
    if (/^color\(srgb /.test(css)) {
      const values = css.match(/[\d.]+/g).map(Number);
      return toHex(values[0] * 255, values[1] * 255, values[2] * 255, values[3] ?? 1);
    }
    return null;
  }
  function hexToHsl(hex) {
    const [r0, g0, b0, a] = rgba(hex), r = r0 / 255, g = g0 / 255, b = b0 / 255;
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo, l = (hi + lo) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = hi === r ? ((g - b) / d + (g < b ? 6 : 0)) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100, a: a * 100 };
  }
  function hslToHex({ h, s, l, a = 100 }) {
    s /= 100; l /= 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const hue = ((h % 360) + 360) % 360 / 60, x = chroma * (1 - Math.abs(hue % 2 - 1)), m = l - chroma / 2;
    const parts = [[chroma,x,0], [x,chroma,0], [0,chroma,x], [0,x,chroma], [x,0,chroma], [chroma,0,x]][Math.floor(hue)];
    return toHex(...parts.map(v => (v + m) * 255), a / 100);
  }
  function composite(top, bottom) {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (!a) return [0, 0, 0, 0];
    return top.slice(0, 3).map((v, i) => (v * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
  }
  function contrast(foreground, background) {
    const bg = composite(rgba(background), [255,255,255,1]), fg = composite(rgba(foreground), bg);
    const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126,.7152,.0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
  }
  function css(overrides, groups) {
    const chunks = [];
    for (const group of groups) for (const field of group.fields) {
      const value = normalizeHex(overrides[field.id]);
      if (!value) continue;
      const shadow = field.shadow ? `\n  box-shadow: ${field.shadow.replaceAll('VALUE', value)} !important;` : '';
      chunks.push(`/* ${group.name} — ${field.label}\n   ${field.source} */\n${field.selector} {\n  ${field.property}: ${value} !important;${shadow}\n}`);
    }
    return chunks.length ? `/* ROOMS — màu đã chọn. Nạp sau CSS gốc. */\n\n${chunks.join('\n\n')}\n` : '/* Chưa thay màu. Chọn một phần và thử màu bên phải. */';
  }
  function instructions(overrides, groups) {
    const lines = ['Áp dụng các màu sau vào Rooms, giữ bố cục hiện tại.'];
    for (const group of groups) for (const field of group.fields) {
      const value = normalizeHex(overrides[field.id]);
      if (value) lines.push(`${group.name} / ${field.label}: ${value}\n  File: ${field.source}\n  Selector: ${field.selector}\n  Thuộc tính: ${field.property}${field.shadow ? `\n  Đồng bộ box-shadow: ${field.shadow.replaceAll('VALUE', value)}` : ''}`);
    }
    return lines.length > 1 ? lines.join('\n\n') : 'Chưa có thay đổi màu.';
  }
  function parsePreset(text, groups) {
    const input = JSON.parse(text);
    if (!input || input.version !== 1 || !input.colors || typeof input.colors !== 'object' || Array.isArray(input.colors)) throw new Error('File này không phải bảng màu Rooms phiên bản 1.');
    const ids = new Set(groups.flatMap(g => g.fields.map(f => f.id))), result = {};
    for (const [id, value] of Object.entries(input.colors)) {
      if (!ids.has(id) || !normalizeHex(value)) throw new Error(`Màu hoặc thành phần không hợp lệ: ${id}`);
      result[id] = normalizeHex(value);
    }
    return result;
  }
  return { normalizeHex, rgba, toHex, fromCss, hexToHsl, hslToHex, composite, contrast, css, instructions, parsePreset };
})();
