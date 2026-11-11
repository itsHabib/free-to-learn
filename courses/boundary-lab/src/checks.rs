//! Public practice cases. These cases and their expectations are intentionally inspectable.
use crate::{codec, model::*, runtime::*};

#[derive(Debug)]
pub struct Check {
    pub id: &'static str,
    pub group: &'static str,
    pub passed: bool,
    pub expected: String,
    pub actual: String,
    pub concept: &'static str,
}

fn case(
    id: &'static str,
    group: &'static str,
    passed: bool,
    expected: impl Into<String>,
    actual: impl Into<String>,
    concept: &'static str,
) -> Check {
    Check {
        id,
        group,
        passed,
        expected: expected.into(),
        actual: actual.into(),
        concept,
    }
}

pub fn tile_world(size: usize) -> World {
    World {
        objects: vec![
            (0..size).map(|x| x as u8).collect(),
            vec![0; size],
            b"SYNTHETIC-ONLY".to_vec(),
        ],
        grants: vec![
            Grant {
                job: 1,
                slot: 1,
                generation: 1,
                object: 0,
                rights: Rights::READ,
                base: 0,
                len: size as u32,
                epoch: 1,
            },
            Grant {
                job: 1,
                slot: 2,
                generation: 1,
                object: 1,
                rights: Rights::WRITE,
                base: 0,
                len: size as u32,
                epoch: 1,
            },
            Grant {
                job: 2,
                slot: 1,
                generation: 1,
                object: 2,
                rights: Rights::READ,
                base: 0,
                len: 14,
                epoch: 1,
            },
        ],
    }
}

/// Supplied useful application program. Writing image filters is not the learner task.
pub fn negative_filter(size: u32) -> Program {
    use Instruction::*;
    Program {
        memory_len: size,
        initial: vec![],
        code: vec![
            Const {
                dst: 0,
                value: 0x10001,
            },
            Const { dst: 1, value: 0 },
            Const { dst: 2, value: 0 },
            Const {
                dst: 3,
                value: size,
            },
            Const { dst: 5, value: 255 },
            Const {
                dst: 6,
                value: u32::MAX,
            },
            Const {
                dst: 7,
                value: 0x10002,
            },
            Invoke {
                write: false,
                handle: 0,
                offset: 1,
                mem: 2,
                len: 3,
                claimed_job: 1,
            },
            Const {
                dst: 2,
                value: size,
            },
            Jz { reg: 2, target: 16 },
            Add { dst: 2, a: 2, b: 6 },
            Load8 { dst: 4, addr: 2 },
            Xor { dst: 4, a: 4, b: 5 },
            Store8 { addr: 2, src: 4 },
            Jz { reg: 2, target: 16 },
            Jump { target: 10 },
            Invoke {
                write: true,
                handle: 7,
                offset: 1,
                mem: 2,
                len: 3,
                claimed_job: 1,
            },
            Halt,
        ],
    }
}

pub fn identity_filter(size: u32) -> Program {
    use Instruction::*;
    Program {
        memory_len: size,
        initial: vec![],
        code: vec![
            Const {
                dst: 0,
                value: 0x10001,
            },
            Const { dst: 1, value: 0 },
            Const { dst: 2, value: 0 },
            Const {
                dst: 3,
                value: size,
            },
            Const {
                dst: 7,
                value: 0x10002,
            },
            Invoke {
                write: false,
                handle: 0,
                offset: 1,
                mem: 2,
                len: 3,
                claimed_job: 1,
            },
            Invoke {
                write: true,
                handle: 7,
                offset: 1,
                mem: 2,
                len: 3,
                claimed_job: 1,
            },
            Halt,
        ],
    }
}

