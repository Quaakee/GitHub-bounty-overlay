import {
    assert,
    method,
    prop,
    Addr,
    PubKey,
    SmartContract,
    Sig,
    SigHash,
    Utils,
    hash256,
    pubKey2Addr,
} from 'scrypt-ts'

/**
 * A bounty contract for GitHub issues
 * Requires three signatures to release the funds:
 * 1. The bounty creator (funder)
 * 2. The issue solver
 * 3. The verification server (certificate authority) that confirms identities
 */
export class BountyContract extends SmartContract {
    @prop()
    readonly funderAddr: Addr

    @prop()
    readonly issueId: bigint

    @prop()
    readonly repoOwner: PubKey

    @prop()
    readonly certifierPubKey: PubKey

    @prop()
    readonly deadline: bigint

    constructor(
        funderAddr: Addr,
        issueId: bigint,
        repoOwner: PubKey,
        certifierPubKey: PubKey,
        deadline: bigint
    ) {
        super(...arguments)
        this.funderAddr = funderAddr
        this.issueId = issueId
        this.repoOwner = repoOwner
        this.certifierPubKey = certifierPubKey
        this.deadline = deadline
    }

    // Pay the solver when the issue is resolved
    // Requires signatures from solver, repo owner, and certifier
    @method(SigHash.ANYONECANPAY_SINGLE)
    public paySolver(
        solverSig: Sig,
        solverPubKey: PubKey,
        ownerSig: Sig,
        certifierSig: Sig
    ) {
        // Validate solver's signature
        assert(
            this.checkSig(solverSig, solverPubKey),
            'solver signature check failed'
        )

        // Validate repo owner's signature
        assert(
            this.checkSig(ownerSig, this.repoOwner),
            'repo owner signature check failed'
        )

        // Validate certifier's signature
        assert(
            this.checkSig(certifierSig, this.certifierPubKey),
            'certifier signature check failed'
        )

        // Ensure solver gets paid
        const amount = this.ctx.utxo.value
        const solverAddr = pubKey2Addr(solverPubKey)
        const out = Utils.buildPublicKeyHashOutput(solverAddr, amount)
        assert(hash256(out) == this.ctx.hashOutputs, 'hashOutputs mismatch')
    }

    // Allow the funder to get a refund after the deadline
    @method()
    public refundExpired(funderSig: Sig, funderPubKey: PubKey) {
        // Verify this is the funder
        assert(
            pubKey2Addr(funderPubKey) == this.funderAddr,
            'invalid public key for funder'
        )
        assert(
            this.checkSig(funderSig, funderPubKey),
            'funder signature check failed'
        )

        // Check deadline has passed
        assert(this.timeLock(this.deadline), 'deadline not yet reached')

        // Ensure funder gets refund
        const amount = this.ctx.utxo.value
        const out = Utils.buildPublicKeyHashOutput(this.funderAddr, amount)
        assert(hash256(out) == this.ctx.hashOutputs, 'hashOutputs mismatch')
    }

    // Allow the repo owner and funder to cancel the bounty together
    @method()
    public cancelBounty(
        funderSig: Sig,
        funderPubKey: PubKey,
        ownerSig: Sig
    ) {
        // Verify this is the funder
        assert(
            pubKey2Addr(funderPubKey) == this.funderAddr,
            'invalid public key for funder'
        )
        assert(
            this.checkSig(funderSig, funderPubKey),
            'funder signature check failed'
        )

        // Verify repo owner signature
        assert(
            this.checkSig(ownerSig, this.repoOwner),
            'repo owner signature check failed'
        )

        // Ensure funder gets refund
        const amount = this.ctx.utxo.value
        const out = Utils.buildPublicKeyHashOutput(this.funderAddr, amount)
        assert(hash256(out) == this.ctx.hashOutputs, 'hashOutputs mismatch')
    }
}