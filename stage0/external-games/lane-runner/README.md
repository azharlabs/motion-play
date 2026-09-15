# MotionPlay Lane Runner

MotionPlay-built HTML5 **3-lane endless runner** for the controller-first sticky path.

## License

Original MotionPlay code under the same terms as the MotionPlay repository (permissive / project license).  
**Not** derived from commercial Subway Surfers, Temple Run, or other proprietary runners.  
Art and audio are procedural (canvas + Web Audio) — no ripped commercial assets.

## Controls (keyboard)

| Key | Action |
|-----|--------|
| ← / → | Change lane |
| ↑ | Jump |
| ↓ | Slide / duck |
| Space / Enter | Start or restart |
| P | Pause |

MotionPlay’s **runner** profile maps body lean / jump / crouch onto these arrow keys via the external bridge (same-origin iframe `postMessage`, or the Chrome extension as a secondary path).

## Same-origin play

Served from `stage0/external-games/lane-runner/` so Vercel hosts it on the MotionPlay origin. The controller embeds this page in an iframe and injects keys without a third-party host.
