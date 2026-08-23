-- CreateTable
CREATE TABLE "provider_credential" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "provider_account_reference" TEXT NOT NULL,
    "encrypted_payload" TEXT NOT NULL,
    "encryption_key_id" TEXT NOT NULL DEFAULT 'v1',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "provider_credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_credential_ward_id_channel_idx" ON "provider_credential"("ward_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credential_ward_id_channel_provider_account_refere_key" ON "provider_credential"("ward_id", "channel", "provider_account_reference");

-- AddForeignKey
ALTER TABLE "provider_credential" ADD CONSTRAINT "provider_credential_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