pub fn two_chunk_negative_filter() -> Program {
    let mut code = Vec::new();
    for chunk in 0..2_u32 {
        let start = code.len() as u32;
        let block = negative_filter(4096);
        for mut instruction in block
            .code
            .into_iter()
            .filter(|i| !matches!(i, Instruction::Halt))
        {
            match &mut instruction {
                Instruction::Const { dst: 1, value } => *value = chunk * 4096,
                Instruction::Jump { target } | Instruction::Jz { target, .. } => *target += start,
                _ => {}
            }
            code.push(instruction);
        }
    }
    code.push(Instruction::Halt);
    Program {
        code,
        initial: vec![],
        memory_len: 4096,
    }
}

pub fn evaluate<P: Policy>(group: &str) -> Vec<Check> {
    let mut checks = Vec::new();
    if group == "all" || group == "core" || group == "admission" {
        admission::<P>(&mut checks);
    }
    if group == "all" || group == "core" || group == "memory" {
        memory::<P>(&mut checks);
    }
    if group == "all" || group == "core" || group == "authority" {
        authority::<P>(&mut checks);
    }
    if group == "all" || group == "core" || group == "budget" {
        budget::<P>(&mut checks);
    }
    if group == "all" || group == "core" || group == "runtime" {
        runtime::<P>(&mut checks);
        composed_runtime::<P>(&mut checks);
    }
    if group == "all" || group == "core" || group == "wire" {
        wire(&mut checks);
    }
    if group == "all" || group == "core" || group == "syscall" {
        syscall_model::<P>(&mut checks);
    }
    if group == "all" || group == "transfer" {
        transfer::<P>(&mut checks);
    }
    checks
}

fn syscall_model<P: Policy>(out: &mut Vec<Check>) {
    let samples = [
        ("S01", Abi::NativeX86_64, Call::Read, 3, true),
        ("S02", Abi::NativeX86_64, Call::Write, 4, true),
        ("S03", Abi::NativeX86_64, Call::Read, 9, false),
        ("S04", Abi::NativeX86_64, Call::Write, 3, false),
        ("S05", Abi::X32, Call::Read, 3, false),
        ("S06", Abi::Other, Call::Read, 3, false),
        ("S07", Abi::NativeX86_64, Call::Unknown, 0, false),
        ("S08", Abi::NativeX86_64, Call::Exit, 0, true),
        // 5.3 "READ on descriptor 3": a lower descriptor and the write descriptor are other uses.
        ("S13", Abi::NativeX86_64, Call::Read, 0, false),
        ("S14", Abi::NativeX86_64, Call::Read, 4, false),
        // 5.3 "X32, other ABIs ... are denied": this holds for EXIT too.
        ("S15", Abi::X32, Call::Exit, 0, false),
    ];
    for (id, abi, call, fd, expected) in samples {
        let query = SyscallQuery { abi, call, fd };
        let actual = P::modeled_syscall(query);
        out.push(case(
            id,
            "syscall",
            actual == expected,
            expected.to_string(),
            format!("model {query:?}: {actual}"),
            "5.2: model only; ABI and exact descriptor are part of the decision",
        ));
    }
    for (id, nnp, filter, descriptors, expected) in [
        ("S09", true, true, true, true),
        ("S10", false, true, true, false),
        ("S11", true, false, true, false),
        ("S12", true, true, false, false),
    ] {
        let actual = P::modeled_seal(SealEvidence {
            nnp_verified: nnp,
            filter_installed: filter,
            descriptors_clean: descriptors,
        });
        out.push(case(
            id,
            "syscall",
            actual == expected,
            expected.to_string(),
            actual.to_string(),
            "5.1: all preconditions are required; this boolean is not a native seal receipt",
        ));
    }
}

