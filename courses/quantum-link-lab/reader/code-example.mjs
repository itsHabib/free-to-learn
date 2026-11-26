// Portable, dependency-free presentation for authored JavaScript/Python examples.
// This is lexical coloring, not a parser or a correctness check.
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keywords = new Set(('async await const let var function return throw new if else for of in try catch finally import from export class true false null undefined def return raise if else elif for in try except finally import from as True False None and or not is with').split(' '));
function color(line, language) {
  if (!['js','javascript','python','py'].includes(language)) return escape(line);
  const pattern = language === 'python' || language === 'py'
    ? /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b|\b[A-Za-z_]\w*\b/g
    : /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b|\b[A-Za-z_$][\w$]*\b/g;
  let result = '', end = 0;
  for (const match of line.matchAll(pattern)) {
    result += escape(line.slice(end, match.index));
    const token = match[0];
    const kind = /^(#|\/\/)/.test(token) ? 'comment' : /^["'`]/.test(token) ? 'string'
      : /^\d/.test(token) ? 'number' : keywords.has(token) ? 'keyword' : null;
    result += kind ? `<span class="cex-${kind}">${escape(token)}</span>` : escape(token);
    end = match.index + token.length;
  }
  return result + escape(line.slice(end));
}
export function renderCode(source, info = '') {
  const match = info.trim().match(/^(\S+)?(?:\s+(\{.*\}))?$/);
  if (!match) throw Error('Invalid code fence metadata');
  const language = match[1] || 'text';
  const meta = match[2] ? JSON.parse(match[2]) : {};
  if (!meta || Array.isArray(meta) || typeof meta !== 'object') throw Error('Code metadata must be an object');
  for (const name of ['file','region','title','change']) {
    if (meta[name] !== undefined && typeof meta[name] !== 'string') throw Error(`Invalid code ${name}`);
  }
  const lines = source.split('\n'), focus = meta.focus || [];
  if (!Array.isArray(focus) || focus.some(n => !Number.isInteger(n) || n < 1 || n > lines.length)) throw Error('Code emphasis must name existing lines');
  const label = meta.title || ({sh:'Terminal command',text:'Observed output',js:'JavaScript',python:'Python'})[language] || language;
  const location = meta.file ? `<span class="cex-location">${escape(meta.file)}${meta.region ? ` · ${escape(meta.region)}` : ''}</span>` : '';
  const change = meta.change ? `<p class="cex-change">${escape(meta.change)}</p>` : '';
  const emphasis = focus.length ? `<span class="cex-emphasis">Emphasized lines: ${focus.join(', ')}.</span>` : '';
  const code = lines.map((line, i) => `<span class="cex-line${focus.includes(i+1) ? ' cex-focus' : ''}">${color(line, language)}</span>`).join('\n');
  return `<figure class="code-example"><figcaption><strong>${escape(label)}</strong>${location}</figcaption>${change}<pre tabindex="0" aria-label="${escape(label)}; code scrolls horizontally when needed"><code>${code}</code></pre><div class="cex-foot">${emphasis} Select code to copy. Scroll horizontally if needed.</div></figure>`;
}
