/**
 * Minimal Chrome DevTools Protocol client over Node's built-in WebSocket.
 * Used to drive a real browser for manual verification; not part of the build.
 */
export async function attach(port = 9222) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let id = 0;
  const waiting = new Map();
  const logs = [];
  const handlers = new Map();

  const anyHandlers = [];

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    // Workers and iframes arrive as their own sessions, so events carry a
    // sessionId saying which one they came from.
    if (msg.method) for (const fn of anyHandlers) fn(msg.method, msg.params, msg.sessionId);
    if (msg.method && handlers.has(msg.method)) handlers.get(msg.method)(msg.params);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push(`EXCEPTION: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === "Log.entryAdded") {
      logs.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      waiting.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  };

  const on = (method, fn) => handlers.set(method, fn);
  const onAny = (fn) => anyHandlers.push(fn);

  return { send, evaluate, on, onAny, logs, close: () => ws.close() };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
