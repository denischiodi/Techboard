import { getPgPool } from "./db";
import { ENV } from "./_core/env";
import * as plannerStore from "./plannerStore";
import { getActivityEmailNotificationsEnabled } from "./systemSettings";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character
  );
}

export async function flushActivityEmailOutbox(limit = 25) {
  const db = getPgPool();
  if (!db) return;
  if (!(await getActivityEmailNotificationsEnabled(db))) {
    await db.query(
      `UPDATE "activity_notifications"
       SET "emailStatus" = 'skipped',
           "lastEmailError" = 'Envio de notificações por e-mail desativado por configuração'
       WHERE "emailStatus" IN ('pending','failed')`
    );
    return;
  }
  const pending = await db.query(
    `SELECT * FROM "activity_notifications" WHERE "emailStatus" IN ('pending','failed') AND "emailAttempts" < 5 ORDER BY "createdAt" LIMIT $1`,
    [limit]
  );
  if (pending.rows.length === 0) return;
  const users = await plannerStore.listAppUsers();
  for (const notification of pending.rows) {
    const user = users.find(item => item.id === notification.userId);
    const resource =
      !user && String(notification.userId).startsWith("resource:")
        ? await plannerStore.getResourceById(
            String(notification.userId).slice("resource:".length)
          )
        : null;
    const email = user?.email || resource?.email || "";
    if (!email) {
      await db.query(
        `UPDATE "activity_notifications" SET "emailStatus" = 'skipped', "lastEmailError" = 'Usuário sem e-mail' WHERE "id" = $1`,
        [notification.id]
      );
      continue;
    }
    try {
      if (ENV.emailDeliveryMode === "log") {
        console.info(`[Activity email] ${email}: ${notification.title}`);
      } else {
        if (!ENV.resendApiKey || !ENV.emailFrom)
          throw new Error("RESEND_API_KEY/EMAIL_FROM não configurados");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: ENV.emailFrom,
            to: email,
            subject: `[TechBoard+] ${notification.title}`,
            text: `${notification.message}\n\nAbra a atividade no TechBoard+.`,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>${escapeHtml(notification.title)}</h2><p>${escapeHtml(notification.message)}</p><p>Abra a atividade no TechBoard+ para acompanhar.</p></div>`,
          }),
        });
        if (!response.ok)
          throw new Error(
            `${response.status}: ${await response.text().catch(() => response.statusText)}`
          );
      }
      await db.query(
        `UPDATE "activity_notifications" SET "emailStatus" = 'sent', "emailAttempts" = "emailAttempts" + 1, "lastEmailError" = '' WHERE "id" = $1`,
        [notification.id]
      );
    } catch (error) {
      await db.query(
        `UPDATE "activity_notifications" SET "emailStatus" = 'failed', "emailAttempts" = "emailAttempts" + 1, "lastEmailError" = $2 WHERE "id" = $1`,
        [
          notification.id,
          error instanceof Error ? error.message : String(error),
        ]
      );
    }
  }
}
