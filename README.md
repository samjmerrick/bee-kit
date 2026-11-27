# bee-kit

Shared kit for apps on `apps.samjmerrick.com`. An app is a repo with:

- `app.json` — name, path (`/<name>`), project (whose roles apply), the shared tools it may call, schedules, job kinds
- `public/` — static files, served under `/<name>/`
- `server/index.js` (optional) — `export default app("<name>", { fetch(request, env, ctx, bee) {…} })`; return nothing to fall through to `public/`
- `migrations/` (optional) — numbered `.sql` files applied to the app's own D1 (`env.DB`)

`bee.user` is `{ email, name, role, admin }`; `bee.call(tool, args)` calls a shared tool as the signed-in person, limited to the tools listed in `app.json`.

Deploy on merge with a workflow:

```yaml
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: samjmerrick/bee-kit@v0.1.0
        with:
          cloudflare-api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Locally: `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npx bee-deploy` from the app repo. See `examples/hello`.

## Paths that skip the sign-in

An app that has a background runner (or any caller that cannot sign in) can list path prefixes in `app.json`, e.g.
`"open": ["/_bee"]`. Deploy adds a bypass in Access for them, and `bee.app(name, { open: (pathname) => …, fetch })` calls
`fetch` with `bee === null` for those paths. The app must do its own check (such as a bearer token from `env.BEE.secret`).
