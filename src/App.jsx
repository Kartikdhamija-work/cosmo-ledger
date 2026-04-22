import { useState, useEffect, useRef, useCallback } from "react";

const T = {
  pageBg:"#F0EBF8", cardBg:"#FFFFFF", rowAlt:"#FAF7FF",
  headerBg:"#2D0060",
  brand:"#6C2BD9", brandLt:"#EDE4FF",
  pink:"#E91E8C", pinkLt:"#FFEAF5",
  t1:"#111111", t2:"#444444", t3:"#777777", t4:"#BBBBBB",
  ok:"#15803D", okBg:"#DCFCE7",
  warn:"#92400E", warnBg:"#FEF9C3",
  err:"#B91C1C", errBg:"#FEE2E2",
  info:"#1E40AF", infoBg:"#DBEAFE",
  border:"#DDD3F0", borderDk:"#B49EDE",
};
const sans = "'Segoe UI',system-ui,-apple-system,sans-serif";
const mono = "ui-monospace,'Cascadia Code','Courier New',monospace";

const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const { sheetName, headers, rows } = payload;
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.getRange(1,1,1,headers.length).setFontWeight("bold").setBackground("#6C2BD9").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
    rows.forEach(row => sheet.appendRow(row));
    return ContentService.createTextOutput(JSON.stringify({status:"ok",added:rows.length})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status:"error",message:err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({status:"ok"})).setMimeType(ContentService.MimeType.JSON);
}`;

const pn  = v => { const n=parseFloat(String(v||0).replace(/[^\d.]/g,"")); return isNaN(n)?0:n; };
const fmtM = v => `₹${pn(v).toLocaleString("en-IN")}`;
const fmtD = iso => iso ? new Date(iso).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const now8 = () => new Date().toISOString().slice(0,10);

function calcH(a,b) {
  const p = t => {
    if (!t) return null;
    const m = String(t).match(/(\d{1,2})[:.h](\d{2})\s*(am|pm)?/i);
    if (!m) return null;
    let h=parseInt(m[1]),min=parseInt(m[2]);
    const ap=(m[3]||"").toLowerCase();
    if(ap==="pm"&&h<12)h+=12; if(ap==="am"&&h===12)h=0;
    return h*60+min;
  };
  const s=p(a),e=p(b);
  if(s==null||e==null) return null;
  let d=e-s; if(d<0)d+=1440;
  return Math.round(d/6)/10;
}

function parseMedicines(str) {
  if (!str||str==="—") return [];
  const results=[];
  str.split(/,\s*/).forEach(part=>{
    part=part.trim(); if(!part) return;
    const m=part.match(/^(.+?)\s*[\(\[]\s*(\d+)\s*[\)\]]\s*$/);
    if(m) results.push({name:m[1].trim(),qty:parseInt(m[2])});
    else results.push({name:part,qty:1});
  });
  return results;
}

// localStorage — persists on device
const SK  ="cosmo-sess";
const STK ="cosmo-sta";
const URLK="cosmo-url";
const APIK="cosmo-apikey";
const loadSess = () => { try { return JSON.parse(localStorage.getItem(SK)||"[]"); } catch { return []; } };
const saveSess = s  => { try { localStorage.setItem(SK,JSON.stringify(s)); } catch {} };
const loadSta  = () => { try { return JSON.parse(localStorage.getItem(STK)||'["Mangala","Ankura","Mayfair"]'); } catch { return ["Mangala","Ankura","Mayfair"]; } };
const saveSta  = s  => { try { localStorage.setItem(STK,JSON.stringify(s)); } catch {} };
const loadUrl  = () => { try { return localStorage.getItem(URLK)||""; } catch { return ""; } };
const saveUrl  = u  => { try { localStorage.setItem(URLK,u); } catch {} };
const loadKey  = () => { try { return localStorage.getItem(APIK)||""; } catch { return ""; } };
const saveKey  = k  => { try { localStorage.setItem(APIK,k); } catch {} };

async function syncToSheets(scriptUrl, sessions) {
  if (!scriptUrl) return;
  const post = async (sheetName,headers,rows) => {
    if (!rows.length) return;
    try { await fetch(scriptUrl,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain"},body:JSON.stringify({sheetName,headers,rows})}); } catch {}
  };
  await post("Nurse Shifts",["Date","Station","Nurse Name","Shift","Login","Logout","Hours","Patients","Cash","UPI","Revenue","App Done","App Total","App %","Pending Followup","Handover Notes"],
    sessions.filter(s=>s.staffType==="nurse").map(s=>[s.date,s.stationId,s.staffName,s.shift,s.loginTime||"",s.logoutTime||"",s.hoursWorked||"",s.totalPatients,s.cashCollected,s.upiCollected,s.totalRevenue,s.appEntriesDone,s.appEntriesTotal,s.appEntriesTotal?Math.round(s.appEntriesDone/s.appEntriesTotal*100)+"%":"",s.pendingFollowup||"",s.handoverNotes||""]));
  await post("Driver Shifts",["Date","Station","Pilot","Shift","Vehicle No","Login","Logout","Hours","Odometer In","Odometer Out","KM","Remarks"],
    sessions.filter(s=>s.staffType==="driver").map(s=>[s.date,s.stationId,s.staffName,s.shift,s.vehicleNo||"",s.loginTime||"",s.logoutTime||"",s.hoursWorked||"",s.odometerIn||"",s.odometerOut||"",s.odometerIn&&s.odometerOut?(pn(s.odometerOut)-pn(s.odometerIn)).toFixed(1):"",s.vehicleRemarks||""]));
  await post("Patients",["Date","Station","Nurse","Shift","S.No","App Entry","Name","Age","Sex","Tower-Flat","Contact","Complaint","Treatment","Medicines","Payment","Amount"],
    sessions.filter(s=>s.staffType==="nurse").flatMap(s=>(s.patients||[]).map(p=>[s.date,s.stationId,s.staffName,s.shift,p.sno||"",p.app_entry_done===true?"Yes":p.app_entry_done===false?"No":"—",p.name||"",p.age||"",p.sex||"",[p.tower,p.flat_no].filter(Boolean).join("-")||"",p.contact||"",p.complaint||"",p.treatment||"",p.medicines||"",p.payment_mode||"",p.amount||""])));
  const iR=[];
  sessions.filter(s=>s.staffType==="nurse").forEach(s=>(s.patients||[]).forEach(p=>parseMedicines(p.medicines).forEach(m=>iR.push([s.date,s.stationId,s.staffName,s.shift,m.name,m.qty]))));
  await post("Inventory",["Date","Station","Nurse","Shift","Medicine","Quantity"],iR);
}

const PROMPT=`You are a data extractor for Cosmo Health shift forms. Extract EVERYTHING visible in the photo.

