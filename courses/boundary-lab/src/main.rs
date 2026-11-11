use boundary_lab::{checks, learner::Learner, *};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str).unwrap_or("status") {
        "status" => {
            println!("Boundary Lab: portable Rust teaching model. No OS sandbox or Linux seal is present.");
            println!("Learner: src/learner.rs. Commands: demo | check [core|admission|memory|authority|syscall|budget|runtime|wire|transfer|all] | native");
            println!("The starter has deliberate logical security defects. Never feed it real secrets or hostile native code.");
        }
        "native" => {
            println!("NOT RUN: Linux syscall confinement is not implemented or qualified. Portable checks cannot satisfy module 5.");
            std::process::exit(2);
        }
        "demo" => {
            let mut world = checks::tile_world(64);
            let r = run::<Learner>(
                &checks::negative_filter(64),
                1,
                &mut world,
                Budget::default(),
            );
            println!(
                "Portable synthetic 8x8 negative filter: {:?}; {} steps",
                r.outcome, r.steps
            );
            println!("input first row:  {:?}", &world.objects[0][..8]);
            println!("output first row: {:?}", &world.objects[1][..8]);
            println!("Useful output is not proof of isolation. Run check core to see the counterexamples.");
            if r.outcome.is_err() {
                std::process::exit(1);
            }
        }
        "check" => {
            let group = args.get(1).map(String::as_str).unwrap_or("core");
            let checks = checks::evaluate::<Learner>(group);
            if checks.is_empty() {
                eprintln!("Unknown group: {group}");
                std::process::exit(64);
            }
            for c in &checks {
                println!(
                    "{} {} [{}]\n  expected: {}\n  observed: {}\n  concept: {}",
                    if c.passed { "PASS" } else { "FAIL" },
                    c.id,
                    c.group,
                    c.expected,
                    c.actual,
                    c.concept
                );
            }
            let passed = checks.iter().filter(|c| c.passed).count();
            println!("{passed}/{} public practice checks passed. Linux native: NOT RUN. This is not course completion.", checks.len());
            if passed != checks.len() {
                std::process::exit(1);
            }
        }
        other => {
            eprintln!("Unknown command: {other}");
            std::process::exit(64);
        }
    }
}
