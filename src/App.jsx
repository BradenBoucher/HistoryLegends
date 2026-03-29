import { useState, useEffect, useCallback, useRef, useReducer } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const TIMER_DURATION = 45;
const SPEED_TIERS = [
  { maxPercent:0.25, multiplier:2.5, label:"LIGHTNING", color:"#FFD700" },
  { maxPercent:0.50, multiplier:1.75, label:"SWIFT", color:"#4FC3F7" },
  { maxPercent:0.75, multiplier:1.25, label:"STEADY", color:"#81C784" },
  { maxPercent:1.00, multiplier:1.0, label:"SLOW", color:"#E0E0E0" },
];
const CRIT_MULTIPLIER = 1.5;
const SCREENS = { AUTH:"AUTH", HOME:"HOME", US_HISTORY:"US_HISTORY", REV_WAR:"REV_WAR", ARTWORK:"ARTWORK", PRE_BATTLE:"PRE_BATTLE", BATTLE:"BATTLE", SHOP:"SHOP" };
const CHAR_STATES = { IDLE:"idle", ATTACK:"attack", HIT:"hit", CRITICAL:"critical" };
const PHASES = { PRE_BATTLE:"PRE_BATTLE", PLAYER_TURN:"PLAYER_TURN", ANSWER_RESULT:"ANSWER_RESULT", ENEMY_TURN:"ENEMY_TURN", VICTORY:"VICTORY", DEFEAT:"DEFEAT" };
const fonts = { heading:"'Cinzel', serif", body:"'EB Garamond', serif", mono:"'Share Tech Mono', monospace" };
const btn = (bg,border) => ({ background:bg, border:`1px solid ${border}`, borderRadius:10, padding:"12px 32px", color:"#E0E0E0", fontFamily:fonts.heading, fontSize:"0.8rem", letterSpacing:"0.1em", cursor:"pointer", textTransform:"uppercase", transition:"all 0.2s" });
const goldBtn = { ...btn("linear-gradient(135deg, #FFD700, #FFA000)","transparent"), color:"#1a1a2e", fontWeight:700, boxShadow:"0 4px 20px rgba(255,215,0,0.25)" };
const blueBtn = btn("linear-gradient(135deg, #1565C0, #0D47A1)","rgba(79,195,247,0.3)");
const redBtn = btn("linear-gradient(135deg, #C62828, #B71C1C)","rgba(239,83,80,0.3)");

const UPGRADES = {
  maxHP:    { label:"Max HP",      icon:"❤️", levels:[120,140,160,180,200], costs:[0,50,120,200,350], desc:["120 HP","140 HP","160 HP","180 HP","200 HP"] },
  baseDmg:  { label:"Base Damage", icon:"⚔️", levels:[20,24,28,32,36],     costs:[0,60,140,250,400], desc:["20 dmg","24 dmg","28 dmg","32 dmg","36 dmg"] },
  critRate: { label:"Crit Chance", icon:"💥", levels:[0.15,0.20,0.25,0.30,0.35], costs:[0,75,160,280,450], desc:["15%","20%","25%","30%","35%"] },
};

// ─── QUESTION BANKS ──────────────────────────────────────────────────────────
const Q_LEXINGTON = [
  { text:"In what year did the Battles of Lexington and Concord take place?", options:["1774","1775","1776","1773"], answer:1, explanation:"Fought on April 19, 1775." },
  { text:"Who commanded the British forces during the march to Concord?", options:["General Howe","General Cornwallis","Lt. Col. Francis Smith","General Burgoyne"], answer:2, explanation:"Lt. Col. Smith led the expedition." },
  { text:"What was the primary objective of the British march?", options:["Arrest Samuel Adams","Seize colonial weapons","Establish a fort","Collect taxes"], answer:1, explanation:"They aimed to confiscate military supplies." },
  { text:"Who is credited with the famous midnight ride?", options:["Benjamin Franklin","John Adams","Paul Revere","Thomas Jefferson"], answer:2, explanation:"Revere rode from Boston to Lexington on April 18." },
  { text:"Which militia was ready at a minute's notice?", options:["Continental Army","Sons of Liberty","Minutemen","Rangers"], answer:2, explanation:"Minutemen pledged instant readiness." },
  { text:"The first shot at Lexington is called what?", options:["Shot of Freedom","Opening Salvo","Shot Heard Round the World","First Volley"], answer:2, explanation:"Coined by Emerson in 1837." },
  { text:"Who led colonial militia at Lexington Green?", options:["John Parker","George Washington","Ethan Allen","Benedict Arnold"], answer:0, explanation:"Capt. Parker commanded ~77 Minutemen." },
  { text:"About how many militia stood on Lexington Green?", options:["About 200","About 77","About 500","About 30"], answer:1, explanation:"~77 Minutemen, vastly outnumbered." },
  { text:"Where did militia inflict heavy casualties on retreating British?", options:["Boston Harbor","Bunker Hill","Along the road to Boston","Philadelphia"], answer:2, explanation:"Fired from behind trees and walls." },
  { text:"What signal warned of the British route?", options:["Cannon shots","Flag signals","Lanterns in Old North Church","Drums"], answer:2, explanation:"Two lanterns meant 'by sea.'" },
  { text:"About how many British soldiers marched to Concord?", options:["250","700","1,500","3,000"], answer:1, explanation:"~700 British regulars." },
  { text:"What 1774 act fueled colonial anger?", options:["Stamp Act","Intolerable Acts","Townshend Acts","Quartering Act"], answer:1, explanation:"Punished Massachusetts for the Tea Party." },
];
const Q_TICONDEROGA = [
  { text:"Who led the colonial capture of Fort Ticonderoga?", options:["George Washington","Ethan Allen","John Adams","Nathanael Greene"], answer:1, explanation:"Ethan Allen led the surprise attack in May 1775." },
  { text:"What militia group did Ethan Allen lead?", options:["Minutemen","Continental Army","Green Mountain Boys","Sons of Liberty"], answer:2, explanation:"The Green Mountain Boys were a Vermont militia." },
  { text:"What was the key strategic value of capturing Ticonderoga?", options:["Prison camp","Artillery and cannons","Naval base","Gold reserves"], answer:1, explanation:"The fort contained valuable cannons and artillery." },
  { text:"Who transported the captured cannons to Boston?", options:["Paul Revere","Henry Knox","Benedict Arnold","Ethan Allen"], answer:1, explanation:"Henry Knox moved 60 tons of artillery in winter." },
  { text:"In what colony was Fort Ticonderoga located?", options:["Massachusetts","Connecticut","New York","Vermont"], answer:2, explanation:"The fort was in upstate New York." },
  { text:"What body of water is Ticonderoga near?", options:["Hudson River","Lake Champlain","Lake Ontario","Atlantic Ocean"], answer:1, explanation:"It controlled the southern end of Lake Champlain." },
  { text:"About how many British soldiers defended the fort?", options:["200","500","48","1,000"], answer:2, explanation:"Only about 48 British soldiers garrisoned the fort." },
  { text:"Who also led forces alongside Ethan Allen?", options:["George Washington","Benedict Arnold","John Hancock","Thomas Jefferson"], answer:1, explanation:"Benedict Arnold arrived with a Massachusetts commission." },
  { text:"What was Ticonderoga originally called by the French?", options:["Fort Duquesne","Fort Carillon","Fort Louis","Fort Quebec"], answer:1, explanation:"The French built it as Fort Carillon in 1755." },
  { text:"When was Fort Ticonderoga captured?", options:["April 1775","May 1775","June 1775","July 1775"], answer:1, explanation:"Captured on May 10, 1775." },
];
const Q_BUNKER = [
  { text:"Where did the actual fighting at 'Bunker Hill' mostly take place?", options:["Bunker Hill","Breed's Hill","Dorchester Heights","Castle Island"], answer:1, explanation:"Fighting was on Breed's Hill, closer to Boston." },
  { text:"What famous order was given about when to fire?", options:["Fire at will","Shoot to kill","Don't fire until you see the whites of their eyes","Hold the line"], answer:2, explanation:"Attributed to Col. Prescott or Gen. Putnam." },
  { text:"Who was the colonial commander at Bunker Hill?", options:["George Washington","Col. William Prescott","Ethan Allen","Gen. Putnam"], answer:1, explanation:"Col. Prescott commanded the redoubt defense." },
  { text:"How many times did the British assault the hill?", options:["1","2","3","4"], answer:2, explanation:"Three assaults — the third finally took the position." },
  { text:"What was the outcome of the battle?", options:["Colonial victory","British victory with heavy losses","Stalemate","Colonial surrender"], answer:1, explanation:"A British tactical victory but with devastating casualties." },
  { text:"Approximately how many British casualties occurred?", options:["200","500","1,000","2,000"], answer:2, explanation:"About 1,000 British killed or wounded." },
  { text:"What American general was killed at Bunker Hill?", options:["George Washington","Joseph Warren","Henry Knox","Nathanael Greene"], answer:1, explanation:"Dr. Joseph Warren was killed during the British final assault." },
  { text:"What city were the colonials trying to protect?", options:["New York","Philadelphia","Boston","Charleston"], answer:2, explanation:"The fortifications overlooked Boston and its harbor." },
  { text:"Who commanded the British forces at Bunker Hill?", options:["Gen. Gage","Gen. William Howe","Gen. Cornwallis","Gen. Burgoyne"], answer:1, explanation:"Gen. Howe led the British assault forces." },
  { text:"What did the colonials build overnight on Breed's Hill?", options:["A fort","A redoubt (earthwork fortification)","A stone wall","A trench system"], answer:1, explanation:"They constructed a redoubt in a single night." },
];
const Q_BOSTON = [
  { text:"Approximately how long did the Siege of Boston last?", options:["3 months","6 months","11 months","2 years"], answer:2, explanation:"From April 1775 to March 1776, about 11 months." },
  { text:"What fortification did Washington occupy to force the British out?", options:["Bunker Hill","Dorchester Heights","Castle William","Fort Independence"], answer:1, explanation:"Fortifying Dorchester Heights gave cannon range over the city." },
  { text:"Where did the cannons placed at Dorchester Heights come from?", options:["France","Fort Ticonderoga","Philadelphia","Local foundries"], answer:1, explanation:"Henry Knox's expedition brought them from Ticonderoga." },
  { text:"Who commanded the Continental Army during the siege?", options:["Ethan Allen","Gen. Howe","George Washington","John Adams"], answer:2, explanation:"Washington took command in July 1775." },
  { text:"When did the British evacuate Boston?", options:["January 1776","March 17, 1776","July 4, 1776","December 1776"], answer:1, explanation:"March 17, 1776 — now celebrated as Evacuation Day." },
  { text:"Where did the British fleet sail to after evacuating?", options:["New York","London","Halifax, Nova Scotia","Charleston"], answer:2, explanation:"The British fleet withdrew to Halifax." },
  { text:"About how many British troops evacuated Boston?", options:["3,000","6,000","9,000","15,000"], answer:2, explanation:"About 9,000 troops plus 1,000 loyalists." },
  { text:"What was the day the British left Boston called?", options:["Liberation Day","Evacuation Day","Freedom Day","Victory Day"], answer:1, explanation:"March 17 is still Evacuation Day in Boston." },
  { text:"What colonial strategy cut off British supply lines?", options:["Privateering against supply ships","Poisoning wells","Naval blockade","Burning bridges"], answer:0, explanation:"Privateers harassed British supply ships." },
  { text:"What book inspired colonists during the siege?", options:["The Federalist Papers","Common Sense by Thomas Paine","Poor Richard's Almanack","The Rights of Man"], answer:1, explanation:"Published January 1776, it galvanized independence sentiment." },
];
const Q_LONGISLAND = [
  { text:"When was the Battle of Long Island fought?", options:["June 1776","August 27, 1776","October 1776","December 1776"], answer:1, explanation:"August 27, 1776 — the largest battle of the Revolution." },
  { text:"In what modern borough did most fighting occur?", options:["Manhattan","Queens","Brooklyn","Staten Island"], answer:2, explanation:"The battle was fought across what is now Brooklyn." },
  { text:"How did Washington's army escape after the defeat?", options:["Fought through British lines","Nighttime boat evacuation","Surrender and parole","Underground tunnels"], answer:1, explanation:"A masterful nighttime evacuation across the East River." },
  { text:"What geographic feature did the British use to flank?", options:["Hudson River","Jamaica Pass","Central Park","Harlem Heights"], answer:1, explanation:"The British sent forces through the unguarded Jamaica Pass." },
  { text:"What foreign soldiers fought for the British?", options:["French mercenaries","Spanish soldiers","Hessian (German) mercenaries","Dutch volunteers"], answer:2, explanation:"Hessians were German soldiers hired by the British." },
  { text:"What was significant about this battle's size?", options:["Fewest casualties","Largest battle of the Revolution","First naval battle","Longest battle"], answer:1, explanation:"It was the largest battle of the entire war." },
  { text:"Who commanded the British forces?", options:["Gen. Cornwallis","Gen. Burgoyne","Gen. William Howe","Gen. Clinton"], answer:2, explanation:"Gen. Howe commanded the British and Hessian forces." },
  { text:"About how many troops did the British have?", options:["10,000","20,000","32,000","50,000"], answer:2, explanation:"About 32,000 British and Hessian troops." },
];

