(() => {
  'use strict';
  const core = globalThis.RoomsColorCore, groups = globalThis.RoomsColorCatalog;
  const $ = id => document.getElementById(id);
  const storageKey = 'rooms-color-tool:v1';
  const frame = $('preview'), stage = $('preview-scroll'), canvas = $('canvas');
  let colors = {}, typography = {}, group = groups[0], field = group.fields[0], preview, scale = 1, width = 1280;
  let original = false, editMode = 'color', outputType = 'css', hsl = { h:0, s:0, l:0, a:100 };
  let hovered;
  const fieldsFor = (item = group) => editMode === 'type' ? item.textFields : item.fields;
  const inputs = { h: $('hue'), s: $('saturation'), l: $('lightness'), a: $('alpha') };
  const outputs = { h: $('hue-value'), s: $('saturation-value'), l: $('lightness-value'), a: $('alpha-value') };
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  function message(text, error = false) { $('message').textContent = text; $('message').dataset.error = String(error); }
  function preset() { return JSON.stringify({ version: 2, snapshot: ROOMS_SNAPSHOT.metadata.capturedAt, colors, typography }, null, 2); }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) ({ colors, typography } = core.parsePreset(saved, groups));
  } catch { message('Không đọc được bộ chỉnh đã lưu. Bạn vẫn có thể dùng tool và nạp file đã lưu.', true); }

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
    $('output').value = outputType === 'css' ? core.css(colors, groups, typography) : core.instructions(colors, groups, typography);
    $('download-output').textContent = outputType === 'css' ? 'Tải file CSS' : 'Tải lệnh chỉnh UI';
    $('css-tab').setAttribute('aria-pressed', String(outputType === 'css'));
    $('note-tab').setAttribute('aria-pressed', String(outputType !== 'css'));
    const count = Object.keys(colors).length + Object.values(typography).reduce((sum, item) => sum + Object.keys(item).length, 0);
    $('change-count').textContent = `${count} thay đổi`;
    $('reset-all').disabled = !count;
  }
  function save() {
    try { localStorage.setItem(storageKey, preset()); $('save-status').textContent = 'Đã tự lưu trên trình duyệt'; }
    catch { $('save-status').textContent = 'Dùng “Lưu bộ chỉnh” để giữ lại'; }
  }
  function apply() {
    preview.getElementById('color-overrides').textContent = original ? '' : core.css(colors, groups, typography);
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
  function syncEditor({ keepHex = false, preserveHsl = false, keepSize = false } = {}) {
    $('source-path').textContent = field.source;
    $('source-selector').textContent = field.selector;
    $('source-property').textContent = editMode === 'type' ? 'Thuộc tính: font-size, font-family' : `Thuộc tính: ${field.property}${field.shadow ? ' + box-shadow cùng màu' : ''}`;
    if (editMode === 'type') {
      const element = elementFor(field), style = element && frame.contentWindow.getComputedStyle(element);
      const selected = typography[field.id] || {}, size = selected.size ?? Math.round(parseFloat(style?.fontSize || '16') * 10) / 10;
      $('font-family').value = selected.font || '';
      if (!keepSize) $('font-size').value = size;
      $('font-size-range').value = size;
      $('size-error').hidden = true; $('font-size').removeAttribute('aria-invalid');
      $('reset-size').disabled = selected.size === undefined;
      $('reset-type').disabled = !Object.keys(selected).length;
      $('type-current').textContent = `Hiện tại: ${style?.fontFamily || ''} · ${size} px`;
      return;
    }
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
    updateSwatches(); updateContrast();
  }
  function setColor(value, options = {}) {
    const normalized = core.normalizeHex(value);
    if (!normalized) return;
    colors[field.id] = normalized;
    apply(); syncEditor(options); save();
  }
  function setText(property, value, options = {}) {
    const selected = { ...typography[field.id] };
    if (value === undefined) delete selected[property]; else selected[property] = value;
    if (Object.keys(selected).length) typography[field.id] = selected; else delete typography[field.id];
    apply(); syncEditor(options); save(); requestAnimationFrame(resizePreview);
  }
  function mark() {
    clearHover();
    preview.querySelectorAll('[data-color-selected], [data-color-active]').forEach(el => {
      el.removeAttribute('data-color-selected'); el.removeAttribute('data-color-active');
    });
    if (original) return;
    if (group.id !== 'palette') preview.querySelectorAll(group.selector).forEach(el => el.setAttribute('data-color-selected', ''));
    if (field.selector !== '.rooms-theme') preview.querySelectorAll(field.selector).forEach(el => el.setAttribute('data-color-active', ''));
    selectionHint();
  }
  function selectionHint() {
    if (!original) $('preview-hint').textContent = group.id === 'palette' && field.selector === '.rooms-theme'
      ? 'Rê chuột để xem phần có thể chỉnh, bấm để chọn. Hoặc chọn mục bên phải.'
      : `Đã chọn: ${group.name} / ${field.label}. Có thể chọn tiếp trên trang hoặc bên phải.`;
  }
  function clearHover() {
    hovered?.removeAttribute('data-color-hover'); hovered = undefined;
    selectionHint();
  }
  function scrollToGroup() {
    const target = elementFor(field) || preview.querySelector(group.selector);
    if (target) stage.scrollTo({ top: Math.max(0, (target.getBoundingClientRect().top + frame.contentWindow.scrollY) * scale - 18), behavior: motion() });
  }
  function selectGroup(id, pickedField, scroll = true) {
    group = groups.find(g => g.id === id) || groups[0];
    field = fieldsFor().find(f => f.id === pickedField) || fieldsFor()[0];
    $('group').value = group.id;
    $('field').replaceChildren(...fieldsFor().map(item => new Option(item.label, item.id)));
    $('field').value = field.id;
    $('group-help').textContent = group.id === 'palette'
      ? (editMode === 'type' ? 'Chỉnh chữ chung theo loại tiêu đề hoặc đoạn văn. Kiểu đặt riêng ở từng phần được ưu tiên.' : 'Đổi biến màu chung để các layout dùng cùng bộ màu. Màu riêng của từng phần sẽ ưu tiên hơn.')
      : 'Chỉnh riêng phần đang chọn. “Đặt lại” dùng lại giao diện gốc và các thiết lập chung.';
    $('field-label').textContent = editMode === 'type' ? 'Phần chữ cần chỉnh' : 'Màu cần chỉnh';
    $('color-mode').setAttribute('aria-pressed', String(editMode === 'color'));
    $('type-mode').setAttribute('aria-pressed', String(editMode === 'type'));
    $('color-editor').hidden = editMode !== 'color'; $('swatches').hidden = editMode !== 'color';
    $('type-editor').hidden = editMode !== 'type';
    $('swatches').replaceChildren(...(editMode === 'color' ? group.fields : []).map(item => {
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
    field = fieldsFor().find(f => f.id === id) || fieldsFor()[0];
    $('field').value = field.id; $('hex-error').hidden = true; $('hex').removeAttribute('aria-invalid');
    syncEditor(); mark(); scrollToGroup();
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
  for (const [id, mode] of [['color-mode', 'color'], ['type-mode', 'type']]) $(id).addEventListener('click', () => {
    editMode = mode; selectGroup(group.id, field.id, false);
  });
  $('font-family').replaceChildren(new Option('Theo phông gốc / thiết lập chung', ''), ...core.fonts.map(font => new Option(font.label, font.id)));
  $('font-family').addEventListener('change', event => setText('font', event.target.value || undefined));
  $('font-size').addEventListener('input', event => {
    const value = event.target.valueAsNumber, valid = core.validSize(value);
    if (valid) { setText('size', value, { keepSize: true }); }
    else { $('size-error').hidden = false; $('font-size').setAttribute('aria-invalid', 'true'); }
  });
  $('font-size-range').addEventListener('input', event => setText('size', Number(event.target.value)));
  $('reset-size').addEventListener('click', () => setText('size', undefined));
  $('reset-type').addEventListener('click', () => { delete typography[field.id]; apply(); syncEditor(); save(); requestAnimationFrame(resizePreview); });
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
    if ($('reset-dialog').returnValue === 'reset') { colors = {}; typography = {}; apply(); syncEditor(); save(); message('Đã khôi phục màu và chữ gốc.'); }
  });
  $('original').addEventListener('click', () => {
    original = !original; $('original').setAttribute('aria-pressed', String(original));
    $('original').textContent = original ? 'Về bản đang chỉnh' : 'Xem bản gốc';
    $('edit-controls').disabled = original;
    $('preview-hint').textContent = original ? 'Đang so sánh với bản gốc. Các chỉnh sửa vẫn được giữ.' : 'Bấm vào một phần của trang để chỉnh màu hoặc chữ.';
    apply(); mark();
  });
  for (const [id, size] of [['desktop',1280], ['mobile',390]]) $(id).addEventListener('click', () => {
    width = size; $('desktop').setAttribute('aria-pressed', String(size === 1280)); $('mobile').setAttribute('aria-pressed', String(size === 390));
    resizePreview(); requestAnimationFrame(() => { resizePreview(); syncEditor(); });
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
  $('save-button').addEventListener('click', () => { download('rooms-palette.json', preset(), 'application/json'); message('Đã tải bộ màu và chữ. Dùng “Nạp bộ chỉnh” để tiếp tục trên máy hoặc trình duyệt khác.'); });
  $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256000) throw new Error('File quá lớn. Hãy chọn file rooms-palette.json do công cụ xuất.');
      const text = await file.text(), imported = core.parsePreset(text, groups);
      ({ colors, typography } = imported);
      original = false; $('edit-controls').disabled = false; $('original').setAttribute('aria-pressed','false'); $('original').textContent = 'Xem bản gốc';
      $('preview-hint').textContent = 'Bấm vào một phần của trang để chỉnh màu hoặc chữ.';
      apply(); syncEditor(); mark(); save();
      message(JSON.parse(text).snapshot === ROOMS_SNAPSHOT.metadata.capturedAt ? 'Đã nạp bộ chỉnh.' : 'Đã nạp bộ chỉnh từ bản sao UI khác. Kiểm tra lại các phần trước khi áp dụng.');
    } catch (error) { message(error.message || 'Không đọc được bảng màu.', true); }
    event.target.value = '';
  });
  frame.addEventListener('load', () => {
    preview = frame.contentDocument;
    if (!preview?.querySelector('.rooms-theme')) { message('Không mở được bản sao trang chủ.', true); return; }
    const pickingStyle = preview.createElement('style');
    pickingStyle.textContent = `.rooms-theme, .rooms-theme *{cursor:crosshair!important}
      [data-color-selected]{outline:1px dashed #27776755!important;outline-offset:4px}
      [data-color-hover]{outline:2px dashed #99651b!important;outline-offset:3px}
      [data-color-active]{outline:2px solid #277767!important;outline-offset:3px}`;
    preview.head.append(pickingStyle);
    apply(); selectGroup('palette', undefined, false);
    preview.addEventListener('pointerover', event => {
      if (original) return;
      const picked = core.pickTarget(event.target, groups, editMode);
      if (!picked) { clearHover(); return; }
      if (hovered !== picked.element) {
        hovered?.removeAttribute('data-color-hover'); hovered = picked.element;
        hovered.setAttribute('data-color-hover', '');
      }
      $('preview-hint').textContent = `Đang trỏ: ${picked.group.name} / ${picked.field.label} — Bấm để chọn.`;
    });
    frame.addEventListener('pointerleave', clearHover);
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
      const picked = core.pickTarget(event.target, groups, editMode);
      if (!picked) return;
      editMode = picked.mode;
      selectGroup(picked.group.id, picked.field.id, false);
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
