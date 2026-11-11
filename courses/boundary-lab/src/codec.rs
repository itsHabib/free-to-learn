//! Supplied canonical framing. Sixteen-byte records; no evaluator or native code loader.
use crate::model::*;

fn word(b: &[u8], start: usize) -> u32 {
    u32::from_le_bytes(
        b[start..start + 4]
            .try_into()
            .expect("bounded supplied decoder"),
    )
}

pub fn decode(bytes: &[u8]) -> Result<Program, Fault> {
    if bytes.len() < 32
        || bytes.len() > 131_104
        || &bytes[..4] != b"SBX1"
        || word(bytes, 4) != 1
        || bytes[20..32].iter().any(|b| *b != 0)
    {
        return Err(Fault::InvalidImage);
    }
    let count = word(bytes, 8) as usize;
    let data_len = word(bytes, 12) as usize;
    let memory_len = word(bytes, 16);
    if count == 0
        || count > 4096
        || memory_len > 65_536
        || data_len > memory_len as usize
        || bytes.len() != 32 + count * 16 + data_len
    {
        return Err(Fault::InvalidImage);
    }
    let mut code = Vec::with_capacity(count);
    for b in bytes[32..32 + count * 16].chunks_exact(16) {
        if b[6] != 0 || b[7] != 0 {
            return Err(Fault::InvalidImage);
        }
        let (dst, a, c, d, e) = (b[1], b[2], b[3], b[4], b[5]);
        let imm = word(b, 8);
        let aux = word(b, 12);
        let instruction = match b[0] {
            0 => Instruction::Halt,
            1 => Instruction::Const { dst, value: imm },
            2 => Instruction::Add { dst, a, b: c },
            3 => Instruction::Xor { dst, a, b: c },
            4 => Instruction::Load8 { dst, addr: a },
            5 => Instruction::Store8 { addr: dst, src: a },
            6 => Instruction::Jump { target: imm },
            7 => Instruction::Jz {
                reg: dst,
                target: imm,
            },
            8 if dst <= 1 => Instruction::Invoke {
                write: dst == 1,
                handle: a,
                offset: c,
                mem: d,
                len: e,
                claimed_job: imm,
            },
            n => Instruction::Unknown(n),
        };
        // Canonical unused fields must be zero, so there is one representation per record.
        let canonical = encode_instruction(&instruction);
        if aux != 0 || canonical != b {
            return Err(Fault::InvalidImage);
        }
        code.push(instruction);
    }
    Ok(Program {
        code,
        initial: bytes[32 + count * 16..].to_vec(),
        memory_len,
    })
}

fn encode_instruction(i: &Instruction) -> [u8; 16] {
    let mut b = [0; 16];
    let imm = match *i {
        Instruction::Halt => 0,
        Instruction::Const { dst, value } => {
            b[0] = 1;
            b[1] = dst;
            value
        }
        Instruction::Add { dst, a, b: c } | Instruction::Xor { dst, a, b: c } => {
            b[0] = if matches!(i, Instruction::Add { .. }) {
                2
            } else {
                3
            };
            b[1] = dst;
            b[2] = a;
            b[3] = c;
            0
        }
        Instruction::Load8 { dst, addr } => {
            b[0] = 4;
            b[1] = dst;
            b[2] = addr;
            0
        }
        Instruction::Store8 { addr, src } => {
            b[0] = 5;
            b[1] = addr;
            b[2] = src;
            0
        }
        Instruction::Jump { target } => {
            b[0] = 6;
            target
        }
        Instruction::Jz { reg, target } => {
            b[0] = 7;
            b[1] = reg;
            target
        }
        Instruction::Invoke {
            write,
            handle,
            offset,
            mem,
            len,
            claimed_job,
        } => {
            b[0] = 8;
            b[1] = u8::from(write);
            b[2] = handle;
            b[3] = offset;
            b[4] = mem;
            b[5] = len;
            claimed_job
        }
        Instruction::Unknown(n) => {
            b[0] = n;
            0
        }
    };
    b[8..12].copy_from_slice(&imm.to_le_bytes());
    b
}

pub fn encode(program: &Program) -> Vec<u8> {
    let mut bytes = vec![0; 32];
    bytes[..4].copy_from_slice(b"SBX1");
    bytes[4..8].copy_from_slice(&1_u32.to_le_bytes());
    bytes[8..12].copy_from_slice(&(program.code.len() as u32).to_le_bytes());
    bytes[12..16].copy_from_slice(&(program.initial.len() as u32).to_le_bytes());
    bytes[16..20].copy_from_slice(&program.memory_len.to_le_bytes());
    for i in &program.code {
        bytes.extend_from_slice(&encode_instruction(i));
    }
    bytes.extend_from_slice(&program.initial);
    bytes
}
