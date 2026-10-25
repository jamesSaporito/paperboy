/** The simulated phone: a single page served at `/`. Renders with textContent only (no HTML injection). */
export const UI_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Twilio Simulator</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f4f4f5; --panel: #ffffff; --text: #18181b; --muted: #71717a; --border: #e4e4e7;
    --mine: #2563eb; --mine-text: #ffffff; --theirs: #e4e4e7; --error: #dc2626;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #09090b; --panel: #18181b; --text: #fafafa; --muted: #a1a1aa; --border: #27272a;
      --theirs: #27272a; --error: #f87171;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.4 system-ui, -apple-system, sans-serif; }
  main { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column;
    background: var(--panel); border-inline: 1px solid var(--border); }
  header { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  header h1 { margin: 0; font-size: 16px; }
  header p { margin: 2px 0 0; color: var(--muted); font-size: 12px; word-break: break-all; }
  header button { float: right; }
  #thread { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 80%; display: flex; flex-direction: column; gap: 4px; }
  .msg.mine { align-self: flex-end; align-items: flex-end; }
  .bubble { padding: 8px 12px; border-radius: 16px; background: var(--theirs); white-space: pre-wrap;
    word-break: break-word; }
  .mine .bubble { background: var(--mine); color: var(--mine-text); }
  .bubble img { display: block; max-width: 100%; max-height: 240px; border-radius: 10px; margin: 4px 0; }
  .meta { color: var(--muted); font-size: 11px; }
  .error { color: var(--error); font-size: 12px; }
  .empty { color: var(--muted); text-align: center; margin: auto; }
  form { border-top: 1px solid var(--border); padding: 12px 16px; display: grid; gap: 8px; }
  label { font-size: 12px; color: var(--muted); display: grid; gap: 4px; }
  input, textarea, button { font: inherit; color: inherit; }
  input[type=text], textarea { width: 100%; padding: 8px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--bg); }
  textarea { resize: vertical; min-height: 60px; }
  button { padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg);
    cursor: pointer; }
  button[type=submit] { background: var(--mine); color: var(--mine-text); border-color: var(--mine); }
  button:disabled { opacity: .6; cursor: progress; }
  .row { display: flex; gap: 8px; align-items: end; justify-content: space-between; }
</style>
</head>
<body>
<main>
  <header>
    <button id="reset" type="button">Clear</button>
    <h1>Twilio Simulator</h1>
    <p id="info">Loading…</p>
  </header>
  <section id="thread" aria-live="polite"></section>
  <form id="compose">
    <label>Your phone number <input id="from" name="from" type="text" value="+15555550123" required></label>
    <label>Message <textarea name="body" placeholder="Type a message"></textarea></label>
    <div class="row">
      <label>Photos <input name="images" type="file" accept="image/*" multiple></label>
      <button type="submit">Send</button>
    </div>
    <p id="status" class="error" hidden></p>
  </form>
</main>
<script>
  const thread = document.getElementById("thread");
  const form = document.getElementById("compose");
  const status = document.getElementById("status");
  let lastRender = "";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function render(messages) {
    const key = JSON.stringify(messages);
    if (key === lastRender) return;
    lastRender = key;
    const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40;
    thread.replaceChildren();
    if (!messages.length) thread.append(el("p", "empty", "No messages yet. Send one below."));
    for (const m of messages) {
      const mine = m.direction === "inbound";
      const wrap = el("div", "msg" + (mine ? " mine" : ""));
      const bubble = el("div", "bubble");
      for (const media of m.media) {
        if (media.contentType.startsWith("image/")) {
          const img = el("img");
          img.src = media.url;
          img.alt = "Attached image";
          bubble.append(img);
        } else {
          bubble.append(el("div", "", "[" + media.contentType + "]"));
        }
      }
      if (m.body) bubble.append(document.createTextNode(m.body));
      wrap.append(bubble);
      const time = new Date(m.dateCreated).toLocaleTimeString();
      const who = mine ? "you → " + m.to : m.from + " → " + m.to;
      wrap.append(el("span", "meta", who + " · " + m.status + " · " + time));
      for (const error of m.errors) wrap.append(el("span", "error", error));
      thread.append(wrap);
    }
    if (atBottom) thread.scrollTop = thread.scrollHeight;
  }

  async function refresh() {
    try {
      const response = await fetch("/sim/messages");
      render(await response.json());
    } catch {}
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.hidden = true;
    try {
      const response = await fetch("/sim/inbound", { method: "POST", body: new FormData(form) });
      if (!response.ok) throw new Error((await response.json()).message);
      form.elements.body.value = "";
      form.elements.images.value = "";
    } catch (error) {
      status.textContent = String(error.message ?? error);
      status.hidden = false;
    } finally {
      button.disabled = false;
      refresh();
    }
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await fetch("/sim/reset", { method: "POST" });
    refresh();
  });

  fetch("/sim/info").then((r) => r.json()).then((info) => {
    document.getElementById("info").textContent =
      "Texting " + info.phoneNumber + " · webhook " + info.webhookUrl;
  });

  refresh();
  setInterval(refresh, 1000);
</script>
</body>
</html>
`;
