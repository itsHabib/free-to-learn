//! Supplied deterministic event driver; no threads, services, timers or OS authority.
use crate::model::*;

#[derive(Clone, Debug)]
pub enum Event {
    Queue {
        principal: u32,
        request: Request,
        payload: Vec<u8>,
    },
    Revoke {
        principal: u32,
        slot: u16,
    },
    Commit {
        index: usize,
    },
}

#[derive(Debug)]
pub struct ScheduleReport {
    pub world: World,
    pub decisions: Vec<bool>,
    pub epoch: u32,
}

struct Pending {
    request: Queued,
    object: usize,
    start: usize,
    payload: Vec<u8>,
    used: bool,
}

pub fn simulate<P: Policy>(initial: &World, events: &[Event]) -> Result<ScheduleReport, Fault> {
    if events.len() > 128 || !valid_world(initial) {
        return Err(Fault::InvalidImage);
    }
    let mut world = initial.clone();
    let mut pending = Vec::<Pending>::new();
    let mut decisions = Vec::new();
    let mut epoch = world.grants.iter().map(|g| g.epoch).max().unwrap_or(0);
    for event in events {
        match event {
            Event::Queue {
                principal,
                request,
                payload,
            } => {
                if !request.write || payload.len() != request.len as usize || payload.len() > 4096 {
                    return Err(Fault::InvalidImage);
                }
                let i = P::authorize(&world.grants, *principal, *request)?;
                let grant = world.grants.get(i).ok_or(Fault::PhysicalGuard)?;
                let start = grant
                    .base
                    .checked_add(request.offset)
                    .ok_or(Fault::PhysicalGuard)? as usize;
                let end = start
                    .checked_add(payload.len())
                    .ok_or(Fault::PhysicalGuard)?;
                world
                    .objects
                    .get(grant.object)
                    .and_then(|o| o.get(start..end))
                    .ok_or(Fault::PhysicalGuard)?;
                pending.push(Pending {
                    request: Queued {
                        principal: *principal,
                        handle: request.handle,
                        admitted_epoch: grant.epoch,
                        write: true,
                        offset: request.offset,
                        len: request.len,
                    },
                    object: grant.object,
                    start,
                    payload: payload.clone(),
                    used: false,
                });
            }
            Event::Revoke { principal, slot } => {
                world
                    .grants
                    .retain(|g| !(g.job == *principal && g.slot == *slot));
                epoch = epoch.checked_add(1).ok_or(Fault::PhysicalGuard)?;
            }
            Event::Commit { index } => {
                let item = pending.get_mut(*index).ok_or(Fault::InvalidImage)?;
                if item.used {
                    return Err(Fault::InvalidImage);
                }
                item.used = true;
                let permit = P::queued(&world.grants, epoch, item.request);
                decisions.push(permit);
                if permit {
                    let end = item.start + item.payload.len();
                    let bytes = world
                        .objects
                        .get_mut(item.object)
                        .and_then(|o| o.get_mut(item.start..end))
                        .ok_or(Fault::PhysicalGuard)?;
                    bytes.copy_from_slice(&item.payload);
                }
            }
        }
    }
    Ok(ScheduleReport {
        world,
        decisions,
        epoch,
    })
}
