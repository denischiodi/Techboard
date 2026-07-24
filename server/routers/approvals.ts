import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as approvalStore from "../approvalStore";
import * as projectAccess from "../projectAccess";

const entityType = z.enum(["bdcq_answer", "dcd", "gap", "test_case", "activity", "workshop", "configuration", "risk", "issue", "cutover", "closure"]);
const quorum = z.enum(["any", "all", "minimum"]);

export const approvalsRouter = router({
  members: protectedProcedure.input(z.object({ projectId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await projectAccess.assertProjectCapability(ctx.appUser, input.projectId, "viewProject");
    return projectAccess.listProjectMemberships(input.projectId);
  }),
  policies: protectedProcedure.input(z.object({ projectId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await projectAccess.assertProjectCapability(ctx.appUser, input.projectId, "viewProject");
    return approvalStore.listPolicies(input.projectId);
  }),
  configurePolicy: protectedProcedure.input(z.object({
    projectId: z.string().min(1), entityType, enabled: z.boolean(), quorum,
    minimumApprovals: z.number().int().min(1).default(1), approverMembershipIds: z.array(z.string().min(1)).max(100),
  })).mutation(async ({ ctx, input }) => {
    await projectAccess.assertProjectCapability(ctx.appUser, input.projectId, "configureGovernance");
    return approvalStore.upsertPolicy(input);
  }),
  history: protectedProcedure.input(z.object({ projectId: z.string().min(1), entityType: entityType.optional(), entityId: z.string().optional() })).query(async ({ ctx, input }) => {
    await projectAccess.assertProjectCapability(ctx.appUser, input.projectId, "viewProject");
    return approvalStore.listRounds(input.projectId, input.entityType, input.entityId);
  }),
  submit: protectedProcedure.input(z.object({
    projectId: z.string().min(1), entityType, entityId: z.string().min(1),
    approverMembershipIds: z.array(z.string().min(1)).max(100).optional(), quorum: quorum.optional(),
    minimumApprovals: z.number().int().min(1).optional(),
  })).mutation(async ({ ctx, input }) => {
    await projectAccess.assertProjectCapability(ctx.appUser, input.projectId, "submitForApproval");
    return approvalStore.submitForApproval({ ...input, requestedBy: ctx.appUser });
  }),
  decide: protectedProcedure.input(z.object({ roundId: z.string().min(1), decision: z.enum(["approved", "rejected"]), comment: z.string().max(10_000).default("") })).mutation(({ ctx, input }) =>
    approvalStore.decide(input.roundId, ctx.appUser, input.decision, input.comment)),
  reopen: protectedProcedure.input(z.object({ roundId: z.string().min(1), justification: z.string().trim().min(1).max(10_000) })).mutation(({ ctx, input }) =>
    approvalStore.reopen(input.roundId, ctx.appUser, input.justification)),
});
