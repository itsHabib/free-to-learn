import {renderCode} from './code-example.mjs';
export const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text, base) {
  return escapeHTML(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const url = new URL(href.replace(/&amp;/g, '&'), base);
    return ['http:', 'https:', 'file:'].includes(url.protocol) ? `<a href="${escapeHTML(url.href)}">${label}</a>` : label;
  }).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
// Small renderer for the course's authored Markdown. Raw HTML is never executed.
export function markdown(text, base) {
  const out = []; const lines = text.split('\n');
  let code = null, info = '', para = [], list = null;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), base)}</p>`); para = []; } };
  const closeList = () => { if (list) out.push(`</${list}>`); list = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush(); closeList();
      if (code !== null) { out.push(renderCode(code.join('\n'), info)); code = null; }
      else {code = []; info = line.slice(3).trim();}
      continue;
    }
    if (code !== null) { code.push(line); continue; }
    if (line.startsWith('<!--')) continue;
    // A line that is only a Markdown image is a figure: a local file beside the lesson or a web address.
    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image) {
      flush(); closeList();
      const url = new URL(image[2], base);
      if (['http:', 'https:', 'file:'].includes(url.protocol)) out.push(`<figure><img src="${escapeHTML(url.href)}" alt="${escapeHTML(image[1])}"></figure>`);
      continue;
    }
    if (!line.trim()) { flush(); closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) { flush(); closeList(); const n = Math.min(6, heading[1].length + 1); out.push(`<h${n}>${inline(heading[2], base)}</h${n}>`); continue; }
    const item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)/);
    if (item) { flush(); const kind = item[1] ? 'ul' : 'ol'; if (list !== kind) { closeList(); list = kind; out.push(`<${kind}>`); } out.push(`<li>${inline(item[2], base)}</li>`); continue; }
    if (line.startsWith('>')) { flush(); closeList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''), base)}</blockquote>`); continue; }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3}/.test(lines[i + 1] || '')) {
      flush(); closeList();
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
      out.push(`<div class="table-scroll"><table><thead><tr>${cells(line).map(c => `<th>${inline(c, base)}</th>`).join('')}</tr></thead><tbody>`); i++;
      while ((lines[i + 1] || '').startsWith('|')) out.push(`<tr>${cells(lines[++i]).map(c => `<td>${inline(c, base)}</td>`).join('')}</tr>`);
      out.push('</tbody></table></div>'); continue;
    }
    if (line === '<details>') { flush(); closeList(); out.push('<details>'); continue; }
    if (line === '</details>') { flush(); closeList(); out.push('</details>'); continue; }
    const summary = line.match(/^<summary>(.*)<\/summary>$/);
    if (summary) { flush(); out.push(`<summary>${inline(summary[1], base)}</summary>`); continue; }
    para.push(line);
  }
  flush(); closeList();
  if (code !== null) out.push(renderCode(code.join('\n'), info));
  return out.join('\n');
}
