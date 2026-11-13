const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
require('./color-core.js');
require('./catalog.js');
require('./snapshot.js');
const core = globalThis.RoomsColorCore, groups = globalThis.RoomsColorCatalog;

test('FE-COLOR-TOOL: accepts HEX, preserves alpha and rejects CSS injection', () => {
  assert.equal(core.normalizeHex('#AbA'), '#aabbaa');
  assert.equal(core.normalizeHex('#ABABAB'), '#ababab');
  assert.equal(core.normalizeHex('#1238'), '#11223388');
  assert.equal(core.normalizeHex('#110011ff'), '#110011');
  for (const input of ['red', '#ffffff; color:red', '#fffff', null, '<script>']) assert.equal(core.normalizeHex(input), null);
  assert.equal(core.fromCss('rgba(252, 248, 238, 0.95)'), '#fcf8eef2');
  assert.equal(core.fromCss('color(srgb 1 0 0 / 0.5)'), '#ff000080');
});

test('FE-COLOR-TOOL: slider endpoints, hue and alpha follow standard HSL', () => {
  assert.equal(core.hslToHex({h:0,s:100,l:50,a:100}), '#ff0000');
  assert.equal(core.hslToHex({h:120,s:100,l:50,a:50}), '#00ff0080');
  assert.equal(core.hslToHex({h:360,s:100,l:50,a:100}), '#ff0000');
  for (const color of ['#000000', '#ffffff', '#110011', '#ababab', '#153d36', '#fcf8eef2']) assert.equal(core.hslToHex(core.hexToHsl(color)), color);
});

test('FE-COLOR-TOOL: known contrast ratios include alpha composition', () => {
  assert.equal(core.contrast('#000000', '#ffffff'), 21);
  assert.equal(core.contrast('#ffffff', '#ffffff'), 1);
  assert.equal(core.contrast('#00000000', '#ffffff'), 1);
  assert.ok(core.contrast('#00000080', '#ffffff') > 3.9 && core.contrast('#00000080', '#ffffff') < 4.1);
});

test('FE-COLOR-TOOL: banner/footer examples export exact selectors and only chosen changes', () => {
  const colors = { 'hero.bg': '#ababab', 'footer.bg': '#110011' };
  const css = core.css(colors, groups);
  assert.match(css, /\.rooms-theme \.public-hero \{\n  background-color: #ababab !important;/);
  assert.match(css, /\.rooms-theme \.rooms-footer \{\n  background-color: #110011 !important;/);
  assert.doesNotMatch(css, /--rooms-ink:/);
  const notes = core.instructions(colors, groups);
  assert.match(notes, /Footer · Chân trang \/ Nền footer: #110011/);
  assert.match(notes, /Source\/frontend\/src\/components\/Navigation.css/);
  const banner = core.css({ 'contact.bg': '#abcdef' }, groups);
  assert.match(banner, /box-shadow: 0 0 0 100vmax #abcdef !important;/);
  assert.match(core.instructions({ 'contact.bg': '#abcdef' }, groups), /box-shadow: 0 0 0 100vmax #abcdef/);
});

test('FE-COLOR-TOOL: preset round trip is lossless and rejects untrusted selectors', () => {
  const colors = { 'hero.bg': '#ababab', 'footer.bg': '#110011', 'contact.card': '#ffffff26' };
  assert.deepEqual(core.parsePreset(JSON.stringify({version:1,colors}), groups), colors);
  for (const input of [{version:2,colors}, {version:1,colors:[]}, {version:1,colors:{'body': '#ffffff'}}, {version:1,colors:{'hero.bg': 'url(https://example.com)'}}]) assert.throws(() => core.parsePreset(JSON.stringify(input), groups));
});

test('FE-COLOR-TOOL: catalog has unique fields and copied source classes', () => {
  const ids = groups.flatMap(g => g.fields.map(f => f.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const group of groups) {
    const className = group.selector.slice(1);
    assert.ok(ROOMS_SNAPSHOT.document.includes(className), `Missing group ${group.id}`);
    for (const field of group.fields) assert.ok(fs.existsSync(path.resolve(__dirname, '../..', field.source)), field.source);
  }
});

test('FE-COLOR-TOOL: snapshot contains the homepage, no script or API, and local images', () => {
  const html = ROOMS_SNAPSHOT.document;
  for (const marker of ['public-hero', 'public-search', 'public-reasons', 'public-featured', 'public-areas', 'public-process', 'public-contact-cta', 'rooms-footer']) assert.ok(html.includes(marker));
  assert.doesNotMatch(html, /<script\b|fetch\(|\/api\//);
  for (const match of html.matchAll(/src="([^"]+)"/g)) {
    assert.ok(match[1].startsWith('assets/'), match[1]);
    assert.ok(fs.existsSync(path.join(__dirname, match[1])), match[1]);
  }
});
