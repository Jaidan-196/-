import { useState } from "react";

// ============================================================
// CONFIG
// ============================================================
const DEFAULT_CONFIG = {
  // 空壓：5台 + 儲桶
  compressors: {
    label: "空壓設備",
    units: [1,2,3,4,5].map(n => ({ id:`cmp${n}`, label:`空壓機 ${n}號` })),
    tanks: [
      { id:"tank_roof", label:"頂樓儲桶壓力", stdMin:7, stdMax:9, unit:"kgf/cm²" },
      { id:"tank_3f_1", label:"三樓儲桶1壓力", stdMin:6, stdMax:9, unit:"kgf/cm²" },
      { id:"tank_3f_2", label:"三樓儲桶2壓力", stdMin:6, stdMax:9, unit:"kgf/cm²" },
    ],
  },
  // 水系統
  waterSystem: { label:"水系統" },
  // RO A~E：全部有產水量＋第一段膜管壓力；D.E額外有輸出頻率
  ro: ["A","B","C","D","E"].map(k => ({
    id:`ro${k}`, key:k,
    hasFreq: k==="D"||k==="E",
    prodWarnBelow: 10,    // 產水量低於10噸 → 警告
    pressWarnAbove: 12,   // 第一段壓力大於12 → 警告
  })),
  // 製程冰水機（進口9-11、出口6-8、溫差≤5）
  processChiller: {
    label:"製程冰水機",
    units: [1,2].map(n => ({
      id:`proc${n}`, label:`製程冰水機 ${n}號`,
      inMin:9, inMax:11, outMin:6, outMax:8, diffMax:5,
    })),
  },
  // 冷卻水塔
  coolingTower: { label:"冷卻水塔" },
  // 外氣
  freshAir: {
    label:"外氣機組",
    units:[1,2,3].map(n=>({ id:`fa${n}`, label:`外氣機組 ${n}號` })),
  },
  // 無塵室
  cleanrooms: {
    label:"無塵室溫濕度",
    floors: [
      {
        id:"1f", name:"1樓",
        rooms:[
          { id:"cr_ABC",   name:"無塵室 ABC區", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_DEF",   name:"無塵室 DEF區", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_GHI",   name:"無塵室 GHI區", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_JKL",   name:"無塵室 JKL區", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_MNO",   name:"無塵室 MNO區", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_riv1",  name:"鉚合一區（裁膠室）", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_riv2",  name:"鉚合二區", tempMax:23, humMin:40, humMax:55 },
          { id:"cr_pre",   name:"預組室", tempMax:23, humMin:40, humMax:55 },
        ],
      },
      {
        id:"3f", name:"3樓",
        rooms:[
          { id:"cr_hrc", name:"內層HRC", tempMin:21, tempMax:23, humMin:50, humMax:60 },
        ],
      },
    ],
  },
};

// ============================================================
// HELPERS
// ============================================================
function getNow() {
  return new Date().toLocaleString("zh-TW",{
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,
  });
}
function getShift() {
  const h=new Date().getHours();
  return h>=7&&h<14?"早班":h>=14&&h<22?"晚班":"夜班";
}
function OK(v){ return `✅ ${v||"正常"}`; }
function NG(v){ return `⚠️ ${v||"異常"}`; }
function tag(ok,okLabel,ngLabel){ return ok?OK(okLabel):NG(ngLabel); }

