//! Opening-lesson experiment: observe the current policy, not a reference repair.
//! Only original synthetic bytecode runs inside the supplied teaching VM.
use boundary_lab::{learner::Learner, run, Budget, Instruction::*, Policy, Program, World};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let offset = match args.as_slice() {
        [value] => value.parse::<u32>().ok(),
        _ => None,
    };
    let Some(offset) = offset else {
        eprintln!("Usage: cargo run --offline --example range-probe -- <u32 offset>");
        std::process::exit(64);
    };

    // Four guest bytes. Offset 3 names the last byte; offset 4 is the endpoint.
    let program = Program {
        memory_len: 4,
        initial: vec![12, 34, 56, 78],
        code: vec![
            Const {
                dst: 0,
                value: offset,
            },
            Load8 { dst: 1, addr: 0 },
            Const { dst: 0, value: 0 },
            Store8 { addr: 0, src: 1 },
            Halt,
        ],
    };
    let mut world = World {
        objects: vec![],
        grants: vec![],
    };
    println!("logical_len=4 offset={offset} len=1");
    println!("range decision: {}", Learner::range(4, offset, 1));
    let report = run::<Learner>(&program, 1, &mut world, Budget::default());
    println!("outcome: {:?}; steps: {}", report.outcome, report.steps);
    println!("guest bytes: {:?}", report.memory);
    println!("Observation only; exit 0 is not a policy-check pass. Linux native: NOT RUN.");
}
