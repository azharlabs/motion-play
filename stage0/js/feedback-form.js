/**
 * Collecting what testers think.
 *
 * The hard part of testing a motion game remotely is that "it didn't work" is
 * almost useless on its own: the same sentence covers a phone that fell back to
 * the slow CPU model, a room too dark to see a hand in, and a punch the game
 * genuinely failed to read. So each report carries the handful of facts that
 * tell those apart, gathered automatically, and shown to the tester first so
 * nothing is collected behind their back.
 *
 * There is no server, on purpose. Where the report goes is one setting below:
 * with no endpoint configured it opens the tester's own mail app with
 * everything filled in, which needs nothing set up anywhere.
 */

/**
 * Where reports go.
 *
 * `endpoint` takes anything that accepts a JSON POST - a Formspree form, a
 * Google Apps Script web app, a serverless function. Leave it null and the
 * mail app is used instead.
 */
export const FEEDBACK = {
  endpoint: null,
  email: "",
};

/**
 * Is there anywhere for a report to go?
 *
 * With neither set there is nothing to send to, and a Send button that opens a
 * mail app with an empty To: line is worse than no button - the tester writes
 * the thing, presses the obvious control, and it quietly goes nowhere. So the
 * screen offers only Copy until one of the two above is filled in.
 */
export const canSend = () => Boolean(FEEDBACK.endpoint || FEEDBACK.email);

const RATINGS = [
  { value: 1, face: "😖", label: "Barely worked" },
  { value: 2, face: "😕", label: "Missed a lot" },
  { value: 3, face: "🙂", label: "Mostly fine" },
  { value: 4, face: "😀", label: "Good" },
  { value: 5, face: "🤩", label: "Read me perfectly" },
];

/**
 * What the phone is, in the terms that explain a bad round.
 *
 * `pose` is whatever the app knows about the running tracker - which model, on
 * the GPU or the CPU, and how fast it managed - and is the first thing worth
 * looking at when someone says the game felt late.
 */
export function diagnostics({ pose = null, installed = false } = {}) {
  const s = window.screen ?? {};
  return {
    when: new Date().toISOString(),
    device: navigator.userAgent,
    screen: `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)} css, ${
      s.width ?? "?"
    }x${s.height ?? "?"} device, dpr ${window.devicePixelRatio ?? 1}`,
    cores: navigator.hardwareConcurrency ?? "unknown",
    memoryGb: navigator.deviceMemory ?? "unknown",
    installed: installed ? "home screen" : "browser tab",
    pose: pose
      ? `${pose.model ?? "?"} model on ${pose.delegate ?? "?"}, ${
          pose.fps ? `${pose.fps} fps, ` : ""
        }${pose.inferMs ? `${pose.inferMs} ms per frame` : ""}`.trim()
      : "never started",
  };
}

/** The report as a person would read it, which is also how it is mailed. */
export function asText(report) {
  const lines = [
    `Rating: ${report.rating ? `${report.rating}/5` : "not given"}`,
    `Game: ${report.game || "not said"}`,
    "",
    report.notes || "(no notes)",
    "",
    "--- device ---",
  ];
  for (const [key, value] of Object.entries(report.diagnostics)) {
    lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
}

/**
 * Wire up the feedback screen.
 *
 * `context()` is asked for the live facts at the moment of sending rather than
 * when the screen was built, so a report written after a round carries that
 * round's frame rate and not the numbers from start-up.
 */
export function setupFeedback({ els, games, context, onClose }) {
  let rating = 0;

  for (const { value, face, label } of RATINGS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rating-face";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = face;
    button.addEventListener("click", () => {
      rating = value;
      for (const other of els.rating.children) {
        const on = other === button;
        other.setAttribute("aria-checked", String(on));
        other.classList.toggle("picked", on);
      }
      els.status.textContent = label;
    });
    els.rating.append(button);
  }

  els.game.append(new Option("Not about one game", ""));
  for (const game of games) els.game.append(new Option(game.title, game.title));

  if (!canSend()) {
    els.send.hidden = true;
    els.copy.textContent = "Copy this report";
    els.copy.classList.remove("ghost");
    els.copy.classList.add("primary");
  }

  /** Everything the tester has said, plus what the phone can tell us. */
  const gather = () => ({
    rating,
    game: els.game.value,
    notes: els.notes.value.trim(),
    diagnostics: diagnostics(context()),
  });

  const refresh = () => {
    const shown = diagnostics(context());
    els.diagnostics.textContent = Object.entries(shown)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  };

  const say = (message) => {
    els.status.textContent = message;
  };

  els.send.addEventListener("click", async () => {
    const report = gather();
    if (!report.rating && !report.notes) {
      say("Add a rating or a note first.");
      return;
    }

    els.send.disabled = true;
    try {
      if (FEEDBACK.endpoint) {
        const res = await fetch(FEEDBACK.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(report),
        });
        if (!res.ok) throw new Error(`the server said ${res.status}`);
        say("Sent — thank you.");
        reset();
      } else {
        // No collector set up, so hand it to whatever the tester sends mail
        // with. The subject carries the rating so reports sort themselves.
        const subject = `MotionPlay feedback${report.rating ? ` — ${report.rating}/5` : ""}`;
        const href = `mailto:${FEEDBACK.email}?subject=${encodeURIComponent(
          subject,
        )}&body=${encodeURIComponent(asText(report))}`;
        window.location.href = href;
        say("Opening your mail app…");
      }
    } catch (err) {
      say(`Could not send it (${err.message}). Try “Copy instead”.`);
    } finally {
      els.send.disabled = false;
    }
  });

  els.copy.addEventListener("click", async () => {
    const text = asText(gather());
    try {
      await navigator.clipboard.writeText(text);
      say("Copied — paste it wherever you like.");
    } catch {
      // Clipboard access is refused in plenty of situations; showing the text
      // at least lets someone select it by hand.
      els.diagnostics.textContent = text;
      els.tech.open = true;
      say("Could not reach the clipboard — the report is below to copy.");
    }
  });

  function reset() {
    rating = 0;
    els.notes.value = "";
    for (const face of els.rating.children) {
      face.setAttribute("aria-checked", "false");
      face.classList.remove("picked");
    }
  }

  els.back.addEventListener("click", () => onClose());

  /** Called each time the screen is opened, to refresh what it will send. */
  return function open(aboutGame = "") {
    if (aboutGame) els.game.value = aboutGame;
    say("");
    refresh();
  };
}
