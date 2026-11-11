import http from 'node:http';

/** Learner-safe HTTP plumbing. Assertions belong in your scenario. */
export function request(base, path, { method = 'GET', token, json } = {}) {
  const endpoint = new URL(base);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('Use the owned loopback HTTP origin.');
  const body = json === undefined ? undefined : JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) Object.assign(headers, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    const req = http.request({ hostname: endpoint.hostname, port: endpoint.port, path, method, headers }, (res) => {
      const chunks = [];
      let length = 0;
      res.on('data', (chunk) => {
        length += chunk.length;
        if (length > 262144) return res.destroy(new Error('Response exceeded the lab byte bound.'));
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(text); } catch { data = null; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.setTimeout(2000, () => req.destroy(new Error('Loopback request timed out.')));
    req.on('error', reject);
    req.end(body);
  });
}

export async function session(base) {
  const response = await request(base, '/session', { method: 'POST', json: {} });
  if (response.status !== 201) throw new Error(`Session failed: HTTP ${response.status}.`);
  return response.data;
}

export const submit = (base, token, requestBody) => request(base, '/repair', { method: 'POST', token, json: requestBody });

export async function state(base, token) {
  const response = await request(base, '/state', { token });
  if (response.status !== 200) throw new Error(`State failed: HTTP ${response.status}.`);
  return response.data;
}
