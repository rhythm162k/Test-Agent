const $ = (id) => document.getElementById(id);
let ctrl = null;
const CATS = [
  "happy-path",
  "input-validation",
  "output-validation",
  "error-handling",
  "edge-case",
  "user-interaction",
  "auth",
  "other",
];

async function loadModels() {
  try {
    const r = await fetch("/api/models");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    $("model").innerHTML = j.map((m) => `<option>${m}</option>`).join("");
    const saved = localStorage.getItem("model");
    if (saved && j.includes(saved)) $("model").value = saved;
    if (!j.length)
      setStatus("No models installed. Run: ollama pull qwen2.5-coder:7b", true);
  } catch (e) {
    setStatus(e.message || "Ollama is not running.", true);
  }
}
function setStatus(t, err) {
  $("status").textContent = t;
  $("status").className = "status" + (err ? " err" : "");
}
function busy(on) {
  $("planBtn").disabled = on;
  $("stopBtn").disabled = !on;
  $("writeBtn").disabled = on || !$("plan").value.trim();
}
const put = (el, t) =>
  el.value !== undefined ? (el.value = t) : (el.textContent = t);
const add = (el, t) =>
  el.value !== undefined ? (el.value += t) : (el.textContent += t);

async function stream(payload, onChunk) {
  const res = await fetch("/api/generate", {
    method: "POST",
    signal: ctrl.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: $("model").value,
      kind: document.querySelector("input[name=kind]:checked").value,
      ...payload,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body.getReader(),
    dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(dec.decode(value, { stream: true }));
  }
}

async function run(stage, target) {
  const code = $("code").value.trim();
  if (!code) return setStatus("Paste some code first.", true);
  localStorage.setItem("model", $("model").value);
  put(target, "");
  if (stage === "tests") resetSummary();
  ctrl = new AbortController();
  busy(true);
  setStatus(stage === "plan" ? "Planning…" : "Writing tests…");
  let ok = false;
  try {
    await stream(
      { stage, code, notes: $("notes").value, plan: $("plan").value },
      (t) => {
        add(target, t);
        target.scrollTop = target.scrollHeight;
      },
    );
    ok = true;
    setStatus("Done.");
  } catch (e) {
    setStatus(
      e.name === "AbortError" ? "Stopped." : e.message,
      e.name !== "AbortError",
    );
  }
  $("copyBtn").disabled = !$("out").textContent;
  if (ok && stage === "tests") await summarize();
  busy(false);
}

function testCode() {
  const m = $("out").textContent.match(/```[\w]*\n([\s\S]*?)(```|$)/);
  return m ? m[1] : $("out").textContent;
}
function extractTitles(src) {
  const re =
    /\b(?:it|test)(?:\.(?:only|concurrent))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  const titles = [];
  let m;
  while ((m = re.exec(src))) titles.push(m[2]);
  return titles;
}

function resetSummary() {
  $("sumCopy").disabled = true;
  const s = $("summary");
  s.className = "summary empty";
  s.textContent = "Appears after the test file is written.";
}

async function summarize() {
  const src = testCode(),
    titles = extractTitles(src);
  const s = $("summary");
  if (!titles.length) {
    s.className = "summary empty";
    s.textContent = "No it()/test() blocks found in the output.";
    return;
  }
  s.className = "summary empty";
  s.textContent = "Classifying tests…";
  setStatus("Summarizing…");
  let text = "";
  try {
    await stream({ stage: "classify", titles }, (t) => (text += t));
    setStatus("Done.");
  } catch (e) {
    if (e.name === "AbortError") {
      setStatus("Stopped.");
    } else setStatus(e.message, true);
  }
  const counts = Object.fromEntries(CATS.map((c) => [c, 0]));
  const seen = new Set();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[:.)-]\s*([a-z-]+)/i);
    if (!m || seen.has(m[1]) || +m[1] > titles.length) continue;
    seen.add(m[1]);
    const c = m[2].toLowerCase();
    counts[CATS.includes(c) ? c : "other"]++;
  }
  counts.other += titles.length - seen.size; // anything the model skipped
  renderSummary(
    titles.length,
    (src.match(/\bdescribe\s*\(/g) || []).length,
    counts,
  );
}

let summaryLines = [];
const PHRASES = {
  "happy-path": "Tested successful (happy-path) behavior",
  "input-validation": "Tested input validation",
  "output-validation": "Tested output validation",
  "error-handling": "Tested error handling",
  "edge-case": "Tested edge cases",
  "user-interaction": "Tested user interactions",
  auth: "Tested authentication and authorization",
  other: "Tested additional scenarios",
};
const plural = (n) => `${n} test case${n === 1 ? "" : "s"}`;

function renderSummary(total, groups, counts) {
  const kind = document.querySelector("input[name=kind]:checked").value;
  const stack =
    kind === "react"
      ? "Vitest and React Testing Library"
      : "Vitest and Supertest";
  summaryLines = [
    `Wrote ${plural(total)} with ${stack}, organized into ${groups} describe block${groups === 1 ? "" : "s"}`,
  ];
  for (const c of CATS)
    if (counts[c]) summaryLines.push(`${PHRASES[c]} with ${plural(counts[c])}`);
  const s = $("summary");
  s.className = "summary";
  s.textContent = "";
  const ul = document.createElement("ul");
  ul.style.cssText = "margin:0;padding-left:20px";
  for (const l of summaryLines) {
    const li = document.createElement("li");
    li.textContent = l + ".";
    ul.append(li);
  }
  s.append(ul);
  $("sumCopy").disabled = false;
}

$("planBtn").onclick = () => run("plan", $("plan"));
$("writeBtn").onclick = () => run("tests", $("out"));
$("stopBtn").onclick = () => ctrl && ctrl.abort();
$("plan").oninput = () => {
  $("writeBtn").disabled = !$("plan").value.trim();
};
$("copyBtn").onclick = async () => {
  await navigator.clipboard.writeText(testCode());
  setStatus("Copied the test code.");
};
$("sumCopy").onclick = async () => {
  await navigator.clipboard.writeText(
    summaryLines.map((l) => "- " + l + ".").join("\n"),
  );
  setStatus("Copied the summary.");
};
loadModels();