fn admission<P: Policy>(out: &mut Vec<Check>) {
    use Instruction::*;
    let samples = [
        ("A01", vec![Halt], true),
        ("A02", vec![], false),
        ("A03", vec![Unknown(250), Halt], false),
        ("A04", vec![Const { dst: 8, value: 0 }, Halt], false),
        ("A05", vec![Jump { target: 9 }, Halt], false),
        ("A06", vec![Const { dst: 0, value: 0 }], false),
        ("A07", vec![Jump { target: 0 }], true),
        ("A08", vec![Jz { reg: 0, target: 3 }, Halt], false),
        // 2.2 "every operation": the unsupported operation is not the first instruction.
        ("A09", vec![Const { dst: 0, value: 0 }, Unknown(250), Halt], false),
        // 2.2: the branch target is legal, but the false path of JZ falls off the end.
        ("A10", vec![Const { dst: 0, value: 0 }, Jz { reg: 0, target: 0 }], false),
        // 2.2 "target an existing instruction index": the length itself is not an index.
        ("A11", vec![Jump { target: 1 }], false),
        // 2.2 "Registers are numbered 0 through 7" holds for every operand of every operation.
        ("A12", vec![Invoke { write: false, handle: 0, offset: 1, mem: 2, len: 8, claimed_job: 1 }, Halt], false),
    ];
    for (id, code, valid) in samples {
        let actual = P::validate(&code);
        out.push(case(
            id,
            "admission",
            actual.is_ok() == valid,
            if valid {
                "admitted"
            } else {
                "rejected before execution"
            },
            format!("input={code:?}; observed={actual:?}"),
            "2.2: admission checks every operation and edge; it does not prove termination",
        ));
    }
}

fn memory<P: Policy>(out: &mut Vec<Check>) {
    let samples = [
        ("M01", 16, 15, 1, true),
        ("M02", 16, 16, 1, false),
        ("M03", 16, 8, 9, false),
        ("M04", 16, 16, 0, true),
        ("M05", 16, 17, 0, false),
        ("M06", 16, u32::MAX - 1, 8, false),
        ("M07", 0, 0, 0, true),
        ("M08", 16, 0, 16, true),
        ("M09", u32::MAX, u32::MAX - 1, 8, false),
    ];
    for (id, logical, offset, len, allowed) in samples {
        let actual = P::range(logical, offset, len);
        out.push(case(
            id,
            "memory",
            actual == allowed,
            allowed.to_string(),
            format!("range({logical}, {offset}, {len}) = {actual}"),
            "3.2: the complete mathematical interval must fit; arithmetic must not wrap",
        ));
    }
}

fn authority<P: Policy>(out: &mut Vec<Check>) {
    let world = tile_world(16);
    let base = Request {
        handle: 0x10001,
        claimed_job: 1,
        write: false,
        offset: 0,
        len: 16,
    };
    let samples = [
        ("C01", base, Some(0)),
        (
            "C02",
            Request {
                claimed_job: 2,
                ..base
            },
            Some(0),
        ),
        (
            "C03",
            Request {
                write: true,
                ..base
            },
            None,
        ),
        ("C04", Request { handle: 1, ..base }, None),
        (
            "C05",
            Request {
                offset: 12,
                len: 5,
                ..base
            },
            None,
        ),
        (
            "C06",
            Request {
                handle: 0x10002,
                write: true,
                ..base
            },
            Some(1),
        ),
        (
            "C07",
            Request {
                handle: 0x10002,
                ..base
            },
            None,
        ),
        (
            "C08",
            Request {
                offset: 16,
                len: 0,
                ..base
            },
            Some(0),
        ),
        (
            "C09",
            Request {
                handle: 0x10009,
                len: 0,
                ..base
            },
            None,
        ),
        (
            "C10",
            Request {
                offset: u32::MAX,
                len: 2,
                ..base
            },
            None,
        ),
    ];
    for (id, request, expected) in samples {
        let actual = P::authorize(&world.grants, 1, request);
        out.push(case(id, "authority", actual.as_ref().ok().copied() == expected,
            format!("grant index {expected:?}"), format!("actual_job=1; request={request:?}; observed={actual:?}"),
            "4.2: channel principal, full live handle, rights and complete capability range all matter"));
    }
    // 4.2 "The request's offset is relative to that window. First establish authority for the complete
    // relative range": the window is bytes 8..24 of a 32-byte object; 12 + 8 is past its 16 bytes.
    let mut windowed = tile_world(32);
    windowed.grants[0].base = 8;
    windowed.grants[0].len = 16;
    // 4.1 "Choosing a grant table from the claim lets one principal ask the broker to exercise another
    // principal's authority": only job 2 holds handle 0x10007.
    let mut other_only = tile_world(16);
    other_only.grants[2].slot = 7;
    let extra = [
        ("C11", &windowed, Request { offset: 12, len: 8, ..base }, None),
        // 4.2 "A zero-byte operation still needs a live handle and the right."
        ("C12", &world, Request { write: true, len: 0, ..base }, None),
        ("C13", &other_only, Request { handle: 0x10007, claimed_job: 2, len: 14, ..base }, None),
    ];
    for (id, case_world, request, expected) in extra {
        let actual = P::authorize(&case_world.grants, 1, request);
        out.push(case(id, "authority", actual.as_ref().ok().copied() == expected,
            format!("grant index {expected:?}"), format!("actual_job=1; request={request:?}; observed={actual:?}"),
            "4.2: channel principal, full live handle, rights and complete capability range all matter"));
    }
}

