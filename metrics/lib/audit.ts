import "server-only";
import { sql } from "./db";
import type { AppUser } from "./auth";

export type AuditAction = "sign_in" | "view_members" | "import" | "goal_edit" | "measurement" | "user_change" | "export" | "year_change" | "settings";

export async function audit(user: Pick<AppUser, "email"> | string, action: AuditAction, target: string | null, detail: Record<string, unknown> = {}) {
  const email = typeof user === "string" ? user : user.email;
  await sql`insert into metrics.audit_log (user_email, action, target, detail) values (${email}, ${action}, ${target}, ${sql.json(detail as never)})`;
}
