import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// === CONFIG ===
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_KEY = process.env.GOOGLE_SERVICE_KEY;
const SHEET_NAME = "site visits"; // tab name

// === AUTH ===
const getSheets = async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(GOOGLE_SERVICE_KEY),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
};

// === READ SHEET ===
const getRows = async () => {
  const sheets = await getSheets();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${SHEET_NAME}'!A:X`,
  });

  const rows = result.data.values || [];
  const headers = rows[0].map((h) => (h || "").trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()]))
  );
};

// === DATE PARSER ===
// === Date Parser (auto-detect format and ensure valid) ===
const parseDate = (timestamp) => {
  if (!timestamp) return null;
  // Handle both "MM/DD/YYYY HH:mm:ss" and "DD/MM/YYYY HH:mm:ss"
  const parts = timestamp.split(/[\/ :]/);
  if (parts.length < 3) return null;

  const [p1, p2, p3] = parts;
  const year = p3.length === 4 ? p3 : parts[2];
  const month = parseInt(p1, 10);
  const day = parseInt(p2, 10);

  // If month > 12, swap order (means DD/MM/YYYY)
  const finalMonth = month > 12 ? day : month;
  const finalDay = month > 12 ? month : day;

  const date = new Date(`${year}-${String(finalMonth).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`);
  return isNaN(date.getTime()) ? null : date;
};


// === PERIOD FILTER ===
const filterByPeriod = (data, period) => {
  const now = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(now.getDate() - 7);

  return data.filter((r) => {
    const d = parseDate(r.Timestamp);
    if (!d) return false;
    switch (period) {
      case "today":
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      case "this_week":
        return d >= oneWeekAgo && d <= now;
      case "this_month":
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  });
};

// ✅ HEALTH CHECK
app.get("/health", (req, res) => {
  res.send("✅ Aiikya Village Entry API running fine!");
});

// ✅ VISITORS (TODAY)
app.get("/visitors", async (req, res) => {
  try {
    const data = await getRows();
    const today = filterByPeriod(data, "today");
    res.json({ total_visitors_today: today.length, total_rows: data.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to get today's visitors" });
  }
});

// ✅ WEEKLY VISITORS
app.get("/weekly", async (req, res) => {
  try {
    const data = await getRows();
    const week = filterByPeriod(data, "this_week");
    res.json({ total_visitors_week: week.length, total_rows: data.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to get weekly visitors" });
  }
});

// ✅ MONTHLY VISITORS
app.get("/monthly", async (req, res) => {
  try {
    const { month } = req.query; // e.g. 2025-11
    const data = await getRows();
    const results = data.filter((r) => {
      const d = parseDate(r.Timestamp);
      if (!d) return false;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return month
        ? iso === month
        : iso === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    });
    res.json({ month: month || "current", total_visitors: results.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to get monthly visitors" });
  }
});

// ✅ MONTHLY SOURCE & HANDLER BREAKDOWN
app.get("/monthlysources", async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: "Month (YYYY-MM) required" });

    const data = await getRows();
    const filtered = data.filter((r) => {
      const d = parseDate(r.Timestamp);
      if (!d) return false;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return iso === month;
    });

    const sourceKey = Object.keys(filtered[0] || {}).find(
      (k) => k.trim().toLowerCase() === "how did you come to know about us".toLowerCase()
    );

    const handlerKey = Object.keys(filtered[0] || {}).find(
      (k) => k.trim().toLowerCase() === "site visit handled by".toLowerCase()
    );

    const salesKey = Object.keys(filtered[0] || {}).find(
      (k) => k.trim().toLowerCase() === "sales person".toLowerCase()
    );

    const sourceCount = {};
    const handlerCount = {};

    filtered.forEach((r) => {
      const src = (r[sourceKey] || "Unknown").trim();
      if (src) sourceCount[src] = (sourceCount[src] || 0) + 1;

      const handler = `${r[handlerKey] || ""} ${r[salesKey] || ""}`.trim() || "Unassigned";
      handlerCount[handler] = (handlerCount[handler] || 0) + 1;
    });

    res.json({
      month,
      total_visitors: filtered.length,
      sources: Object.entries(sourceCount).map(([label, count]) => ({ label, count })),
      handlers: Object.entries(handlerCount).map(([name, count]) => ({ name, count })),
    });
  } catch (e) {
    console.error("❌ Error in /monthlysources:", e);
    res.status(500).json({ error: "Failed to get monthly source analysis" });
  }
});

// ✅ SALESPERSON PERFORMANCE
app.get("/salesperson", async (req, res) => {
  try {
    const { name, period } = req.query;
    if (!name || !period) return res.status(400).json({ error: "Missing name or period" });

    const data = await getRows();
    const filtered = filterByPeriod(data, period).filter(
      (r) =>
        (r["Site Visit handled by"] || "").toLowerCase().includes(name.toLowerCase()) ||
        (r["Sales person"] || "").toLowerCase().includes(name.toLowerCase())
    );

    res.json({ salesperson: name, period, customers: filtered.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to get salesperson data" });
  }
});

// ✅ SOCIAL MEDIA ANALYSIS
app.get("/socialmedia", async (req, res) => {
  try {
    const { months = "2025-10,2025-11", source = "Social Media" } = req.query;
    const monthList = months.split(",");
    const data = await getRows();

    const filtered = data.filter((r) => {
      const d = parseDate(r.Timestamp);
      if (!d) return false;
      const monthIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const src = (r["How did you come to Know about us"] || "").toLowerCase();
      return monthList.includes(monthIso) && src.includes(source.toLowerCase());
    });

    const handlerCount = {};
    const incomeBreakdown = {};
    const remarks = [];

    filtered.forEach((r) => {
      const handler = `${r["Site Visit handled by"] || ""} ${r["Sales person"] || ""}`.trim() || "Unassigned";
      handlerCount[handler] = (handlerCount[handler] || 0) + 1;

      const income = r["Current annual income"] || "Unspecified";
      incomeBreakdown[income] = (incomeBreakdown[income] || 0) + 1;

      if (r["site visit Remarks"]) {
        remarks.push({
          name: r["Name"] || "",
          handler,
          remark: r["site visit Remarks"],
        });
      }
    });

    res.json({
      source,
      months: monthList,
      total_visitors: filtered.length,
      handlers: Object.entries(handlerCount).map(([name, count]) => ({ name, count })),
      income_breakdown: Object.entries(incomeBreakdown).map(([range, count]) => ({ range, count })),
      remarks,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to analyze social media data" });
  }
});

// ✅ OVERALL ANALYSIS
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

    res.json({
      total_records: data.length,
      sources: countBy("How did you come to Know about us"),
      configurations: countBy("Configurations"),
      industries: countBy("I am working in"),
      income_distribution: countBy("Current annual income"),
      remarks: data
        .map((r) => ({
          name: r["Name"],
          handler: r["Site Visit handled by"],
          remark: r["site visit Remarks"],
        }))
        .filter((r) => r.remark && r.remark.trim().length > 0),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch full analysis" });
  }
});

// ✅ ROOT
app.get("/", (req, res) => {
  res.send("🌿 Aiikya Village Entry API live. Endpoints: /health, /visitors, /weekly, /monthly, /monthlysources, /salesperson, /socialmedia, /analysis");
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
