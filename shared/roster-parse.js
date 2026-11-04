// shared/roster-parse.js
// Logik huraian pembungkus Apps Script yang dikongsi oleh Worker dan alat
// data:fetch. Satu sumber bermakna fallback yang dibundel tidak boleh
// menyimpang daripada penghuraian langsung.
//
// Aliran:
//   wrapper HTML -> goog.script.init("<literal JS>") -> JSON luar (userHtml)
//   -> const DATA = { ... } -> objek roster.

/** Menyahkod isi literal rentetan JS (tanpa tanda petik luar). */
export function decodeJsString(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = s[i + 1];
    if (n === undefined) break;
    if (n === 'x') {
      const hex = s.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
      } else {
        out += n;
        i += 1;
      }
    } else if (n === 'u') {
      const hex = s.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
      } else {
        out += n;
        i += 1;
      }
    } else if (n === 'n') { out += '\n'; i += 1; }
    else if (n === 'r') { out += '\r'; i += 1; }
    else if (n === 't') { out += '\t'; i += 1; }
    else if (n === 'b') { out += '\b'; i += 1; }
    else if (n === 'f') { out += '\f'; i += 1; }
    else if (n === 'v') { out += '\v'; i += 1; }
    else if (n === '0') { out += '\0'; i += 1; }
    else if (n === '"' || n === "'" || n === '\\' || n === '/') { out += n; i += 1; }
    else if (n === '\n') { i += 1; /* sambungan baris */ }
    else { out += n; i += 1; }
  }
  return out;
}

/** Menyekstrak objek JSON selepas `const DATA = {...};` dengan pengimbas seimbang. */
export function extractDataJson(html) {
  const key = 'const DATA =';
  const ki = html.indexOf(key);
  if (ki === -1) throw new Error('const DATA tidak ditemui dalam userHtml');
  const start = html.indexOf('{', ki + key.length);
  if (start === -1) throw new Error('objek DATA tidak ditemui');
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('JSON DATA tidak seimbang');
}

/** Menghuraikan pembungkus HTML Apps Script dan mengembalikan objek roster. */
export function parseRosterWrapper(wrapper) {
  const marker = 'goog.script.init("';
  const si = wrapper.indexOf(marker);
  if (si === -1) throw new Error('Pembungkus Apps Script tidak dijangka (init tidak ditemui)');
  const start = si + marker.length;
  const endMarkers = ['", "", undefined', '","",undefined'];
  let end = -1;
  for (const m of endMarkers) {
    end = wrapper.indexOf(m, start);
    if (end !== -1) break;
  }
  if (end === -1) throw new Error('Hujung payload init tidak ditemui');
  const outer = JSON.parse(decodeJsString(wrapper.slice(start, end)));
  if (!outer.userHtml) throw new Error('userHtml tiada dalam payload');
  return JSON.parse(extractDataJson(outer.userHtml));
}

/** Bungkus data mentah dalam sampul API standard: `{ ok, period, data }`. */
export function rosterEnvelope(data, period) {
  return { ok: true, period: data?.roster?.periodKey || period || null, data };
}