// ============================================================
// LINE MSG GENERATOR
// ============================================================
function generateMsg(data, config) {
  const now=getNow(), shift=getShift();
  const L=[], A=[];   // lines, anomalies

  L.push("📋 【設備巡檢報告】");
  L.push(`🕐 時間：${now}`);
  L.push(`🔄 班別：${shift}`);
  L.push("━━━━━━━━━━━━━━━━━━━━");

  // ── 空壓 ──
  L.push("\n🔧【空壓設備】");
  config.compressors.units.forEach(u=>{
    const d=data.cmp?.[u.id]||{};
    const ok=d.normal==="正常";
    L.push(`  ${u.label}  溫度:${d.temp??"-"}°C  限高:${d.highTemp??"-"}°C  ${tag(ok)}`);
    if(d.normal&&!ok) A.push(`📢 ${u.label} 異常`);
  });
  L.push("  ── 儲桶壓力 ──");
  config.compressors.tanks.forEach(t=>{
    const val=parseFloat(data.cmpTank?.[t.id]);
    const ok=!isNaN(val)&&val>=t.stdMin&&val<=t.stdMax;
    L.push(`  ${t.label}：${isNaN(val)?"-":val} ${t.unit}  ${isNaN(val)?"":tag(ok)}`);
    if(!isNaN(val)&&!ok) A.push(`📢 ${t.label} 壓力異常（${val}${t.unit}，標準${t.stdMin}~${t.stdMax}）`);
  });

  // ── 水系統 ──
  L.push("\n💧【水系統】");
  const ws=data.waterSystem||{};
  const r1ok=ws.raw1==="有", r2ok=ws.raw2==="有", sfok=ws.softLevel==="正常";
  L.push(`  原水點1：${tag(r1ok)}`);
  L.push(`  原水點2：${tag(r2ok)}`);
  L.push(`  軟水液位：${tag(sfok)}`);
  if(ws.raw1&&!r1ok) A.push("📢 原水點1無供水");
  if(ws.raw2&&!r2ok) A.push("📢 原水點2無供水");
  if(ws.softLevel&&!sfok) A.push("📢 軟水液位異常");

  L.push("  ── RO設備 ──");
  config.ro.forEach(({key,id,hasFreq,prodWarnBelow,pressWarnAbove})=>{
    const prod=parseFloat(data.ro?.[`${id}_prod`]);
    const press=parseFloat(data.ro?.[`${id}_press`]);
    const freq=hasFreq?parseFloat(data.ro?.[`${id}_freq`]):null;
    let row=`  RO-${key}：`;
    row+=`產水量 ${isNaN(prod)?"-":prod} 噸`;
    if(hasFreq) row+=`  輸出頻率 ${isNaN(freq)?"-":freq} Hz`;
    row+=`  第一段壓力 ${isNaN(press)?"-":press} bar`;
    const prodWarn=!isNaN(prod)&&prod<prodWarnBelow;
    const pressWarn=!isNaN(press)&&press>pressWarnAbove;
    if(prodWarn||pressWarn) row+="  ⚠️";
    L.push(row);
    if(prodWarn) A.push(`📢 RO-${key} 產水量偏低（${prod}噸 < ${prodWarnBelow}噸）`);
    if(pressWarn) A.push(`📢 RO-${key} 第一段壓力過高（${press}bar > ${pressWarnAbove}bar）`);
  });

  const t12=parseFloat(ws.tank12);
  const t12ok=!isNaN(t12)&&t12<=30;
  L.push(`  桶槽1+2總量：${isNaN(t12)?"-":t12} 噸 ${isNaN(t12)?"":t12ok?"":"⚠️超量"}`);
  if(!isNaN(t12)&&!t12ok) A.push(`📢 RO桶槽1+2超量（${t12}噸）`);

  const t3v=parseFloat(ws.tank3_val), t3l=ws.tank3_level;
  const t3ok=!isNaN(t3v)&&t3v>=2.0&&t3l!=="LL";
  L.push(`  桶槽3：${isNaN(t3v)?"-":t3v}  液位燈：${t3l||"-"}  ${(isNaN(t3v)&&!t3l)?"":tag(t3ok)}`);
  if((t3l||!isNaN(t3v))&&!t3ok) A.push(`📢 RO桶槽3異常（值:${t3v} 液位:${t3l}）`);

  // ── 製程冰水機 ──
  L.push("\n🧊【製程冰水機】");
  config.processChiller.units.forEach(u=>{
    const inp=parseFloat(data.procChiller?.[u.id+"_in"]);
    const out=parseFloat(data.procChiller?.[u.id+"_out"]);
    const diff=!isNaN(inp)&&!isNaN(out)?Math.abs(inp-out):NaN;
    const inOk=!isNaN(inp)&&inp>=u.inMin&&inp<=u.inMax;
    const outOk=!isNaN(out)&&out>=u.outMin&&out<=u.outMax;
    const diffOk=!isNaN(diff)&&diff<=u.diffMax;
    const ok=inOk&&outOk&&diffOk;
    L.push(`  ${u.label}`);
    L.push(`    進口:${isNaN(inp)?"-":inp}°C（${u.inMin}~${u.inMax}）${isNaN(inp)?"":tag(inOk)}`);
    L.push(`    出口:${isNaN(out)?"-":out}°C（${u.outMin}~${u.outMax}）${isNaN(out)?"":tag(outOk)}`);
    if(!isNaN(diff)) L.push(`    溫差:${diff.toFixed(1)}°C（≤${u.diffMax}）${tag(diffOk)}`);
    if(!isNaN(inp)&&!inOk) A.push(`📢 ${u.label} 進口溫度異常（${inp}°C）`);
    if(!isNaN(out)&&!outOk) A.push(`📢 ${u.label} 出口溫度異常（${out}°C）`);
    if(!isNaN(diff)&&!diffOk) A.push(`📢 ${u.label} 進出口溫差過大（${diff.toFixed(1)}°C > ${u.diffMax}°C）`);
  });

  // ── 冷卻水塔 ──
  L.push("\n🌊【冷卻水塔】");
  L.push(`  空調冷卻水塔：${data.coolingTower?.hvac||"-"}  📷 照片`);
  L.push(`  製程冷卻水塔：${data.coolingTower?.proc||"-"}  📷 照片`);

  // ── 外氣 ──
  L.push("\n💨【外氣機組】");
  config.freshAir.units.forEach(u=>{
    const st=data.freshAir?.[u.id]||"-";
    const ok=st==="運轉中";
    L.push(`  ${u.label}：${st}  ${st==="-"?"":ok?"✅":"⚠️"}  📷`);
    if(st&&st!=="-"&&!ok) A.push(`📢 ${u.label} 未運轉（${st}）`);
  });

  // ── 無塵室 ──
  L.push("\n🏭【無塵室溫濕度】");
  config.cleanrooms.floors.forEach(fl=>{
    L.push(`  ── ${fl.name} ──`);
    fl.rooms.forEach(r=>{
      const t=parseFloat(data.cleanroom?.[r.id+"_temp"]);
      const h=parseFloat(data.cleanroom?.[r.id+"_hum"]);
      const tOk=!isNaN(t)&&(r.tempMin===undefined||t>=r.tempMin)&&t<=r.tempMax;
      const hOk=!isNaN(h)&&h>=r.humMin&&h<=r.humMax;
      const tStd=r.tempMin!==undefined?`${r.tempMin}~${r.tempMax}`:` ≤${r.tempMax}`;
      L.push(`  ${r.name}`);
      L.push(`    溫度:${isNaN(t)?"-":t}°C（${tStd}°C）${isNaN(t)?"":tag(tOk)}`);
      L.push(`    濕度:${isNaN(h)?"-":h}%（${r.humMin}~${r.humMax}%）${isNaN(h)?"":tag(hOk)}`);
      if(!isNaN(t)&&!tOk) A.push(`📢 ${r.name} 溫度異常（${t}°C）`);
      if(!isNaN(h)&&!hOk) A.push(`📢 ${r.name} 濕度異常（${h}%）`);
    });
  });

  L.push("\n━━━━━━━━━━━━━━━━━━━━");
  if(A.length===0){
    L.push("✅ 本次巡檢一切正常");
  } else {
    L.push(`\n🚨【異常通知 ${A.length} 項】`);
    A.forEach((a,i)=>L.push(`  ${i+1}. ${a}`));
  }
  L.push(`\n👤 巡檢人員：${data.inspector||"（未填）"}`);
  if(data.note) L.push(`📝 備註：${data.note}`);

  return { text:L.join("\n"), anomalies:A };
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
function Section({title,icon,children,warn=false}){
  const [open,setOpen]=useState(true);
  return(
    <div style={{...S.section,border:warn?"1px solid #dc2626":"1px solid transparent"}}>
      <button style={{...S.sHdr,background:warn?"#450a0a":"#1e3a5f"}} onClick={()=>setOpen(!open)}>
        <span>{icon} {title} {warn&&"⚠️"}</span>
        <span style={{fontSize:11}}>{open?"▲":"▼"}</span>
      </button>
      {open&&<div style={S.sBody}>{children}</div>}
    </div>
  );
}

function FR({label,children,ok}){
  return(
    <div style={S.fr}>
      <span style={S.frLabel}>{label}</span>
      <div style={S.frInput}>{children}</div>
      {ok!==undefined&&<span style={{...S.badge,background:ok?"#16a34a":"#dc2626"}}>{ok?"正常":"異常"}</span>}
    </div>
  );
}

function Num({value,onChange,unit,placeholder,width=80}){
  return(
    <span style={{display:"flex",alignItems:"center",gap:4}}>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder||"數值"} style={{...S.inp,width}} />
      {unit&&<span style={S.unit}>{unit}</span>}
    </span>
  );
}

