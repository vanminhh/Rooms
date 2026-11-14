/* Selectors and properties from the current Rooms source; CSS exports use the same rules as the preview. */
globalThis.RoomsColorCatalog = (() => {
  const kit = 'Source/frontend/src/components/rooms.css';
  const nav = 'Source/frontend/src/components/Navigation.css';
  const pub = 'Source/frontend/src/features/public/public.css';
  const lower = 'Source/frontend/src/features/public/home-lower.css';
  const groups = [];
  function group(id, name, selector, source, rows) {
    groups.push({ id, name, selector, source, fields: rows.map(([key, label, target, property, extra]) => ({
      id: `${id}.${key}`, label, selector: target, property, source, ...extra,
    })) });
  }
  group('palette', 'Bảng màu chung', '.rooms-theme', kit, [
    ['sand', 'Nền trang · Sand', '.rooms-theme', '--rooms-sand'],
    ['paper', 'Nền thẻ · Paper', '.rooms-theme', '--rooms-paper'],
    ['ink', 'Màu chủ đạo · Ink', '.rooms-theme', '--rooms-ink'],
    ['text', 'Chữ chính', '.rooms-theme', '--rooms-text'],
    ['muted', 'Chữ phụ', '.rooms-theme', '--rooms-muted'],
    ['gold', 'Màu nhấn / focus', '.rooms-theme', '--rooms-gold'],
    ['accent', 'Chữ nhấn', '.rooms-theme', '--rooms-accent-text'],
    ['goldText', 'Chữ vàng đậm', '.rooms-theme', '--rooms-gold-text'],
    ['line', 'Đường viền', '.rooms-theme', '--rooms-line'],
  ]);
  group('header', 'Header · Thanh điều hướng', '.rooms-header', nav, [
    ['bg', 'Nền header', '.rooms-theme .rooms-header', 'background-color'],
    ['text', 'Chữ menu', '.rooms-theme .rooms-nav a, .rooms-theme .rooms-menu-toggle', 'color'],
    ['brand', 'Chữ ROOMS', '.rooms-theme .rooms-brand-wordmark strong', 'color'],
    ['tagline', 'Chữ dưới logo', '.rooms-theme .rooms-brand-wordmark small', 'color'],
    ['line', 'Viền dưới header', '.rooms-theme .rooms-header', 'border-bottom-color'],
    ['accountLine', 'Viền nút đăng nhập', '.rooms-theme .rooms-nav .rooms-account-link', 'border-color'],
    ['button', 'Nút đặt lịch · nền', '.rooms-theme .rooms-header-cta', 'background-color'],
    ['buttonText', 'Nút đặt lịch · chữ', '.rooms-theme .rooms-header-cta', 'color'],
    ['language', 'Ngôn ngữ chọn · nền', '.rooms-theme .rooms-language-switch button[aria-pressed="true"]', 'background-color'],
    ['languageText', 'Ngôn ngữ chọn · chữ', '.rooms-theme .rooms-language-switch button[aria-pressed="true"]', 'color'],
  ]);
  group('hero', 'Banner · Đầu trang', '.public-hero', pub, [
    ['bg', 'Nền banner', '.rooms-theme .public-hero', 'background-color'],
    ['title', 'Tiêu đề', '.rooms-theme .public-hero h1', 'color'],
    ['em', 'Chữ nhấn trong tiêu đề', '.rooms-theme .public-hero h1 em', 'color'],
    ['eyebrow', 'Dòng giới thiệu nhỏ', '.rooms-theme .public-hero .rooms-eyebrow', 'color'],
    ['body', 'Mô tả', '.rooms-theme .public-hero-intro', 'color'],
    ['button', 'Nút tìm phòng · nền', '.rooms-theme .public-hero-link', 'background-color'],
    ['buttonText', 'Nút tìm phòng · chữ', '.rooms-theme .public-hero-link', 'color'],
    ['stats', 'Số thống kê', '.rooms-theme .public-hero-stats dt', 'color'],
    ['statLabels', 'Nhãn thống kê', '.rooms-theme .public-hero-stats dd', 'color'],
    ['badge', 'Thông báo phòng trống · nền', '.rooms-theme .public-hero-availability', 'background-color'],
    ['badgeText', 'Thông báo phòng trống · chữ', '.rooms-theme .public-hero-availability strong', 'color'],
    ['badgeDetail', 'Thông báo phòng trống · chú thích', '.rooms-theme .public-hero-availability small', 'color'],
    ['dot', 'Chấm trạng thái', '.rooms-theme .public-hero-availability > span', 'background-color', { shadow: '0 0 0 5px color-mix(in srgb, VALUE 18%, transparent)' }],
  ]);
  group('search', 'Thanh tìm phòng', '.public-search', pub, [
    ['bg', 'Nền thanh tìm', '.rooms-theme .public-search .rooms-search', 'background-color'],
    ['label', 'Nhãn các ô', '.rooms-theme .public-search .rooms-search label > span', 'color'],
    ['value', 'Chữ trong ô chọn', '.rooms-theme .public-search .rooms-search select', 'color'],
    ['line', 'Gạch dưới ô chọn', '.rooms-theme .public-search .rooms-search select', 'border-bottom-color'],
    ['button', 'Nút tìm · nền', '.rooms-theme .public-search .rooms-search .rooms-button', 'background-color'],
    ['buttonText', 'Nút tìm · chữ', '.rooms-theme .public-search .rooms-search .rooms-button', 'color'],
  ]);
  group('reasons', 'Vì sao chọn Rooms', '.public-reasons', lower, [
    ['bg', 'Nền khu vực', '.rooms-theme .public-reasons', 'background-color'],
    ['title', 'Tiêu đề khu vực', '.rooms-theme .public-reasons h2', 'color'],
    ['intro', 'Mô tả khu vực', '.rooms-theme .public-reasons .public-centered-heading > p:not(.rooms-eyebrow)', 'color'],
    ['card', 'Nền thẻ lý do', '.rooms-theme .public-reason-card', 'background-color'],
    ['line', 'Viền thẻ', '.rooms-theme .public-reason-card', 'border-color'],
    ['cardTitle', 'Tiêu đề thẻ', '.rooms-theme .public-reason-card h3', 'color'],
    ['body', 'Mô tả thẻ', '.rooms-theme .public-reason-card p', 'color'],
    ['note', 'Ghi chú thẻ', '.rooms-theme .public-reason-card small', 'color'],
    ['number', 'Ô số · nền', '.rooms-theme .public-card-number', 'background-color'],
    ['numberText', 'Ô số · chữ', '.rooms-theme .public-card-number', 'color'],
  ]);
  group('rooms', 'Danh sách phòng', '.public-featured', pub, [
    ['bg', 'Nền khu vực', '.rooms-theme .public-featured', 'background-color'],
    ['title', 'Tiêu đề khu vực', '.rooms-theme .public-featured h2', 'color'],
    ['intro', 'Mô tả khu vực', '.rooms-theme .public-featured .rooms-section-description', 'color'],
    ['link', 'Link xem tất cả', '.rooms-theme .public-section-link a', 'color'],
    ['card', 'Nền thẻ phòng', '.rooms-theme .public-room-card', 'background-color'],
    ['line', 'Viền thẻ / thông số', '.rooms-theme .public-room-card, .rooms-theme .public-featured .public-room-facts', 'border-color'],
    ['cardTitle', 'Tên phòng', '.rooms-theme .public-room-card h3', 'color'],
    ['body', 'Tòa nhà / địa chỉ', '.rooms-theme .public-room-card p', 'color'],
    ['label', 'Nhãn thông số', '.rooms-theme .public-room-facts dt', 'color'],
    ['value', 'Giá thuê / thông số', '.rooms-theme .public-room-facts dd', 'color'],
    ['placeholder', 'Ô chưa có ảnh · nền', '.rooms-theme .public-room-media', 'background-color'],
    ['button', 'Nút xem phòng · nền', '.rooms-theme .public-room-cta', 'background-color', { source: lower }],
    ['buttonText', 'Nút xem phòng · chữ', '.rooms-theme .public-room-cta', 'color', { source: lower }],
  ]);
  group('areas', 'Khu vực Hà Nội', '.public-areas', lower, [
    ['bg', 'Nền khu vực', '.rooms-theme .public-areas', 'background-color'],
    ['title', 'Tiêu đề khu vực', '.rooms-theme .public-areas h2', 'color'],
    ['intro', 'Mô tả khu vực', '.rooms-theme .public-areas .rooms-section-description', 'color'],
    ['card', 'Nền thẻ khu vực', '.rooms-theme .public-district', 'background-color'],
    ['line', 'Viền thẻ', '.rooms-theme .public-district', 'border-color'],
    ['name', 'Tên quận', '.rooms-theme .public-district-copy strong', 'color'],
    ['count', 'Số phòng trống', '.rooms-theme .public-district .rooms-eyebrow', 'color'],
    ['link', 'Link xem phòng', '.rooms-theme .public-district-copy > span:last-child', 'color'],
  ]);
  group('steps', 'Các bước tìm phòng', '.public-process', lower, [
    ['bg', 'Nền khu vực', '.rooms-theme .public-process', 'background-color'],
    ['title', 'Tiêu đề khu vực', '.rooms-theme .public-process h2', 'color'],
    ['card', 'Nền thẻ bước', '.rooms-theme .public-step-grid li', 'background-color'],
    ['line', 'Viền thẻ', '.rooms-theme .public-step-grid li', 'border-color'],
    ['cardTitle', 'Tiêu đề bước', '.rooms-theme .public-step-grid h3', 'color'],
    ['body', 'Mô tả bước', '.rooms-theme .public-step-grid p', 'color'],
    ['number', 'Ô số · nền', '.rooms-theme .public-step-grid li > span', 'background-color'],
    ['numberText', 'Ô số · chữ', '.rooms-theme .public-step-grid li > span', 'color'],
  ]);
  group('contact', 'Banner liên hệ', '.public-contact-cta', lower, [
    ['bg', 'Nền banner toàn chiều ngang', '.rooms-theme .public-contact-cta', 'background-color', { shadow: '0 0 0 100vmax VALUE' }],
    ['title', 'Tiêu đề', '.rooms-theme .public-contact-cta h2', 'color'],
    ['body', 'Mô tả', '.rooms-theme .public-contact-cta p:not(.rooms-eyebrow)', 'color'],
    ['accent', 'Dòng nhấn', '.rooms-theme .public-contact-cta .rooms-eyebrow', 'color'],
    ['links', 'Số điện thoại / link', '.rooms-theme .public-contact-lines a', 'color'],
    ['card', 'Nền khung đặt lịch', '.rooms-theme .public-contact-action', 'background-color'],
    ['line', 'Viền khung đặt lịch', '.rooms-theme .public-contact-action', 'border-color'],
    ['button', 'Nút tìm phòng · nền', '.rooms-theme .public-contact-action > a', 'background-color'],
    ['buttonText', 'Nút tìm phòng · chữ', '.rooms-theme .public-contact-action > a', 'color'],
  ]);
  group('footer', 'Footer · Chân trang', '.rooms-footer', nav, [
    ['bg', 'Nền footer', '.rooms-theme .rooms-footer', 'background-color'],
    ['brand', 'Chữ ROOMS', '.rooms-theme .rooms-footer-brand', 'color'],
    ['tagline', 'Chữ dưới logo', '.rooms-theme .rooms-footer-wordmark', 'color'],
    ['title', 'Tiêu đề các cột', '.rooms-theme .rooms-footer section h2', 'color'],
    ['body', 'Mô tả / liên hệ', '.rooms-theme .rooms-footer section > p:not(.rooms-footer-brand, .rooms-footer-wordmark), .rooms-theme .rooms-footer-contact', 'color'],
    ['links', 'Các liên kết', '.rooms-theme .rooms-footer nav a, .rooms-theme .rooms-footer-contact a', 'color'],
    ['bottom', 'Chữ bản quyền', '.rooms-theme .rooms-footer-bottom', 'color'],
    ['line', 'Đường phân cách', '.rooms-theme .rooms-footer-bottom', 'border-top-color'],
  ]);
  for (const item of groups) item.textFields = item.fields.filter(field => field.property === 'color')
    .map(({ id, label, selector, source }) => ({ id, label, selector, source }));
  groups[0].textFields = [
    ['h1', 'Tiêu đề lớn · H1', '.rooms-theme h1'],
    ['h2', 'Tiêu đề khu vực · H2', '.rooms-theme h2'],
    ['h3', 'Tiêu đề thẻ · H3', '.rooms-theme h3'],
    ['paragraphs', 'Các đoạn văn', '.rooms-theme p'],
  ].map(([id, label, selector]) => ({ id: `palette.${id}`, label, selector, source: kit }));
  return groups;
})();
