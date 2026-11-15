import { fail, expectSame, show, fixtureJson } from './harness.mjs';
import { gameBytes } from '../host.mjs';

export const title = 'Take the code apart';
const L = 'lesson 04';
const norm = (v) => (typeof v === 'bigint' ? `${v}n` : Array.isArray(v) ? v.slice() : v);
const opsOf = (ins) => ins.map((x) => [x.op, ...(x.imm ?? []).map(norm)]);

async function decodeAll(fn, game) {
  const parseModule = await fn('wasm.mjs', 'parseModule');
  const decode = await fn('wasm.mjs', 'decode');
  const mod = parseModule(gameBytes(game));
  return { mod, decode, oracle: fixtureJson(`oracle/${game}-decode.json`) };
}

// A module assembled by hand: one function, () -> i32, whose body is
//   block  loop  i32.const 1  br_if 0  end  end
//   i32.const 1  if (result i32)  i32.const 2  else  i32.const 3  end  end
// Neither game has an else, so this is where else gets checked.
const HAND = Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00,
  0x0a, 0x18, 0x01, 0x16, 0x00, 0x02, 0x40, 0x03, 0x40, 0x41, 0x01, 0x0d, 0x00, 0x0b, 0x0b, 0x41, 0x01, 0x04, 0x7f, 0x41, 0x02, 0x05, 0x41, 0x03, 0x0b, 0x0b]);
const HAND_OPS = ['block', 'loop', 'i32.const', 'br_if', 'end', 'end', 'i32.const', 'if', 'i32.const', 'else', 'i32.const', 'end', 'end'];
const HAND_DEPTHS = [1, 2, 3, 3, 2, 1, 1, 1, 2, 1, 2, 1, 0];

