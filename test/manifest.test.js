import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManifest } from "../src/manifest.js";

const ok = { name: "sift", path: "/sift", project: "sift", tools: ["search"], jobs: ["rss"] };
test("accepts a valid manifest", () => assert.equal(validateManifest(ok).name, "sift"));
test("rejects unknown tools and job kinds", () => {
  assert.throws(() => validateManifest({ ...ok, tools: ["drop_everything"] }), /unknown tool/);
  assert.throws(() => validateManifest({ ...ok, jobs: ["mine_bitcoin"] }), /unknown job kind/);
});
test("path must match the name", () => assert.throws(() => validateManifest({ ...ok, path: "/other" }), /path/));
