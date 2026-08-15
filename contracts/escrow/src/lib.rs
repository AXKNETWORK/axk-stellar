#![no_std]

//! Holds a buyer's payment against one trade until delivery is verified.
//!
//! The destination is fixed when the escrow is created. Nothing afterwards can
//! change it, which is the only guarantee here worth having: a compromised
//! verifier or admin can stall a release or let the deadline pass, but cannot
//! send the money somewhere else.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialised = 1,
    NotInitialised = 2,
    TradeExists = 3,
    NoSuchTrade = 4,
    NotFunded = 5,
    DeadlineNotReached = 6,
    DeadlineInPast = 7,
    AmountNotPositive = 8,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Funded = 0,
    Released = 1,
    Refunded = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trade {
    pub buyer: Address,
    pub destination: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: Status,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Verifier,
    Trade(BytesN<32>),
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// The verifier is the only address permitted to release. It is set once.
    pub fn init(env: Env, verifier: Address) -> Result<(), Error> {
        if env.storage().instance().has(&Key::Verifier) {
            return Err(Error::AlreadyInitialised);
        }
        env.storage().instance().set(&Key::Verifier, &verifier);
        Ok(())
    }

    pub fn verifier(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&Key::Verifier)
            .ok_or(Error::NotInitialised)
    }

    /// Funds an escrow. The buyer's authorisation covers the transfer in.
    pub fn create(
        env: Env,
        trade_id: BytesN<32>,
        buyer: Address,
        destination: Address,
        token_id: Address,
        amount: i128,
        deadline: u64,
    ) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::AmountNotPositive);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::DeadlineInPast);
        }
        let key = Key::Trade(trade_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::TradeExists);
        }
        buyer.require_auth();

        token::Client::new(&env, &token_id).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        env.storage().persistent().set(
            &key,
            &Trade {
                buyer,
                destination,
                token: token_id,
                amount,
                deadline,
                status: Status::Funded,
            },
        );
        Ok(())
    }

    /// Pays the destination recorded at creation. The caller does not get to
    /// name it, so a compromised verifier cannot redirect the money.
    pub fn release(env: Env, trade_id: BytesN<32>) -> Result<(), Error> {
        Self::verifier(env.clone())?.require_auth();

        let key = Key::Trade(trade_id);
        let mut trade: Trade = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoSuchTrade)?;
        if trade.status != Status::Funded {
            return Err(Error::NotFunded);
        }

        trade.status = Status::Released;
        env.storage().persistent().set(&key, &trade);

        token::Client::new(&env, &trade.token).transfer(
            &env.current_contract_address(),
            &trade.destination,
            &trade.amount,
        );
        Ok(())
    }

    /// Returns the money to the buyer once the deadline has passed.
    ///
    /// Deliberately callable by anyone. If it required a privileged caller, a
    /// buyer's refund would depend on AXK still being around to sign for it.
    pub fn refund(env: Env, trade_id: BytesN<32>) -> Result<(), Error> {
        let key = Key::Trade(trade_id);
        let mut trade: Trade = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoSuchTrade)?;
        if trade.status != Status::Funded {
            return Err(Error::NotFunded);
        }
        if env.ledger().timestamp() < trade.deadline {
            return Err(Error::DeadlineNotReached);
        }

        trade.status = Status::Refunded;
        env.storage().persistent().set(&key, &trade);

        token::Client::new(&env, &trade.token).transfer(
            &env.current_contract_address(),
            &trade.buyer,
            &trade.amount,
        );
        Ok(())
    }

    pub fn get(env: Env, trade_id: BytesN<32>) -> Result<Trade, Error> {
        env.storage()
            .persistent()
            .get(&Key::Trade(trade_id))
            .ok_or(Error::NoSuchTrade)
    }
}

mod test;