function Sel({value,onChange,options}){
  return(
    <select value={value} onChange={e=>onChange(e.target.value)} style={S.sel}>
      <option value="">-- 選擇 --</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function WarnBanner({items}){
  if(!items||!items.length) return null;
  return(
    <div style={S.warnBanner}>
      {items.map((a,i)=><div key={i} style={S.warnItem}>{a}</div>)}
    </div>
  );
}

// ============================================================
// ADMIN PANEL
// ============================================================
function AdminPanel({config,setConfig,onBack}){
  const [tab,setTab]=useState("compressor");
  const [ec,setEc]=useState(JSON.parse(JSON.stringify(config)));

  const save=()=>{setConfig(ec);onBack();};
  const upd=(path,val)=>{
    const next=JSON.parse(JSON.stringify(ec));
    let o=next; const parts=path.split(".");
    parts.slice(0,-1).forEach(p=>o=o[p]);
    o[parts[parts.length-1]]=val;
    setEc(next);
  };

  const addRoom=(fi)=>{
    const next=JSON.parse(JSON.stringify(ec));
    next.cleanrooms.floors[fi].rooms.push({
      id:"cr_"+Date.now(),name:"新房間",tempMax:23,humMin:40,humMax:55
    });setEc(next);
  };
  const delRoom=(fi,ri)=>{
    const next=JSON.parse(JSON.stringify(ec));
    next.cleanrooms.floors[fi].rooms.splice(ri,1);setEc(next);
  };
  const setRoom=(fi,ri,key,val)=>{
    const next=JSON.parse(JSON.stringify(ec));
    const numKeys=["tempMin","tempMax","humMin","humMax"];
    next.cleanrooms.floors[fi].rooms[ri][key]=numKeys.includes(key)?parseFloat(val):val;
    setEc(next);
  };
  const addProcUnit=()=>{
    const next=JSON.parse(JSON.stringify(ec));
    const n=next.processChiller.units.length+1;
    next.processChiller.units.push({id:`proc${n}_${Date.now()}`,label:`製程冰水機 ${n}號`,inMin:9,inMax:11,outMin:6,outMax:8,diffMax:5});
    setEc(next);
  };
  const delProcUnit=(i)=>{
    const next=JSON.parse(JSON.stringify(ec));
    next.processChiller.units.splice(i,1);setEc(next);
  };
  const addCmp=()=>{
    const next=JSON.parse(JSON.stringify(ec));
    const n=next.compressors.units.length+1;
    next.compressors.units.push({id:`cmp${n}_${Date.now()}`,label:`空壓機 ${n}號`});
    setEc(next);
  };
  const delCmp=(i)=>{
    const next=JSON.parse(JSON.stringify(ec));
    next.compressors.units.splice(i,1);setEc(next);
  };
  const addFa=()=>{
    const next=JSON.parse(JSON.stringify(ec));
    const n=next.freshAir.units.length+1;
    next.freshAir.units.push({id:`fa${n}_${Date.now()}`,label:`外氣機組 ${n}號`});
    setEc(next);
  };
  const delFa=(i)=>{
    const next=JSON.parse(JSON.stringify(ec));
    next.freshAir.units.splice(i,1);setEc(next);
  };

  const TABS=[
    {id:"compressor",label:"空壓機"},
    {id:"proc",label:"製程冰水機"},
    {id:"cleanroom",label:"無塵室"},
    {id:"freshair",label:"外氣機組"},
  ];

  return(
    <div style={S.adminWrap}>
      <div style={S.adminHdr}>
        <button onClick={onBack} style={S.ghostBtn}>← 返回巡檢</button>
        <h2 style={{margin:0,color:"#fff",fontSize:16}}>⚙️ 後台管理</h2>
        <button onClick={save} style={S.saveBtn}>💾 儲存</button>
      </div>
      <div style={{display:"flex",background:"#1e293b",padding:"8px 14px",gap:6,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{...S.tabBtn,...(tab===t.id?S.tabAct:{})}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{padding:16}}>

        {tab==="compressor"&&(
          <div>
            <div style={S.aTitle}>🔧 空壓機台數</div>
            {ec.compressors.units.map((u,i)=>(
              <div key={u.id} style={S.aRow}>
                <input value={u.label} onChange={e=>{
                  const next=JSON.parse(JSON.stringify(ec));
                  next.compressors.units[i].label=e.target.value;setEc(next);
                }} style={S.iSm}/>
                <button onClick={()=>delCmp(i)} style={S.delBtn}>✕</button>
              </div>
            ))}
            <button onClick={addCmp} style={S.addBtn}>＋ 新增空壓機</button>

            <div style={{...S.aTitle,marginTop:20}}>🗜️ 儲桶壓力標準</div>
            {ec.compressors.tanks.map((t,i)=>(
              <div key={t.id} style={S.aRow}>
                <span style={{minWidth:120,fontSize:13,color:"#94a3b8"}}>{t.label}</span>
                <input type="number" step="0.1" value={t.stdMin} onChange={e=>{
                  const next=JSON.parse(JSON.stringify(ec));
                  next.compressors.tanks[i].stdMin=parseFloat(e.target.value);setEc(next);
                }} style={S.iXs}/>
                <span style={{color:"#64748b"}}>~</span>
                <input type="number" step="0.1" value={t.stdMax} onChange={e=>{
                  const next=JSON.parse(JSON.stringify(ec));
                  next.compressors.tanks[i].stdMax=parseFloat(e.target.value);setEc(next);
                }} style={S.iXs}/>
                <span style={S.unitLbl}>{t.unit}</span>
              </div>
            ))}
          </div>
        )}

        {tab==="proc"&&(
          <div>
            <div style={S.aTitle}>🧊 製程冰水機</div>
            {ec.processChiller.units.map((u,i)=>(
              <div key={u.id} style={S.aCard}>
                <div style={S.aRow}>
                  <input value={u.label} onChange={e=>{
                    const next=JSON.parse(JSON.stringify(ec));
                    next.processChiller.units[i].label=e.target.value;setEc(next);
                  }} style={S.iSm}/>
                  <button onClick={()=>delProcUnit(i)} style={S.delBtn}>✕ 刪除</button>
                </div>
                {[
                  {k:"inMin",k2:"inMax",label:"進口溫度範圍",u:"°C"},
                  {k:"outMin",k2:"outMax",label:"出口溫度範圍",u:"°C"},
                ].map(row=>(
                  <div key={row.k} style={S.aRow}>
                    <span style={{minWidth:100,fontSize:13,color:"#94a3b8"}}>{row.label}</span>
                    <input type="number" value={u[row.k]} onChange={e=>{
                      const next=JSON.parse(JSON.stringify(ec));
                      next.processChiller.units[i][row.k]=parseFloat(e.target.value);setEc(next);
                    }} style={S.iXs}/>
                    <span style={{color:"#64748b"}}>~</span>
                    <input type="number" value={u[row.k2]} onChange={e=>{
                      const next=JSON.parse(JSON.stringify(ec));
                      next.processChiller.units[i][row.k2]=parseFloat(e.target.value);setEc(next);
                    }} style={S.iXs}/>
                    <span style={S.unitLbl}>{row.u}</span>
                  </div>
                ))}
                <div style={S.aRow}>
                  <span style={{minWidth:100,fontSize:13,color:"#94a3b8"}}>最大溫差</span>
                  <input type="number" value={u.diffMax} onChange={e=>{
                    const next=JSON.parse(JSON.stringify(ec));
                    next.processChiller.units[i].diffMax=parseFloat(e.target.value);setEc(next);
                  }} style={S.iXs}/>
                  <span style={S.unitLbl}>°C</span>
                </div>
              </div>
            ))}
            <button onClick={addProcUnit} style={S.addBtn}>＋ 新增製程冰水機</button>
          </div>
        )}

        {tab==="cleanroom"&&(
          <div>
            <div style={S.aTitle}>🏭 無塵室管理</div>
            {ec.cleanrooms.floors.map((fl,fi)=>(
              <div key={fl.id} style={{marginBottom:20}}>
                <div style={{color:"#60a5fa",fontWeight:700,marginBottom:8}}>📍 {fl.name}</div>
                {fl.rooms.map((r,ri)=>(
                  <div key={r.id} style={S.aCard}>
                    <div style={S.aRow}>
                      <input value={r.name} onChange={e=>setRoom(fi,ri,"name",e.target.value)} style={S.iMd}/>
                      <button onClick={()=>delRoom(fi,ri)} style={S.delBtn}>✕</button>
                    </div>
                    <div style={S.aRow}>
                      <span style={{minWidth:90,fontSize:13,color:"#94a3b8"}}>溫度範圍</span>
                      {r.tempMin!==undefined?(
                        <>
                          <input type="number" step="0.5" value={r.tempMin||""} onChange={e=>setRoom(fi,ri,"tempMin",e.target.value)} style={S.iXs}/>
                          <span style={{color:"#64748b"}}>~</span>
                        </>
                      ):<span style={{fontSize:12,color:"#64748b",marginRight:4}}>≤</span>}
                      <input type="number" step="0.5" value={r.tempMax} onChange={e=>setRoom(fi,ri,"tempMax",e.target.value)} style={S.iXs}/>
                      <span style={S.unitLbl}>°C</span>
                    </div>
                    <div style={S.aRow}>
                      <span style={{minWidth:90,fontSize:13,color:"#94a3b8"}}>濕度範圍</span>
                      <input type="number" value={r.humMin} onChange={e=>setRoom(fi,ri,"humMin",e.target.value)} style={S.iXs}/>
                      <span style={{color:"#64748b"}}>~</span>
                      <input type="number" value={r.humMax} onChange={e=>setRoom(fi,ri,"humMax",e.target.value)} style={S.iXs}/>
                      <span style={S.unitLbl}>%</span>
                    </div>
                  </div>
                ))}
                <button onClick={()=>addRoom(fi)} style={S.addBtn}>＋ 新增房間</button>
              </div>
            ))}
          </div>
        )}

        {tab==="freshair"&&(
          <div>
            <div style={S.aTitle}>💨 外氣機組</div>
            {ec.freshAir.units.map((u,i)=>(
              <div key={u.id} style={S.aRow}>
                <input value={u.label} onChange={e=>{
                  const next=JSON.parse(JSON.stringify(ec));
                  next.freshAir.units[i].label=e.target.value;setEc(next);
                }} style={S.iSm}/>
                <button onClick={()=>delFa(i)} style={S.delBtn}>✕</button>
              </div>
            ))}
            <button onClick={addFa} style={S.addBtn}>＋ 新增外氣機組</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App(){
  const [config,setConfig]=useState(DEFAULT_CONFIG);
  const [view,setView]=useState("form");
  const [data,setData]=useState({
    inspector:"",note:"",
    cmp:{},cmpTank:{},waterSystem:{},ro:{},
    procChiller:{},coolingTower:{},freshAir:{},cleanroom:{},
  });
  const [result,setResult]=useState(null);
  const [copied,setCopied]=useState(false);
  const [liveWarns,setLiveWarns]=useState([]);

  const set=(section,key,val)=>{
    setData(prev=>{
      const next={...prev,[section]:{...prev[section],[key]:val}};
      // live warnings
      const warns=[];
      config.ro.forEach(({key:k,id,prodWarnBelow,pressWarnAbove})=>{
        const prod=parseFloat(next.ro?.[`${id}_prod`]);
        const press=parseFloat(next.ro?.[`${id}_press`]);
        if(!isNaN(prod)&&prod<prodWarnBelow) warns.push(`⚠️ RO-${k} 產水量偏低（${prod}噸）`);
        if(!isNaN(press)&&press>pressWarnAbove) warns.push(`⚠️ RO-${k} 第一段壓力過高（${press}bar）`);
      });
      config.compressors.tanks.forEach(t=>{
        const v=parseFloat(next.cmpTank?.[t.id]);
        if(!isNaN(v)&&(v<t.stdMin||v>t.stdMax)) warns.push(`⚠️ ${t.label} 壓力異常（${v}${t.unit}）`);
      });
      config.processChiller.units.forEach(u=>{
        const inp=parseFloat(next.procChiller?.[u.id+"_in"]);
        const out=parseFloat(next.procChiller?.[u.id+"_out"]);
        if(!isNaN(inp)&&(inp<u.inMin||inp>u.inMax)) warns.push(`⚠️ ${u.label} 進口溫度（${inp}°C）`);
        if(!isNaN(out)&&(out<u.outMin||out>u.outMax)) warns.push(`⚠️ ${u.label} 出口溫度（${out}°C）`);
        if(!isNaN(inp)&&!isNaN(out)&&Math.abs(inp-out)>u.diffMax) warns.push(`⚠️ ${u.label} 溫差過大`);
      });
      setLiveWarns(warns);
      return next;
    });
  };

  const submit=()=>{
    const r=generateMsg(data,config);
    setResult(r);setView("result");
  };
  const copy=()=>{
    navigator.clipboard.writeText(result.text).then(()=>{
      setCopied(true);setTimeout(()=>setCopied(false),2500);
    });
  };

  if(view==="admin") return <AdminPanel config={config} setConfig={setConfig} onBack={()=>setView("form")}/>;

  if(view==="result") return(
    <div style={S.wrap}>
      <div style={S.hdr}>
        <div style={S.hdrTop}>
          <button onClick={()=>setView("form")} style={S.ghostBtn}>← 返回修改</button>
          <span style={{color:"#fff",fontWeight:700}}>巡檢報告</span>
          <div style={{width:70}}/>
        </div>
      </div>
      <div style={S.body}>
        {result.anomalies.length>0?(
          <div style={S.alertBox}>
            <div style={{color:"#f87171",fontWeight:700,marginBottom:6}}>🚨 發現 {result.anomalies.length} 項異常 — 請立即處理</div>
            {result.anomalies.map((a,i)=><div key={i} style={{color:"#fca5a5",fontSize:13,padding:"2px 0"}}>{a}</div>)}
          </div>
        ):(
          <div style={S.okBox}>✅ 本次巡檢一切正常！</div>
        )}
        <div style={S.msgBox}>
          <pre style={{color:"#e2e8f0",fontSize:12.5,whiteSpace:"pre-wrap",fontFamily:"monospace",margin:0}}>{result.text}</pre>
        </div>
        <button onClick={copy} style={{...S.submitBtn,background:copied?"linear-gradient(135deg,#16a34a,#15803d)":"linear-gradient(135deg,#2563eb,#1d4ed8)"}}>
          {copied?"✅ 已複製！貼到 LINE 群組":"📋 複製 LINE 訊息"}
        </button>
        <div style={{color:"#475569",fontSize:12,textAlign:"center",marginTop:8}}>
          複製後至 LINE 群組貼上傳送
        </div>
        <div style={{height:24}}/>
      </div>
    </div>
  );

  // ── FORM ──
  return(
    <div style={S.wrap}>
      <div style={S.hdr}>
        <div style={S.hdrTop}>
          <div style={{...S.badge,background:"#f59e0b",color:"#000",fontSize:12}}>{getShift()}</div>
          <span style={{color:"#fff",fontWeight:700,fontSize:16,letterSpacing:0.5}}>設備巡檢系統</span>
          <button onClick={()=>setView("admin")} style={S.adminBtn}>⚙️ 後台</button>
        </div>
        <div style={{fontSize:11,color:"#93c5fd",textAlign:"center",marginTop:4}}>{getNow()}</div>
      </div>

      {liveWarns.length>0&&(
        <div style={S.liveBanner}>
          <div style={{color:"#fde68a",fontWeight:700,fontSize:13,marginBottom:4}}>📢 即時警告</div>
          {liveWarns.map((w,i)=><div key={i} style={{fontSize:12,color:"#fca5a5"}}>{w}</div>)}
        </div>
      )}

      <div style={S.body}>
        {/* 巡檢人員 */}
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#1e293b",borderRadius:10,padding:"10px 14px",marginBottom:10}}>
          <span style={{color:"#94a3b8",fontSize:13,minWidth:70}}>👤 巡檢人員</span>
          <input value={data.inspector} onChange={e=>setData(p=>({...p,inspector:e.target.value}))}
            placeholder="請輸入姓名" style={{...S.inp,flex:1}}/>
        </div>

        {/* ── 空壓設備 ── */}
        <Section title="空壓設備" icon="🔧">
          <div style={S.subTtl}>空壓機台</div>
          {config.compressors.units.map(u=>{
            const d=data.cmp?.[u.id]||{};
            const ok=d.normal==="正常";
            return(
              <div key={u.id} style={S.cmpBlock}>
                <div style={{color:"#60a5fa",fontWeight:600,fontSize:13,marginBottom:6}}>{u.label}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <div style={S.cmpField}>
                    <span style={S.frLabel}>溫度</span>
                    <Num value={d.temp||""} onChange={v=>set("cmp",u.id,{...d,temp:v})} unit="°C"/>
                  </div>
                  <div style={S.cmpField}>
                    <span style={S.frLabel}>限高溫度</span>
                    <Num value={d.highTemp||""} onChange={v=>set("cmp",u.id,{...d,highTemp:v})} unit="°C"/>
                  </div>
                  <div style={S.cmpField}>
                    <span style={S.frLabel}>狀態</span>
                    <Sel value={d.normal||""} onChange={v=>set("cmp",u.id,{...d,normal:v})} options={["正常","異常"]}/>
                    {d.normal&&<span style={{...S.badge,background:ok?"#16a34a":"#dc2626",fontSize:11}}>{ok?"✓":"✗"}</span>}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={S.subTtl}>儲桶壓力</div>
          {config.compressors.tanks.map(t=>{
            const val=parseFloat(data.cmpTank?.[t.id]);
            const ok=!isNaN(val)&&val>=t.stdMin&&val<=t.stdMax;
            return(
              <FR key={t.id} label={t.label} ok={isNaN(val)?undefined:ok}>
                <Num value={data.cmpTank?.[t.id]||""} onChange={v=>set("cmpTank",t.id,v)} unit={t.unit}/>
                <span style={S.stdTxt}>標準 {t.stdMin}~{t.stdMax}</span>
              </FR>
            );
          })}
        </Section>

        {/* ── 水系統 ── */}
        <Section title="水系統" icon="💧">
          <div style={S.subTtl}>原水 / 軟水</div>
          {[
            {id:"raw1",label:"原水點1供水",opts:["有","無"],okVal:"有"},
            {id:"raw2",label:"原水點2供水",opts:["有","無"],okVal:"有"},
            {id:"softLevel",label:"軟水液位",opts:["正常","異常"],okVal:"正常"},
          ].map(f=>{
            const v=data.waterSystem?.[f.id];
            return(
              <FR key={f.id} label={f.label} ok={v?v===f.okVal:undefined}>
                <Sel value={v||""} onChange={vv=>set("waterSystem",f.id,vv)} options={f.opts}/>
              </FR>
            );
          })}

          <div style={S.subTtl}>RO設備</div>
          {config.ro.map(({key:k,id,hasFreq,prodWarnBelow,pressWarnAbove})=>{
            const prod=parseFloat(data.ro?.[`${id}_prod`]);
            const press=parseFloat(data.ro?.[`${id}_press`]);
            const prodWarn=!isNaN(prod)&&prod<prodWarnBelow;
            const pressWarn=!isNaN(press)&&press>pressWarnAbove;
            return(
              <div key={id} style={{...S.roBlock,...((prodWarn||pressWarn)?{border:"1px solid #dc2626"}:{})}}>
                <div style={{color:prodWarn||pressWarn?"#f87171":"#60a5fa",fontWeight:700,fontSize:13,marginBottom:6}}>
                  RO-{k} {(prodWarn||pressWarn)&&"⚠️"}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <div style={S.roField}>
                    <span style={S.roLbl}>產水量</span>
                    <Num value={data.ro?.[`${id}_prod`]||""} onChange={v=>set("ro",`${id}_prod`,v)} unit="噸" width={70}/>
                    {prodWarn&&<span style={{color:"#f87171",fontSize:11}}>⚠️&lt;{prodWarnBelow}</span>}
                  </div>
                  <div style={S.roField}>
                    <span style={S.roLbl}>第一段壓力</span>
                    <Num value={data.ro?.[`${id}_press`]||""} onChange={v=>set("ro",`${id}_press`,v)} unit="bar" width={70}/>
                    {pressWarn&&<span style={{color:"#f87171",fontSize:11}}>⚠️&gt;{pressWarnAbove}</span>}
                  </div>
                  {hasFreq&&(
                    <div style={S.roField}>
                      <span style={S.roLbl}>輸出頻率</span>
                      <Num value={data.ro?.[`${id}_freq`]||""} onChange={v=>set("ro",`${id}_freq`,v)} unit="Hz" width={70}/>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={S.subTtl}>RO 桶槽</div>
          <FR label="桶槽 1+2 總量">
            <Num value={data.waterSystem?.tank12||""} onChange={v=>set("waterSystem","tank12",v)} unit="噸" placeholder="最高30噸"/>
          </FR>
          <div style={S.fr}>
            <span style={S.frLabel}>桶槽 3</span>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <Num value={data.waterSystem?.tank3_val||""} onChange={v=>set("waterSystem","tank3_val",v)} unit="" placeholder="數值"/>
              <Sel value={data.waterSystem?.tank3_level||""} onChange={v=>set("waterSystem","tank3_level",v)} options={["H","L","LL"]}/>
              {(data.waterSystem?.tank3_val||data.waterSystem?.tank3_level)&&(()=>{
                const v=parseFloat(data.waterSystem?.tank3_val);
                const l=data.waterSystem?.tank3_level;
                const ok=!isNaN(v)&&v>=2.0&&l!=="LL";
                return<span style={{...S.badge,background:ok?"#16a34a":"#dc2626"}}>{ok?"正常":"異常"}</span>;
              })()}
            </div>
          </div>
          <div style={{fontSize:11,color:"#f59e0b",padding:"2px 0 6px"}}>⚠️ 數值&lt;2.00 或液位LL → 異常</div>
        </Section>

        {/* ── 製程冰水機 ── */}
        <Section title="製程冰水機" icon="🧊">
          {config.processChiller.units.map(u=>{
            const inp=parseFloat(data.procChiller?.[u.id+"_in"]);
            const out=parseFloat(data.procChiller?.[u.id+"_out"]);
            const diff=!isNaN(inp)&&!isNaN(out)?Math.abs(inp-out):NaN;
            const inOk=!isNaN(inp)&&inp>=u.inMin&&inp<=u.inMax;
            const outOk=!isNaN(out)&&out>=u.outMin&&out<=u.outMax;
            const diffOk=!isNaN(diff)&&diff<=u.diffMax;
            const anyWarn=(!isNaN(inp)&&!inOk)||(!isNaN(out)&&!outOk)||(!isNaN(diff)&&!diffOk);
            return(
              <div key={u.id} style={{...S.roBlock,...(anyWarn?{border:"1px solid #dc2626"}:{})}}>
                <div style={{color:anyWarn?"#f87171":"#60a5fa",fontWeight:700,fontSize:13,marginBottom:8}}>
                  {u.label} {anyWarn&&"⚠️"}
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  <div style={S.roField}>
                    <span style={S.roLbl}>進口溫度</span>
                    <Num value={data.procChiller?.[u.id+"_in"]||""} onChange={v=>set("procChiller",u.id+"_in",v)} unit="°C" width={70}/>
                    <span style={S.stdTxt}>{u.inMin}~{u.inMax}°C</span>
                    {!isNaN(inp)&&<span style={{color:inOk?"#16a34a":"#dc2626",fontSize:12}}>{inOk?"✓":"✗"}</span>}
                  </div>
                  <div style={S.roField}>
                    <span style={S.roLbl}>出口溫度</span>
                    <Num value={data.procChiller?.[u.id+"_out"]||""} onChange={v=>set("procChiller",u.id+"_out",v)} unit="°C" width={70}/>
                    <span style={S.stdTxt}>{u.outMin}~{u.outMax}°C</span>
                    {!isNaN(out)&&<span style={{color:outOk?"#16a34a":"#dc2626",fontSize:12}}>{outOk?"✓":"✗"}</span>}
                  </div>
                  {!isNaN(diff)&&(
                    <div style={S.roField}>
                      <span style={S.roLbl}>溫差</span>
                      <span style={{...S.badge,background:diffOk?"#16a34a":"#dc2626"}}>{diff.toFixed(1)}°C</span>
                      <span style={S.stdTxt}>≤{u.diffMax}°C</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </Section>

        {/* ── 冷卻水塔 ── */}
        <Section title="冷卻水塔" icon="🌊">
          {[{id:"hvac",label:"空調冷卻水塔"},{id:"proc",label:"製程冷卻水塔"}].map(t=>(
            <div key={t.id}>
              <FR label={t.label}>
                <Sel value={data.coolingTower?.[t.id]||""} onChange={v=>set("coolingTower",t.id,v)} options={["正常","偏低","偏高","異常"]}/>
              </FR>
              <div style={{fontSize:11,color:"#7c3aed",padding:"2px 0 6px"}}>📷 請附上水位照片</div>
            </div>
          ))}
        </Section>

        {/* ── 外氣機組 ── */}
        <Section title="外氣機組" icon="💨">
          {config.freshAir.units.map(u=>{
            const st=data.freshAir?.[u.id];
            const ok=st==="運轉中";
            return(
              <div key={u.id}>
                <FR label={u.label} ok={st?ok:undefined}>
                  <Sel value={st||""} onChange={v=>set("freshAir",u.id,v)} options={["運轉中","停機","異常"]}/>
                </FR>
                <div style={{fontSize:11,color:"#7c3aed",padding:"2px 0 6px"}}>📷 請附上運轉燈照片</div>
              </div>
            );
          })}
        </Section>

        {/* ── 無塵室 ── */}
        <Section title="無塵室溫濕度" icon="🏭">
          {config.cleanrooms.floors.map(fl=>(
            <div key={fl.id}>
              <div style={S.subTtl}>📍 {fl.name}</div>
              {fl.rooms.map(r=>{
                const t=parseFloat(data.cleanroom?.[r.id+"_temp"]);
                const h=parseFloat(data.cleanroom?.[r.id+"_hum"]);
                const tOk=!isNaN(t)&&(r.tempMin===undefined||t>=r.tempMin)&&t<=r.tempMax;
                const hOk=!isNaN(h)&&h>=r.humMin&&h<=r.humMax;
                const filled=!isNaN(t)||!isNaN(h);
                const tStd=r.tempMin!==undefined?`${r.tempMin}~${r.tempMax}°C`:`≤${r.tempMax}°C`;
                return(
                  <div key={r.id} style={S.crBlock}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{color:"#60a5fa",fontWeight:600,fontSize:13}}>{r.name}</span>
                      {filled&&<span style={{...S.badge,background:(tOk&&hOk)?"#16a34a":"#dc2626"}}>
                        {(tOk&&hOk)?"正常":"異常"}
                      </span>}
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <div style={S.crField}>
                        <span style={S.roLbl}>溫度</span>
                        <Num value={data.cleanroom?.[r.id+"_temp"]||""} onChange={v=>set("cleanroom",r.id+"_temp",v)} unit="°C" width={70}/>
                        <span style={S.stdTxt}>{tStd}</span>
                        {!isNaN(t)&&<span style={{color:tOk?"#16a34a":"#dc2626",fontSize:11}}>{tOk?"✓":"✗"}</span>}
                      </div>
                      <div style={S.crField}>
                        <span style={S.roLbl}>濕度</span>
                        <Num value={data.cleanroom?.[r.id+"_hum"]||""} onChange={v=>set("cleanroom",r.id+"_hum",v)} unit="%" width={70}/>
                        <span style={S.stdTxt}>{r.humMin}~{r.humMax}%</span>
                        {!isNaN(h)&&<span style={{color:hOk?"#16a34a":"#dc2626",fontSize:11}}>{hOk?"✓":"✗"}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Section>

        {/* 備註 */}
        <div style={S.section}>
          <div style={{background:"#1e3a5f",color:"#93c5fd",padding:"10px 14px",fontSize:14,fontWeight:600}}>📝 備註</div>
          <div style={{padding:10}}>
            <textarea value={data.note} onChange={e=>setData(p=>({...p,note:e.target.value}))}
              placeholder="填寫備註或特殊情況..." rows={3}
              style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",padding:"8px 10px",fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
          </div>
        </div>

        <button onClick={submit} style={S.submitBtn}>
          📤 送出巡檢 → 產生 LINE 訊息
        </button>
        <div style={{height:32}}/>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const S={
  wrap:{minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'Noto Sans TC',sans-serif,system-ui",fontSize:14},
  hdr:{background:"linear-gradient(135deg,#1e40af,#0f2a5e)",padding:"14px 16px 10px",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 12px rgba(0,0,0,.5)"},
  hdrTop:{display:"flex",alignItems:"center",justifyContent:"space-between"},
  adminBtn:{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:13},
  ghostBtn:{background:"rgba(255,255,255,.1)",border:"none",color:"#93c5fd",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13},
  liveBanner:{background:"#450a0a",borderLeft:"4px solid #dc2626",padding:"10px 14px",margin:"0 0 0 0"},
  body:{padding:"12px 14px",maxWidth:640,margin:"0 auto"},
  section:{background:"#1e293b",borderRadius:12,marginBottom:10,overflow:"hidden"},
  sHdr:{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",border:"none",color:"#93c5fd",padding:"10px 14px",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left"},
  sBody:{padding:"10px 12px"},
  subTtl:{color:"#475569",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1,margin:"10px 0 6px"},
  fr:{display:"flex",alignItems:"center",padding:"6px 2px",borderBottom:"1px solid #0f172a",flexWrap:"wrap",gap:6},
  frLabel:{minWidth:110,fontSize:13,color:"#94a3b8"},
  frInput:{flex:1,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},
  badge:{borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700,color:"#fff",whiteSpace:"nowrap"},
  inp:{background:"#0f172a",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"5px 7px",fontSize:13},
  sel:{background:"#0f172a",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"5px 7px",fontSize:13},
  unit:{color:"#64748b",fontSize:12},
  stdTxt:{color:"#475569",fontSize:11},
  cmpBlock:{background:"#0f172a",borderRadius:8,padding:"8px 10px",marginBottom:8},
  cmpField:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},
  roBlock:{background:"#0f172a",borderRadius:8,padding:"8px 10px",marginBottom:8,border:"1px solid transparent"},
  roField:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},
  roLbl:{fontSize:12,color:"#64748b",whiteSpace:"nowrap"},
  crBlock:{background:"#0f172a",borderRadius:8,padding:"8px 10px",marginBottom:8},
  crField:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"},
  alertBox:{background:"#450a0a",border:"1px solid #dc2626",borderRadius:10,padding:"12px 14px",marginBottom:12},
  okBox:{background:"#052e16",border:"1px solid #16a34a",borderRadius:10,padding:"12px 14px",marginBottom:12,color:"#4ade80",fontWeight:700,fontSize:14,textAlign:"center"},
  msgBox:{background:"#0f172a",borderRadius:10,padding:"12px",marginBottom:12,maxHeight:"55vh",overflow:"auto"},
  submitBtn:{width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",color:"#fff",borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:1,boxShadow:"0 4px 16px rgba(37,99,235,.4)"},
  // admin
  adminWrap:{minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"sans-serif"},
  adminHdr:{background:"#1e3a5f",padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"},
  saveBtn:{background:"#16a34a",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:700},
  tabBtn:{background:"#0f172a",border:"none",color:"#94a3b8",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13},
  tabAct:{background:"#2563eb",color:"#fff"},
  aTitle:{color:"#93c5fd",fontWeight:700,fontSize:14,margin:"0 0 10px"},
  aRow:{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"},
  aCard:{background:"#1e293b",borderRadius:10,padding:"12px",marginBottom:10},
  iSm:{background:"#0f172a",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"5px 8px",fontSize:13,width:160},
  iMd:{background:"#0f172a",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"5px 8px",fontSize:13,width:200},
  iXs:{background:"#0f172a",border:"1px solid #334155",borderRadius:6,color:"#e2e8f0",padding:"5px 6px",fontSize:13,width:60},
  unitLbl:{fontSize:12,color:"#64748b"},
  addBtn:{background:"#1e3a5f",border:"1px dashed #3b82f6",color:"#60a5fa",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13},
  delBtn:{background:"#450a0a",border:"none",color:"#f87171",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12},
};
