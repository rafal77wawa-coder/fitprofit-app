import { useState, useRef, useCallback, useEffect } from "react";

/* Close-on-Escape helper for modal / overlay components.
   onClose is kept in a ref so the listener is attached only once. */
function useEscClose(onClose){
  var ref = useRef(onClose);
  ref.current = onClose;
  useEffect(function(){
    function h(e){ if(e.key === "Escape" && ref.current) ref.current(); }
    window.addEventListener("keydown", h);
    return function(){ window.removeEventListener("keydown", h); };
  }, []);
}

/* ─────────────────────────────────────────
   VANITYSTYLE NEXT — Design System
   bg:      #F5F5F5 / white cards
   navy:    #181C33
   blue:    #0C5093  (FitProfit)
   red:     #B31319  (FitSport)
   text:    #111313
   grey:    #9FA1A6
   frame:   375 × 812
───────────────────────────────────────── */
const T = {
  bg:       "#F5F5F5",
  card:     "#FFFFFF",
  navy:     "#181C33",
  navyMid:  "#2D3468",
  blue:     "#0C5093",
  red:      "#B31319",
  text:     "#111313",
  grey:     "#9FA1A6",
  greyLt:   "#E8E8E8",
  greyBg:   "#F0F0F0",
  border:   "#EBEBEB",
};

/* ─── ACTIVY SCORING ─────────────────── */
/* Adres API panelu administracyjnego. Zmień, jeśli backend stoi gdzie indziej. */
const API_BASE = "https://fitprofit-admin.onrender.com";

let LIM = 100;   /* dzienny limit pkt — nadpisywany konfiguracją z panelu */
const MET = {yoga:5,swim:8,fitness:7,crossfit:9,team:7,pilates:5,tennis:7,dance:5,climb:8};

/* Reguły punktacji. Wartości domyślne = fallback, gdy API niedostępne;
   nadpisywane konfiguracją pobraną z panelu przez loadConfig(). */
const SCORE = {
  foot:  {ppu:6,   min:1.5, bonus:10, bonusMax:2, interval:30, limit:100},
  wheel: {ppu:2,   min:1.5, bonus:10, bonusMax:2, interval:0,  limit:100},
  ex:    {ppu:1,                                               limit:100},
  step:  {ppu:1.6, bonusAt:7500, bonus:10,                     limit:100},
  commute: 25,
};

function sfoot(km,dc){var c=SCORE.foot;return km<c.min?0:Math.min(c.limit,Math.round(c.ppu*km)+(dc<c.bonusMax?c.bonus:0));}
function swheel(km,dc,com){var c=SCORE.wheel;return km<c.min?0:Math.min(c.limit,Math.round(c.ppu*km)+(dc<c.bonusMax?c.bonus:0)+(com?SCORE.commute:0));}
function sex(mk,mn){var c=SCORE.ex;return Math.min(c.limit,Math.round((MET[mk]||6)*mn/10*c.ppu));}
function sstep(s){var c=SCORE.step;return Math.min(c.limit,Math.round(s/1000*c.ppu)+(s>=c.bonusAt?c.bonus:0));}

/* Opis kategorii w oknie „Dodaj aktywność" — generowany z aktualnej konfiguracji. */
function catSub(id){
  var c=SCORE[id];
  if(id==="foot")  return c.ppu+" pkt za km · min "+c.min+" km";
  if(id==="wheel") return c.ppu+" pkt za km · dojazd +"+SCORE.commute+" pkt";
  if(id==="ex")    return "MET · zdjęcie wymagane";
  if(id==="phone") return "Aktywności GPS zsynchronizowane";
  return "";
}

/* Pobiera konfigurację wyzwania z panelu i nadpisuje wartości domyślne.
   Nie rzuca wyjątków — przy błędzie aplikacja działa na wartościach domyślnych. */
async function loadConfig(){
  try{
    var r = await fetch(API_BASE+"/api/app/config?contest=wyzwanie-vs");
    if(!r.ok) return false;
    var cfg = await r.json();
    (cfg.scoring||[]).forEach(function(s){
      var c = SCORE[s.category];
      if(!c) return;
      c.ppu   = Number(s.points_per_unit);
      c.limit = Number(s.daily_point_limit);
      if(s.category==="foot"||s.category==="wheel"){
        c.min      = Number(s.min_threshold);
        c.bonus    = Number(s.fixed_bonus);
        c.bonusMax = Number(s.bonus_max_per_day);
        c.interval = Number(s.bonus_min_interval_min);
      }
      if(s.category==="step"){
        c.bonus = Number(s.fixed_bonus);
        if(Number(s.step_goal)>0) STEP_GOAL = Number(s.step_goal);
      }
    });
    if(SCORE.foot.limit) LIM = SCORE.foot.limit;
    if(cfg.eko && cfg.eko.commute_bonus!=null) SCORE.commute = Number(cfg.eko.commute_bonus);
    if(cfg.charity){
      if(Number(cfg.charity.target_amount)>0) CHARITY_GOAL = Number(cfg.charity.target_amount);
      if(cfg.charity.name)        CHARITY.name = cfg.charity.name;
      if(cfg.charity.description) CHARITY.desc = cfg.charity.description;
      if(cfg.charity.image_url)   CHARITY.img  = cfg.charity.image_url;
    }
    if(cfg.branding && cfg.branding.logo_url) BRANDING_LOGO = cfg.branding.logo_url;
    if(cfg.join){
      JOIN.fairplay = Number(cfg.join.fairplay_screen)===1 ? 1 : 0;
      JOIN.regulationsUrl = cfg.join.regulations_url || "";
    }
    if(Array.isArray(cfg.leaderboard) && cfg.leaderboard.length){
      OTHERS = cfg.leaderboard.map(function(r,i){
        var parts=String(r.name||"").trim().split(/\s+/);
        var ini=(parts[0]?parts[0].charAt(0):"")+(parts[1]?parts[1].charAt(0):"");
        return {
          id: 1000+i,
          name: r.name || "",
          ava: ini.toUpperCase() || "?",
          pts: Number(r.points)||0,
          co: MY_CO,
        };
      });
    }
    if(Array.isArray(cfg.rewards) && cfg.rewards.length){
      REW = cfg.rewards.map(function(r,i){
        var sk = REW_SKINS[i % REW_SKINS.length];
        return {
          icon:  r.icon || "🎁",
          name:  r.name || "",
          sub:   r.description || "",
          cost:  Number(r.cost) || 0,
          img:   r.image_url || "",
          codes: String(r.codes||"").split(/[\r\n,;]+/).map(function(s){return s.trim();}).filter(Boolean),
          col:   sk.col,
          g:     sk.g,
        };
      });
    }
    if(Array.isArray(cfg.infoPages)){
      INFO_PAGES = cfg.infoPages.filter(function(pg){
        return pg && String(pg.content||"").trim();
      });
    }
    return true;
  }catch(e){
    return false;
  }
}
function pbonus(s){return [3,7,14,21].includes(s)?50:0;}
function pnext(s){var m=[3,7,14,21];for(var i=0;i<m.length;i++){if(s<m[i])return m[i];}return s+(21-s%21);}
function medal(i){return i===0?"#F5A623":i===1?"#9B9B9B":i===2?"#C87820":T.grey;}
function initialsOf(name){
  var parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  if(parts.length>=2) return (parts[0].charAt(0)+parts[1].charAt(0)).toUpperCase();
  return (parts[0]||"?").slice(0,2).toUpperCase();
}

/* ─── GLOBAL CSS ─────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{display:none}
  body{font-family:'Inter',system-ui,sans-serif}
  .scr{animation:sIn .25s cubic-bezier(.22,1,.36,1) both}
  .mdl{animation:mUp .28s cubic-bezier(.22,1,.36,1) both}
  .tst{animation:tIn .3s  cubic-bezier(.22,1,.36,1) both}
  .pop{animation:pop .35s cubic-bezier(.22,1,.36,1) both}
  .ni {animation:nI  .4s  cubic-bezier(.22,1,.36,1) both}
  @keyframes sIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes mUp{from{opacity:0;transform:translateY(100px)}to{opacity:1;transform:translateY(0)}}
  @keyframes tIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pop{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}
  @keyframes nI {from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
  .tap{cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s,opacity .12s}
  .tap:active{transform:scale(0.96)!important;opacity:.75}
  .hs{display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .hs::-webkit-scrollbar{display:none}
`;

/* ─── DATA ───────────────────────────── */
const MY_CO = "techcorp";
const COS = {
  techcorp:  {name:"VanityStyle Sp. z o.o.",   icon:"VS"},
  buildco:   {name:"BuildCo Group",     icon:"🏗"},
  medigroup: {name:"MediGroup SA",      icon:"🏥"},
  financehub:{name:"FinanceHub",        icon:"💰"},
  retailpro: {name:"RetailPro",         icon:"🛍"},
  construx:  {name:"Construx",          icon:"🔧"},
};

/* Anonimizacja firm w rankingu „Wszyscy" — maska z 3-4 pierwszych liter nazwy.
   Skaluje się do tysięcy firm w grywalizacji (bez listy aliasów). */
const CO_PALETTE = ["#2E6FD9","#2E9E5B","#E0922A","#C8324A","#8A4FC8","#0E8C8C","#D1568A","#4A5BB8"];
function coMask(id){
  var nm=String((COS[id]&&COS[id].name)||id).trim();
  var k=nm.length>=4?4:3;
  return nm.slice(0,k)+"•••";
}
function coHash(id){ var s=String(id),h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
function coLabel(id){ return id===MY_CO ? COS[id].name : coMask(id); }
function coShort(id){ return id===MY_CO ? COS[id].name.split(" ")[0] : coMask(id); }
function coDot(id){ return id===MY_CO ? T.navy : CO_PALETTE[coHash(id)%CO_PALETTE.length]; }
/* Ranking — wartości domyślne; nadpisywane uczestnikami z panelu przez loadConfig(). */
let OTHERS = [
  {id:1,name:"Anna W.",   ava:"AW",pts:4821,co:"techcorp"},
  {id:2,name:"Piotr M.",  ava:"PM",pts:4103,co:"buildco"},
  {id:4,name:"Julia S.",  ava:"JS",pts:3611,co:"medigroup"},
  {id:5,name:"Tomasz R.", ava:"TR",pts:3204,co:"buildco"},
  {id:6,name:"Karolina P.",ava:"KP",pts:2998,co:"techcorp"},
  {id:7,name:"Michal B.", ava:"MB",pts:2744,co:"financehub"},
  {id:8,name:"Zofia K.",  ava:"ZK",pts:2502,co:"medigroup"},
  {id:9,name:"Adam S.",   ava:"AS",pts:2341,co:"retailpro"},
  {id:10,name:"Ewa M.",   ava:"EM",pts:2108,co:"financehub"},
  {id:11,name:"Bartosz W.",ava:"BW",pts:1988,co:"construx"},
];
const CATS = [
  {id:"foot", icon:"🏃",label:"Na nogach",  sub:"6 pkt za km · min 1.5 km",     col:T.blue},
  {id:"wheel",icon:"🚴",label:"Na kołach",  sub:"2 pkt za km · dojazd +25 pkt", col:"#2E7D32"},
  {id:"ex",   icon:"🧘",label:"Ćwiczenia",  sub:"MET · zdjęcie wymagane",        col:"#6A1B9A"},
  {id:"phone",icon:"📱",label:"Z telefonu", sub:"Aktywności GPS zsynchronizowane",   col:T.navy},
];
const ACTS_FOOT=[
  {id:"run",  icon:"🏃",name:"Bieg",         col:T.blue},
  {id:"walk", icon:"🚶",name:"Spacer",        col:"#2E7D32"},
  {id:"nordic",icon:"🎿",name:"Nordic walking",col:T.navy},
  {id:"hike", icon:"⛰", name:"Wędrówka",     col:"#4E342E"},
  {id:"tmill",icon:"🏋", name:"Bieżnia",      col:T.grey,manual:true},
];
const ACTS_WHEEL=[
  {id:"bike",  icon:"🚴",name:"Rower",         col:"#2E7D32",commute:true},
  {id:"road",  icon:"🚴",name:"Rower szosowy", col:"#1B5E20",commute:true},
  {id:"mtb",   icon:"🚵",name:"Rower górski",  col:"#33691E",commute:false},
  {id:"ebike", icon:"⚡",name:"Rower elektr.", col:"#F57F17",commute:true},
  {id:"scoot", icon:"🛴",name:"Hulajnoga",     col:"#00695C",commute:true},
  {id:"static",icon:"🚴",name:"Rower statyczny",col:T.grey,commute:false,manual:true},
];
const ACTS_EX=[
  {id:"yoga",    icon:"🧘",name:"Joga",       metKey:"yoga",   col:"#6A1B9A"},
  {id:"swim",    icon:"🏊",name:"Pływanie",   metKey:"swim",   col:T.blue},
  {id:"fitness", icon:"💪",name:"Fitness",    metKey:"fitness",col:"#BF360C"},
  {id:"crossfit",icon:"💪",name:"CrossFit",   metKey:"crossfit",col:"#B71C1C"},
  {id:"football",icon:"⚽",name:"Piłka nożna",metKey:"team",   col:"#1A237E"},
  {id:"tennis",  icon:"🎾",name:"Tenis",      metKey:"tennis", col:"#33691E"},
  {id:"pilates", icon:"🧘",name:"Pilates",    metKey:"pilates",col:"#880E4F"},
  {id:"dance",   icon:"💃",name:"Taniec",     metKey:"dance",  col:"#AD1457"},
  {id:"climb",   icon:"🧗",name:"Wspinaczka", metKey:"climb",  col:"#4E342E"},
];
const INTEG=[
  {id:"strava",name:"Strava",       col:"#FC4C02",on:true},
  {id:"garmin",name:"Garmin",       col:"#007DC3",on:true},
  {id:"polar", name:"Polar Flow",   col:"#D60404",on:false},
  {id:"apple", name:"Apple Health", col:"#111",   on:true},
  {id:"google",name:"Google Fit",   col:"#4285F4",on:false},
];
const FAC=[
  {id:"fit",  name:"FitZone Centrum",  type:"Siłownia",   icon:"💪",pts:20,col:T.blue},
  {id:"aqua", name:"Aqua Park",        type:"Pływalnia",  icon:"🏊",pts:22,col:T.navy},
  {id:"yoga", name:"Yoga Studio",      type:"Joga",       icon:"🧘",pts:18,col:"#6A1B9A"},
  {id:"cross",name:"CrossFit Box",     type:"CrossFit",   icon:"💪",pts:22,col:T.red},
  {id:"sport",name:"SportClub",        type:"Zajęcia",    icon:"🏃",pts:20,col:"#2E7D32"},
  {id:"spa",  name:"Spa & Wellness",   type:"SPA / Sauna",icon:"💆",pts:12,col:"#AD1457"},
  {id:"vs",   name:"Strefa VS Online", type:"Online",     icon:"📱",pts:8, col:T.grey},
];
/* Skórki wizualne nagród (kolor + gradient) — przydzielane po indeksie,
   bo API katalogu nagród nie przechowuje danych wyglądu. */
const REW_SKINS=[
  {col:"#6A1B9A",g:"linear-gradient(145deg,#3A1060,#1A0830)"},
  {col:"#0C5093",g:"linear-gradient(145deg,#102030,#081820)"},
  {col:"#2E7D32",g:"linear-gradient(145deg,#082818,#041810)"},
  {col:"#2C3468",g:"linear-gradient(145deg,#201028,#140818)"},
];
/* Katalog nagród — wartości domyślne; nadpisywane konfiguracją z panelu. */
let REW=[
  {icon:"🎫",name:"Kupon QlturaProfit",         sub:"Dostęp do wydarzeń kulturalnych",  cost:800,  col:"#6A1B9A",g:"linear-gradient(145deg,#3A1060,#1A0830)"},
  {icon:"🎁",name:"Voucher -50% Prezent Marzeń",sub:"Na jeden prezent z katalogu",      cost:400,  col:T.blue,   g:"linear-gradient(145deg,#102030,#081820)"},
  {icon:"💊",name:"-40% na DOZ.pl",             sub:"Apteka i zdrowie online",           cost:600,  col:"#2E7D32",g:"linear-gradient(145deg,#082818,#041810)"},
  {icon:"🏋",name:"Bon Decathlon 50 zł",        sub:"Na sprzęt sportowy",               cost:1200, col:T.navy,   g:"linear-gradient(145deg,#201028,#140818)"},
];
/* Kody kuponów wydane w tej sesji — zapobiega powtórzeniu kodu z puli temu samemu użytkownikowi. */
var USED_CODES = {};
const FEED0=[
  {id:0,user:"Anna W.",  initials:"AW",type:"Rower",     stat:"24.3 km",pts:58,ago:"2h",   cat:"wheel",ok:true,  isNew:false,likes:8, coms:3},
  {id:1,user:"Piotr M.", initials:"PM",type:"Bieg",      stat:"10.1 km",pts:70,ago:"4h",   cat:"foot", ok:true,  isNew:false,likes:12,coms:5},
  {id:2,user:"Julia S.", initials:"JS",type:"Kroki",     stat:"10 240 kroków",pts:sstep(10240),ago:"3h", cat:"step", ok:false, isNew:false,likes:5, coms:2, steps:10240, weekSteps:[9240,11320,7800,12100,10240,0,0]},
  {id:3,user:"Julia S.", initials:"JS",type:"Joga",      stat:"60 min", pts:30,ago:"5h",   cat:"ex",   ok:false, isNew:false,likes:6, coms:2},
  {id:4,user:"Michał B.",initials:"MB",type:"Pływanie",  stat:"45 min", pts:36,ago:"wcz.", cat:"ex",   ok:false, isNew:false,likes:4, coms:1},
];
/* monotonically increasing id for newly created feed items —
   avoids index-based keying bugs when items are prepended */
var _feedSeq = 1000;
function newFeedId(){ return ++_feedSeq; }

/* ── KROKOMIERZ ───────────────────────── */
let STEP_GOAL  = 10000;       /* dzienny cel — nadpisywany konfiguracją z panelu */
const STEP_BONUS = 7500;        /* próg bonusu +10 pkt */
/* Cel zbiórki charytatywnej i strony informacyjne — nadpisywane konfiguracją z panelu. */
let CHARITY_GOAL = 19000;
let CHARITY = {
  name: "Schronisko na Paluchu",
  desc: "Przekaż swoje punkty na wspólny cel charytatywny. Gdy firma osiągnie cel, VanityStyle przekaże darowiznę.",
  img: "",
};
let BRANDING_LOGO = "";
let INFO_PAGES = [];
/* Ustawienia dołączania — nadpisywane konfiguracją z panelu. */
let JOIN = { fairplay: 1, regulationsUrl: "" };
/* Tygodniowe dane kroków: P W Ś C P S N (bieżący tydzień, N = dzisiaj) */
const WEEK_LABELS = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];
const WEEK_STEPS_SEED = [9240, 11320, 7800, 12100, 8432, 0, 0];
/* Indeks dzisiejszego dnia (0=Pn…6=Nd) */
var TODAY_IDX = (new Date().getDay()+6)%7;  /* JS: 0=Sun → shift */
const MY0=[
  {id:0,cat:"foot", type:"Bieg",    icon:"🏃",stat:"8.3 km",  pts:60,src:"gps",  ago:"07:30",today:true, commute:false,suppressed:false},
  {id:1,cat:"card", type:"FitZone", icon:"💪",stat:"Karta FP",pts:20,src:"card", ago:"08:45",today:true, commute:false,suppressed:false},
  {id:2,cat:"step", type:"Kroki",   icon:"🚶",stat:"8 432",   pts:0, src:"phone",ago:"rano",  today:true, commute:false,suppressed:true},
  {id:3,cat:"wheel",type:"Rower",   icon:"🚴",stat:"12.3 km", pts:35,src:"strava",ago:"wcz.", today:false,commute:true, suppressed:false},
  {id:4,cat:"ex",   type:"Joga",    icon:"🧘",stat:"45 min",  pts:22,src:"manual",ago:"wcz.", today:false,commute:false,suppressed:false},
];
const GPS0=[
  {id:"p_bike",icon:"🚴",cat:"wheel",km:12.3,mins:45,type:"Rower",  detail:"12.3 km · 45 min · GPS",ok:true},
  {id:"p_run", icon:"🏃",cat:"foot", km:3.1, mins:22,type:"Bieg",   detail:"3.1 km · 22 min · GPS", ok:true},
  {id:"p_walk",icon:"🚶",cat:"foot", km:2.2, mins:28,type:"Spacer", detail:"2.2 km · 28 min",       ok:false},
];

/* ─── CAT COLORS ─── */
const CAT_COL = {foot:T.blue,wheel:"#2E7D32",ex:"#6A1B9A",step:T.navy,card:T.navy};
const CAT_LBL = {foot:"Na nogach",wheel:"Na kołach",ex:"Ćwiczenia",step:"Kroki",card:"Karta VS"};
const SRC_LBL = {card:"Karta",gps:"GPS",phone:"Telefon",manual:"Ręcznie",strava:"Strava",garmin:"Garmin"};

/* ─── SMALL UI ───────────────────────── */

