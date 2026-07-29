import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  localStoragePath,
  storagePresignPut,
  storagePutLocalChunk,
  storageValidateUpload,
} from "./storage";

let testRoot = "";

afterEach(async () => {
  delete process.env.LOCAL_STORAGE_DIR;
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
  testRoot = "";
});

describe("local chunk storage", () => {
  it("assembles ordered chunks and validates the final size", async () => {
    testRoot = await mkdtemp(join(tmpdir(), "techboard-storage-test-"));
    process.env.LOCAL_STORAGE_DIR = testRoot;
    const target = await storagePresignPut("sap-library/test/release.zip");
    expect(target.localUpload).toBeDefined();
    const first = Buffer.from("SAP ");
    const second = Buffer.from("ZIP");
    const totalSize = first.length + second.length;

    await storagePutLocalChunk({
      key: target.key,
      expires: target.localUpload!.expires,
      signature: target.localUpload!.signature,
      part: 0,
      totalParts: 2,
      offset: 0,
      totalSize,
      data: first,
    });
    await storagePutLocalChunk({
      key: target.key,
      expires: target.localUpload!.expires,
      signature: target.localUpload!.signature,
      part: 1,
      totalParts: 2,
      offset: first.length,
      totalSize,
      data: second,
    });

    await storageValidateUpload(target.key, totalSize);
    expect(await readFile(localStoragePath(target.key), "utf8")).toBe("SAP ZIP");
  });

  it("rejects a chunk sent at the wrong offset", async () => {
    testRoot = await mkdtemp(join(tmpdir(), "techboard-storage-test-"));
    process.env.LOCAL_STORAGE_DIR = testRoot;
    const target = await storagePresignPut("sap-library/test/release.zip");

    await expect(
      storagePutLocalChunk({
        key: target.key,
        expires: target.localUpload!.expires,
        signature: target.localUpload!.signature,
        part: 1,
        totalParts: 2,
        offset: 4,
        totalSize: 7,
        data: Buffer.from("ZIP"),
      })
    ).rejects.toThrow("Parte fora de ordem");
  });
});
