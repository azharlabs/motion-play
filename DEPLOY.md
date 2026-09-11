# Deploy MotionPlay on Vercel

1. Project **Root Directory** must be `stage0` (not repo root).
2. Framework Preset: **Other**.
3. Build Command: empty. Output Directory: empty.
4. Redeploy latest `main` with **Use existing Build Cache** unchecked.
5. Turn off Deployment Protection / Vercel Authentication for Production.

After deploy, these must exist at the site root:
- `/index.html`
- `/css/app.css`
- `/js/main.js`
- `/vendor/planck.mjs`
- `/icons/icon-192.png`

If Vercel Source only shows `index.html` + `css` + `js`, the deployment is not from current `main` or Root Directory is wrong — open the deployment → confirm commit SHA matches GitHub `main`.
