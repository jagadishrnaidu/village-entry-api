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

// ---------- helpers ----------
async function readSheet() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:X`
  });
  const [headers, ...rows] = res.data.values || [];
  const cleanHeaders = headers.map(h => (h || "").trim());
  const padded = rows.map(r => {
    const row = [...r];
    while (row.length < cleanHeaders.length) row.push("");
    return row;
  });
  return { headers: cleanHeaders, rows: padded };
}
function findColumn(headers, name) {
  return headers.findIndex(
    h => h.toLowerCase().replace(/\s+/g, " ").trim() ===
         name.toLowerCase().replace(/\s+/g, " ").trim()
  );
}
function parseTimestamp(ts) {
  if (!ts) return null;
  const parts = ts.split(/[\/ :]/);
  if (parts.length < 3) return null;
  const [a,b,c] = parts;
  let d = parseInt(a) > 12 ? new Date(`${c}-${b}-${a}`) : new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
function getMonthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function getSentiment(t){
  if(!t) return "Neutral";
  const s=t.toLowerCase();
  if(/booked|positive|interested|good/.test(s)) return "Positive";
  if(/follow|call|pending|waiting/.test(s)) return "Follow-up Required";
  return "Neutral";
}

// ---------- routes ----------
app.get("/health",(req,res)=>res.json({status:"✅ Aiikya Analytics API Live"}));
app.get("/verify",async(req,res)=>{
  const {headers}=await readSheet();
  res.json({headers,total_columns:headers.length});
});

// social-source month filter
app.get("/socialmedia",async(req,res)=>{
  try{
    const months=(req.query.months||"2025-10,2025-11").split(",");
    const sourceName=req.query.source||"social media";
    const {headers,rows}=await readSheet();
    const tsIdx=findColumn(headers,"Timestamp");
    const srcIdx=findColumn(headers,"How did you come to Know about us");
    const handledIdx=findColumn(headers,"Site Visit handled by");
    const salesIdx=findColumn(headers,"Sales person");
    const incomeIdx=findColumn(headers,"Current annual income");
    const remarkIdx=findColumn(headers,"site visit Remarks");
    const followIdx=findColumn(headers,"Follow up remarks");

    const data=[];
    rows.forEach(r=>{
      const src=(r[srcIdx]||"").toLowerCase();
      if(!src.includes(sourceName.toLowerCase())) return;
      const d=parseTimestamp(r[tsIdx]);
      if(!d) return;
      if(!months.includes(getMonthKey(d))) return;
      data.push({
        timestamp:r[tsIdx],
        handler:(r[handledIdx]||"")+(r[salesIdx]?` / ${r[salesIdx]}`:""),
        income:r[incomeIdx]||"Unknown",
        remark:`${r[remarkIdx]} ${r[followIdx]}`.trim(),
        sentiment:getSentiment(`${r[remarkIdx]} ${r[followIdx]}`)
      });
    });

    const byHandler={};
    const byIncome={};
    const sentimentCount={Positive:0,"Follow-up Required":0,Neutral:0};

    data.forEach(e=>{
      const handlers=e.handler.split(/,|&|\//).map(x=>x.trim()).filter(Boolean);
      handlers.forEach(h=>{byHandler[h]=(byHandler[h]||0)+1;});
      byIncome[e.income]=(byIncome[e.income]||0)+1;
      sentimentCount[e.sentiment]++;
    });

    res.json({
      months,
      source:sourceName,
      total:data.length,
      handlers:Object.entries(byHandler).map(([h,c])=>({handler:h,visits:c})),
      income_breakdown:Object.entries(byIncome).map(([i,c])=>({income:i,count:c})),
      sentiment_summary:sentimentCount,
      remarks:data.map(e=>({timestamp:e.timestamp,handler:e.handler,income:e.income,remark:e.remark,sentiment:e.sentiment}))
    });
  }catch(e){res.status(500).json({error:e.message});}
});

// existing generic endpoints (period,sources,compare...) could remain here if needed
// but are omitted for brevity—they work unchanged from v7.5

app.listen(PORT,()=>console.log(`🚀 Aiikya Analytics v8.0 running on port ${PORT}`));
