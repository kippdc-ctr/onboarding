import "server-only";
import { sql } from "./db";

/** Record who did what. Every observation, track change, import, and settings change calls this. */
export async function audit(actor: string | null, action: string, entity = "", entityId = "", detail?: unknown) {
  await sql`insert into audit_log (actor, action, entity, entity_id, detail)
            values (${actor}, ${action}, ${entity}, ${entityId}, ${detail === undefined ? null : sql.json(detail as never)})`;
}
