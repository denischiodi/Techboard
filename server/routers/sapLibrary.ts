import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePresignPut, storagePutLocalChunk, storageValidateUpload } from "../storage";
import * as library from "../sapLibraryStore";

export const sapLibraryRouter = router({
  releases: protectedProcedure.query(() => library.listReleases()),
  scopes: protectedProcedure
    .input(z.object({
      releaseId: z.string().optional(),
      search: z.string().max(255).default(""),
      limit: z.number().int().min(1).max(500).default(200),
    }).default({ search: "", limit: 200 }))
    .query(({ input }) => library.listScopes(input)),
  assets: protectedProcedure
    .input(z.object({ scopeId: z.string().min(1) }))
    .query(({ input }) => library.listAssets(input.scopeId)),
  prepareUpload: adminProcedure
    .input(z.object({
      releaseCode: z.string().trim().regex(/^[A-Za-z0-9_-]{3,64}$/),
      fileName: z.string().trim().min(1).max(255).regex(/\.zip$/i),
    }))
    .mutation(async ({ input }) => {
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      return storagePresignPut(`sap-library/${input.releaseCode}/${nanoid()}-${safeName}`);
    }),
  uploadChunk: adminProcedure
    .input(z.object({
      key: z.string().min(1).max(2000),
      expires: z.number().int().positive(),
      signature: z.string().regex(/^[a-f0-9]{64}$/),
      part: z.number().int().min(0),
      totalParts: z.number().int().min(1).max(2000),
      offset: z.number().int().min(0).max(2 * 1024 * 1024 * 1024),
      totalSize: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
      dataBase64: z.string().min(1).max(6_000_000),
    }))
    .mutation(({ input }) => storagePutLocalChunk({
      key: input.key,
      expires: input.expires,
      signature: input.signature,
      part: input.part,
      totalParts: input.totalParts,
      offset: input.offset,
      totalSize: input.totalSize,
      data: Buffer.from(input.dataBase64, "base64"),
    })),
  registerUpload: adminProcedure
    .input(z.object({
      releaseCode: z.string().trim().regex(/^[A-Za-z0-9_-]{3,64}$/),
      country: z.string().trim().max(8).default("BR"),
      fileName: z.string().trim().min(1).max(255).regex(/\.zip$/i),
      storageKey: z.string().min(1).max(2000),
      sizeBytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
      checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await storageValidateUpload(input.storageKey, input.sizeBytes);
      return library.registerRelease({
        ...input,
        checksum: input.checksum || createHash("sha256").update(`${input.storageKey}:${input.sizeBytes}`).digest("hex"),
        uploadedBy: ctx.appUser.id,
      });
    }),
  activate: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => library.activateRelease(input.id, ctx.appUser.id)),
  retry: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      void library.processRelease(input.id);
      return { started: true };
    }),
});
