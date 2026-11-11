//! Original portable teaching model. This is not an OS or hostile-native-code sandbox.
#![forbid(unsafe_code)]

pub mod checks;
pub mod codec;
pub mod learner;
pub mod model;
pub mod runtime;
pub mod schedule;

pub use model::*;
pub use runtime::{admit, run, run_admitted, Admitted};
