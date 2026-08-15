#![no_std]

//! Divides a released payment between the parties to a trade, atomically.
//!
//! The invariant is that the parts sum to exactly the whole. Not approximately:
//! integer division leaves a remainder, and a remainder that is dropped, or
//! left sitting in the contract, is a balance that drifts by a stroop per
//! settlement until somebody reconciles a year of it by hand. The remainder is
//! assigned to a named party instead.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env, Vec,
};

const BPS: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NoShares = 1,
    SharesDoNotSumToWhole = 2,
    ShareNotPositive = 3,
    AlreadyConfigured = 4,
    NotConfigured = 5,
    AmountNotPositive = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Share {
    pub party: Address,
    /// Basis points. All shares for a trade must total exactly 10,000.
    pub bps: i128,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Shares(BytesN<32>),
}

#[contract]
pub struct Splitter;

#[contractimpl]
impl Splitter {
    /// Records how a trade divides. Set once per trade, so the split cannot be
    /// rewritten after the parties have agreed to it.
    pub fn configure(env: Env, trade_id: BytesN<32>, shares: Vec<Share>) -> Result<(), Error> {
        if shares.is_empty() {
            return Err(Error::NoShares);
        }
        let key = Key::Shares(trade_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyConfigured);
        }

        let mut total: i128 = 0;
        for share in shares.iter() {
            if share.bps <= 0 {
                return Err(Error::ShareNotPositive);
            }
            total += share.bps;
        }
        if total != BPS {
            return Err(Error::SharesDoNotSumToWhole);
        }

        env.storage().persistent().set(&key, &shares);
        Ok(())
    }

    pub fn shares(env: Env, trade_id: BytesN<32>) -> Result<Vec<Share>, Error> {
        env.storage()
            .persistent()
            .get(&Key::Shares(trade_id))
            .ok_or(Error::NotConfigured)
    }

    /// Pays every party their share of `amount` from `from`.
    ///
    /// The rounding remainder goes to the last share, which by convention is
    /// the cooperative. Every stroop is accounted for and none stays here.
    pub fn distribute(
        env: Env,
        trade_id: BytesN<32>,
        token_id: Address,
        from: Address,
        amount: i128,
    ) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::AmountNotPositive);
        }
        let shares = Self::shares(env.clone(), trade_id)?;
        from.require_auth();

        let client = token::Client::new(&env, &token_id);
        let last = shares.len() - 1;
        let mut paid: i128 = 0;

        for (i, share) in shares.iter().enumerate() {
            let part = if i as u32 == last {
                amount - paid
            } else {
                amount * share.bps / BPS
            };
            paid += part;
            if part > 0 {
                client.transfer(&from, &share.party, &part);
            }
        }

        Ok(())
    }
}

mod test;
