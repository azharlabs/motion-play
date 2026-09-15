# Shared sticky-embed helpers

- `shell.css` — chrome + overlay tokens
- `mini.js` — HUD / canvas / pose listener helpers
- `delight.js` — Pip reactions, goal HUD, combo floats, soft SFX, confetti win
- `key-bridge.js` — parent → keyboard event bridge

**Asset URLs:** each game `index.html` loads these with **root-absolute** paths
(`/external-games/_shared/...`) and a `<base href="/external-games/<slug>/">`.
Vercel is configured with `trailingSlash: false`, which serves
`/external-games/<slug>` without a trailing slash and would 404 `../_shared`
and `./game.js` relative URLs.

- Control channel `motionplay.external-control.v1`:
  - `type: "key"` — synthesize keydown/keyup
  - `type: "pose"` — latest pose snapshot (`mini.js`)
  - `type: "control"` + `action: "stop"|"pause"|"resume"` — release held keys and pause sticky embeds
