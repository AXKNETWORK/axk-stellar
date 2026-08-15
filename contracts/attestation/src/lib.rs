#![no_std]

//! Write-once record that a trade settled.
//!
//! Stores a digest over a canonical serialisation of the trade record, never
//! the record itself. A lender shown a trade can hash it and confirm it matches
//! what settled, without AXK vouching for it and without the ledger carrying
//! commercially sensitive terms or anybody's personal data.
//!
//! Write-once is the point. An attestation that could be amended later would
//! prove only what AXK last chose to say.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, BytesN, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyAttested = 1,
    NoSuchTrade = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub digest: BytesN<32>,
    pub ledger: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Trade(BytesN<32>),
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// Records a digest against a trade. Fails if the trade already has one.
    ///
    /// Deliberately unpermissioned on write: anyone may attest, because the
    /// value of the record is the digest matching, not who submitted it. A
    /// wrong digest from a stranger proves nothing and blocks nothing, since
    /// the trade id is derived from the record it describes.
    pub fn attest(env: Env, trade_id: BytesN<32>, digest: BytesN<32>) -> Result<(), Error> {
        let key = Key::Trade(trade_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyAttested);
        }
        env.storage().persistent().set(
            &key,
            &Attestation {
                digest,
                ledger: env.ledger().sequence(),
                timestamp: env.ledger().timestamp(),
            },
        );
        Ok(())
    }

    pub fn get(env: Env, trade_id: BytesN<32>) -> Result<Attestation, Error> {
        env.storage()
            .persistent()
            .get(&Key::Trade(trade_id))
            .ok_or(Error::NoSuchTrade)
    }

    /// True when `digest` is the one recorded for this trade. The check a
    /// lender runs after hashing the record they were shown.
    pub fn matches(env: Env, trade_id: BytesN<32>, digest: BytesN<32>) -> bool {
        match Self::get(env, trade_id) {
            Ok(a) => a.digest == digest,
            Err(_) => false,
        }
    }
}

mod test;
