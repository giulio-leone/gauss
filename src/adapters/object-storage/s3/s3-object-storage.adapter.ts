// =============================================================================
// S3 Object Storage Adapter — Implements ObjectStoragePort
// =============================================================================
//
// Requires: @aws-sdk/client-s3 (peer dependency)
// Optionally: @aws-sdk/s3-request-presigner for signed URLs
//
// Usage:
//   import { S3ObjectStorageAdapter } from 'gauss'
//   const storage = new S3ObjectStorageAdapter({
//     bucket: 'my-bucket',
//     region: 'us-east-1',
//   })
//
// =============================================================================

import type {
  ObjectStoragePort,
  ObjectStorageMetadata,
  StoredObject,
  ListObjectsResult,
} from "../../../ports/object-storage.port.js";

export interface S3ObjectStorageOptions {
  /** S3 bucket name */
  bucket: string;
  /** AWS region (default: from env AWS_REGION) */
  region?: string;
  /** Key prefix for all objects (default: '') */
  prefix?: string;
  /** Endpoint URL (for S3-compatible services like MinIO, R2, etc.) */
  endpoint?: string;
  /** Force path-style addressing (default: false, set true for MinIO) */
  forcePathStyle?: boolean;
}

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private client: any;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly options: S3ObjectStorageOptions;

  constructor(options: S3ObjectStorageOptions) {
    this.options = options;
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? "";
  }

  /** Lazily initialize the S3 client */
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    const { S3Client } = await import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region: this.options.region,
      ...(this.options.endpoint ? { endpoint: this.options.endpoint } : {}),
      ...(this.options.forcePathStyle ? { forcePathStyle: true } : {}),
    });
    return this.client;
  }

  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async put(
    key: string,
    body: Buffer | Uint8Array | string,
    metadata?: ObjectStorageMetadata,
  ): Promise<void> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.fullKey(key),
        Body: typeof body === "string" ? Buffer.from(body, "utf-8") : body,
        ContentType: metadata?.contentType ?? "application/octet-stream",
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const client = await this.getClient();
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const response = await client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(key),
        }),
      );
      const bodyBytes = await response.Body?.transformToByteArray();
      return {
        key,
        body: bodyBytes ? Buffer.from(bodyBytes) : Buffer.alloc(0),
        metadata: {
          contentType: response.ContentType,
          contentLength: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag,
        },
      };
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(key),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(key),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async list(
    prefix?: string,
    maxKeys?: number,
    continuationToken?: string,
  ): Promise<ListObjectsResult> {
    const client = await this.getClient();
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const fullPrefix = prefix
      ? this.fullKey(prefix)
      : this.prefix || undefined;

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: fullPrefix,
        MaxKeys: maxKeys ?? 1000,
        ContinuationToken: continuationToken,
      }),
    );

    return {
      objects: (response.Contents ?? []).map((obj: any) => ({
        key: this.prefix ? obj.Key.slice(this.prefix.length + 1) : obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
      })),
      continuationToken: response.NextContinuationToken,
      isTruncated: response.IsTruncated ?? false,
    };
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
      { expiresIn: expiresInSeconds },
    );
  }
}