/* Avatar circle from initials */
function Ava(p){
  var colors=["#0C5093","#181C33","#2E7D32","#6A1B9A","#B31319","#00695C","#BF360C"];
  var idx=(p.text||"").charCodeAt(0)%colors.length;
  var sz=p.size||36;
  return (
    <div style={{width:sz,height:sz,borderRadius:"50%",background:colors[idx],display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <span style={{fontSize:sz*0.36,fontWeight:700,color:"#fff",letterSpacing:0.5}}>{(p.text||"?").substring(0,2).toUpperCase()}</span>
    </div>
  );
}

/* VS-style pill badge */
function Pill(p){
  return (
    <div style={{display:"inline-flex",alignItems:"center",background:p.bg||T.greyBg,borderRadius:99,padding:"3px 10px",border:"1px solid "+(p.border||T.border)}}>
      <span style={{fontSize:10,fontWeight:600,color:p.col||T.grey}}>{p.label}</span>
    </div>
  );
}

/* Primary CTA — full width */
function PrimaryBtn(p){
  return (
    <button onClick={p.onClick} className="tap"
      style={{width:"100%",background:p.dark?T.navy:T.card,color:p.dark?"#fff":T.text,border:"1.5px solid "+(p.dark?T.navy:T.border),borderRadius:14,padding:"16px",fontSize:15,fontWeight:700,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,...p.style}}>
      {p.children}
    </button>
  );
}

/* Ghost CTA — text link */
function GhostBtn(p){
  return (
    <button onClick={p.onClick} className="tap"
      style={{background:"none",border:"none",fontSize:14,fontWeight:600,color:p.col||T.grey,cursor:"pointer",fontFamily:"inherit",padding:"8px 0",...p.style}}>
      {p.children}
    </button>
  );
}

/* Card surface */
function Card(p){
  return (
    <div style={{background:T.card,borderRadius:p.r||16,border:"1px solid "+T.border,overflow:"hidden",...p.style}}>
      {p.children}
    </div>
  );
}

/* Category chip */
function CatChip(p){
  var col=CAT_COL[p.cat]||T.grey;
  return <Pill label={CAT_LBL[p.cat]||p.cat} col={col} bg={col+"18"} border={col+"30"}/>;
}

/* Src chip */
function SrcChip(p){
  var map={card:T.navy,gps:"#2E7D32",phone:"#6A1B9A",manual:T.grey,strava:"#FC4C02",garmin:"#007DC3"};
  var col=map[p.src]||T.grey;
  return <Pill label={SRC_LBL[p.src]||p.src} col={col} bg={col+"14"} border={col+"28"}/>;
}

/* Stepper */
function Stp(p){
  return (
    <div style={{display:"flex",alignItems:"center",background:T.card,border:"1.5px solid "+T.border,borderRadius:12,overflow:"hidden"}}>
      <button onClick={function(){p.onChange(Math.max(p.min,parseFloat((p.value-p.step).toFixed(1))));}} className="tap"
        style={{width:52,height:50,background:"none",border:"none",fontSize:22,fontWeight:700,color:T.text,cursor:"pointer",borderRight:"1px solid "+T.border}}>
        {"-"}
      </button>
      <div style={{flex:1,textAlign:"center"}}>
        <div style={{fontSize:20,fontWeight:700,color:T.text}}>{p.value}</div>
        <div style={{fontSize:10,color:T.grey,marginTop:1}}>{p.unit}</div>
      </div>
      <button onClick={function(){p.onChange(Math.min(p.max,parseFloat((p.value+p.step).toFixed(1))));}} className="tap"
        style={{width:52,height:50,background:"none",border:"none",fontSize:22,fontWeight:700,color:T.text,cursor:"pointer",borderLeft:"1px solid "+T.border}}>
        {"+"}
      </button>
    </div>
  );
}

/* Toggle */
function Toggle(p){
  return (
    <button onClick={p.onChange} className="tap" role="switch" aria-checked={!!p.value}
      style={{width:48,height:28,borderRadius:14,background:p.value?T.navy:T.greyBg,border:"1.5px solid "+(p.value?T.navy:T.border),cursor:"pointer",position:"relative",transition:"background .2s,border .2s"}}>
      <div style={{width:20,height:20,borderRadius:"50%",background:T.card,position:"absolute",top:3,left:p.value?24:3,transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}/>
    </button>
  );
}

/* Toast notification */
function Toast(p){
  if(!p.t)return null;
  return (
    <div className="tst" style={{position:"absolute",top:56,left:16,right:16,zIndex:400,background:T.navy,borderRadius:16,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 12px 40px rgba(24,28,51,0.25)"}}>
      <span style={{fontSize:24}}>{p.t.icon}</span>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{p.t.name}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:2}}>+{p.t.pts} punktów</div>
      </div>
      <div style={{background:"rgba(255,255,255,0.12)",borderRadius:99,padding:"4px 12px"}}>
        <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>+{p.t.pts}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   PHOTO VERIFICATION ENGINE
   • Reads DateTimeOriginal from JPEG EXIF (tag 0x9003)
   • Falls back to DateTime (0x0132) then File.lastModified
   • Verifies photo was taken on the same calendar day
════════════════════════════════════════════════════ */

/* Parse "YYYY:MM:DD HH:MM:SS" → Date | null */
function parseExifDate(str) {
  if (!str) return null;
  var m = str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
}

/* Is date the same calendar day as today? */
function isToday(d) {
  if (!d) return false;
  var n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}

/* Format a Date nicely */
function fmtDate(d) {
  if (!d) return "?";
  return d.getDate()+"."+(d.getMonth()+1)+"."+d.getFullYear()+" "+
    (d.getHours()<10?"0":"")+d.getHours()+":"+(d.getMinutes()<10?"0":"")+d.getMinutes();
}

/* Lightweight EXIF reader — returns Promise<{date: Date|null, source: "exif"|"file"|"none"}> */
function readPhotoMeta(file) {
  return new Promise(function(resolve) {
    if (!file) { resolve({date:null,source:"none"}); return; }

    /* File.lastModified as fallback */
    var fileMod = file.lastModified ? new Date(file.lastModified) : null;

    if (!file.type.match(/jpeg|jpg/i)) {
      resolve({date:fileMod,source:"file"});
      return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var buf = e.target.result;
        var dv  = new DataView(buf);

        if (dv.getUint16(0) !== 0xFFD8) {
          resolve({date:fileMod,source:"file"}); return;
        }

        var off = 2;
        while (off < buf.byteLength - 4) {
          var marker = dv.getUint16(off);
          if (marker === 0xFFDA) break; /* SOS */

          var segLen = dv.getUint16(off + 2);

          if (marker === 0xFFE1 && segLen > 10) {
            /* Check "Exif\0\0" */
            var hdr = "";
            for (var j=0;j<4;j++) hdr += String.fromCharCode(dv.getUint8(off+4+j));
            if (hdr === "Exif") {
              var tiff = off + 10;
              var le   = dv.getUint16(tiff) === 0x4949;
              var ifd0 = tiff + dv.getUint32(tiff+4, le);
              var cnt  = dv.getUint16(ifd0, le);
              var dtStr = null;

              for (var i=0;i<cnt && i<64;i++) {
                var ep = ifd0 + 2 + i*12;
                if (ep + 12 > buf.byteLength) break;
                var tag = dv.getUint16(ep, le);

                /* DateTime IFD0 0x0132 */
                if (tag === 0x0132 && !dtStr) {
                  var vo = tiff + dv.getUint32(ep+8, le);
                  var s = "";
                  for (var k=0;k<19&&vo+k<buf.byteLength;k++) {
                    var ch = dv.getUint8(vo+k);
                    if (ch===0) break;
                    s += String.fromCharCode(ch);
                  }
                  dtStr = s;
                }

                /* ExifIFD pointer 0x8769 — look for DateTimeOriginal 0x9003 */
                if (tag === 0x8769) {
                  var exifIfd = tiff + dv.getUint32(ep+8, le);
                  if (exifIfd + 2 <= buf.byteLength) {
                    var cnt2 = dv.getUint16(exifIfd, le);
                    for (var ii=0;ii<cnt2 && ii<64;ii++) {
                      var ep2 = exifIfd + 2 + ii*12;
                      if (ep2 + 12 > buf.byteLength) break;
                      var tag2 = dv.getUint16(ep2, le);
                      if (tag2 === 0x9003) { /* DateTimeOriginal */
                        var vo2 = tiff + dv.getUint32(ep2+8, le);
                        var s2 = "";
                        for (var kk=0;kk<19&&vo2+kk<buf.byteLength;kk++) {
                          var ch2 = dv.getUint8(vo2+kk);
                          if (ch2===0) break;
                          s2 += String.fromCharCode(ch2);
                        }
                        var dt2 = parseExifDate(s2);
                        if (dt2) { resolve({date:dt2,source:"exif"}); return; }
                      }
                    }
                  }
                }
              }

              var dt = parseExifDate(dtStr);
              if (dt) { resolve({date:dt,source:"exif"}); return; }
            }
          }

          off += 2 + segLen;
        }
      } catch(err) {}
      resolve({date:fileMod,source:"file"});
    };
    reader.onerror = function(){ resolve({date:fileMod,source:"file"}); };
    reader.readAsArrayBuffer(file.slice(0, 196608)); /* read first 192 KB */
  });
}

/* Derive verification status from meta */
/* Returns: "ok_exif" | "ok_file" | "err_old" | "err_nodate" */
function calcPhotoStatus(meta) {
  if (!meta) return "err_nodate";
  if (!meta.date) return "err_nodate";
  if (isToday(meta.date)) return meta.source==="exif" ? "ok_exif" : "ok_file";
  return "err_old";
}

/* Status helpers */
var PHOTO_STATUS = {
  ok_exif:   {icon:"✅",label:"EXIF zweryfikowane",     col:"#2E7D32",bg:"#E8F5E9",border:"#A5D6A7",pass:true},
  ok_file:   {icon:"🟡",label:"Data z pliku — dzisiaj", col:"#F57F17",bg:"#FFF8E1",border:"#FFE082",pass:true},
  err_old:   {icon:"❌",label:"Zdjęcie zbyt stare",      col:T.red,   bg:"#FFEBEE",border:"#EF9A9A",pass:false},
  err_nodate:{icon:"⚠️",label:"Brak daty w pliku",       col:T.red,   bg:"#FFEBEE",border:"#EF9A9A",pass:false},
  verifying: {icon:"🔄",label:"Weryfikacja…",            col:T.blue,  bg:"#E3F2FD",border:"#90CAF9",pass:false},
};

/* Reusable photo verification badge for activity lists */
function VerifBadge(p) {
  var v = p.verif;
  if (!v || v.status === "ok_exif") {
    /* ok_exif → show compact green badge */
    if (!v) return null;
    return (
      <div style={{display:"flex",alignItems:"center",gap:4,background:"#E8F5E9",borderRadius:99,padding:"2px 8px",border:"1px solid #A5D6A7",flexShrink:0}}>
        <span style={{fontSize:10}}>📷</span>
        <span style={{fontSize:10,fontWeight:700,color:"#2E7D32"}}>EXIF ✓</span>
      </div>
    );
  }
  if (v.status === "ok_file") {
    return (
      <div style={{display:"flex",alignItems:"center",gap:4,background:"#FFF8E1",borderRadius:99,padding:"2px 8px",border:"1px solid #FFE082",flexShrink:0}}>
        <span style={{fontSize:10}}>📷</span>
        <span style={{fontSize:10,fontWeight:700,color:"#F57F17"}}>Zdjęcie</span>
      </div>
    );
  }
  return null;
}

/* ─── ADD MODAL ──────────────────────── */
function AddModal(p){
  var [cat,setCat]=useState("");
  var [act,setAct]=useState(null);
  var [km,setKm]=useState(5.0);
  var [mins,setMins]=useState(30);
  var [commute,setCommute]=useState(false);
  var [padded,setPadded]=useState(new Set(p.phoneAdded||[]));
  var dc=p.dc||{};            /* points consumed per category today (for the 100-pt cap) */
  var ac=p.actCount||{};      /* number of activities per category today (for the 1st/2nd-activity bonus) */
  var streak=p.streak||7;
  var pb=pbonus(streak);
  var STEPS=p.todaySteps||8432;
  var stPts=sstep(STEPS);
  var stPct=Math.min(100,Math.round(STEPS/10000*100));
  var acts=cat==="foot"?ACTS_FOOT:cat==="wheel"?ACTS_WHEEL:cat==="ex"?ACTS_EX:[];
  var prev=0;
  if(cat==="foot"&&act)prev=sfoot(km,ac.foot||0);
  if(cat==="wheel"&&act)prev=swheel(km,ac.wheel||0,commute);
  if(cat==="ex"&&act)prev=sex(act.metKey,mins);
  /* dzienny limit kategorii: max 100 pkt / dzień */
  var room=cat?Math.max(0,LIM-(dc[cat]||0)):LIM;
  var awarded=Math.min(prev+pb,room);

  /* ── photo verification state ── */
  var [photoFile,   setPhotoFile]   = useState(null);
  var [photoUrl,    setPhotoUrl]    = useState(null);
  var [photoStatus, setPhotoStatus] = useState(null);
  var [photoMeta,   setPhotoMeta]   = useState(null);
  var fileInputRef = useRef(null);
  useEscClose(p.onClose);

  function handleFileChange(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoUrl(URL.createObjectURL(f));
    setPhotoStatus("verifying");
    setPhotoMeta(null);
    readPhotoMeta(f).then(function(meta) {
      setPhotoMeta(meta);
      setPhotoStatus(calcPhotoStatus(meta));
    });
  }

  /* Simulate "take photo now" — instant verified */
  function handleTakeNow() {
    var fakeMeta = {date: new Date(), source:"exif"};
    setPhotoFile({name:"photo_now.jpg"});
    setPhotoUrl(null);
    setPhotoMeta(fakeMeta);
    setPhotoStatus("ok_exif");
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoUrl(null);
    setPhotoStatus(null);
    setPhotoMeta(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  var photoOk = photoStatus==="ok_exif" || photoStatus==="ok_file";
  var canSave = photoOk && prev > 0;
  var ps = photoStatus ? PHOTO_STATUS[photoStatus] : null;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}} onClick={p.onClose}>
      <div className="mdl" role="dialog" aria-modal="true" onClick={function(e){e.stopPropagation();}}
        style={{width:375,background:T.bg,borderRadius:"24px 24px 0 0",maxHeight:"92vh",overflowY:"auto"}}>

        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",paddingTop:12}}>
          <div style={{width:36,height:4,background:T.greyLt,borderRadius:2}}/>
        </div>

        {/* Header */}
        <div style={{padding:"14px 24px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:-0.4}}>
              {!cat?"Dodaj aktywność":cat==="phone"?"Z telefonu":!act?"Wybierz aktywność":"Szczegóły"}
            </div>
            {pb>0&&<div style={{fontSize:12,color:"#E65100",fontWeight:600,marginTop:3}}>Passa {streak} dni — +{pb} pkt bonus!</div>}
          </div>
          <button onClick={p.onClose} className="tap"
            style={{width:36,height:36,borderRadius:10,background:T.card,border:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,color:T.grey}}>
            ×
          </button>
        </div>
        <div style={{height:1,background:T.border}}/>

        {/* STEP 1 — kategoria */}
        {!cat&&(
          <div style={{padding:"20px 24px 40px"}}>
            <p style={{fontSize:13,color:T.grey,fontWeight:500,marginBottom:16}}>Wybierz kategorię aktywności</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {CATS.map(function(c){
                var used=dc[c.id]||0;var clim=(SCORE[c.id]&&SCORE[c.id].limit)||LIM;var full=used>=clim;
                var gpsCount=GPS0.filter(function(g){return !padded.has(g.id);}).length;
                return (
                  <button key={c.id} onClick={function(){if(!full)setCat(c.id);}} className="tap"
                    style={{display:"flex",alignItems:"center",gap:16,padding:"16px",background:T.card,border:"1.5px solid "+(full?T.border:T.border),borderRadius:16,cursor:full?"not-allowed":"pointer",opacity:full?0.45:1,textAlign:"left",fontFamily:"inherit",width:"100%"}}>
                    <div style={{width:48,height:48,borderRadius:14,background:c.col+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:700,color:T.text}}>{c.label}</div>
                      <div style={{fontSize:12,color:T.grey,marginTop:3}}>{catSub(c.id)}</div>
                    </div>
                    <div>
                      {c.id==="phone"
                        ?<span style={{fontSize:11,fontWeight:700,color:T.navy}}>{gpsCount>0?gpsCount+" wykryte":"Zsynchronizowane"}</span>
                        :full
                        ?<span style={{fontSize:11,color:T.red,fontWeight:600}}>Limit {clim} pkt</span>
                        :<div style={{textAlign:"right"}}>
                          <span style={{fontSize:13,fontWeight:700,color:c.col}}>{used}</span>
                          <span style={{fontSize:11,color:T.grey}}>/{clim} pkt</span>
                        </div>
                      }
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PHONE — kroki + GPS */}
        {cat==="phone"&&(
          <div style={{padding:"20px 24px 40px"}}>
            <button onClick={function(){setCat("");}} className="tap" style={{background:"none",border:"none",fontSize:13,fontWeight:600,color:T.blue,cursor:"pointer",fontFamily:"inherit",marginBottom:20,padding:0}}>← Wróć</button>

            {/* Integracje */}
            <div className="hs" style={{gap:8,marginBottom:24,paddingBottom:4}}>
              {INTEG.filter(function(i){return i.on;}).map(function(ig){
                return (
                  <div key={ig.id} style={{flexShrink:0,background:T.card,border:"1px solid "+T.border,borderRadius:12,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:22,height:22,borderRadius:6,background:ig.col,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:9,fontWeight:800,color:"#fff"}}>{ig.name[0]}</span>
                    </div>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:T.text}}>{ig.name}</div>
                      <div style={{fontSize:9,color:"#2E7D32",fontWeight:600}}>Połączono</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kroki — naliczane automatycznie przez Krokomierz na ekranie głównym */}
            <div style={{background:T.navy+"0C",border:"1px solid "+T.navy+"20",borderRadius:12,padding:"12px 14px",marginBottom:24,display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0}}>🚶</span>
              <span style={{fontSize:12,color:T.grey,lineHeight:1.55}}>Kroki naliczają się automatycznie — punkty dolicza Krokomierz po osiągnięciu dziennego celu. Nie trzeba dodawać ich ręcznie.</span>
            </div>

            {/* GPS */}
            <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:12}}>WYKRYTE Z GPS</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {GPS0.filter(function(g){return !padded.has(g.id);}).map(function(item){
                var pts=item.cat==="foot"?sfoot(item.km,ac.foot||0):swheel(item.km,ac.wheel||0,false);
                return (
                  <Card key={item.id} style={{overflow:"hidden"}}>
                    <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:44,height:44,borderRadius:12,background:item.cat==="foot"?T.blue+"18":"#2E7D3218",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{item.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:T.text}}>{item.type}</div>
                        <div style={{fontSize:12,color:T.grey,marginTop:2}}>{item.detail}</div>
                      </div>
                      {item.ok&&<Pill label="GPS" col="#2E7D32" bg="#2E7D3214" border="#2E7D3228"/>}
                    </div>
                    <button onClick={function(){setPadded(function(s){var n=new Set(s);n.add(item.id);return n;});p.onPhone(item.id,item.cat,item.km,item.mins);p.onClose();}} className="tap"
                      style={{width:"100%",background:T.navy,border:"none",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",fontFamily:"inherit"}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>Dodaj do FitProfit</span>
                      <span style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,0.7)"}}>+{pts} pkt</span>
                    </button>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2 — aktywność */}
        {cat&&cat!=="phone"&&!act&&(
          <div style={{padding:"20px 24px 40px"}}>
            <button onClick={function(){setCat("");}} className="tap" style={{background:"none",border:"none",fontSize:13,fontWeight:600,color:T.blue,cursor:"pointer",fontFamily:"inherit",marginBottom:20,padding:0}}>← Wróć</button>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {acts.map(function(a){
                return (
                  <button key={a.id} onClick={function(){setAct(a);}} className="tap"
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"16px 8px",background:T.card,border:"1.5px solid "+T.border,borderRadius:16,cursor:"pointer",fontFamily:"inherit"}}>
                    <div style={{width:48,height:48,borderRadius:14,background:(a.col||T.navy)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{a.icon}</div>
                    <span style={{fontSize:11,fontWeight:600,color:T.text,textAlign:"center",lineHeight:1.4}}>{a.name}</span>
                    {a.manual&&<Pill label="Ręczny" col={T.grey}/>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3 — szczegóły */}
        {cat&&cat!=="phone"&&act&&(
          <div style={{padding:"20px 24px 44px"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
              <div style={{width:52,height:52,borderRadius:16,background:(act.col||T.navy)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{act.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:17,fontWeight:700,color:T.text}}>{act.name}</div>
                <CatChip cat={cat}/>
              </div>
              <GhostBtn onClick={function(){setAct(null);}}>Zmień</GhostBtn>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {(cat==="foot"||cat==="wheel")&&(
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:10}}>{"DYSTANS — min. "+SCORE[cat].min+" km"}</div>
                  <Stp value={km} onChange={setKm} min={0.5} max={200} step={0.5} unit="km"/>
                  {km<SCORE[cat].min&&<p style={{fontSize:12,color:T.red,marginTop:8,fontWeight:500}}>{"Minimum "+SCORE[cat].min+" km wymagane do zdobycia punktów"}</p>}
                </div>
              )}
              <div>
                <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:10}}>CZAS TRWANIA</div>
                <Stp value={mins} onChange={setMins} min={5} max={300} step={5} unit="min"/>
              </div>
              {cat==="wheel"&&act.commute&&(
                <Card style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:T.text}}>Dojazd do pracy?</div>
                      <div style={{fontSize:12,color:T.grey,marginTop:2}}>Dodatkowe +25 pkt za ekologiczny transport</div>
                    </div>
                    <Toggle value={commute} onChange={function(){setCommute(!commute);}}/>
                  </div>
                </Card>
              )}

              {/* ── PHOTO VERIFICATION — required for ALL manual entries ── */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8}}>DOKUMENTACJA ZDJĘCIEM</div>
                  {!photoOk&&<span style={{fontSize:11,color:T.red,fontWeight:600}}>Wymagane</span>}
                  {photoOk&&<span style={{fontSize:11,color:"#2E7D32",fontWeight:600}}>Gotowe ✓</span>}
                </div>

                {/* Explanation */}
                <div style={{background:"#F0F4FF",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:15,flexShrink:0}}>🛡</span>
                  <div style={{fontSize:12,color:T.blue,lineHeight:1.5}}>
                    Aktywności dodane ręcznie wymagają zdjęcia z tego samego dnia ćwiczeń.
                    Weryfikujemy datę z metadanych EXIF zdjęcia.
                  </div>
                </div>

                {/* Photo input buttons */}
                {!photoFile ? (
                  <div style={{display:"flex",gap:8}}>
                    {/* Simulate camera — for demo */}
                    <button onClick={handleTakeNow} className="tap"
                      style={{flex:1,background:T.navy,color:"#fff",border:"none",borderRadius:12,padding:"13px 10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      Zrób zdjęcie
                    </button>
                    <button onClick={function(){ fileInputRef.current && fileInputRef.current.click(); }} className="tap"
                      style={{flex:1,background:T.card,color:T.text,border:"1.5px solid "+T.border,borderRadius:12,padding:"13px 10px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="8 12 12 8 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                      Wybierz z galerii
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{display:"none"}}/>
                  </div>
                ) : (
                  /* Photo added — show preview + status */
                  <div style={{borderRadius:16,overflow:"hidden",border:"1.5px solid "+(ps?ps.border:T.border)}}>
                    {/* Preview area */}
                    <div style={{height:140,background:T.greyBg,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {photoUrl ? (
                        <img src={photoUrl} alt="proof" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      ) : (
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:36,marginBottom:8}}>📷</div>
                          <div style={{fontSize:12,color:T.grey}}>Zdjęcie z aparatu</div>
                        </div>
                      )}
                      {/* Overlay shimmer when verifying */}
                      {photoStatus==="verifying"&&(
                        <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,0.7)",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                          <div style={{fontSize:20}}>🔄</div>
                          <span style={{fontSize:13,fontWeight:600,color:T.navy}}>Weryfikacja EXIF…</span>
                        </div>
                      )}
                      {/* Success overlay */}
                      {photoOk&&(
                        <div style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,0.55)",borderRadius:99,padding:"4px 12px",display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:11}}>{ps.icon}</span>
                          <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{ps.label}</span>
                        </div>
                      )}
                      {/* Remove button */}
                      <button onClick={clearPhoto} className="tap"
                        style={{position:"absolute",top:8,right:8,width:28,height:28,borderRadius:8,background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        ×
                      </button>
                    </div>

                    {/* Status row */}
                    <div style={{padding:"12px 14px",background:ps?ps.bg:"#fff",borderTop:"1px solid "+(ps?ps.border:T.border)}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:18}}>{ps?ps.icon:"⏳"}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:700,color:ps?ps.col:T.text}}>{ps?ps.label:"Oczekiwanie…"}</div>
                          {photoMeta&&photoMeta.date&&(
                            <div style={{fontSize:11,color:T.grey,marginTop:2}}>
                              Data zdjęcia: {fmtDate(photoMeta.date)}
                              {photoMeta.source==="exif"?" · EXIF":" · metadane pliku"}
                            </div>
                          )}
                          {photoStatus==="err_old"&&(
                            <div style={{fontSize:11,color:T.red,marginTop:2}}>
                              Zdjęcie musi być z dnia {new Date().getDate()+"."+(new Date().getMonth()+1)+"."+new Date().getFullYear()}
                            </div>
                          )}
                          {photoStatus==="err_nodate"&&(
                            <div style={{fontSize:11,color:T.red,marginTop:2}}>
                              Plik nie zawiera danych o dacie wykonania. Użyj zdjęcia z aparatu.
                            </div>
                          )}
                        </div>
                        {!photoOk&&photoStatus!=="verifying"&&(
                          <button onClick={clearPhoto} className="tap"
                            style={{background:"none",border:"none",fontSize:12,fontWeight:600,color:T.blue,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                            Zmień
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            {prev>0&&(
              <Card style={{padding:"18px 20px",margin:"20px 0 18px",borderColor:T.navy+"30",background:T.navy}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:26,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>+{awarded} pkt</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:3}}>
                      {cat==="foot"?SCORE.foot.ppu+" pkt/km"+(ac.foot<SCORE.foot.bonusMax?" + bonus "+SCORE.foot.bonus:""):cat==="wheel"?SCORE.wheel.ppu+" pkt/km"+(ac.wheel<SCORE.wheel.bonusMax?" + bonus "+SCORE.wheel.bonus:"")+(commute?" + dojazd "+SCORE.commute:""):cat==="ex"?"MET "+(MET[act.metKey]||6)+" × "+mins+"min/10":""}
                      {pb>0?"  ·  +"+pb+" passa":""}{awarded<prev+pb?"  ·  limit dzienny "+LIM:""}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>Limit dnia</div>
                    <div style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.7)",marginTop:2}}>{Math.min(LIM,(dc[cat]||0)+awarded)} / {LIM}</div>
                  </div>
                </div>
              </Card>
            )}
            <PrimaryBtn dark={canSave} onClick={function(){
              if(canSave){
                var verif = {status: photoStatus, source: photoMeta&&photoMeta.source, date: photoMeta&&photoMeta.date ? fmtDate(photoMeta.date) : null};
                p.onSave(cat,act,km,mins,commute,awarded,verif);
                p.onClose();
              }
            }} style={{opacity:canSave?1:0.4}}>
              {prev===0
                ? "Min. "+((cat==="foot"||cat==="wheel")?SCORE[cat].min:1.5)+" km wymagane"
                : !photoFile
                  ? "📷 Dodaj zdjęcie, aby zapisać"
                  : photoStatus==="verifying"
                    ? "Weryfikacja zdjęcia…"
                    : !photoOk
                      ? "❌ Zdjęcie nie przeszło weryfikacji"
                      : "Dodaj aktywność ✓"
              }
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CHECK-IN MODAL ─────────────────── */
function CIModal(p){
  useEscClose(p.onClose);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}} onClick={p.onClose}>
      <div className="mdl" role="dialog" aria-modal="true" onClick={function(e){e.stopPropagation();}}
        style={{width:375,background:T.bg,borderRadius:"24px 24px 0 0",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",paddingTop:12}}><div style={{width:36,height:4,background:T.greyLt,borderRadius:2}}/></div>
        <div style={{padding:"14px 24px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:-0.4}}>Zamelduj się</div>
            <div style={{fontSize:13,color:T.grey,marginTop:3}}>Wybierz obiekt — punkty naliczą się automatycznie</div>
          </div>
          <button onClick={p.onClose} className="tap" style={{width:36,height:36,borderRadius:10,background:T.card,border:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,color:T.grey}}>×</button>
        </div>
        <div style={{height:1,background:T.border}}/>
        <div style={{padding:"16px 24px 40px",display:"flex",flexDirection:"column",gap:10}}>
          {FAC.map(function(f){
            return (
              <button key={f.id} onClick={function(){p.onCI(f);}} className="tap"
                style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:T.card,border:"1.5px solid "+T.border,borderRadius:16,cursor:"pointer",textAlign:"left",fontFamily:"inherit",width:"100%"}}>
                <div style={{width:44,height:44,borderRadius:13,background:f.col+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{f.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>{f.name}</div>
                  <div style={{fontSize:12,color:T.grey,marginTop:2}}>{f.type}</div>
                </div>
                <div style={{background:T.navy,borderRadius:99,padding:"5px 14px"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>+{f.pts}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── SCREEN: HOME ───────────────────── */
/* ═══════════════════════════════════════
   STEPS WIDGET — redesign
   Lewo: pełne koło z postępem do 10 000
   Prawo: słupki dni z szarą linią celu
═══════════════════════════════════════ */
function StepsWidget(p){
  var steps    = p.steps || 8432;
  var weekData = p.weekData || WEEK_STEPS_SEED;
  var onSync   = p.onSync;

  var pct      = Math.min(1, steps / STEP_GOAL);
  var reached  = steps >= STEP_GOAL;
  var bonusOk  = steps >= STEP_BONUS;
  var pts      = sstep(steps);
  var remaining = Math.max(0, STEP_GOAL - steps);

  /* ── Donut ring SVG ── */
  var R  = 46;     /* radius */
  var SW = 10;     /* stroke width */
  var SZ = (R + SW) * 2 + 8;  /* SVG viewBox size */
  var CX = SZ / 2;
  var CY = SZ / 2;
  var circumference = 2 * Math.PI * R;
  var dashOffset = circumference * (1 - pct);
  var ringCol = reached ? "#FFB800" : bonusOk ? T.blue : "#4CAF50";

  /* ── Bar chart ── */
  var BAR_H   = 80;  /* total bar area height px */
  var OVER_H  = 14;  /* headroom above goal line for overachievement */
  var GOAL_Y  = OVER_H;  /* y-position of goal line from top of bar area */
  var BAR_MAX = BAR_H - GOAL_Y;  /* max bar height (at goal) */

  function barHeight(s){
    if(s <= 0) return 0;
    if(s >= STEP_GOAL) return BAR_MAX + Math.min(OVER_H, Math.round(OVER_H * (s - STEP_GOAL) / 2000));
    return Math.max(3, Math.round(BAR_MAX * s / STEP_GOAL));
  }

  return (
    <div style={{background:T.card,borderRadius:20,border:"1px solid "+T.border,overflow:"hidden",padding:"16px 16px 0"}}>
      {/* Header row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:16}}>🦶</span>
          <span style={{fontSize:14,fontWeight:800,color:T.text}}>Krokomierz</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:T.grey}}>cel: {STEP_GOAL.toLocaleString("pl")} kroków</span>
          {onSync&&(
            <button onClick={onSync} className="tap"
              style={{width:28,height:28,borderRadius:8,background:T.greyBg,border:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.grey} strokeWidth="2.2" strokeLinecap="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main: ring + bars */}
      <div style={{display:"flex",alignItems:"center",gap:16}}>

        {/* ── DONUT RING ── */}
        <div style={{flexShrink:0,position:"relative",width:SZ,height:SZ}}>
          <svg width={SZ} height={SZ} viewBox={"0 0 "+SZ+" "+SZ} style={{transform:"rotate(-90deg)"}}>
            {/* Track */}
            <circle cx={CX} cy={CY} r={R}
              fill="none" stroke={T.greyBg} strokeWidth={SW}/>
            {/* Progress */}
            <circle cx={CX} cy={CY} r={R}
              fill="none" stroke={ringCol} strokeWidth={SW}
              strokeDasharray={circumference.toFixed(2)}
              strokeDashoffset={reached ? 0 : dashOffset.toFixed(2)}
              strokeLinecap="round"
              style={{transition:"stroke-dashoffset 0.7s cubic-bezier(.22,1,.36,1), stroke 0.5s"}}/>
          </svg>
          {/* Centre text */}
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
            {reached
              ? <>
                  <span style={{fontSize:22}}>⭐</span>
                  <div style={{fontSize:11,fontWeight:800,color:"#FFB800",marginTop:2}}>Cel!</div>
                </>
              : <>
                  <div style={{fontSize:22,fontWeight:900,color:T.text,lineHeight:1,letterSpacing:-0.5}}>{(steps/1000).toFixed(1).replace(".",",")}k</div>
                  <div style={{fontSize:9,color:T.grey,marginTop:2}}>kroków</div>
                </>
            }
          </div>
        </div>

        {/* ── DAILY BARS (last 7 days) ── */}
        <div style={{flex:1,minWidth:0}}>
          {/* Bar chart area */}
          <div style={{position:"relative",height:BAR_H+28}}>
            {/* Goal line */}
            <div style={{position:"absolute",top:GOAL_Y,left:0,right:0,borderTop:"1.5px dashed "+T.greyLt,zIndex:1}}/>
            {/* Goal label */}
            <div style={{position:"absolute",top:GOAL_Y-8,right:0}}>
              <span style={{fontSize:8,color:T.grey,fontWeight:600,background:T.card,paddingLeft:2}}>{(STEP_GOAL/1000).toFixed(0)}k</span>
            </div>

            {/* Bars + labels */}
            <div style={{position:"absolute",bottom:20,left:0,right:0,display:"flex",gap:3,alignItems:"flex-end",height:BAR_H}}>
              {WEEK_LABELS.map(function(lbl,i){
                var s         = weekData[i] || 0;
                var isTdy     = i === TODAY_IDX;
                var future    = i > TODAY_IDX;
                var met       = s >= STEP_GOAL;
                var bh        = barHeight(s);
                var col       = met ? "#FFB800" : s >= STEP_BONUS ? T.blue : s > 0 ? "#4CAF50" : T.greyLt;
                return (
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:BAR_H}}>
                    {/* Bar */}
                    <div style={{width:"100%",flex:1,display:"flex",alignItems:"flex-end",position:"relative"}}>
                      <div style={{
                        width:"100%",
                        height:bh,
                        background: future ? T.greyBg : col,
                        borderRadius:"3px 3px 1px 1px",
                        opacity: future ? 0.4 : isTdy ? 1 : 0.75,
                        outline: isTdy ? "1.5px solid "+col : "none",
                        outlineOffset:"1px",
                        transition:"height 0.5s ease",
                      }}/>
                      {/* Overachievement star */}
                      {met&&!future&&(
                        <span style={{position:"absolute",top:-16,left:"50%",transform:"translateX(-50%)",fontSize:10,lineHeight:1}}>⭐</span>
                      )}
                    </div>
                    {/* Step count */}
                    <div style={{marginTop:3,textAlign:"center"}}>
                      <div style={{fontSize:8,fontWeight:isTdy?800:500,color:isTdy?T.text:T.grey,lineHeight:1}}>
                        {s>0 ? (s>=1000 ? (s/1000).toFixed(1).replace(".",",")+"k" : s) : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Day labels pinned to bottom */}
            <div style={{position:"absolute",bottom:0,left:0,right:0,display:"flex",gap:3}}>
              {WEEK_LABELS.map(function(lbl,i){
                var isTdy = i === TODAY_IDX;
                return (
                  <div key={i} style={{flex:1,textAlign:"center"}}>
                    <span style={{fontSize:9,fontWeight:isTdy?800:500,color:isTdy?T.navy:T.grey}}>{lbl}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{borderTop:"1px solid "+T.border,margin:"12px -16px 0",padding:"10px 16px",display:"flex",gap:0}}>
        {[
          {v: steps.toLocaleString("pl"),                                                         l:"dzisiaj"},
          {v: weekData.reduce(function(a,b){return a+(b||0);},0).toLocaleString("pl"),            l:"tydzień razem"},
          {v: weekData.filter(function(s){return s>=STEP_GOAL;}).length+"/"+WEEK_LABELS.length,   l:"celów tygodnia"},
        ].map(function(s,i){
          return (
            <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?"1px solid "+T.border:"none"}}>
              <div style={{fontSize:13,fontWeight:800,color:T.text}}>{s.v}</div>
              <div style={{fontSize:9,color:T.grey,marginTop:2}}>{s.l}</div>
            </div>
          );
        })}
      </div>

      {/* Punkty z kroków — naliczane automatycznie po osiągnięciu celu */}
      <div style={{padding:"10px 0 14px",textAlign:"center"}}>
        <span style={{fontSize:12,color:reached?"#2E7D32":T.grey,fontWeight:reached?700:500}}>
          {reached
            ? "✓ Cel osiągnięty — +"+pts+" pkt naliczone do dzisiejszego wyniku"
            : "+"+pts+" pkt zostanie naliczone po osiągnięciu celu · "+remaining.toLocaleString("pl")+" do celu"}
        </span>
      </div>
    </div>
  );
}

/* ─── SCREEN: GŁÓWNA ───────────────── */
function Home(p){
  var tSrc=(p.srcs.card+p.srcs.gps+p.srcs.phone+p.srcs.manual)||1;
  var tA=p.acts.filter(function(a){return a.today;});
  var pA=p.acts.filter(function(a){return !a.today;});
  var nm=pnext(p.streak);
  var pp=Math.round(p.streak/nm*100);

  /* ── scroll interpolation ── */
  var sy   = p.scrollY || 0;
  var T1   = 40;   // start collapsing
  var T2   = 110;  // fully collapsed
  var prog = Math.min(1, Math.max(0, (sy - T1) / (T2 - T1)));  // 0 → 1
  var small = prog > 0.5;

  /* interpolate helpers */
  function lerp(a,b,t){ return a + (b-a)*t; }

  var heroPadTop    = Math.round(lerp(56, 14, prog));
  var heroPadBot    = Math.round(lerp(32, 12, prog));
  var heroPadH      = Math.round(lerp(24, 20, prog));
  var greetOpacity  = Math.max(0, 1 - prog * 2.5);
  var scoreSize     = Math.round(lerp(56, 26, prog));
  var scoreLabelOp  = Math.max(0, 1 - prog * 2.5);
  var subStatsOp    = Math.max(0, 1 - prog * 2);
  var sourceBarOp   = Math.max(0, 1 - prog * 2);
  var circle1Size   = Math.round(lerp(220, 80, prog));
  var circle2Size   = Math.round(lerp(160, 60, prog));

  return (
    <div style={{paddingBottom:28}}>

      {/* ── STICKY HERO ─────────────────── */}
      <div style={{
        background:T.navy,
        padding:heroPadTop+"px "+heroPadH+"px "+heroPadBot+"px",
        position:"sticky",
        top:0,
        zIndex:50,
        overflow:"hidden",
        transition:"padding 0.18s ease, box-shadow 0.18s ease",
        boxShadow: prog>0.1 ? "0 4px 24px rgba(24,28,51,0.28)" : "none",
      }}>
        {/* Dekoratywne koła — shrink on scroll */}
        <div style={{position:"absolute",top:lerp(-60,-10,prog)+"px",right:lerp(-60,-10,prog)+"px",width:circle1Size,height:circle1Size,borderRadius:"50%",background:"rgba(255,255,255,0.04)",transition:"all 0.18s ease",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:lerp(-80,-20,prog)+"px",right:lerp(40,10,prog)+"px",width:circle2Size,height:circle2Size,borderRadius:"50%",background:"rgba(12,80,147,0.35)",transition:"all 0.18s ease",pointerEvents:"none"}}/>

        {/* ── EXPANDED: greeting row ── */}
        <div style={{
          display:"flex",justifyContent:"space-between",alignItems:"flex-start",
          marginBottom: small ? 0 : 20,
          opacity: greetOpacity,
          maxHeight: greetOpacity < 0.05 ? 0 : 48,
          overflow:"hidden",
          transition:"all 0.18s ease",
          position:"relative",
        }}>
          <div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",fontWeight:500,marginBottom:4}}>Cześć, {p.displayName.split(" ")[0]} 👋</div>
            <div style={{fontSize:26,fontWeight:800,color:"#fff",letterSpacing:-0.5,lineHeight:1.1}}>Twój<br/>dzisiejszy wynik</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <div style={{width:38,height:38,borderRadius:11,background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            </div>
            <Ava text={p.displayInitials} size={38}/>
          </div>
        </div>

        {/* ── SCORE ROW — always visible, morphs ── */}
        <div style={{
          display:"flex",
          alignItems:"center",
          gap: small ? 0 : 20,
          position:"relative",
          transition:"gap 0.18s ease",
        }}>
          {/* Main score */}
          <div style={{flex: small ? 1 : "none"}}>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <div key={"pts"+p.popKey} className="pop"
                style={{
                  fontSize:scoreSize,
                  fontWeight:900,
                  color:"#fff",
                  lineHeight:1,
                  letterSpacing: small ? -0.5 : -2,
                  transition:"font-size 0.18s ease, letter-spacing 0.18s ease",
                }}>
                {p.today.pts}
              </div>
              <div style={{
                fontSize: small ? 13 : 14,
                color:"rgba(255,255,255,0.45)",
                fontWeight:500,
                marginBottom: small ? 0 : 4,
                transition:"font-size 0.18s ease",
              }}>
                {small ? "pkt" : "punktów dzisiaj"}
              </div>
            </div>
          </div>

          {/* Compact pill stats — fade in as expanded fades out */}
          <div style={{
            display:"flex",
            alignItems:"center",
            gap:8,
            opacity: prog,
            flex: small ? "none" : 1,
            transition:"opacity 0.15s ease",
            pointerEvents: prog > 0.5 ? "auto" : "none",
          }}>
            {small && (
              <>
                <div style={{width:1,height:20,background:"rgba(255,255,255,0.2)"}}/>
                <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>{p.today.km.toFixed(1)} km</span>
                <div style={{width:1,height:20,background:"rgba(255,255,255,0.2)"}}/>
                <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>🔥 {p.today.streak}</span>
              </>
            )}
          </div>

          {/* Expanded sub-stats — fade out */}
          {!small && (
            <div style={{
              display:"flex",
              alignItems:"flex-end",
              gap:20,
              opacity: subStatsOp,
              transition:"opacity 0.15s ease",
            }}>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:22,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>{p.today.km.toFixed(1)} km</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:2}}>dystans</div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:22,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>🔥 {p.today.streak}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:2}}>dni passa</div>
              </div>
            </div>
          )}

          {/* Compact avatar visible when collapsed */}
          {small && (
            <div style={{opacity:prog,transition:"opacity 0.15s ease",marginLeft:8}}>
              <Ava text={p.displayInitials} size={30}/>
            </div>
          )}
        </div>

        {/* Source bar — fades out */}
        <div style={{
          opacity: sourceBarOp,
          maxHeight: sourceBarOp < 0.05 ? 0 : 40,
          overflow:"hidden",
          transition:"all 0.18s ease",
          marginTop: small ? 0 : 16,
        }}>
          <div style={{display:"flex",borderRadius:99,overflow:"hidden",height:3,marginBottom:7,gap:1}}>
            {p.srcs.card>0&&<div style={{width:Math.round(p.srcs.card/tSrc*100)+"%",height:"100%",background:"#0C5093"}}/>}
            {p.srcs.gps>0&&<div style={{width:Math.round(p.srcs.gps/tSrc*100)+"%",height:"100%",background:"#4CAF50"}}/>}
            {p.srcs.phone>0&&<div style={{width:Math.round(p.srcs.phone/tSrc*100)+"%",height:"100%",background:"#9C27B0"}}/>}
            {p.srcs.manual>0&&<div style={{width:Math.round(p.srcs.manual/tSrc*100)+"%",height:"100%",background:"#F5A623"}}/>}
            {p.today.pts===0&&<div style={{width:"100%",height:"100%",background:"rgba(255,255,255,0.15)",borderRadius:99}}/>}
          </div>
          <div style={{display:"flex",gap:14}}>
            {[{k:"card",c:"#0C5093",l:"Karta"},{k:"gps",c:"#4CAF50",l:"GPS"},{k:"phone",c:"#9C27B0",l:"Krokomierz"},{k:"manual",c:"#F5A623",l:"Aktywności"}].filter(function(x){return p.srcs[x.k]>0;}).map(function(x){
              return <div key={x.k} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:x.c}}/><span style={{fontSize:11,color:"rgba(255,255,255,0.45)",fontWeight:500}}>{x.l} {p.srcs[x.k]} pkt</span></div>;
            })}
          </div>
        </div>
      </div>

      {/* ── PASSA STRIP ─────────────────── */}
      <div style={{padding:"12px 20px 0"}}>
        <Card style={{padding:"14px 18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:13,background:"#FF6F0018",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔥</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>Passa: {p.streak} dni</div>
                <div style={{fontSize:12,color:"#E65100",fontWeight:600}}>+50 pkt po {nm} dniach</div>
              </div>
              <div style={{background:T.greyBg,borderRadius:99,height:4,overflow:"hidden"}}><div style={{width:pp+"%",height:"100%",background:"#FF6F00",borderRadius:99}}/></div>
              <div style={{fontSize:11,color:T.grey,marginTop:5}}>Milestones: 3 / 7 / 14 / 21 dni</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── KROKOMIERZ ───────────────────── */}
      <div style={{padding:"14px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:17,fontWeight:800,color:T.text}}>Krokomierz</div>
          <span style={{fontSize:11,color:T.grey}}>z telefonu / Apple Health</span>
        </div>
        <StepsWidget
          steps={p.todaySteps||8432}
          weekData={p.weekSteps||WEEK_STEPS_SEED}
          onSync={p.onSyncSteps}
        />
      </div>

      {/* ── ACTIVITY BOARD ──────────────── */}
      <div style={{padding:"20px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:17,fontWeight:800,color:T.text}}>Aktywności</div>
          <span style={{fontSize:12,color:T.grey,fontWeight:500}}>dzisiaj</span>
        </div>
        <Card>
          {tA.length===0&&(
            <div style={{padding:"32px 20px",textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🏁</div>
              <div style={{fontSize:14,fontWeight:600,color:T.text}}>Brak aktywności dzisiaj</div>
              <div style={{fontSize:12,color:T.grey,marginTop:4}}>Dodaj pierwszą aktywność i zbieraj punkty</div>
            </div>
          )}
          {tA.map(function(a,i){
            return (
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:i<tA.length-1?"1px solid "+T.border:"none",opacity:a.suppressed?0.45:1}}>
                <div style={{width:40,height:40,borderRadius:12,background:(CAT_COL[a.cat]||T.navy)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <div style={{fontSize:14,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.type}</div>
                    {a.commute&&<Pill label="Dojazd" col="#2E7D32" bg="#2E7D3214" border="#2E7D3228"/>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,color:T.grey}}>{a.stat}</span>
                    <SrcChip src={a.src}/>
                    {a.suppressed&&<Pill label="Suppressed" col={T.grey}/>}
                    {a.src==="manual"&&<VerifBadge verif={a.verif}/>}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:a.suppressed?T.grey:T.navy}}>
                    {a.suppressed?"—":"+"+a.pts}
                  </div>
                  <div style={{fontSize:10,color:T.grey,marginTop:2}}>{a.ago}</div>
                </div>
              </div>
            );
          })}
          {/* Summary row */}
          {tA.length>0&&(
            <div style={{padding:"10px 16px",background:T.greyBg,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:12,fontWeight:600,color:T.text}}>{tA.filter(function(a){return !a.suppressed;}).length} aktywności dzisiaj</span>
              <span style={{fontSize:12,fontWeight:700,color:T.navy}}>+{p.today.pts} pkt łącznie</span>
            </div>
          )}
        </Card>
      </div>

      {/* ── WCZEŚNIEJ ───────────────────── */}
      {pA.length>0&&(
        <div style={{padding:"20px 20px 0"}}>
          <div style={{fontSize:14,fontWeight:600,color:T.grey,marginBottom:12}}>Wcześniej</div>
          <Card>
            {pA.slice(0,3).map(function(a,i){
              return (
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<2&&i<pA.length-1?"1px solid "+T.border:"none"}}>
                  <div style={{width:36,height:36,borderRadius:10,background:(CAT_COL[a.cat]||T.navy)+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{a.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.type}</div>
                    <div style={{fontSize:11,color:T.grey,marginTop:2}}>{a.stat} · {a.ago}</div>
                  </div>
                  <span style={{fontSize:14,fontWeight:700,color:T.grey}}>+{a.pts}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* ── CTAs ────────────────────────── */}
      <div style={{padding:"24px 20px 0"}}>
        <PrimaryBtn dark onClick={p.onAdd} style={{marginBottom:12}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Dodaj aktywność
        </PrimaryBtn>
        <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
          <GhostBtn>Synchronizuj integracje</GhostBtn>
        </div>
      </div>

      {/* ── SEKCJA: PRZYPOMNIENIE O ĆWICZENIU ── */}
      {p.reminder&&(
        <div style={{padding:"24px 20px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:17,fontWeight:800,color:T.text}}>Przypomnienie o ćwiczeniu</div>
            <button onClick={p.onGoSettings} className="tap"
              style={{background:"none",border:"none",fontSize:12,fontWeight:600,color:T.blue,cursor:"pointer",fontFamily:"inherit",padding:0}}>
              Ustawienia
            </button>
          </div>

          {p.reminder.enabled?(
            <Card style={{overflow:"hidden"}}>
              {/* Header strip */}
              <div style={{background:T.navy,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:-28,right:-28,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
                <div style={{position:"absolute",bottom:-20,left:80,width:70,height:70,borderRadius:"50%",background:"rgba(12,80,147,0.4)"}}/>

                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:20}}>⏰</span>
                      <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.6)"}}>Codziennie o {p.reminder.time}</span>
                    </div>
                    <div style={{fontSize:19,fontWeight:800,color:"#fff",letterSpacing:-0.3}}>5 minut aktywności</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:4}}>
                      {(p.reminder.days||[0,1,2,3,4]).length===7?"Każdy dzień":
                       (p.reminder.days||[0,1,2,3,4]).length===5&&!(p.reminder.days||[]).includes(5)&&!(p.reminder.days||[]).includes(6)?"Pon – Pt":
                       ["Pn","Wt","Śr","Cz","Pt","So","Nd"].filter(function(_,i){return (p.reminder.days||[0,1,2,3,4]).includes(i);}).join(", ")}
                    </div>
                  </div>
                  {/* Bonus badge */}
                  <div style={{background:"rgba(255,255,255,0.12)",borderRadius:12,padding:"8px 14px",textAlign:"center",flexShrink:0}}>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:600}}>BONUS</div>
                    <div style={{fontSize:22,fontWeight:900,color:"#fff",lineHeight:1.1}}>+{QUICK_BONUS}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.45)"}}>pkt extra</div>
                  </div>
                </div>
              </div>

              {/* Quick activity tiles — photo cards */}
              <div style={{padding:"16px 16px 6px"}}>
                <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:12}}>WYBIERZ ĆWICZENIE NA DZIŚ</div>
                <div className="hs" style={{gap:12,paddingBottom:14}}>
                  {QUICK_ACTS.map(function(a){
                    var pts=Math.round(a.met*5/10)+QUICK_BONUS;
                    return (
                      <button key={a.id} onClick={function(){p.onOpenQuick();}} className="tap"
                        style={{flexShrink:0,width:148,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        <div style={{borderRadius:16,overflow:"hidden",border:"1.5px solid "+T.border,background:T.card}}>
                          {/* Photo area */}
                          <div style={{height:90,background:"linear-gradient(145deg,"+a.col+"22,"+a.col+"44)",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <img
                              src={a.photo}
                              alt={a.name}
                              style={{width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0,opacity:0.45}}
                              onError={function(e){e.target.style.display="none";}}
                            />
                            {/* Icon overlay */}
                            <div style={{position:"relative",zIndex:1,width:46,height:46,borderRadius:14,background:"rgba(255,255,255,0.85)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 2px 12px rgba(0,0,0,0.12)"}}>
                              {a.icon}
                            </div>
                            {/* Points badge */}
                            <div style={{position:"absolute",top:8,right:8,background:T.navy,borderRadius:99,padding:"3px 9px",zIndex:2}}>
                              <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>+{pts}</span>
                            </div>
                          </div>
                          {/* Text */}
                          <div style={{padding:"10px 12px 12px"}}>
                            <div style={{fontSize:12,fontWeight:800,color:T.text,lineHeight:1.3,marginBottom:4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{a.name}</div>
                            <div style={{fontSize:10,color:T.grey,lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{a.sub}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CTA row */}
              <div style={{padding:"0 16px 16px",display:"flex",gap:10}}>
                <button onClick={p.onOpenQuick} className="tap"
                  style={{flex:1,background:T.navy,color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <span style={{fontSize:15}}>▶</span>
                  Zacznij 5 minut
                </button>
                <button onClick={p.onGoSettings} className="tap"
                  style={{width:46,background:T.card,border:"1.5px solid "+T.border,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:17}}>
                  ⚙️
                </button>
              </div>

              {/* Stats footer */}
              <div style={{borderTop:"1px solid "+T.border,padding:"11px 16px",display:"flex",gap:0}}>
                {[
                  {v:p.reminderStats?p.reminderStats.done:"0",    l:"wykonanych"},
                  {v:p.reminderStats?p.reminderStats.streak+"d":"-",l:"passa"},
                  {v:p.reminderStats?"+"+p.reminderStats.pts+" pkt":"—",l:"z przypomnień"},
                ].map(function(s,i){
                  return (
                    <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?"1px solid "+T.border:"none"}}>
                      <div style={{fontSize:16,fontWeight:800,color:T.text}}>{s.v}</div>
                      <div style={{fontSize:10,color:T.grey,marginTop:2}}>{s.l}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ):(
            /* Disabled state */
            <Card style={{padding:"20px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:48,height:48,borderRadius:14,background:T.greyBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>⏰</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:T.text}}>Przypomnienia wyłączone</div>
                <div style={{fontSize:12,color:T.grey,marginTop:3}}>Włącz w ustawieniach i zdobywaj +{QUICK_BONUS} pkt dziennie</div>
              </div>
              <button onClick={p.onGoSettings} className="tap"
                style={{background:T.navy,border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                Włącz
              </button>
            </Card>
          )}
        </div>
      )}

      {/* ECO strip */}
      <div style={{margin:"20px 20px 0",background:"#E8F5E9",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:22}}>🌱</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#1B5E20"}}>{p.myStats.co2.toFixed(1)} kg CO₂ zaoszczędzone</div>
          <div style={{fontSize:11,color:"#388E3C",marginTop:2}}>{p.myStats.commuteRides||0} dojazdów rowerem w czerwcu</div>
        </div>
      </div>
    </div>
  );
}

/* ─── SCREEN: RANKING ────────────────── */
function Ranking(p){
  var [tab,setTab]=useState("ind");
  var co=COS[MY_CO];
  var all=OTHERS.concat([{id:3,name:p.displayName,ava:p.displayInitials,pts:p.myPts,co:MY_CO,isMe:true}])
    .sort(function(a,b){return b.pts-a.pts;}).map(function(x,i){return Object.assign({},x,{rank:i+1});});
  var firm=all.filter(function(x){return x.co===MY_CO;}).map(function(x,i){return Object.assign({},x,{fr:i+1});});
  var myG=all.find(function(x){return x.isMe;});
  var myF=firm.find(function(x){return x.isMe;});
  var list=tab==="ind"?all:firm;
  /* nagłówek kurczy się i przypina przy scrollu (jak na ekranie głównym) */
  var sy=p.scrollY||0;
  var hp=Math.min(1,Math.max(0,(sy-20)/90));
  var hPadTop=Math.round(56+(16-56)*hp), hPadBot=Math.round(28+(12-28)*hp);
  var hTitle=Math.round(28+(20-28)*hp), hSubOp=Math.max(0,1-hp*2.6);

  return (
    <div style={{paddingBottom:28}}>
      {/* Sticky: nagłówek + zakładki — kurczą się i zostają przypięte */}
      <div style={{position:"sticky",top:0,zIndex:50}}>
        <div style={{background:T.navy,padding:hPadTop+"px 24px "+hPadBot+"px",position:"relative",overflow:"hidden",transition:"padding .18s ease",boxShadow:hp>0.1?"0 4px 20px rgba(24,28,51,0.25)":"none"}}>
          <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
          <div style={{fontSize:hTitle,fontWeight:800,color:"#fff",letterSpacing:-0.5,transition:"font-size .18s ease"}}>Ranking</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:4,opacity:hSubOp,maxHeight:hSubOp<0.05?0:20,overflow:"hidden",transition:"all .18s ease"}}>
            {tab==="ind"?(all.length+" uczestników · "+Object.keys(COS).length+" firm"):(firm.length+" pracowników · "+co.name)}
          </div>
        </div>
        <div style={{background:T.bg,padding:"10px 20px"}}>
          <Card style={{padding:"4px",display:"flex",gap:4}}>
            {[["ind","Wszyscy"],["firm","Moja firma"]].map(function(q){
              return (
                <button key={q[0]} onClick={function(){setTab(q[0]);}} className="tap"
                  style={{flex:1,background:tab===q[0]?T.navy:T.card,color:tab===q[0]?"#fff":T.grey,border:"none",borderRadius:12,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"background .2s,color .2s"}}>
                  {q[1]}
                </button>
              );
            })}
          </Card>
        </div>
      </div>

      <div style={{padding:"14px 20px 0"}}>
        {/* Podium */}
        {list.length>=3&&(
          <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:20}}>
            {[list[1],list[0],list[2]].map(function(q,idx){
              if(!q)return <div key={idx} style={{flex:1}}/>;
              var h=[88,116,68][idx];
              var mx=["🥈","🥇","🥉"][idx];
              var col=["#9B9B9B","#F5A623","#C87820"][idx];
              return (
                <div key={q.id} style={{flex:1,textAlign:"center"}}>
                  <Ava text={q.ava} size={idx===1?44:36}/>
                  <div style={{fontSize:11,fontWeight:700,color:q.isMe?T.navy:T.text,margin:"6px 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.name.split(" ")[0]}{q.isMe?" ★":""}</div>
                  {tab==="ind"&&<div style={{fontSize:9,color:T.grey,marginBottom:4}}>{coShort(q.co)}</div>}
                  <Card style={{borderRadius:"12px 12px 0 0",height:h,borderColor:col+"60",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,background:q.isMe?T.navy+"08":T.card}}>
                    <span style={{fontSize:idx===1?24:18}}>{mx}</span>
                    <span style={{fontSize:idx===1?14:12,fontWeight:800,color:col}}>{q.pts.toLocaleString("pl")}</span>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        <Card>
          {list.map(function(q,i){
            var rk=tab==="firm"?q.fr:q.rank;
            return (
              <div key={q.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:q.isMe?T.navy+"06":T.card,borderBottom:i<list.length-1?"1px solid "+T.border:"none"}}>
                <span style={{width:24,fontSize:13,fontWeight:800,color:medal(i),textAlign:"center",flexShrink:0}}>{rk}</span>
                <Ava text={q.ava} size={36}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:q.isMe?700:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.name}{q.isMe?" (Ty)":""}</div>
                  <div style={{fontSize:11,color:T.grey,marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                    {tab==="ind"&&<span style={{width:6,height:6,borderRadius:"50%",background:coDot(q.co),flexShrink:0}}/>}
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tab==="ind"?coLabel(q.co):("Globalnie: #"+q.rank)}</span>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:800,color:T.text}}>{q.pts.toLocaleString("pl")}</div>
                  <div style={{fontSize:10,color:T.grey}}>pkt</div>
                </div>
              </div>
            );
          })}
        </Card>

      </div>

      {/* Sticky: moja pozycja — przypięta do dolnej belki, w obu zakładkach */}
      {myG&&(
        <div style={{position:"sticky",bottom:0,zIndex:50,padding:"12px 14px 14px",background:"linear-gradient(to top,"+T.bg+" 70%,transparent)"}}>
          <div style={{background:T.navy,borderRadius:16,padding:"11px 14px",display:"flex",alignItems:"center",gap:11,boxShadow:"0 6px 22px rgba(24,28,51,0.38)"}}>
            <span style={{width:30,fontSize:16,fontWeight:900,color:"#F5A623",textAlign:"center",flexShrink:0}}>#{tab==="ind"?myG.rank:myF.fr}</span>
            <Ava text={p.displayInitials} size={36}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{p.displayName} (Ty)</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:2}}>
                {tab==="ind"?("Globalnie · "+all.length+" uczestników"):(co.name+" · #"+myG.rank+" globalnie")}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>{myG.pts.toLocaleString("pl")}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>pkt</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SCREEN: FEED ───────────────────── */
/* ─── SEED COMMENTS ─────────────────── */
var SEED_COMMENTS = {
  0: [
    { id:1, user:"Piotr M.",  initials:"PM", text:"Świetna trasa! Jechałaś Wisłostradą?",               ago:"1h",   reported:false },
    { id:2, user:"Karolina P.",initials:"KP",text:"Brawo! Ja dziś tylko 12 km, ale też liczę 😄",       ago:"45 min",reported:false },
    { id:3, user:"Marek K.",  initials:"MK", text:"Damy radę dogonić w rankingu 💪",                    ago:"20 min",reported:false },
  ],
  1: [
    { id:4, user:"Julia S.",  initials:"JS", text:"10 km to mój cel na ten tydzień, jesteś inspiracją!", ago:"3h",  reported:false },
    { id:5, user:"Anna W.",   initials:"AW", text:"Jakie tempo? Pytam bo planuję podobny dystans",       ago:"2h",   reported:false },
    { id:6, user:"Tomasz R.", initials:"TR", text:"Nie robisz tak długo przerw jak ja 😂 Szacun",        ago:"1h",   reported:false },
    { id:7, user:"Marek K.",  initials:"MK", text:"Dobra robota Piotrek! Wyzwanie firmowe rośnie 🚀",    ago:"30 min",reported:false },
    { id:8, user:"Ewa M.",    initials:"EM", text:"Piękna pogoda była dziś rano na bieganie!",           ago:"15 min",reported:false },
  ],
  2: [
    { id:9,  user:"Marek K.", initials:"MK", text:"Też chcę spróbować jogi, polecasz dla początkujących?", ago:"4h", reported:false },
    { id:10, user:"Anna W.",  initials:"AW", text:"Relaks po piątkowym tygodniu, świetny pomysł 🧘",        ago:"3h", reported:false },
  ],
  3: [
    { id:11, user:"Karolina P.",initials:"KP",text:"Basen w tej porze roku jest najlepszy!",              ago:"wcz.", reported:false },
  ],
};

/* safety: strip HTML tags, trim, limit 280 chars */
function sanitize(txt){
  return (txt||"")
    .replace(/<[^>]*>/g,"")       /* no HTML */
    .replace(/[<>]/g,"")          /* stray angle brackets */
    .trim()
    .substring(0,280);
}

/* banned words list (lightweight) */
var BANNED = ["spam","fuck","shit","kurwa","huj","chuj","pizda","jebać","👿"];
function isSafe(txt){
  var lower = txt.toLowerCase();
  return !BANNED.some(function(w){ return lower.includes(w); });
}

/* ─── COMMENTS DRAWER ───────────────── */
function CommentsDrawer(p){
  var [text, setText] = useState("");
  var [error, setError] = useState("");
  var inputRef = useRef(null);
  useEscClose(p.onClose);

  var MAX = 280;
  var remaining = MAX - text.length;

  function handleSubmit(){
    var clean = sanitize(text);
    if(!clean){ setError("Napisz coś przed wysłaniem."); return; }
    if(!isSafe(clean)){ setError("Komentarz narusza zasady społeczności."); return; }
    if(clean.length < 2){ setError("Komentarz jest za krótki."); return; }
    setError("");
    p.onAdd(clean);
    setText("");
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300,backdropFilter:"blur(4px)"}}
      onClick={p.onClose}>
      <div className="mdl" role="dialog" aria-modal="true" onClick={function(e){e.stopPropagation();}}
        style={{width:375,background:T.bg,borderRadius:"24px 24px 0 0",maxHeight:"78vh",display:"flex",flexDirection:"column"}}>

        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",paddingTop:12,flexShrink:0}}>
          <div style={{width:36,height:4,background:T.greyLt,borderRadius:2}}/>
        </div>

        {/* Header */}
        <div style={{padding:"12px 20px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:T.text,letterSpacing:-0.3}}>Komentarze</div>
            <div style={{fontSize:12,color:T.grey,marginTop:2}}>{p.activity.user} · {p.activity.type}</div>
          </div>
          <button onClick={p.onClose} className="tap"
            style={{width:34,height:34,borderRadius:10,background:T.card,border:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:17,color:T.grey}}>
            ×
          </button>
        </div>
        <div style={{height:1,background:T.border,flexShrink:0}}/>

        {/* Activity mini-card */}
        <div style={{padding:"12px 20px",background:T.navy,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <Ava text={p.activity.initials} size={36}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{p.activity.user}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:2}}>{p.activity.type} · {p.activity.stat} · {p.activity.ago}</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.12)",borderRadius:99,padding:"4px 12px"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#fff"}}>+{p.activity.pts} pkt</span>
          </div>
        </div>

        {/* Comments list */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 20px 8px",display:"flex",flexDirection:"column",gap:14}}>
          {p.comments.length===0&&(
            <div style={{textAlign:"center",padding:"32px 20px"}}>
              <div style={{fontSize:28,marginBottom:8}}>💬</div>
              <div style={{fontSize:14,fontWeight:600,color:T.text}}>Brak komentarzy</div>
              <div style={{fontSize:12,color:T.grey,marginTop:4}}>Bądź pierwszy — dodaj komentarz poniżej</div>
            </div>
          )}
          {p.comments.map(function(c){
            var isMe = c.user==="Marek K."||c.user===p.displayName;
            if(c.reported){
              return (
                <div key={c.id} style={{padding:"10px 14px",background:T.greyBg,borderRadius:12,border:"1px dashed "+T.border}}>
                  <div style={{fontSize:11,color:T.grey,fontStyle:"italic"}}>Komentarz zgłoszony do moderacji</div>
                </div>
              );
            }
            return (
              <div key={c.id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <Ava text={isMe?p.displayInitials:c.initials} size={32}/>
                <div style={{flex:1}}>
                  <div style={{background:isMe?T.navy:T.card,borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px",padding:"10px 14px",border:isMe?"none":"1px solid "+T.border}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <span style={{fontSize:12,fontWeight:700,color:isMe?"rgba(255,255,255,0.9)":T.text}}>{isMe?p.displayName:c.user}</span>
                      <span style={{fontSize:10,color:isMe?"rgba(255,255,255,0.35)":T.grey}}>{c.ago}</span>
                    </div>
                    <div style={{fontSize:13,color:isMe?"rgba(255,255,255,0.85)":T.text,lineHeight:1.5}}>{c.text}</div>
                  </div>
                  {/* Report button — only for others */}
                  {!isMe&&(
                    <button onClick={function(){ if(window.confirm("Zgłosić ten komentarz do moderacji?")) p.onReport(c.id); }} className="tap"
                      style={{background:"none",border:"none",fontSize:10,color:T.grey,cursor:"pointer",fontFamily:"inherit",marginTop:4,padding:"2px 0"}}>
                      Zgłoś
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Safety notice */}
        <div style={{padding:"6px 20px 0",flexShrink:0}}>
          <div style={{background:"#F0F4FF",borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12}}>🛡</span>
            <span style={{fontSize:10,color:T.blue,fontWeight:500}}>Komentarze widoczne wyłącznie w ramach firmy VanityStyle Sp. z o.o.</span>
          </div>
        </div>

        {/* Input row */}
        <div style={{padding:"10px 20px 28px",flexShrink:0}}>
          {error&&(
            <div style={{background:"#FFEBEE",borderRadius:10,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12}}>⚠️</span>
              <span style={{fontSize:12,color:T.red,fontWeight:500}}>{error}</span>
            </div>
          )}
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <Ava text={p.displayInitials} size={34}/>
            <div style={{flex:1,background:T.card,border:"1.5px solid "+(error?T.red:text.length>0?T.navy:T.border),borderRadius:16,padding:"10px 14px",transition:"border-color 0.15s"}}>
              <textarea
                ref={inputRef}
                value={text}
                onChange={function(e){ setText(e.target.value.substring(0,MAX)); setError(""); }}
                onKeyDown={function(e){ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSubmit();} }}
                placeholder="Napisz komentarz… (Enter aby wysłać)"
                rows={1}
                style={{width:"100%",background:"none",border:"none",outline:"none",fontSize:13,color:T.text,fontFamily:"inherit",resize:"none",lineHeight:1.5,display:"block"}}
              />
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:4}}>
                <span style={{fontSize:10,color:remaining<20?T.red:T.grey}}>{remaining}</span>
              </div>
            </div>
            <button onClick={handleSubmit} className="tap"
              style={{width:40,height:40,borderRadius:12,background:text.trim().length>0?T.navy:T.greyBg,border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"background 0.15s",flexShrink:0}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={text.trim().length>0?"#fff":T.grey} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── SCREEN: FEED ───────────────────── */
function Feed(p){
  var [liked,   setLiked]   = useState({});
  var [comments,setComments]= useState(SEED_COMMENTS);
  var [openIdx, setOpenIdx] = useState(null);   /* index of activity with open drawer */
  var nextId = useRef(100);

  function openComments(i){ setOpenIdx(i); }
  function closeComments(){ setOpenIdx(null); }

  /* Comments are keyed by the feed item's stable id — not its array
     index — because new activities are prepended, shifting indices. */
  function addComment(feedId, text){
    var clean = sanitize(text);
    if(!clean || !isSafe(clean)) return;
    var newC = {
      id: nextId.current++,
      user:p.displayName,
      initials:p.displayInitials,
      text: clean,
      ago:"teraz",
      reported:false,
    };
    setComments(function(prev){
      var existing = prev[feedId] || [];
      var next = Object.assign({},prev);
      next[feedId] = existing.concat([newC]);
      return next;
    });
  }

  /* Mark a comment reported — persisted on the comment object so it
     survives closing/reopening the drawer and updates the count. */
  function reportComment(feedId, cid){
    setComments(function(prev){
      var next = Object.assign({},prev);
      next[feedId] = (prev[feedId]||[]).map(function(c){
        return c.id===cid ? Object.assign({},c,{reported:true}) : c;
      });
      return next;
    });
  }

  var sy=p.scrollY||0;
  var hp=Math.min(1,Math.max(0,(sy-20)/90));
  var hPadTop=Math.round(56+(16-56)*hp), hPadBot=Math.round(28+(12-28)*hp);
  var hTitle=Math.round(28+(20-28)*hp), hSubOp=Math.max(0,1-hp*2.6);
  return (
    <div style={{paddingBottom:28}}>
      {/* nagłówek kurczy się i zostaje przypięty przy scrollu */}
      <div style={{background:T.navy,padding:hPadTop+"px 24px "+hPadBot+"px",position:"sticky",top:0,zIndex:50,overflow:"hidden",transition:"padding .18s ease",boxShadow:hp>0.1?"0 4px 20px rgba(24,28,51,0.25)":"none"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <div style={{fontSize:hTitle,fontWeight:800,color:"#fff",letterSpacing:-0.5,transition:"font-size .18s ease"}}>Aktywności</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:4,opacity:hSubOp,maxHeight:hSubOp<0.05?0:20,overflow:"hidden",transition:"all .18s ease"}}>Co nowego w firmach?</div>
      </div>

      <div style={{padding:"20px 20px 0",display:"flex",flexDirection:"column",gap:14}}>
        {p.feed.map(function(it,i){
          var actComments = comments[it.id] || [];
          var comCount    = actComments.filter(function(c){ return !c.reported; }).length;

          return (
            <Card key={it.id} className={it.isNew?"ni":""} style={{overflow:"hidden",borderColor:it.isNew?T.blue+"50":T.border}}>
              {/* Author row */}
              <div style={{padding:"16px 16px 12px",display:"flex",alignItems:"center",gap:12}}>
                <Ava text={it.initials} size={42}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:T.text}}>{it.user}</div>
                  <div style={{fontSize:13,color:T.grey,marginTop:2}}>{it.type} · {it.stat}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  {it.isNew&&<Pill label="Nowe" col={T.blue} bg={T.blue+"14"} border={T.blue+"28"}/>}
                  {it.ok&&!it.isNew&&<Pill label="GPS" col="#2E7D32" bg="#2E7D3214" border="#2E7D3228"/>}
                  <span style={{fontSize:11,color:T.grey}}>{it.ago}</span>
                </div>
              </div>

              {/* Inline steps widget for step entries */}
              {it.cat==="step"&&it.steps&&(
                <div style={{padding:"0 16px 12px"}}>
                  <StepsWidget steps={it.steps} weekData={it.weekSteps||WEEK_STEPS_SEED}/>
                </div>
              )}

              {/* Category */}
              <div style={{padding:"0 16px 12px",display:"flex",alignItems:"center",gap:8}}>
                <CatChip cat={it.cat}/>
                {it.verif&&<VerifBadge verif={it.verif}/>}
              </div>

              {/* Preview of latest comment (if any) */}
              {actComments.length>0&&(function(){
                var last = actComments.filter(function(c){return !c.reported;}).slice(-1)[0];
                if(!last) return null;
                return (
                  <button onClick={function(){openComments(i);}} className="tap"
                    style={{margin:"0 16px 12px",padding:"10px 12px",background:T.greyBg,borderRadius:12,border:"1px solid "+T.border,width:"calc(100% - 32px)",textAlign:"left",fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                    <Ava text={(last.user==="Marek K."||last.user===p.displayName)?p.displayInitials:last.initials} size={24}/>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontSize:12,fontWeight:700,color:T.text}}>{(last.user==="Marek K."||last.user===p.displayName)?p.displayName:last.user} </span>
                      <span style={{fontSize:12,color:T.grey,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline"}}>{last.text}</span>
                    </div>
                    {comCount>1&&<span style={{fontSize:11,color:T.blue,fontWeight:600,flexShrink:0}}>+{comCount-1}</span>}
                  </button>
                );
              })()}

              {/* Action bar */}
              <div style={{borderTop:"1px solid "+T.border,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",gap:4}}>
                  {/* Like */}
                  <button onClick={function(){setLiked(function(l){var n=Object.assign({},l);n[i]=!l[i];return n;});}} className="tap"
                    style={{background:"none",border:"1px solid "+(liked[i]?T.red+"40":T.border),borderRadius:99,padding:"6px 12px",color:liked[i]?T.red:T.grey,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                    {liked[i]?"❤":"🤍"} {(it.likes||0)+(liked[i]?1:0)}
                  </button>
                  {/* Comment */}
                  <button onClick={function(){openComments(i);}} className="tap"
                    style={{background:"none",border:"1px solid "+(openIdx===i?T.navy+"40":T.border),borderRadius:99,padding:"6px 12px",color:openIdx===i?T.navy:T.grey,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                    💬 {comCount}
                  </button>
                </div>
                <div style={{background:T.navy,borderRadius:99,padding:"4px 12px"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#fff"}}>+{it.pts} pkt</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Comments drawer */}
      {openIdx!==null&&(
        <CommentsDrawer
          displayName={p.displayName}
          displayInitials={p.displayInitials}
          activity={p.feed[openIdx]}
          comments={comments[p.feed[openIdx].id]||[]}
          onClose={closeComments}
          onAdd={function(text){ addComment(p.feed[openIdx].id,text); }}
          onReport={function(cid){ reportComment(p.feed[openIdx].id,cid); }}
        />
      )}
    </div>
  );
}

/* ─── SCREEN: NAGRODY (dawniej Karta) ─── */

/* Modal odbioru nagrody — potwierdzenie, odjęcie punktów, pobranie kuponu */
function RedeemModal(p){
  var [stage,setStage]=useState("confirm");   // confirm | done
  var [code,setCode]=useState("");
  useEscClose(p.onClose);
  var r=p.reward;
  var can=p.myPts>=r.cost;
  var after=p.myPts-r.cost;

  function confirm(){
    if(!can) return;
    var c=p.onRedeem(r);        // App odejmuje punkty, zapisuje kupon, zwraca kod
    setCode(c);
    setStage("done");
  }
  function download(){
    var txt=[
      "FITPROFIT — KUPON / VOUCHER",
      "--------------------------------",
      r.name,
      r.sub||"",
      "",
      "Kod: "+code,
      "Wartość: "+r.cost+" pkt",
      "Data odbioru: "+fmtDate(new Date()),
      "",
      "VanityStyle Sp. z o.o.  ·  support@vanitystyle.pl",
    ].join("\n");
    var url=URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"}));
    var a=document.createElement("a");
    a.href=url; a.download="kupon-"+code+".txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},800);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:340,backdropFilter:"blur(6px)"}} onClick={p.onClose}>
      <div className="mdl" role="dialog" aria-modal="true" onClick={function(e){e.stopPropagation();}}
        style={{width:375,background:T.bg,borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",paddingTop:12,marginBottom:2}}>
          <div style={{width:36,height:4,background:T.greyLt,borderRadius:2}}/>
        </div>

        <div style={{height:118,background:r.g||T.navy,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
          {r.img
            ? <img src={r.img} alt={r.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            : <span style={{fontSize:48}}>{r.icon}</span>}
        </div>

        {stage==="confirm"&&(
          <div style={{padding:"18px 24px 38px"}}>
            <div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:-0.3}}>{r.name}</div>
            {r.sub&&<div style={{fontSize:13,color:T.grey,marginTop:4,lineHeight:1.5}}>{r.sub}</div>}

            <Card style={{marginTop:18}}>
              <div style={{padding:"13px 16px",display:"flex",justifyContent:"space-between",borderBottom:"1px solid "+T.border}}>
                <span style={{fontSize:13,color:T.grey}}>Twoje punkty</span>
                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{p.myPts.toLocaleString("pl")} pkt</span>
              </div>
              <div style={{padding:"13px 16px",display:"flex",justifyContent:"space-between",borderBottom:"1px solid "+T.border}}>
                <span style={{fontSize:13,color:T.grey}}>Koszt nagrody</span>
                <span style={{fontSize:13,fontWeight:700,color:T.red}}>− {r.cost.toLocaleString("pl")} pkt</span>
              </div>
              <div style={{padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:700,color:T.text}}>Pozostanie</span>
                <span style={{fontSize:17,fontWeight:800,color:can?T.navy:T.red}}>{after.toLocaleString("pl")} pkt</span>
              </div>
            </Card>

            {!can&&(
              <div style={{background:"#FFEBEE",borderRadius:12,padding:"10px 14px",marginTop:14,display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:14}}>⚠️</span>
                <span style={{fontSize:12,color:T.red,fontWeight:600}}>Brakuje {(r.cost-p.myPts).toLocaleString("pl")} pkt do odebrania tej nagrody</span>
              </div>
            )}

            <PrimaryBtn dark={can} onClick={confirm} style={{marginTop:18,opacity:can?1:0.45}}>
              {can?"Odbierz za "+r.cost+" pkt":"Za mało punktów"}
            </PrimaryBtn>
            <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
              <GhostBtn onClick={p.onClose}>Anuluj</GhostBtn>
            </div>
          </div>
        )}

        {stage==="done"&&(
          <div style={{padding:"22px 24px 38px",textAlign:"center"}}>
            <div style={{fontSize:46,marginBottom:6}}>🎉</div>
            <div style={{fontSize:21,fontWeight:800,color:T.text,letterSpacing:-0.3}}>Nagroda odebrana!</div>
            <div style={{fontSize:13,color:T.grey,marginTop:4,marginBottom:18}}>{r.cost} pkt zostało odjęte z Twojego konta</div>

            <div style={{border:"1.5px dashed "+T.navy+"45",borderRadius:14,padding:"15px",background:T.card,marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,color:T.grey,letterSpacing:1,marginBottom:6}}>KOD KUPONU</div>
              <div style={{fontFamily:"monospace",fontSize:22,fontWeight:800,color:T.navy,letterSpacing:2}}>{code}</div>
            </div>

            <PrimaryBtn dark onClick={download} style={{marginBottom:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Pobierz kupon
            </PrimaryBtn>
            <GhostBtn onClick={p.onClose}>Gotowe</GhostBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── LOGO CELU CHARYTATYWNEGO ─── pokazuje obraz z panelu, w razie braku — grafikę zastępczą */
function ShelterLogo(p){
  var s=p.size||44;
  var url=CHARITY.img||BRANDING_LOGO;
  if(url){
    return (
      <img src={url} alt={CHARITY.name}
        style={{width:s,height:s,borderRadius:Math.round(s*0.28),objectFit:"cover",flexShrink:0,background:"#fff",boxShadow:"0 3px 10px rgba(0,0,0,0.18)"}}/>
    );
  }
  return (
    <div style={{width:s,height:s,borderRadius:Math.round(s*0.28),background:"linear-gradient(135deg,#F7A93B,#E07B1A)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 3px 10px rgba(224,123,26,0.4)"}}>
      <svg width={Math.round(s*0.58)} height={Math.round(s*0.58)} viewBox="0 0 24 24" fill="#fff">
        <ellipse cx="12" cy="16" rx="5.2" ry="4.3"/>
        <ellipse cx="5.4" cy="9.5" rx="2.5" ry="2.9"/>
        <ellipse cx="18.6" cy="9.5" rx="2.5" ry="2.9"/>
        <ellipse cx="9" cy="5" rx="2.3" ry="2.7"/>
        <ellipse cx="15" cy="5" rx="2.3" ry="2.7"/>
      </svg>
    </div>
  );
}

/* ─── MODAL: przekazanie punktów na cel charytatywny ─── */
function DonateModal(p){
  var GOAL=CHARITY_GOAL;
  var [stage,setStage]=useState("input");
  var [amt,setAmt]=useState("");
  var [sent,setSent]=useState(0);
  useEscClose(p.onClose);
  var max=p.myPts;
  var n=Math.floor(Number(amt))||0;
  var valid=n>0 && n<=max;
  var cpct=Math.min(100,Math.round(p.challPts/GOAL*100));
  var npct=Math.min(100,Math.round((p.challPts+(valid?n:0))/GOAL*100));

  function confirm(){
    if(!valid) return;
    p.onDonate(n);
    setSent(n);
    setStage("done");
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:340,backdropFilter:"blur(6px)"}} onClick={p.onClose}>
      <div className="mdl" role="dialog" aria-modal="true" onClick={function(e){e.stopPropagation();}}
        style={{width:375,background:T.bg,borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",paddingTop:12,marginBottom:6}}>
          <div style={{width:36,height:4,background:T.greyLt,borderRadius:2}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"4px 24px 12px"}}>
          <ShelterLogo size={48}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:17,fontWeight:800,color:T.text}}>{CHARITY.name}</div>
            <div style={{fontSize:12,color:T.grey,marginTop:2}}>Wyzwanie firmowe · cel {GOAL.toLocaleString("pl")} pkt</div>
          </div>
        </div>
        <div style={{height:1,background:T.border}}/>

        {stage==="input"&&(
          <div style={{padding:"18px 24px 38px"}}>
            <div style={{fontSize:12,color:T.grey,lineHeight:1.55,marginBottom:14}}>
              {CHARITY.desc}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:12,color:T.grey}}>Zebrano firmowo</span>
              <span style={{fontSize:12,fontWeight:700,color:T.navy}}>{p.challPts.toLocaleString("pl")} / {GOAL.toLocaleString("pl")}</span>
            </div>
            <div style={{position:"relative",background:T.greyBg,borderRadius:99,height:9,overflow:"hidden",marginBottom:18}}>
              <div style={{position:"absolute",top:0,left:0,bottom:0,width:npct+"%",background:T.blue+"55",borderRadius:99,transition:"width .25s"}}/>
              <div style={{position:"absolute",top:0,left:0,bottom:0,width:cpct+"%",background:T.navy,borderRadius:99}}/>
            </div>

            <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:8}}>ILE PUNKTÓW PRZEKAZAĆ?</div>
            <input type="text" inputMode="numeric" value={amt} placeholder="0"
              onChange={function(e){setAmt(e.target.value.replace(/[^0-9]/g,"").slice(0,6));}}
              style={{width:"100%",border:"1.5px solid "+(n>max?T.red:T.border),borderRadius:14,padding:"14px 16px",fontSize:22,fontWeight:800,color:T.text,fontFamily:"inherit",background:T.card,outline:"none",textAlign:"center"}}/>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              {[100,500,1000].map(function(v){
                return (
                  <button key={v} onClick={function(){setAmt(String(Math.min(v,max)));}} className="tap"
                    style={{flex:1,background:T.card,border:"1px solid "+T.border,borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,color:T.navy,cursor:"pointer",fontFamily:"inherit"}}>
                    {v}
                  </button>
                );
              })}
              <button onClick={function(){setAmt(String(max));}} className="tap"
                style={{flex:1,background:T.card,border:"1px solid "+T.border,borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,color:T.navy,cursor:"pointer",fontFamily:"inherit"}}>
                Wszystkie
              </button>
            </div>
            <div style={{fontSize:11,color:n>max?T.red:T.grey,marginTop:10,fontWeight:n>max?700:500}}>
              {n>max?"Nie masz tylu punktów":"Twoje saldo: "+max.toLocaleString("pl")+" pkt"}
            </div>

            <PrimaryBtn dark={valid} onClick={confirm} style={{marginTop:16,opacity:valid?1:0.45}}>
              {valid?"Przekaż "+n.toLocaleString("pl")+" pkt":"Podaj liczbę punktów"}
            </PrimaryBtn>
            <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
              <GhostBtn onClick={p.onClose}>Anuluj</GhostBtn>
            </div>
          </div>
        )}

        {stage==="done"&&(
          <div style={{padding:"24px 24px 40px",textAlign:"center"}}>
            <div style={{fontSize:46,marginBottom:8}}>🐾</div>
            <div style={{fontSize:21,fontWeight:800,color:T.text,letterSpacing:-0.3}}>Dziękujemy!</div>
            <div style={{fontSize:13,color:T.grey,marginTop:6,lineHeight:1.55}}>
              Przekazano <b style={{color:T.navy}}>{sent.toLocaleString("pl")} pkt</b> na {CHARITY.name}. Twoje punkty zasiliły wspólną pulę firmy.
            </div>
            <PrimaryBtn dark onClick={p.onClose} style={{marginTop:20}}>Gotowe</PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function Nagrody(p){
  var co=COS[MY_CO];
  var tot=CHARITY_GOAL;
  var cpct=Math.min(100,Math.round(p.challPts/tot*100));
  var nxt=REW.find(function(r){return r.cost>p.myPts;})||REW[REW.length-1];
  var npct=Math.min(100,Math.round(p.myPts/nxt.cost*100));

  var sy=p.scrollY||0;
  var hp=Math.min(1,Math.max(0,(sy-20)/90));
  var hPadTop=Math.round(56+(14-56)*hp), hPadBot=Math.round(30+(12-30)*hp);
  var hTitle=Math.round(28+(20-28)*hp), hSubOp=Math.max(0,1-hp*2.6);
  var hBal=Math.round(40+(24-40)*hp), hBalMt=Math.round(20+(6-20)*hp);
  return (
    <div style={{paddingBottom:28}}>
      {/* Hero — kurczy się i zostaje przypięty; saldo punktów pozostaje widoczne */}
      <div style={{background:T.navy,padding:hPadTop+"px 24px "+hPadBot+"px",position:"sticky",top:0,zIndex:50,overflow:"hidden",transition:"padding .18s ease",boxShadow:hp>0.1?"0 4px 20px rgba(24,28,51,0.25)":"none"}}>
        <div style={{position:"absolute",top:-50,right:-50,width:200,height:200,borderRadius:"50%",background:"rgba(44,52,104,0.6)"}}/>
        <div style={{position:"absolute",bottom:-40,left:20,width:120,height:120,borderRadius:"50%",background:"rgba(12,80,147,0.4)"}}/>
        <div style={{fontSize:hTitle,fontWeight:800,color:"#fff",letterSpacing:-0.5,position:"relative",transition:"font-size .18s ease"}}>Nagrody</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:4,position:"relative",opacity:hSubOp,maxHeight:hSubOp<0.05?0:20,overflow:"hidden",transition:"all .18s ease"}}>Wyzwanie firmowe · historia wizyt · kupony do pobrania</div>
        <div style={{marginTop:hBalMt,display:"flex",alignItems:"baseline",gap:8,position:"relative",transition:"margin .18s ease"}}>
          <div style={{fontSize:hBal,fontWeight:900,color:"#fff",letterSpacing:-1.5,lineHeight:1,transition:"font-size .18s ease"}}>{p.myPts.toLocaleString("pl")}</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.5)",fontWeight:500}}>punktów do wydania</div>
        </div>
      </div>

      <div style={{padding:"22px 20px 0"}}>
        {/* ── WYZWANIE FIRMOWE (przeniesione z sekcji Głównej) ── */}
        <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:12}}>WYZWANIE FIRMOWE</div>
        <Card style={{padding:0,marginBottom:26,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"16px 18px 12px"}}>
            <ShelterLogo size={46}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>{CHARITY.name}</div>
              <div style={{fontSize:11,color:T.grey,marginTop:2}}>Zbiórka punktów · {co.name} · pozostało 8 dni</div>
            </div>
            <div style={{fontSize:22,fontWeight:800,color:T.navy}}>{cpct}%</div>
          </div>
          <div style={{padding:"0 18px 16px"}}>
            <div style={{background:T.greyBg,borderRadius:99,height:8,overflow:"hidden",marginBottom:7}}>
              <div style={{width:cpct+"%",height:"100%",background:"linear-gradient(90deg,"+T.blue+","+T.navy+")",borderRadius:99,transition:"width .7s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:700,color:T.text}}>{p.challPts.toLocaleString("pl")} / {tot.toLocaleString("pl")} pkt</span>
              <span style={{fontSize:11,color:T.grey}}>cel zbiórki</span>
            </div>
            <div style={{fontSize:12,color:T.grey,lineHeight:1.55,marginBottom:14}}>
              {CHARITY.desc}
            </div>
            <PrimaryBtn dark onClick={p.onOpenDonate}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              Przekaż punkty
            </PrimaryBtn>
          </div>
        </Card>

        {/* ── RZECZY DO POBRANIA ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
          <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8}}>RZECZY DO POBRANIA</div>
          <div style={{fontSize:11,color:T.grey}}>{p.myPts.toLocaleString("pl")} pkt</div>
        </div>
        <div style={{fontSize:12,color:T.grey,marginBottom:14,lineHeight:1.55}}>Wymień punkty na kupony i vouchery — po odebraniu pobierzesz kod kuponu.</div>

        <Card style={{padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:12,color:T.grey}}>Najbliższa nagroda: {nxt.name}</span>
            <span style={{fontSize:12,fontWeight:700,color:T.navy}}>{npct}%</span>
          </div>
          <div style={{background:T.greyBg,borderRadius:99,height:6,overflow:"hidden"}}>
            <div style={{width:npct+"%",height:"100%",background:T.navy,borderRadius:99,transition:"width .7s"}}/>
          </div>
        </Card>

        {/* siatka nagród — klikalne kafelki */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {REW.map(function(r,i){
            var can=p.myPts>=r.cost;
            return (
              <button key={i} onClick={function(){p.onPickReward(r);}} className="tap"
                style={{textAlign:"left",padding:0,border:"1px solid "+(can?(r.col||T.navy)+"50":T.border),borderRadius:16,overflow:"hidden",background:T.card,cursor:"pointer",fontFamily:"inherit"}}>
                <div style={{height:84,background:r.g||T.navy,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",opacity:can?1:0.6}}>
                  {r.img
                    ? <img src={r.img} alt={r.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <span style={{fontSize:34}}>{r.icon}</span>}
                  <div style={{position:"absolute",top:7,right:7,background:can?"rgba(255,255,255,0.22)":"rgba(0,0,0,0.32)",borderRadius:7,padding:"3px 8px"}}>
                    <span style={{fontSize:8,fontWeight:900,color:"#fff",letterSpacing:0.5}}>{can?"DOSTĘPNE":"ZBIERAJ"}</span>
                  </div>
                </div>
                <div style={{padding:"10px 12px 4px"}}>
                  <div style={{fontSize:12,fontWeight:800,color:T.text,lineHeight:1.35}}>{r.name}</div>
                  {r.sub&&<div style={{fontSize:10,color:T.grey,marginTop:3,lineHeight:1.4}}>{r.sub}</div>}
                </div>
                <div style={{padding:"6px 12px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{background:can?(r.col||T.navy):T.greyBg,borderRadius:99,padding:"4px 12px"}}>
                    <span style={{fontSize:11,fontWeight:800,color:can?"#fff":T.grey}}>{r.cost} pkt</span>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:can?T.navy:T.grey}}>{can?"Pobierz →":"—"}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── TWOJE KUPONY (po odebraniu) ── */}
        {p.redeemed&&p.redeemed.length>0&&(
          <div style={{marginTop:26}}>
            <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:12}}>TWOJE KUPONY ({p.redeemed.length})</div>
            <Card>
              {p.redeemed.map(function(rd,i){
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<p.redeemed.length-1?"1px solid "+T.border:"none"}}>
                    <div style={{width:38,height:38,borderRadius:11,background:T.navy+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,overflow:"hidden"}}>
                      {rd.img
                        ? <img src={rd.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : rd.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rd.name}</div>
                      <div style={{fontSize:11,color:T.grey,marginTop:2,fontFamily:"monospace"}}>{rd.code} · {rd.date}</div>
                    </div>
                    <div style={{background:"#E8F5E9",borderRadius:99,padding:"3px 10px"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#2E7D32"}}>−{rd.cost}</span>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SCREEN: REGULAMIN ──────────────── */
function Regulamin(p){
  useEscClose(p.onBack);
  var sections=[
    {
      title:"§1 Postanowienia ogólne",
      body:[
        "1. Aplikacja FitProfit (dalej: Aplikacja) jest prowadzona przez VanityStyle Sp. z o.o. z siedzibą w Warszawie, ul. Sportowa 1, 00-001 Warszawa, KRS: 0000000000.",
        "2. Aplikacja umożliwia pracownikom firm korzystających z kart FitProfit/FitSport uczestnictwo w wyzwaniach sportowych i zbieranie punktów za aktywność fizyczną.",
        "3. Korzystanie z Aplikacji jest dobrowolne i bezpłatne dla użytkownika końcowego — koszty pokrywa pracodawca w ramach pakietu benefitów.",
        "4. Przystąpienie do korzystania z Aplikacji oznacza akceptację niniejszego Regulaminu.",
      ]
    },
    {
      title:"§2 Rejestracja i konto użytkownika",
      body:[
        "1. Konto użytkownika zakładane jest przez administratora firmy lub automatycznie przy pierwszym logowaniu z adresem e-mail domeny firmowej.",
        "2. Użytkownik zobowiązany jest do podania prawdziwych danych osobowych.",
        "3. Jeden użytkownik może posiadać wyłącznie jedno konto. Zakładanie kont w celu wyłudzenia punktów jest zabronione i skutkuje usunięciem konta.",
        "4. Użytkownik odpowiada za bezpieczeństwo swojego hasła i nie powinien go udostępniać osobom trzecim.",
      ]
    },
    {
      title:"§3 Zasady naliczania punktów",
      body:[
        "1. Punkty naliczane są zgodnie z aktualną tabelą punktacji dostępną w zakładce Zasady.",
        "2. Dzienny limit punktów w każdej kategorii określa aktualna konfiguracja wyzwania (tabela w zakładce Zasady).",
        "3. Aktywności dodawane ręcznie wymagają dokumentacji zdjęciem wykonanym w dniu ćwiczenia. Metadane EXIF zdjęcia są weryfikowane przez system.",
        "4. VanityStyle zastrzega sobie prawo do weryfikacji i anulowania punktów przyznanych w sposób niezgodny z Regulaminem.",
        "5. Passa (streak) liczona jest od pierwszego dnia aktywności i resetuje się przy nieaktywności przez pełny dzień kalendarzowy lub przy nowej edycji wyzwania.",
      ]
    },
    {
      title:"§4 Nagrody i wymiana punktów",
      body:[
        "1. Zebrane punkty można wymieniać na nagrody dostępne w sekcji Karta — Nagrody.",
        "2. Nagrody mają charakter voucherów i kuponów partnerów VanityStyle. Termin ważności każdego vouchera podany jest w jego treści.",
        "3. Wymiana punktów jest nieodwracalna. Punkty po wymianie nie podlegają zwrotowi.",
        "4. Voucher QlturaProfit uprawnia do jednorazowego wstępu na wybrane wydarzenie kulturalne z oferty VanityStyle.",
        "5. Voucher -50% Prezent Marzeń obowiązuje na jeden produkt z aktualnego katalogu partnerów. Nie łączy się z innymi promocjami.",
        "6. Kupon DOZ.pl (-40%) jednorazowy, ważny 30 dni od daty aktywacji, minimum zamówienie 30 zł.",
        "7. VanityStyle zastrzega sobie prawo do zmiany katalogu nagród bez wcześniejszego powiadomienia.",
      ]
    },
    {
      title:"§5 Karta FitProfit — check-in QR",
      body:[
        "1. Wejście do obiektu partnerskiego odbywa się przez zeskanowanie kodu QR w Aplikacji przez obsługę obiektu.",
        "2. Punkty za wizytę kartą naliczane są automatycznie przez system VanityStyle na podstawie danych przekazanych przez obiekt.",
        "3. W przypadku problemów z naliczeniem punktów należy zgłosić reklamację w ciągu 14 dni od wizyty.",
        "4. Karta FitProfit jest przypisana do konkretnego pracownika i jest nieprzenoszalna.",
      ]
    },
    {
      title:"§6 Prywatność i dane osobowe",
      body:[
        "1. Administratorem danych osobowych jest VanityStyle Sp. z o.o. Szczegółowe informacje zawiera Polityka Prywatności dostępna na vanitystyle.pl.",
        "2. Dane dotyczące aktywności (dystanse, czasy, lokalizacja GPS) są przetwarzane wyłącznie w celu naliczania punktów i wyświetlania statystyk.",
        "3. Dane aktywności nie są udostępniane pracodawcy w postaci indywidualnych raportów bez zgody pracownika — pracodawca widzi wyłącznie zagregowane statystyki firmowe.",
        "4. Zdjęcia dokumentujące aktywności przechowywane są przez 30 dni od daty dodania, a następnie są usuwane.",
        "5. Użytkownik ma prawo do dostępu, sprostowania, usunięcia danych oraz wniesienia sprzeciwu — kontakt: privacy@vanitystyle.pl",
      ]
    },
    {
      title:"§7 Komentarze i treści społecznościowe",
      body:[
        "1. Użytkownicy mogą komentować aktywności osób ze swojej firmy.",
        "2. Komentarze są widoczne wyłącznie w obrębie pracowników tej samej firmy.",
        "3. Zabronione jest zamieszczanie treści obraźliwych, wulgarnych, niezgodnych z prawem lub naruszających prawa osób trzecich.",
        "4. System automatycznie filtruje niedozwolone treści. Naruszenia można zgłaszać przez przycisk Zgłoś przy komentarzu.",
        "5. VanityStyle zastrzega sobie prawo do usunięcia treści naruszających Regulamin oraz zablokowania konta użytkownika.",
      ]
    },
    {
      title:"§8 Zmiany Regulaminu i kontakt",
      body:[
        "1. VanityStyle zastrzega sobie prawo do zmiany niniejszego Regulaminu. O zmianach użytkownicy zostaną powiadomieni z 14-dniowym wyprzedzeniem.",
        "2. Dalsze korzystanie z Aplikacji po wejściu zmian w życie oznacza ich akceptację.",
        "3. Wszelkie pytania i reklamacje kierować na: support@vanitystyle.pl lub przez formularz w Aplikacji.",
        "4. Regulamin obowiązuje od: 1 czerwca 2025.",
      ]
    },
  ];

  return (
    <div style={{paddingBottom:36}}>
      {/* Hero */}
      <div style={{background:T.navy,padding:"56px 24px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <button onClick={p.onBack} className="tap"
          style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:16,padding:0,display:"flex",alignItems:"center",gap:6}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Ustawienia
        </button>
        <div style={{fontSize:28,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>Regulamin i zasady</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:4}}>FitProfit · VanityStyle · czerwiec 2025</div>
      </div>

      <div style={{padding:"20px 20px 0",display:"flex",flexDirection:"column",gap:14}}>
        {sections.map(function(sec,si){
          return (
            <Card key={si}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:8,background:T.navy,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:12,fontWeight:900,color:"#fff"}}>{si+1}</span>
                </div>
                <div style={{fontSize:14,fontWeight:800,color:T.text}}>{sec.title}</div>
              </div>
              <div style={{padding:"12px 16px 14px",display:"flex",flexDirection:"column",gap:8}}>
                {sec.body.map(function(line,li){
                  return (
                    <div key={li} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:T.greyLt,marginTop:7,flexShrink:0}}/>
                      <p style={{fontSize:12,color:T.grey,lineHeight:1.65,flex:1}}>{line}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}

        {/* Strony informacyjne edytowane w panelu administratora */}
        {INFO_PAGES.map(function(pg,pi){
          return (
            <Card key={"ip"+pi}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:8,background:T.blue,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:13}}>ℹ</span>
                </div>
                <div style={{fontSize:14,fontWeight:800,color:T.text}}>{pg.title}</div>
              </div>
              <div style={{padding:"12px 16px 14px"}}>
                <p style={{fontSize:12,color:T.grey,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{pg.content}</p>
              </div>
            </Card>
          );
        })}

        {/* Footer */}
        <div style={{padding:"4px 0 12px",textAlign:"center"}}>
          <div style={{fontSize:11,color:T.grey}}>VanityStyle Sp. z o.o. · support@vanitystyle.pl</div>
          <div style={{fontSize:11,color:T.grey,marginTop:4}}>Wersja regulaminu: 1.0 · data: 01.06.2025</div>
        </div>
      </div>
    </div>
  );
}

/* ─── SCREEN: ZASADY ─────────────────── */
function Zasady(){
  return (
    <div style={{paddingBottom:28}}>
      <div style={{background:T.navy,padding:"56px 24px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <div style={{fontSize:28,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>Zasady</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:4}}>Activy · FitProfit · Czerwiec 2025</div>
      </div>
      <div style={{padding:"20px 20px 0",display:"flex",flexDirection:"column",gap:14}}>
        {[
          {icon:"🏃",lbl:"Na nogach",col:T.blue,rows:[
            {l:"Punktacja",v:SCORE.foot.ppu+" pkt za 1 km"},
            {l:"Minimum",v:SCORE.foot.min+" km (poniżej = 0 pkt)"},
            {l:"Bonus dzienny",v:"+"+SCORE.foot.bonus+" pkt za pierwsze "+SCORE.foot.bonusMax+" aktywności dnia"},
            {l:"Przerwa",v:"Min. "+SCORE.foot.interval+" min między aktywnościami"},
            {l:"Limit",v:SCORE.foot.limit+" pkt / dzień"},
          ]},
          {icon:"🚴",lbl:"Na kołach",col:"#2E7D32",rows:[
            {l:"Punktacja",v:SCORE.wheel.ppu+" pkt za 1 km"},
            {l:"Dojazd do pracy",v:"+"+SCORE.commute+" pkt bonus za rower do pracy"},
            {l:"Bonus dzienny",v:"+"+SCORE.wheel.bonus+" pkt za pierwsze "+SCORE.wheel.bonusMax+" aktywności dnia"},
            {l:"Limit",v:SCORE.wheel.limit+" pkt / dzień"},
          ]},
          {icon:"🧘",lbl:"Ćwiczenia",col:"#6A1B9A",rows:[
            {l:"Joga / Pilates",v:"5 pkt / 10 min"},
            {l:"Pływanie",v:"8 pkt / 10 min"},
            {l:"Fitness",v:"7 pkt / 10 min"},
            {l:"CrossFit",v:"9 pkt / 10 min"},
            {l:"Zdjęcie",v:"Wymagane! Bez zdjęcia = 0 pkt"},
            {l:"Limit",v:SCORE.ex.limit+" pkt / dzień"},
          ]},
          {icon:"🚶",lbl:"Kroki",col:T.navy,rows:[
            {l:"Punktacja",v:SCORE.step.ppu+" pkt / 1 000 kroków"},
            {l:"Bonus",v:"+"+SCORE.step.bonus+" pkt za "+SCORE.step.bonusAt+" kroków"},
            {l:"Anti-duplikat",v:"Bierze lepszy wynik: kroki vs. Na nogach"},
            {l:"Limit",v:SCORE.step.limit+" pkt / dzień"},
          ]},
        ].map(function(cat,ci){
          return (
            <Card key={ci}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:12,background:cat.col+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{cat.icon}</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text}}>{cat.lbl}</div>
              </div>
              {cat.rows.map(function(r,ri){
                return (
                  <div key={ri} style={{display:"flex",padding:"11px 16px",borderBottom:ri<cat.rows.length-1?"1px solid "+T.border:"none"}}>
                    <span style={{fontSize:12,color:T.grey,fontWeight:500,width:120,flexShrink:0}}>{r.l}</span>
                    <span style={{fontSize:12,color:T.text,fontWeight:600,flex:1}}>{r.v}</span>
                  </div>
                );
              })}
            </Card>
          );
        })}

        <Card>
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:"#FF6F0018",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔥</div>
            <div style={{fontSize:15,fontWeight:700,color:T.text}}>Passa (Streak)</div>
          </div>
          {[{l:"3 dni",v:"+50 pkt"},{l:"7 dni",v:"+50 pkt"},{l:"14 dni",v:"+50 pkt"},{l:"21 dni",v:"+50 pkt, potem reset"}].map(function(r,i){
            return (
              <div key={i} style={{display:"flex",padding:"11px 16px",borderBottom:i<3?"1px solid "+T.border:"none"}}>
                <span style={{fontSize:12,color:T.grey,fontWeight:500,width:120,flexShrink:0}}>{r.l}</span>
                <span style={{fontSize:12,fontWeight:700,color:"#E65100"}}>{r.v}</span>
              </div>
            );
          })}
        </Card>

        <Card>
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+T.border,fontSize:15,fontWeight:700,color:T.text}}>Integracje</div>
          {INTEG.map(function(ig,i){
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<INTEG.length-1?"1px solid "+T.border:"none"}}>
                <div style={{width:34,height:34,borderRadius:10,background:ig.col,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#fff"}}>{ig.name[0]}</span>
                </div>
                <div style={{flex:1,fontSize:13,fontWeight:600,color:T.text}}>{ig.name}</div>
                <Pill label={ig.on?"Połączono":"Połącz"} col={ig.on?"#2E7D32":T.blue} bg={ig.on?"#2E7D3214":T.blue+"12"} border={ig.on?"#2E7D3228":T.blue+"28"}/>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

/* ─── NAV ICONS ──────────────────────── */
function IcoHome(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill={a?c:"none"} stroke={c} strokeWidth={a?0:2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/>{!a&&<path d="M9 21V12h6v9"/>}</svg>;}
function IcoRank(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={a?2.4:1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="14" width="5" height="7" rx="1"/><rect x="9" y="9" width="5" height="12" rx="1"/><rect x="16" y="4" width="5" height="17" rx="1"/></svg>;}
function IcoFeed(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={a?2.4:1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;}
function IcoCard(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={a?2.4:1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>;}
function IcoInfo(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={a?2.4:1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;}
function IcoSettings(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={a?2.4:1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;}
function IcoGift(a,c){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={a?2.4:1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>;}

/* ─── QUICK-ACTIVITY EXERCISES (biurowe, 5 min) ── */
/* Aby osadzić film instruktażowy, dodaj pole
   video:"https://www.youtube.com/embed/VIDEO_ID" do wybranej pozycji. */
var QUICK_ACTS = [
  {
    id:"desk",
    icon:"🏢",
    name:"Masz prawo do ruchu",
    sub:"Krótka, uniwersalna rozgrzewka przy biurku",
    met:3,
    col:"#0C5093",
    photo:"https://images.squarespace-cdn.com/content/v1/5b1f02b755b02cff9a0dbb0a/1581543049937-QNBZ6YTHFXHKIJRUBW7I/office+desk+stretches+workout+at+work.jpg",
  },
  {
    id:"back",
    icon:"🦴",
    name:"Masz prawo do zdrowych pleców",
    sub:"5 min na lędźwiowy, piersiowy i napięcia od siedzenia",
    met:3,
    col:"#2E7D32",
    photo:"https://i.pinimg.com/736x/2b/6e/de/2b6ede3a7e7b2b4c4c2e1c7f2b4c3c7a.jpg",
  },
  {
    id:"shoulders",
    icon:"💆",
    name:"Masz prawo do prostych barków",
    sub:"Spięte ramiona, szyja i góra pleców",
    met:3,
    col:"#6A1B9A",
    photo:"https://images.ctfassets.net/p0qf7j048i0q/4o7P8NRXI88kORmj1T2FPl/0a25c3f1df0f5a6c7b8e4f2d1c9a3b5e/neck-shoulder-stretch-office.jpg",
  },
  {
    id:"sitting",
    icon:"🪑",
    name:"Masz prawo do przerwy od siedzenia",
    sub:"Lekki zestaw aktywizujący po dłuższej pracy",
    met:3,
    col:"#E65100",
    photo:"https://images.squarespace-cdn.com/content/v1/5b1f02b755b02cff9a0dbb0a/1581543049937-QNBZ6YTHFXHKIJRUBW7I/office+desk+stretches+workout+at+work.jpg",
  },
  {
    id:"breath",
    icon:"🌬",
    name:"Masz prawo do oddechu",
    sub:"Ćwiczenia oddechowe i rozluźniające na stres",
    met:2,
    col:"#00695C",
    photo:"https://artofit.org/image-gallery/50697069560453052/3-deep-breathing-exercises-for-anxiety-and-stress-relief/",
  },
  {
    id:"head",
    icon:"🧠",
    name:"Masz prawo do lekkiej głowy",
    sub:"Szyja, oczy, oddech — po pracy przed ekranem",
    met:2,
    col:"#1565C0",
    photo:"https://images.ctfassets.net/p0qf7j048i0q/neck-eye-rest-office/neck-stretch-screen-break.jpg",
  },
  {
    id:"energy",
    icon:"⚡",
    name:"Masz prawo do energii",
    sub:"Krótka aktywacja bez przebierania się i sprzętu",
    met:4,
    col:"#F57F17",
    photo:"https://images.squarespace-cdn.com/content/v1/5b1f02b755b02cff9a0dbb0a/office-energy-boost-exercise.jpg",
  },
  {
    id:"spine",
    icon:"🏋",
    name:"Masz prawo do mocnego kręgosłupa",
    sub:"Zestaw wzmacniająco-mobilizujący do biura",
    met:4,
    col:"#B71C1C",
    photo:"https://images.ctfassets.net/spine-strengthen-office-exercise.jpg",
  },
  {
    id:"wrist",
    icon:"🖱",
    name:"Masz prawo do sprawnych nadgarstków",
    sub:"Dla piszących, klikających, pracujących z myszką",
    met:2,
    col:"#4A148C",
    photo:"https://i.pinimg.com/736x/wrist-hand-stretch-keyboard-typing-exercise.jpg",
  },
  {
    id:"reset",
    icon:"🔄",
    name:"Masz prawo do resetu",
    sub:"5 min ruchu, żeby wrócić z większą lekkością",
    met:3,
    col:"#2E7D32",
    photo:"https://images.squarespace-cdn.com/content/v1/reset-office-movement-break.jpg",
  },
];
var QUICK_BONUS = 25; // dodatkowe pkt za ćwiczenie z przypomnienia

function QuickActivityModal(p){
  var reminderTime = p.reminderTime || "08:00";
  var [step, setStep] = useState("pick");   // pick | timer | done
  var [chosen, setChosen] = useState(null);
  var [secs, setSecs] = useState(300);      // 5 min = 300s
  var [running, setRunning] = useState(false);
  var intervalRef = useRef(null);

  /* clear the timer if the modal unmounts while it is still running */
  useEffect(function(){
    return function(){ if(intervalRef.current) clearInterval(intervalRef.current); };
  }, []);
  useEscClose(function(){ if(step!=="timer" || !running) p.onClose(); });

  var basePts = chosen ? Math.round(chosen.met * 5 / 10) : 0;  // 5 min
  var totalPts = basePts + QUICK_BONUS;

  function startTimer(act){
    setChosen(act);
    setStep("timer");
    setSecs(300);
    setRunning(false);
  }
  function toggleTimer(){
    if(running){
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRunning(false);
    } else {
      var id = setInterval(function(){
        setSecs(function(s){
          if(s<=1){
            clearInterval(id);
            intervalRef.current = null;
            setRunning(false);
            setStep("done");
            return 0;
          }
          return s-1;
        });
      }, 1000);
      intervalRef.current = id;
      setRunning(true);
    }
  }
  function skipToFinish(){
    if(intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setSecs(0);
    setStep("done");
  }
  function formatTime(s){
    var m = Math.floor(s/60);
    var sec = s%60;
    return (m<10?"0":"")+m+":"+(sec<10?"0":"")+sec;
  }
  var progress = chosen ? Math.round((300-secs)/300*100) : 0;
  var circum = 2*Math.PI*54; // r=54

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:350,backdropFilter:"blur(6px)"}} onClick={step!=="timer"||!running?p.onClose:undefined}>
      <div className="mdl" role="dialog" aria-modal="true" onClick={function(e){e.stopPropagation();}}
        style={{width:375,background:T.bg,borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto"}}>

        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",paddingTop:12,marginBottom:4}}>
          <div style={{width:36,height:4,background:T.greyLt,borderRadius:2}}/>
        </div>

        {/* ── STEP: PICK ── */}
        {step==="pick"&&(
          <div style={{padding:"12px 24px 40px"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:32,height:32,borderRadius:9,background:T.blue+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⏰</div>
                  <span style={{fontSize:12,fontWeight:600,color:T.blue}}>Przypomnienie {reminderTime}</span>
                </div>
                <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:-0.4}}>Czas na 5 minut!</div>
                <div style={{fontSize:13,color:T.grey,marginTop:4}}>Krótka aktywność = +{QUICK_BONUS} pkt bonusowych</div>
              </div>
              <button onClick={p.onClose} className="tap" style={{width:34,height:34,borderRadius:10,background:T.card,border:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:17,color:T.grey,marginTop:4}}>×</button>
            </div>

            {/* Bonus info strip */}
            <div style={{background:T.navy,borderRadius:14,padding:"12px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:12,background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎯</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>Bonus za odpowiedź na przypomnienie</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:2}}>Ćwiczenie MET + <span style={{color:"#4CAF50",fontWeight:700}}>+{QUICK_BONUS} pkt extra</span> naliczone automatycznie</div>
              </div>
            </div>

            {/* Activity grid */}
            <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:12}}>WYBIERZ AKTYWNOŚĆ (5 MIN)</div>
            <div className="hs" style={{gap:12,paddingBottom:4,margin:"0 -24px",paddingLeft:24,paddingRight:24}}>
              {QUICK_ACTS.map(function(a){
                var pts = Math.round(a.met*5/10)+QUICK_BONUS;
                return (
                  <button key={a.id} onClick={function(){startTimer(a);}} className="tap"
                    style={{flexShrink:0,width:148,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    <div style={{borderRadius:16,overflow:"hidden",border:"1.5px solid "+T.border,background:T.card}}>
                      <div style={{height:80,background:"linear-gradient(145deg,"+a.col+"22,"+a.col+"44)",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <img src={a.photo} alt={a.name} style={{width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0,opacity:0.4}} onError={function(e){e.target.style.display="none";}}/>
                        <div style={{position:"relative",zIndex:1,width:40,height:40,borderRadius:12,background:"rgba(255,255,255,0.85)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{a.icon}</div>
                        <div style={{position:"absolute",top:7,right:7,background:T.navy,borderRadius:99,padding:"2px 8px",zIndex:2}}>
                          <span style={{fontSize:10,fontWeight:700,color:"#fff"}}>+{pts}</span>
                        </div>
                      </div>
                      <div style={{padding:"8px 10px 10px"}}>
                        <div style={{fontSize:11,fontWeight:800,color:T.text,lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{a.name}</div>
                        <div style={{fontSize:10,color:T.grey,marginTop:3,lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{a.sub}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"center",marginTop:16}}>
              <GhostBtn onClick={p.onClose}>Przypomnij za 30 minut</GhostBtn>
            </div>
          </div>
        )}

        {/* ── STEP: TIMER ── */}
        {step==="timer"&&chosen&&(
          <div style={{padding:"14px 24px 40px",textAlign:"center"}}>
            <div style={{fontSize:14,fontWeight:600,color:T.grey,marginBottom:3}}>{chosen.icon} {chosen.name}</div>
            <div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:-0.3,marginBottom:14}}>Ćwicz 5 minut!</div>

            {/* Osadzone wideo instruktażowe ćwiczenia */}
            <div style={{borderRadius:16,overflow:"hidden",border:"1px solid "+T.border,marginBottom:18,background:"#000",position:"relative",aspectRatio:"16 / 9"}}>
              {chosen.video?(
                <iframe
                  src={chosen.video}
                  title={chosen.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{width:"100%",height:"100%",border:"none",display:"block"}}
                />
              ):(
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(145deg,"+chosen.col+"55,"+chosen.col+"99)"}}>
                  <img src={chosen.photo} alt="" onError={function(e){e.target.style.display="none";}} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:0.3}}/>
                  <div style={{position:"relative",width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,0.92)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill={chosen.col} style={{marginLeft:3}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                  <div style={{position:"relative",marginTop:10,fontSize:11,fontWeight:700,color:"#fff"}}>Wideo instruktażowe</div>
                  <div style={{position:"relative",marginTop:2,fontSize:10,color:"rgba(255,255,255,0.7)"}}>dodaj pole „video" w QUICK_ACTS</div>
                </div>
              )}
            </div>

            {/* Licznik */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
              <div style={{position:"relative",width:140,height:140}}>
                <svg width="140" height="140" style={{transform:"rotate(-90deg)"}}>
                  <circle cx="70" cy="70" r="54" fill="none" stroke={T.greyLt} strokeWidth="8"/>
                  <circle cx="70" cy="70" r="54" fill="none" stroke={chosen.col} strokeWidth="8"
                    strokeDasharray={circum} strokeDashoffset={circum*(1-progress/100)}
                    strokeLinecap="round" style={{transition:"stroke-dashoffset 1s linear"}}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:32,fontWeight:900,color:T.text,letterSpacing:-1,lineHeight:1}}>{formatTime(secs)}</div>
                  <div style={{fontSize:11,color:T.grey,marginTop:4}}>{running?"trwa...":"gotowy"}</div>
                </div>
              </div>
            </div>

            {/* Motywacja */}
            <div style={{background:chosen.col+"12",borderRadius:12,padding:"10px 16px",marginBottom:20,border:"1px solid "+chosen.col+"25"}}>
              <div style={{fontSize:13,fontWeight:600,color:chosen.col}}>
                {secs>200?"Zacznij — tylko 5 minut!":secs>100?"Świetnie! Kontynuuj!":secs>0?"Już prawie! Nie odpuszczaj!":"Ukończono!"}
              </div>
            </div>

            {/* Sterowanie */}
            <PrimaryBtn dark onClick={toggleTimer} style={{marginBottom:10}}>
              {running?(
                <span style={{display:"flex",alignItems:"center",gap:8}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Pauza
                </span>
              ):(
                <span style={{display:"flex",alignItems:"center",gap:8}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {secs===300?"Start":"Kontynuuj"}
                </span>
              )}
            </PrimaryBtn>
            <GhostBtn onClick={skipToFinish}>Zaliczyłem/am ćwiczenie</GhostBtn>
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step==="done"&&chosen&&(
          <div style={{padding:"16px 24px 44px",textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:12}}>🎉</div>
            <div style={{fontSize:24,fontWeight:800,color:T.text,letterSpacing:-0.4,marginBottom:4}}>Brawo!</div>
            <div style={{fontSize:14,color:T.grey,marginBottom:24}}>5 minut {chosen.name.toLowerCase()} zaliczone</div>

            {/* Points breakdown */}
            <Card style={{marginBottom:20,overflow:"visible"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid "+T.border}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:13,color:T.grey}}>Za ćwiczenie (MET {chosen.met} × 5 min)</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>+{basePts} pkt</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:T.blue,fontWeight:600}}>Bonus za przypomnienie</span>
                  <span style={{fontSize:13,fontWeight:800,color:T.blue}}>+{QUICK_BONUS} pkt</span>
                </div>
              </div>
              <div style={{padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:700,color:T.text}}>Łącznie</span>
                <div style={{background:T.navy,borderRadius:99,padding:"6px 18px"}}>
                  <span style={{fontSize:18,fontWeight:800,color:"#fff"}}>+{totalPts} pkt</span>
                </div>
              </div>
            </Card>

            <PrimaryBtn dark onClick={function(){p.onComplete(chosen,totalPts);}}>
              Zapisz i zbierz punkty
            </PrimaryBtn>
            <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
              <GhostBtn onClick={p.onClose}>Pomiń</GhostBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── REMINDER BANNER ─────────────────── */
/* Shows in-app when the set reminder time matches current simulated time */
function ReminderBanner(p){
  if(!p.show) return null;
  return (
    <div className="tst" style={{position:"absolute",top:48,left:12,right:12,zIndex:350,background:"#fff",borderRadius:18,padding:"14px 16px",boxShadow:"0 8px 32px rgba(24,28,51,0.18)",border:"1.5px solid "+T.navy+"20",display:"flex",gap:14,alignItems:"center"}}>
      {/* Pulsing dot */}
      <div style={{position:"relative",flexShrink:0}}>
        <div style={{width:44,height:44,borderRadius:13,background:T.navy,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⏰</div>
        <div style={{position:"absolute",top:-3,right:-3,width:12,height:12,borderRadius:"50%",background:"#F44336",border:"2px solid #fff"}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:800,color:T.text}}>Czas na 5 minut!</div>
        <div style={{fontSize:12,color:T.grey,marginTop:2}}>Twoje dzienne przypomnienie · +{QUICK_BONUS} pkt bonus</div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={p.onOpen} className="tap"
          style={{background:T.navy,border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          Zacznij
        </button>
        <button onClick={p.onDismiss} className="tap"
          style={{background:T.greyBg,border:"1px solid "+T.border,borderRadius:10,padding:"8px 10px",fontSize:14,color:T.grey,cursor:"pointer",fontFamily:"inherit"}}>
          ×
        </button>
      </div>
    </div>
  );
}

/* ─── SCREEN: SETTINGS ────────────────── */
function Settings(p){
  var rem = p.reminder;
  var setRem = p.setReminder;
  var onNavigate = p.onNavigate || function(){};

  /* Time options every 30 min */
  var timeOpts = [];
  for(var h=5;h<=23;h++){
    timeOpts.push((h<10?"0":"")+h+":00");
    if(h<23) timeOpts.push((h<10?"0":"")+h+":30");
  }

  var SECTIONS = [
    {
      title:"Przypomnienia o aktywności",
      rows:[
        {
          type:"toggle_reminder",
          icon:"⏰",
          label:"5-minutowa aktywność",
          sub:"Codzienne przypomnienie z bonusem punktowym",
        },
      ]
    },
    {
      title:"Integracje",
      rows: INTEG.map(function(ig){return {type:"integration",icon:null,label:ig.name,sub:ig.on?"Połączono":"Nie połączono",col:ig.col,on:ig.on,id:ig.id};})
    },
    {
      title:"Konto",
      rows:[
        {type:"link",icon:"👤",label:"Profil i dane",sub:"Marek Kowalski"},
        {type:"link",icon:"🏢",label:"Firma",sub:"VanityStyle Sp. z o.o."},
        {type:"link",icon:"🔒",label:"Prywatność i dane"},
        {type:"link",icon:"📋",label:"Regulamin i zasady"},
      ]
    },
    {
      title:"Wersja",
      rows:[
        {type:"info",icon:"",label:"FitProfit",sub:"v2.0 · VanityStyle NEXT"},
      ]
    },
  ];

  return (
    <div style={{paddingBottom:36}}>
      {/* Hero */}
      <div style={{background:T.navy,padding:"56px 24px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <div style={{fontSize:28,fontWeight:800,color:"#fff",letterSpacing:-0.5}}>Ustawienia</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:4}}>Personalizuj swoje doświadczenie</div>
      </div>

      {/* Reminder hero card */}
      <div style={{padding:"20px 20px 0"}}>
        <Card style={{overflow:"hidden",borderColor:rem.enabled?T.navy+"40":T.border}}>
          <div style={{background:rem.enabled?T.navy:T.greyBg,padding:"20px 20px 16px",position:"relative",overflow:"hidden"}}>
            {rem.enabled&&<div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.06)"}}/>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:rem.enabled?12:0}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:24}}>⏰</span>
                  <span style={{fontSize:15,fontWeight:800,color:rem.enabled?"#fff":T.text}}>Przypomnienie o ćwiczeniu</span>
                </div>
                <div style={{fontSize:12,color:rem.enabled?"rgba(255,255,255,0.55)":T.grey,lineHeight:1.5}}>
                  Codziennie o wybranej porze<br/>
                  dostaniesz zachętę do 5-minutowej aktywności
                </div>
              </div>
              <Toggle value={rem.enabled} onChange={function(){setRem(function(r){return Object.assign({},r,{enabled:!r.enabled});});}}/>
            </div>

            {rem.enabled&&(
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,padding:"10px 14px",background:"rgba(255,255,255,0.1)",borderRadius:12}}>
                <span style={{fontSize:18}}>🎯</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>+{QUICK_BONUS} pkt bonus za każde wykonane przypomnienie</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:2}}>Dodatkowe do normalnych punktów MET za ćwiczenie</div>
                </div>
              </div>
            )}
          </div>

          {/* Time picker */}
          {rem.enabled&&(
            <div style={{padding:"16px 20px 20px"}}>
              <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:14}}>GODZINA PRZYPOMNIENIA</div>

              {/* Quick presets */}
              <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                {[
                  {t:"07:00",lbl:"Rano 🌅"},
                  {t:"12:00",lbl:"Południe ☀"},
                  {t:"17:00",lbl:"Popołudnie 🏃"},
                  {t:"19:00",lbl:"Wieczór 🌙"},
                ].map(function(preset){
                  var sel = rem.time===preset.t;
                  return (
                    <button key={preset.t} onClick={function(){setRem(function(r){return Object.assign({},r,{time:preset.t});});}} className="tap"
                      style={{background:sel?T.navy:T.card,color:sel?"#fff":T.text,border:"1.5px solid "+(sel?T.navy:T.border),borderRadius:99,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      {preset.lbl}
                    </button>
                  );
                })}
              </div>

              {/* Exact time picker */}
              <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:10}}>DOKŁADNA GODZINA</div>
              <div className="hs" style={{gap:6,paddingBottom:4}}>
                {timeOpts.map(function(t){
                  var sel=rem.time===t;
                  return (
                    <button key={t} onClick={function(){setRem(function(r){return Object.assign({},r,{time:t});});}} className="tap"
                      style={{flexShrink:0,background:sel?T.navy:T.card,color:sel?"#fff":T.text,border:"1.5px solid "+(sel?T.navy:T.border),borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:sel?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Selected time display */}
              <div style={{marginTop:16,background:T.greyBg,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>⏰</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:800,color:T.text}}>Codziennie o {rem.time}</div>
                  <div style={{fontSize:12,color:T.grey,marginTop:2}}>Powtarza się każdego dnia</div>
                </div>
                <div style={{background:T.navy,borderRadius:99,padding:"4px 12px"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#fff"}}>+{QUICK_BONUS} pkt</span>
                </div>
              </div>

              {/* Days toggle */}
              <div style={{marginTop:14}}>
                <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:10}}>DNI TYGODNIA</div>
                <div style={{display:"flex",gap:6}}>
                  {["Pn","Wt","Śr","Cz","Pt","So","Nd"].map(function(d,i){
                    var on = rem.days ? rem.days.includes(i) : i<5;
                    return (
                      <button key={d} onClick={function(){
                        setRem(function(r){
                          var days=r.days||(r.days=[0,1,2,3,4]);
                          var nd=days.includes(i)?days.filter(function(x){return x!==i;}):days.concat([i]).sort();
                          return Object.assign({},r,{days:nd});
                        });
                      }} className="tap"
                        style={{flex:1,background:on?T.navy:T.card,color:on?"#fff":T.grey,border:"1.5px solid "+(on?T.navy:T.border),borderRadius:9,padding:"8px 0",fontSize:11,fontWeight:on?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Test button */}
              <div style={{marginTop:14}}>
                <PrimaryBtn onClick={p.onTestReminder}>
                  <span style={{fontSize:16}}>👁</span>
                  Podgląd przypomnienia
                </PrimaryBtn>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Other sections */}
      {SECTIONS.slice(1).map(function(sec,si){
        return (
          <div key={si} style={{padding:"20px 20px 0"}}>
            <div style={{fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:12}}>{sec.title.toUpperCase()}</div>
            <Card>
              {sec.rows.map(function(row,ri){
                if(row.type==="integration"){
                  return (
                    <div key={ri} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:ri<sec.rows.length-1?"1px solid "+T.border:"none"}}>
                      <div style={{width:36,height:36,borderRadius:10,background:row.col,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:12,fontWeight:800,color:"#fff"}}>{row.label[0]}</span>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:T.text}}>{row.label}</div>
                        <div style={{fontSize:11,color:row.on?"#2E7D32":T.grey,marginTop:2}}>{row.sub}</div>
                      </div>
                      <Pill label={row.on?"Połączono":"Połącz"} col={row.on?"#2E7D32":T.blue} bg={row.on?"#2E7D3214":T.blue+"12"} border={row.on?"#2E7D3228":T.blue+"28"}/>
                    </div>
                  );
                }
                return (
                  <div key={ri} onClick={function(){
                    if(row.type==="link"&&row.label==="Regulamin i zasady") onNavigate("regulamin");
                  }} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:ri<sec.rows.length-1?"1px solid "+T.border:"none",cursor:row.type==="link"?"pointer":"default"}}>
                    {row.icon&&<span style={{fontSize:18,width:28,textAlign:"center"}}>{row.icon}</span>}
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:T.text}}>{row.label}</div>
                      {row.sub&&<div style={{fontSize:11,color:T.grey,marginTop:1}}>{row.sub}</div>}
                    </div>
                    {row.type==="link"&&(
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.greyLt} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    )}
                  </div>
                );
              })}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

/* ─── ROOT ───────────────────────────── */
/* ─── ONBOARDING — wdrożenie nowego użytkownika ─── */
function Onboarding(p){
  var SYS={first:"Marek",last:"Kowalski",company:"VanityStyle"};
  var LAST=5;
  var [step,setStep]=useState(0);
  var [nameMode,setNameMode]=useState("initial");
  var [nick,setNick]=useState("");
  var [apple,setApple]=useState(false);
  var [google,setGoogle]=useState(false);
  var [rem,setRem]=useState({enabled:true,time:"08:00",days:[0,1,2,3,4]});

  var timeOpts=[];
  for(var h=5;h<=23;h++){ timeOpts.push((h<10?"0":"")+h+":00"); if(h<23) timeOpts.push((h<10?"0":"")+h+":30"); }

  var initname=SYS.first+" "+SYS.last.charAt(0)+".";
  var display=nameMode==="nick"?(nick.trim()||initname):initname;

  function finish(){ p.onFinish({displayName:display,reminder:rem}); }
  function next(){ if(step<LAST){setStep(step+1);} else {finish();} }

  var hIcon={width:76,height:76,borderRadius:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,marginBottom:18};
  var hTitle={fontSize:23,fontWeight:800,color:T.text,letterSpacing:-0.4,lineHeight:1.2,marginBottom:8};
  var hSub={fontSize:14,color:T.grey,lineHeight:1.55,marginBottom:22};
  var lbl={fontSize:12,fontWeight:600,color:T.grey,letterSpacing:0.8,marginBottom:10};

  return (
    <div style={{position:"absolute",inset:0,background:T.bg,zIndex:500,display:"flex",flexDirection:"column"}}>

      {/* górny pasek: wstecz + postęp + pomiń */}
      <div style={{padding:"46px 22px 8px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={function(){if(step>0)setStep(step-1);}} className="tap" aria-label="Wstecz"
          style={{width:34,height:34,borderRadius:10,border:"1px solid "+T.border,background:T.card,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:step>0?1:0,pointerEvents:step>0?"auto":"none"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.navy} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{flex:1,display:"flex",justifyContent:"center",gap:6}}>
          {[0,1,2,3,4,5].map(function(i){
            return <div key={i} style={{height:6,borderRadius:99,width:i===step?22:6,background:i<=step?T.navy:T.greyLt,transition:"all .25s ease"}}/>;
          })}
        </div>
        <button onClick={finish} className="tap"
          style={{background:"none",border:"none",fontSize:13,fontWeight:600,color:T.grey,cursor:"pointer",fontFamily:"inherit",padding:"4px 0",width:34,textAlign:"right"}}>
          {step<LAST?"Pomiń":""}
        </button>
      </div>

      {/* treść slajdu */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 26px 20px"}}>

        {step===0&&(
          <div>
            <div style={Object.assign({},hIcon,{background:T.navy})}><span>👋</span></div>
            <div style={hTitle}>Witaj w FitProfit,<br/>{SYS.first}!</div>
            <div style={hSub}>Zanim zaczniesz zbierać punkty — kilka szybkich ustawień.</div>

            <div style={lbl}>TWOJE DANE</div>
            <Card style={{padding:"14px 16px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Ava text="MK" size={44}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:T.text}}>{SYS.first} {SYS.last}</div>
                  <div style={{fontSize:12,color:T.grey,marginTop:2}}>{SYS.company}</div>
                </div>
              </div>
            </Card>
            <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:24}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.grey} strokeWidth="2" style={{flexShrink:0,marginTop:1}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span style={{fontSize:11,color:T.grey,lineHeight:1.5}}>Dane pobrane z systemu kadrowego Twojej firmy — nie trzeba ich wpisywać.</span>
            </div>

            <div style={lbl}>JAK CHCESZ BYĆ WIDOCZNY?</div>
            <div style={{fontSize:12,color:T.grey,lineHeight:1.55,marginBottom:12}}>Twoje pełne nazwisko nie będzie widoczne dla innych uczestników rankingu.</div>

            {[{m:"initial",t:initname,s:"Imię i pierwsza litera nazwiska",rec:true},
              {m:"nick",t:"Własna ksywka",s:"Wymyśl własny pseudonim",rec:false}].map(function(o){
              var on=nameMode===o.m;
              return (
                <button key={o.m} onClick={function(){setNameMode(o.m);}} className="tap"
                  style={{width:"100%",textAlign:"left",display:"flex",alignItems:"center",gap:12,padding:"14px",marginBottom:10,borderRadius:14,cursor:"pointer",fontFamily:"inherit",background:T.card,border:"1.5px solid "+(on?T.navy:T.border)}}>
                  <div style={{width:20,height:20,borderRadius:"50%",border:"2px solid "+(on?T.navy:T.greyLt),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {on&&<div style={{width:10,height:10,borderRadius:"50%",background:T.navy}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.text}}>{o.t}</div>
                    <div style={{fontSize:12,color:T.grey,marginTop:1}}>{o.s}</div>
                  </div>
                  {o.rec&&<span style={{fontSize:10,fontWeight:700,color:T.blue,background:T.blue+"14",borderRadius:99,padding:"3px 8px",flexShrink:0}}>Zalecane</span>}
                </button>
              );
            })}
            {nameMode==="nick"&&(
              <input type="text" value={nick} placeholder="np. Sprinter88" maxLength={20}
                onChange={function(e){setNick(e.target.value);}}
                style={{width:"100%",border:"1.5px solid "+T.border,borderRadius:12,padding:"12px 14px",fontSize:14,fontWeight:600,color:T.text,fontFamily:"inherit",background:T.card,outline:"none",marginBottom:6}}/>
            )}
            <div style={{fontSize:12,color:T.grey,marginTop:8}}>Widoczny jako: <b style={{color:T.navy}}>{display}</b></div>
          </div>
        )}

        {step===1&&(
          <div>
            <div style={Object.assign({},hIcon,{background:"#B3131914"})}><span>❤️</span></div>
            <div style={hTitle}>Połącz aplikację zdrowotną</div>
            <div style={hSub}>Synchronizuj kroki i treningi automatycznie — bez ręcznego wpisywania.</div>

            {[{k:"apple",on:apple,set:setApple,name:"Apple Zdrowie",sub:"iPhone · Apple Watch",bg:"#1A1A1A",ic:"🍎"},
              {k:"google",on:google,set:setGoogle,name:"Google Fit",sub:"Android · Wear OS",bg:"#4285F4",ic:"🏃"}].map(function(g){
              return (
                <Card key={g.k} style={{padding:"14px 16px",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:44,height:44,borderRadius:12,background:g.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{g.ic}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:T.text}}>{g.name}</div>
                      <div style={{fontSize:12,color:T.grey,marginTop:1}}>{g.sub}</div>
                    </div>
                    <button onClick={function(){g.set(!g.on);}} className="tap"
                      style={{border:"none",borderRadius:10,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",background:g.on?"#2E7D32":T.navy,color:"#fff"}}>
                      {g.on?"Połączono ✓":"Połącz"}
                    </button>
                  </div>
                </Card>
              );
            })}
            <div style={{fontSize:12,color:T.grey,lineHeight:1.55,marginTop:6}}>To opcjonalne — możesz połączyć aplikacje później w Ustawieniach.</div>
          </div>
        )}

        {step===2&&(
          <div>
            <div style={Object.assign({},hIcon,{background:"#0C509314"})}><span>🔔</span></div>
            <div style={hTitle}>Przypomnienie o ćwiczeniu</div>
            <div style={hSub}>Krótka 5-minutowa aktywność w ciągu dnia. Za każde wykonane przypomnienie dostajesz +25 pkt.</div>

            <Card style={{padding:"15px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{flex:1,minWidth:0,paddingRight:12}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>Włącz przypomnienia</div>
                  <div style={{fontSize:12,color:T.grey,marginTop:2}}>Powiadomienie o przerwie na ruch</div>
                </div>
                <Toggle value={rem.enabled} onChange={function(){setRem(function(r){return Object.assign({},r,{enabled:!r.enabled});});}}/>
              </div>
            </Card>

            {rem.enabled&&(
              <div style={{marginTop:20}}>
                <div style={lbl}>PORA DNIA</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
                  {[{t:"07:00",lbl:"Rano 🌅"},{t:"12:00",lbl:"Południe ☀"},{t:"17:00",lbl:"Popołudnie 🏃"},{t:"19:00",lbl:"Wieczór 🌙"}].map(function(ps){
                    var sel=rem.time===ps.t;
                    return (
                      <button key={ps.t} onClick={function(){setRem(function(r){return Object.assign({},r,{time:ps.t});});}} className="tap"
                        style={{background:sel?T.navy:T.card,color:sel?"#fff":T.text,border:"1.5px solid "+(sel?T.navy:T.border),borderRadius:99,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        {ps.lbl}
                      </button>
                    );
                  })}
                </div>

                <div style={lbl}>DOKŁADNA GODZINA</div>
                <div className="hs" style={{gap:6,paddingBottom:4,marginBottom:20}}>
                  {timeOpts.map(function(t){
                    var sel=rem.time===t;
                    return (
                      <button key={t} onClick={function(){setRem(function(r){return Object.assign({},r,{time:t});});}} className="tap"
                        style={{flexShrink:0,background:sel?T.navy:T.card,color:sel?"#fff":T.text,border:"1.5px solid "+(sel?T.navy:T.border),borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:sel?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                        {t}
                      </button>
                    );
                  })}
                </div>

                <div style={lbl}>DNI TYGODNIA</div>
                <div style={{display:"flex",gap:6,marginBottom:18}}>
                  {["Pn","Wt","Śr","Cz","Pt","So","Nd"].map(function(d,i){
                    var on=rem.days?rem.days.includes(i):i<5;
                    return (
                      <button key={d} onClick={function(){setRem(function(r){var days=r.days||[0,1,2,3,4];var nd=days.includes(i)?days.filter(function(x){return x!==i;}):days.concat([i]).sort();return Object.assign({},r,{days:nd});});}} className="tap"
                        style={{flex:1,background:on?T.navy:T.card,color:on?"#fff":T.grey,border:"1.5px solid "+(on?T.navy:T.border),borderRadius:9,padding:"8px 0",fontSize:11,fontWeight:on?700:500,cursor:"pointer",fontFamily:"inherit"}}>
                        {d}
                      </button>
                    );
                  })}
                </div>

                <div style={{background:T.greyBg,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>⏰</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:800,color:T.text}}>O {rem.time} · {rem.days&&rem.days.length===7?"codziennie":(rem.days&&rem.days.length?rem.days.length+" dni w tygodniu":"brak dni")}</div>
                    <div style={{fontSize:11,color:T.grey,marginTop:2}}>Możesz to zmienić później w Ustawieniach</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step===3&&(
          <div>
            <div style={Object.assign({},hIcon,{background:"#2E7D3214"})}><span>🌱</span></div>
            <div style={hTitle}>Zdrowo i eko<br/>na co dzień</div>
            <div style={hSub}>Małe codzienne nawyki — realne korzyści dla Ciebie i środowiska.</div>

            {[
              {ic:"🚶",col:T.navy,t:"10 000 kroków dziennie",d:"Postaw na codzienny cel kroków — po jego osiągnięciu punkty naliczają się automatycznie, bez ręcznego wpisywania."},
              {ic:"💚",col:"#2E7D32",t:"Prozdrowotny udział",d:"Regularny ruch to więcej energii, lepsze samopoczucie i zdrowie. Udział w programie to inwestycja w siebie."},
              {ic:"🚲",col:T.blue,t:"Rowerem do pracy = eko",d:"Dojeżdżaj do pracy rowerem zamiast autem — zdobywasz punkty i ograniczasz emisję CO₂. Dobre dla Ciebie i dla planety."},
            ].map(function(b){
              return (
                <Card key={b.t} style={{padding:"14px 16px",marginBottom:12}}>
                  <div style={{display:"flex",gap:13}}>
                    <div style={{width:42,height:42,borderRadius:12,background:b.col+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{b.ic}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:800,color:T.text,marginBottom:3}}>{b.t}</div>
                      <div style={{fontSize:12,color:T.grey,lineHeight:1.55}}>{b.d}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {step===4&&(
          <div>
            <div style={Object.assign({},hIcon,{background:"#6A1B9A14"})}><span>🎁</span></div>
            <div style={hTitle}>Zbieraj punkty i nagrody</div>
            <div style={hSub}>Każda aktywność to punkty. Wymieniaj je na kupony i vouchery od partnerów.</div>

            <div style={lbl}>PRZYKŁADOWE NAGRODY</div>
            {REW.slice(0,3).map(function(r){
              return (
                <Card key={r.name} style={{padding:"12px 14px",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:11,background:r.col+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0,overflow:"hidden"}}>
                      {r.img
                        ? <img src={r.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : r.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                      <div style={{fontSize:11,color:T.grey,marginTop:1}}>{r.sub}</div>
                    </div>
                    <span style={{fontSize:12,fontWeight:800,color:T.navy,flexShrink:0}}>{r.cost} pkt</span>
                  </div>
                </Card>
              );
            })}
            <div style={{fontSize:12,color:T.grey,lineHeight:1.55,marginTop:6}}>Wszystkie nagrody znajdziesz w sekcji <b style={{color:T.text}}>Nagrody</b> na dolnym pasku.</div>
          </div>
        )}

        {step===5&&(
          <div>
            <div style={{marginBottom:18}}><ShelterLogo size={76}/></div>
            <div style={hTitle}>Wyzwanie firmowe</div>
            <div style={hSub}>Razem z całą firmą zbieracie punkty na wspólny cel charytatywny.</div>

            <Card style={{padding:"16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <ShelterLogo size={42}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:T.text}}>{CHARITY.name}</div>
                  <div style={{fontSize:11,color:T.grey,marginTop:1}}>Cel zbiórki: {CHARITY_GOAL.toLocaleString("pl")} pkt</div>
                </div>
              </div>
              <div style={{background:T.greyBg,borderRadius:99,height:7,overflow:"hidden"}}>
                <div style={{width:"67%",height:"100%",background:"linear-gradient(90deg,"+T.blue+","+T.navy+")",borderRadius:99}}/>
              </div>
            </Card>
            <div style={{fontSize:12,color:T.grey,lineHeight:1.55,marginTop:14}}>Możesz przekazać własne punkty na pomoc zwierzętom. Gdy firma osiągnie cel, VanityStyle przekaże darowiznę. Wyzwanie znajdziesz w sekcji <b style={{color:T.text}}>Nagrody</b>.</div>

            {JOIN.fairplay===1&&(
              <Card style={{padding:"14px 16px",marginTop:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{fontSize:18}}>🤝</span>
                  <div style={{fontSize:13,fontWeight:800,color:T.text}}>Fair-play</div>
                </div>
                <div style={{fontSize:12,color:T.grey,lineHeight:1.55}}>
                  Wyzwanie opiera się na uczciwej rywalizacji — dodawaj wyłącznie swoje rzeczywiste aktywności.
                </div>
                {JOIN.regulationsUrl&&(
                  <a href={JOIN.regulationsUrl} target="_blank" rel="noreferrer"
                    style={{display:"inline-block",marginTop:8,fontSize:12,fontWeight:700,color:T.navy,textDecoration:"none"}}>
                    Przeczytaj pełny regulamin →
                  </a>
                )}
              </Card>
            )}
          </div>
        )}

      </div>

      {/* stopka */}
      <div style={{padding:"14px 24px 28px",flexShrink:0,background:T.card,borderTop:"1px solid "+T.border}}>
        <PrimaryBtn dark onClick={next}>{step<LAST?"Dalej":"Zaczynamy 🎉"}</PrimaryBtn>
      </div>
    </div>
  );
}

/* ════════════════ UWIERZYTELNIANIE ════════════════
   Konta użytkowników: zaproszenie → rejestracja (hasło) → logowanie.
   Token sesji trzymany w pamięci; profil pobierany z backendu. */

function authToken(){ try { return window.__fpToken || ""; } catch(e){ return ""; } }
function setAuthToken(t){ try { window.__fpToken = t || ""; } catch(e){} }

function urlParam(name){
  try {
    var m = new RegExp("[?&]"+name+"=([^&]+)").exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  } catch(e){ return ""; }
}
function urlPath(){
  try { return window.location.pathname || "/"; } catch(e){ return "/"; }
}

async function apiPost(path, body){
  var res = await fetch(API_BASE + path, {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:"Bearer "+authToken() },
    body: JSON.stringify(body||{}),
  });
  var data = {};
  try { data = await res.json(); } catch(e){}
  return { status: res.status, data: data };
}
async function apiGet(path){
  var res = await fetch(API_BASE + path, { headers:{ Authorization:"Bearer "+authToken() } });
  var data = {};
  try { data = await res.json(); } catch(e){}
  return { status: res.status, data: data };
}

/* Wspólna ramka ekranów uwierzytelniania. */
function AuthShell(p){
  return (
    <div style={{position:"absolute",inset:0,background:T.bg,zIndex:600,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div style={{background:T.navy,padding:"54px 26px 30px",flexShrink:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:1}}>FITPROFIT</div>
        <div style={{fontSize:24,fontWeight:800,color:"#fff",marginTop:6,letterSpacing:-0.4}}>{p.title}</div>
        {p.sub&&<div style={{fontSize:13,color:"rgba(255,255,255,0.75)",marginTop:6,lineHeight:1.5}}>{p.sub}</div>}
      </div>
      <div style={{flex:1,padding:"22px 26px 32px"}}>{p.children}</div>
    </div>
  );
}

function AuthField(p){
  return (
    <label style={{display:"block",marginBottom:14}}>
      <span style={{display:"block",fontSize:12,fontWeight:600,color:T.grey,marginBottom:6}}>{p.label}</span>
      <input
        type={p.type||"text"} value={p.value} placeholder={p.placeholder||""}
        onChange={function(e){p.onChange(e.target.value);}}
        onKeyDown={function(e){ if(e.key==="Enter"&&p.onEnter) p.onEnter(); }}
        style={{width:"100%",padding:"11px 13px",borderRadius:11,border:"1.5px solid "+T.border,
          fontSize:15,color:T.text,outline:"none",boxSizing:"border-box",background:"#fff"}}
      />
    </label>
  );
}

/* Ekran logowania — brama do aplikacji. */
function LoginScreen(p){
  var [email,setEmail]=useState("");
  var [pass,setPass]=useState("");
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState("");

  async function submit(){
    if(!email.trim()||!pass){ setErr("Podaj e-mail i hasło."); return; }
    setBusy(true); setErr("");
    var r=await apiPost("/api/app/login",{email:email.trim(),password:pass});
    setBusy(false);
    if(r.status===200&&r.data.token){
      setAuthToken(r.data.token);
      p.onLoggedIn(r.data.user);
    } else {
      setErr(r.data.error||"Nie udało się zalogować.");
    }
  }

  return (
    <AuthShell title="Zaloguj się" sub="Wejdź na swoje konto, aby kontynuować wyzwanie.">
      <AuthField label="E-mail" type="email" value={email} onChange={setEmail} placeholder="twój@email.pl"/>
      <AuthField label="Hasło" type="password" value={pass} onChange={setPass} onEnter={submit} placeholder="••••••••"/>
      {err&&<div style={{fontSize:12,color:T.red,fontWeight:600,marginBottom:12}}>{err}</div>}
      <PrimaryBtn dark onClick={submit}>{busy?"Logowanie…":"Zaloguj się"}</PrimaryBtn>
      <button onClick={p.onForgot}
        style={{display:"block",margin:"16px auto 0",background:"none",border:"none",
          fontSize:13,fontWeight:600,color:T.navy,cursor:"pointer",fontFamily:"inherit"}}>
        Nie pamiętam hasła
      </button>
    </AuthShell>
  );
}

/* Ekran zaproszenia — rejestracja konta przez token z e-maila. */
function InviteScreen(p){
  var [stage,setStage]=useState("loading");   // loading | form | error
  var [info,setInfo]=useState(null);
  var [pass,setPass]=useState("");
  var [pass2,setPass2]=useState("");
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState("");

  useEffect(function(){
    apiGet("/api/app/invite/"+p.token).then(function(r){
      if(r.status===200){ setInfo(r.data); setStage("form"); }
      else { setErr(r.data.message||r.data.error||"Zaproszenie nieprawidłowe."); setStage("error"); }
    });
  }, []);

  async function submit(){
    if(pass.length<8){ setErr("Hasło musi mieć co najmniej 8 znaków."); return; }
    if(pass!==pass2){ setErr("Hasła nie są takie same."); return; }
    setBusy(true); setErr("");
    var r=await apiPost("/api/app/register",{token:p.token,password:pass});
    setBusy(false);
    if(r.status===200&&r.data.token){
      setAuthToken(r.data.token);
      p.onRegistered(r.data.user);
    } else {
      setErr(r.data.error||"Nie udało się utworzyć konta.");
    }
  }

  if(stage==="loading"){
    return <AuthShell title="Zaproszenie"><div style={{color:T.grey,fontSize:14}}>Sprawdzanie zaproszenia…</div></AuthShell>;
  }
  if(stage==="error"){
    return (
      <AuthShell title="Zaproszenie">
        <div style={{fontSize:14,color:T.red,fontWeight:600,marginBottom:16}}>{err}</div>
        <PrimaryBtn dark onClick={p.onGoLogin}>Przejdź do logowania</PrimaryBtn>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={"Cześć "+(info.firstName||"")+"!"}
      sub="Zostałeś zaproszony do firmowego wyzwania. Ustaw hasło, aby założyć konto.">
      <div style={{fontSize:13,color:T.grey,marginBottom:14}}>Konto: <b style={{color:T.text}}>{info.email}</b></div>
      <AuthField label="Hasło (min. 8 znaków)" type="password" value={pass} onChange={setPass} placeholder="••••••••"/>
      <AuthField label="Powtórz hasło" type="password" value={pass2} onChange={setPass2} onEnter={submit} placeholder="••••••••"/>
      {err&&<div style={{fontSize:12,color:T.red,fontWeight:600,marginBottom:12}}>{err}</div>}
      <PrimaryBtn dark onClick={submit}>{busy?"Tworzenie konta…":"Załóż konto i zacznij"}</PrimaryBtn>
    </AuthShell>
  );
}

/* Ekran „nie pamiętam hasła" — wysyła link resetu. */
function ForgotScreen(p){
  var [email,setEmail]=useState("");
  var [busy,setBusy]=useState(false);
  var [done,setDone]=useState(false);

  async function submit(){
    if(!email.trim()) return;
    setBusy(true);
    await apiPost("/api/app/forgot",{email:email.trim()});
    setBusy(false); setDone(true);
  }

  return (
    <AuthShell title="Reset hasła" sub="Podaj e-mail konta — wyślemy link do ustawienia nowego hasła.">
      {done?(
        <div>
          <div style={{fontSize:14,color:T.text,lineHeight:1.6,marginBottom:18}}>
            Jeśli konto istnieje, wysłaliśmy wiadomość z linkiem do resetu hasła. Sprawdź skrzynkę.
          </div>
          <PrimaryBtn dark onClick={p.onGoLogin}>Wróć do logowania</PrimaryBtn>
        </div>
      ):(
        <div>
          <AuthField label="E-mail" type="email" value={email} onChange={setEmail} onEnter={submit} placeholder="twój@email.pl"/>
          <PrimaryBtn dark onClick={submit}>{busy?"Wysyłanie…":"Wyślij link resetu"}</PrimaryBtn>
          <button onClick={p.onGoLogin}
            style={{display:"block",margin:"16px auto 0",background:"none",border:"none",
              fontSize:13,fontWeight:600,color:T.navy,cursor:"pointer",fontFamily:"inherit"}}>
            Wróć do logowania
          </button>
        </div>
      )}
    </AuthShell>
  );
}

/* Ekran ustawienia nowego hasła — z linku resetu. */
function ResetScreen(p){
  var [pass,setPass]=useState("");
  var [pass2,setPass2]=useState("");
  var [busy,setBusy]=useState(false);
  var [err,setErr]=useState("");
  var [done,setDone]=useState(false);

  async function submit(){
    if(pass.length<8){ setErr("Hasło musi mieć co najmniej 8 znaków."); return; }
    if(pass!==pass2){ setErr("Hasła nie są takie same."); return; }
    setBusy(true); setErr("");
    var r=await apiPost("/api/app/reset",{token:p.token,password:pass});
    setBusy(false);
    if(r.status===200){ setDone(true); }
    else { setErr(r.data.error||"Nie udało się zmienić hasła."); }
  }

  return (
    <AuthShell title="Nowe hasło" sub={done?"":"Ustaw nowe hasło do swojego konta."}>
      {done?(
        <div>
          <div style={{fontSize:14,color:T.text,lineHeight:1.6,marginBottom:18}}>
            Hasło zostało zmienione. Możesz się teraz zalogować.
          </div>
          <PrimaryBtn dark onClick={p.onGoLogin}>Przejdź do logowania</PrimaryBtn>
        </div>
      ):(
        <div>
          <AuthField label="Nowe hasło (min. 8 znaków)" type="password" value={pass} onChange={setPass} placeholder="••••••••"/>
          <AuthField label="Powtórz hasło" type="password" value={pass2} onChange={setPass2} onEnter={submit} placeholder="••••••••"/>
          {err&&<div style={{fontSize:12,color:T.red,fontWeight:600,marginBottom:12}}>{err}</div>}
          <PrimaryBtn dark onClick={submit}>{busy?"Zapisywanie…":"Ustaw nowe hasło"}</PrimaryBtn>
        </div>
      )}
    </AuthShell>
  );
}

export default function App(){
  var [tab,setTab]=useState("home");
  var [key,setKey]=useState(0);
  var [addOpen,setAddOpen]=useState(false);
  var [toast,setToast]=useState(null);
  var [popKey,setPopKey]=useState(0);
  var [today,setToday]=useState({pts:80,km:8.3,streak:7});
  var [myStats,setMyStats]=useState({totalPts:3842,totalKm:487,co2:38,commuteRides:5});
  var [challPts,setChallPts]=useState(12844);
  var [feed,setFeed]=useState(FEED0);
  var [dc,setDc]=useState({foot:60,wheel:0,ex:0,step:0,card:20,phone:0});
  var [actCount,setActCount]=useState({foot:1,wheel:0,ex:0,step:1,card:1,phone:0});
  var [srcs,setSrcs]=useState({card:20,gps:60,phone:0,manual:0});
  var [visits,setVisits]=useState([
    {name:"FitZone Centrum",type:"Siłownia",icon:"💪",pts:20,col:T.blue,when:"wczoraj 18:30",month:"Cze"},
    {name:"Aqua Park",     type:"Pływalnia",icon:"🏊",pts:22,col:T.navy,when:"poniedziałek", month:"Cze"},
    {name:"Yoga Studio",   type:"Joga",     icon:"🧘",pts:18,col:"#6A1B9A",when:"sobota rano",month:"Cze"},
  ]);
  var [myActs,setMyActs]=useState(MY0);
  var [phoneAdded,setPhoneAdded]=useState(new Set());
  var streak=today.streak;

  /* ── REMINDER STATE ── */
  var [reminder,setReminder]=useState({
    enabled: true,
    time: "08:00",
    days: [0,1,2,3,4],   // Mon–Fri
  });
  var [reminderBanner,setReminderBanner]=useState(false);
  var [quickOpen,setQuickOpen]=useState(false);
  var [reminderStats,setReminderStats]=useState({done:12,streak:4,pts:300});
  var [homeScrollY,setHomeScrollY]=useState(0);
  var [onboarded,setOnboarded]=useState(false);   /* czy onboarding ukończony */
  var [displayName,setDisplayName]=useState("Marek K.");   /* publiczna nazwa użytkownika */
  var displayInitials = initialsOf(displayName);
  var [regulaminOpen,setRegulaminOpen]=useState(false);
  var [todaySteps,setTodaySteps]=useState(8432);
  var [redeemed,setRedeemed]=useState([]);   /* odebrane nagrody / kupony */
  var [redeemReward,setRedeemReward]=useState(null);   /* nagroda otwarta w modalu odbioru */
  var [donateOpen,setDonateOpen]=useState(false);   /* modal przekazywania punktów */
  /* ── KONFIGURACJA Z PANELU ──
     Pobiera reguły wyzwania z API panelu. Nie blokuje renderu — aplikacja
     startuje na wartościach domyślnych i odświeża się po wczytaniu. */
  var [cfgReady,setCfgReady]=useState(false);
  useEffect(function(){
    loadConfig().then(function(){ setCfgReady(true); });
  }, []);

  /* ── UWIERZYTELNIANIE ──
     authView określa ekran logowania: 'login' | 'invite' | 'forgot' | 'reset' | null (zalogowany).
     Trasa z linku w mailu (/zaproszenie, /reset) ustala ekran startowy. */
  var [authUser,setAuthUser]=useState(null);
  var [authView,setAuthView]=useState(function(){
    var path=urlPath();
    if(path.indexOf("/zaproszenie")===0) return "invite";
    if(path.indexOf("/reset")===0) return "reset";
    return "login";
  });
  var authTokenParam=urlParam("token");
  var stepCreditRef=useRef(0);   /* ile pkt za kroki już naliczono dzisiaj (delta-credit) */
  /* Krokomierz: po osiągnięciu dziennego celu (STEP_GOAL) punkty za kroki
     naliczają się automatycznie do wyniku dzisiejszego i globalnego. */
  useEffect(function(){
    if(todaySteps < STEP_GOAL) return;
    var want = sstep(todaySteps);            /* sstep ogranicza już do limitu 100 pkt */
    var d = want - stepCreditRef.current;
    if(d <= 0) return;
    stepCreditRef.current = want;
    setToday(function(x){return {pts:x.pts+d,km:x.km,streak:x.streak};});
    setMyStats(function(x){return Object.assign({},x,{totalPts:x.totalPts+d});});
    setDc(function(x){return Object.assign({},x,{step:(x.step||0)+d});});
    setSrcs(function(x){return Object.assign({},x,{phone:(x.phone||0)+d});});
    setChallPts(function(x){return x+Math.round(d*0.45);});
  },[todaySteps]);
  var [weekSteps,setWeekSteps]=useState(WEEK_STEPS_SEED.map(function(s,i){return i===TODAY_IDX?8432:s;}));
  var scrollRef=useRef(null);
  var scrollRaf=useRef(0);
  var handleScroll=useCallback(function(){
    if(scrollRaf.current) return;            /* coalesce bursts of scroll events */
    scrollRaf.current=requestAnimationFrame(function(){
      scrollRaf.current=0;
      if(scrollRef.current) setHomeScrollY(scrollRef.current.scrollTop);
    });
  },[]);

  function go(t){
    setTab(t);
    setKey(function(k){return k+1;});
    setHomeScrollY(0);
    if(scrollRef.current) scrollRef.current.scrollTop=0;
  }
  function showToast(icon,name,pts){setToast({icon:icon,name:name,pts:pts});setTimeout(function(){setToast(null);},3000);}

  function addEntry(entry){
    setMyActs(function(prev){return [Object.assign({},entry,{today:true}),...prev];});
    setSrcs(function(prev){var n=Object.assign({},prev);n[entry.src]=(n[entry.src]||0)+entry.pts;return n;});
    setDc(function(prev){var n=Object.assign({},prev);n[entry.cat]=(n[entry.cat]||0)+entry.pts;return n;});
    setActCount(function(prev){var n=Object.assign({},prev);n[entry.cat]=(n[entry.cat]||0)+1;return n;});
  }

  function handleSave(cat,act,km,mins,commute,pts,verif){
    var nk=(cat==="foot"||cat==="wheel")?km:0;
    var stat=nk>0?(km.toFixed(1)+" km"):(mins+" min");
    var co2=parseFloat((nk*0.21).toFixed(1));
    setToday(function(x){return{pts:x.pts+pts,km:parseFloat((x.km+nk).toFixed(1)),streak:x.streak};});
    setMyStats(function(x){return{totalPts:x.totalPts+pts,totalKm:parseFloat((x.totalKm+nk).toFixed(1)),co2:parseFloat((x.co2+co2).toFixed(1)),commuteRides:x.commuteRides+(commute?1:0)};});
    setChallPts(function(x){return x+Math.round(pts*0.45);});
    addEntry({id:Date.now(),cat:cat,type:act.name,icon:act.icon,stat:stat,pts:pts,src:"manual",ago:"teraz",commute:commute,suppressed:false,verif:verif||null});
    setFeed(function(x){return [{id:newFeedId(),user:displayName,initials:displayInitials,type:act.name,stat:stat,pts:pts,ago:"teraz",cat:cat,ok:false,isNew:true,likes:0,coms:0,verif:verif||null},...x];});
    setPopKey(function(k){return k+1;});
    showToast(act.icon,act.name,pts);
    go("home");
  }

  function handlePhone(id,cat,km,mins){
    if(cat==="step"){
      var pts=Math.min(sstep(todaySteps),Math.max(0,LIM-(dc.step||0)));   /* dzienny limit 100 pkt */
      var sup=(dc.foot||0)>pts;
      setPhoneAdded(function(s){var n=new Set(s);n.add(id);return n;});
      if(!sup){setToday(function(x){return{pts:x.pts+pts,km:x.km,streak:x.streak};});setMyStats(function(x){return Object.assign({},x,{totalPts:x.totalPts+pts});});setChallPts(function(x){return x+Math.round(pts*0.45);});}
      addEntry({id:Date.now(),cat:"step",type:"Kroki",icon:"🚶",stat:todaySteps.toLocaleString("pl"),pts:sup?0:pts,src:"phone",ago:"teraz",suppressed:sup,commute:false});
      if(!sup)setSrcs(function(x){return Object.assign({},x,{phone:x.phone+pts});});
      showToast("🚶","Kroki",sup?0:pts);go("home");return;
    }
    var fcat=cat;
    var pts=fcat==="foot"?sfoot(km,actCount.foot||0):swheel(km,actCount.wheel||0,false);
    pts=Math.min(pts,Math.max(0,LIM-(dc[fcat]||0)));   /* dzienny limit 100 pkt / kategoria */
    var nk=parseFloat(km)||0;
    var stat=nk>0?(nk.toFixed(1)+" km"):(mins+" min");
    setPhoneAdded(function(s){var n=new Set(s);n.add(id);return n;});
    setToday(function(x){return{pts:x.pts+pts,km:parseFloat((x.km+nk).toFixed(1)),streak:x.streak};});
    setMyStats(function(x){return{totalPts:x.totalPts+pts,totalKm:parseFloat((x.totalKm+nk).toFixed(1)),co2:parseFloat((x.co2+(nk*0.21)).toFixed(1)),commuteRides:x.commuteRides};});
    setChallPts(function(x){return x+Math.round(pts*0.45);});
    var icon=fcat==="foot"?"🏃":"🚴";var tname=fcat==="foot"?"Bieg (GPS)":"Rower (GPS)";
    addEntry({id:Date.now(),cat:fcat,type:tname,icon:icon,stat:stat,pts:pts,src:"gps",ago:"teraz",suppressed:false,commute:false});
    setFeed(function(x){return [{id:newFeedId(),user:displayName,initials:displayInitials,type:tname,stat:stat,pts:pts,ago:"teraz",cat:fcat,ok:true,isNew:true,likes:0,coms:0},...x];});
    setPopKey(function(k){return k+1;});
    showToast(icon,tname,pts);go("home");
  }

  function handleCI(fac){
    setVisits(function(x){return [Object.assign({},fac,{when:"teraz",month:"Cze"}),...x];});
    setToday(function(x){return{pts:x.pts+fac.pts,km:x.km,streak:x.streak};});
    setMyStats(function(x){return Object.assign({},x,{totalPts:x.totalPts+fac.pts});});
    setChallPts(function(x){return x+Math.round(fac.pts*0.45);});
    addEntry({id:Date.now(),cat:"card",type:fac.name,icon:fac.icon,stat:"Karta FP",pts:fac.pts,src:"card",ago:"teraz",suppressed:false,commute:false});
    setFeed(function(x){return [{id:newFeedId(),user:displayName,initials:displayInitials,type:fac.name,stat:"Karta FitProfit",pts:fac.pts,ago:"teraz",cat:"card",ok:false,isNew:true,likes:0,coms:0},...x];});
    setSrcs(function(x){return Object.assign({},x,{card:x.card+fac.pts});});
    setDc(function(x){return Object.assign({},x,{card:x.card+fac.pts});});
    setPopKey(function(k){return k+1;});
    showToast(fac.icon,fac.name,fac.pts);go("home");
  }

  /* ── ODBIÓR NAGRODY ── odejmuje punkty, wydaje kod kuponu z puli z panelu */
  function handleRedeem(rew){
    if(myStats.totalPts < rew.cost) return "";
    var code;
    var pool=(rew.codes||[]).filter(function(c){return !USED_CODES[c];});
    if(pool.length){
      code=pool[Math.floor(Math.random()*pool.length)];
      USED_CODES[code]=true;
    }else if(rew.codes&&rew.codes.length){
      code=rew.codes[Math.floor(Math.random()*rew.codes.length)];
    }else{
      var rnd=function(){return Math.random().toString(36).slice(2,6).toUpperCase();};
      code="FP-"+rnd()+"-"+rnd();
    }
    setMyStats(function(x){return Object.assign({},x,{totalPts:x.totalPts-rew.cost});});
    setRedeemed(function(prev){return [{name:rew.name,icon:rew.icon,img:rew.img||"",cost:rew.cost,code:code,date:fmtDate(new Date())},...prev];});
    return code;
  }

  /* ── PRZEKAZANIE PUNKTÓW ── ze salda użytkownika do wspólnej puli wyzwania */
  function handleDonate(amt){
    amt=Math.floor(amt)||0;
    if(amt<=0 || amt>myStats.totalPts) return;
    setMyStats(function(x){return Object.assign({},x,{totalPts:x.totalPts-amt});});
    setChallPts(function(x){return x+amt;});
  }

  /* ── QUICK ACTIVITY COMPLETE ── */
  function handleQuickComplete(act, pts){
    setToday(function(x){return{pts:x.pts+pts,km:x.km,streak:x.streak};});
    setMyStats(function(x){return Object.assign({},x,{totalPts:x.totalPts+pts});});
    setChallPts(function(x){return x+Math.round(pts*0.45);});
    setReminderStats(function(r){return{done:r.done+1,streak:r.streak+1,pts:r.pts+pts};});
    addEntry({id:Date.now(),cat:"ex",type:act.name+" (5 min)",icon:act.icon,stat:"5 min · przypomnienie",pts:pts,src:"manual",ago:"teraz",suppressed:false,commute:false});
    setFeed(function(x){return [{id:newFeedId(),user:displayName,initials:displayInitials,type:act.name+" (5 min)",stat:"Ćwiczenie · Przypomnienie",pts:pts,ago:"teraz",cat:"ex",ok:false,isNew:true,likes:0,coms:0},...x];});
    setPopKey(function(k){return k+1;});
    setQuickOpen(false);
    setReminderBanner(false);
    showToast(act.icon,act.name+" (5 min)",pts);
    go("home");
  }

  var TABS=[
    {id:"home",    lbl:"Główna",    ico:IcoHome},
    {id:"rank",    lbl:"Ranking",   ico:IcoRank},
    {id:"feed",    lbl:"Feed",      ico:IcoFeed},
    {id:"nagrody", lbl:"Nagrody",   ico:IcoGift},
    {id:"settings",lbl:"Ustawienia",ico:IcoSettings},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#EAEAEC",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:"24px 16px"}}>
      <style>{CSS}</style>

      {/* Brand row */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:8,background:T.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:14,color:"#fff",fontWeight:800}}>V</span>
          </div>
          <span style={{fontSize:14,fontWeight:800,color:T.navy}}>VanityStyle NEXT</span>
        </div>
        <div style={{width:1,height:14,background:"#CCC"}}/>
        <span style={{fontSize:11,color:T.grey,fontWeight:500}}>FitProfit · Activy Rules</span>
      </div>

      {/* Phone frame */}
      <div style={{width:375,height:812,background:T.bg,borderRadius:48,border:"1px solid #C0C0C0",boxShadow:"0 0 0 8px #E0E0E0, 0 0 0 9px #D0D0D0, 0 48px 120px rgba(0,0,0,0.2)",overflow:"hidden",display:"flex",flexDirection:"column",position:"relative"}}>

        {/* Uwierzytelnianie — logowanie / zaproszenie / reset hasła (overlay) */}
        {authView==="login"&&(
          <LoginScreen
            onLoggedIn={function(u){ setAuthUser(u); if(u&&u.displayName) setDisplayName(u.displayName); setAuthView(null); }}
            onForgot={function(){ setAuthView("forgot"); }}
          />
        )}
        {authView==="invite"&&(
          <InviteScreen token={authTokenParam}
            onRegistered={function(u){ setAuthUser(u); if(u&&u.displayName) setDisplayName(u.displayName); setAuthView(null); }}
            onGoLogin={function(){ setAuthView("login"); }}
          />
        )}
        {authView==="forgot"&&(
          <ForgotScreen onGoLogin={function(){ setAuthView("login"); }}/>
        )}
        {authView==="reset"&&(
          <ResetScreen token={authTokenParam} onGoLogin={function(){ setAuthView("login"); }}/>
        )}

        {/* Onboarding — wdrożenie nowego użytkownika (overlay) */}
        {!authView&&!onboarded&&<Onboarding onFinish={function(cfg){setDisplayName(cfg.displayName);setReminder(cfg.reminder);setOnboarded(true);}}/>}

        {/* Toast */}
        <div style={{position:"absolute",top:48,left:0,right:0,zIndex:400,padding:"0 0",pointerEvents:"none"}}>
          <Toast t={toast}/>
        </div>

        {/* Reminder banner */}
        {!quickOpen&&(
          <ReminderBanner
            show={reminderBanner}
            onOpen={function(){setReminderBanner(false);setQuickOpen(true);}}
            onDismiss={function(){setReminderBanner(false);}}
          />
        )}

        {/* Status bar */}
        <div style={{height:44,background:T.navy,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",flexShrink:0,zIndex:20}}>
          <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>10:07</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <svg width="16" height="12" viewBox="0 0 17 12">{[0,1,2,3].map(function(i){return <rect key={i} x={i*4.2} y={12-(i+1)*3} width={3.2} height={(i+1)*3} rx={0.8} fill={i<3?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.25)"}/>;})}</svg>
            <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>5G</span>
            <div style={{width:24,height:12,border:"1.5px solid rgba(255,255,255,0.6)",borderRadius:3,padding:"1.5px 2px",display:"flex",position:"relative"}}>
              <div style={{width:"70%",height:"100%",background:"rgba(255,255,255,0.8)",borderRadius:1.5}}/>
            </div>
            {reminder.enabled&&(
              <div style={{width:8,height:8,borderRadius:"50%",background:"#4CAF50",marginLeft:2}} title={"Przypomnienie "+reminder.time}/>
            )}
          </div>
        </div>

        {/* Content */}
        <div ref={scrollRef} onScroll={handleScroll} style={{flex:1,overflowY:"auto",background:T.bg}}>
          <div key={key} className="scr">
            {tab==="home"    &&<Home displayName={displayName} displayInitials={displayInitials} today={today} srcs={srcs} myStats={myStats} acts={myActs} popKey={popKey} streak={streak} scrollY={homeScrollY} todaySteps={todaySteps} weekSteps={weekSteps} onSyncSteps={function(){setTodaySteps(function(s){return s+Math.floor(Math.random()*400+100);});}} onAdd={function(){setAddOpen(true);}} reminder={reminder} reminderStats={reminderStats} onOpenQuick={function(){setQuickOpen(true);}} onGoSettings={function(){go("settings");}}/>}
            {tab==="rank"    &&<Ranking myPts={myStats.totalPts} scrollY={homeScrollY} displayName={displayName} displayInitials={displayInitials}/>}
            {tab==="feed"    &&<Feed feed={feed} scrollY={homeScrollY} displayName={displayName} displayInitials={displayInitials}/>}
            {tab==="nagrody" &&<Nagrody myPts={myStats.totalPts} challPts={challPts} redeemed={redeemed} onRedeem={handleRedeem} onPickReward={setRedeemReward} onOpenDonate={function(){setDonateOpen(true);}} scrollY={homeScrollY}/>}
            {tab==="settings"&&<Settings reminder={reminder} setReminder={setReminder} onTestReminder={function(){setReminderBanner(true);go("home");}} onNavigate={function(id){if(id==="regulamin")setRegulaminOpen(true);}}/>}
          </div>
        </div>

        {/* Bottom nav */}
        <nav style={{height:76,background:T.card,borderTop:"1px solid "+T.border,display:"flex",alignItems:"flex-start",justifyContent:"space-around",padding:"10px 8px 0",flexShrink:0,zIndex:20}}>
          {TABS.map(function(n){
            var a=tab===n.id;
            var col=a?T.navy:T.grey;
            return (
              <button key={n.id} onClick={function(){go(n.id);}} className="tap"
                style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"2px 4px",cursor:"pointer",minWidth:44,position:"relative"}}>
                {a&&<div style={{position:"absolute",top:-10,width:24,height:3,borderRadius:"0 0 3px 3px",background:T.navy}}/>}
                {/* Bell dot on settings if reminder active */}
                {n.id==="settings"&&reminder.enabled&&!a&&(
                  <div style={{position:"absolute",top:0,right:6,width:7,height:7,borderRadius:"50%",background:"#4CAF50",border:"1.5px solid "+T.card}}/>
                )}
                {n.ico(a,col)}
                <span style={{fontSize:9,fontWeight:a?700:500,color:col,fontFamily:"inherit"}}>{n.lbl}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Feature tags */}
      <div style={{marginTop:18,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
        {["VanityStyle NEXT","Przypomnienia +25 pkt","Timer 5 min","GPS+Karta","Activy Rules"].map(function(t,i){
          return <span key={i} style={{fontSize:11,color:"#999",fontWeight:500,background:"#FFF",border:"1px solid #E8E8E8",borderRadius:99,padding:"3px 10px"}}>· {t}</span>;
        })}
      </div>

      {regulaminOpen&&(
        <div style={{position:"absolute",inset:0,background:T.bg,zIndex:200,overflowY:"auto"}}>
          <Regulamin onBack={function(){setRegulaminOpen(false);}}/>
        </div>
      )}
      {addOpen&&<AddModal onClose={function(){setAddOpen(false);}} onSave={handleSave} onPhone={handlePhone} phoneAdded={phoneAdded} dc={dc} actCount={actCount} todaySteps={todaySteps} streak={streak}/>}
      {redeemReward&&<RedeemModal reward={redeemReward} myPts={myStats.totalPts} onRedeem={handleRedeem} onClose={function(){setRedeemReward(null);}}/>}
      {donateOpen&&<DonateModal myPts={myStats.totalPts} challPts={challPts} onDonate={handleDonate} onClose={function(){setDonateOpen(false);}}/>}
      {quickOpen&&<QuickActivityModal onClose={function(){setQuickOpen(false);}} onComplete={handleQuickComplete} reminderTime={reminder.time}/>}
    </div>
  );
}
