//! LEARNER WORK. Five intentionally wrong policies for bounded, synthetic data only.
//! Each TODO names a public contract, not an implementation recipe.
//! The supplied runtime adds physical memory and finite-step guards. They do not
//! make these logical policies correct and must not be counted as your repair.

use crate::model::*;

pub struct Learner;

impl Policy for Learner {
    fn validate(code: &[Instruction]) -> Result<(), Fault> {
        // TODO M2: every instruction and control-flow edge must satisfy admission.
        if code.is_empty() {
            return Err(Fault::InvalidProgram);
        }
        Ok(())
    }

    fn range(logical_len: u32, offset: u32, _len: u32) -> bool {
        // TODO M3: implement the complete mathematical range contract.
        offset <= logical_len
    }

    fn authorize(grants: &[Grant], _actual_job: u32, request: Request) -> Result<usize, Fault> {
        // TODO M4: resolve authority from the real principal, live handle, right and range.
        grants
            .iter()
            .position(|g| g.job == request.claimed_job && g.slot == request.handle as u16)
            .ok_or(Fault::AuthorityDenied)
    }

    fn charge(mut before: Budget, cost: Cost) -> Result<Budget, Fault> {
        // TODO M6: charge before work, including cumulative copy/call costs.
        match cost {
            Cost::Step => before.fuel = before.fuel.saturating_sub(1),
            Cost::Read(n) | Cost::Write(n) if n > 4096 => return Err(Fault::BudgetExhausted),
            _ => {}
        }
        Ok(before)
    }

    fn queued(_grants: &[Grant], current_epoch: u32, request: Queued) -> bool {
        // TODO M8: decide whether this queued operation still has authority at commit.
        request.admitted_epoch <= current_epoch
    }

    fn modeled_syscall(_query: SyscallQuery) -> bool {
        // TODO M5 MODEL ONLY: enforce the documented ABI and descriptor policy.
        true
    }

    fn modeled_seal(evidence: SealEvidence) -> bool {
        // TODO M5 MODEL ONLY: require every precondition; no real kernel call occurs.
        evidence.nnp_verified
    }
}
