// awsStorageService.ts

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import * as dotenv from "dotenv";
import { StorageService } from "../storageService.js";

dotenv.config();

type S3BodyLike = unknown;

function isNodeReadableStream(value: unknown): value is Readable {
  return value instanceof Readable;
}

function isWebReadableStream(value: unknown): value is ReadableStream<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReadableStream<any>).getReader === "function"
  );
}

function isUint8ArrayLike(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function toNodeReadable(body: S3BodyLike): Readable {
  if (isNodeReadableStream(body)) {
    return body;
  }

  if (isWebReadableStream(body)) {
    const webStream = body;
    const iterator = (async function* () {
      const reader = webStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }
          if (value !== undefined) {
            yield value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    })();

    return Readable.from(iterator);
  }

  if (Buffer.isBuffer(body) || isUint8ArrayLike(body)) {
    return Readable.from([body]);
  }

  throw new Error("Unsupported S3 Body type returned by AWS SDK");
}

export class AwsStorageService extends StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    super();

    // Ensure required environment variables are present
    const region = process.env.S3_AWS_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucketName = process.env.S3_BUCKET_NAME;

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error("Missing required AWS S3 configuration");
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: `https://s3.${region}.amazonaws.com`,
      forcePathStyle: true,
    });

    this.bucket = bucketName;

    // Log configuration (without sensitive data)
    console.log("[AWS S3] Initialized with:", {
      region,
      bucket: bucketName,
      endpoint: `https://s3.${region}.amazonaws.com`,
      hasCredentials: !!accessKeyId && !!secretAccessKey,
    });
  }

  async getObjectURL(key: string, expiresInSeconds = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(["host"]),
      });
    } catch (error) {
      console.error("[AWS S3] Error generating get URL:", error);
      throw error;
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    try {
      console.log("[AWS S3] Getting object stream for:", {
        bucket: this.bucket,
        key,
      });

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error("No body returned from S3 object");
      }

      return toNodeReadable(response.Body);
    } catch (error) {
      console.error("[AWS S3] Error getting object stream:", error);
      throw error;
    }
  }

  async putObject(
    key: string,
    file: Buffer | Uint8Array | Blob | string,
    contentType = "application/pdf"
  ): Promise<{ message: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: contentType,
      });
      await this.s3Client.send(command);
      return { message: "File uploaded successfully" };
    } catch (error) {
      console.error("[AWS S3] Error uploading file:", error);
      throw error;
    }
  }

  async deleteObject(key: string): Promise<{ message: string }> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      return { message: "File deleted successfully" };
    } catch (error) {
      console.error("[AWS S3] Error deleting file:", error);
      throw error;
    }
  }

  async listObjects(prefix: string): Promise<any[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      });
      const response = await this.s3Client.send(command);
      return response.Contents || [];
    } catch (error) {
      console.error("[AWS S3] Error listing objects:", error);
      throw error;
    }
  }

  async getUploadURL(
    key: string,
    contentType = "application/pdf"
  ): Promise<string> {
    try {
      console.log("[AWS S3] Generating upload URL for:", {
        bucket: this.bucket,
        key,
        region: process.env.S3_AWS_REGION,
      });

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600,
        signableHeaders: new Set(["host"]),
      });

      console.log("[AWS S3] Generated upload URL successfully");
      return url;
    } catch (error) {
      console.error("[AWS S3] Error generating upload URL:", error);
      throw error;
    }
  }
}
