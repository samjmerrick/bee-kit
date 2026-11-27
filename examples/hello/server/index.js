import { app } from "bee-kit";

export default app("hello", {
  async fetch(request, env, ctx, bee) {
    const url = new URL(request.url);
    if (url.pathname === "/hello/api/me") return Response.json({ user: bee.user, whoami: await bee.call("whoami") });
    if (url.pathname === "/hello/api/editor-only") {
      if (!["admin", "manager", "editor"].includes(bee.user.role)) return Response.json({ error: "editors only" }, { status: 403 });
      return Response.json({ ok: true });
    }
    return null;
  },
});
