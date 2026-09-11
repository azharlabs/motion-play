# MotionPlay

Camera motion-tracking mini-games — your body is the controller.

## Stage 0 (current)

Web prototype: ten camera games driven by MediaPipe Pose Landmarker, installable
to a phone's home screen. Camera frames never leave the device.

```bash
npm test
npm start
npm run check:ui   # headless layout + overlay check, needs the server running
```

`check:ui` drives the real page in headless Chrome with the camera and pose
modules stubbed, so it can verify things Node tests cannot see: that the camera
panel has a real size, and that the skeleton overlay actually paints. Pass
`--shot out.png` to save a screenshot.

(`npm start` uses Python’s `http.server` so you don’t need the `serve` package.)

Then open http://localhost:5173 — details in [stage0/README.md](stage0/README.md).

## Testing it on a phone

A phone will not open its camera for a page served over plain `http` unless
that page is `localhost`, so a laptop on the same Wi-Fi is not enough: real
device testing needs a real HTTPS address.

```bash
npm run share    # a throwaway public HTTPS address, alive while it runs
npm run deploy   # a permanent one, on Cloudflare Pages (free, no card)
```

`share` tunnels the local server out through Cloudflare and prints an address
to open on the phone. Good for trying it yourself or handing to someone in the
room; it dies with the process and all the traffic goes through this machine.

`deploy` uploads `stage0/` to Cloudflare Pages, which is where it should live
if a group of people are testing it over days. There is no build step — the
folder is the site.

Installed on a home screen it runs full screen with no address bar, which
matters beyond looks: the games size themselves to the viewport, and Safari's
bar sliding away mid-round would resize the stage under the player. On iOS
that is Share → *Add to Home Screen*; Android offers a button. The app says so
itself the first time someone arrives from a link.

Testers can report back from inside the app — the speech bubble on the home
screen, or the link on the results screen after a round. Each report carries
the model, the delegate and the frame rate alongside the comment, because
"it didn't work" reads the same whether the phone quietly fell back to the CPU
model or the game genuinely missed a punch. Where reports go is set in
`stage0/js/feedback-form.js`: give it an endpoint that accepts a JSON POST, or
leave it and the tester's own mail app is used.

### Behind a company proxy

`npm` and anything it downloads may fail with
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Windows trusts the proxy's root
certificate but Node ships its own list and does not. Node 22.15+ can be told
to use the system store:

```bash
$env:NODE_OPTIONS = "--use-system-ca"   # PowerShell
```

`share` and `deploy` already set this for the tools they run.

## Physics

Rigid-body simulation runs on [planck.js](https://piqnt.com/planck.js/) 1.5.0, a
JavaScript port of Box2D. It is vendored at `stage0/vendor/planck.mjs` rather
than installed, because the prototype is served as plain ES modules with no
bundler and the same file has to load in the browser and in `node --test`.

To update it:

```bash
curl -o stage0/vendor/planck.mjs https://cdn.jsdelivr.net/npm/planck@1.5.0/dist/planck.mjs
```

`stage0/js/physics.js` is the only module that talks to planck; it converts
between the game's pixels-above-ground and Box2D's metres.

- [Design spec](docs/superpowers/specs/2026-09-04-motionplay-stage0-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-04-motionplay-stage0.md)