const BATTLES = [
  { id:"lexington", name:"Lexington & Concord", date:"Apr 1775", general:"Gen. Gage", generalTitle:"British Commander", icon:"🔫", hp:200, dmg:18, questions:Q_LEXINGTON, context:"British troops marched from Boston to seize colonial weapons stored in Concord. Warned by riders including Paul Revere, militia assembled on Lexington Green. The resulting skirmishes ignited the Revolutionary War." },
  { id:"ticonderoga", name:"Fort Ticonderoga", date:"May 1775", general:"Capt. Delaplace", generalTitle:"Fort Commander", icon:"🏰", hp:220, dmg:20, questions:Q_TICONDEROGA, context:"Just weeks after Lexington, Ethan Allen's Green Mountain Boys and Benedict Arnold launched a surprise dawn attack on this British fort. Its capture provided desperately needed artillery that would later liberate Boston." },
  { id:"bunker", name:"Bunker Hill", date:"Jun 1775", general:"Gen. Howe", generalTitle:"British Assault Commander", icon:"⛰️", hp:240, dmg:22, questions:Q_BUNKER, context:"Colonial forces fortified Breed's Hill overnight to threaten British-held Boston. The British launched three frontal assaults, ultimately taking the position but suffering devastating casualties." },
  { id:"boston", name:"Siege of Boston", date:"Mar 1776", general:"Gen. Howe", generalTitle:"British Garrison Commander", icon:"🏘️", hp:260, dmg:22, questions:Q_BOSTON, context:"For 11 months, Washington's Continental Army surrounded British-held Boston. When Henry Knox's cannons from Ticonderoga were placed on Dorchester Heights, the British position became untenable." },
  { id:"longisland", name:"Battle of Long Island", date:"Aug 1776", general:"Gen. Howe", generalTitle:"British Commander-in-Chief", icon:"🏝️", hp:350, dmg:28, boss:true, bossReviewDmg:14, questions:Q_LONGISLAND, context:"The largest battle of the entire Revolution. Howe landed 32,000 troops and flanked the Americans through Jamaica Pass. Washington's daring nighttime evacuation saved his army from destruction." },
];

const REV_WAR_MAP = [
  { id:"yorktown",name:"Siege of Yorktown",date:"Oct 1781",general:"Lord Cornwallis",boss:"FINAL BOSS",icon:"🏰" },
  { id:"chesapeake",name:"Battle of the Chesapeake",date:"Sep 1781",general:"Adm. Graves",icon:"⚓" },
  { id:"eutaw",name:"Battle of Eutaw Springs",date:"Sep 1781",general:"Lt. Col. Stuart",icon:"🌿" },
  { id:"ninetysix",name:"Siege of Ninety-Six",date:"May 1781",general:"Lt. Col. Cruger",icon:"🏚️" },
  { id:"guilford",name:"Guilford Courthouse",date:"Mar 1781",general:"Lord Cornwallis",icon:"⚔️" },
  { id:"cowpens",name:"Battle of Cowpens",date:"Jan 1781",general:"Col. Tarleton",boss:"BOSS",icon:"🐄" },
  { id:"camden",name:"Battle of Camden",date:"Aug 1780",general:"Lord Cornwallis",icon:"⚔️" },
  { id:"savannah",name:"Siege of Savannah",date:"Oct 1779",general:"Gen. Prévost",icon:"🌴" },
  { id:"monmouth",name:"Battle of Monmouth",date:"Jun 1778",general:"Gen. Clinton",icon:"⚔️" },
  { id:"valleyforge",name:"Valley Forge",date:"Winter 1777–78",general:"Survival",icon:"🏕️" },
  { id:"saratoga",name:"Battle of Saratoga",date:"Oct 1777",general:"Gen. Burgoyne",boss:"BOSS",icon:"🏳️" },
  { id:"germantown",name:"Battle of Germantown",date:"Oct 1777",general:"Gen. Howe",icon:"⚔️" },
  { id:"brandywine",name:"Battle of Brandywine",date:"Sep 1777",general:"Gen. Howe",icon:"🌊" },
  { id:"princeton",name:"Battle of Princeton",date:"Jan 1777",general:"Gen. Cornwallis",icon:"⚔️" },
  { id:"trenton",name:"Battle of Trenton",date:"Dec 1776",general:"Col. Rall",icon:"🎄" },
  { id:"longisland",name:"Battle of Long Island",date:"Aug 1776",general:"Gen. Howe",boss:"BOSS",icon:"🏝️" },
  { id:"boston",name:"Siege of Boston",date:"Mar 1776",general:"Gen. Howe",icon:"🏘️" },
  { id:"bunker",name:"Bunker Hill",date:"Jun 1775",general:"Gen. Howe",icon:"⛰️" },
  { id:"ticonderoga",name:"Fort Ticonderoga",date:"May 1775",general:"Capt. Delaplace",icon:"🏰" },
  { id:"lexington",name:"Lexington & Concord",date:"Apr 1775",general:"Gen. Gage",icon:"🔫" },
];

