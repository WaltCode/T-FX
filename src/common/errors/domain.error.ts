import { HttpStatus } from "@nestjs/common"
import { Currency } from "../money/currency.js"

export class DomainError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly status: number,
        readonly details?: Record<string, unknown>
    ){
        super(message)
        this.name = 'DomainError'
    }
}

export const errors = {
    invalidAmount: (message: string) => new DomainError('INVALID_AMOUNT', message, HttpStatus.BAD_REQUEST),
    identifierRequired: () => 
        new DomainError('IDENTIFIER_REQUIRED', 'Provide an email address or a phone number', HttpStatus.BAD_REQUEST),
    walletExists: () =>
    new DomainError('WALLET_ALREADY_EXISTS', 'A wallet already exists for this email or phone number', HttpStatus.CONFLICT),
    walletNotFound: (id: string) => new DomainError('WALLET_NOT_FOUND', `Wallet ${id} was not found`, HttpStatus.NOT_FOUND),
    recipientNotFound: (id: string) =>
        new DomainError('RECIPIENT_NOT_FOUND', `Recipient wallet ${id} was not found`, HttpStatus.NOT_FOUND),
    transactionNotFound: (id: string) =>
        new DomainError('TRANSACTION_NOT_FOUND', `Transaction ${id} was not found`, HttpStatus.NOT_FOUND),
    insufficientFunds: (currency: Currency, available: string, required: string) =>
        new DomainError('INSUFFICIENT_FUNDS', `Insufficient ${currency} balance`, HttpStatus.UNPROCESSABLE_ENTITY, {
        currency,
        available,
        required,
        }),
    sameCurrencySwap: () =>
        new DomainError('SAME_CURRENCY_SWAP', 'fromCurrency and toCurrency must differ', HttpStatus.UNPROCESSABLE_ENTITY),
    selfTransfer: () =>
        new DomainError('SELF_TRANSFER', 'Use a swap to convert within the same wallet', HttpStatus.UNPROCESSABLE_ENTITY),
    amountTooSmall: () =>
        new DomainError('AMOUNT_TOO_SMALL', 'Amount converts to zero in the destination currency', HttpStatus.UNPROCESSABLE_ENTITY),
    idempotencyKeyMissing: () =>
        new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'The Idempotency-Key header is required', HttpStatus.BAD_REQUEST),
    idempotencyKeyInvalid: () =>
        new DomainError(
        'IDEMPOTENCY_KEY_INVALID',
        'Idempotency-Key must be 8-255 characters of letters, digits, "-", "_", ":" or "."',
        HttpStatus.BAD_REQUEST,
        ),
    idempotencyKeyReused: () =>
        new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used with a different request',
        HttpStatus.UNPROCESSABLE_ENTITY,
        ),
    rateLimited: (policy: string, retryAfterSeconds: number) =>
        new DomainError('RATE_LIMITED', 'Too many requests', HttpStatus.TOO_MANY_REQUESTS, { policy, retryAfterSeconds }),

}