fn budget<P: Policy>(out: &mut Vec<Check>) {
    let b = Budget {
        fuel: 1,
        calls: 1,
        read_bytes: 4,
        write_bytes: 4,
    };
    let samples = [
        ("B01", b, Cost::Step, Some(Budget { fuel: 0, ..b })),
        ("B02", Budget { fuel: 0, ..b }, Cost::Step, None),
        (
            "B03",
            b,
            Cost::Read(4),
            Some(Budget {
                calls: 0,
                read_bytes: 0,
                ..b
            }),
        ),
        ("B04", b, Cost::Read(5), None),
        ("B05", Budget { calls: 0, ..b }, Cost::Write(0), None),
        (
            "B06",
            b,
            Cost::Write(4),
            Some(Budget {
                calls: 0,
                write_bytes: 0,
                ..b
            }),
        ),
        ("B07", Budget::default(), Cost::Read(4097), None),
        // 6.1 "A zero-byte call consumes a call, because the crossing itself is work."
        ("B08", b, Cost::Write(0), Some(Budget { calls: 0, ..b })),
        // 6.1 "The maximum payload of one call is 4,096 bytes": for a write as for a read.
        ("B09", Budget::default(), Cost::Write(4097), None),
        // 6.1 "Read and write budgets are separate": an empty read budget does not stop a write.
        (
            "B10",
            Budget { read_bytes: 0, ..b },
            Cost::Write(4),
            Some(Budget {
                calls: 0,
                read_bytes: 0,
                write_bytes: 0,
                ..b
            }),
        ),
    ];
    for (id, before, cost, expected) in samples {
        let actual = P::charge(before, cost);
        out.push(case(id, "budget", actual.as_ref().ok().copied() == expected,
            format!("{expected:?}"), format!("before={before:?}; cost={cost:?}; observed={actual:?}"),
            "6.1: charge before effects, preserving independent fuel, calls, read and write budgets"));
    }
}

