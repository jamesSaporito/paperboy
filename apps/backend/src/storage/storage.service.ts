import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ENV, type Env } from "../env";

export type StoredObject = { data: Buffer; contentType: string | undefined };

/** Reads and writes objects in the S3_BUCKET bucket. */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.AWS_REGION,
      // An S3-compatible server (locally: s3mock) instead of AWS. These serve buckets by path.
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async putObject(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<StoredObject> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`s3://${this.bucket}/${key} has no body`);
    return {
      data: Buffer.from(await response.Body.transformToByteArray()),
      contentType: response.ContentType,
    };
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
