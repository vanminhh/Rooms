globalThis.RoomsColorCore = (() => {
  const fonts = [
    { id: 'manrope', label: 'Manrope · Không chân', family: '"Manrope", Arial, sans-serif' },
    { id: 'taviraj', label: 'Taviraj · Có chân', family: '"Taviraj", Georgia, serif' },
    { id: 'arial', label: 'Arial', family: 'Arial, sans-serif' },
    { id: 'segoe', label: 'Segoe UI', family: '"Segoe UI", Arial, sans-serif' },
    { id: 'georgia', label: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
    { id: 'times', label: 'Times New Roman', family: '"Times New Roman", serif' },
    { id: 'system', label: 'Phông hệ thống', family: 'system-ui, sans-serif' },
  ];
  const validSize = value => typeof value === 'number' && Number.isFinite(value) && value >= 8 && value <= 160;
  function pickTarget(target, groups, mode = 'color') {
    const group = groups.slice(1).find(group => target.closest(group.selector));
    if (!group) return null;
    const hit = group.fields.filter(field => ['color', 'background-color'].includes(field.property))
      .map(field => ({ field, element: target.closest(field.selector) }))
      .filter(item => item.element)
      .reduce((best, item) => !best || best.element.contains(item.element) ? item : best, null);
    const field = hit?.field || group.fields[0];
    return { group, field, element: hit?.element || target.closest(group.selector),
      mode: mode === 'type' && group.textFields.some(item => item.id === field.id) ? 'type' : 'color' };
  }
  function textDeclarations(value = {}) {
    const rules = [];
    if (validSize(value.size)) rules.push(`font-size: ${value.size}px`);
    const font = fonts.find(font => font.id === value.font);
    if (font) rules.push(`font-family: ${font.family}`);
    return rules;
  }
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
  function css(overrides, groups, typography = {}) {
    const chunks = [];
    for (const group of groups) for (const field of group.fields) {
      const value = normalizeHex(overrides[field.id]);
      if (!value) continue;
      const shadow = field.shadow ? `\n  box-shadow: ${field.shadow.replaceAll('VALUE', value)} !important;` : '';
      chunks.push(`/* ${group.name} — ${field.label}\n   ${field.source} */\n${field.selector} {\n  ${field.property}: ${value} !important;${shadow}\n}`);
    }
    for (const group of groups) for (const field of group.textFields || []) {
      const rules = textDeclarations(typography[field.id]);
      if (rules.length) chunks.push(`/* ${group.name} — ${field.label} · Kiểu chữ\n   ${field.source} */\n${field.selector} {\n  ${rules.join(' !important;\n  ')} !important;\n}`);
    }
    return chunks.length ? `/* ROOMS — màu và kiểu chữ đã chọn. Nạp sau CSS gốc. */\n\n${chunks.join('\n\n')}\n` : '/* Chưa có thay đổi. Chọn một phần và chỉnh màu hoặc chữ bên phải. */';
  }
  function instructions(overrides, groups, typography = {}) {
    const lines = ['Áp dụng các màu và kiểu chữ sau vào Rooms. Giữ các phần không được liệt kê.'];
    for (const group of groups) for (const field of group.fields) {
      const value = normalizeHex(overrides[field.id]);
      if (value) lines.push(`${group.name} / ${field.label}: ${value}\n  File: ${field.source}\n  Selector: ${field.selector}\n  Thuộc tính: ${field.property}${field.shadow ? `\n  Đồng bộ box-shadow: ${field.shadow.replaceAll('VALUE', value)}` : ''}`);
    }
    for (const group of groups) for (const field of group.textFields || []) {
      const rules = textDeclarations(typography[field.id]);
      if (rules.length) lines.push(`${group.name} / ${field.label} · Kiểu chữ\n  File: ${field.source}\n  Selector: ${field.selector}\n  ${rules.join('\n  ')}`);
    }
    return lines.length > 1 ? lines.join('\n\n') : 'Chưa có thay đổi.';
  }
  function parsePreset(text, groups) {
    const input = JSON.parse(text);
    if (!input || ![1, 2].includes(input.version) || !input.colors || typeof input.colors !== 'object' || Array.isArray(input.colors)) throw new Error('File này không phải bộ chỉnh Rooms phiên bản 1 hoặc 2.');
    const ids = new Set(groups.flatMap(g => g.fields.map(f => f.id))), result = {};
    for (const [id, value] of Object.entries(input.colors)) {
      if (!ids.has(id) || !normalizeHex(value)) throw new Error(`Màu hoặc thành phần không hợp lệ: ${id}`);
      result[id] = normalizeHex(value);
    }
    const rawText = input.version === 2 && input.typography !== undefined ? input.typography : {};
    if (!rawText || typeof rawText !== 'object' || Array.isArray(rawText)) throw new Error('Dữ liệu kiểu chữ không hợp lệ.');
    const textIds = new Set(groups.flatMap(group => (group.textFields || []).map(field => field.id))), typography = {};
    for (const [id, value] of Object.entries(rawText)) {
      if (!textIds.has(id) || !value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !['size', 'font'].includes(key))
        || ('size' in value && !validSize(value.size))
        || ('font' in value && !fonts.some(font => font.id === value.font))) throw new Error(`Kiểu chữ không hợp lệ: ${id}`);
      if (Object.keys(value).length) typography[id] = { ...value };
    }
    return { colors: result, typography };
  }
  return { fonts, validSize, pickTarget, normalizeHex, rgba, toHex, fromCss, hexToHsl, hslToHex, composite, contrast, css, instructions, parsePreset };
})();
