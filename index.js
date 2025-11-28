import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// === CONFIG ===
const SHEET_ID = "1l1y6vdXj7rMWJwCx3dc3ku0HPrHvpJAx5lh21nJP5HA"; // Replace with your sheet ID
const SHEET_NAME = "site visits"; // your tab name in the sheet

// === Google Auth ===
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});
const sheets = google.sheets({ version: "v4", auth });

// === Helpers ===
async function readSheet() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:T`
  });
  const [headers, ...rows] = res.data.values || [];
  return { headers, rows };
}

function toDate(value) {
  if (!value) return null;
  const parts = value.split(/[\/ :]/);
  if (parts.length < 3) return null;
  const [d, m, y] = parts;
  return new Date(`${y}-${m}-${d}`);
}

// === Simple Sentiment Analyzer ===
function getSentiment(text) {
  const t = text.toLowerCase();
  if (!t) return "Neutral";
  if (t.includes("interested") || t.includes("positive") || t.includes("good") || t.includes("booked")) return "Positive";
  if (t.includes("follow") || t.includes("call") || t.includes("pending") || t.includes("waiting")) return "Follow-up Required";
  return "Neutral";
}

// === Endpoints ===

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "✅ Village Entry Form API running" });
});

// Today’s visitors
app.get("/visitors", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const today = new Date().toLocaleDateString("en-GB");
    const count = rows.filter(r => r[0]?.includes(today)).length;
    res.json({ total_visitors_today: count, total_rows: rows.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to load visitors", details: e.message });
  }
});

// Period (custom days)
app.get("/period", async (req, res) => {
  try {
    const days = parseInt(req.query.days || "7");
    const { rows } = await readSheet();
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);
    const filtered = rows.filter(r => {
      const d = toDate(r[0]);
      return d && d >= cutoff && d <= now;
    });
    res.json({ days, count: filtered.length, total_rows: rows.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to get period data" });
  }
});

// Salesperson analytics
app.get("/salesperson", async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const { rows } = await readSheet();
    const spCol = 17;
    const siteVisitCol = 16;
    const count = rows.filter(r =>
      (r[spCol] && r[spCol].toLowerCase().includes(name.toLowerCase())) ||
      (r[siteVisitCol] && r[siteVisitCol].toLowerCase().includes(name.toLowerCase()))
    ).length;
    res.json({ salesperson: name, customers: count });
  } catch (e) {
    res.status(500).json({ error: "Failed to get salesperson data" });
  }
});

// Compare salespeople
app.get("/compare", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const spCol = 17;
    const stats = {};
    rows.forEach(r => {
      const sp = r[spCol] || "Unassigned";
      stats[sp] = (stats[sp] || 0) + 1;
    });
    res.json({
      comparison: Object.entries(stats).map(([salesperson, customers]) => ({ salesperson, customers }))
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to compare salespeople" });
  }
});

// Sources
app.get("/sources", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const srcCol = 8;
    const result = {};
    rows.forEach(r => {
      const src = r[srcCol];
      if (src) result[src] = (result[src] || 0) + 1;
    });
    res.json({ sources: Object.entries(result).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to get sources" });
  }
});

// Requirements
app.get("/requirements", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const reqCol = 6;
    const data = {};
    rows.forEach(r => {
      const v = r[reqCol];
      if (v) data[v] = (data[v] || 0) + 1;
    });
    res.json({ requirements: Object.entries(data).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to analyze requirements" });
  }
});

// Configurations
app.get("/configurations", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const cfgCol = 10;
    const data = {};
    rows.forEach(r => {
      const v = r[cfgCol];
      if (v) data[v] = (data[v] || 0) + 1;
    });
    res.json({ configurations: Object.entries(data).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to analyze configurations" });
  }
});

// Industries
app.get("/industries", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const indCol = 12;
    const data = {};
    rows.forEach(r => {
      const v = r[indCol];
      if (v) data[v] = (data[v] || 0) + 1;
    });
    res.json({ industries: Object.entries(data).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to get industries" });
  }
});

// Income
app.get("/income", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const incCol = 13;
    const data = {};
    rows.forEach(r => {
      const v = r[incCol];
      if (v) data[v] = (data[v] || 0) + 1;
    });
    res.json({ income_distribution: Object.entries(data).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: "Failed to get income data" });
  }
});

// Remarks with sentiment
app.get("/remarks", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const visitCol = 15, followUpCol = 19;
    const remarks = rows
      .map(r => ({
        name: r[2],
        siteVisitRemarks: r[visitCol] || "",
        followUp: r[followUpCol] || "",
        sentiment: getSentiment(`${r[visitCol]} ${r[followUpCol]}`)
      }))
      .filter(r => r.siteVisitRemarks || r.followUp);
    const summary = {
      Positive: remarks.filter(r => r.sentiment === "Positive").length,
      "Follow-up Required": remarks.filter(r => r.sentiment === "Follow-up Required").length,
      Neutral: remarks.filter(r => r.sentiment === "Neutral").length
    };
    res.json({ summary, remarks });
  } catch (e) {
    res.status(500).json({ error: "Failed to get remarks" });
  }
});

// Cross Analysis
app.get("/cross", async (req, res) => {
  try {
    const { rows } = await readSheet();
    const indCol = 12, incCol = 13, cfgCol = 10, reqCol = 6;
    const results = {};
    rows.forEach(r => {
      const industry = r[indCol] || "Unknown";
      const income = r[incCol] || "Unknown";
      const config = r[cfgCol] || "Unknown";
      const req = r[reqCol] || "Unknown";
      const key = `${industry}_${income}_${config}_${req}`;
      results[key] = (results[key] || 0) + 1;
    });
    res.json({
      message: "Cross-analysis across industry, income, configuration, and requirement",
      breakdown: Object.entries(results).map(([key, count]) => ({ key, count }))
    });
  } catch (e) {
    res.status(500).json({ error: "Failed cross analysis" });
  }
});

// Full analytics summary
app.get("/analysis", async (req, res) => {
  try {
    const { rows } = await readSheet();
    res.json({
      total_rows: rows.length,
      sources: [...new Set(rows.map(r => r[8]))].filter(Boolean),
      configurations: [...new Set(rows.map(r => r[10]))].filter(Boolean),
      industries: [...new Set(rows.map(r => r[12]))].filter(Boolean),
      income_ranges: [...new Set(rows.map(r => r[13]))].filter(Boolean)
    });
  } catch (e) {
    res.status(500).json({ error: "Failed full analysis" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
