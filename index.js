// ✅ Village Entry API — Google Sheets Analytics Backend
import express from "express";
import { google } from "googleapis";

const app = express();
const PORT = process.env.PORT || 8080;

// Google Sheet Config
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_KEY = process.env.GOOGLE_SERVICE_KEY;

// Helper: Authorize and get Sheets client
const getSheets = async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
};

// Helper: Fetch data rows from Google Sheet
const getRows = async () => {
  const sheets = await getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'site visits'!A:R", // covers all columns
  });

  const rows = result.data.values || [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(r.map((v, i) => [headers[i], v])));
};

// Helper: Parse timestamp (format: M/D/YYYY H:mm:ss)
const parseDate = (timestamp) => {
  if (!timestamp) return null;
  const [m, d, y] = timestamp.split(/[ /]/);
  return new Date(`${y}-${m}-${d}`);
};

// ===================== DAILY VISITORS =====================
app.get("/visitors", async (req, res) => {
  try {
    const data = await getRows();
    const now = new Date();
    const day = now.getDate(),
      month = now.getMonth(),
      year = now.getFullYear();

    const todayCount = data.filter((r) => {
      const d = parseDate(r.Timestamp);
      return d && d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    }).length;

    res.json({ total_visitors_today: todayCount, total_records: data.length });
  } catch (error) {
    console.error("Error fetching visitors:", error.message);
    res.status(500).json({ error: "Failed to fetch today's visitors" });
  }
});

// ===================== FULL ANALYSIS =====================
app.get("/analysis", async (req, res) => {
  try {
    const data = await getRows();

    const countBy = (key) => {
      const counts = {};
      data.forEach((r) => {
        const val = (r[key] || "Unknown").trim();
        counts[val] = (counts[val] || 0) + 1;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
    };

    const response = {
      total_records: data.length,
      sources: countBy("How did you come to Know about us"),
      requirements: countBy("Requirements"),
      configurations: countBy("Configurations"),
      industries: countBy("I am working in"),
      income_distribution: countBy("Current annual income"),
      remarks: data
        .map((r) => ({
          name: r["Name"],
          sales_person: r["Sales person"],
          handled_by: r["Site Visit handled by"],
          site_visit_remarks: r["Site visit Remarks"],
          follow_up: r["Follow up remarks"],
        }))
        .filter((r) => r.site_visit_remarks || r.follow_up),
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching analytics:", error.message);
    res.status(500).json({ error: "Failed to analyze data" });
  }
});

// ===================== HEALTH CHECK =====================
app.get("/health", (req, res) => {
  res.send("✅ Village Entry API is healthy. Endpoints: /visitors, /analysis");
});

app.get("/", (req, res) => {
  res.send("🌿 Village Entry API is live! Endpoints: /health, /visitors, /analysis");
});

// ===================== START SERVER =====================
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
