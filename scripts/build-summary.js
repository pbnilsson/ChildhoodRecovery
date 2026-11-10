// Reads every day file and writes one small data/summary.json that the
// stats page (/stats/) can load in a single request.
//
// Adapted from the peternilsson.us and Schooled builders. What's different
// here: the unit that matters is the exercise, not the page. The home page
// shows a random one, so each row carries the exercise number that was on
// screen, and the summary counts reads per exercise, how people moved between
// them ("Show me another!" vs. picking a number), and book-update signups.
//
// The file holds five pre-computed windows — last 24 hours, week, month,
// year, and all time — because the page never sees individual rows.
const fs = require("fs");
const path = require("path");

const TOTAL = 62;
const dir = path.join("data", "days");
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
  : [];

const allRows = [];
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (Array.isArray(parsed)) allRows.push(...parsed);
}

// "/12/", "/12/index.html" and "/12" are one page; the github.io address adds
// a /ChildhoodRecovery prefix. Count each page once.
function normPath(p) {
  let s = String(p || "/").split(/[?#]/)[0]
    .replace(/^\/ChildhoodRecovery(?=\/|$)/i, "")
    .replace(/index\.html?$/, "");
  if (!s) s = "/";
  if (!/\.[a-z0-9]{2,5}$/i.test(s) && !s.endsWith("/")) s += "/";
  return s;
}

// The exercise on screen: the row's own field, or failing that the page.
function exOf(r) {
  if (Number.isInteger(r.exercise) && r.exercise >= 1 && r.exercise <= TOTAL) return r.exercise;
  const m = String(r.path || "").match(/^\/(\d{1,2})\/$/);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= TOTAL ? n : null;
}

for (const r of allRows) r.path = normPath(r.path);

const now = new Date();
const nowMs = now.getTime();
const HOUR = 3600000;
const DAY = 86400000;

function ms(r) {
  const t = Date.parse(r.ts);
  return Number.isFinite(t) ? t : null;
}

// ---- helpers ---------------------------------------------------------------

function tally(list, pick, limit) {
  const m = new Map();
  for (const r of list) {
    const k = pick(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  const out = [...m.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);
  return limit ? out.slice(0, limit) : out;
}

// Distinct tab-sessions, our closest honest stand-in for "people"
function visitors(list) {
  return new Set(list.map((r) => r.visit).filter(Boolean)).size;
}

// Median, not mean — one tab left open overnight would wreck an average
function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

function groupBy(list, pick) {
  const m = new Map();
  for (const r of list) {
    const k = pick(r);
    if (k === null || k === undefined || k === "") continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// ---- one window ------------------------------------------------------------

function summarize(rows, granularity) {
  const views = rows.filter((r) => r.kind === "view");
  const clicks = rows.filter((r) => r.kind === "click");
  const ends = rows.filter((r) => r.kind === "end");
  const signups = rows.filter((r) => r.kind === "signup");

  // ---- the pulse -----------------------------------------------------------
  const series = [];
  if (views.length && granularity === "hour") {
    const end = Math.floor(nowMs / HOUR) * HOUR;
    const byHour = groupBy(views, (r) => {
      const t = ms(r);
      return t === null ? null : String(Math.floor(t / HOUR) * HOUR);
    });
    for (let k = 23; k >= 0; k--) {
      const bucket = end - k * HOUR;
      const list = byHour.get(String(bucket)) || [];
      series.push({ t: new Date(bucket).toISOString(), views: list.length, visitors: visitors(list) });
    }
  } else if (views.length) {
    const days = views.map((r) => r.ts.slice(0, 10)).sort();
    const first = new Date(days[0] + "T00:00:00Z");
    const last = new Date(days[days.length - 1] + "T00:00:00Z");
    const byDay = groupBy(views, (r) => r.ts.slice(0, 10));
    for (let t = first; t <= last; t = new Date(t.getTime() + DAY)) {
      const d = t.toISOString().slice(0, 10);
      const list = byDay.get(d) || [];
      series.push({ d, views: list.length, visitors: visitors(list) });
    }
  }

  // ---- exercises: how often each was read, and for how long ----------------
  const endsByEx = groupBy(ends, exOf);
  const exercises = [...groupBy(views, exOf).entries()]
    .map(([key, list]) => {
      const e = endsByEx.get(key) || [];
      return {
        key,
        n: list.length,
        visitors: visitors(list),
        home: list.filter((r) => r.path === "/").length, // shown at random on arrival
        secs: median(e.map((r) => r.secs)),
      };
    })
    .sort((a, b) => b.n - a.n || a.key - b.key);

  // ---- visits: how many exercises each person read -------------------------
  const byVisit = groupBy(views, (r) => r.visit);
  const perVisit = [];
  const visitSource = new Map();
  const visitEntry = new Map();
  const entryList = [];
  for (const [visit, list] of byVisit) {
    list.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    perVisit.push(new Set(list.map(exOf).filter(Boolean)).size);
    const first = list[0];
    visitSource.set(visit, first.campaign || first.source || "direct");
    visitEntry.set(visit, first.path);
    entryList.push({ p: first.path });
  }

  // Bucket the reading length so the page can show a short histogram.
  const BUCKETS = ["1", "2", "3", "4–5", "6–10", "11+"];
  function bucket(n) {
    if (n <= 1) return "1";
    if (n <= 3) return String(n);
    if (n <= 5) return "4–5";
    if (n <= 10) return "6–10";
    return "11+";
  }
  const depthCounts = new Map(BUCKETS.map((b) => [b, 0]));
  for (const n of perVisit) depthCounts.set(bucket(n), depthCounts.get(bucket(n)) + 1);
  const readDepth = BUCKETS.map((key) => ({ key, n: depthCounts.get(key) }));

  // Landing: the random home page, or a specific exercise someone shared.
  const entries = tally(entryList, (r) => r.p, 12);

  // ---- moving on: chance or choice -----------------------------------------
  const moves = [
    { key: "another", n: clicks.filter((r) => /#another$/.test(r.target || "")).length },
    { key: "list", n: clicks.filter((r) => /#list$/.test(r.target || "")).length },
  ].filter((m) => m.n).sort((a, b) => b.n - a.n);

  // ---- signups ---------------------------------------------------------------
  // A signup's real source is the source of the visit it belongs to.
  const signupDetail = signups.map((r) => ({
    source: visitSource.get(r.visit) || "unknown",
    entry: visitEntry.get(r.visit) || r.path,
    ex: exOf(r),
  }));

  // ---- sharing (the button under the poem) and the Instagram link ----------
  // share.js reports each press as a click ending in #share-<how>.
  const SHARE_RE = /#share-([a-z-]+)$/;
  const shareRows = clicks.filter((r) => SHARE_RE.test(r.target || ""));
  const shareHow = (r) => (r.target.match(SHARE_RE) || [])[1];
  const shared = shareRows.filter((r) => /^(menu-image|menu-link|copy)$/.test(shareHow(r)));
  const shareWays = tally(shareRows, shareHow);
  const sharedExercises = tally(shared, exOf, 15);
  const IG = /instagram\.com\/childhoodrecoveryexercises/i;
  const igClicks = clicks.filter((r) => IG.test(r.target || ""));

  // ---- links off the site ---------------------------------------------------
  const OURS = /^https?:\/\/(www\.)?(exercisesfortherecoveryofchildhood\.com|pbnilsson\.github\.io)/i;
  const followed = clicks.filter((r) => r.target && !OURS.test(r.target) && !IG.test(r.target));

  // ---- assemble ------------------------------------------------------------
  const dayCount = granularity === "hour"
    ? new Set(views.map((r) => r.ts.slice(0, 10))).size
    : series.length;

  return {
    granularity,
    totals: {
      views: views.length,
      visitors: visitors(views),
      signups: signups.length,
      exercisesSeen: exercises.length,
      days: dayCount,
      medianExercisesPerVisit: median(perVisit),
      medianSecs: median(ends.map((r) => r.secs)),
      another: (moves.find((m) => m.key === "another") || {}).n || 0,
      picked: (moves.find((m) => m.key === "list") || {}).n || 0,
      shares: shared.length,
      sharePresses: shareRows.length,
      instagram: igClicks.length,
    },
    series,
    exercises,
    readDepth,
    entries,
    moves,
    sources: tally(views, (r) => r.source),
    referrers: tally(views, (r) => r.ref, 20),
    campaigns: tally(views, (r) => r.campaign, 20),
    countries: tally(views, (r) => r.country, 20),
    cities: tally(views, (r) => (r.city ? r.city + (r.region ? ", " + r.region : "") : null), 20),
    devices: tally(views, (r) => r.device),
    browsers: tally(views, (r) => r.browser, 10),
    signupsBySource: tally(signupDetail, (r) => r.source, 10),
    signupsByEntry: tally(signupDetail, (r) => r.entry, 10),
    links: tally(followed, (r) => r.target, 25),
    shareWays,
    sharedExercises,
    instagramFrom: tally(igClicks, exOf, 10),
  };
}

// ---- the five windows ------------------------------------------------------

const RANGES = [
  { key: "24h", label: "Last 24 hours", short: "24h", days: 1, granularity: "hour" },
  { key: "week", label: "Last week", short: "Week", days: 7, granularity: "day" },
  { key: "month", label: "Last month", short: "Month", days: 30, granularity: "day" },
  { key: "year", label: "Last year", short: "Year", days: 365, granularity: "day" },
  { key: "all", label: "All time", short: "All", days: null, granularity: "day" },
];

const stamps = allRows.map(ms).filter((t) => t !== null).sort((a, b) => a - b);
const firstTs = stamps.length ? stamps[0] : null;
const spanDays = firstTs === null ? 0 : (nowMs - firstTs) / DAY;

const ranges = {};
for (const r of RANGES) {
  const from = r.days === null ? null : nowMs - r.days * DAY;
  const rows = from === null
    ? allRows
    : allRows.filter((row) => {
        const t = ms(row);
        return t !== null && t >= from;
      });

  // A fixed window longer than the data we hold would just be "all time"
  // wearing a different name. Mark it so the page can gray the pill out.
  const available = r.days === null || r.key === "24h" ? true : spanDays > r.days;

  ranges[r.key] = Object.assign(
    {
      key: r.key,
      label: r.label,
      short: r.short,
      from: from === null
        ? firstTs === null ? null : new Date(firstTs).toISOString()
        : new Date(from).toISOString(),
      to: now.toISOString(),
      available,
    },
    summarize(rows, r.granularity)
  );
}

const summary = {
  generated: now.toISOString(),
  defaultRange: "all",
  order: RANGES.map((r) => r.key),
  total: TOTAL,
  span: {
    first: firstTs === null ? null : new Date(firstTs).toISOString(),
    days: Math.max(1, Math.ceil(spanDays)),
  },
  ranges,
};

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(
  RANGES.map((r) => {
    const t = ranges[r.key].totals;
    return r.key + ": " + t.views + "v/" + t.visitors + "p/" + t.exercisesSeen + "ex" +
      (ranges[r.key].available ? "" : " (grayed)");
  }).join("  ")
);
