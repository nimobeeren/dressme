import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "mime-types";
import { AVATAR_PROMPT, generateAvatar } from "../src/server/avatar-generation";
import { getSettings } from "../src/server/settings";

const ROOT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUMANS_DIR = path.join(ROOT_PATH, "images", "humans");
const AVATARS_DIR = path.join(ROOT_PATH, "images", "avatars");

const DEFAULT_PORT = 4877;

interface Subject {
  id: string;
  selfieFile: string;
  avatarFile: string;
}

function parseArgs(argv: string[]): { port: number; only: Set<string> | null; open: boolean } {
  let port = DEFAULT_PORT;
  let only: Set<string> | null = null;
  let open = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--port") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --port value: ${argv[i]}`);
      }
      port = value;
    } else if (arg === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only requires a comma-separated list of subject ids");
      only = new Set(
        value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      );
    } else if (arg === "--no-open") {
      open = false;
    } else {
      throw new Error(
        `Unknown argument: ${arg}\nUsage: pnpm avatar-playground [-- --port ${DEFAULT_PORT} [--only 3,4] [--no-open]]`,
      );
    }
  }
  return { port, only, open };
}

/** Pairs `images/humans/selfie_<id>.jpg` with `images/avatars/avatar_<id>.jpg`. */
function discoverSubjects(only: Set<string> | null): Subject[] {
  const subjects: Subject[] = [];
  for (const file of fs.readdirSync(HUMANS_DIR).sort()) {
    const match = file.match(/^selfie_(.+)\.jpe?g$/i);
    if (!match) continue;
    const id = match[1];
    if (only && !only.has(id)) continue;
    const avatarFile = `avatar_${id}.jpg`;
    if (!fs.existsSync(path.join(AVATARS_DIR, avatarFile))) {
      console.warn(`Skipping ${file}: no matching images/avatars/${avatarFile}`);
      continue;
    }
    subjects.push({ id, selfieFile: file, avatarFile });
  }
  return subjects;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPage(subjects: Subject[]): string {
  const checkboxes = subjects
    .map(
      (s) =>
        `<label><input type="checkbox" name="subject" value="${escapeHtml(s.id)}" checked> selfie_${escapeHtml(s.id)}</label>`,
    )
    .join("\n        ");
  const rows = subjects
    .map(
      (s) => `
      <article class="row" data-subject="${escapeHtml(s.id)}">
        <h2>selfie_${escapeHtml(s.id)}</h2>
        <div class="cards">
          <figure>
            <img src="/img/humans/${escapeHtml(s.selfieFile)}" alt="selfie_${escapeHtml(s.id)}">
            <figcaption>selfie</figcaption>
          </figure>
          <figure class="previous" hidden>
            <img alt="previous avatar">
            <figcaption>previous</figcaption>
          </figure>
          <figure>
            <img class="result" src="/img/avatars/${escapeHtml(s.avatarFile)}" alt="avatar_${escapeHtml(s.id)}">
            <figcaption>avatar (images/avatars/${escapeHtml(s.avatarFile)})</figcaption>
          </figure>
        </div>
        <p class="status"></p>
      </article>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avatar prompt playground</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 24px 20px 64px;
    max-width: 1100px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    line-height: 1.5;
    color: #111;
    background: #fafafa;
  }
  h1 { font-size: 1.35rem; margin: 0 0 4px; }
  h2 { font-size: 0.85rem; margin: 0 0 8px; opacity: 0.7; font-weight: 600; }
  .hint { margin: 0 0 20px; font-size: 0.85rem; opacity: 0.75; }
  code {
    background: #ececec;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.85em;
  }
  textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font: inherit;
    font-size: 0.9rem;
    resize: vertical;
    background: #fff;
    color: inherit;
  }
  .controls { margin-bottom: 28px; }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
    flex-wrap: wrap;
  }
  button {
    padding: 8px 16px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #111;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  button.secondary { background: transparent; color: inherit; border-color: #999; }
  button:disabled { opacity: 0.5; cursor: default; }
  .subjects {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 0.9rem;
    margin-bottom: 6px;
  }
  .subjects label { display: inline-flex; gap: 6px; align-items: center; }
  .copy-status { font-size: 0.85rem; opacity: 0.75; }
  .row {
    padding: 16px 0;
    border-top: 1px solid #ddd;
  }
  .cards {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  figure { margin: 0; }
  figure img {
    display: block;
    width: 220px;
    height: 293px;
    object-fit: contain;
    background: #e9e9e9;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  figcaption {
    font-size: 0.75rem;
    opacity: 0.65;
    margin-top: 4px;
    max-width: 220px;
    overflow-wrap: anywhere;
  }
  .status { margin: 10px 0 0; font-size: 0.85rem; min-height: 1.2em; }
  .status.error { color: #c0392b; }

  /* Dark mode: keep these last so they win over the base rules above. */
  @media (prefers-color-scheme: dark) {
    body { color: #eee; background: #161616; }
    textarea { background: #222; border-color: #3a3a3a; }
    code { background: #2a2a2a; }
    .row { border-top-color: #333; }
    figure img { background: #2a2a2a; border-color: #3a3a3a; }
    button { background: #eee; color: #161616; border-color: #eee; }
    button.secondary { background: transparent; color: #eee; border-color: #888; }
    .status.error { color: #ff8a75; }
  }
</style>
</head>
<body>
  <h1>Avatar prompt playground</h1>
  <p class="hint">
    Generated avatars are saved straight into <code>images/avatars/</code>, replacing the
    matching file. Undo with <code>git checkout -- images/avatars</code>.
    About $0.07 per generated avatar.
  </p>

  <section class="controls">
    <textarea id="prompt" rows="16" spellcheck="false" aria-label="Prompt">${escapeHtml(AVATAR_PROMPT)}</textarea>
    <div class="actions">
      <button id="generate">Generate</button>
      <button id="copy" class="secondary">Copy prompt</button>
      <span id="copy-status" class="copy-status"></span>
    </div>
    <div class="subjects">
        ${checkboxes}
    </div>
  </section>

  <section id="gallery">${rows}
  </section>

  <script>
    const promptEl = document.getElementById("prompt");
    const generateBtn = document.getElementById("generate");
    const copyBtn = document.getElementById("copy");
    const copyStatus = document.getElementById("copy-status");

    function row(id) {
      return document.querySelector('.row[data-subject="' + id + '"]');
    }

    function setStatus(id, message, isError) {
      const el = row(id).querySelector(".status");
      el.textContent = message;
      el.classList.toggle("error", Boolean(isError));
    }

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(promptEl.value);
        copyStatus.textContent = "Copied. Paste into AVATAR_PROMPT in src/server/avatar-generation.ts";
      } catch {
        promptEl.select();
        copyStatus.textContent = "Press Cmd/Ctrl+C to copy the selected prompt";
      }
    });

    generateBtn.addEventListener("click", async () => {
      const subjects = Array.from(document.querySelectorAll('input[name="subject"]:checked')).map(
        function (el) { return el.value; },
      );
      if (!subjects.length) {
        copyStatus.textContent = "Select at least one subject";
        return;
      }
      const prompt = promptEl.value.trim();
      if (!prompt) {
        copyStatus.textContent = "The prompt is empty";
        return;
      }

      generateBtn.disabled = true;
      copyStatus.textContent = "";
      subjects.forEach(function (id) { setStatus(id, "Generating…"); });

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt, subjects: subjects }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        data.results.forEach(function (result) {
          if (result.error) {
            setStatus(result.id, result.error, true);
            return;
          }
          const el = row(result.id);
          const previous = el.querySelector(".previous");
          previous.querySelector("img").src = result.previousSrc;
          previous.hidden = false;
          el.querySelector("img.result").src = result.resultSrc;
          setStatus(result.id, "Saved to images/avatars/avatar_" + result.id + ".jpg");
        });
      } catch (error) {
        subjects.forEach(function (id) {
          setStatus(id, error && error.message ? error.message : String(error), true);
        });
      } finally {
        generateBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(payload);
}

function sendFile(res: ServerResponse, dir: string, file: string): void {
  const resolved = path.resolve(dir, file);
  if (!resolved.startsWith(dir + path.sep)) {
    sendJson(res, 400, { error: "Invalid path" });
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const contentType = lookup(resolved) || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  fs.createReadStream(resolved).pipe(res);
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function openBrowser(url: string): void {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function main() {
  const { port, only, open } = parseArgs(process.argv.slice(2));

  try {
    getSettings();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Fill in the missing values in .env (see .env.example) and try again.");
    process.exit(1);
  }

  const subjects = discoverSubjects(only);
  if (!subjects.length) {
    console.error("No selfie/avatar pairs found in images/humans and images/avatars");
    process.exit(1);
  }

  // Avatar bytes that were in place before the most recent generation, shown as
  // the "previous" image in the gallery.
  const previousAvatars = new Map<string, Buffer>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(renderPage(subjects));
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/img/humans/")) {
        sendFile(res, HUMANS_DIR, decodeURIComponent(url.pathname.slice("/img/humans/".length)));
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/img/avatars/")) {
        sendFile(res, AVATARS_DIR, decodeURIComponent(url.pathname.slice("/img/avatars/".length)));
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/prev/")) {
        const match = url.pathname.match(/^\/prev\/(.+)\.jpe?g$/);
        const data = match ? previousAvatars.get(match[1]) : undefined;
        if (!data) {
          sendJson(res, 404, { error: "No previous avatar for this subject yet" });
          return;
        }
        res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" });
        res.end(data);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/generate") {
        const body = await readJsonBody(req);
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) {
          sendJson(res, 400, { error: "The prompt is empty" });
          return;
        }
        const requested = Array.isArray(body.subjects) ? body.subjects.map(String) : [];
        const selected = subjects.filter((s) => requested.includes(s.id));
        if (!selected.length) {
          sendJson(res, 400, { error: "No matching subjects" });
          return;
        }

        const results: Array<
          { id: string; previousSrc: string; resultSrc: string } | { id: string; error: string }
        > = [];
        for (const subject of selected) {
          const startedAt = Date.now();
          console.info(`Generating avatar for selfie_${subject.id}…`);
          try {
            const selfieData = fs.readFileSync(path.join(HUMANS_DIR, subject.selfieFile));
            const avatarData = await generateAvatar(selfieData, { prompt });

            const avatarPath = path.join(AVATARS_DIR, subject.avatarFile);
            previousAvatars.set(
              subject.id,
              fs.existsSync(avatarPath) ? fs.readFileSync(avatarPath) : Buffer.alloc(0),
            );
            fs.writeFileSync(avatarPath, avatarData);

            const cacheBust = Date.now();
            console.info(
              `Saved images/avatars/${subject.avatarFile} (${Date.now() - startedAt}ms)`,
            );
            results.push({
              id: subject.id,
              previousSrc: `/prev/${subject.id}.jpg?t=${cacheBust}`,
              resultSrc: `/img/avatars/${subject.avatarFile}?t=${cacheBust}`,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Generating avatar for selfie_${subject.id} failed: ${message}`);
            results.push({ id: subject.id, error: message });
          }
        }
        sendJson(res, 200, { results });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.info(`Avatar prompt playground running at ${url}`);
    console.info(`Subjects: ${subjects.map((s) => s.id).join(", ")}`);
    console.info("Press Ctrl+C to stop.");
    if (open) openBrowser(url);
  });
}

main();