TWO FORM TYPES:

NURSE SHIFT TRACKER: Date, Station, Nurse Name, Contact, Shift (Morning/Evening/Night), Login Time, Signature — Checklist 9 items (tablet, app, lab booking, patient entry, pricing list, handover, station clean, emergency kit, PPE) — End Summary: Total Patients, Cash Collected, UPI Collected, Pending Follow-up, Handover Notes, Logout Time — Patient Ledger: S.No, App Entry(tick/cross), Name, Age, Sex, Tower, Flat No, Contact, Complaint, Treatment, Medicines & Consumables (name+qty), Payment(UPI/Cash/FREE), Amount.

AMBULANCE VEHICLE CHECKLIST: Vehicle No, Date, Station, Pilot Name, Contact, Odometer(Km), Shift, Login Time — 10 inspection sections — Check-Out Odometer, Checkout Time, Signature.

RULES:
- form_type: "nurse" or "ambulance"
- photo_section: "start" "end" or "full"
- Extract every legible field. null for missing. Never invent.
- Checklist: true=ticked, false=crossed, null=blank
- app_entry_done: true=ticked, false=crossed/blank, null=illegible
- medicines: string like "Paracetamol (2), ORS (1)" or null

Return ONLY valid JSON no markdown:
{"form_type":"nurse","photo_section":"start","date":null,"station":null,"staff_name":null,"staff_contact":null,"shift":null,"login_time":null,"logout_time":null,"vehicle_no":null,"odometer_in":null,"odometer_out":null,"checklist":{"tablet_ok":null,"app_ok":null,"knows_lab_booking":null,"knows_patient_entry":null,"pricing_list":null,"handover_taken":null,"station_clean":null,"emergency_kit":null,"ppe_ready":null,"general_ok":null,"lights_ok":null,"tyres_ok":null,"gauges_ok":null,"fluids_ok":null,"oxygen_ok":null,"linen_ok":null,"drugs_ok":null},"summary":{"total_patients":null,"cash_collected":null,"upi_collected":null,"pending_followup":null,"handover_notes":null},"patients":[],"vehicle_remarks":null}`;

async function extractPhoto(b64, apiKey) {
  if (!apiKey) throw new Error("No API key — add your Gemini key in Setup tab");
  // Try models in order until one works
  const models = ["gemini-1.5-flash","gemini-1.5-flash-8b","gemini-2.0-flash-lite","gemini-2.0-flash"];
  let lastError = null;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
        {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            contents:[{parts:[
              {inline_data:{mime_type:"image/jpeg",data:b64}},
              {text:PROMPT}
            ]}],
            generationConfig:{temperature:0,maxOutputTokens:2500}
          })
        }
      );
      const d = await res.json();
      if (d.error) {
        lastError = d.error.message;
        continue; // try next model
      }
      const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      return JSON.parse(txt.replace(/```json|```/g,"").trim());
    } catch(e) {
      lastError = e.message;
    }
  }
  throw new Error("All models failed: " + lastError);
}

function buildSess(ext,sta,date) {
  const isN=ext.form_type!=="ambulance";
  const totP=pn(ext.summary?.total_patients)||(ext.patients?.length||0);
  const cash=pn(ext.summary?.cash_collected),upi=pn(ext.summary?.upi_collected);
  let aD=0,aT=0;
  (ext.patients||[]).forEach(p=>{ if(p.app_entry_done===true){aD++;aT++;}else if(p.app_entry_done===false){aT++;} });
  return {
    id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
    stationId:sta||ext.station||"Unknown", date:date||ext.date||now8(),
    staffName:ext.staff_name||"Unknown", staffType:isN?"nurse":"driver",
    shift:ext.shift||"—", vehicleNo:ext.vehicle_no||null,
    loginTime:ext.login_time||null, logoutTime:ext.logout_time||null,
    hoursWorked:calcH(ext.login_time,ext.logout_time),
    totalPatients:totP, cashCollected:cash, upiCollected:upi, totalRevenue:cash+upi,
    appEntriesDone:aD, appEntriesTotal:aT,
    patients:ext.patients||[], checklist:ext.checklist||{},
    handoverNotes:ext.summary?.handover_notes||null,
    pendingFollowup:ext.summary?.pending_followup||null,
    odometerIn:ext.odometer_in||null, odometerOut:ext.odometer_out||null,
    vehicleRemarks:ext.vehicle_remarks||null,
    createdAt:new Date().toISOString(),
  };
}

function mergeSess(base,inc) {
  const m={...base};
  ["loginTime","logoutTime","staffName","shift","vehicleNo","odometerIn","odometerOut","handoverNotes","pendingFollowup","vehicleRemarks"].forEach(f=>{
    if((!m[f]||m[f]==="Unknown"||m[f]==="—")&&inc[f]&&inc[f]!=="Unknown") m[f]=inc[f];
  });
  if(inc.totalPatients>m.totalPatients) m.totalPatients=inc.totalPatients;
  if(inc.cashCollected>m.cashCollected) m.cashCollected=inc.cashCollected;
  if(inc.upiCollected>m.upiCollected)   m.upiCollected=inc.upiCollected;
  if(inc.appEntriesTotal>m.appEntriesTotal){m.appEntriesDone=inc.appEntriesDone;m.appEntriesTotal=inc.appEntriesTotal;}
  if((inc.patients?.length||0)>(m.patients?.length||0)) m.patients=inc.patients;
  if(inc.checklist) m.checklist={...m.checklist,...Object.fromEntries(Object.entries(inc.checklist).filter(([,v])=>v!==null))};
  m.totalRevenue=m.cashCollected+m.upiCollected;
  m.hoursWorked=calcH(m.loginTime,m.logoutTime);
  m.updatedAt=new Date().toISOString();
  return m;
}

const Card=({children,style={}})=>(<div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:10,...style}}>{children}</div>);
const Badge=({label,color=T.brand,bg=T.brandLt,style={}})=>(<span style={{display:"inline-block",padding:"2px 9px",borderRadius:5,fontSize:11,fontWeight:700,color,background:bg,fontFamily:mono,whiteSpace:"nowrap",...style}}>{label}</span>);
const Stat=({label,value,color=T.brand})=>(<Card style={{padding:"14px 16px"}}><div style={{fontSize:10,color:T.t3,fontFamily:mono,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontSize:22,fontWeight:800,color,lineHeight:1.1}}>{value}</div></Card>);
const Btn=({label,onClick,color=T.brand,textColor="#fff",disabled,small,style={}})=>(<button onClick={onClick} disabled={disabled} style={{padding:small?"5px 12px":"9px 18px",background:disabled?"#CCC":color,color:disabled?"#888":textColor,border:"none",borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontSize:small?11:13,fontWeight:700,fontFamily:sans,...style}}>{label}</button>);
const Comp=({done,total})=>{ if(!total) return <span style={{color:T.t4,fontSize:11}}>—</span>; const p=Math.round(done/total*100),col=p===100?T.ok:p>=70?T.warn:T.err,bg=p===100?T.okBg:p>=70?T.warnBg:T.errBg; return <span style={{background:bg,color:col,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700,fontFamily:mono}}>{done}/{total} ({p}%)</span>; };
const selS={padding:"8px 12px",border:`1px solid ${T.borderDk}`,borderRadius:7,fontSize:13,fontFamily:sans,color:T.t1,background:T.cardBg,outline:"none"};
const Th=({c})=>(<th style={{padding:"10px 12px",textAlign:"left",fontSize:11,color:T.t2,fontWeight:700,fontFamily:sans,borderBottom:`2px solid ${T.border}`,background:T.rowAlt,whiteSpace:"nowrap"}}>{c}</th>);
const Td=({c,style={}})=>(<td style={{padding:"9px 12px",fontSize:12,color:T.t2,borderBottom:`1px solid ${T.border}`,verticalAlign:"middle",...style}}>{c}</td>);

function SetupTab({scriptUrl,setScriptUrl,apiKey,setApiKey}) {
  const [url,setUrl]=useState(scriptUrl);
  const [key,setKey]=useState(apiKey);
  const [showKey,setShowKey]=useState(false);
  const [copied,setCopied]=useState(false);
  const [saved,setSaved]=useState(false);

  const saveAll=()=>{ saveUrl(url); setScriptUrl(url); saveKey(key); setApiKey(key); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return(
    <div style={{maxWidth:760}}>
      <Card style={{padding:20,marginBottom:20,borderLeft:`4px solid ${T.pink}`,background:"#FFF8FC"}}>
        <div style={{fontWeight:800,fontSize:15,color:T.pink,marginBottom:6}}>One-time setup</div>
        <div style={{fontSize:13,color:T.t2,lineHeight:1.8}}>Complete both sections. After this, uploads auto-sync to Google Sheets.</div>
      </Card>

      {/* API Key */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",gap:14,padding:"14px 16px",alignItems:"flex-start"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:T.pink,color:"#fff",fontSize:15,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>A</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14,color:T.t1,marginBottom:5}}>Gemini API Key (free)</div>
            <div style={{fontSize:13,color:T.t2,lineHeight:1.8,marginBottom:10}}>
              1. Go to <b>aistudio.google.com/app/apikey</b><br/>
              2. Click <b>Create API key</b> → select <b>Default Gemini Project</b><br/>
              3. Copy the key (starts with AIzaSy...)
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input value={key} onChange={e=>setKey(e.target.value)} type={showKey?"text":"password"} placeholder="AIzaSy…" style={{...selS,flex:1,minWidth:260,fontSize:12,fontFamily:mono}}/>
              <Btn label={showKey?"Hide":"Show"} onClick={()=>setShowKey(s=>!s)} color="#EEE" textColor={T.t2} small/>
            </div>
            {key&&<div style={{marginTop:6,fontSize:11,color:T.ok}}>✓ Key entered</div>}
          </div>
        </div>
      </Card>

      {/* Google Sheets */}
      {[
        {n:"1",title:"Open your Google Sheet",body:"Go to sheets.google.com → open or create your ledger sheet."},
        {n:"2",title:"Open Apps Script",body:"Extensions → Apps Script → delete any existing code."},
        {n:"3",title:"Paste code and save",body:"Copy code below → paste in Apps Script → Ctrl+S.",code:true},
        {n:"4",title:"Deploy as Web App",body:"Deploy → New deployment → ⚙️ → Web App → Execute as: Me → Who has access: Anyone → Deploy → Authorize → copy the URL."},
        {n:"5",title:"Paste URL + Save",body:"Paste URL below then click Save All Settings.",isUrl:true},
      ].map(s=>(
        <Card key={s.n} style={{marginBottom:12,overflow:"hidden"}}>
          <div style={{display:"flex",gap:14,padding:"14px 16px",alignItems:"flex-start"}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:T.brand,color:"#fff",fontSize:15,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.n}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:T.t1,marginBottom:5}}>{s.title}</div>
              <div style={{fontSize:13,color:T.t2,lineHeight:1.7}}>{s.body}</div>
              {s.code&&(<div style={{marginTop:12}}>
                <pre style={{background:"#1E0040",color:"#C4B5FD",padding:"14px",borderRadius:8,fontSize:11,fontFamily:mono,overflowX:"auto",margin:0,lineHeight:1.6,maxHeight:160,overflowY:"auto"}}>{APPS_SCRIPT_CODE}</pre>
                <Btn label={copied?"✓ Copied!":"Copy Code"} onClick={()=>{navigator.clipboard.writeText(APPS_SCRIPT_CODE);setCopied(true);setTimeout(()=>setCopied(false),2500);}} color={copied?T.ok:T.brand} style={{marginTop:8}}/>
              </div>)}
              {s.isUrl&&(<div style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
                <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" style={{...selS,fontSize:12}}/>
                <Btn label={saved?"✓ Saved!":"💾 Save All Settings"} onClick={saveAll} color={saved?T.ok:T.pink}/>
              </div>)}
            </div>
          </div>
        </Card>
      ))}
      {(scriptUrl&&apiKey)&&<Card style={{padding:14,borderLeft:`4px solid ${T.ok}`,background:T.okBg}}><div style={{fontWeight:700,color:T.ok}}>✓ Fully configured — ready to use</div></Card>}
    </div>
  );
}

function UploadTab({stations,scriptUrl,apiKey,onSaved}) {
  const [items,setItems]=useState([]);
  const [dSta,setDSta]=useState(stations[0]||"");
  const [dDate,setDDate]=useState(now8());
  const [busy,setBusy]=useState(false);
  const [saveStatus,setSaveStatus]=useState(null);
  const fRef=useRef();

  useEffect(()=>{if(stations[0]&&!dSta)setDSta(stations[0]);},[stations]);

  const addFiles=async files=>{
    const arr=[];
    for(const f of files){
      if(!f.type.startsWith("image/"))continue;
      const prev=URL.createObjectURL(f);
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);});
      arr.push({id:`${Date.now()}-${Math.random()}`,prev,b64,status:"pending",ext:null,err:null,sta:dSta,date:dDate});
    }
    setItems(p=>[...p,...arr]);
  };

  const extractAll=async()=>{
    const todo=items.filter(i=>i.status==="pending"||i.status==="err");
    if(!todo.length)return;
    if(!apiKey){alert("Add your Gemini API key in the Setup tab first.");return;}
    setBusy(true); setSaveStatus(null);
    for(const item of todo){
      setItems(p=>p.map(i=>i.id===item.id?{...i,status:"reading"}:i));
      try{const ext=await extractPhoto(item.b64,apiKey);setItems(p=>p.map(i=>i.id===item.id?{...i,status:"done",ext}:i));}
      catch(e){setItems(p=>p.map(i=>i.id===item.id?{...i,status:"err",err:e.message||"Failed"}:i));}
    }
    setBusy(false);
  };

  const saveAll=async()=>{
    const done=items.filter(i=>i.status==="done"&&i.ext);
    if(!done.length)return;
    setBusy(true); setSaveStatus("saving");
    const existing=loadSess(); let updated=[...existing];
    for(const item of done){
      const s=buildSess(item.ext,item.sta,item.date);
      const idx=updated.findIndex(x=>x.staffType===s.staffType&&x.stationId===s.stationId&&x.date===s.date&&s.staffName!=="Unknown"&&x.staffName!=="Unknown"&&x.staffName?.toLowerCase().trim()===s.staffName?.toLowerCase().trim());
      if(idx>=0)updated[idx]=mergeSess(updated[idx],s); else updated.unshift(s);
    }
    saveSess(updated); onSaved(updated);
    if(scriptUrl){setSaveStatus("syncing");await syncToSheets(scriptUrl,updated);}
    setSaveStatus("done"); setBusy(false);
    setTimeout(()=>{setItems([]);setSaveStatus(null);},2500);
  };

  const pending=items.filter(i=>i.status==="pending"||i.status==="err").length;
  const doneCount=items.filter(i=>i.status==="done").length;
  const statusMsg={saving:"Saving…",syncing:"Syncing to Google Sheets…",done:scriptUrl?"✓ Saved + synced to Google Sheets":"✓ Saved locally"};

  return(
    <div>
      {(!scriptUrl||!apiKey)&&<Card style={{padding:"10px 16px",marginBottom:16,borderLeft:`4px solid ${T.warn}`,background:T.warnBg}}><span style={{fontSize:13,color:T.warn,fontWeight:600}}>⚠️ Setup not complete — go to Setup tab first</span></Card>}
      {scriptUrl&&apiKey&&<Card style={{padding:"10px 16px",marginBottom:16,borderLeft:`4px solid ${T.ok}`,background:T.okBg}}><span style={{fontSize:13,color:T.ok,fontWeight:600}}>✓ Ready — saves will auto-sync to Google Sheets</span></Card>}

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end",padding:"14px 16px",background:T.rowAlt,borderRadius:10,border:`1px solid ${T.border}`}}>
        <div><div style={{fontSize:11,fontWeight:700,color:T.t3,marginBottom:4}}>STATION</div><select value={dSta} onChange={e=>setDSta(e.target.value)} style={selS}>{stations.map(s=><option key={s}>{s}</option>)}</select></div>
        <div><div style={{fontSize:11,fontWeight:700,color:T.t3,marginBottom:4}}>DATE</div><input type="date" value={dDate} onChange={e=>setDDate(e.target.value)} style={selS}/></div>
      </div>

      <div onDrop={e=>{e.preventDefault();addFiles([...e.dataTransfer.files]);}} onDragOver={e=>e.preventDefault()} onClick={()=>fRef.current.click()}
        style={{border:`2px dashed ${T.borderDk}`,borderRadius:12,padding:"36px 24px",textAlign:"center",cursor:"pointer",background:T.cardBg,marginBottom:16}}>
        <div style={{fontSize:36,marginBottom:8}}>📸</div>
        <div style={{fontWeight:700,fontSize:15,color:T.t1,marginBottom:5}}>Tap to select photos</div>
        <div style={{fontSize:12,color:T.t3}}>Multiple at once · Nurse and driver together · Any part of any form</div>
        <input ref={fRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addFiles([...e.target.files])}/>
      </div>

      {items.length>0&&(<>
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center",padding:"12px 14px",background:T.rowAlt,borderRadius:10,border:`1px solid ${T.border}`}}>
          <Btn label={busy?"⏳ Reading…":`Read All Photos (${pending})`} onClick={extractAll} disabled={busy||!pending} color={T.brand}/>
          {doneCount>0&&<Btn label={saveStatus?statusMsg[saveStatus]:`Save ${doneCount} Record${doneCount>1?"s":""}`} onClick={saveAll} disabled={busy||!!saveStatus} color={T.pink}/>}
          <Btn label="Clear" onClick={()=>setItems([])} color="#EEE" textColor={T.t2}/>
          <span style={{fontSize:12,color:T.t3}}>{items.length} photos · {doneCount} read</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
          {items.map(item=>{
            const e=item.ext;
            const sBg=item.status==="done"?T.okBg:item.status==="err"?T.errBg:"#F5F5F5";
            const sCol=item.status==="done"?T.ok:item.status==="err"?T.err:T.t3;
            return(<Card key={item.id} style={{overflow:"hidden"}}>
              <div style={{display:"flex",gap:12,padding:12}}>
                <img src={item.prev} alt="" style={{width:78,height:78,objectFit:"cover",borderRadius:8,flexShrink:0,border:`1px solid ${T.border}`}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,color:sCol,background:sBg}}>{item.status==="done"?"✓ Read":item.status==="reading"?"Reading…":item.status==="err"?"Failed":"Pending"}</span>
                    {e?.form_type&&<Badge label={e.form_type==="nurse"?"🩺 Nurse":"🚑 Driver"} color={e.form_type==="nurse"?T.brand:T.info} bg={e.form_type==="nurse"?T.brandLt:T.infoBg}/>}
                    {e?.photo_section&&<Badge label={e.photo_section==="start"?"Start":e.photo_section==="end"?"End":"Full"} color={T.warn} bg={T.warnBg}/>}
                  </div>
                  <select value={item.sta} onChange={ev=>setItems(p=>p.map(i=>i.id===item.id?{...i,sta:ev.target.value}:i))} style={{...selS,width:"100%",marginBottom:6,fontSize:12,padding:"5px 8px"}}>{stations.map(s=><option key={s}>{s}</option>)}</select>
                  <input type="date" value={item.date} onChange={ev=>setItems(p=>p.map(i=>i.id===item.id?{...i,date:ev.target.value}:i))} style={{...selS,width:"100%",fontSize:12,padding:"5px 8px"}}/>
                </div>
                <button onClick={()=>setItems(p=>p.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:T.t4,cursor:"pointer",fontSize:18,padding:0,alignSelf:"flex-start",lineHeight:1}}>×</button>
              </div>
              {e&&<div style={{background:T.rowAlt,borderTop:`1px solid ${T.border}`,padding:"8px 12px",fontSize:12,color:T.t2}}><span style={{fontWeight:700,color:T.t1,marginRight:8}}>{e.staff_name||"Name not visible"}</span>{e.shift&&<span style={{color:T.t3,marginRight:8}}>{e.shift}</span>}{e.login_time&&<span style={{marginRight:6}}>In:<b>{e.login_time}</b></span>}{e.logout_time&&<span style={{marginRight:6}}>Out:<b>{e.logout_time}</b></span>}{e.summary?.total_patients&&<span style={{color:T.pink,fontWeight:700,marginRight:6}}>👥{e.summary.total_patients}</span>}{e.summary?.cash_collected&&<span style={{color:T.ok}}>₹{e.summary.cash_collected}</span>}{e.vehicle_no&&<span style={{color:T.info}}>🚑{e.vehicle_no}</span>}</div>}
              {item.err&&<div style={{background:T.errBg,borderTop:`1px solid ${T.border}`,padding:"7px 12px",fontSize:12,color:T.err}}>{item.err}</div>}
            </Card>);
          })}
        </div>
      </>)}
    </div>
  );
}

function ReportsTab({sessions,stations}) {
  const [selSta,setSelSta]=useState("all");
  const [selDate,setSelDate]=useState("");
  const [selType,setSelType]=useState("all");
  const allDates=[...new Set(sessions.map(s=>s.date))].sort((a,b)=>b.localeCompare(a));
  const filt=sessions.filter(s=>(selSta==="all"||s.stationId===selSta)&&(!selDate||s.date===selDate)&&(selType==="all"||s.staffType===selType));
  const grp={};
  filt.forEach(s=>{if(!grp[s.stationId])grp[s.stationId]={};if(!grp[s.stationId][s.date])grp[s.stationId][s.date]=[];grp[s.stationId][s.date].push(s);});
  const tot={pat:filt.filter(s=>s.staffType==="nurse").reduce((a,s)=>a+(s.totalPatients||0),0),rev:filt.reduce((a,s)=>a+(s.totalRevenue||0),0),aD:filt.reduce((a,s)=>a+(s.appEntriesDone||0),0),aT:filt.reduce((a,s)=>a+(s.appEntriesTotal||0),0)};
  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center",padding:"12px 14px",background:T.rowAlt,borderRadius:10,border:`1px solid ${T.border}`}}>
        <select value={selSta} onChange={e=>setSelSta(e.target.value)} style={selS}><option value="all">All Stations</option>{stations.map(s=><option key={s}>{s}</option>)}</select>
        <select value={selDate} onChange={e=>setSelDate(e.target.value)} style={selS}><option value="">All Dates</option>{allDates.map(d=><option key={d} value={d}>{fmtD(d)}</option>)}</select>
        <select value={selType} onChange={e=>setSelType(e.target.value)} style={selS}><option value="all">All Staff</option><option value="nurse">Nurses</option><option value="driver">Drivers</option></select>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:20}}>
        <Stat label="Shifts" value={filt.length} color={T.brand}/><Stat label="Patients" value={tot.pat} color={T.pink}/><Stat label="Revenue" value={fmtM(tot.rev)} color={T.ok}/><Stat label="App %" value={tot.aT?`${Math.round(tot.aD/tot.aT*100)}%`:"—"} color={T.t2}/>
      </div>
      {Object.keys(grp).length===0?<div style={{textAlign:"center",padding:"60px 20px",color:T.t3,fontSize:14}}>No records yet.</div>:
      Object.entries(grp).sort().map(([sta,dm])=>(
        <div key={sta} style={{marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}><div style={{fontSize:16,fontWeight:800,color:T.brand}}>{sta}</div><div style={{flex:1,height:2,background:`linear-gradient(90deg,${T.brandLt},transparent)`}}/></div>
          {Object.entries(dm).sort(([a],[b])=>b.localeCompare(a)).map(([date,ds])=>{
            const ns=ds.filter(s=>s.staffType==="nurse");
            const dP=ns.reduce((a,s)=>a+(s.totalPatients||0),0),dR=ds.reduce((a,s)=>a+(s.totalRevenue||0),0);
            const dAD=ns.reduce((a,s)=>a+(s.appEntriesDone||0),0),dAT=ns.reduce((a,s)=>a+(s.appEntriesTotal||0),0);
            return(<Card key={date} style={{marginBottom:10,overflow:"hidden"}}>
              <div style={{background:T.rowAlt,padding:"9px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
                <strong style={{fontSize:14,color:T.t1}}>{fmtD(date)}</strong>
                <span style={{fontSize:12,color:T.t3}}>👥{dP}</span>
                <span style={{fontSize:12,color:T.ok,fontWeight:600}}>{fmtM(dR)}</span>
                {dAT>0&&<span style={{fontSize:12}}>App: <Comp done={dAD} total={dAT}/></span>}
                <Badge label={`${ds.length} shift${ds.length>1?"s":""}`}/>
              </div>
              <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
                {ds.sort((a,b)=>(a.staffType+a.shift).localeCompare(b.staffType+b.shift)).map(s=><ShiftRow key={s.id} s={s}/>)}
              </div>
            </Card>);
          })}
        </div>
      ))}
    </div>
  );
}

function ShiftRow({s}) {
  const [open,setOpen]=useState(false);
  const hasP=s.patients?.length>0,isN=s.staffType==="nurse";
  return(<div>
    <div onClick={()=>hasP&&setOpen(o=>!o)} style={{display:"flex",gap:8,alignItems:"center",padding:"9px 12px",background:T.cardBg,borderRadius:8,cursor:hasP?"pointer":"default",border:`1px solid ${T.border}`,flexWrap:"wrap"}}>
      <span style={{fontSize:15}}>{isN?"🩺":"🚑"}</span>
      <span style={{fontWeight:700,fontSize:13,color:T.t1,minWidth:120}}>{s.staffName}</span>
      <Badge label={s.shift} color={isN?T.brand:T.info} bg={isN?T.brandLt:T.infoBg}/>
      {s.loginTime&&<span style={{fontSize:12,color:T.t3}}>In:<b style={{color:T.t2}}>{s.loginTime}</b></span>}
      {s.logoutTime&&<span style={{fontSize:12,color:T.t3}}>Out:<b style={{color:T.t2}}>{s.logoutTime}</b></span>}
      {s.hoursWorked!=null&&<Badge label={`${s.hoursWorked}h`} color={T.ok} bg={T.okBg}/>}
      <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        {isN&&s.totalPatients>0&&<span style={{fontSize:12,color:T.pink,fontWeight:700}}>👥{s.totalPatients}</span>}
        {s.totalRevenue>0&&<span style={{fontSize:12,color:T.ok,fontWeight:700}}>{fmtM(s.totalRevenue)}</span>}
        {isN&&s.appEntriesTotal>0&&<Comp done={s.appEntriesDone} total={s.appEntriesTotal}/>}
        {!isN&&s.vehicleNo&&<span style={{fontSize:12,color:T.t3}}>{s.vehicleNo}</span>}
        {hasP&&<span style={{fontSize:11,color:T.t4}}>{open?"▲":"▼"} {s.patients.length}pt</span>}
      </div>
    </div>
    {open&&hasP&&(<div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px",overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
        <thead><tr>{["#","App","Name","Flat","Complaint","Treatment","Medicines","Pay","Amt"].map(c=><Th key={c} c={c}/>)}</tr></thead>
        <tbody>{s.patients.map((p,i)=>(<tr key={i} style={{background:i%2===0?T.cardBg:T.rowAlt}}>
          <Td c={p.sno||i+1}/><Td c={p.app_entry_done===true?<span style={{color:T.ok,fontWeight:700}}>✓</span>:<span style={{color:T.err,fontWeight:700}}>✗</span>}/>
          <Td c={p.name||"—"} style={{fontWeight:700,color:T.t1}}/><Td c={[p.tower,p.flat_no].filter(Boolean).join("-")||"—"}/>
          <Td c={p.complaint||"—"}/><Td c={p.treatment||"—"}/><Td c={p.medicines||"—"} style={{maxWidth:140,whiteSpace:"normal"}}/>
          <Td c={p.payment_mode||"—"}/><Td c={p.amount?`₹${p.amount}`:"—"} style={{fontWeight:600,color:T.ok}}/>
        </tr>))}</tbody>
      </table>
    </div>)}
  </div>);
}

function AttendanceTab({sessions}) {
  const [ft,setFt]=useState("all");
  const filt=sessions.filter(s=>ft==="all"||s.staffType===ft);
  const map={};
  filt.forEach(s=>{if(!s.staffName||s.staffName==="Unknown")return;const k=`${s.staffName}||${s.staffType}`;if(!map[k])map[k]={name:s.staffName,type:s.staffType,shifts:[],stas:new Set()};map[k].shifts.push(s);map[k].stas.add(s.stationId);});
  const list=Object.values(map).map(st=>{
    const wH=st.shifts.filter(s=>s.hoursWorked!=null),tH=wH.reduce((a,s)=>a+(s.hoursWorked||0),0);
    return{...st,total:st.shifts.length,hours:Math.round(tH*10)/10,avgH:wH.length?Math.round(tH/wH.length*10)/10:null,patients:st.shifts.reduce((a,s)=>a+(s.totalPatients||0),0),revenue:st.shifts.reduce((a,s)=>a+(s.totalRevenue||0),0),aD:st.shifts.reduce((a,s)=>a+(s.appEntriesDone||0),0),aT:st.shifts.reduce((a,s)=>a+(s.appEntriesTotal||0),0),staArr:[...st.stas],l7:st.shifts.filter(s=>(Date.now()-new Date(s.date).getTime())<604800000).length};
  }).sort((a,b)=>b.total-a.total);
  return(<div>
    <div style={{display:"flex",gap:8,marginBottom:16}}>{[["all","All Staff"],["nurse","🩺 Nurses"],["driver","🚑 Drivers"]].map(([v,l])=><Btn key={v} label={l} onClick={()=>setFt(v)} color={ft===v?T.brand:"#EEE"} textColor={ft===v?"#fff":T.t2}/>)}</div>
    {list.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:T.t3,fontSize:14}}>No records yet.</div>:(<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:20}}>
        <Stat label="Staff" value={list.length} color={T.brand}/><Stat label="Shifts" value={filt.length} color={T.pink}/><Stat label="Hours" value={`${list.reduce((a,s)=>a+s.hours,0)}h`} color={T.info}/><Stat label="Active 7d" value={list.filter(s=>s.l7>0).length} color={T.ok}/>
      </div>
      <Card style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
          <thead><tr>{["Name","Role","Station(s)","Shifts","Hours","Avg/Shift","Patients","Revenue","App %","Last 7 Days"].map(c=><Th key={c} c={c}/>)}</tr></thead>
          <tbody>{list.map((st,i)=>(<tr key={st.name+st.type} style={{background:i%2===0?T.cardBg:T.rowAlt}}>
            <Td c={st.name} style={{fontWeight:700,color:T.t1}}/>
            <Td c={<Badge label={st.type==="nurse"?"Nurse":"Driver"} color={st.type==="nurse"?T.brand:T.info} bg={st.type==="nurse"?T.brandLt:T.infoBg}/>}/>
            <Td c={st.staArr.join(", ")} style={{color:T.t3,fontSize:11}}/>
            <Td c={st.total} style={{fontWeight:700,color:T.brand}}/>
            <Td c={`${st.hours}h`} style={{fontWeight:700,color:T.info}}/>
            <Td c={st.avgH!=null?`${st.avgH}h`:"—"} style={{color:T.t3}}/>
            <Td c={st.patients||"—"}/>
            <Td c={st.revenue>0?fmtM(st.revenue):"—"} style={{color:T.ok,fontWeight:600}}/>
            <Td c={<Comp done={st.aD} total={st.aT}/>}/>
            <Td c={<Badge label={st.l7>0?`${st.l7} shift(s)`:"Inactive"} color={st.l7>0?T.ok:T.t3} bg={st.l7>0?T.okBg:"#F0F0F0"}/>}/>
          </tr>))}</tbody>
        </table>
      </Card>
    </>)}
  </div>);
}

function InventoryTab({sessions}) {
  const [selSta,setSelSta]=useState("all");
  const allSta=[...new Set(sessions.map(s=>s.stationId))].sort();
  const allInv={};
  sessions.filter(s=>s.staffType==="nurse").forEach(s=>(s.patients||[]).forEach(p=>parseMedicines(p.medicines).forEach(med=>{const key=med.name.toLowerCase().trim();if(!allInv[key])allInv[key]={name:med.name,qty:0,stations:new Set()};allInv[key].qty+=med.qty;allInv[key].stations.add(s.stationId);})));
  const invMap={};
  sessions.filter(s=>s.staffType==="nurse"&&(selSta==="all"||s.stationId===selSta)).forEach(s=>(s.patients||[]).forEach(p=>parseMedicines(p.medicines).forEach(med=>{const key=med.name.toLowerCase().trim();if(!invMap[s.stationId])invMap[s.stationId]={};if(!invMap[s.stationId][key])invMap[s.stationId][key]={name:med.name,qty:0,uses:0,dates:[]};invMap[s.stationId][key].qty+=med.qty;invMap[s.stationId][key].uses++;invMap[s.stationId][key].dates.push(s.date);})));
  const top=Object.values(allInv).sort((a,b)=>b.qty-a.qty).slice(0,10);
  return(<div>
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",padding:"12px 14px",background:T.rowAlt,borderRadius:10,border:`1px solid ${T.border}`}}>
      <select value={selSta} onChange={e=>setSelSta(e.target.value)} style={selS}><option value="all">All Stations</option>{allSta.map(s=><option key={s}>{s}</option>)}</select>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:20}}>
      <Stat label="Total Units" value={Object.values(allInv).reduce((a,x)=>a+x.qty,0)} color={T.brand}/>
      <Stat label="Unique Items" value={Object.keys(allInv).length} color={T.pink}/>
    </div>
    {top.length>0&&<Card style={{padding:0,overflow:"hidden",marginBottom:24}}>
      <div style={{padding:"12px 16px",background:T.rowAlt,borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:13}}>Most Used (All Stations)</div>
      {top.map((item,i)=>(<div key={item.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:i<top.length-1?`1px solid ${T.border}`:"none",background:i%2===0?T.cardBg:T.rowAlt}}>
        <div style={{width:22,height:22,borderRadius:"50%",background:T.brandLt,color:T.brand,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
        <div style={{flex:1,fontWeight:600,color:T.t1,fontSize:13}}>{item.name}</div>
        <Badge label={`${item.qty} units`}/>
        <div style={{width:100,background:"#EEE",borderRadius:4,height:8,flexShrink:0}}><div style={{width:`${Math.round(item.qty/top[0].qty*100)}%`,height:"100%",background:`linear-gradient(90deg,${T.brand},${T.pink})`,borderRadius:4}}/></div>
      </div>))}
    </Card>}
    {Object.entries(invMap).sort().map(([sta,items])=>(<Card key={sta} style={{marginBottom:16,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:T.rowAlt,borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:14,color:T.brand}}>{sta}</span>
        <Badge label={`${Object.values(items).reduce((a,x)=>a+x.qty,0)} units`}/>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["Medicine / Consumable","Total Qty","Patients","Last Used"].map(c=><Th key={c} c={c}/>)}</tr></thead>
        <tbody>{Object.values(items).sort((a,b)=>b.qty-a.qty).map((item,i)=>(<tr key={item.name} style={{background:i%2===0?T.cardBg:T.rowAlt}}>
          <Td c={item.name} style={{fontWeight:600,color:T.t1}}/><Td c={<Badge label={item.qty}/>}/><Td c={item.uses}/><Td c={fmtD([...item.dates].sort().pop())} style={{color:T.t3,fontSize:11}}/>
        </tr>))}</tbody>
      </table>
    </Card>))}
    {Object.keys(invMap).length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:T.t3,fontSize:14}}>No inventory yet. Filled automatically from patient form medicines column.</div>}
  </div>);
}

function SettingsTab({stations,setStations,sessions,setSessions}) {
  const [inp,setInp]=useState(""); const [conf,setConf]=useState(false);
  const add=()=>{ const n=inp.trim(); if(!n||stations.includes(n))return; const u=[...stations,n]; setStations(u);saveSta(u);setInp(""); };
  return(<div style={{maxWidth:520,display:"flex",flexDirection:"column",gap:24}}>
    <div>
      <div style={{fontWeight:700,fontSize:13,color:T.t2,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>STATIONS</div>
      <div style={{display:"flex",gap:10,marginBottom:12}}><input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="New station name" style={{...selS,flex:1}}/><Btn label="+ Add" onClick={add} color={T.pink}/></div>
      {stations.map(s=>(<div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",border:`1px solid ${T.border}`,borderRadius:8,marginBottom:6,background:T.cardBg}}>
        <span style={{fontWeight:700,color:T.t1}}>{s}</span>
        <Btn label="Remove" small onClick={()=>{const u=stations.filter(x=>x!==s);setStations(u);saveSta(u);}} color={T.errBg} textColor={T.err}/>
      </div>))}
    </div>
    <div>
      <div style={{fontWeight:700,fontSize:13,color:T.err,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>DANGER ZONE</div>
      {!conf?<Btn label="Delete All Records" onClick={()=>setConf(true)} color={T.errBg} textColor={T.err}/>:
        <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:13,color:T.err,fontWeight:600}}>Cannot be undone.</span><Btn label="Yes, delete all" onClick={()=>{saveSess([]);setSessions([]);setConf(false);}} color={T.err}/><Btn label="Cancel" onClick={()=>setConf(false)} color="#EEE" textColor={T.t2}/></div>}
    </div>
  </div>);
}

const TABS=[{id:"setup",icon:"🔗",label:"Setup"},{id:"upload",icon:"📸",label:"Upload Photos"},{id:"reports",icon:"🏥",label:"Station Reports"},{id:"attendance",icon:"👤",label:"Attendance"},{id:"inventory",icon:"💊",label:"Inventory"},{id:"settings",icon:"⚙️",label:"Settings"}];

export default function App() {
  const [tab,setTab]=useState("setup");
  const [sessions,setSessions]=useState([]);
  const [stations,setStations]=useState(["Mangala","Ankura","Mayfair"]);
  const [scriptUrl,setScriptUrl]=useState("");
  const [apiKey,setApiKey]=useState("");

  useEffect(()=>{
    setSessions(loadSess());
    setStations(loadSta());
    const u=loadUrl(); setScriptUrl(u);
    const k=loadKey(); setApiKey(k);
    if(u&&k) setTab("upload");
  },[]);

  const handleSetScriptUrl=u=>{ setScriptUrl(u); saveUrl(u); };
  const handleSetApiKey=k=>{ setApiKey(k); saveKey(k); };
  const handleSaved=updated=>setSessions(updated);

  const hdr={
    shifts:sessions.length,
    nurses:[...new Set(sessions.filter(s=>s.staffType==="nurse"&&s.staffName!=="Unknown").map(s=>s.staffName))].length,
    drivers:[...new Set(sessions.filter(s=>s.staffType==="driver"&&s.staffName!=="Unknown").map(s=>s.staffName))].length,
    patients:sessions.reduce((a,s)=>a+(s.totalPatients||0),0),
    revenue:sessions.reduce((a,s)=>a+(s.totalRevenue||0),0),
  };

  return(<div style={{fontFamily:sans,background:T.pageBg,minHeight:"100vh",color:T.t1}}>
    <style>{`*{box-sizing:border-box}select,input,button{font-family:${sans}}input[type=date]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:.6}`}</style>
    <div style={{background:T.headerBg}}>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 12px",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,background:"linear-gradient(135deg,#FF1F6B,#FF6BA8)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:"#fff",flexShrink:0}}>+</div>
            <div><div style={{color:"#CC88FF",fontSize:9,letterSpacing:"3px",fontFamily:mono}}>COSMO HEALTH</div><div style={{fontSize:15,fontWeight:800,color:"#fff"}}>Central Ledger</div></div>
          </div>
          <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
            {[["Shifts",hdr.shifts,"#CC88FF"],["Nurses",hdr.nurses,"#A78BFA"],["Drivers",hdr.drivers,"#93C5FD"],["Patients",hdr.patients,"#F9A8D4"],["Revenue",fmtM(hdr.revenue),"#86EFAC"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center"}}><div style={{color:c,fontSize:17,fontWeight:800,lineHeight:1}}>{v}</div><div style={{color:"#8855AA",fontSize:9,letterSpacing:"1px",marginTop:2,fontFamily:mono}}>{l}</div></div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",overflowX:"auto",gap:2}}>
          {TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 15px",border:"none",cursor:"pointer",fontFamily:sans,fontSize:12,fontWeight:600,whiteSpace:"nowrap",background:tab===t.id?T.pageBg:"transparent",color:tab===t.id?T.brand:"#9966BB",borderRadius:tab===t.id?"8px 8px 0 0":"0"}}>
            {t.icon} {t.label}
            {t.id==="setup"&&(!scriptUrl||!apiKey)&&<span style={{marginLeft:5,background:T.pink,color:"#fff",borderRadius:"50%",fontSize:9,padding:"1px 5px",fontWeight:800}}>!</span>}
          </button>))}
        </div>
      </div>
    </div>
    <div style={{maxWidth:1200,margin:"0 auto",padding:"24px 20px"}}>
      {tab==="setup"     &&<SetupTab scriptUrl={scriptUrl} setScriptUrl={handleSetScriptUrl} apiKey={apiKey} setApiKey={handleSetApiKey}/>}
      {tab==="upload"    &&<UploadTab stations={stations} scriptUrl={scriptUrl} apiKey={apiKey} onSaved={handleSaved}/>}
      {tab==="reports"   &&<ReportsTab sessions={sessions} stations={stations}/>}
      {tab==="attendance"&&<AttendanceTab sessions={sessions}/>}
      {tab==="inventory" &&<InventoryTab sessions={sessions}/>}
      {tab==="settings"  &&<SettingsTab stations={stations} setStations={setStations} sessions={sessions} setSessions={setSessions}/>}
    </div>
  </div>);
}
