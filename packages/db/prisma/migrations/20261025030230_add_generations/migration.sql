-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "text_model" TEXT NOT NULL,
    "text_instructions" TEXT,
    "text_prompt" TEXT NOT NULL,
    "text_input_tokens" INTEGER,
    "text_output_tokens" INTEGER,
    "image_s3_key" TEXT,
    "image_content_type" TEXT,
    "image_size_bytes" INTEGER,
    "image_model" TEXT,
    "image_prompt" TEXT,
    "image_input_tokens" INTEGER,
    "image_output_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_submissions" (
    "generation_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,

    CONSTRAINT "generation_submissions_pkey" PRIMARY KEY ("generation_id","submission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generations_image_s3_key_key" ON "generations"("image_s3_key");

-- CreateIndex
CREATE INDEX "generation_submissions_submission_id_idx" ON "generation_submissions"("submission_id");

-- AddForeignKey
ALTER TABLE "generation_submissions" ADD CONSTRAINT "generation_submissions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_submissions" ADD CONSTRAINT "generation_submissions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An image is all or nothing: its key, type, size, model and prompt are set together. (Prisma
-- can't express this, so it's added here.)
ALTER TABLE "generations" ADD CONSTRAINT "generations_image_complete_check" CHECK (
  ("image_s3_key" IS NULL) = ("image_content_type" IS NULL)
  AND ("image_s3_key" IS NULL) = ("image_size_bytes" IS NULL)
  AND ("image_s3_key" IS NULL) = ("image_model" IS NULL)
  AND ("image_s3_key" IS NULL) = ("image_prompt" IS NULL)
  AND ("image_s3_key" IS NOT NULL OR ("image_input_tokens" IS NULL AND "image_output_tokens" IS NULL))
);