fn runtime<P: Policy>(out: &mut Vec<Check>) {
    use Instruction::*;
    for (id, size, invert) in [
        ("R01", 64, true),
        ("R02", 4096, true),
        ("R03", 64, false),
        ("R04", 0, true),
    ] {
        let mut world = tile_world(size);
        let expected: Vec<u8> = world.objects[0]
            .iter()
            .map(|b| if invert { b ^ 255 } else { *b })
            .collect();
        let p = if invert {
            negative_filter(size as u32)
        } else {
            identity_filter(size as u32)
        };
        let result = run::<P>(&p, 1, &mut world, Budget::default());
        out.push(case(
            id,
            "runtime",
            result.outcome.is_ok() && world.objects[1] == expected,
            "useful exact tile output",
            format!(
                "{:?}; steps={}; output_matches={}",
                result.outcome,
                result.steps,
                world.objects[1] == expected
            ),
            "7.2: a repair must preserve useful behavior, including an empty allowed input",
        ));
    }
    let mut world = tile_world(1);
    let leak = Program {
        memory_len: 1,
        initial: vec![],
        code: vec![
            Const { dst: 0, value: 1 },
            Load8 { dst: 1, addr: 0 },
            Const { dst: 0, value: 0 },
            Store8 { addr: 0, src: 1 },
            Halt,
        ],
    };
    let r = run::<P>(&leak, 1, &mut world, Budget::default());
    out.push(case(
        "R05",
        "runtime",
        r.outcome == Err(Fault::MemoryDenied),
        "MemoryDenied",
        format!("{:?}; guest_bytes={:?}", r.outcome, r.memory),
        "3.1: guard marker 167 is synthetic; this is logical isolation, not native exploitation",
    ));

    let mut original = identity_filter(1);
    let admitted = admit::<P>(&original);
    original.code = vec![Unknown(250)];
    let r = admitted.map(|a| run_admitted::<P>(&a, 1, &mut world, Budget::default()).outcome);
    out.push(case(
        "R06",
        "runtime",
        r == Ok(Ok(())),
        "original admitted program remains stable",
        format!("{r:?}"),
        "2.3: admission owns an immutable snapshot, independent of later source edits",
    ));

    let mut p = identity_filter(1);
    p.code.insert(p.code.len() - 1, Const { dst: 2, value: 1 });
    p.code.insert(p.code.len() - 1, Load8 { dst: 4, addr: 2 });
    let mut world = tile_world(1);
    world.objects[0][0] = 99;
    let before = world.objects.clone();
    let r = run::<P>(&p, 1, &mut world, Budget::default());
    out.push(case(
        "R07",
        "runtime",
        r.outcome == Err(Fault::MemoryDenied) && world.objects == before,
        "failed job leaves published objects unchanged",
        format!("{:?}; unchanged={}", r.outcome, world.objects == before),
        "6.2: earlier staged writes must not publish on a later trap",
    ));

    let p = Program {
        memory_len: 1,
        initial: vec![],
        code: vec![Halt],
    };
    let r = run::<P>(
        &p,
        1,
        &mut world,
        Budget {
            fuel: 0,
            ..Budget::default()
        },
    );
    out.push(case(
        "R08",
        "runtime",
        r.outcome == Err(Fault::BudgetExhausted) && r.steps == 0,
        "zero fuel: no instruction, including HALT",
        format!("{:?}; steps={}", r.outcome, r.steps),
        "6.1: work cannot happen before its charge",
    ));
}

