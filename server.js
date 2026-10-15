// Zero-dependency server. Needs Node 18+ and Ollama running locally.
const http = require("http");
const fs = require("fs");
const path = require("path");

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const PORT = process.env.PORT || 3000;

const RULES = {
  react: `Target stack: React + Vitest + React Testing Library (@testing-library/react, @testing-library/user-event, @testing-library/jest-dom).
- Query by role, label or visible text. Never by class names or internals.
- Use userEvent for interactions; findBy*/waitFor for async UI.
- Mock dependencies with vi.fn()/vi.mock(); mock network with vi.spyOn(globalThis, 'fetch') or by mocking the API module.
- Import { describe, it, expect, vi, beforeEach } from 'vitest'.`,
  express: `Target stack: Node + Express + PostgreSQL, tested with Vitest + Supertest.
- Import the Express app (not a listening server) and use request(app).
- Mock the database layer with vi.mock (pg Pool / query helper). Tests must never touch a real database.
- Cover status codes, response bodies, validation errors, auth failures, and DB failures (500).
- Reset mocks in beforeEach. Import { describe, it, expect, vi, beforeEach } from 'vitest'.`,
};

function buildMessages({ stage, kind, code, notes, plan, titles }) {
  if (stage === "classify") {
    return [
      {
        role: "system",
        content:
          "You classify test titles. You output only the requested lines.",
      },
      {
        role: "user",
        content:
          "Classify each test title into exactly one category: happy-path, input-validation, output-validation, error-handling, edge-case, user-interaction, auth, other.\n" +
          "input-validation = checks how bad/missing/malformed input is handled. output-validation = checks the shape or content of what is returned or rendered.\n" +
          'Reply with one line per test in the form "N: category" and nothing else.\n\n' +
          (titles || []).map((t, i) => `${i + 1}. ${t}`).join("\n"),
      },
    ];
  }
  const system = `You are a senior test engineer. You only write tests, never change the code under test.\n${RULES[kind] || RULES.react}`;
  const extra = notes ? `\nExtra notes from the developer: ${notes}` : "";
  if (stage === "plan") {
    return [
      { role: "system", content: system },
      {
        role: "user",
        content:
          `Plan the tests for this code. Do NOT write any test code yet.\n` +
          `Output a short numbered list grouped under: Happy paths, Edge cases, Error cases, What to mock. One line per item.${extra}\n\n` +
          "```\n" +
          code +
          "\n```",
      },
    ];
  }
  return [
    { role: "system", content: system },
    {
      role: "user",
      content:
        `Code under test:\n\`\`\`\n${code}\n\`\`\`\n\nApproved test plan:\n${plan}${extra}\n\n` +
        `Write the complete test file implementing every item in the plan. ` +
        `Output ONE code block only. First line: a comment with the suggested file name. State assumed import paths in comments.`,
    },
  ];
}

async function readBody(req) {
  let s = "";
  for await (const c of req) s += c;
  return JSON.parse(s || "{}");
}

const server = http.createServer(async (req, res) => {
  try {
    const TYPES = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };

    if (req.method === "GET" && !req.url.startsWith("/api/")) {
      const name =
        req.url === "/"
          ? "index.html"
          : decodeURIComponent(req.url.split("?")[0]);
      const file = path.join(__dirname, "public", name);
      if (
        file.startsWith(path.join(__dirname, "public")) &&
        fs.existsSync(file) &&
        fs.statSync(file).isFile()
      ) {
        res.writeHead(200, {
          "Content-Type":
            TYPES[path.extname(file)] || "application/octet-stream",
        });
        return res.end(fs.readFileSync(file));
      }
    }

    if (req.method === "GET" && req.url === "/api/models") {
      try {
        const r = await fetch(`${OLLAMA}/api/tags`);
        const j = await r.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify((j.models || []).map((m) => m.name)));
      } catch {
        res.writeHead(502, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Ollama is not running. Start it with: ollama serve",
          }),
        );
      }
    }

    if (req.method === "POST" && req.url === "/api/generate") {
      const body = await readBody(req);
      const ac = new AbortController();
      res.on("close", () => ac.abort());
      let upstream;
      try {
        upstream = await fetch(`${OLLAMA}/api/chat`, {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: body.model,
            stream: true,
            messages: buildMessages(body),
            options: { temperature: 0.2, num_ctx: 8192 },
          }),
        });
      } catch {
        res.writeHead(502, { "Content-Type": "text/plain" });
        return res.end("Could not reach Ollama. Start it with: ollama serve");
      }
      if (!upstream.ok) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        return res.end(`Ollama error: ${await upstream.text()}`);
      }
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      const dec = new TextDecoder();
      let buf = "";
      try {
        for await (const chunk of upstream.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            const j = JSON.parse(line);
            if (j.message?.content) res.write(j.message.content);
          }
        }
      } catch {}
      return res.end();
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`Test agent running at http://localhost:${PORT}`),
);
