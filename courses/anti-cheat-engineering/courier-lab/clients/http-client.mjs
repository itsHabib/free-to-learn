import http from 'node:http';

export function localEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('This teaching client only connects to an owned loopback HTTP server.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a plain loopback origin such as http://127.0.0.1:8787.');
  }
  return url;
}

/** Raw HTTP is intentional: tests can exercise malformed bodies and headers. */
export function request(base, path, { method = 'GET', token, json, body, headers = {}, agent } = {}) {
  const endpoint = localEndpoint(base);
  const payload = json === undefined ? body : JSON.stringify(json);
  const requestHeaders = { ...headers };
  if (json !== undefined && !Object.hasOwn(requestHeaders, 'Content-Type')) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (payload !== undefined) requestHeaders['Content-Length'] = Buffer.byteLength(payload);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: endpoint.hostname, port: endpoint.port, path, method,
      headers: requestHeaders, agent,
    }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          res.destroy(new Error('Teaching server response exceeded 1 MiB.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = JSON.parse(text); } catch { /* Preserve non-JSON rejection bodies. */ }
        resolve({ status: res.statusCode, headers: res.headers, data, text });
      });
    });
    req.setTimeout(7000, () => req.destroy(new Error('Loopback HTTP request timed out.')));
    req.on('error', reject);
    req.end(payload);
  });
}

export async function join(base, options) {
  const result = await request(base, '/join', { method: 'POST', json: {}, ...options });
  if (result.status !== 201 || typeof result.data?.token !== 'string' || typeof result.data?.id !== 'string') {
    throw new Error(`Join failed with HTTP ${result.status}: ${result.text}`);
  }
  return result.data;
}

export function input(base, token, seq, move = 'idle', interact = false, options = {}) {
  return request(base, '/input', { method: 'POST', token, json: { v: 1, seq, move, interact }, ...options });
}

export async function state(base, token, options = {}) {
  const result = await request(base, '/state', { token, ...options });
  if (result.status !== 200 || !result.data?.actor) throw new Error(`State failed with HTTP ${result.status}: ${result.text}`);
  return result.data;
}