export const cases = [
  {
    id: '04-sections', title: 'parseModule reads the sections of the game file',
    requirement: 'The counts of types, imports, functions, exports and data segments match the file; exports are { name, kind, index }; funcName names imports as module.name and unnamed functions funcN.',
    reread: `${L}, what each section holds`,
    async run({ fn }) {
      const { mod, oracle } = await decodeAll(fn, 'lob');
      const got = { types: mod?.types?.length, imports: mod?.imports?.map((i) => `${i.module}.${i.name}`), importedFuncs: mod?.importedFuncs, functions: mod?.code?.length, exports: mod?.exports?.length, data: mod?.data?.length };
      expectSame(got, oracle.counts, { checked: 'parseModule on game/lob.wasm', input: 'game/lob.wasm', what: 'counts' });
      const tick = mod.exports.find((e) => e.name === 'game_tick');
      if (tick?.kind !== 0 || !Number.isInteger(tick?.index)) fail({ checked: 'the export entry for game_tick', observed: show(tick), expected: '{ name: "game_tick", kind: 0, index: <function index> }, kind being the export kind byte (0 for a function)' });
      const funcName = await fn('wasm.mjs', 'funcName');
      expectSame([funcName(mod, 1), funcName(mod, 4), funcName(mod, 5)], ['env.cos', 'game_init', 'func5'], { checked: 'funcName for an import, an export and an unnamed function', input: 'functions 1, 4 and 5 of game/lob.wasm', what: 'names' });
    },
  },
  {
    id: '04-leb', title: 'readU32 and readS32 read LEB128, padded or not',
    requirement: 'Unsigned and signed LEB128, including negative numbers and the padded 5-byte form the linker writes.',
    reread: `${L}, signed numbers and the first bytes`,
    async run({ fn }) {
      const readU32 = await fn('wasm.mjs', 'readU32');
      const readS32 = await fn('wasm.mjs', 'readS32');
      const u = [[[0xa0, 0xe2, 0x04], 78112, 3], [[0xa0, 0xe2, 0x84, 0x80, 0x00], 78112, 5], [[0x7f], 127, 1], [[0xe5, 0x8e, 0x26], 624485, 3]];
      for (const [bytes, value, next] of u) expectSame(readU32(Uint8Array.from(bytes), 0), { value, next }, { checked: 'readU32', input: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '), what: 'result' });
      const s = [[[0x7f], -1, 1], [[0xd4, 0x7d], -300, 2], [[0x80, 0x7f], -128, 2], [[0x80, 0xa0, 0x7f], -12288, 3], [[0x3f], 63, 1]];
      for (const [bytes, value, next] of s) expectSame(readS32(Uint8Array.from(bytes), 0), { value, next }, { checked: 'readS32', input: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '), what: 'result' });
    },
  },
  {
    id: '04-depth', title: 'every function decodes to its end with the right block depths',
    requirement: 'Each function\'s last instruction is the end at depth 0; block, loop and if open a level; else and end show at their opening\'s depth. A hand-assembled function checks else, which neither game uses.',
    reread: `${L}, blocks and depth`,
    async run({ fn }) {
      const { mod, decode, oracle } = await decodeAll(fn, 'lob');
      for (const f of oracle.functions) {
        const ins = decode(mod, f.index);
        const last = ins?.[ins.length - 1];
        if (!last || last.op !== 'end' || last.depth !== 0) fail({ checked: `decode of ${f.name} ends at depth 0`, observed: `last instruction ${show(last)}`, expected: '{ op: "end", depth: 0 }' });
        const want = [];
        let depth = 1;
        for (const [op] of f.ops) {
          if (op === 'end' || op === 'else') depth--;
          want.push(depth);
          if (op === 'block' || op === 'loop' || op === 'if' || op === 'else') depth++;
        }
        const got = ins.map((x) => x.depth);
        const k = got.findIndex((d, i) => d !== want[i]);
        if (k >= 0 || got.length !== want.length) fail({ checked: `block depths in ${f.name}`, observed: k >= 0 ? `instruction ${k} (${ins[k].op}) at depth ${got[k]}` : `${got.length} instructions`, expected: k >= 0 ? `depth ${want[k]}` : `${want.length} instructions` });
      }
      const parseModule = await fn('wasm.mjs', 'parseModule');
      const hand = decode(parseModule(HAND), 0);
      const rows = (hand ?? []).map((x) => `${x.op}@${x.depth}`), wantRows = HAND_OPS.map((op, i) => `${op}@${HAND_DEPTHS[i]}`);
      const j = wantRows.findIndex((r, i) => rows[i] !== r);
      if (j >= 0 || rows.length !== wantRows.length) fail({ checked: 'decode of a hand-assembled function with if, else and nested blocks', input: 'block loop i32.const br_if end end i32.const if i32.const else i32.const end end', observed: j >= 0 ? `instruction ${j}: ${rows[j] ?? 'missing'}` : `${rows.length} instructions`, expected: j >= 0 ? `${wantRows[j]} (op@depth)` : `${wantRows.length} instructions`, });
    },
  },
  {
    id: '04-immediates', title: 'memory offsets and float constants come out exact',
    requirement: 'A memory access gives [align, offset]; f32.const gives a 4-byte float.',
    reread: `${L}, instructions and their immediates`,
    async run({ fn }) {
      const { mod, decode, oracle } = await decodeAll(fn, 'lob');
      const tick = oracle.functions.find((f) => f.name === 'game_tick');
      const got = opsOf(decode(mod, tick.index));
      const pick = (ops) => ops.filter((o) => /load|store|f32\.const/.test(o[0]));
      const a = pick(got), b = pick(tick.ops);
      const k = a.findIndex((o, i) => JSON.stringify(o) !== JSON.stringify(b[i]));
      if (k >= 0 || a.length !== b.length) fail({ checked: 'memory accesses and float constants in game_tick', observed: k >= 0 ? show(a[k]) : `${a.length} of them`, expected: k >= 0 ? show(b[k]) : `${b.length} of them` });
    },
  },
  {
    id: '04-decode', title: 'every function of Lob decodes exactly as llvm-objdump reads it',
    requirement: 'For every function of game/lob.wasm, every instruction and immediate matches the course\'s record of the file, which agrees with llvm-objdump instruction for instruction.',
    reread: `${L}, instructions and their immediates`,
    async run({ fn }) {
      for (const game of ['lob']) {
        const { mod, decode, oracle } = await decodeAll(fn, game);
        const bytes = gameBytes(game);
        for (const f of oracle.functions) {
          const ins = decode(mod, f.index);
          const bad = (ins ?? []).find((x) => x.code !== bytes[x.offset]);
          if (bad) fail({ checked: `the code of each instruction in ${f.name}`, observed: `${show(bad)}: the byte at offset ${bad.offset} is ${bytes[bad.offset]}`, expected: 'code is the opcode byte at the instruction\'s offset (0xFC for the prefixed ones): the lifter looks instructions up by it' });
          const got = opsOf(ins);
          const k = got.findIndex((o, i) => JSON.stringify(o) !== JSON.stringify(f.ops[i]));
          if (k >= 0 || got.length !== f.ops.length) fail({ checked: `decode of ${f.name} in ${game}.wasm`, observed: k >= 0 ? `instruction ${k}: ${show(got[k])}` : `${got.length} instructions`, expected: k >= 0 ? `${show(f.ops[k])}` : `${f.ops.length} instructions` });
        }
      }
    },
  },
  {
    id: '04-prefix', title: 'instructions behind the 0xFC prefix decode',
    requirement: 'The saturating conversions (0xFC 0 to 7) decode with their names.',
    reread: `${L}, instructions and their immediates`,
    async run({ fn }) {
      const { mod, decode, oracle } = await decodeAll(fn, 'lob');
      const want = oracle.functions.flatMap((f) => f.ops.map((o) => o[0])).filter((op) => op.includes('trunc_sat')).length;
      const got = oracle.functions.flatMap((f) => decode(mod, f.index).map((x) => x.op)).filter((op) => String(op).includes('trunc_sat')).length;
      expectSame(got, want, { checked: 'saturating conversions found across game/lob.wasm', input: 'every function', what: 'count' });
    },
  },

  {
    id: '04-names', title: 'funcName and funcType name and type every function',
    requirement: 'funcName(mod, index) gives an import\'s module.name, an export\'s name, or funcN; funcType(mod, index) gives { params, results } for imported and defined functions alike.',
    reread: `${L}, what each section holds`,
    async run({ fn }) {
      const parseModule = await fn('wasm.mjs', 'parseModule');
      const funcName = await fn('wasm.mjs', 'funcName');
      const funcType = await fn('wasm.mjs', 'funcType');
      const mod = parseModule(gameBytes('lob'));
      expectSame([funcName(mod, 0), funcName(mod, 2), funcName(mod, 7), funcName(mod, 6)], ['env.server_round', 'env.sin', 'game_key', 'func6'], { checked: 'funcName for imports, an export and an unnamed function', input: 'functions 0, 2, 7 and 6 of game/lob.wasm', what: 'names' });
      expectSame([funcType(mod, 0), funcType(mod, 2), funcType(mod, 3), funcType(mod, 4), funcType(mod, 7), funcType(mod, 9)], [{ params: ['i32'], results: ['i32'] }, { params: ['f64'], results: ['f64'] }, { params: [], results: ['f32'] }, { params: ['i32', 'i32'], results: [] }, { params: ['i32'], results: [] }, { params: [], results: ['f32'] }], { checked: 'funcType for env.server_round, env.sin, env.server_wind, game_init, game_key and r_angle', what: 'types' });
    },
  },
  {
    id: '04-listing', title: 'listing prints one line per instruction, indented by depth, with notes',
    requirement: 'listing(mod, index, notes) prints a header (func NAME (param ...) (result ...)), then one line per instruction indented two spaces per depth, with notes[i] after ";;" where given; a call shows the callee\'s name.',
    reread: `${L}, blocks and depth`,
    async run({ fn }) {
      const parseModule = await fn('wasm.mjs', 'parseModule');
      const listing = await fn('wasm.mjs', 'listing');
      const decode = await fn('wasm.mjs', 'decode');
      const mod = parseModule(gameBytes('lob'));
      const idx = mod.exports.find((e) => e.name === 'game_key').index;
      const ins = decode(mod, idx);
      const notes = [];
      notes[1] = 'the pointer';
      const text = listing(mod, idx, notes);
      const lines = String(text).split('\n');
      if (lines.length !== ins.length + 1) fail({ checked: 'the number of lines in the listing of game_key', observed: `${lines.length}`, expected: `${ins.length + 1}: a header and one line per instruction` });
      if (!/^\(func game_key \(param i32\) \(result -\)\)$/.test(lines[0])) fail({ checked: 'the header line', observed: show(lines[0]), expected: '"(func game_key (param i32) (result -))"' });
      if (!/^  i32\.load offset=78112\s+;; the pointer$/.test(lines[2])) fail({ checked: 'the second instruction with a note', observed: show(lines[2]), expected: 'two spaces, "i32.load offset=78112", then ";; the pointer"' });
      const call = lines.find((l) => /call 5/.test(l));
      if (!call || !/call 5 <func5>/.test(call)) fail({ checked: 'a call in the listing', observed: show(call), expected: 'a line "call 5 <func5>"' });
      const deep = ins.findIndex((x) => x.depth === 3);
      if (deep < 0 || !lines[deep + 1].startsWith('      ') || lines[deep + 1].startsWith('       ')) fail({ checked: 'indentation by depth', observed: show(lines[deep + 1]), expected: 'six spaces before an instruction at depth 3' });
    },
  },
  {
    id: '04-lob2', title: 'every function of Lob II decodes too',
    requirement: 'For every function of game/lob2.wasm, every instruction and immediate matches the course\'s record of the file.',
    reread: `${L}, instructions and their immediates`,
    async run({ fn }) {
      const { mod, decode, oracle } = await decodeAll(fn, 'lob2');
      for (const f of oracle.functions) {
        const got = opsOf(decode(mod, f.index));
        const k = got.findIndex((o, i) => JSON.stringify(o) !== JSON.stringify(f.ops[i]));
        if (k >= 0 || got.length !== f.ops.length) fail({ checked: `decode of ${f.name} in lob2.wasm`, observed: k >= 0 ? `instruction ${k}: ${show(got[k])}` : `${got.length} instructions`, expected: k >= 0 ? `${show(f.ops[k])}` : `${f.ops.length} instructions` });
      }
    },
  },
];
