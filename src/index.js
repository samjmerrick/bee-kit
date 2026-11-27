// Server-side helper for app Workers.
//   export default bee.app({ async fetch(request, env, ctx, user) { ... } })
// `env.BEE` is the service binding to the gateway. A request without a valid sign-in gets 401.
export function app(manifestName, handler) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === `/${manifestName}/health`) return new Response("ok");
      // Paths the app opts out of the sign-in check (it does its own, e.g. a bearer token for a background runner).
      if (handler.open?.(url.pathname)) return (await handler.fetch(request, env, ctx, null)) ?? new Response("Not found", { status: 404 });
      const user = await env.BEE.identify(request.headers, manifestName);
      if (!user) return new Response("Not signed in or no access", { status: 401 });
      const bee = {
        user,
        // Call a shared tool as the signed-in user: await bee.call("search", {query: "x"})
        call: (tool, args = {}) => env.BEE.call(manifestName, tool, args, user.email),
        // Call as the app itself (schedules, background work).
        callAsApp: (tool, args = {}) => env.BEE.call(manifestName, tool, args, "app"),
      };
      const res = await handler.fetch(request, env, ctx, bee);
      if (res) return res;
      // Not handled: serve the app's static files, with the /<app> prefix stripped.
      const u = new URL(request.url);
      u.pathname = u.pathname.slice(manifestName.length + 1) || "/";
      return env.ASSETS.fetch(new Request(u, request));
    },
    async scheduled(event, env, ctx) {
      if (handler.scheduled) return handler.scheduled(event, env, ctx, { callAsApp: (t, a = {}) => env.BEE.call(manifestName, t, a, "app") });
    },
  };
}
