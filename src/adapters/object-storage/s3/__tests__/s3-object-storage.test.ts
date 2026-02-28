import { describe, it, expect, vi } from "vitest";
import { S3ObjectStorageAdapter } from "../s3-object-storage.adapter.js";

// Mock @aws-sdk/client-s3
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
}));

describe("S3ObjectStorageAdapter", () => {
  it("can be instantiated with bucket", () => {
    const adapter = new S3ObjectStorageAdapter({ bucket: "test-bucket" });
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(S3ObjectStorageAdapter);
  });

  it("implements ObjectStoragePort methods", () => {
    const adapter = new S3ObjectStorageAdapter({ bucket: "test" });
    expect(typeof adapter.put).toBe("function");
    expect(typeof adapter.get).toBe("function");
    expect(typeof adapter.delete).toBe("function");
    expect(typeof adapter.exists).toBe("function");
    expect(typeof adapter.list).toBe("function");
    expect(typeof adapter.getSignedUrl).toBe("function");
  });

  it("supports S3-compatible endpoints (MinIO, R2)", () => {
    const adapter = new S3ObjectStorageAdapter({
      bucket: "test",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
    });
    expect(adapter).toBeDefined();
  });

  it("supports key prefix", () => {
    const adapter = new S3ObjectStorageAdapter({
      bucket: "test",
      prefix: "gauss/artifacts",
    });
    expect(adapter).toBeDefined();
  });
});
