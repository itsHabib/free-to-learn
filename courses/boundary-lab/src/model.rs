//! Supplied types and semantics. Learners edit learner.rs, not these safeguards.

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Instruction {
    Halt,
    Const {
        dst: u8,
        value: u32,
    },
    Add {
        dst: u8,
        a: u8,
        b: u8,
    },
    Xor {
        dst: u8,
        a: u8,
        b: u8,
    },
    Load8 {
        dst: u8,
        addr: u8,
    },
    Store8 {
        addr: u8,
        src: u8,
    },
    Jump {
        target: u32,
    },
    Jz {
        reg: u8,
        target: u32,
    },
    Invoke {
        write: bool,
        handle: u8,
        offset: u8,
        mem: u8,
        len: u8,
        claimed_job: u32,
    },
    Unknown(u8),
}

impl Instruction {
    pub fn registers(&self) -> Vec<u8> {
        match *self {
            Self::Halt | Self::Jump { .. } | Self::Unknown(_) => vec![],
            Self::Const { dst, .. } => vec![dst],
            Self::Add { dst, a, b } | Self::Xor { dst, a, b } => vec![dst, a, b],
            Self::Load8 { dst, addr } => vec![dst, addr],
            Self::Store8 { addr, src } => vec![addr, src],
            Self::Jz { reg, .. } => vec![reg],
            Self::Invoke {
                handle,
                offset,
                mem,
                len,
                ..
            } => vec![handle, offset, mem, len],
        }
    }
}

#[derive(Clone, Debug)]
pub struct Program {
    pub code: Vec<Instruction>,
    pub initial: Vec<u8>,
    pub memory_len: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Fault {
    InvalidImage,
    InvalidProgram,
    MemoryDenied,
    AuthorityDenied,
    BudgetExhausted,
    PhysicalGuard,
    UnsupportedEnvironment,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rights {
    pub read: bool,
    pub write: bool,
}

impl Rights {
    pub const READ: Self = Self {
        read: true,
        write: false,
    };
    pub const WRITE: Self = Self {
        read: false,
        write: true,
    };
}

#[derive(Clone, Debug)]
pub struct Grant {
    pub job: u32,
    pub slot: u16,
    pub generation: u16,
    pub object: usize,
    pub rights: Rights,
    pub base: u32,
    pub len: u32,
    pub epoch: u32,
}

impl Grant {
    pub fn handle(&self) -> u32 {
        (u32::from(self.generation) << 16) | u32::from(self.slot)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Request {
    pub handle: u32,
    pub claimed_job: u32,
    pub write: bool,
    pub offset: u32,
    pub len: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Budget {
    pub fuel: u32,
    pub calls: u32,
    pub read_bytes: u32,
    pub write_bytes: u32,
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            fuel: 100_000,
            calls: 64,
            read_bytes: 65_536,
            write_bytes: 65_536,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Cost {
    Step,
    Read(u32),
    Write(u32),
}

#[derive(Clone, Debug)]
pub struct World {
    pub objects: Vec<Vec<u8>>,
    pub grants: Vec<Grant>,
}

/// Supplied trusted-configuration check; malformed grants are not a guest policy challenge.
pub fn valid_world(world: &World) -> bool {
    if world.objects.len() > 4
        || world.grants.len() > 4
        || world.objects.iter().any(|o| o.len() > 65_536)
    {
        return false;
    }
    let mut slots = Vec::new();
    for grant in &world.grants {
        let Some(object) = world.objects.get(grant.object) else {
            return false;
        };
        let Some(end) = grant.base.checked_add(grant.len) else {
            return false;
        };
        if end as usize > object.len() || slots.contains(&(grant.job, grant.slot)) {
            return false;
        }
        slots.push((grant.job, grant.slot));
    }
    true
}

#[derive(Clone, Copy, Debug)]
pub struct Queued {
    pub principal: u32,
    pub handle: u32,
    pub admitted_epoch: u32,
    pub write: bool,
    pub offset: u32,
    pub len: u32,
}

/// Pure policy-model values. These are not a syscall ABI or a kernel filter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Abi {
    NativeX86_64,
    X32,
    Other,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Call {
    Read,
    Write,
    Exit,
    Unknown,
}
#[derive(Clone, Copy, Debug)]
pub struct SyscallQuery {
    pub abi: Abi,
    pub call: Call,
    pub fd: u32,
}
#[derive(Clone, Copy, Debug)]
pub struct SealEvidence {
    pub nnp_verified: bool,
    pub filter_installed: bool,
    pub descriptors_clean: bool,
}

/// These are the learner-owned security decisions. Native syscall sealing is NOT implemented.
pub trait Policy {
    fn validate(code: &[Instruction]) -> Result<(), Fault>;
    fn range(logical_len: u32, offset: u32, len: u32) -> bool;
    fn authorize(grants: &[Grant], actual_job: u32, request: Request) -> Result<usize, Fault>;
    fn charge(before: Budget, cost: Cost) -> Result<Budget, Fault>;
    fn queued(grants: &[Grant], current_epoch: u32, request: Queued) -> bool;
    fn modeled_syscall(query: SyscallQuery) -> bool;
    fn modeled_seal(evidence: SealEvidence) -> bool;
}
