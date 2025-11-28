/**
 * 🌿 Aiikya Village Analytics API
 * For: Aiikya Village, Sarjapur
 * Description: Real-time analytics API for Google Sheet form data (A–X columns)
 * Version: 7.0
 */

import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// === CONFIG ===
const SHEET_ID = "1l1y6vdXj7rMWJwCx3dc3ku0HPrHvpJAx5lh21nJP5HA"; // Google Sheet ID
const SHEET_NAME = "site visits"; // Tab name in the sheet

// === GOOGLE AUTH ===
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});
const sheets = google.sheets({ version: "v4", auth });

// === HELPERS ===

// Read sheet safely (A–X covers 24 columns)
async function readSheet() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:X`
  });
  const [headers, ...rows] = res.data.values || [];
  const cleanHeaders = headers.map(h => (h || "").trim());
  return { headers: cleanHeaders, rows };
}

// Dynamically find a column by header name
function findColumn(headers, name) {
  const idx = headers.findIndex(
    h => h.toLowerCase().replace(/\s+/g, " ").trim() === name.toLowerCase().replace(/\s+/g, " ").trim()
  );
  return idx >= 0 ? idx : -1;
}

// Parse timestamp (handles DD/MM/YYYY and MM/DD/YYYY)
function parseTimestamp(ts) {
  if (!ts) return null;
  const parts = ts.split(/[\/ :]/);
  if (parts.length < 3) return null;
  const [a, b, c] = parts;
  let d;
  if (parseInt(a) > 12) d = new Date(`${c}-${b}-${a}`);
  else d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// Simple sentiment classification
function getSentiment(text) {
  if (!text) return "Neutral";
  const t = text.toLowerCase();
  if (t.includes("booked") || t.includes("interested") || t.includes("good") || t.includes("positive"))
    return "Positive";
  if (t.includes("follow") || t.includes("call") || t.includes("pending") || t.includes("waiting"))
    return "Follow-up Required";
  return "Neutral";
}

// === ROUTES ===

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "✅ Aiikya Village Analytics API is live and healthy" });
});

// Verify headers (for debugging)
app.get("/verify", async (req, res) => {
  const { headers } = await readSheet();
  res.json({ detected_headers: headers, total_columns: headers.length });
});

// Visitors today
app.get("/visitors", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const tsIndex = findColumn(headers, "Timestamp");
    const today = new Date().toLocaleDateString("en-GB");
    const count = rows.filter(r => r[tsIndex]?.includes(today)).length;
    res.json({ visitors_today: count, total_rows: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Visitors in custom period
app.get("/period", async (req, res) => {
  try {
    const days = parseInt(req.query.days || "7");
    const { headers, rows } = await readSheet();
    const tsIndex = findColumn(headers, "Timestamp");
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);
    const valid = rows.filter(r => {
      const d = parseTimestamp(r[tsIndex]);
      return d && d >= cutoff && d <= now;
    });
    res.json({ range_days: days, visitors: valid.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Salesperson stats
app.get("/salesperson", async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Missing salesperson name" });
    const { headers, rows } = await readSheet();
    const s1 = findColumn(headers, "Sales person");
    const s2 = findColumn(headers, "Site Visit handled by");
    const matches = rows.filter(r => {
      const a = (r[s1] || "").toLowerCase();
      const b = (r[s2] || "").toLowerCase();
      return a.includes(name.toLowerCase()) || b.includes(name.toLowerCase());
    });
    res.json({ salesperson: name, handled_visitors: matches.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Compare all salespeople
app.get("/compare", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const s1 = findColumn(headers, "Sales person");
    const s2 = findColumn(headers, "Site Visit handled by");
    const stats = {};
    rows.forEach(r => {
      const sp = r[s1] || r[s2] || "Unassigned";
      if (sp) stats[sp] = (stats[sp] || 0) + 1;
    });
    res.json({
      leaderboard: Object.entries(stats).map(([salesperson, visitors]) => ({ salesperson, visitors }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sources (Lead Origins)
app.get("/sources", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const src = findColumn(headers, "How did you come to Know about us");
    const map = {};
    rows.forEach(r => {
      const val = (r[src] || "").trim();
      if (val) map[val] = (map[val] || 0) + 1;
    });
    res.json({ sources: Object.entries(map).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Requirements
app.get("/requirements", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const reqCol = findColumn(headers, "Requirements");
    const map = {};
    rows.forEach(r => {
      const val = (r[reqCol] || "").trim();
      if (val) map[val] = (map[val] || 0) + 1;
    });
    res.json({ requirements: Object.entries(map).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Configurations
app.get("/configurations", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const cfg = findColumn(headers, "Configurations");
    const map = {};
    rows.forEach(r => {
      const val = (r[cfg] || "").trim();
      if (val) map[val] = (map[val] || 0) + 1;
    });
    res.json({ configurations: Object.entries(map).map(([label, count]) => ({ label, count })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remarks with Sentiment
app.get("/remarks", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const remarkIndex = findColumn(headers, "site visit Remarks");
    const followIndex = findColumn(headers, "Follow up remarks");
    const remarks = rows
      .map(r => {
        const text = `${r[remarkIndex] || ""} ${r[followIndex] || ""}`.trim();
        return { text, sentiment: getSentiment(text) };
      })
      .filter(r => r.text);
    const summary = {
      Positive: remarks.filter(r => r.sentiment === "Positive").length,
      "Follow-up Required": remarks.filter(r => r.sentiment === "Follow-up Required").length,
      Neutral: remarks.filter(r => r.sentiment === "Neutral").length
    };
    res.json({ total_remarks: remarks.length, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cross Analysis (Industry, Income, Config, Requirements)
app.get("/cross", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const ind = findColumn(headers, "I am working in");
    const inc = findColumn(headers, "Current annual income");
    const cfg = findColumn(headers, "Configurations");
    const reqCol = findColumn(headers, "Requirements");
    const results = {};
    rows.forEach(r => {
      const key = `${r[ind] || "Unknown Industry"} | ${r[inc] || "Unknown Income"} | ${r[cfg] || "Unknown Config"} | ${r[reqCol] || "Unknown Requirement"}`;
      results[key] = (results[key] || 0) + 1;
    });
    res.json({ breakdown: Object.entries(results).map(([key, count]) => ({ key, count })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Full summary
app.get("/analysis", async (req, res) => {
  try {
    const { headers, rows } = await readSheet();
    const src = findColumn(headers, "How did you come to Know about us");
    const cfg = findColumn(headers, "Configurations");
    const ind = findColumn(headers, "I am working in");
    const inc = findColumn(headers, "Current annual income");
    res.json({
      total_records: rows.length,
      sources: [...new Set(rows.map(r => r[src]).filter(Boolean))],
      configurations: [...new Set(rows.map(r => r[cfg]).filter(Boolean))],
      industries: [...new Set(rows.map(r => r[ind]).filter(Boolean))],
      income_ranges: [...new Set(rows.map(r => r[inc]).filter(Boolean))]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start server
app.listen(PORT, () => console.log(`🚀 Aiikya Village Analytics API running on port ${PORT}`));
