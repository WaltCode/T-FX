import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1793361073583 implements MigrationInterface {
    name = 'Init1793361073583'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "fx_rates" ("internalId" BIGSERIAL NOT NULL, "id" character varying(40) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "currency" character varying(8) NOT NULL, "per_usd" numeric(36,18) NOT NULL, "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_94eb17e7eddb6df0cec5985ea5f" UNIQUE ("id"), CONSTRAINT "UQ_bdfd4b932ff672e02e4ba2850e8" UNIQUE ("currency"), CONSTRAINT "fx_rates_positive" CHECK ("per_usd" > 0), CONSTRAINT "PK_4493b6843484b91c0582a139c08" PRIMARY KEY ("internalId"))`);
        await queryRunner.query(`CREATE TABLE "idempotency_records" ("internalId" BIGSERIAL NOT NULL, "id" character varying(40) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "scope" character varying(64) NOT NULL, "key" character varying(255) NOT NULL, "request_hash" character varying(64) NOT NULL, "response_status" integer, "response_body" jsonb, "transaction_id" character varying(40), CONSTRAINT "UQ_9ae4e93699362b0d4e3da3dd1c2" UNIQUE ("id"), CONSTRAINT "idempotency_records_scope_key_uq" UNIQUE ("scope", "key"), CONSTRAINT "PK_a37d1d4a30914208c34faa087e2" PRIMARY KEY ("internalId"))`);
        await queryRunner.query(`CREATE TABLE "ledger_entries" ("internalId" BIGSERIAL NOT NULL, "id" character varying(40) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "transaction_id" character varying(40) NOT NULL, "wallet_id" character varying(40) NOT NULL, "currency" character varying(8) NOT NULL, "amount" bigint NOT NULL, "balance_after" bigint, CONSTRAINT "UQ_6efcb84411d3f08b08450ae75d5" UNIQUE ("id"), CONSTRAINT "ledger_entries_non_zero" CHECK ("amount" <> 0), CONSTRAINT "PK_1dd4855b87178ed03dee943b00c" PRIMARY KEY ("internalId"))`);
        await queryRunner.query(`CREATE INDEX "ledger_entries_wallet_idx" ON "ledger_entries"  ("wallet_id", "currency") `);
        await queryRunner.query(`CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries"  ("transaction_id") `);
        await queryRunner.query(`CREATE TABLE "transactions" ("internalId" BIGSERIAL NOT NULL, "id" character varying(40) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "type" character varying(16) NOT NULL, "status" character varying(16) NOT NULL, "wallet_id" character varying(40) NOT NULL, "counterparty_wallet_id" character varying(40), "source_currency" character varying(8) NOT NULL, "source_amount" bigint NOT NULL, "dest_currency" character varying(8) NOT NULL, "dest_amount" bigint NOT NULL, "rate" numeric(36,18), "rate_source" character varying(16), "rate_as_of" TIMESTAMP WITH TIME ZONE, "idempotency_key" character varying(255) NOT NULL, CONSTRAINT "UQ_a219afd8dd77ed80f5a862f1db9" UNIQUE ("id"), CONSTRAINT "transactions_idempotency_uq" UNIQUE ("wallet_id", "idempotency_key"), CONSTRAINT "transactions_positive_amounts" CHECK ("source_amount" > 0 AND "dest_amount" > 0), CONSTRAINT "PK_e5fd016f13bc4072f3272dc705e" PRIMARY KEY ("internalId"))`);
        await queryRunner.query(`CREATE INDEX "transactions_counterparty_history_idx" ON "transactions"  ("counterparty_wallet_id", "internalId") `);
        await queryRunner.query(`CREATE INDEX "transactions_wallet_history_idx" ON "transactions"  ("wallet_id", "internalId") `);
        await queryRunner.query(`CREATE TABLE "balances" ("internalId" BIGSERIAL NOT NULL, "id" character varying(40) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "wallet_id" character varying(40) NOT NULL, "currency" character varying(8) NOT NULL, "amount" bigint NOT NULL, CONSTRAINT "UQ_74904758e813e401abc3d4261c2" UNIQUE ("id"), CONSTRAINT "balances_wallet_currency_uq" UNIQUE ("wallet_id", "currency"), CONSTRAINT "balances_non_negative" CHECK ("amount" >= 0), CONSTRAINT "PK_56a722c1f8aaa9c930370a35ac8" PRIMARY KEY ("internalId"))`);
        await queryRunner.query(`CREATE TABLE "wallets" ("internalId" BIGSERIAL NOT NULL, "id" character varying(40) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "email" character varying(254), "phone" character varying(16), CONSTRAINT "UQ_8402e5df5a30a229380e83e4f7e" UNIQUE ("id"), CONSTRAINT "UQ_a9edfee0de480472ba2aa958268" UNIQUE ("email"), CONSTRAINT "UQ_1823ebd154f9f3b12d94bf82c56" UNIQUE ("phone"), CONSTRAINT "wallets_identity_chk" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL), CONSTRAINT "PK_da3e8374ecc3577fd79f4d888bc" PRIMARY KEY ("internalId"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "wallets"`);
        await queryRunner.query(`DROP TABLE "balances"`);
        await queryRunner.query(`DROP INDEX "public"."transactions_wallet_history_idx"`);
        await queryRunner.query(`DROP INDEX "public"."transactions_counterparty_history_idx"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP INDEX "public"."ledger_entries_transaction_idx"`);
        await queryRunner.query(`DROP INDEX "public"."ledger_entries_wallet_idx"`);
        await queryRunner.query(`DROP TABLE "ledger_entries"`);
        await queryRunner.query(`DROP TABLE "idempotency_records"`);
        await queryRunner.query(`DROP TABLE "fx_rates"`);
    }

}
