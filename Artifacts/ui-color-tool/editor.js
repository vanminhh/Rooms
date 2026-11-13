(() => {
  'use strict';
  const core = globalThis.RoomsColorCore, groups = globalThis.RoomsColorCatalog;
  const $ = id => document.getElementById(id);
  const storageKey = 'rooms-color-tool:v1';
  const frame = $('preview'), stage = $('preview-scroll'), canvas = $('canvas');
  let colors = {}, group = groups[0], field = group.fields[0], preview, scale = 1, width = 1280;
  let original = false, outputType = 'css', hsl = { h:0, s:0, l:0, a:100 };
  const inputs = { h: $('hue'), s: $('saturation'), l: $('lightness'), a: $('alpha') };
  const outputs = { h: $('hue-value'), s: $('saturation-value'), l: $('lightness-value'), a: $('alpha-value') };
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  function message(text, error = false) { $('message').textContent = text; $('message').dataset.error = String(error); }
  function preset() { return JSON.stringify({ version: 1, snapshot: ROOMS_SNAPSHOT.metadata.capturedAt, colors }, null, 2); }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) colors = core.parsePreset(saved, groups);
  } catch { message('Không đọc được màu đã lưu. Bạn vẫn có thể dùng tool và nạp file bảng màu.', true); }

  function background(element) {
    const ancestors = [];
    for (let el = element; el; el = el.parentElement) ancestors.unshift(el);
    let result = [255,255,255,1];
    for (const el of ancestors) {
      const value = core.fromCss(frame.contentWindow.getComputedStyle(el).backgroundColor);
      if (value) result = core.composite(core.rgba(value), result);
    }
    return core.toHex(...result);
  }
  function elementFor(item) {
    const matches = [...preview.querySelectorAll(item.selector)];
    return matches.find(element => element.getClientRects().length > 0) || matches[0];
  }
  function valueOf(item) {
    if (!original && colors[item.id]) return colors[item.id];
    const element = elementFor(item);
    if (!element) return '#000000';
    const value = core.fromCss(frame.contentWindow.getComputedStyle(element).getPropertyValue(item.property).trim());
    // Unpainted sections display the inherited page background, so their first edit is visible.
    if (item.property === 'background-color' && (!value || core.rgba(value)[3] === 0)) return background(element);
    return value || '#000000';
  }
  function updateOutput() {
    $('output').value = outputType === 'css' ? core.css(colors, groups) : core.instructions(colors, groups);
    $('download-output').textContent = outputType === 'css' ? 'Tải file CSS' : 'Tải lệnh chỉnh màu';
    $('css-tab').setAttribute('aria-pressed', String(outputType === 'css'));
    $('note-tab').setAttribute('aria-pressed', String(outputType !== 'css'));
    $('change-count').textContent = `${Object.keys(colors).length} thay đổi`;
    $('reset-all').disabled = !Object.keys(colors).length;
  }
  function save() {
    try { localStorage.setItem(storageKey, preset()); $('save-status').textContent = 'Đã tự lưu trên trình duyệt'; }
    catch { $('save-status').textContent = 'Dùng “Lưu bảng màu” để giữ lại'; }
  }
  function apply() {
    preview.getElementById('color-overrides').textContent = original ? '' : core.css(colors, groups);
    updateOutput();
  }
  function updateContrast() {
    const element = elementFor(field);
    const property = field.property;
    $('contrast').textContent = '';
    delete $('contrast').dataset.low;
    if (!element || (property !== 'color' && property !== 'background-color')) return;
    const fg = core.fromCss(frame.contentWindow.getComputedStyle(element).color), bg = background(element);
    if (!fg) return;
    const ratio = core.contrast(fg, bg);
    $('contrast').textContent = `Chữ tại vùng: ${ratio.toFixed(2)}:1`;
    $('contrast').dataset.low = String(ratio < 4.5);
    $('contrast').title = 'Tỷ lệ chữ / nền tại phần tử được chọn, đã tính độ trong suốt. Mục tiêu chữ nhỏ ≥ 4.5:1; cần xem thêm các chữ khác trong vùng.';
  }
  function updateSwatches() {
    for (const button of $('swatches').children) {
      const item = group.fields.find(f => f.id === button.dataset.field), value = valueOf(item);
      button.firstElementChild.style.backgroundColor = value;
      button.title = `${item.label}: ${value}`;
      button.setAttribute('aria-label', `${item.label}: ${value}`);
      button.setAttribute('aria-pressed', String(item.id === field.id));
      button.classList.toggle('edited', Boolean(colors[item.id]));
    }
  }
  function syncEditor({ keepHex = false, preserveHsl = false } = {}) {
    const value = valueOf(field);
    if (!keepHex) { $('hex-error').hidden = true; $('hex').removeAttribute('aria-invalid'); }
    if (!preserveHsl) hsl = core.hexToHsl(value);
    if (!keepHex) $('hex').value = value;
    $('picker').value = value.slice(0, 7);
    $('color-well').style.setProperty('--picked', value);
    for (const key of Object.keys(inputs)) {
      inputs[key].value = String(Math.round(hsl[key]));
      outputs[key].value = `${Math.round(hsl[key])}${key === 'h' ? '°' : '%'}`;
    }
    $('saturation').style.background = `linear-gradient(90deg,hsl(${hsl.h} 0% ${hsl.l}%),hsl(${hsl.h} 100% ${hsl.l}%))`;
    $('lightness').style.background = `linear-gradient(90deg,#000,hsl(${hsl.h} ${hsl.s}% 50%),#fff)`;
    $('alpha').style.background = `linear-gradient(90deg,transparent,${value.slice(0, 7)}),repeating-conic-gradient(#dce0d5 0% 25%,#fff 0% 50%) 50%/8px 8px`;
    $('reset-field').disabled = !colors[field.id];
    $('override-state').textContent = colors[field.id] ? 'Đã đặt màu riêng' : 'Theo CSS gốc';
    $('source-path').textContent = field.source;
    $('source-selector').textContent = field.selector;
    $('source-property').textContent = `Thuộc tính: ${field.property}${field.shadow ? ' + box-shadow cùng màu' : ''}`;
    updateSwatches(); updateContrast();
  }
  function setColor(value, options = {}) {
    const normalized = core.normalizeHex(value);
    if (!normalized) return;
    colors[field.id] = normalized;
    apply(); syncEditor(options); save();
  }
  function mark() {
    preview.querySelectorAll('[data-color-selected]').forEach(el => el.removeAttribute('data-color-selected'));
    if (!original && group.id !== 'palette') preview.querySelectorAll(group.selector).forEach(el => el.setAttribute('data-color-selected', ''));
  }
  function scrollToGroup() {
    const target = preview.querySelector(group.selector);
    if (target) stage.scrollTo({ top: Math.max(0, (target.getBoundingClientRect().top + frame.contentWindow.scrollY) * scale - 18), behavior: motion() });
  }
  function selectGroup(id, pickedField, scroll = true) {
    group = groups.find(g => g.id === id) || groups[0];
    field = group.fields.find(f => f.id === pickedField) || group.fields[0];
    $('group').value = group.id;
    $('field').replaceChildren(...group.fields.map(item => new Option(item.label, item.id)));
    $('field').value = field.id;
    $('group-help').textContent = group.id === 'palette'
      ? 'Đổi biến màu chung để các layout dùng cùng bộ màu. Màu riêng của từng phần sẽ ưu tiên hơn.'
      : 'Chỉnh màu riêng cho phần này. “Đặt lại” trả về màu từ CSS gốc và bảng màu chung.';
    $('swatches').replaceChildren(...group.fields.map(item => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'swatch'; button.dataset.field = item.id;
      button.append(document.createElement('span'));
      button.addEventListener('click', () => selectField(item.id));
      return button;
    }));
    $('hex-error').hidden = true; $('hex').removeAttribute('aria-invalid');
    syncEditor(); mark(); if (scroll) scrollToGroup();
  }
  function selectField(id) {
    field = group.fields.find(f => f.id === id) || group.fields[0];
    $('field').value = field.id; $('hex-error').hidden = true; $('hex').removeAttribute('aria-invalid');
    syncEditor();
  }
  function resizePreview() {
    if (!preview) return;
    scale = Math.min(1, (stage.clientWidth - 40) / width);
    frame.style.width = `${width}px`;
    // Re-measure at a small viewport so min-height:100vh can shrink after mobile mode.
    frame.style.height = '1px';
    const height = Math.ceil(preview.body.scrollHeight);
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    canvas.style.width = `${width * scale}px`; canvas.style.height = `${height * scale}px`;
    $('zoom-label').textContent = `${width}px · ${Math.round(scale * 100)}%`;
  }
  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type })), link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('group').replaceChildren(...groups.map(g => new Option(g.name, g.id)));
  $('group').addEventListener('change', event => selectGroup(event.target.value));
  $('field').addEventListener('change', event => selectField(event.target.value));
  $('hex').addEventListener('input', () => {
    const valid = core.normalizeHex($('hex').value);
    $('hex-error').hidden = Boolean(valid); $('hex').setAttribute('aria-invalid', String(!valid));
    if (valid) setColor(valid, { keepHex: true });
  });
  $('hex').addEventListener('blur', () => { if (core.normalizeHex($('hex').value)) $('hex').value = valueOf(field); });
  $('picker').addEventListener('input', () => {
    const alpha = hsl.a === 0 ? 100 : hsl.a;
    setColor(core.toHex(...core.rgba($('picker').value).slice(0, 3), alpha / 100));
  });
  for (const [key, input] of Object.entries(inputs)) input.addEventListener('input', () => {
    hsl[key] = Number(input.value);
    if (key !== 'a' && hsl.a === 0) hsl.a = 100;
    setColor(core.hslToHex(hsl), { preserveHsl: true });
  });
  $('reset-field').addEventListener('click', () => { delete colors[field.id]; apply(); syncEditor(); save(); });
  $('reset-all').addEventListener('click', () => { $('reset-dialog').returnValue = 'cancel'; $('reset-dialog').showModal(); });
  $('reset-dialog').addEventListener('close', () => {
    if ($('reset-dialog').returnValue === 'reset') { colors = {}; apply(); syncEditor(); save(); message('Đã khôi phục bảng màu gốc.'); }
  });
  $('original').addEventListener('click', () => {
    original = !original; $('original').setAttribute('aria-pressed', String(original));
    $('original').textContent = original ? 'Về màu đang chỉnh' : 'Xem màu gốc';
    $('edit-controls').disabled = original;
    $('preview-hint').textContent = original ? 'Đang so sánh với màu gốc. Màu bạn chọn vẫn được giữ.' : 'Bấm vào một phần của trang để chọn màu cần chỉnh.';
    apply(); mark();
  });
  for (const [id, size] of [['desktop',1280], ['mobile',390]]) $(id).addEventListener('click', () => {
    width = size; $('desktop').setAttribute('aria-pressed', String(size === 1280)); $('mobile').setAttribute('aria-pressed', String(size === 390));
    resizePreview(); requestAnimationFrame(resizePreview);
  });
  $('css-tab').addEventListener('click', () => { outputType = 'css'; updateOutput(); });
  $('note-tab').addEventListener('click', () => { outputType = 'note'; updateOutput(); });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('output').value); $('copy-status').textContent = 'Đã sao chép'; }
    catch {
      $('output').focus(); $('output').select();
      try { if (!document.execCommand('copy')) throw new Error(); $('copy-status').textContent = 'Đã sao chép'; }
      catch { $('copy-status').textContent = 'Đã chọn mã. Nhấn Ctrl+C để sao chép.'; }
    }
  });
  $('download-output').addEventListener('click', () => download(outputType === 'css' ? 'rooms-colors.css' : 'rooms-color-instructions.txt', $('output').value, outputType === 'css' ? 'text/css;charset=utf-8' : 'text/plain;charset=utf-8'));
  $('save-button').addEventListener('click', () => { download('rooms-palette.json', preset(), 'application/json'); message('Đã tải bảng màu. Dùng “Nạp bảng màu” để tiếp tục trên máy hoặc trình duyệt khác.'); });
  $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256000) throw new Error('File quá lớn. Hãy chọn file rooms-palette.json do công cụ xuất.');
      const text = await file.text(), imported = core.parsePreset(text, groups);
      colors = imported;
      original = false; $('edit-controls').disabled = false; $('original').setAttribute('aria-pressed','false'); $('original').textContent = 'Xem màu gốc';
      $('preview-hint').textContent = 'Bấm vào một phần của trang để chọn màu cần chỉnh.';
      apply(); syncEditor(); mark(); save();
      message(JSON.parse(text).snapshot === ROOMS_SNAPSHOT.metadata.capturedAt ? 'Đã nạp bảng màu.' : 'Đã nạp bảng màu từ bản sao UI khác. Kiểm tra lại các phần trước khi áp dụng.');
    } catch (error) { message(error.message || 'Không đọc được bảng màu.', true); }
    event.target.value = '';
  });
  frame.addEventListener('load', () => {
    preview = frame.contentDocument;
    if (!preview?.querySelector('.rooms-theme')) { message('Không mở được bản sao trang chủ.', true); return; }
    apply(); selectGroup('palette', undefined, false);
    preview.addEventListener('submit', event => event.preventDefault());
    preview.addEventListener('pointerdown', event => { if (event.target.closest('select,input')) event.preventDefault(); });
    preview.addEventListener('click', event => {
      event.preventDefault();
      const toggle = event.target.closest('.rooms-menu-toggle');
      if (toggle) {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded)); preview.querySelector('.rooms-header-panel').classList.toggle('is-open', expanded);
        resizePreview();
      }
      if (original) return;
      const picked = groups.slice(1).find(g => event.target.closest(g.selector));
      if (!picked) return;
      // Prefer the clicked child (e.g. emphasized title) over its broader parent.
      const item = picked.fields.filter(f => f.property === 'color')
        .map(field => ({ field, target: event.target.closest(field.selector) }))
        .filter(item => item.target)
        .reduce((best, item) => !best || best.target.contains(item.target) ? item : best, null);
      selectGroup(picked.id, item?.field.id, false);
    });
    new ResizeObserver(resizePreview).observe(preview.body);
    preview.fonts.ready.then(resizePreview);
    resizePreview(); save();
  });
  new ResizeObserver(resizePreview).observe(stage);
  if (!globalThis.ROOMS_SNAPSHOT) { message('Thiếu snapshot.js. Giữ toàn bộ thư mục công cụ cạnh index.html.', true); return; }
  const captured = new Date(ROOMS_SNAPSHOT.metadata.capturedAt).toLocaleDateString('vi-VN');
  $('snapshot-date').textContent = `Bản sao từ code · ${captured}`;
  frame.srcdoc = ROOMS_SNAPSHOT.document;
})();
