import { describe, expect, it } from "vitest";
import { redactMongoUri, validateMongoUri } from "../config/mongo-uri.js";

describe("MongoDB URI configuration", () => {
  it("accepts local, Atlas SRV, and replica-set connection strings", () => {
    expect(validateMongoUri(
      "mongodb://notifyhub:notifyhub_password@mongodb:27017/notifyhub?authSource=admin"
    )).toContain("mongodb://");
    expect(validateMongoUri(
      "mongodb+srv://user:password@cluster.example.mongodb.net/notifyhub?retryWrites=true&w=majority"
    )).toContain("mongodb+srv://");
    expect(validateMongoUri(
      "mongodb://mongo-a:27017,mongo-b:27017/notifyhub?replicaSet=rs0"
    )).toContain("mongo-a");
  });

  it("rejects missing, non-MongoDB, malformed, and whitespace-containing values", () => {
    expect(() => validateMongoUri()).toThrow(/non-empty/);
    expect(() => validateMongoUri("https://example.com/mongo")).toThrow(/mongodb/);
    expect(() => validateMongoUri("mongodb://")).toThrow(/host/);
    expect(() => validateMongoUri("mongodb://mongo host:27017/db")).toThrow(/whitespace/);
    expect(() => validateMongoUri("mongodb+srv://cluster.example.mongodb.net:27017/db")).toThrow(/must not include a port/);
    expect(() => validateMongoUri("mongodb+srv://user:p#ss@cluster.example.mongodb.net/db")).toThrow(/unencoded special characters/);
  });

  it("redacts credentials before a URI is written to logs", () => {
    const redacted = redactMongoUri("mongodb+srv://user:password@cluster.example.mongodb.net/db");
    expect(redacted).toBe("mongodb+srv://***@cluster.example.mongodb.net/db");
    expect(redacted).not.toContain("password");
  });
});
