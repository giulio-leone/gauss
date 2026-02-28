// =============================================================================
// ObjectStoragePort — Blob/object storage abstraction (S3, GCS, etc.)
// =============================================================================

export interface ObjectStorageMetadata {
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
  etag?: string;
  [key: string]: unknown;
}

export interface StoredObject {
  key: string;
  body: Buffer | Uint8Array | ReadableStream;
  metadata: ObjectStorageMetadata;
}

export interface ListObjectsResult {
  objects: Array<{ key: string; size: number; lastModified: Date }>;
  continuationToken?: string;
  isTruncated: boolean;
}

// =============================================================================
// Port interface
// =============================================================================

export interface ObjectStoragePort {
  /** Upload an object */
  put(
    key: string,
    body: Buffer | Uint8Array | string,
    metadata?: ObjectStorageMetadata,
  ): Promise<void>;

  /** Get an object */
  get(key: string): Promise<StoredObject | null>;

  /** Delete an object */
  delete(key: string): Promise<boolean>;

  /** Check if an object exists */
  exists(key: string): Promise<boolean>;

  /** List objects with optional prefix */
  list(prefix?: string, maxKeys?: number, continuationToken?: string): Promise<ListObjectsResult>;

  /** Get a pre-signed URL for temporary access */
  getSignedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}