// ═════════════════════════════════════════════════════════════════════════════
// CHIBI SVGs
// ═════════════════════════════════════════════════════════════════════════════
function ChibiColonial({ state:st=CHAR_STATES.IDLE, size=140 }) {
  const s=size/160, atk=st===CHAR_STATES.ATTACK, hit=st===CHAR_STATES.HIT, crit=st===CHAR_STATES.CRITICAL;
  return (<svg viewBox="0 0 120 160" width={120*s} height={160*s} xmlns="http://www.w3.org/2000/svg" style={{filter:hit?"brightness(1.4) saturate(0.6)":crit?"saturate(0.7)":"none"}}>
    {atk&&<g><polygon points="98,52 118,45 115,55 125,50 112,60 116,58 100,62" fill="#FFD700" opacity="0.9"><animate attributeName="opacity" values="1;0.5;1" dur="0.2s" repeatCount="indefinite"/></polygon><circle cx="102" cy="56" r="7" fill="#FFF" opacity="0.8"><animate attributeName="r" values="5;8;5" dur="0.25s" repeatCount="indefinite"/></circle></g>}
    {hit&&<text x="50" y="15" textAnchor="middle" fontSize="14" fill="#FF4444" fontWeight="bold" fontFamily="sans-serif"><animate attributeName="opacity" values="1;0;1" dur="0.3s" repeatCount="indefinite"/>✕</text>}
    <ellipse cx="52" cy="155" rx={crit?32:26} ry="4" fill="rgba(0,0,0,0.25)"/>
    <g transform={hit?"translate(4,0)":crit?"translate(0,8)":""}>
      <rect x={crit?"30":"35"} y={crit?"118":"115"} width="11" height={crit?"22":"26"} rx="4" fill="#E8DCC8"/><rect x={crit?"50":"55"} y={crit?"120":"115"} width="11" height={crit?"20":"26"} rx="4" fill="#E8DCC8"/>
      <rect x={crit?"28":"33"} y={crit?"135":"136"} width="15" height="12" rx="4" fill="#2A1A0E"/><rect x={crit?"48":"53"} y={crit?"135":"136"} width="15" height="12" rx="4" fill="#2A1A0E"/>
      <rect x="30" y="76" width="40" height={crit?"46":"42"} rx="7" fill="#1B3D6E"/>
      <path d="M 43 78 L 46 78 L 48 108 L 42 108 Z" fill="#C9AD6A"/><path d="M 54 78 L 57 78 L 58 108 L 52 108 Z" fill="#C9AD6A"/>
      <ellipse cx="32" cy="78" rx="6" ry="3" fill="#C9AD6A"/><ellipse cx="68" cy="78" rx="6" ry="3" fill="#C9AD6A"/>
      <circle cx="50" cy="84" r="1.3" fill="#D4B872"/><circle cx="50" cy="91" r="1.3" fill="#D4B872"/><circle cx="50" cy="98" r="1.3" fill="#D4B872"/>
      <rect x="28" y="107" width="44" height="5" rx="2" fill="#C9AD6A"/>
      {crit?<><rect x="22" y="82" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="66" y="85" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="15" y="90" width="3.5" height="40" rx="1.5" fill="#5A3820" transform="rotate(-5 16 90)"/></>
      :atk?<><rect x="24" y="78" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="64" y="76" width="14" height="9" rx="5" fill="#1B3D6E"/><rect x="60" y="48" width="3.5" height="46" rx="1.5" fill="#5A3820" transform="rotate(-20 62 72)"/><rect x="61" y="34" width="2.5" height="18" rx="1" fill="#666" transform="rotate(-20 62 43)"/></>
      :<><rect x="22" y="80" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="66" y="80" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="22" y="52" width="3.5" height="48" rx="1.5" fill="#5A3820" transform="rotate(10 24 76)"/><rect x="22.5" y="36" width="2.5" height="20" rx="1" fill="#666" transform="rotate(10 24 46)"/></>}
    </g>
    <g transform={hit?"translate(5,-2) rotate(5 50 45)":crit?"translate(-2,6) rotate(-8 50 45)":""}>
      <circle cx="50" cy="46" r="27" fill="#FADCB2"/><ellipse cx="24" cy="48" rx="4" ry="5" fill="#F0CDA0"/><ellipse cx="76" cy="48" rx="4" ry="5" fill="#F0CDA0"/>
      <ellipse cx="34" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/><ellipse cx="66" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/>
      {crit?<><line x1="35" y1="44" x2="44" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><line x1="56" y1="44" x2="65" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><path d="M 72 34 Q 74 38 72 42 Q 70 38 72 34" fill="#7BC8F6" opacity="0.7"/></>
      :hit?<><g transform="translate(39,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g><g transform="translate(61,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g></>
      :<><ellipse cx="39" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="61" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="40" cy="45" rx="3.5" ry="4" fill="#2C5F8A"/><ellipse cx="62" cy="45" rx="3.5" ry="4" fill="#2C5F8A"/><circle cx="41" cy="44" r="2" fill="#111"/><circle cx="63" cy="44" r="2" fill="#111"/><circle cx="42" cy="42.5" r="1.2" fill="#FFF"/><circle cx="64" cy="42.5" r="1.2" fill="#FFF"/>{atk&&<><line x1="33" y1="37" x2="45" y2="39" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/><line x1="55" y1="39" x2="67" y2="37" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/></>}</>}
      {st===CHAR_STATES.IDLE&&<><line x1="34" y1="37" x2="44" y2="38" stroke="#3B2517" strokeWidth="1.8" strokeLinecap="round"/><line x1="56" y1="38" x2="66" y2="37" stroke="#3B2517" strokeWidth="1.8" strokeLinecap="round"/></>}
      {crit?<path d="M 44 56 Q 50 53 56 56" fill="none" stroke="#7A4A2E" strokeWidth="1.5" strokeLinecap="round"/>:hit?<ellipse cx="50" cy="55" rx="4" ry="3" fill="#2A1A0E"/>:atk?<path d="M 45 53 L 55 53 L 52 56 Z" fill="#2A1A0E"/>:<path d="M 44 53 Q 50 58 56 53" fill="none" stroke="#7A4A2E" strokeWidth="1.5" strokeLinecap="round"/>}
      <path d="M 26 40 Q 30 26 42 22" fill="#4A2E14"/><path d="M 58 22 Q 70 26 74 40" fill="#4A2E14"/><path d="M 36 22 Q 50 18 64 22" fill="#4A2E14"/>
      <path d="M 16 37 L 50 12 L 84 37 L 68 40 L 50 30 L 32 40 Z" fill="#1E2530"/><path d="M 21 37 L 50 17 L 79 37" fill="none" stroke="#C9AD6A" strokeWidth="1.8"/>
      <circle cx="50" cy="23" r="3.5" fill="#1B3D6E"/><circle cx="50" cy="23" r="1.8" fill="#C9AD6A"/>
      {crit&&<rect x="60" y="25" width="12" height="4" rx="1" fill="#E8E0D0" transform="rotate(-15 66 27)"/>}
    </g>
  </svg>);
}
function ChibiBritish({ state:st=CHAR_STATES.IDLE, size=140 }) {
  const s=size/160, atk=st===CHAR_STATES.ATTACK, hit=st===CHAR_STATES.HIT, crit=st===CHAR_STATES.CRITICAL;
  return (<svg viewBox="0 0 120 160" width={120*s} height={160*s} xmlns="http://www.w3.org/2000/svg" style={{filter:hit?"brightness(1.4) saturate(0.6)":crit?"saturate(0.7)":"none"}}>
    {atk&&<g><polygon points="22,52 2,45 5,55 -5,50 8,60 4,58 20,62" fill="#FFD700" opacity="0.9"><animate attributeName="opacity" values="1;0.5;1" dur="0.2s" repeatCount="indefinite"/></polygon><circle cx="18" cy="56" r="7" fill="#FFF" opacity="0.8"><animate attributeName="r" values="5;8;5" dur="0.25s" repeatCount="indefinite"/></circle></g>}
    {hit&&<text x="60" y="15" textAnchor="middle" fontSize="14" fill="#FF4444" fontWeight="bold" fontFamily="sans-serif"><animate attributeName="opacity" values="1;0;1" dur="0.3s" repeatCount="indefinite"/>✕</text>}
    <ellipse cx="58" cy="155" rx={crit?32:26} ry="4" fill="rgba(0,0,0,0.25)"/>
    <g transform={hit?"translate(-4,0)":crit?"translate(0,8)":""}>
      <rect x={crit?"48":"45"} y={crit?"118":"115"} width="11" height={crit?"22":"26"} rx="4" fill="#E8DCC8"/><rect x={crit?"66":"63"} y={crit?"120":"115"} width="11" height={crit?"20":"26"} rx="4" fill="#E8DCC8"/>
      <rect x={crit?"46":"43"} y={crit?"132":"128"} width="15" height="20" rx="4" fill="#1C1C1C"/><rect x={crit?"64":"61"} y={crit?"132":"128"} width="15" height="20" rx="4" fill="#1C1C1C"/>
      <rect x="40" y="76" width="40" height={crit?"46":"42"} rx="7" fill="#B22020"/>
      <line x1="43" y1="79" x2="77" y2="114" stroke="#E8DCC8" strokeWidth="2.5"/><line x1="77" y1="79" x2="43" y2="114" stroke="#E8DCC8" strokeWidth="2.5"/>
      <rect x="56" y="92" width="8" height="8" rx="2" fill="#C9AD6A"/>
      <rect x="42" y="79" width="5" height="32" rx="2" fill="#E8DCC8"/><rect x="73" y="79" width="5" height="32" rx="2" fill="#E8DCC8"/>
      <ellipse cx="42" cy="78" rx="6" ry="3" fill="#E8DCC8"/><ellipse cx="78" cy="78" rx="6" ry="3" fill="#E8DCC8"/>
      {crit?<><rect x="76" y="82" width="12" height="10" rx="5" fill="#B22020"/><rect x="32" y="85" width="12" height="10" rx="5" fill="#B22020"/><rect x="88" y="90" width="3.5" height="40" rx="1.5" fill="#5A3820" transform="rotate(5 90 90)"/></>
      :atk?<><rect x="76" y="78" width="12" height="10" rx="5" fill="#B22020"/><rect x="30" y="76" width="14" height="9" rx="5" fill="#B22020"/><rect x="36" y="48" width="3.5" height="46" rx="1.5" fill="#5A3820" transform="rotate(20 38 72)"/><rect x="36" y="34" width="2.5" height="18" rx="1" fill="#666" transform="rotate(20 37 43)"/></>
      :<><rect x="76" y="80" width="12" height="10" rx="5" fill="#B22020"/><rect x="32" y="80" width="12" height="10" rx="5" fill="#B22020"/><rect x="82" y="52" width="3.5" height="48" rx="1.5" fill="#5A3820" transform="rotate(-10 84 76)"/><rect x="82.5" y="36" width="2.5" height="20" rx="1" fill="#666" transform="rotate(-10 84 46)"/></>}
    </g>
    <g transform={hit?"translate(-5,-2) rotate(-5 60 45)":crit?"translate(2,6) rotate(8 60 45)":""}>
      <circle cx="60" cy="46" r="27" fill="#FADCB2"/><ellipse cx="34" cy="48" rx="4" ry="5" fill="#F0CDA0"/><ellipse cx="86" cy="48" rx="4" ry="5" fill="#F0CDA0"/>
      <ellipse cx="44" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/><ellipse cx="76" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/>
      {crit?<><line x1="45" y1="44" x2="54" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><line x1="66" y1="44" x2="75" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><path d="M 82 34 Q 84 38 82 42 Q 80 38 82 34" fill="#7BC8F6" opacity="0.7"/></>
      :hit?<><g transform="translate(49,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g><g transform="translate(71,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g></>
      :<><ellipse cx="49" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="71" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="50" cy="45" rx="3.5" ry="4" fill="#4A6741"/><ellipse cx="72" cy="45" rx="3.5" ry="4" fill="#4A6741"/><circle cx="51" cy="44" r="2" fill="#111"/><circle cx="73" cy="44" r="2" fill="#111"/><circle cx="52" cy="42.5" r="1.2" fill="#FFF"/><circle cx="74" cy="42.5" r="1.2" fill="#FFF"/>{atk&&<><line x1="43" y1="37" x2="55" y2="39" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/><line x1="65" y1="39" x2="77" y2="37" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/></>}</>}
      {st===CHAR_STATES.IDLE&&<><line x1="44" y1="37" x2="54" y2="38" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><line x1="66" y1="38" x2="76" y2="37" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/></>}
      {crit?<path d="M 54 56 Q 60 53 66 56" fill="none" stroke="#7A4A2E" strokeWidth="1.5" strokeLinecap="round"/>:hit?<ellipse cx="60" cy="55" rx="4" ry="3" fill="#2A1A0E"/>:atk?<path d="M 55 53 L 65 53 L 62 56 Z" fill="#2A1A0E"/>:<line x1="54" y1="54" x2="66" y2="54" stroke="#7A4A2E" strokeWidth="1.5" strokeLinecap="round"/>}
      <rect x="30" y="40" width="4" height="12" rx="2" fill="#4A2E14"/><rect x="86" y="40" width="4" height="12" rx="2" fill="#4A2E14"/>
      <path d="M 26 37 L 60 12 L 94 37 L 78 40 L 60 30 L 42 40 Z" fill="#1E2530"/><path d="M 31 37 L 60 17 L 89 37" fill="none" stroke="#E8DCC8" strokeWidth="1.8"/>
      <circle cx="60" cy="23" r="3.5" fill="#B22020"/><circle cx="60" cy="23" r="1.8" fill="#E8DCC8"/>
      {crit&&<rect x="70" y="25" width="12" height="4" rx="1" fill="#E8E0D0" transform="rotate(15 76 27)"/>}
    </g>
  </svg>);
}

function getCharState(hp,maxHP,phase,isPlayer,wasCorrect,hasEnemyDmg) {
  if(isPlayer&&phase==="ANSWER_RESULT"&&wasCorrect) return CHAR_STATES.ATTACK;
  if(!isPlayer&&phase==="ENEMY_TURN"&&hasEnemyDmg) return CHAR_STATES.ATTACK;
  if(isPlayer&&phase==="ENEMY_TURN"&&hasEnemyDmg) return CHAR_STATES.HIT;
  if(!isPlayer&&phase==="ANSWER_RESULT"&&wasCorrect) return CHAR_STATES.HIT;
  if(hp/maxHP<=0.25&&hp>0) return CHAR_STATES.CRITICAL;
  return CHAR_STATES.IDLE;
}

// ═════════════════════════════════════════════════════════════════════════════
// UI + GAME LOGIC
// ═════════════════════════════════════════════════════════════════════════════
function Timer({duration,onTimeout,isActive,onTick}){const[rem,setRem]=useState(duration);const startRef=useRef(null),frameRef=useRef(null);useEffect(()=>{if(!isActive){setRem(duration);startRef.current=null;return;}startRef.current=Date.now();const tick=()=>{const e=(Date.now()-startRef.current)/1000;const l=Math.max(0,duration-e);setRem(l);if(onTick)onTick(e/duration);if(l<=0){onTimeout();return;}frameRef.current=requestAnimationFrame(tick);};frameRef.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frameRef.current);},[isActive,duration,onTimeout,onTick]);const pct=(rem/duration)*100,uc=rem<10?"#D32F2F":rem<20?"#F9A825":"#4FC3F7";return(<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}><span style={{fontFamily:fonts.heading,fontSize:"0.6rem",letterSpacing:"0.15em",color:"#9E9E9E",textTransform:"uppercase"}}>Time</span><span style={{fontFamily:fonts.mono,fontSize:"1.05rem",color:uc,fontWeight:700,animation:rem<10?"pulse 0.5s infinite":"none"}}>{rem.toFixed(1)}s</span></div><div style={{background:"rgba(0,0,0,0.4)",borderRadius:4,height:7,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${uc},${uc}88)`,borderRadius:3}}/></div></div>);}
function QuestionCard({question,onAnswer,disabled}){const[hov,setHov]=useState(null);const L=["A","B","C","D"];return(<div style={{background:"linear-gradient(135deg,rgba(28,28,48,0.96),rgba(18,18,36,0.96))",borderRadius:12,padding:"16px 18px",border:"1px solid rgba(255,255,255,0.07)"}}><div style={{fontFamily:fonts.body,fontSize:"1rem",color:"#E0E0E0",lineHeight:1.5,marginBottom:14,textAlign:"center"}}>{question.text}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{question.options.map((o,i)=>(<button key={i} disabled={disabled} onClick={()=>onAnswer(i)} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)} style={{background:hov===i&&!disabled?"rgba(79,195,247,0.12)":"rgba(255,255,255,0.03)",border:`1px solid ${hov===i&&!disabled?"rgba(79,195,247,0.35)":"rgba(255,255,255,0.07)"}`,borderRadius:9,padding:"10px 11px",color:"#E0E0E0",cursor:disabled?"default":"pointer",fontFamily:fonts.body,fontSize:"0.9rem",textAlign:"left",transition:"all 0.2s",display:"flex",alignItems:"center",gap:8,opacity:disabled?0.5:1}}><span style={{fontFamily:fonts.heading,fontSize:"0.6rem",color:"#4FC3F7",fontWeight:700,width:20,height:20,borderRadius:"50%",border:"1px solid #4FC3F733",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{L[i]}</span>{o}</button>))}</div></div>);}
function BattleLog({log}){const r=useRef(null);useEffect(()=>{r.current?.scrollIntoView({behavior:"smooth"});},[log.length]);return(<div style={{background:"rgba(0,0,0,0.25)",borderRadius:7,padding:"8px 10px",maxHeight:80,overflowY:"auto",border:"1px solid rgba(255,255,255,0.04)"}}><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",letterSpacing:"0.15em",color:"#555",textTransform:"uppercase",marginBottom:4}}>Battle Log</div>{log.length===0?<div style={{fontFamily:fonts.body,fontSize:"0.75rem",color:"#555",fontStyle:"italic"}}>The battle begins...</div>:log.slice(-5).map((e,i)=><div key={i} style={{fontFamily:fonts.mono,fontSize:"0.65rem",color:"#BBB",marginBottom:2,opacity:i<log.slice(-5).length-1?0.5:1}}>{e}</div>)}<div ref={r}/></div>);}

function shuffleArray(a){const s=[...a];for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}return s;}
function getSpeedTier(p){return SPEED_TIERS.find(t=>p<=t.maxPercent)||SPEED_TIERS[3];}

function makeInitState(battle,playerStats){return{phase:PHASES.PLAYER_TURN,playerHP:playerStats.maxHP,playerMaxHP:playerStats.maxHP,enemyHP:battle.hp,enemyMaxHP:battle.hp,enemyDmg:battle.dmg,enemyReviewDmg:battle.bossReviewDmg||battle.dmg,baseDmg:playerStats.baseDmg,critRate:playerStats.critRate,currentQuestion:null,questionQueue:[],usedQuestionIds:[],selectedAnswer:null,wasCorrect:null,damageResult:null,enemyDamageResult:null,turnLog:[],questionsAnswered:0,questionsCorrect:0,coinsEarned:0,stars:0,shakeEnemy:false,shakePlayer:false,bossPhase:battle.boss?"review":null,reviewQCount:0,wrongThisBattle:[]};}

function gameReducer(st,action){
  const calcDmg=(base,elapsed,critRate)=>{const t=getSpeedTier(elapsed);const c=Math.random()<critRate;return{damage:Math.round(base*t.multiplier*(c?CRIT_MULTIPLIER:1)),tier:t,isCrit:c};};
  const advQ=(s)=>{let q=s.questionQueue;let bp=s.bossPhase;if(s.bossPhase==="review"&&q.length>0&&q[0]._isNewContent)bp="battle";if(q.length===0)q=shuffleArray(s._allQuestions||[]);const n=q[0];return{...s,phase:PHASES.PLAYER_TURN,currentQuestion:n,questionQueue:q.slice(1),selectedAnswer:null,wasCorrect:null,damageResult:null,enemyDamageResult:null,bossPhase:bp};};
  switch(action.type){
    case "START_BATTLE":{const init=makeInitState(action.battle,action.playerStats);let allQs,firstQ,restQ;if(action.battle.boss&&action.reviewQuestions){const rQs=shuffleArray(action.reviewQuestions).map(q=>({...q,_isReview:true}));const nQs=shuffleArray(action.battle.questions).map(q=>({...q,_isNewContent:true}));const combined=[...rQs,...nQs];allQs=[...action.battle.questions,...action.reviewQuestions];firstQ=combined[0];restQ=combined.slice(1);}else{const qs=shuffleArray(action.battle.questions);allQs=action.battle.questions;firstQ=qs[0];restQ=qs.slice(1);}return{...init,_allQuestions:allQs,questionQueue:restQ,currentQuestion:firstQ,reviewQCount:action.reviewQuestions?action.reviewQuestions.length:0};}
    case "ANSWER_QUESTION":{const{answerIndex,elapsedPercent}=action.payload;const ok=answerIndex===st.currentQuestion.answer;let d=null,hp=st.enemyHP;if(ok){d=calcDmg(st.baseDmg,elapsedPercent,st.critRate);hp=Math.max(0,st.enemyHP-d.damage);}const wrong=ok?st.wrongThisBattle:[...st.wrongThisBattle,st.currentQuestion];return{...st,phase:PHASES.ANSWER_RESULT,selectedAnswer:answerIndex,wasCorrect:ok,damageResult:d,enemyHP:hp,questionsAnswered:st.questionsAnswered+1,questionsCorrect:st.questionsCorrect+(ok?1:0),turnLog:[...st.turnLog,ok?`⚔️ Deal ${d.damage}${d.isCrit?" CRIT!":""} (${d.tier.label})`:"❌ Miss!"],shakeEnemy:ok,wrongThisBattle:wrong};}
    case "TIMEOUT_QUESTION":return{...st,phase:PHASES.ANSWER_RESULT,selectedAnswer:-1,wasCorrect:false,damageResult:null,questionsAnswered:st.questionsAnswered+1,turnLog:[...st.turnLog,"⏰ Time's up!"],wrongThisBattle:[...st.wrongThisBattle,st.currentQuestion]};
    case "PROCEED_AFTER_RESULT":{const c={...st,shakeEnemy:false,shakePlayer:false};if(c.enemyHP<=0){const hp=c.playerHP/c.playerMaxHP;const s=hp>=1?3:hp>0.5?2:1;return{...c,phase:PHASES.VICTORY,stars:s,coinsEarned:s*25+c.questionsCorrect*5};}if(!c.wasCorrect)return{...c,phase:PHASES.ENEMY_TURN};return advQ(c);}
    case "ENEMY_ATTACK":{const baseDmg=st.bossPhase==="review"?st.enemyReviewDmg:st.enemyDmg;const d=baseDmg+Math.floor(Math.random()*6-3);const hp=Math.max(0,st.playerHP-d);const log=[...st.turnLog,`🔴 Enemy attacks for ${d}!`];if(hp<=0)return{...st,playerHP:0,phase:PHASES.DEFEAT,enemyDamageResult:d,turnLog:log,shakePlayer:true};return{...st,playerHP:hp,enemyDamageResult:d,turnLog:log,shakePlayer:true};}
    case "PROCEED_AFTER_ENEMY":return advQ({...st,shakePlayer:false,shakeEnemy:false});
    case "CLEAR_ANIMS":return{...st,shakeEnemy:false,shakePlayer:false};
    default:return st;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FIRESTORE
// ═════════════════════════════════════════════════════════════════════════════
async function saveUserData(uid,data){try{await setDoc(doc(db,"users",uid),data,{merge:true});}catch(e){console.error("Save failed:",e);}}
async function loadUserData(uid){try{const snap=await getDoc(doc(db,"users",uid));return snap.exists()?snap.data():null;}catch(e){console.error("Load failed:",e);return null;}}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function AuthScreen(){
  const [isLogin,setIsLogin]=useState(true);
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [name,setName]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  const handleSubmit=async()=>{
    setError("");setLoading(true);
    try{
      if(isLogin){await signInWithEmailAndPassword(auth,email,pass);}
      else{
        const cred=await createUserWithEmailAndPassword(auth,email,pass);
        if(name.trim())await updateProfile(cred.user,{displayName:name.trim()});
        await saveUserData(cred.user.uid,{coins:0,upgrades:{maxHP:0,baseDmg:0,critRate:0},completed:[],wrongAnswers:[],displayName:name.trim()||"Commander"});
      }
    }catch(e){
      const msg=e.code==="auth/email-already-in-use"?"Email already in use":e.code==="auth/invalid-credential"?"Invalid email or password":e.code==="auth/weak-password"?"Password must be 6+ characters":e.code==="auth/invalid-email"?"Invalid email":e.message;
      setError(msg);
    }
    setLoading(false);
  };

  const inputStyle={width:"100%",padding:"12px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#E0E0E0",fontFamily:fonts.body,fontSize:"0.95rem",outline:"none"};

  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",gap:20,padding:24,background:"linear-gradient(180deg,#0d0d1a 0%,#1a1a2e 40%,#16213e 100%)"}}>
      <div style={{fontFamily:fonts.heading,fontSize:"2rem",fontWeight:700,color:"#FFD700",letterSpacing:"0.08em",textShadow:"0 0 25px rgba(255,215,0,0.2)"}}>HISTORY LEGENDS</div>
      <div style={{fontFamily:fonts.body,fontSize:"0.95rem",color:"#999"}}>{isLogin?"Sign in to continue":"Create your account"}</div>
      <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:12}}>
        {!isLogin&&<input type="text" placeholder="Commander Name" value={name} onChange={e=>setName(e.target.value)} style={inputStyle}/>}
        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle}/>
        <input type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} style={inputStyle} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>
        {error&&<div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#EF5350",textAlign:"center"}}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{...goldBtn,width:"100%",padding:"14px",fontSize:"0.9rem",opacity:loading?0.6:1}}>
          {loading?"...":(isLogin?"Sign In":"Create Account")}
        </button>
        <button onClick={()=>{setIsLogin(!isLogin);setError("");}} style={{background:"none",border:"none",color:"#4FC3F7",fontFamily:fonts.body,fontSize:"0.85rem",cursor:"pointer",padding:8}}>
          {isLogin?"Don't have an account? Sign up":"Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SCREEN COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════
function MenuCard({children,onClick,accent="#4FC3F7",disabled=false}){const[h,setH]=useState(false);return(<button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:h&&!disabled?"rgba(79,195,247,0.06)":"rgba(255,255,255,0.02)",border:`1px solid ${h&&!disabled?accent+"44":"rgba(255,255,255,0.06)"}`,borderRadius:12,padding:"16px 20px",color:"#E0E0E0",cursor:disabled?"default":"pointer",fontFamily:fonts.body,fontSize:"1rem",textAlign:"left",transition:"all 0.25s",display:"flex",alignItems:"center",gap:14,width:"100%",opacity:disabled?0.4:1}}>{children}</button>);}
function BackButton({onClick}){return<button onClick={onClick} style={{background:"none",border:"none",color:"#9E9E9E",fontFamily:fonts.heading,fontSize:"0.65rem",letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",padding:"6px 0",display:"flex",alignItems:"center",gap:6}}>← Back</button>;}
function ShopButton({onClick,coins}){return(<button onClick={onClick} style={{position:"fixed",bottom:20,right:20,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:14,padding:"10px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",zIndex:10}}><span style={{fontSize:"1.1rem"}}>🪙</span><span style={{fontFamily:fonts.mono,fontSize:"0.85rem",color:"#FFD700",fontWeight:700}}>{coins}</span><span style={{fontFamily:fonts.heading,fontSize:"0.5rem",color:"#999",letterSpacing:"0.1em",textTransform:"uppercase",marginLeft:4}}>Shop</span></button>);}

function ShopScreen({onBack,coins,upgrades,onBuy}){
  const keys=["maxHP","baseDmg","critRate"];
  return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BackButton onClick={onBack}/>
    <div style={{textAlign:"center",marginBottom:20}}><div style={{fontFamily:fonts.heading,fontSize:"1.4rem",fontWeight:700,color:"#FFD700"}}>Upgrade Shop</div><div style={{fontFamily:fonts.mono,fontSize:"1rem",color:"#FFD700",marginTop:6}}>🪙 {coins} coins</div></div>
    <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:400,margin:"0 auto"}}>
      {keys.map(k=>{const u=UPGRADES[k],lv=upgrades[k],maxed=lv>=u.levels.length-1,nextCost=maxed?0:u.costs[lv+1],canAfford=coins>=nextCost;
        return(<div key={k} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"16px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:"1.2rem"}}>{u.icon}</span><span style={{fontFamily:fonts.heading,fontSize:"0.8rem",fontWeight:700,color:"#E0E0E0"}}>{u.label}</span></div><span style={{fontFamily:fonts.mono,fontSize:"0.7rem",color:"#888"}}>Lv {lv+1}/{u.levels.length}</span></div>
          <div style={{display:"flex",gap:4,marginBottom:10}}>{u.levels.map((_,i)=>(<div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=lv?"#4FC3F7":"rgba(255,255,255,0.08)"}}/>))}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:fonts.mono,fontSize:"0.75rem",color:"#4FC3F7"}}>{u.desc[lv]}{!maxed&&` → ${u.desc[lv+1]}`}</span>
            {maxed?<span style={{fontFamily:fonts.heading,fontSize:"0.6rem",color:"#81C784",letterSpacing:"0.1em"}}>MAXED</span>
            :<button onClick={()=>canAfford&&onBuy(k)} style={{...btn(canAfford?"linear-gradient(135deg,#FFD700,#FFA000)":"rgba(255,255,255,0.05)",canAfford?"transparent":"rgba(255,255,255,0.1)"),padding:"6px 16px",fontSize:"0.65rem",color:canAfford?"#1a1a2e":"#666",fontWeight:700,cursor:canAfford?"pointer":"default",opacity:canAfford?1:0.5}}>🪙 {nextCost}</button>}
          </div></div>);})}
    </div>
  </div>);
}

function HomeScreen({onNavigate,coins,userName,onLogout}){
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:24,padding:20}}>
    <div style={{fontFamily:fonts.heading,fontSize:"2.2rem",fontWeight:700,letterSpacing:"0.08em",color:"#FFD700",textShadow:"0 0 25px rgba(255,215,0,0.2)",textAlign:"center"}}>HISTORY LEGENDS</div>
    <div style={{fontFamily:fonts.body,fontSize:"1rem",color:"#9E9E9E",textAlign:"center"}}>Welcome back, <span style={{color:"#4FC3F7"}}>{userName}</span></div>
    <div style={{background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,padding:"10px 24px",display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:"1.2rem"}}>🪙</span><div><div style={{fontFamily:fonts.mono,fontSize:"1.3rem",color:"#FFD700",fontWeight:700}}>{coins}</div><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",color:"#999",letterSpacing:"0.12em",textTransform:"uppercase"}}>Coins</div></div>
    </div>
    <div style={{width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:10}}>
      <MenuCard onClick={()=>onNavigate(SCREENS.US_HISTORY)}><span style={{fontSize:"1.5rem"}}>🇺🇸</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#4FC3F7"}}>US HISTORY</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#888",marginTop:2}}>Revolutionary War → Civil War → Modern</div></div></MenuCard>
      <MenuCard disabled accent="#666"><span style={{fontSize:"1.5rem"}}>🏰</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",color:"#666"}}>EUROPEAN HISTORY</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#555",marginTop:2}}>Coming soon</div></div></MenuCard>
    </div>
    <button onClick={onLogout} style={{background:"none",border:"none",fontFamily:fonts.body,fontSize:"0.8rem",color:"#666",cursor:"pointer",padding:8,marginTop:8}}>Sign Out</button>
  </div>);
}

function USHistoryScreen({onNavigate,onBack}){return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BackButton onClick={onBack}/><div style={{textAlign:"center",marginBottom:24}}><div style={{fontFamily:fonts.heading,fontSize:"0.6rem",letterSpacing:"0.25em",color:"#4FC3F7",textTransform:"uppercase",marginBottom:6}}>US History</div><div style={{fontFamily:fonts.heading,fontSize:"1.5rem",fontWeight:700,color:"#E0E0E0"}}>Select an Era</div></div><div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:400,margin:"0 auto"}}><MenuCard onClick={()=>onNavigate(SCREENS.REV_WAR)}><span style={{fontSize:"1.4rem"}}>⚔️</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#4FC3F7"}}>REVOLUTIONARY WAR</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#888",marginTop:2}}>1775–1783</div></div></MenuCard><MenuCard disabled><span style={{fontSize:"1.4rem"}}>🦅</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",color:"#666"}}>CIVIL WAR</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#555",marginTop:2}}>Coming soon</div></div></MenuCard><div style={{borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:10,paddingTop:14}}><MenuCard onClick={()=>onNavigate(SCREENS.ARTWORK)} accent="#FFD700"><span style={{fontSize:"1.4rem"}}>🎨</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#FFD700"}}>ARTWORK GALLERY</div></div></MenuCard></div></div></div>);}
function ArtworkScreen({onBack}){const states=[{key:CHAR_STATES.IDLE,label:"Idle"},{key:CHAR_STATES.ATTACK,label:"Attack"},{key:CHAR_STATES.HIT,label:"Hit"},{key:CHAR_STATES.CRITICAL,label:"Critical"}];return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BackButton onClick={onBack}/><div style={{textAlign:"center",marginBottom:20}}><div style={{fontFamily:fonts.heading,fontSize:"1.3rem",fontWeight:700,color:"#E0E0E0"}}>Artwork Gallery</div></div>{[{label:"Colonial Infantry",color:"#42A5F5",Comp:ChibiColonial},{label:"British General",color:"#FF5252",Comp:ChibiBritish}].map(({label,color,Comp})=>(<div key={label} style={{marginBottom:24}}><div style={{fontFamily:fonts.heading,fontSize:"0.7rem",letterSpacing:"0.15em",color,textTransform:"uppercase",textAlign:"center",marginBottom:10}}>{label}</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,maxWidth:440,margin:"0 auto"}}>{states.map(s=>(<div key={s.key} style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"10px 4px 8px",textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",marginBottom:4}}><Comp state={s.key} size={80}/></div><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",color,letterSpacing:"0.08em",textTransform:"uppercase"}}>{s.label}</div></div>))}</div></div>))}</div>);}

function RevWarScreen({onBack,onSelectBattle,completed}){const scrollRef=useRef(null);useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[]);const map=REV_WAR_MAP;const nodeSpacing=110,mapHeight=map.length*nodeSpacing+120,pathWidth=320;const getX=(i)=>{const idx=map.length-1-i;const c=idx%6;return[0.5,0.28,0.5,0.72,0.5,0.35][c];};const points=map.map((_,i)=>({x:getX(i)*pathWidth,y:60+i*nodeSpacing}));const pathD=points.reduce((a,p,i)=>{if(i===0)return`M ${p.x} ${p.y}`;const pr=points[i-1];const cy=(pr.y+p.y)/2;return`${a} C ${pr.x} ${cy}, ${p.x} ${cy}, ${p.x} ${p.y}`;},"");
  return(<div style={{height:"100vh",display:"flex",flexDirection:"column",animation:"fadeIn 0.4s ease-out"}}><div style={{padding:"12px 20px 8px",flexShrink:0}}><BackButton onClick={onBack}/><div style={{textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1.2rem",fontWeight:700,color:"#E0E0E0"}}>Revolutionary War</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#777",marginTop:2}}>1775–1783 · 20 Battles</div></div></div><div ref={scrollRef} style={{flex:1,overflowY:"auto",overflowX:"hidden"}}><div style={{position:"relative",width:"100%",maxWidth:pathWidth,margin:"0 auto",height:mapHeight}}><svg style={{position:"absolute",top:0,left:0,width:pathWidth,height:mapHeight,pointerEvents:"none"}} viewBox={`0 0 ${pathWidth} ${mapHeight}`}><path d={pathD} fill="none" stroke="rgba(79,195,247,0.08)" strokeWidth="28" strokeLinecap="round"/><path d={pathD} fill="none" stroke="rgba(79,195,247,0.15)" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 6"/></svg><div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",fontFamily:fonts.heading,fontSize:"0.6rem",letterSpacing:"0.2em",color:"#FFD700",textTransform:"uppercase",opacity:0.5}}>🏆 Independence 🏆</div><div style={{position:"absolute",bottom:15,left:"50%",transform:"translateX(-50%)",fontFamily:fonts.heading,fontSize:"0.55rem",letterSpacing:"0.2em",color:"#4FC3F7",textTransform:"uppercase"}}>▼ Start Here ▼</div>
      {map.map((b,i)=>{const pt=points[i];const bc=BATTLES.find(x=>x.id===b.id);const isComp=completed.includes(b.id);const bi=BATTLES.findIndex(x=>x.id===b.id);const avail=bi===0||(bi>0&&completed.includes(BATTLES[bi-1].id));const isBoss=!!b.boss;const isFinal=b.boss==="FINAL BOSS";const ns=isFinal?58:isBoss?50:40;const nc=isComp?"#81C784":avail?"#4FC3F7":isFinal?"#FFD700":isBoss?"#FF8A65":"#444";
        return(<div key={b.id+i} style={{position:"absolute",top:pt.y-ns/2,left:pt.x,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",cursor:avail||isComp?"pointer":"default",zIndex:avail?3:1}} onClick={()=>(avail||isComp)&&bc&&onSelectBattle(bc)}>
          {isBoss&&<div style={{fontFamily:fonts.heading,fontSize:"0.45rem",letterSpacing:"0.15em",color:isFinal?"#FFD700":"#FF8A65",textTransform:"uppercase",marginBottom:2}}>{b.boss}</div>}
          <div style={{width:ns,height:ns,borderRadius:"50%",background:isComp?"rgba(129,199,132,0.15)":avail?"rgba(79,195,247,0.15)":"rgba(255,255,255,0.02)",border:`2px solid ${isComp?"rgba(129,199,132,0.5)":avail?nc+"88":nc+"33"}`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:avail?`0 0 15px ${nc}33`:"none",position:"relative"}}>{avail&&!isComp&&<div style={{position:"absolute",inset:-4,borderRadius:"50%",border:"2px solid rgba(79,195,247,0.3)",animation:"pulse 2s infinite"}}/>}<span style={{fontSize:isFinal?"1.3rem":isBoss?"1.1rem":"0.9rem"}}>{isComp?"✅":avail?b.icon:"🔒"}</span></div>
          <div style={{textAlign:"center",marginTop:3,maxWidth:120}}><div style={{fontFamily:fonts.heading,fontSize:"0.55rem",fontWeight:700,color:isComp?"#81C784":avail?"#E0E0E0":"#666",lineHeight:1.2}}>{b.name}</div><div style={{fontFamily:fonts.mono,fontSize:"0.45rem",color:"#555",marginTop:1}}>{b.date}</div></div>
        </div>);})}
    </div></div></div>);
}

function PreBattleScreen({battle,onStart,onBack}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:16,padding:20,textAlign:"center",animation:"fadeIn 0.5s ease-out"}}><BackButton onClick={onBack}/>{battle.boss&&<div style={{fontFamily:fonts.heading,fontSize:"0.7rem",letterSpacing:"0.15em",color:"#FF8A65"}}>⚠️ BOSS BATTLE ⚠️</div>}<div style={{fontFamily:fonts.heading,fontSize:"1.5rem",fontWeight:700,color:"#E0E0E0"}}>{battle.name}</div><div style={{fontFamily:fonts.body,fontSize:"0.9rem",color:"#999"}}>{battle.date}</div>{battle.context&&<div style={{background:"rgba(79,195,247,0.06)",border:"1px solid rgba(79,195,247,0.15)",borderRadius:10,padding:"12px 18px",maxWidth:420}}><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",letterSpacing:"0.15em",color:"#4FC3F7",textTransform:"uppercase",marginBottom:6}}>📜 Historical Context</div><div style={{fontFamily:fonts.body,fontSize:"0.85rem",color:"#CCC",lineHeight:1.55}}>{battle.context}</div></div>}{battle.boss&&<div style={{background:"rgba(255,138,101,0.06)",border:"1px solid rgba(255,138,101,0.15)",borderRadius:10,padding:"10px 16px",maxWidth:380}}><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",letterSpacing:"0.12em",color:"#FF8A65",textTransform:"uppercase",marginBottom:4}}>Boss Fight Structure</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#CCC",lineHeight:1.5}}><strong style={{color:"#4FC3F7"}}>Phase 1 — Review:</strong> Previous material (reduced damage).<br/><strong style={{color:"#FF8A65"}}>Phase 2 — Boss:</strong> New questions. Full damage. HP carries over!</div></div>}<div style={{display:"flex",alignItems:"center",gap:16,margin:"6px 0"}}><div style={{textAlign:"center",filter:"drop-shadow(0 3px 10px rgba(21,101,192,0.35))"}}><ChibiColonial size={100}/><div style={{fontFamily:fonts.heading,fontSize:"0.55rem",color:"#42A5F5",marginTop:2}}>Your Forces</div></div><div style={{fontFamily:fonts.heading,fontSize:"1.2rem",fontWeight:700,color:"#FFD70066"}}>VS</div><div style={{textAlign:"center",filter:"drop-shadow(0 3px 10px rgba(198,40,40,0.35))"}}><ChibiBritish size={100}/><div style={{fontFamily:fonts.heading,fontSize:"0.55rem",color:"#FF5252",marginTop:2}}>{battle.general}</div></div></div><div style={{fontFamily:fonts.mono,fontSize:"0.7rem",color:"#888"}}>HP: {battle.hp} · Dmg: {battle.dmg}</div><button onClick={onStart} style={{...goldBtn,padding:"14px 48px",fontSize:"0.9rem",borderRadius:12}}>Begin Battle</button></div>);}
function ResultOverlay({wasCorrect,question,selectedAnswer,damageResult,onContinue}){return(<div style={{background:"linear-gradient(135deg,rgba(28,28,48,0.97),rgba(18,18,36,0.97))",borderRadius:12,padding:"18px 20px",border:`1px solid ${wasCorrect?"rgba(76,175,80,0.25)":"rgba(211,47,47,0.25)"}`,textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1.3rem",fontWeight:700,color:wasCorrect?"#66BB6A":"#EF5350",marginBottom:6}}>{wasCorrect?"CORRECT!":selectedAnswer===-1?"TIME'S UP!":"WRONG!"}</div>{wasCorrect&&damageResult&&<div style={{marginBottom:10}}><span style={{fontFamily:fonts.mono,fontSize:"1.6rem",color:damageResult.isCrit?"#FFD700":"#4FC3F7",fontWeight:700}}>{damageResult.damage}</span><span style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#999",marginLeft:6}}>damage</span>{damageResult.isCrit&&<div style={{fontFamily:fonts.heading,fontSize:"0.65rem",color:"#FFD700",letterSpacing:"0.2em",marginTop:2}}>★ CRITICAL HIT ★</div>}<div style={{fontFamily:fonts.mono,fontSize:"0.65rem",color:damageResult.tier.color,marginTop:2}}>{damageResult.tier.label} — {damageResult.tier.multiplier}×</div></div>}{!wasCorrect&&<div style={{marginBottom:10}}><div style={{fontFamily:fonts.body,fontSize:"0.85rem",color:"#81C784",marginBottom:6}}>Answer: <strong>{question.options[question.answer]}</strong></div><div style={{background:"rgba(79,195,247,0.06)",border:"1px solid rgba(79,195,247,0.12)",borderRadius:8,padding:"8px 12px"}}><div style={{fontFamily:fonts.heading,fontSize:"0.45rem",letterSpacing:"0.12em",color:"#4FC3F7",textTransform:"uppercase",marginBottom:3}}>📝 Remember This</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#CCC",lineHeight:1.45}}>{question.explanation}</div></div></div>}<button onClick={onContinue} style={blueBtn}>Continue</button></div>);}
function EnemyTurnOverlay({damage,onContinue,generalName}){return(<div style={{background:"linear-gradient(135deg,rgba(48,18,18,0.97),rgba(36,12,12,0.97))",borderRadius:12,padding:"18px 20px",border:"1px solid rgba(211,47,47,0.25)",textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1rem",fontWeight:700,color:"#EF5350",marginBottom:6}}>ENEMY ATTACKS!</div><div style={{fontFamily:fonts.body,fontSize:"0.88rem",color:"#E0E0E0",marginBottom:6}}>{generalName} strikes!</div><span style={{fontFamily:fonts.mono,fontSize:"1.6rem",color:"#EF5350",fontWeight:700}}>-{damage}</span><span style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#999",marginLeft:6}}>HP</span><div style={{marginTop:12}}><button onClick={onContinue} style={blueBtn}>Continue</button></div></div>);}
function VictoryScreen({state,battle,onRestart,onMenu,onShop}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:16,padding:24,textAlign:"center",animation:"fadeIn 0.8s ease-out"}}><div style={{fontFamily:fonts.heading,fontSize:"2rem",fontWeight:700,color:"#FFD700",textShadow:"0 0 25px rgba(255,215,0,0.25)"}}>VICTORY</div><div style={{fontSize:"2rem",letterSpacing:"0.2em",color:"#FFD700"}}>{"★".repeat(state.stars)+"☆".repeat(3-state.stars)}</div><div style={{fontFamily:fonts.body,fontSize:"1rem",color:"#E0E0E0"}}>{battle.general} defeated!</div><div style={{background:"rgba(0,0,0,0.25)",borderRadius:10,padding:"14px 28px",border:"1px solid rgba(255,215,0,0.12)"}}><div style={{display:"flex",gap:24,justifyContent:"center"}}><div><div style={{fontFamily:fonts.mono,fontSize:"1.3rem",color:"#4FC3F7",fontWeight:700}}>{state.questionsCorrect}/{state.questionsAnswered}</div><div style={{fontFamily:fonts.body,fontSize:"0.65rem",color:"#999"}}>Correct</div></div><div><div style={{fontFamily:fonts.mono,fontSize:"1.3rem",color:"#FFD700",fontWeight:700}}>🪙 {state.coinsEarned}</div><div style={{fontFamily:fonts.body,fontSize:"0.65rem",color:"#999"}}>Coins Won</div></div><div><div style={{fontFamily:fonts.mono,fontSize:"1.3rem",color:"#81C784",fontWeight:700}}>{state.playerHP}/{state.playerMaxHP}</div><div style={{fontFamily:fonts.body,fontSize:"0.65rem",color:"#999"}}>HP Left</div></div></div></div><div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}><button onClick={onRestart} style={goldBtn}>Again</button><button onClick={onShop} style={{...btn("linear-gradient(135deg,#2E7D32,#1B5E20)","rgba(129,199,132,0.3)"),color:"#E0E0E0",fontWeight:700}}>🪙 Shop</button><button onClick={onMenu} style={blueBtn}>Map</button></div></div>);}
function DefeatScreen({state,battle,onRestart,onMenu}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:16,padding:24,textAlign:"center",animation:"fadeIn 0.8s ease-out"}}><div style={{fontFamily:fonts.heading,fontSize:"2rem",fontWeight:700,color:"#EF5350"}}>DEFEAT</div><div style={{fontSize:"2rem"}}>💀</div><div style={{fontFamily:fonts.body,fontSize:"1rem",color:"#E0E0E0"}}>Your forces fell to {battle.general}.</div><div style={{fontFamily:fonts.body,fontSize:"0.85rem",color:"#999"}}>{state.questionsCorrect}/{state.questionsAnswered} correct</div><div style={{display:"flex",gap:8}}><button onClick={onRestart} style={redBtn}>Retry</button><button onClick={onMenu} style={blueBtn}>Map</button></div></div>);}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN APP WITH AUTH
// ═════════════════════════════════════════════════════════════════════════════
export default function HistoryLegends(){
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [screen,setScreen]=useState(SCREENS.HOME);
  const [state,dispatch]=useReducer(gameReducer,{phase:PHASES.PRE_BATTLE});
  const [totalCoins,setTotalCoins]=useState(0);
  const [upgrades,setUpgrades]=useState({maxHP:0,baseDmg:0,critRate:0});
  const [completed,setCompleted]=useState([]);
  const [allWrongAnswers,setAllWrongAnswers]=useState([]);
  const [currentBattle,setCurrentBattle]=useState(BATTLES[0]);
  const [dataLoaded,setDataLoaded]=useState(false);
  const elapsedRef=useRef(0);
  const saveTimeoutRef=useRef(null);

  const playerStats={maxHP:UPGRADES.maxHP.levels[upgrades.maxHP],baseDmg:UPGRADES.baseDmg.levels[upgrades.baseDmg],critRate:UPGRADES.critRate.levels[upgrades.critRate]};

  // ─── AUTH LISTENER ───────────────────────────────────────────────────────
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,(u)=>{setUser(u);setAuthLoading(false);});
    return unsub;
  },[]);

  // ─── LOAD DATA ON LOGIN ──────────────────────────────────────────────────
  useEffect(()=>{
    if(!user){setDataLoaded(false);return;}
    (async()=>{
      const data=await loadUserData(user.uid);
      if(data){
        setTotalCoins(data.coins||0);
        setUpgrades(data.upgrades||{maxHP:0,baseDmg:0,critRate:0});
        setCompleted(data.completed||[]);
        setAllWrongAnswers((data.wrongAnswers||[]).map(q=>typeof q==="string"?null:q).filter(Boolean));
      }
      setDataLoaded(true);
    })();
  },[user]);

  // ─── DEBOUNCED SAVE ──────────────────────────────────────────────────────
  const saveToFirestore=useCallback(()=>{
    if(!user||!dataLoaded)return;
    if(saveTimeoutRef.current)clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current=setTimeout(()=>{
      saveUserData(user.uid,{
        coins:totalCoins,
        upgrades,
        completed,
        wrongAnswers:allWrongAnswers.map(q=>({text:q.text,options:q.options,answer:q.answer,explanation:q.explanation})),
        displayName:user.displayName||"Commander",
        lastSaved:new Date().toISOString(),
      });
    },1000);
  },[user,dataLoaded,totalCoins,upgrades,completed,allWrongAnswers]);

  useEffect(()=>{saveToFirestore();},[totalCoins,upgrades,completed,allWrongAnswers]);

  // ─── GAME HANDLERS ───────────────────────────────────────────────────────
  const handleAnswer=useCallback((i)=>{if(state.phase!==PHASES.PLAYER_TURN)return;dispatch({type:"ANSWER_QUESTION",payload:{answerIndex:i,elapsedPercent:elapsedRef.current}});},[state.phase]);
  const handleTimeout=useCallback(()=>{if(state.phase!==PHASES.PLAYER_TURN)return;dispatch({type:"TIMEOUT_QUESTION"});},[state.phase]);
  const handleTick=useCallback((p)=>{elapsedRef.current=p;},[]);

  useEffect(()=>{if(state.phase===PHASES.ENEMY_TURN&&!state.enemyDamageResult){const t=setTimeout(()=>dispatch({type:"ENEMY_ATTACK"}),600);return()=>clearTimeout(t);}},[state.phase,state.enemyDamageResult]);
  useEffect(()=>{if(state.shakeEnemy||state.shakePlayer){const t=setTimeout(()=>dispatch({type:"CLEAR_ANIMS"}),500);return()=>clearTimeout(t);}},[state.shakeEnemy,state.shakePlayer]);
  useEffect(()=>{
    if(state.phase===PHASES.VICTORY&&state.coinsEarned>0){setTotalCoins(c=>c+state.coinsEarned);if(!completed.includes(currentBattle.id))setCompleted(c=>[...c,currentBattle.id]);}
    if((state.phase===PHASES.VICTORY||state.phase===PHASES.DEFEAT)&&state.wrongThisBattle?.length>0){setAllWrongAnswers(prev=>{const n=[...prev];state.wrongThisBattle.forEach(q=>{if(q&&!n.find(w=>w.text===q.text))n.push(q);});return n;});}
  },[state.phase]);

  const startBattle=(battle)=>{
    let reviewQuestions=null;
    if(battle.boss){const wrongQs=allWrongAnswers.filter(q=>q&&!battle.questions.find(bq=>bq.text===q.text));const prevBattles=BATTLES.filter(b=>b.id!==battle.id&&!b.boss);const prevQs=prevBattles.flatMap(b=>b.questions);const nonWrong=prevQs.filter(q=>!wrongQs.find(w=>w.text===q.text));reviewQuestions=[...wrongQs,...shuffleArray(nonWrong).slice(0,Math.max(0,6-wrongQs.length))].slice(0,8);}
    dispatch({type:"START_BATTLE",battle,playerStats,reviewQuestions});setScreen(SCREENS.BATTLE);
  };
  const selectBattle=(b)=>{setCurrentBattle(b);setScreen(SCREENS.PRE_BATTLE);};
  const goMap=()=>{setScreen(SCREENS.REV_WAR);};
  const goMenu=()=>{setScreen(SCREENS.HOME);};
  const handleLogout=async()=>{await signOut(auth);setTotalCoins(0);setUpgrades({maxHP:0,baseDmg:0,critRate:0});setCompleted([]);setAllWrongAnswers([]);setScreen(SCREENS.HOME);};
  const buyUpgrade=(key)=>{const u=UPGRADES[key];const lv=upgrades[key];if(lv>=u.levels.length-1)return;const cost=u.costs[lv+1];if(totalCoins<cost)return;setTotalCoins(c=>c-cost);setUpgrades(u=>({...u,[key]:u[key]+1}));};

  const ps=getCharState(state.playerHP||1,state.playerMaxHP||1,state.phase,true,state.wasCorrect,!!state.enemyDamageResult);
  const es=getCharState(state.enemyHP||1,state.enemyMaxHP||1,state.phase,false,state.wasCorrect,!!state.enemyDamageResult);

  // ─── AUTH GATE ───────────────────────────────────────────────────────────
  if(authLoading)return(<div style={{minHeight:"100vh",background:"#0d0d1a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1rem",color:"#FFD700",animation:"pulse 1s infinite"}}>Loading...</div></div>);
  if(!user)return<AuthScreen/>;
  if(!dataLoaded)return(<div style={{minHeight:"100vh",background:"#0d0d1a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1rem",color:"#4FC3F7",animation:"pulse 1s infinite"}}>Loading save data...</div></div>);

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#0d0d1a 0%,#1a1a2e 40%,#16213e 100%)",color:"#E0E0E0",fontFamily:fonts.body,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 20% 30%,rgba(79,195,247,0.03) 0%,transparent 50%),radial-gradient(circle at 80% 70%,rgba(198,40,40,0.03) 0%,transparent 50%)",pointerEvents:"none"}}/>
      <div style={{maxWidth:600,margin:"0 auto",padding:16,position:"relative",zIndex:1,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

        {screen!==SCREENS.BATTLE&&screen!==SCREENS.REV_WAR&&<div style={{textAlign:"center",padding:"8px 0 10px",borderBottom:"1px solid rgba(255,255,255,0.04)",marginBottom:12}}><div style={{fontFamily:fonts.heading,fontSize:"1.15rem",fontWeight:700,letterSpacing:"0.1em",color:"#FFD700",cursor:"pointer"}} onClick={goMenu}>HISTORY LEGENDS</div></div>}
        {screen!==SCREENS.BATTLE&&screen!==SCREENS.SHOP&&<ShopButton onClick={()=>setScreen(SCREENS.SHOP)} coins={totalCoins}/>}

        <div style={{flex:1}}>
          {screen===SCREENS.HOME&&<HomeScreen onNavigate={setScreen} coins={totalCoins} userName={user.displayName||"Commander"} onLogout={handleLogout}/>}
          {screen===SCREENS.US_HISTORY&&<USHistoryScreen onNavigate={setScreen} onBack={()=>setScreen(SCREENS.HOME)}/>}
          {screen===SCREENS.REV_WAR&&<RevWarScreen onBack={()=>setScreen(SCREENS.US_HISTORY)} onSelectBattle={selectBattle} completed={completed}/>}
          {screen===SCREENS.ARTWORK&&<ArtworkScreen onBack={()=>setScreen(SCREENS.US_HISTORY)}/>}
          {screen===SCREENS.SHOP&&<ShopScreen onBack={()=>setScreen(SCREENS.HOME)} coins={totalCoins} upgrades={upgrades} onBuy={buyUpgrade}/>}
          {screen===SCREENS.PRE_BATTLE&&<PreBattleScreen battle={currentBattle} onStart={()=>startBattle(currentBattle)} onBack={goMap}/>}

          {screen===SCREENS.BATTLE&&<>
            {state.phase===PHASES.VICTORY&&<VictoryScreen state={state} battle={currentBattle} onRestart={()=>startBattle(currentBattle)} onMenu={goMap} onShop={()=>setScreen(SCREENS.SHOP)}/>}
            {state.phase===PHASES.DEFEAT&&<DefeatScreen state={state} battle={currentBattle} onRestart={()=>startBattle(currentBattle)} onMenu={goMap}/>}
            {state.phase!==PHASES.VICTORY&&state.phase!==PHASES.DEFEAT&&<>
              <div style={{textAlign:"center",padding:"4px 0 6px",flexShrink:0}}>
                <div style={{fontFamily:fonts.heading,fontSize:"0.5rem",letterSpacing:"0.2em",color:"#555",textTransform:"uppercase"}}>{currentBattle.name} · {state.questionsCorrect}/{state.questionsAnswered}</div>
                {state.bossPhase&&<div style={{fontFamily:fonts.heading,fontSize:"0.55rem",letterSpacing:"0.15em",marginTop:3,padding:"3px 12px",borderRadius:6,display:"inline-block",background:state.bossPhase==="review"?"rgba(79,195,247,0.12)":"rgba(255,138,101,0.12)",border:`1px solid ${state.bossPhase==="review"?"rgba(79,195,247,0.3)":"rgba(255,138,101,0.3)"}`,color:state.bossPhase==="review"?"#4FC3F7":"#FF8A65"}}>{state.bossPhase==="review"?"📖 REVIEW PHASE":"⚔️ BOSS PHASE"}</div>}
              </div>
              <div style={{position:"relative",width:"100%",height:260,borderRadius:14,overflow:"hidden",marginBottom:12,flexShrink:0,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#4a6e8a 0%,#6d9ab5 30%,#8bb5c9 50%,#a8c8a0 65%,#5a8a3c 72%,#4a7a2e 100%)"}}/>
                <div style={{position:"absolute",top:15,left:"15%",width:60,height:20,borderRadius:20,background:"rgba(255,255,255,0.25)"}}/>
                <div style={{position:"absolute",top:25,left:"60%",width:80,height:22,borderRadius:20,background:"rgba(255,255,255,0.2)"}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:"35%",background:"linear-gradient(180deg,#4a7a2e,#3d6b24)",borderTop:"2px solid #5a8a3c"}}/>
                <div style={{position:"absolute",bottom:"10%",left:"8%",display:"flex",flexDirection:"column",alignItems:"center",animation:state.shakePlayer?"shakeHit 0.4s ease-out":"none",zIndex:2}}>
                  <div style={{marginBottom:4,width:120}}><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",color:"#42A5F5",letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"center",textShadow:"0 1px 3px rgba(0,0,0,0.5)",marginBottom:2}}>Your Forces</div><div style={{background:"rgba(0,0,0,0.6)",borderRadius:5,height:16,overflow:"hidden",border:"1px solid rgba(66,165,245,0.3)",position:"relative"}}><div style={{width:`${Math.max(0,(state.playerHP/state.playerMaxHP)*100)}%`,height:"100%",background:`linear-gradient(90deg,${state.playerHP/state.playerMaxHP>0.5?"#1565C0":state.playerHP/state.playerMaxHP>0.25?"#F9A825":"#D32F2F"},#42A5F5)`,borderRadius:4,transition:"width 0.6s"}}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:fonts.mono,fontSize:"0.55rem",color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.8)",fontWeight:700}}>{state.playerHP}/{state.playerMaxHP}</div></div></div>
                  <div style={{filter:"drop-shadow(2px 4px 6px rgba(0,0,0,0.4))"}}><ChibiColonial state={ps} size={130}/></div>
                </div>
                <div style={{position:"absolute",bottom:"10%",right:"8%",display:"flex",flexDirection:"column",alignItems:"center",animation:state.shakeEnemy?"shakeHit 0.4s ease-out":"none",zIndex:2}}>
                  <div style={{marginBottom:4,width:120}}><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",color:"#FF5252",letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"center",textShadow:"0 1px 3px rgba(0,0,0,0.5)",marginBottom:2}}>{currentBattle.general}</div><div style={{background:"rgba(0,0,0,0.6)",borderRadius:5,height:16,overflow:"hidden",border:"1px solid rgba(255,82,82,0.3)",position:"relative"}}><div style={{width:`${Math.max(0,(state.enemyHP/state.enemyMaxHP)*100)}%`,height:"100%",background:`linear-gradient(90deg,${state.enemyHP/state.enemyMaxHP>0.5?"#C62828":state.enemyHP/state.enemyMaxHP>0.25?"#F9A825":"#D32F2F"},#FF5252)`,borderRadius:4,transition:"width 0.6s"}}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:fonts.mono,fontSize:"0.55rem",color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.8)",fontWeight:700}}>{state.enemyHP}/{state.enemyMaxHP}</div></div></div>
                  <div style={{filter:"drop-shadow(2px 4px 6px rgba(0,0,0,0.4))",transform:"scaleX(-1)"}}><ChibiBritish state={es} size={130}/></div>
                </div>
                {state.phase==="ANSWER_RESULT"&&state.wasCorrect&&state.damageResult&&(<div style={{position:"absolute",top:"20%",right:"22%",zIndex:5,animation:"floatUp 1s ease-out",pointerEvents:"none"}}><span style={{fontFamily:fonts.mono,fontSize:state.damageResult.isCrit?"1.8rem":"1.3rem",fontWeight:700,color:state.damageResult.isCrit?"#FFD700":"#4FC3F7",textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>{state.damageResult.isCrit?"★ ":""}-{state.damageResult.damage}</span></div>)}
                {state.phase==="ENEMY_TURN"&&state.enemyDamageResult&&(<div style={{position:"absolute",top:"20%",left:"18%",zIndex:5,animation:"floatUp 1s ease-out",pointerEvents:"none"}}><span style={{fontFamily:fonts.mono,fontSize:"1.3rem",fontWeight:700,color:"#EF5350",textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>-{state.enemyDamageResult}</span></div>)}
              </div>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:10,minHeight:0,overflowY:"auto"}}>
                {state.phase===PHASES.PLAYER_TURN&&<><Timer duration={TIMER_DURATION} onTimeout={handleTimeout} isActive={true} onTick={handleTick}/><QuestionCard question={state.currentQuestion} onAnswer={handleAnswer} disabled={false}/></>}
                {state.phase===PHASES.ANSWER_RESULT&&<ResultOverlay wasCorrect={state.wasCorrect} question={state.currentQuestion} selectedAnswer={state.selectedAnswer} damageResult={state.damageResult} onContinue={()=>dispatch({type:"PROCEED_AFTER_RESULT"})}/>}
                {state.phase===PHASES.ENEMY_TURN&&state.enemyDamageResult&&<EnemyTurnOverlay damage={state.enemyDamageResult} generalName={currentBattle.general} onContinue={()=>dispatch({type:"PROCEED_AFTER_ENEMY"})}/>}
                {state.phase===PHASES.ENEMY_TURN&&!state.enemyDamageResult&&<div style={{textAlign:"center",padding:20,fontFamily:fonts.heading,fontSize:"0.95rem",color:"#EF5350",animation:"pulse 0.8s infinite"}}>Enemy preparing attack...</div>}
                <div style={{marginTop:"auto",paddingTop:6}}><BattleLog log={state.turnLog}/></div>
              </div>
            </>}
          </>}
        </div>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Share+Tech+Mono&display=swap');
        @keyframes shakeHit{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes floatUp{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-40px)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
        button:hover{filter:brightness(1.08);transform:translateY(-1px)}button:active{transform:translateY(0)}
        input:focus{border-color:rgba(79,195,247,0.5)!important;box-shadow:0 0 8px rgba(79,195,247,0.15)}
      `}</style>
    </div>
  );
}
