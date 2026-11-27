// Validates app.json. Throws with a readable message.
export const KNOWN_TOOLS = new Set(["whoami", "list_projects", "describe_project", "store", "get", "update", "delete", "search", "list_records", "list_collections", "collection_set", "member_set", "jobs.enqueue"]);
export const JOB_KINDS = new Set(["fetch", "rss", "readability", "gousto"]);

export function validateManifest(m) {
  const err = (msg) => { throw new Error(`app.json: ${msg}`); };
  if (!m || typeof m !== "object") err("must be an object");
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(m.name ?? "")) err("name must be lowercase letters, digits and dashes (2-31 chars)");
  if (m.path !== `/${m.name}`) err(`path must be "/${m.name}"`);
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(m.project ?? "")) err("project (the bee-database project whose roles apply) is required");
  for (const t of m.tools ?? []) if (!KNOWN_TOOLS.has(t)) err(`unknown tool "${t}"`);
  for (const j of m.jobs ?? []) if (!JOB_KINDS.has(j)) err(`unknown job kind "${j}"`);
  for (const s of m.schedules ?? []) if (!s.cron || !s.handler) err("each schedule needs cron and handler");
  for (const o of m.offers ?? []) if (!o.name || !o.description) err("each offer needs name and description");
  return m;
}