fn composed_runtime<P: Policy>(out: &mut Vec<Check>) {
    let mut world = tile_world(8192);
    let expected: Vec<_> = world.objects[0].iter().map(|b| b ^ 255).collect();
    let r = run::<P>(
        &two_chunk_negative_filter(),
        1,
        &mut world,
        Budget::default(),
    );
    out.push(case(
        "R09",
        "runtime",
        r.outcome.is_ok() && world.objects[1] == expected,
        "128x64 tile transformed through two 4096-byte broker chunks",
        format!(
            "{:?}; steps={}; output_matches={}",
            r.outcome,
            r.steps,
            world.objects[1] == expected
        ),
        "6.1: cumulative budgets allow legitimate multiple calls, not only one demonstration",
    ));
    let mut world = tile_world(32);
    world.grants[0].base = 8;
    world.grants[0].len = 16;
    world.grants[1].base = 4;
    world.grants[1].len = 16;
    let mut expected = vec![0; 32];
    expected[4..20].copy_from_slice(&world.objects[0][8..24]);
    let r = run::<P>(&identity_filter(16), 1, &mut world, Budget::default());
    out.push(case(
        "R10",
        "runtime",
        r.outcome.is_ok() && world.objects[1] == expected,
        "only the authorized nonzero-base windows are read and written",
        format!(
            "{:?}; output_matches={}",
            r.outcome,
            world.objects[1] == expected
        ),
        "4.2: request offsets are relative to the capability, not the complete object",
    ));
    let looping = Program {
        code: vec![Instruction::Jump { target: 0 }],
        initial: vec![],
        memory_len: 1,
    };
    let r = run::<P>(
        &looping,
        1,
        &mut world,
        Budget {
            fuel: 3,
            ..Budget::default()
        },
    );
    out.push(case("R11", "runtime", r.outcome == Err(Fault::BudgetExhausted) && r.steps == 3,
        "valid loop: BudgetExhausted after exactly three steps", format!("{:?}; steps={}", r.outcome, r.steps),
        "6.1: structural validity permits loops; the learner fuel policy must stop them before the emergency guard"));
}

fn wire(out: &mut Vec<Check>) {
    let p = negative_filter(64);
    let bytes = codec::encode(&p);
    let valid = codec::decode(&bytes);
    out.push(case(
        "W01",
        "wire",
        valid.as_ref().map(|q| &q.code) == Ok(&p.code),
        "canonical round trip",
        format!("{} bytes; decoded={}", bytes.len(), valid.is_ok()),
        "2.1: framing is supplied, admission remains learner work",
    ));
    for (id, bad) in [
        ("W02", bytes[..bytes.len() - 1].to_vec()),
        ("W03", {
            let mut x = bytes.clone();
            x.push(0);
            x
        }),
        ("W04", {
            let mut x = bytes.clone();
            x[20] = 1;
            x
        }),
    ] {
        let result = codec::decode(&bad);
        out.push(case(
            id,
            "wire",
            result.is_err(),
            "InvalidImage",
            format!(
                "{}",
                if result.is_err() {
                    "rejected"
                } else {
                    "accepted"
                }
            ),
            "2.1: lengths and canonical fields are not advisory",
        ));
    }
}

fn transfer<P: Policy>(out: &mut Vec<Check>) {
    let world = tile_world(16);
    let request = Queued {
        principal: 1,
        handle: 0x10002,
        admitted_epoch: 1,
        write: true,
        offset: 0,
        len: 16,
    };
    let mut revoked = world.grants.clone();
    revoked.retain(|g| !(g.job == 1 && g.slot == 2));
    let mut replaced = world.grants.clone();
    replaced[1].generation = 2;
    replaced[1].epoch = 2;
    let samples = [
        ("Q01", world.grants.clone(), 1, request, true),
        ("Q02", revoked, 2, request, false),
        ("Q03", replaced, 2, request, false),
        ("Q04", world.grants.clone(), 8, request, true),
        (
            "Q05",
            world.grants,
            1,
            Queued {
                principal: 2,
                ..request
            },
            false,
        ),
    ];
    for (id, grants, epoch, req, expected) in samples {
        let actual = P::queued(&grants, epoch, req);
        out.push(case(id, "transfer", actual == expected, expected.to_string(), actual.to_string(),
            "8.2: public interface practice only; independent final schedules are not in this package"));
    }
    use crate::schedule::{simulate, Event};
    let request = Request {
        handle: 0x10002,
        claimed_job: 1,
        write: true,
        offset: 0,
        len: 2,
    };
    for (id, principal, slot, expected) in [("Q06", 1, 2, false), ("Q07", 2, 1, true)] {
        let initial = tile_world(4);
        let events = vec![
            Event::Queue {
                principal: 1,
                request,
                payload: vec![7, 8],
            },
            Event::Revoke { principal, slot },
            Event::Commit { index: 0 },
        ];
        let report = simulate::<P>(&initial, &events);
        let correct = report
            .as_ref()
            .map(|r| {
                r.decisions == vec![expected]
                    && r.world.objects[1][..2] == if expected { [7, 8] } else { [0, 0] }
            })
            .unwrap_or(false);
        out.push(case(id, "transfer", correct, format!("commit={expected}; matching actual object effect"),
            format!("{:?}", report.as_ref().map(|r| (&r.decisions, &r.world.objects[1]))),
            "8.2: the supplied deterministic queue reveals the actual delayed effect; no service is built"));
    }
    competing_slot_schedules::<P>(out);

}

