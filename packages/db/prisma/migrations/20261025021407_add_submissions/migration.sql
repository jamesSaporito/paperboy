-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "summary" TEXT,
    "email_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_images" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "submissions_email_message_id_key" ON "submissions"("email_message_id");

-- CreateIndex
CREATE INDEX "submissions_contact_id_idx" ON "submissions"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_images_s3_key_key" ON "submission_images"("s3_key");

-- CreateIndex
CREATE UNIQUE INDEX "submission_images_submission_id_position_key" ON "submission_images"("submission_id", "position");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_images" ADD CONSTRAINT "submission_images_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
