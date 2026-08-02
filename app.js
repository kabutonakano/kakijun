const DATA_DIR = "./kanjivg/kanji";
const GAP = 220;
const NS = "http://www.w3.org/2000/svg";

const el = {
  text: document.getElementById("text"),
  show: document.getElementById("show"),
  tabs: document.getElementById("tabs"),
  stage: document.getElementById("stage"),
  fallback: document.getElementById("fallback"),
  canvas: document.getElementById("canvas"),
  play: document.getElementById("play"),
  step: document.getElementById("step"),
  trace: document.getElementById("trace"),
  clear: document.getElementById("clear"),
  speed: document.getElementById("speed"),
  status: document.getElementById("status"),
};

let chars = [];
let current = "";
let strokes = [];
let starts = [];
let durs = [];
let total = 0;
let t = 0;
let playing = false;
let slow = false;
let tracing = false;
let raf = 0;

const perUnit = () => (slow ? 26 : 12);

function codeFor(ch) {
  return ch.codePointAt(0).toString(16).padStart(5, "0");
}

async function loadStrokes(ch) {
  const res = await fetch(`${DATA_DIR}/${codeFor(ch)}.svg`);
  if (!res.ok) throw new Error("missing");
  const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const ds = [...doc.querySelectorAll("path")]
    .map((p) => p.getAttribute("d"))
    .filter(Boolean);
  if (!ds.length) throw new Error("empty");
  return ds;
}

function build(ds) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 109 109");
  svg.setAttribute("class", "kanji");

  ds.forEach((d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", "ghost");
    svg.appendChild(p);
  });

  strokes = ds.map((d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", "ink");
    svg.appendChild(p);
    return { el: p, len: 0 };
  });

  el.stage.innerHTML = "";
  el.stage.appendChild(svg);

  strokes.forEach((s) => {
    s.len = s.el.getTotalLength();
    s.el.style.strokeDasharray = s.len;
    s.el.style.strokeDashoffset = s.len;
  });

  schedule();
  t = 0;
  render();
}

function schedule() {
  durs = strokes.map((s) => s.len * perUnit());
  starts = [];
  let acc = 0;
  durs.forEach((d, i) => {
    starts[i] = acc;
    acc += d + GAP;
  });
  total = starts.length ? starts.at(-1) + durs.at(-1) : 0;
}

function render() {
  let active = -1;
  strokes.forEach((s, i) => {
    let off;
    if (t >= starts[i] + durs[i]) off = 0;
    else if (t <= starts[i]) off = s.len;
    else {
      off = s.len * (1 - (t - starts[i]) / durs[i]);
      active = i;
    }
    s.el.style.strokeDashoffset = off;
    s.el.classList.toggle("active", i === active);
  });
  const done = starts.filter((s, i) => t >= s + durs[i]).length;
  el.status.textContent = `${Math.min(done + (active >= 0 ? 1 : 0), strokes.length)} / ${strokes.length}画`;
}

function loop(now) {
  const elapsed = now - loop.begin;
  if (elapsed >= total) {
    t = total;
    playing = false;
    el.play.textContent = "もう一度";
    render();
    return;
  }
  t = elapsed;
  render();
  raf = requestAnimationFrame(loop);
}

function play() {
  if (!strokes.length) return;
  if (playing) {
    cancelAnimationFrame(raf);
    playing = false;
    el.play.textContent = "再生";
    return;
  }
  if (t >= total) t = 0;
  loop.begin = performance.now() - t;
  playing = true;
  el.play.textContent = "一時停止";
  raf = requestAnimationFrame(loop);
}

function stepOnce() {
  if (!strokes.length) return;
  cancelAnimationFrame(raf);
  playing = false;
  el.play.textContent = "再生";
  let i = starts.findIndex((s, n) => t < s + durs[n] - 1);
  if (i === -1) i = 0;
  t = starts[i] + durs[i];
  render();
}

function reset() {
  cancelAnimationFrame(raf);
  playing = false;
  el.play.textContent = "再生";
  t = 0;
  render();
  clearCanvas();
}

function showFallback(msg) {
  el.stage.hidden = true;
  el.fallback.hidden = false;
  el.fallback.textContent = msg;
  strokes = [];
  el.status.textContent = "";
}

function renderTabs() {
  el.tabs.innerHTML = "";
  if (chars.length < 2) return;
  chars.forEach((c) => {
    const b = document.createElement("button");
    b.textContent = c;
    b.setAttribute("aria-pressed", String(c === current));
    b.addEventListener("click", () => select(c));
    el.tabs.appendChild(b);
  });
}

async function select(ch) {
  current = ch;
  renderTabs();
  cancelAnimationFrame(raf);
  playing = false;
  el.play.textContent = "再生";
  clearCanvas();
  el.stage.hidden = false;
  el.fallback.hidden = true;
  el.status.textContent = "読み込み中…";
  try {
    build(await loadStrokes(ch));
  } catch (e) {
    showFallback(
      `「${ch}」の筆順データを読めませんでした。\nkanjivg/kanji/${codeFor(ch)}.svg があるか確認してください。`
    );
  }
}

function submit() {
  const list = [...el.text.value.trim()].filter((c) => /\p{Script=Han}/u.test(c));
  if (!list.length) {
    el.tabs.innerHTML = "";
    showFallback("漢字を入力してください。かなには筆順データがありません。");
    return;
  }
  chars = list;
  select(chars[0]);
}

function clearCanvas() {
  const ctx = el.canvas.getContext("2d");
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
}

let drawing = false;
const posOf = (e) => {
  const r = el.canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * el.canvas.width,
    y: ((e.clientY - r.top) / r.height) * el.canvas.height,
  };
};
el.canvas.addEventListener("pointerdown", (e) => {
  el.canvas.setPointerCapture(e.pointerId);
  const ctx = el.canvas.getContext("2d");
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1C1B19";
  const p = posOf(e);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  drawing = true;
});
el.canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const ctx = el.canvas.getContext("2d");
  const p = posOf(e);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
});
["pointerup", "pointercancel"].forEach((ev) =>
  el.canvas.addEventListener(ev, () => (drawing = false))
);

el.show.addEventListener("click", submit);
el.text.addEventListener("keydown", (e) => e.key === "Enter" && submit());
el.play.addEventListener("click", play);
el.step.addEventListener("click", stepOnce);
el.clear.addEventListener("click", reset);
el.trace.addEventListener("click", () => {
  tracing = !tracing;
  el.canvas.hidden = !tracing;
  el.trace.textContent = tracing ? "なぞり終了" : "なぞる";
});
el.speed.addEventListener("click", () => {
  slow = !slow;
  el.speed.textContent = `速さ：${slow ? "ゆっくり" : "ふつう"}`;
  if (strokes.length) {
    schedule();
    t = 0;
    render();
  }
});

submit();
