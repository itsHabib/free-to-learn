//! Supplied portable execution machinery. No unsafe code, OS filter, processes or network.
use crate::model::*;

#[derive(Clone, Debug)]
pub struct Admitted {
    program: Program,
}

#[derive(Debug)]
pub struct RunReport {
    pub outcome: Result<(), Fault>,
    pub steps: u32,
    pub memory: Vec<u8>,
    pub remaining: Budget,
}

pub fn admit<P: Policy>(program: &Program) -> Result<Admitted, Fault> {
    if program.code.is_empty()
        || program.code.len() > 4096
        || program.memory_len > 65_536
        || program.initial.len() > program.memory_len as usize
    {
        return Err(Fault::InvalidImage);
    }
    P::validate(&program.code)?;
    // Supplied ownership boundary: execution never borrows the caller's mutable image.
    Ok(Admitted {
        program: program.clone(),
    })
}

pub fn run<P: Policy>(program: &Program, job: u32, world: &mut World, budget: Budget) -> RunReport {
    match admit::<P>(program) {
        Ok(admitted) => run_admitted::<P>(&admitted, job, world, budget),
        Err(fault) => RunReport {
            outcome: Err(fault),
            steps: 0,
            memory: vec![],
            remaining: budget,
        },
    }
}

pub fn run_admitted<P: Policy>(
    admitted: &Admitted,
    job: u32,
    world: &mut World,
    budget: Budget,
) -> RunReport {
    if !valid_world(world) {
        return RunReport {
            outcome: Err(Fault::InvalidImage),
            steps: 0,
            memory: vec![],
            remaining: budget,
        };
    }
    let program = &admitted.program;
    let logical = program.memory_len as usize;
    // Sixteen synthetic guard bytes make logical escape observable without native UB.
    let mut arena = vec![0_u8; logical + 16];
    arena[logical..].fill(0xA7);
    arena[..program.initial.len()].copy_from_slice(&program.initial);
    let mut staged = world.clone();
    let mut remaining = budget;
    let mut steps = 0;
    let outcome = interpret::<P>(
        program,
        job,
        &mut staged,
        &mut arena,
        &mut remaining,
        &mut steps,
    );
    if outcome.is_ok() {
        *world = staged;
    }
    RunReport {
        outcome,
        steps,
        memory: arena[..logical].to_vec(),
        remaining,
    }
}

fn checked_slice<P: Policy>(
    logical: u32,
    arena_len: usize,
    offset: u32,
    len: u32,
) -> Result<std::ops::Range<usize>, Fault> {
    if !P::range(logical, offset, len) {
        return Err(Fault::MemoryDenied);
    }
    let end = offset.checked_add(len).ok_or(Fault::PhysicalGuard)?;
    if end as u64 > arena_len as u64 {
        return Err(Fault::PhysicalGuard);
    }
    Ok(offset as usize..end as usize)
}

fn invoke<P: Policy>(
    program: &Program,
    actual_job: u32,
    request: Request,
    mem: u32,
    world: &mut World,
    arena: &mut [u8],
    remaining: &mut Budget,
) -> Result<(), Fault> {
    let guest = checked_slice::<P>(program.memory_len, arena.len(), mem, request.len)?;
    let grant_index = P::authorize(&world.grants, actual_job, request)?;
    let grant = world
        .grants
        .get(grant_index)
        .ok_or(Fault::PhysicalGuard)?
        .clone();
    let start = grant
        .base
        .checked_add(request.offset)
        .ok_or(Fault::PhysicalGuard)? as usize;
    let end = start
        .checked_add(request.len as usize)
        .ok_or(Fault::PhysicalGuard)?;
    let object = world
        .objects
        .get_mut(grant.object)
        .ok_or(Fault::PhysicalGuard)?;
    let target = object.get_mut(start..end).ok_or(Fault::PhysicalGuard)?;
    let cost = if request.write {
        Cost::Write(request.len)
    } else {
        Cost::Read(request.len)
    };
    let next = P::charge(*remaining, cost)?;
    if request.write {
        target.copy_from_slice(&arena[guest]);
    } else {
        arena[guest].copy_from_slice(target);
    }
    *remaining = next;
    Ok(())
}

fn interpret<P: Policy>(
    program: &Program,
    job: u32,
    world: &mut World,
    arena: &mut [u8],
    remaining: &mut Budget,
    steps: &mut u32,
) -> Result<(), Fault> {
    let mut registers = [0_u32; 8];
    let mut pc = 0_usize;
    loop {
        // A supplied emergency guard protects the lab if learner fuel logic is broken.
        // Hitting it is PhysicalGuard, never a successful budget-policy verdict.
        if *steps >= 100_001 {
            return Err(Fault::PhysicalGuard);
        }
        let instruction = program.code.get(pc).ok_or(Fault::PhysicalGuard)?;
        if instruction.registers().iter().any(|r| *r >= 8) {
            return Err(Fault::PhysicalGuard);
        }
        *remaining = P::charge(*remaining, Cost::Step)?;
        *steps += 1;
        pc += 1;
        match *instruction {
            Instruction::Halt => return Ok(()),
            Instruction::Const { dst, value } => registers[dst as usize] = value,
            Instruction::Add { dst, a, b } => {
                registers[dst as usize] = registers[a as usize].wrapping_add(registers[b as usize])
            }
            Instruction::Xor { dst, a, b } => {
                registers[dst as usize] = registers[a as usize] ^ registers[b as usize]
            }
            Instruction::Load8 { dst, addr } => {
                let range = checked_slice::<P>(
                    program.memory_len,
                    arena.len(),
                    registers[addr as usize],
                    1,
                )?;
                registers[dst as usize] = u32::from(arena[range.start]);
            }
            Instruction::Store8 { addr, src } => {
                let range = checked_slice::<P>(
                    program.memory_len,
                    arena.len(),
                    registers[addr as usize],
                    1,
                )?;
                arena[range.start] = registers[src as usize] as u8;
            }
            Instruction::Jump { target } => pc = target as usize,
            Instruction::Jz { reg, target } => {
                if registers[reg as usize] == 0 {
                    pc = target as usize;
                }
            }
            Instruction::Invoke {
                write,
                handle,
                offset,
                mem,
                len,
                claimed_job,
            } => {
                let request = Request {
                    handle: registers[handle as usize],
                    claimed_job,
                    write,
                    offset: registers[offset as usize],
                    len: registers[len as usize],
                };
                invoke::<P>(
                    program,
                    job,
                    request,
                    registers[mem as usize],
                    world,
                    arena,
                    remaining,
                )?;
            }
            Instruction::Unknown(_) => return Err(Fault::PhysicalGuard),
        }
    }
}
