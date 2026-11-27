// Browser helper: fetch JSON from the app, and reload to sign in again if the session has expired.
export async function api(path, init = {}) {
  const res = await fetch(path, { ...init, redirect: "manual", headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  const html = (res.headers.get("content-type") ?? "").includes("text/html");
  if (res.type === "opaqueredirect" || res.status === 401 || (html && res.ok && !String(init.accept ?? "").includes("html"))) {
    location.reload();
    return new Promise(() => {});
  }
  return res;
}
