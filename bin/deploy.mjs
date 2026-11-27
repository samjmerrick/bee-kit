#!/usr/bin/env node
// Deploys an app repo: validate app.json, create/migrate its D1, deploy the Worker, register it, health-check.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Run from the app repo root.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateManifest } from "../src/manifest.js";

const { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } = process.env;
if (!TOKEN || !ACCOUNT) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
const HOST = "apps.samjmerrick.com", ZONE = "samjmerrick.com";
const KV_NS = process.env.BEE_KV_NAMESPACE ?? "ec74c6f7fd0344bcbef0e9bf6093b25a";
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const cf = async (path, init = {}) => {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok || j.success === false) throw new Error(`Cloudflare ${path}: ${r.status} ${JSON.stringify(j.errors ?? j)}`);
  return j.result;
};
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", env: process.env });
const log = (m) => console.log(`\n== ${m}`);

const manifest = validateManifest(JSON.parse(readFileSync("app.json", "utf8")));
const name = manifest.name;
const hasServer = existsSync("server/index.js");
const hasMigrations = existsSync("migrations") && readdirSync("migrations").some((f) => f.endsWith(".sql"));

log("database");
let dbId = null;
if (hasMigrations) {
  const dbs = await cf(`/d1/database?name=${name}`);
  dbId = dbs.find((d) => d.name === name)?.uuid ?? (await cf("/d1/database", { method: "POST", body: JSON.stringify({ name }) })).uuid;
}

log("wrangler.jsonc");
const wr = {
  name: `bee-app-${name}`, main: hasServer ? "server/index.js" : "server/_stub.js", compatibility_date: "2026-11-01", compatibility_flags: ["nodejs_compat"],
  workers_dev: false, preview_urls: false,
  routes: [{ pattern: `${HOST}${manifest.path}/*`, zone_name: ZONE }, { pattern: `${HOST}${manifest.path}`, zone_name: ZONE }],
  assets: { directory: "public", binding: "ASSETS", run_worker_first: true },
  services: [{ binding: "BEE", service: "bee-mcp", entrypoint: "Gateway" }],
  ...(dbId ? { d1_databases: [{ binding: "DB", database_name: name, database_id: dbId, migrations_dir: "migrations" }] } : {}),
  ...((manifest.schedules ?? []).length ? { triggers: { crons: [] } } : {}),
};
if (!hasServer) { try { run("mkdir", ["-p", "server"]); } catch {} writeFileSync("server/_stub.js", `import { app } from "${new URL("../src/index.js", import.meta.url).pathname}";\nexport default app(${JSON.stringify(name)}, { fetch: () => null });\n`); }
writeFileSync("wrangler.jsonc", JSON.stringify(wr, null, 2));

if (dbId) { log("migrations"); run("npx", ["wrangler", "d1", "migrations", "apply", name, "--remote"]); }

log("deploy");
run("npx", ["wrangler", "deploy"]);

log("access");
const apps = await cf("/access/apps");
const access = apps.find((a) => a.name === "Bee apps");
if (!access) throw new Error('Access application "Bee apps" not found');
const dest = `${HOST}${manifest.path}`;
if (!(access.destinations ?? []).some((d) => d.uri === dest)) {
  const body = { ...access, destinations: [...(access.destinations ?? []), { type: "public", uri: dest }] };
  for (const k of ["id", "uid", "created_at", "updated_at", "aud", "policies"]) delete body[k];
  await cf(`/access/apps/${access.id}`, { method: "PUT", body: JSON.stringify(body) });
}

// Paths the app guards itself (e.g. a bearer token for a background runner) are let past Access: a more specific
// application with a bypass policy, which Access prefers over the broader "Bee apps" one.
for (const open of manifest.open ?? []) {
  const uri = `${HOST}${manifest.path}${open}`;
  const appName = `Bee app ${name}: ${open}`;
  const exists = (await cf("/access/apps")).find((a) => a.name === appName);
  if (!exists) {
    await cf("/access/apps", { method: "POST", body: JSON.stringify({
      name: appName, type: "self_hosted", destinations: [{ type: "public", uri }], session_duration: "24h",
      policies: [{ name: "Bypass (app checks its own token)", decision: "bypass", include: [{ everyone: {} }] }],
    }) });
    console.log(`Access bypass for ${uri}`);
  }
}

log("register");
await cf(`/storage/kv/namespaces/${KV_NS}/values/app:${name}`, { method: "PUT", body: JSON.stringify(manifest), headers: { "Content-Type": "text/plain" } });

log("health");
await new Promise((r) => setTimeout(r, 5000));
const res = await fetch(`https://${HOST}${manifest.path}/health`, { redirect: "manual" });
// 200 = app answered; a redirect to the Access login means the route and Access policy are live.
if (!(res.status === 200 || res.status === 302)) throw new Error(`health check failed: ${res.status}`);
console.log(`\n${name} deployed: https://${HOST}${manifest.path}/ (health ${res.status})`);
