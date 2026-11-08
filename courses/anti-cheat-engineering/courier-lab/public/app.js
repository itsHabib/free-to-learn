const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'ivy.courier.session.v1';
let storageUnavailable = false;
function savedToken() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    return /^[A-Za-z0-9_-]{43}$/.test(saved ?? '') ? saved : null;
  } catch { storageUnavailable = true; return null; }
}
function rememberToken(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    if (!value) sessionStorage.removeItem(SESSION_KEY);
  } catch { storageUnavailable = true; }
}
let token = savedToken();
let connected = false;
let sequence = 0;
let direction = 'idle';
let pendingInteraction = false;
let sending = false;
let pollBusy = false;
let traceUntil = 0;
let lastDecisionKey = '';
const keys = new Map([['ArrowUp','N'],['w','N'],['ArrowLeft','W'],['a','W'],['ArrowDown','S'],['s','S'],['ArrowRight','E'],['d','E']]);
const heldKeys = new Map();

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(3000),
  });
  const body = await response.json();
  return { status: response.status, body };
}
function setConnected(value, message) {
  connected = value;
  $('connection').textContent = value ? 'Connected' : 'Disconnected';
  $('connection').classList.toggle('online', value);
  $('connect').textContent = value ? 'Connected to local server' : token ? 'Reconnect session' : 'Connect to server';
  $('connect').disabled = value;
  $('connect').hidden = value;
  $('interact').disabled = !value;
  $('forge').disabled = !value;
  document.querySelectorAll('[data-move]').forEach((button) => { button.disabled = !value; });
  if (message) $('announcement').textContent = message;
  if (value) return;
  direction = 'idle';
  heldKeys.clear();
  pendingInteraction = false;
  updatePressed();
}
function updatePressed() {
  document.querySelectorAll('[data-move]').forEach((button) => button.classList.toggle('pressed', button.dataset.move === direction));
}
function showTrace(input, result, sticky = false) {
  if (!sticky && Date.now() < traceUntil) return;
  if (sticky) traceUntil = Date.now() + 5000;
  $('exchange').textContent = `POST /input\n${JSON.stringify(input, null, 2)}\n\nHTTP ${result.status}\n${JSON.stringify(result.body, null, 2)}`;
}
function render(state) {
  $('score').textContent = state.actor.score;
  $('cargo').textContent = state.actor.cargo ? 'Core aboard' : 'Empty';
  $('tick').textContent = state.tick;
  $('actor').setAttribute('transform', `translate(${state.actor.x} ${state.actor.y})`);
  $('core').setAttribute('transform', `translate(${state.core.x} ${state.core.y})`);
  $('core').style.visibility = state.actor.cargo ? 'hidden' : 'visible';
  $('objective').textContent = state.actor.cargo ? 'Return to the depot. Interact to deliver the core.' : 'Reach the yellow core. Interact to collect it.';
  $('arena-desc').textContent = `Server tick ${state.tick}. Courier at ${state.actor.x}, ${state.actor.y} millimetres. ${state.actor.cargo ? 'Carrying the core.' : 'No cargo.'} Delivered ${state.actor.score}. Core at ${state.core.x}, ${state.core.y}. Depot at 1000, 1000.`;
  $('findings').textContent = `Advisory records: ${state.findings.length}. Three distant range denials (>500 mm) in 20 processed ticks make a record. Cooldown and near-boundary attempts are excluded. This is a review signal, never a ban or proof of intent.`;
  if (!state.lastDecision) return;
  const decision = state.lastDecision;
  $('decision').textContent = `Tick ${decision.tick}: ${decision.status} — ${decision.reason}.`;
  const key = JSON.stringify(decision);
  if (key === lastDecisionKey) return;
  lastDecisionKey = key;
  const messages = { pickup: 'Core collected. Return to the depot.', deposit: 'Delivery confirmed by the server.', range: 'Interaction denied: move within 250 mm of the target.', cooldown: 'Interaction denied: wait four ticks after a successful interaction.' };
  $('announcement').textContent = messages[decision.reason] ?? 'Server decision received.';
}
async function poll() {
  if (!connected || pollBusy) return;
  pollBusy = true;
  try {
    const result = await request('/state');
    if (result.status !== 200) throw new Error('Session unavailable. Restart the page for a new session if the server restarted.');
    render(result.body);
  } catch (error) {
    setConnected(false, `Connection lost. ${error.message}`);
  } finally { pollBusy = false; }
}
async function sendInput(extra = {}) {
  if (!connected || sending) return;
  sending = true;
  const interaction = pendingInteraction;
  pendingInteraction = false;
  const input = { v: 1, seq: ++sequence, move: direction, interact: interaction, ...extra };
  try {
    const result = await request('/input', { method: 'POST', body: JSON.stringify(input) });
    showTrace(input, result, interaction || Object.keys(extra).length > 0);
    if (result.status === 401) throw new Error('Session no longer exists. Reload to start a new session.');
    if ('score' in extra) $('announcement').textContent = `Forged score request: HTTP ${result.status}, ${result.body.reason ?? result.body.error ?? result.body.status}. Check the server score above.`;
  } catch (error) {
    setConnected(false, `Input failed. ${error.message}`);
  } finally { sending = false; }
}
async function connect() {
  $('connect').disabled = true;
  try {
    let result = token ? await request('/state') : null;
    if (result?.status === 401) {
      token = null;
      sequence = 0;
      rememberToken(null);
    }
    if (!token) {
      const joined = await request('/join', { method: 'POST' });
      if (joined.status === 429) throw new Error('All four lab slots are in use. Reuse a saved tab, or restart your local server to begin a fresh run.');
      if (joined.status !== 201) throw new Error(joined.body.reason ?? joined.body.error ?? 'Cannot create session.');
      token = joined.body.token;
      rememberToken(token);
      result = await request('/state');
    }
    if (result.status !== 200) throw new Error('The session is unavailable. Retry once the local server is running.');
    sequence = Math.max(sequence, result.body.actor.lastSeq);
    const notice = storageUnavailable ? ' Session storage is unavailable; this tab works, but reloading may consume another slot.' : ' This tab resumes the same session after a reload.';
    setConnected(true, 'Connected. Move to the core and interact.' + notice);
    render(result.body);
    if ($('exchange').textContent.startsWith('Connect to see')) $('exchange').textContent = 'Send an input to inspect its request and result.';
  } catch (error) { setConnected(false, error.message); }
}
$('connect').addEventListener('click', connect);
$('interact').addEventListener('click', () => { pendingInteraction = true; void sendInput(); });
$('forge').addEventListener('click', () => { if (!sending) void sendInput({ score: 999 }); });
for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown', (event) => {
    if (!connected) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    direction = button.dataset.move;
    updatePressed();
    void sendInput();
  });
  const release = () => { direction = 'idle'; updatePressed(); void sendInput(); };
  button.addEventListener('keydown', (event) => {
    if (!connected || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    direction = button.dataset.move;
    updatePressed();
    if (!event.repeat) void sendInput();
  });
  button.addEventListener('keyup', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    release();
  });
  button.addEventListener('blur', release);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
window.addEventListener('keydown', (event) => {
  if (!connected || event.target.closest('input,textarea,select')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (keys.has(key)) {
    event.preventDefault();
    heldKeys.set(key, keys.get(key));
    direction = [...heldKeys.values()].at(-1);
    updatePressed();
    if (!event.repeat) void sendInput();
  }
  if (event.code !== 'Space' || event.target.closest('button') || event.repeat) return;
  event.preventDefault();
  pendingInteraction = true;
  void sendInput();
});
window.addEventListener('keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!keys.has(key)) return;
  heldKeys.delete(key);
  direction = [...heldKeys.values()].at(-1) ?? 'idle';
  updatePressed();
  void sendInput();
});
window.addEventListener('blur', () => { direction = 'idle'; heldKeys.clear(); updatePressed(); void sendInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { direction = 'idle'; heldKeys.clear(); updatePressed(); void sendInput(); } });
setConnected(false);
setInterval(() => { if (direction !== 'idle' || pendingInteraction) void sendInput(); }, 100);
setInterval(poll, 150);

if (token) void connect();