/// Revocation must bind to the whole handle, even when a live grant has the
/// same principal, generation, epoch, rights and usable range. The other
/// principal's independent write must still happen, and no decoy bytes change.
fn competing_slot_schedules<P: Policy>(out: &mut Vec<Check>) {
    use crate::schedule::{simulate, Event};
    for (id, variant, revoke_target) in [("Q08", false, true), ("Q09", true, true), ("Q10", true, false)] {
        let (job, other_job, slot, decoy_slot, generation, epoch) = if variant {
            (41, 72, 12, 2, 3, 19)
        } else {
            (11, 22, 5, 8, 9, 41)
        };
        let (bases, offsets, grant_len) = if variant {
            ([3, 2, 1], [2, 1], 5)
        } else {
            ([2, 3, 1], [1, 2], 4)
        };
        let grant = |principal, grant_slot, object, grant_epoch| Grant {
            job: principal, slot: grant_slot, generation, object,
            rights: Rights::WRITE, base: bases[object], len: grant_len,
            epoch: grant_epoch,
        };
        let mut initial = World {
            objects: vec![vec![10; 10], vec![20; 10], vec![30; 10]],
            grants: vec![
                grant(job, slot, 0, epoch),
                grant(other_job, slot, 1, epoch + 2),
                grant(job, decoy_slot, 2, epoch),
            ],
        };
        if variant {
            initial.grants.rotate_left(2);
        }
        let handle = (u32::from(generation) << 16) | u32::from(slot);
        let payloads = if variant { [[91, 92], [101, 102]] } else { [[161, 162], [177, 178]] };
        let mut events = vec![
            Event::Queue {
                principal: job,
                request: Request { handle, claimed_job: other_job, write: true, offset: offsets[0], len: 2 },
                payload: payloads[0].to_vec(),
            },
            Event::Queue {
                principal: other_job,
                request: Request { handle, claimed_job: job, write: true, offset: offsets[1], len: 2 },
                payload: payloads[1].to_vec(),
            },
            Event::Revoke { principal: job, slot: if revoke_target { slot } else { decoy_slot } },
        ];
        let order = if variant { [1, 0] } else { [0, 1] };
        events.extend(order.iter().map(|index| Event::Commit { index: *index }));
        let expected_decisions: Vec<bool> = order.iter().map(|i| *i == 1 || !revoke_target).collect();
        // Compare complete objects: denial changes zero bytes, and success
        // changes exactly the intended granted window, never the decoy object.
        let mut expected_objects = initial.objects.clone();
        for i in 0..2 {
            if i == 1 || !revoke_target {
                let start = (bases[i] + offsets[i]) as usize;
                expected_objects[i][start..start + 2].copy_from_slice(&payloads[i]);
            }
        }
        let report = simulate::<P>(&initial, &events);
        let correct = report.as_ref().map(|r| {
            r.decisions == expected_decisions && r.world.objects == expected_objects
        }).unwrap_or(false);
        out.push(case(id, "transfer", correct,
            format!("decisions={expected_decisions:?}; exact objects={expected_objects:?}"),
            format!("{:?}", report.as_ref().map(|r| (&r.decisions, &r.world.objects))),
            "8.2: same generation is not the same handle; revoke one slot while preserving independent effects"));
    }
}
