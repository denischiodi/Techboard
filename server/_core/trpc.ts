import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import * as store from "../plannerStore";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireActiveAppUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (!ctx.user.email) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuario autenticado sem e-mail vinculado" });
  }

  const appUser = await store.getAppUserByEmail(ctx.user.email);
  if (!appUser?.active) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "E-mail sem acesso ativo. Solicite liberacao em Gestao de Acesso.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      appUser,
      user: {
        ...ctx.user,
        email: appUser.email,
        name: appUser.name,
        role: appUser.role === "admin" ? "admin" as const : "user" as const,
      },
    },
  });
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser).use(requireActiveAppUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (!ctx.user.email) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Usuario autenticado sem e-mail vinculado" });
    }

    const appUser = await store.getAppUserByEmail(ctx.user.email);
    if (!appUser?.active || appUser.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        appUser,
        user: {
          ...ctx.user,
          email: appUser.email,
          name: appUser.name,
          role: "admin" as const,
        },
      },
    });
  }),
);
