// The decision model, and the stand-ins it is measured against. It is the only
// model in the course: code reads the game and its code; the decision model picks
// one option from a menu the code wrote. Every check runs offline; the live route
// needs Ollama on this computer (http://127.0.0.1:11434).
//
// A picker has decide(text, labels, options) -> { choice, ms, model }. text says
// what the engine is stuck on, labels are the options in words. options are the
// options themselves, which only the stand-ins that are not models look at.

// ---------- stand-ins ----------

// Always option 0: the menu's own order, which puts the cheap-looking way first.
export const first = Object.freeze({ name: 'option 0', async decide() { return { choice: 0, ms: 1, model: 'option 0' }; } });

// A random pick, the same sequence for the same seed. The generator is
// mulberry32, which mixes every step, so neighbouring seeds give unrelated picks.
export function random(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { name: `random (seed ${seed})`, async decide(_text, labels) { return { choice: Math.floor(next() * labels.length), ms: 1, model: 'random' }; } };
}

// Your heuristic: engine.heuristic on a menu of repairs, option 0 on any other menu.
export function rule(engine) {
  return {
    name: 'your heuristic',
    async decide(_text, _labels, options) {
      const problem = options?.[0]?.problem;
      return { choice: problem ? engine.heuristic(problem, options) : 0, ms: 1, model: 'your heuristic' };
    },
  };
}

// Scripted pickers for the checks. decide is a list of choices replayed in order,
// or a function (text, labels, n, options) => choice; an entry 'unavailable'
// throws, as a model that is not running does. decideMs is what each decision is
// said to have taken: a number, or a list used in turn. When the list runs out the
// model is unavailable, unless repeat is true (the last entry is given again).
// calls records every question asked.
export function scripted({ decide = () => 0, decideMs = 3, repeat = false } = {}) {
  const calls = [];
  let n = 0;
  return {
    name: 'scripted',
    calls,
    async decide(text, labels, options) {
      const i = n++;
      calls.push({ text, labels });
      let choice;
      if (typeof decide === 'function') choice = await decide(text, labels, i, options);
      else {
        const entry = decide[repeat ? Math.min(i, decide.length - 1) : i];
        if (entry === undefined || entry === 'unavailable') throw new Error('the decision model is not available');
        choice = entry;
      }
      calls[calls.length - 1].choice = choice;
      return { choice, ms: Array.isArray(decideMs) ? decideMs[i % decideMs.length] : decideMs, model: 'scripted' };
    },
  };
}

// ---------- live (optional) ----------

const OLLAMA = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const SYSTEM = 'You choose the next step for a program that is working out a game it was not written for. Read the situation and the options, and answer with the number of the option most likely to work within what is left of the budget.';

async function post(path, body) {
  let res;
  try {
    res = await fetch(`${OLLAMA}${path}`, { method: 'POST', body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(`Ollama is not answering at ${OLLAMA} (${e.cause?.code ?? e.message}); start it, or use a stand-in`);
  }
  if (!res.ok) throw new Error(`Ollama said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// A decision model on Ollama. The model stays loaded while the run lasts; call
// unload() when it is over.
export function live(model = process.env.SIGHTLINE_DECISION_MODEL ?? 'llama3.2:1b') {
  return {
    name: model,
    async decide(text, labels) {
      const menu = labels.map((l, i) => `${i}: ${l}`).join('\n');
      const format = { type: 'object', properties: { choice: { type: 'integer', minimum: 0, maximum: labels.length - 1 } }, required: ['choice'] };
      const body = await post('/api/chat', { model, format, stream: false, keep_alive: '2m', options: { temperature: 0 }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Situation: ${text}\nOptions:\n${menu}\nAnswer with the number of the best option.` }] });
      let choice = 0;
      try { choice = JSON.parse(body.message?.content ?? '').choice; } catch { /* a reply that does not parse is option 0 */ }
      return { choice: Number.isInteger(choice) && choice >= 0 && choice < labels.length ? choice : 0, ms: Math.round((body.total_duration ?? 0) / 1e6), model };
    },
    async unload() { try { await post('/api/generate', { model, keep_alive: 0 }); } catch { /* not running: nothing to unload */ } },
  };
}
