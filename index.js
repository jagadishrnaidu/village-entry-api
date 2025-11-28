import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 8080;

const SHEET_ID = "1l1y6vdXj7rMWJwCx3dc3ku0HPrHvpJAx5lh21nJP5HA";
const SHEET_NAME = "site visits";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});
const sheets = google.sheets({ version: "v4", auth });

// === Helper: read full sheet safely ===
async function readSheet() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:X`
  });

  const [headers, ...rows] = res.data.values || [];
  const cleanHeaders = headers.map(h => (h || "").trim());
  const paddedRows = rows.map(r => {
    const row = [...r];
    while (row.length < cleanHeaders.length) row.push(""); // pad blanks
    return row;
  });
  return { headers: cleanHeaders, rows: paddedRows };
}

// === Helpers ===
function findColumn(headers, name) {
  return headers.findIndex(
    h => h.toLowerCase().trim() === name.toLowerCase().trim()
  );
}

function parseTimestamp(ts) {
  if (!ts) return null;
  const parts = ts.split(/[\/ :]/);
  if (parts.length < 3) return null;
  const [a, b, c] = parts;
  // detect month-first consistently
  if (parseInt(a) <= 12 && parseInt(b) <= 12) return null;
  const d = parseInt(a) > 12 ? new Date(`${c}-${b}-${a}`) : new Date(`${a}-${b}-${c}`);
  return isNaN(d.getTime()) ? null : d;
}

function withinRange(date, from, to) {
  return date && date >= from && date <= to;
}

// === Endpoints ===

// Health
app.get("/health", (req, res) => res.json({ status: "✅ Aiikya Analytics API Live" }));

// Visitor Count by Date
app.get("/period", async (req, res) => {
  try {
    const days = parseInt(req.query.days || "60");
    const { headers, rows } = await readSheet();
    const tsIndex = findColumn(headers, "Timestamp");
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    const matches = rows.filter(r => {
      const d = parseTimestamp(r[tsIndex]);
      return withinRange(d, cutoff, now);
    });
    res.json({ range_days: days, visitors: matches.length, total_rows: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Handled by (Salesperson breakdown)
app.get("/handlers", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const handledByCol = findColumn(headers, "Site Visit handled by");
    const salesCol = findColumn(headers, "Sales person");

    const handlers = {};
    rows.forEach(r => {
      const names = `${r[handledByCol]} ${r[salesCol]}`.split(/,|&/);
      names.forEach(n => {
        const clean = n.trim();
        if (clean) handlers[clean] = (handlers[clean] || 0) + 1;
      });
    });

    const sorted = Object.entries(handlers)
      .map(([name, count]) => ({ name, visits: count }))
      .sort((a, b) => b.visits - a.visits);

    res.json({ total_unique: sorted.length, leaderboard: sorted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exact monthly filter
app.get("/monthly", async (req, res) => {
  try {
    const { month } = req.query; // e.g. "2025-10"
    const { headers, rows } = await readSheet();
    const tsIndex = findColumn(headers, "Timestamp");

    const matches = rows.filter(r => {
      const d = parseTimestamp(r[tsIndex]);
      if (!d || isNaN(d)) return false;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return iso === month;
    });

    res.json({ month, visitors: matches.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Source Summary
app.get("/sources", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const srcCol = findColumn(headers, "How did you come to Know about us");
    const sources = {};
    rows.forEach(r => {
      const val = (r[srcCol] || "").trim();
      if (val) sources[val] = (sources[val] || 0) + 1;
    });
    res.json({ sources });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Aiikya Analytics v7.5 running on port ${PORT}`));
