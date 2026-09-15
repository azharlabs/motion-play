# Shared sticky-embed helpers

- `shell.css` — chrome + overlay tokens
- `mini.js` — HUD / canvas / pose listener helpers
- `key-bridge.js` — parent → keyboard event bridge

**Asset URLs:** each game `index.html` loads these with **root-absolute** paths
(`/external-games/_shared/...`) and a `<base href="/external-games/<slug>/">`.
Vercel is configured with `trailingSlash: false`, which serves
`/external-games/<slug>` without a trailing slash and would 404 `../_shared`
and `./game.js` relative URLs.
