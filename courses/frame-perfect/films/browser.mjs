// A headless Chrome and a static file server, both owned by one script and both closed when it ends.
// Used by films/build.mjs to render stills and by films/check-bench.mjs to try the bench page.
// Chrome is driven over its DevTools protocol with Node's built-in WebSocket: nothing to install.
// On a shared machine, run one headless Chrome at a time.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.json': 'application/json', '.movie': 'text/plain' };
export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Serves root on 127.0.0.1 at a free port. Returns { url, close }.
export function serve(root) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }) })));
}

// Starts headless Chrome with a throwaway profile under scratch. Returns a page object.
export async function launch(scratch) {
  const profile = mkdtempSync(join(scratch, 'chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--mute-audio', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  // However this script ends, crash included, its Chrome goes with it.
  const reap = () => { try { proc.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  process.on('exit', reap);
  // Chrome creates DevToolsActivePort before it writes the port into it, so wait for a number.
  const portFile = join(profile, 'DevToolsActivePort');
  let port = '';
  for (let i = 0; i < 200 && !/^\d+$/.test(port); i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  }
  if (!/^\d+$/.test(port)) { proc.kill(); throw new Error('Chrome did not start'); }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let id = 0;
  const waiting = new Map(), listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { const { ok, bad } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? bad(new Error(msg.error.message)) : ok(msg.result); }
    else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}) => new Promise((ok, bad) => { const n = ++id; waiting.set(n, { ok, bad }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');
  const errors = [];
  listeners.push((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const page = {
    errors,
    async size(width, height, scale = 1, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile }); },
    async goto(url) {
      const loaded = new Promise((ok) => listeners.push(function once(msg) { if (msg.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(once), 1); ok(); } }));
      await send('Page.navigate', { url });
      await loaded;
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip });
      return Buffer.from(r.data, 'base64');
    },
    async close() {
      try { ws.close(); } catch {}
      proc.kill();
      await new Promise((r) => setTimeout(r, 300));
      if (proc.exitCode === null) proc.kill('SIGKILL');
      rmSync(profile, { recursive: true, force: true });
    },
  };
  return page;
}
