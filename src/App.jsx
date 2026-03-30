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
const UNIT_HP_SCALE = 0.45; // each unit gets 45% of base HP (3 units ≈ 135% total)
const SCREENS = { AUTH:"AUTH", HOME:"HOME", US_HISTORY:"US_HISTORY", REV_WAR:"REV_WAR", PRE_BATTLE:"PRE_BATTLE", UNIT_SELECT:"UNIT_SELECT", BATTLE:"BATTLE", SHOP:"SHOP" };
const CHAR_STATES = { IDLE:"idle", ATTACK:"attack", HIT:"hit", CRITICAL:"critical" };
const PHASES = { PLAYER_TURN:"PLAYER_TURN", ANSWER_RESULT:"ANSWER_RESULT", ENEMY_TURN:"ENEMY_TURN", UNIT_FALLEN:"UNIT_FALLEN", VICTORY:"VICTORY", DEFEAT:"DEFEAT" };
const fonts = { heading:"'Cinzel', serif", body:"'EB Garamond', serif", mono:"'Share Tech Mono', monospace" };
const btn = (bg,border) => ({ background:bg, border:`1px solid ${border}`, borderRadius:10, padding:"12px 32px", color:"#E0E0E0", fontFamily:fonts.heading, fontSize:"0.8rem", letterSpacing:"0.1em", cursor:"pointer", textTransform:"uppercase", transition:"all 0.2s" });
const goldBtn = { ...btn("linear-gradient(135deg,#FFD700,#FFA000)","transparent"), color:"#1a1a2e", fontWeight:700 };
const blueBtn = btn("linear-gradient(135deg,#1565C0,#0D47A1)","rgba(79,195,247,0.3)");
const redBtn = btn("linear-gradient(135deg,#C62828,#B71C1C)","rgba(239,83,80,0.3)");

const UPGRADES = {
  maxHP:{label:"Max HP",icon:"❤️",levels:[120,140,160,180,200],costs:[0,50,120,200,350],desc:["120","140","160","180","200"]},
  baseDmg:{label:"Base Damage",icon:"⚔️",levels:[20,24,28,32,36],costs:[0,60,140,250,400],desc:["20","24","28","32","36"]},
  critRate:{label:"Crit Chance",icon:"💥",levels:[0.15,0.20,0.25,0.30,0.35],costs:[0,75,160,280,450],desc:["15%","20%","25%","30%","35%"]},
};

// ─── UNITS ───────────────────────────────────────────────────────────────────
const UNITS = [
  { id:"infantry", name:"Infantry", icon:"🛡️", desc:"Balanced forces.", hpMult:1.0, dmgMult:1.0, special:null, cost:0, color:"#42A5F5" },
  { id:"cavalry", name:"Cavalry", icon:"🐴", desc:"High damage, less HP.", hpMult:0.8, dmgMult:1.35, special:null, cost:100, color:"#FF8A65" },
  { id:"artillery", name:"Artillery", icon:"💣", desc:"Devastating but fragile.", hpMult:0.65, dmgMult:1.6, special:null, cost:175, color:"#EF5350" },
  { id:"medic", name:"Medic", icon:"⚕️", desc:"Heals 8 HP on correct.", hpMult:1.15, dmgMult:0.75, special:"heal", healAmt:8, cost:125, color:"#66BB6A" },
];

// ─── QUESTIONS (kept compact) ────────────────────────────────────────────────
const Q_LEXINGTON = [
  {text:"In what year did Lexington and Concord take place?",options:["1774","1775","1776","1773"],answer:1,explanation:"April 19, 1775."},
  {text:"Who commanded the British march to Concord?",options:["Howe","Cornwallis","Lt. Col. Smith","Burgoyne"],answer:2,explanation:"Lt. Col. Smith led the expedition."},
  {text:"Primary objective of the British march?",options:["Arrest Adams","Seize weapons","Build fort","Collect taxes"],answer:1,explanation:"Confiscate colonial military supplies."},
  {text:"Who made the famous midnight ride?",options:["Franklin","Adams","Paul Revere","Jefferson"],answer:2,explanation:"Revere rode from Boston April 18."},
  {text:"Militia ready at a minute's notice?",options:["Continental Army","Sons of Liberty","Minutemen","Rangers"],answer:2,explanation:"Minutemen pledged instant readiness."},
  {text:"First shot at Lexington is called?",options:["Shot of Freedom","Opening Salvo","Shot Heard Round the World","First Volley"],answer:2,explanation:"Coined by Emerson in 1837."},
  {text:"Who led militia at Lexington Green?",options:["John Parker","Washington","Ethan Allen","Arnold"],answer:0,explanation:"Capt. Parker commanded ~77 men."},
  {text:"How many militia on Lexington Green?",options:["~200","~77","~500","~30"],answer:1,explanation:"77 Minutemen, vastly outnumbered."},
  {text:"Signal warning of British route?",options:["Cannons","Flags","Lanterns in Old North Church","Drums"],answer:2,explanation:"Two lanterns meant 'by sea.'"},
  {text:"What 1774 act fueled colonial anger?",options:["Stamp Act","Intolerable Acts","Townshend Acts","Quartering Act"],answer:1,explanation:"Punished MA for the Tea Party."},
];
const Q_TICONDEROGA = [
  {text:"Who captured Fort Ticonderoga?",options:["Washington","Ethan Allen","Adams","Greene"],answer:1,explanation:"Ethan Allen led the surprise attack."},
  {text:"What militia did Allen lead?",options:["Minutemen","Continental Army","Green Mountain Boys","Sons of Liberty"],answer:2,explanation:"Vermont militia."},
  {text:"Key value of capturing Ticonderoga?",options:["Prison","Artillery/cannons","Naval base","Gold"],answer:1,explanation:"Valuable cannons captured."},
  {text:"Who transported cannons to Boston?",options:["Revere","Henry Knox","Arnold","Allen"],answer:1,explanation:"Knox moved 60 tons in winter."},
  {text:"What colony was Ticonderoga in?",options:["Massachusetts","Connecticut","New York","Vermont"],answer:2,explanation:"Upstate New York."},
  {text:"Body of water near Ticonderoga?",options:["Hudson","Lake Champlain","Lake Ontario","Atlantic"],answer:1,explanation:"Southern Lake Champlain."},
  {text:"British defenders at the fort?",options:["200","500","48","1,000"],answer:2,explanation:"Only about 48 soldiers."},
  {text:"Who fought alongside Allen?",options:["Washington","Benedict Arnold","Hancock","Jefferson"],answer:1,explanation:"Arnold had a MA commission."},
];
const Q_BUNKER = [
  {text:"Where did 'Bunker Hill' fighting occur?",options:["Bunker Hill","Breed's Hill","Dorchester","Castle Island"],answer:1,explanation:"Fighting on Breed's Hill."},
  {text:"Famous order about when to fire?",options:["Fire at will","Shoot to kill","Don't fire til whites of their eyes","Hold the line"],answer:2,explanation:"Attributed to Prescott."},
  {text:"Colonial commander at Bunker Hill?",options:["Washington","Col. Prescott","Allen","Putnam"],answer:1,explanation:"Prescott commanded the redoubt."},
  {text:"How many British assaults?",options:["1","2","3","4"],answer:2,explanation:"Three; third succeeded."},
  {text:"Battle outcome?",options:["Colonial victory","British victory w/ heavy losses","Stalemate","Surrender"],answer:1,explanation:"British pyrrhic victory."},
  {text:"British casualties?",options:["200","500","1,000","2,000"],answer:2,explanation:"~1,000 killed or wounded."},
  {text:"American general killed?",options:["Washington","Joseph Warren","Knox","Greene"],answer:1,explanation:"Dr. Warren was killed."},
  {text:"British commander?",options:["Gage","Gen. Howe","Cornwallis","Burgoyne"],answer:1,explanation:"Howe led the assault."},
];
const Q_BOSTON = [
  {text:"How long was the Siege of Boston?",options:["3 months","6 months","11 months","2 years"],answer:2,explanation:"About 11 months."},
  {text:"What did Washington occupy to force British out?",options:["Bunker Hill","Dorchester Heights","Castle William","Fort Independence"],answer:1,explanation:"Dorchester Heights overlooked the city."},
  {text:"Where did Heights cannons come from?",options:["France","Ticonderoga","Philadelphia","Local"],answer:1,explanation:"Knox's expedition from Ticonderoga."},
  {text:"Who commanded during the siege?",options:["Allen","Howe","Washington","Adams"],answer:2,explanation:"Washington took command July 1775."},
  {text:"When did British evacuate?",options:["Jan 1776","March 17, 1776","July 4, 1776","Dec 1776"],answer:1,explanation:"Evacuation Day."},
  {text:"British sailed where after?",options:["New York","London","Halifax","Charleston"],answer:2,explanation:"Withdrew to Halifax."},
  {text:"What book inspired colonists?",options:["Federalist Papers","Common Sense","Poor Richard's","Rights of Man"],answer:1,explanation:"Paine's Common Sense."},
];
const Q_LONGISLAND = [
  {text:"When was Long Island fought?",options:["June 1776","Aug 27, 1776","Oct 1776","Dec 1776"],answer:1,explanation:"August 27, 1776."},
  {text:"Modern borough of most fighting?",options:["Manhattan","Queens","Brooklyn","Staten Island"],answer:2,explanation:"Across what is now Brooklyn."},
  {text:"How did Washington's army escape?",options:["Fought through","Nighttime evacuation","Surrendered","Tunnels"],answer:1,explanation:"Nighttime boat evacuation."},
  {text:"British flanking route?",options:["Hudson","Jamaica Pass","Central Park","Harlem"],answer:1,explanation:"Unguarded Jamaica Pass."},
  {text:"Foreign soldiers for British?",options:["French","Spanish","Hessians","Dutch"],answer:2,explanation:"German mercenaries."},
  {text:"Battle's significance?",options:["Fewest casualties","Largest of the war","First naval","Longest"],answer:1,explanation:"Largest battle of the Revolution."},
  {text:"British troop count?",options:["10,000","20,000","32,000","50,000"],answer:2,explanation:"~32,000 troops."},
];
const Q_TRENTON = [
  {text:"When was Trenton?",options:["Dec 25, 1776","Jan 3, 1777","Nov 1776","Feb 1777"],answer:0,explanation:"Christmas night crossing."},
  {text:"What river did Washington cross?",options:["Hudson","Potomac","Delaware","Charles"],answer:2,explanation:"The Delaware River."},
  {text:"Enemy forces at Trenton?",options:["British regulars","French","Hessians","Loyalists"],answer:2,explanation:"Hessian mercenaries."},
  {text:"Hessian commander?",options:["Howe","Col. Rall","Cornwallis","Tarleton"],answer:1,explanation:"Colonel Johann Rall."},
  {text:"Weather aiding the attack?",options:["Fog","Blizzard/sleet","Hurricane","Heat"],answer:1,explanation:"Fierce sleet and snow."},
  {text:"Hessians captured?",options:["~100","~500","~900","~2,000"],answer:2,explanation:"About 900 captured."},
  {text:"Why was Trenton important?",options:["First victory in months","Ended war","Captured general","French alliance"],answer:0,explanation:"Desperately needed morale boost."},
];
const Q_PRINCETON = [
  {text:"How soon after Trenton was Princeton?",options:["Next day","About a week","A month","Six months"],answer:1,explanation:"January 3, 1777."},
  {text:"Who did Washington outmaneuver?",options:["Howe","Cornwallis","Burgoyne","Rall"],answer:1,explanation:"Slipped past Cornwallis at night."},
  {text:"Tactic to evade Cornwallis?",options:["Frontal assault","Left campfires burning","Naval escape","Decoy army"],answer:1,explanation:"Kept fires burning as a trick."},
  {text:"Battle result?",options:["British victory","American victory","Stalemate","Both retreated"],answer:1,explanation:"Another morale-boosting victory."},
  {text:"What did Washington establish after?",options:["New capital","Winter quarters at Morristown","Naval fleet","Treaty"],answer:1,explanation:"Morristown winter quarters."},
  {text:"Washington's nickname from these victories?",options:["The Fox","The Old Fox","American Hannibal","Liberator"],answer:1,explanation:"His cunning earned him 'The Old Fox.'"},
];
const Q_BRANDYWINE = [
  {text:"Brandywine was fought along what creek?",options:["Brandywine Creek","Schuylkill","Delaware","Chesapeake"],answer:0,explanation:"Brandywine Creek, Pennsylvania."},
  {text:"What city was Washington protecting?",options:["New York","Boston","Philadelphia","Charleston"],answer:2,explanation:"Philadelphia, the capital."},
  {text:"British flanking tactic?",options:["Amphibious","Divided army, two-sided attack","Night assault","Cavalry"],answer:1,explanation:"Howe sent Cornwallis flanking."},
  {text:"French volunteer wounded here?",options:["Rochambeau","Lafayette","De Grasse","Von Steuben"],answer:1,explanation:"Lafayette's first battle."},
  {text:"What happened to Philadelphia?",options:["Defended","British captured it","Burned","Abandoned"],answer:1,explanation:"British occupied Philadelphia."},
  {text:"When was Brandywine?",options:["July 1777","Sept 11, 1777","Oct 1777","Dec 1777"],answer:1,explanation:"September 11, 1777."},
];
const Q_GERMANTOWN = [
  {text:"Washington's plan at Germantown?",options:["Defend fort","Surprise dawn attack","Negotiate","Retreat"],answer:1,explanation:"Bold surprise attack on British camp."},
  {text:"What caused confusion?",options:["Rain","Dense fog","Snow","Heat"],answer:1,explanation:"Thick fog, friendly fire incidents."},
  {text:"British stronghold building?",options:["Independence Hall","Chew House","Valley Forge HQ","Betsy Ross"],answer:1,explanation:"Troops barricaded in the Chew House."},
  {text:"How did battle influence allies?",options:["Discouraged","Impressed France","No impact","Angered Spain"],answer:1,explanation:"French impressed by American aggression."},
  {text:"What happened to American units in fog?",options:["Surrendered","Fired on each other","Got lost at sea","Defected"],answer:1,explanation:"Friendly fire in confusion."},
  {text:"When was Germantown?",options:["Aug 1777","Oct 4, 1777","Dec 1777","Jan 1778"],answer:1,explanation:"October 4, 1777."},
];
const Q_SARATOGA = [
  {text:"Saratoga is considered the war's what?",options:["Bloodiest","Turning point","Final battle","First battle"],answer:1,explanation:"Secured the French Alliance."},
  {text:"British commander at Saratoga?",options:["Howe","Clinton","Burgoyne","Cornwallis"],answer:2,explanation:"'Gentleman Johnny' Burgoyne."},
  {text:"What country allied after Saratoga?",options:["Spain","Netherlands","France","Prussia"],answer:2,explanation:"France formally allied in 1778."},
  {text:"Heroic general who later became traitor?",options:["Greene","Knox","Benedict Arnold","Lee"],answer:2,explanation:"Arnold fought bravely then defected."},
  {text:"What happened to Burgoyne's army?",options:["Escaped","Surrendered entirely","Won","Retreated"],answer:1,explanation:"~6,000 surrendered."},
  {text:"American commander?",options:["Washington","Gen. Horatio Gates","Greene","Lafayette"],answer:1,explanation:"Gates commanded American forces."},
  {text:"How many battles at Saratoga?",options:["One","Two","Three","Four"],answer:1,explanation:"Freeman's Farm and Bemis Heights."},
  {text:"Burgoyne's strategy?",options:["Southern Strategy","Divide and Conquer","Anaconda","Hudson River Strategy"],answer:1,explanation:"Control the Hudson to split New England."},
];
const Q_VALLEYFORGE = [
  {text:"Valley Forge was what type of event?",options:["Battle","Winter encampment","Naval engagement","Negotiation"],answer:1,explanation:"A six-month winter camp."},
  {text:"Biggest threat at Valley Forge?",options:["British attacks","Disease/starvation","Flooding","Desertion"],answer:1,explanation:"~2,000 died from disease and exposure."},
  {text:"Who trained the army at Valley Forge?",options:["Lafayette","Greene","Baron von Steuben","Knox"],answer:2,explanation:"Prussian Baron von Steuben."},
  {text:"Von Steuben was from?",options:["France","Spain","Prussia","Netherlands"],answer:2,explanation:"Prussian military officer."},
  {text:"Soldiers who died at Valley Forge?",options:["200","500","2,000","5,000"],answer:2,explanation:"About 2,000 died."},
  {text:"Skill gained at Valley Forge?",options:["Naval warfare","Professional discipline","Guerrilla tactics","Cannon making"],answer:1,explanation:"European drill and discipline."},
  {text:"When did army leave Valley Forge?",options:["March 1778","June 1778","Sept 1778","Dec 1778"],answer:1,explanation:"June 1778, transformed."},
];

// ─── BATTLE CONFIGS WITH 3 ENEMY DIVISIONS EACH ─────────────────────────────
const BATTLES = [
  { id:"lexington",name:"Lexington & Concord",date:"Apr 1775",general:"Gen. Gage",icon:"🔫",questions:Q_LEXINGTON,context:"British marched to seize colonial weapons. Skirmishes at Lexington and Concord ignited the Revolution.",enemies:[{name:"British Regulars",hp:70,dmg:14,icon:"🔴"},{name:"Light Infantry",hp:65,dmg:16,icon:"🟠"},{name:"Gage's Guard",hp:65,dmg:18,icon:"⭐"}]},
  { id:"ticonderoga",name:"Fort Ticonderoga",date:"May 1775",general:"Capt. Delaplace",icon:"🏰",questions:Q_TICONDEROGA,context:"Ethan Allen's Green Mountain Boys captured this fort, providing vital artillery.",enemies:[{name:"Fort Garrison",hp:70,dmg:16,icon:"🔴"},{name:"British Sentries",hp:70,dmg:18,icon:"🟠"},{name:"Delaplace's Guard",hp:80,dmg:20,icon:"⭐"}]},
  { id:"bunker",name:"Bunker Hill",date:"Jun 1775",general:"Gen. Howe",icon:"⛰️",questions:Q_BUNKER,context:"Colonial forces on Breed's Hill withstood two British assaults before falling to the third.",enemies:[{name:"British Grenadiers",hp:80,dmg:18,icon:"🔴"},{name:"Light Companies",hp:75,dmg:20,icon:"🟠"},{name:"Howe's Vanguard",hp:85,dmg:22,icon:"⭐"}]},
  { id:"boston",name:"Siege of Boston",date:"Mar 1776",general:"Gen. Howe",icon:"🏘️",questions:Q_BOSTON,context:"Washington surrounded Boston for 11 months. Knox's cannons on Dorchester Heights forced evacuation.",enemies:[{name:"Boston Garrison",hp:85,dmg:18,icon:"🔴"},{name:"Royal Marines",hp:80,dmg:20,icon:"🟠"},{name:"Howe's Regulars",hp:95,dmg:22,icon:"⭐"}]},
  { id:"longisland",name:"Battle of Long Island",date:"Aug 1776",general:"Gen. Howe",icon:"🏝️",boss:true,bossReviewDmg:10,questions:Q_LONGISLAND,context:"Largest battle of the war. Howe flanked through Jamaica Pass. Washington's evacuation saved the army.",enemies:[{name:"Hessian Grenadiers",hp:110,dmg:22,icon:"🔴"},{name:"British Flankers",hp:120,dmg:24,icon:"🟠"},{name:"Gen. Howe",hp:130,dmg:28,icon:"👑"}]},
  { id:"trenton",name:"Battle of Trenton",date:"Dec 1776",general:"Col. Rall",icon:"🎄",questions:Q_TRENTON,context:"Washington crossed the Delaware on Christmas night to surprise Hessian forces.",enemies:[{name:"Hessian Fusiliers",hp:65,dmg:16,icon:"🔴"},{name:"Hessian Jägers",hp:65,dmg:18,icon:"🟠"},{name:"Col. Rall's Guard",hp:70,dmg:20,icon:"⭐"}]},
  { id:"princeton",name:"Battle of Princeton",date:"Jan 1777",general:"Cornwallis",icon:"⚔️",questions:Q_PRINCETON,context:"Washington left campfires burning to trick Cornwallis and marched to Princeton.",enemies:[{name:"4th Regiment",hp:75,dmg:18,icon:"🔴"},{name:"55th Regiment",hp:75,dmg:20,icon:"🟠"},{name:"Cornwallis Rear Guard",hp:80,dmg:22,icon:"⭐"}]},
  { id:"brandywine",name:"Brandywine",date:"Sep 1777",general:"Gen. Howe",icon:"🌊",questions:Q_BRANDYWINE,context:"Washington tried to block the British advance on Philadelphia. Howe's flanking led to defeat.",enemies:[{name:"British Regulars",hp:85,dmg:20,icon:"🔴"},{name:"Cornwallis Flankers",hp:85,dmg:22,icon:"🟠"},{name:"Howe's Command",hp:90,dmg:24,icon:"⭐"}]},
  { id:"germantown",name:"Germantown",date:"Oct 1777",general:"Gen. Howe",icon:"⚔️",questions:Q_GERMANTOWN,context:"Washington launched a bold dawn attack but fog caused confusion and friendly fire.",enemies:[{name:"British Pickets",hp:85,dmg:20,icon:"🔴"},{name:"Chew House Defenders",hp:90,dmg:22,icon:"🟠"},{name:"Howe's Reserve",hp:95,dmg:24,icon:"⭐"}]},
  { id:"saratoga",name:"Battle of Saratoga",date:"Oct 1777",general:"Burgoyne",icon:"🏳️",boss:true,bossReviewDmg:10,questions:Q_SARATOGA,context:"The turning point. Burgoyne surrendered, convincing France to join as America's ally.",enemies:[{name:"British Line Infantry",hp:130,dmg:24,icon:"🔴"},{name:"Hessian Auxiliaries",hp:120,dmg:26,icon:"🟠"},{name:"Gen. Burgoyne",hp:150,dmg:30,icon:"👑"}]},
  { id:"valleyforge",name:"Valley Forge",date:"Winter 1777-78",general:"Winter",icon:"🏕️",questions:Q_VALLEYFORGE,context:"Not a battle but a grueling winter camp. Von Steuben transformed the army.",enemies:[{name:"Bitter Cold",hp:100,dmg:16,icon:"❄️"},{name:"Disease",hp:100,dmg:18,icon:"🤒"},{name:"Starvation",hp:100,dmg:20,icon:"💀"}]},
];
const REV_WAR_MAP = [
  {id:"yorktown",name:"Yorktown",date:"Oct 1781",general:"Cornwallis",boss:"FINAL BOSS",icon:"🏰"},
  {id:"chesapeake",name:"Chesapeake",date:"Sep 1781",general:"Adm. Graves",icon:"⚓"},
  {id:"eutaw",name:"Eutaw Springs",date:"Sep 1781",general:"Stuart",icon:"🌿"},
  {id:"guilford",name:"Guilford CH",date:"Mar 1781",general:"Cornwallis",icon:"⚔️"},
  {id:"cowpens",name:"Cowpens",date:"Jan 1781",general:"Tarleton",boss:"BOSS",icon:"🐄"},
  {id:"camden",name:"Camden",date:"Aug 1780",general:"Cornwallis",icon:"⚔️"},
  {id:"monmouth",name:"Monmouth",date:"Jun 1778",general:"Clinton",icon:"⚔️"},
  {id:"valleyforge",name:"Valley Forge",date:"Winter 1777-78",general:"Winter",icon:"🏕️"},
  {id:"saratoga",name:"Saratoga",date:"Oct 1777",general:"Burgoyne",boss:"BOSS",icon:"🏳️"},
  {id:"germantown",name:"Germantown",date:"Oct 1777",general:"Howe",icon:"⚔️"},
  {id:"brandywine",name:"Brandywine",date:"Sep 1777",general:"Howe",icon:"🌊"},
  {id:"princeton",name:"Princeton",date:"Jan 1777",general:"Cornwallis",icon:"⚔️"},
  {id:"trenton",name:"Trenton",date:"Dec 1776",general:"Col. Rall",icon:"🎄"},
  {id:"longisland",name:"Long Island",date:"Aug 1776",general:"Howe",boss:"BOSS",icon:"🏝️"},
  {id:"boston",name:"Siege of Boston",date:"Mar 1776",general:"Howe",icon:"🏘️"},
  {id:"bunker",name:"Bunker Hill",date:"Jun 1775",general:"Howe",icon:"⛰️"},
  {id:"ticonderoga",name:"Ticonderoga",date:"May 1775",general:"Delaplace",icon:"🏰"},
  {id:"lexington",name:"Lexington",date:"Apr 1775",general:"Gage",icon:"🔫"},
];

// ═════════════════════════════════════════════════════════════════════════════
// CHIBI SVGs (compact)
// ═════════════════════════════════════════════════════════════════════════════
function ChibiColonial({state:st=CHAR_STATES.IDLE,size=140}){const s=size/160,atk=st===CHAR_STATES.ATTACK,hit=st===CHAR_STATES.HIT,crit=st===CHAR_STATES.CRITICAL;return(<svg viewBox="0 0 120 160" width={120*s} height={160*s} xmlns="http://www.w3.org/2000/svg" style={{filter:hit?"brightness(1.4) saturate(0.6)":crit?"saturate(0.7)":"none"}}>{atk&&<g><polygon points="98,52 118,45 115,55 125,50 112,60 116,58 100,62" fill="#FFD700" opacity="0.9"><animate attributeName="opacity" values="1;0.5;1" dur="0.2s" repeatCount="indefinite"/></polygon><circle cx="102" cy="56" r="7" fill="#FFF" opacity="0.8"><animate attributeName="r" values="5;8;5" dur="0.25s" repeatCount="indefinite"/></circle></g>}{hit&&<text x="50" y="15" textAnchor="middle" fontSize="14" fill="#FF4444" fontWeight="bold" fontFamily="sans-serif"><animate attributeName="opacity" values="1;0;1" dur="0.3s" repeatCount="indefinite"/>✕</text>}<ellipse cx="52" cy="155" rx={crit?32:26} ry="4" fill="rgba(0,0,0,0.25)"/><g transform={hit?"translate(4,0)":crit?"translate(0,8)":""}><rect x={crit?"30":"35"} y={crit?"118":"115"} width="11" height={crit?"22":"26"} rx="4" fill="#E8DCC8"/><rect x={crit?"50":"55"} y={crit?"120":"115"} width="11" height={crit?"20":"26"} rx="4" fill="#E8DCC8"/><rect x={crit?"28":"33"} y={crit?"135":"136"} width="15" height="12" rx="4" fill="#2A1A0E"/><rect x={crit?"48":"53"} y={crit?"135":"136"} width="15" height="12" rx="4" fill="#2A1A0E"/><rect x="30" y="76" width="40" height={crit?"46":"42"} rx="7" fill="#1B3D6E"/><path d="M 43 78 L 46 78 L 48 108 L 42 108 Z" fill="#C9AD6A"/><path d="M 54 78 L 57 78 L 58 108 L 52 108 Z" fill="#C9AD6A"/><ellipse cx="32" cy="78" rx="6" ry="3" fill="#C9AD6A"/><ellipse cx="68" cy="78" rx="6" ry="3" fill="#C9AD6A"/><rect x="28" y="107" width="44" height="5" rx="2" fill="#C9AD6A"/>{crit?<><rect x="22" y="82" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="15" y="90" width="3.5" height="40" rx="1.5" fill="#5A3820" transform="rotate(-5 16 90)"/></>:atk?<><rect x="24" y="78" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="60" y="48" width="3.5" height="46" rx="1.5" fill="#5A3820" transform="rotate(-20 62 72)"/><rect x="61" y="34" width="2.5" height="18" rx="1" fill="#666" transform="rotate(-20 62 43)"/></>:<><rect x="22" y="80" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="66" y="80" width="12" height="10" rx="5" fill="#1B3D6E"/><rect x="22" y="52" width="3.5" height="48" rx="1.5" fill="#5A3820" transform="rotate(10 24 76)"/></>}</g><g transform={hit?"translate(5,-2) rotate(5 50 45)":crit?"translate(-2,6) rotate(-8 50 45)":""}><circle cx="50" cy="46" r="27" fill="#FADCB2"/><ellipse cx="34" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/><ellipse cx="66" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/>{crit?<><line x1="35" y1="44" x2="44" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><line x1="56" y1="44" x2="65" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/></>:hit?<><g transform="translate(39,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g><g transform="translate(61,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g></>:<><ellipse cx="39" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="61" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="40" cy="45" rx="3.5" ry="4" fill="#2C5F8A"/><ellipse cx="62" cy="45" rx="3.5" ry="4" fill="#2C5F8A"/><circle cx="41" cy="44" r="2" fill="#111"/><circle cx="63" cy="44" r="2" fill="#111"/><circle cx="42" cy="42.5" r="1.2" fill="#FFF"/><circle cx="64" cy="42.5" r="1.2" fill="#FFF"/>{atk&&<><line x1="33" y1="37" x2="45" y2="39" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/><line x1="55" y1="39" x2="67" y2="37" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/></>}</>}{st===CHAR_STATES.IDLE&&<><line x1="34" y1="37" x2="44" y2="38" stroke="#3B2517" strokeWidth="1.8" strokeLinecap="round"/><line x1="56" y1="38" x2="66" y2="37" stroke="#3B2517" strokeWidth="1.8" strokeLinecap="round"/></>}{crit?<path d="M 44 56 Q 50 53 56 56" fill="none" stroke="#7A4A2E" strokeWidth="1.5"/>:hit?<ellipse cx="50" cy="55" rx="4" ry="3" fill="#2A1A0E"/>:atk?<path d="M 45 53 L 55 53 L 52 56 Z" fill="#2A1A0E"/>:<path d="M 44 53 Q 50 58 56 53" fill="none" stroke="#7A4A2E" strokeWidth="1.5"/>}<path d="M 26 40 Q 30 26 42 22" fill="#4A2E14"/><path d="M 58 22 Q 70 26 74 40" fill="#4A2E14"/><path d="M 16 37 L 50 12 L 84 37 L 68 40 L 50 30 L 32 40 Z" fill="#1E2530"/><path d="M 21 37 L 50 17 L 79 37" fill="none" stroke="#C9AD6A" strokeWidth="1.8"/><circle cx="50" cy="23" r="3.5" fill="#1B3D6E"/><circle cx="50" cy="23" r="1.8" fill="#C9AD6A"/></g></svg>);}
function ChibiBritish({state:st=CHAR_STATES.IDLE,size=140}){const s=size/160,atk=st===CHAR_STATES.ATTACK,hit=st===CHAR_STATES.HIT,crit=st===CHAR_STATES.CRITICAL;return(<svg viewBox="0 0 120 160" width={120*s} height={160*s} xmlns="http://www.w3.org/2000/svg" style={{filter:hit?"brightness(1.4) saturate(0.6)":crit?"saturate(0.7)":"none"}}>{atk&&<g><polygon points="22,52 2,45 5,55 -5,50 8,60 4,58 20,62" fill="#FFD700" opacity="0.9"><animate attributeName="opacity" values="1;0.5;1" dur="0.2s" repeatCount="indefinite"/></polygon><circle cx="18" cy="56" r="7" fill="#FFF" opacity="0.8"><animate attributeName="r" values="5;8;5" dur="0.25s" repeatCount="indefinite"/></circle></g>}{hit&&<text x="60" y="15" textAnchor="middle" fontSize="14" fill="#FF4444" fontWeight="bold" fontFamily="sans-serif"><animate attributeName="opacity" values="1;0;1" dur="0.3s" repeatCount="indefinite"/>✕</text>}<ellipse cx="58" cy="155" rx={crit?32:26} ry="4" fill="rgba(0,0,0,0.25)"/><g transform={hit?"translate(-4,0)":crit?"translate(0,8)":""}><rect x={crit?"48":"45"} y={crit?"118":"115"} width="11" height={crit?"22":"26"} rx="4" fill="#E8DCC8"/><rect x={crit?"66":"63"} y={crit?"120":"115"} width="11" height={crit?"20":"26"} rx="4" fill="#E8DCC8"/><rect x={crit?"46":"43"} y={crit?"132":"128"} width="15" height="20" rx="4" fill="#1C1C1C"/><rect x={crit?"64":"61"} y={crit?"132":"128"} width="15" height="20" rx="4" fill="#1C1C1C"/><rect x="40" y="76" width="40" height={crit?"46":"42"} rx="7" fill="#B22020"/><line x1="43" y1="79" x2="77" y2="114" stroke="#E8DCC8" strokeWidth="2.5"/><line x1="77" y1="79" x2="43" y2="114" stroke="#E8DCC8" strokeWidth="2.5"/><rect x="56" y="92" width="8" height="8" rx="2" fill="#C9AD6A"/><rect x="42" y="79" width="5" height="32" rx="2" fill="#E8DCC8"/><rect x="73" y="79" width="5" height="32" rx="2" fill="#E8DCC8"/>{crit?<><rect x="76" y="82" width="12" height="10" rx="5" fill="#B22020"/><rect x="88" y="90" width="3.5" height="40" rx="1.5" fill="#5A3820" transform="rotate(5 90 90)"/></>:atk?<><rect x="30" y="76" width="14" height="9" rx="5" fill="#B22020"/><rect x="36" y="48" width="3.5" height="46" rx="1.5" fill="#5A3820" transform="rotate(20 38 72)"/><rect x="36" y="34" width="2.5" height="18" rx="1" fill="#666" transform="rotate(20 37 43)"/></>:<><rect x="76" y="80" width="12" height="10" rx="5" fill="#B22020"/><rect x="32" y="80" width="12" height="10" rx="5" fill="#B22020"/><rect x="82" y="52" width="3.5" height="48" rx="1.5" fill="#5A3820" transform="rotate(-10 84 76)"/></>}</g><g transform={hit?"translate(-5,-2) rotate(-5 60 45)":crit?"translate(2,6) rotate(8 60 45)":""}><circle cx="60" cy="46" r="27" fill="#FADCB2"/><ellipse cx="44" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/><ellipse cx="76" cy="52" rx="5" ry="2.5" fill="#E8A090" opacity="0.35"/>{crit?<><line x1="45" y1="44" x2="54" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><line x1="66" y1="44" x2="75" y2="44" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/></>:hit?<><g transform="translate(49,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g><g transform="translate(71,43)"><line x1="-3" y1="-3" x2="3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="-3" x2="-3" y2="3" stroke="#C62828" strokeWidth="2" strokeLinecap="round"/></g></>:<><ellipse cx="49" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="71" cy="44" rx="5" ry="5.5" fill="#FFF"/><ellipse cx="50" cy="45" rx="3.5" ry="4" fill="#4A6741"/><ellipse cx="72" cy="45" rx="3.5" ry="4" fill="#4A6741"/><circle cx="51" cy="44" r="2" fill="#111"/><circle cx="73" cy="44" r="2" fill="#111"/><circle cx="52" cy="42.5" r="1.2" fill="#FFF"/><circle cx="74" cy="42.5" r="1.2" fill="#FFF"/>{atk&&<><line x1="43" y1="37" x2="55" y2="39" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/><line x1="65" y1="39" x2="77" y2="37" stroke="#3B2517" strokeWidth="2.5" strokeLinecap="round"/></>}</>}{st===CHAR_STATES.IDLE&&<><line x1="44" y1="37" x2="54" y2="38" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/><line x1="66" y1="38" x2="76" y2="37" stroke="#3B2517" strokeWidth="2" strokeLinecap="round"/></>}{crit?<path d="M 54 56 Q 60 53 66 56" fill="none" stroke="#7A4A2E" strokeWidth="1.5"/>:hit?<ellipse cx="60" cy="55" rx="4" ry="3" fill="#2A1A0E"/>:atk?<path d="M 55 53 L 65 53 L 62 56 Z" fill="#2A1A0E"/>:<line x1="54" y1="54" x2="66" y2="54" stroke="#7A4A2E" strokeWidth="1.5"/>}<rect x="30" y="40" width="4" height="12" rx="2" fill="#4A2E14"/><rect x="86" y="40" width="4" height="12" rx="2" fill="#4A2E14"/><path d="M 26 37 L 60 12 L 94 37 L 78 40 L 60 30 L 42 40 Z" fill="#1E2530"/><path d="M 31 37 L 60 17 L 89 37" fill="none" stroke="#E8DCC8" strokeWidth="1.8"/><circle cx="60" cy="23" r="3.5" fill="#B22020"/><circle cx="60" cy="23" r="1.8" fill="#E8DCC8"/></g></svg>);}
function getCS(hp,mx,phase,isP,ok,eDmg){if(isP&&phase==="ANSWER_RESULT"&&ok)return"attack";if(!isP&&phase==="ENEMY_TURN"&&eDmg)return"attack";if(isP&&phase==="ENEMY_TURN"&&eDmg)return"hit";if(!isP&&phase==="ANSWER_RESULT"&&ok)return"hit";if(mx>0&&hp/mx<=0.25&&hp>0)return"critical";return"idle";}

// ─── PNG SPRITE COMPONENT ────────────────────────────────────────────────────
function ColonialSprite({state="idle",size=140}){
  const src=`/sprites/colonial-${state}.png`;
  return <img src={src} alt={`Colonial ${state}`} style={{height:size,width:"auto",imageRendering:"auto",objectFit:"contain",transformOrigin:"bottom center",animation:"idleBob 3.5s ease-in-out infinite"}} onError={e=>{e.target.style.display="none";}}/>;
}
function BritishSprite({state="idle",size=140}){
  const src=`/sprites/british-${state}.png`;
  return <img src={src} alt={`British ${state}`} style={{height:size,width:"auto",imageRendering:"auto",objectFit:"contain",transformOrigin:"bottom center",animation:"idleBob 3.5s ease-in-out infinite",animationDelay:"-1.5s"}} onError={e=>{e.target.style.display="none";}}/>;
}
function PlayerChar({state,size,isColonial=true}){return isColonial?<ColonialSprite state={state} size={size}/>:<ChibiColonial state={state} size={size}/>;}

// ═════════════════════════════════════════════════════════════════════════════
// 3v3 GAME REDUCER
// ═════════════════════════════════════════════════════════════════════════════
function shuffleArray(a){const s=[...a];for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}return s;}
function getSpeedTier(p){return SPEED_TIERS.find(t=>p<=t.maxPercent)||SPEED_TIERS[3];}
function activeUnit(squad){return squad.find(u=>!u.fallen);}
function nextUnit(squad,fallenIdx){return squad.map((u,i)=>i===fallenIdx?{...u,fallen:true}:u);}

function gameReducer(st,action){
  const calcDmg=(base,elapsed,cr)=>{const t=getSpeedTier(elapsed);const c=Math.random()<cr;return{damage:Math.round(base*t.multiplier*(c?CRIT_MULTIPLIER:1)),tier:t,isCrit:c};};
  const advQ=(s)=>{let q=s.questionQueue;let bp=s.bossPhase;if(bp==="review"&&q.length>0&&q[0]._isNew)bp="battle";if(q.length===0)q=shuffleArray(s._allQs||[]);const n=q[0];return{...s,phase:PHASES.PLAYER_TURN,currentQuestion:n,questionQueue:q.slice(1),selectedAnswer:null,wasCorrect:null,damageResult:null,enemyDamageResult:null,bossPhase:bp};};

  switch(action.type){
    case "START":{
      const{battle,squad,playerStats,reviewQs}=action;
      // Build player squad with HP
      const pSquad=squad.map(u=>({...u,hp:Math.round(playerStats.maxHP*u.hpMult*UNIT_HP_SCALE),maxHP:Math.round(playerStats.maxHP*u.hpMult*UNIT_HP_SCALE),baseDmg:Math.round(playerStats.baseDmg*u.dmgMult),fallen:false}));
      // Build enemy squad
      const eSquad=battle.enemies.map(e=>({...e,maxHP:e.hp,fallen:false}));
      // Build question queue
      let allQs,fQ,rQ;
      if(battle.boss&&reviewQs&&reviewQs.length>0){const rv=shuffleArray(reviewQs).map(q=>({...q,_isReview:true}));const nw=shuffleArray(battle.questions).map(q=>({...q,_isNew:true}));const cmb=[...rv,...nw];allQs=[...battle.questions,...reviewQs];fQ=cmb[0];rQ=cmb.slice(1);}
      else{const qs=shuffleArray(battle.questions);allQs=battle.questions;fQ=qs[0];rQ=qs.slice(1);}
      return{phase:PHASES.PLAYER_TURN,pSquad,eSquad,critRate:playerStats.critRate,currentQuestion:fQ,questionQueue:rQ,_allQs:allQs,selectedAnswer:null,wasCorrect:null,damageResult:null,enemyDamageResult:null,turnLog:[],questionsAnswered:0,questionsCorrect:0,coinsEarned:0,stars:0,shakeEnemy:false,shakePlayer:false,bossPhase:battle.boss?"review":null,wrongThisBattle:[],fallenMsg:null};
    }
    case "ANSWER":{
      const{idx,elapsed}=action;const pU=activeUnit(st.pSquad);const eU=activeUnit(st.eSquad);
      const ok=idx===st.currentQuestion.answer;let d=null;let newESquad=[...st.eSquad];let newPSquad=[...st.pSquad];
      if(ok){
        d=calcDmg(pU.baseDmg,elapsed,st.critRate);
        const eIdx=st.eSquad.findIndex(u=>!u.fallen);
        const newHP=Math.max(0,eU.hp-d.damage);
        newESquad[eIdx]={...newESquad[eIdx],hp:newHP,fallen:newHP<=0};
        // Medic heal
        if(pU.special==="heal"){const pIdx=st.pSquad.findIndex(u=>!u.fallen);newPSquad[pIdx]={...newPSquad[pIdx],hp:Math.min(newPSquad[pIdx].maxHP,newPSquad[pIdx].hp+(pU.healAmt||8))};}
      }
      const wrong=ok?st.wrongThisBattle:[...st.wrongThisBattle,st.currentQuestion];
      const healLog=ok&&pU.special==="heal"?` +${pU.healAmt||8}HP`:"";
      const eFell=ok&&newESquad.some((u,i)=>u.fallen&&!st.eSquad[i].fallen);
      return{...st,phase:PHASES.ANSWER_RESULT,selectedAnswer:idx,wasCorrect:ok,damageResult:d,pSquad:newPSquad,eSquad:newESquad,questionsAnswered:st.questionsAnswered+1,questionsCorrect:st.questionsCorrect+(ok?1:0),turnLog:[...st.turnLog,ok?`⚔️ ${pU.name}: ${d.damage}${d.isCrit?" CRIT!":""} → ${eU.name}${healLog}`:`❌ ${pU.name} misses!`],shakeEnemy:ok,wrongThisBattle:wrong,enemyJustFell:eFell};
    }
    case "TIMEOUT":{const pU=activeUnit(st.pSquad);return{...st,phase:PHASES.ANSWER_RESULT,selectedAnswer:-1,wasCorrect:false,damageResult:null,questionsAnswered:st.questionsAnswered+1,turnLog:[...st.turnLog,`⏰ ${pU.name} hesitates!`],wrongThisBattle:[...st.wrongThisBattle,st.currentQuestion]};}
    case "PROCEED":{
      const c={...st,shakeEnemy:false,shakePlayer:false,fallenMsg:null,enemyJustFell:false};
      // All enemies down = VICTORY
      if(!activeUnit(c.eSquad)){const alive=c.pSquad.filter(u=>!u.fallen);const totalHP=alive.reduce((a,u)=>a+u.hp,0);const totalMax=c.pSquad.reduce((a,u)=>a+u.maxHP,0);const r=totalMax>0?totalHP/totalMax:0;const s=r>=0.8?3:r>0.4?2:1;return{...c,phase:PHASES.VICTORY,stars:s,coinsEarned:s*30+c.questionsCorrect*5};}
      // Enemy unit just fell but more remain
      if(st.enemyJustFell&&activeUnit(c.eSquad)){const next=activeUnit(c.eSquad);return{...c,phase:PHASES.UNIT_FALLEN,fallenMsg:`Enemy unit defeated! ${next.name} steps forward!`};}
      if(!c.wasCorrect)return{...c,phase:PHASES.ENEMY_TURN};
      return advQ(c);
    }
    case "DISMISS_FALLEN":return advQ({...st,fallenMsg:null,phase:PHASES.PLAYER_TURN});
    case "ENEMY_ATK":{
      const eU=activeUnit(st.eSquad);if(!eU)return st;
      const dmgBase=st.bossPhase==="review"?(eU.dmg*0.6):eU.dmg;
      const d=Math.round(dmgBase)+Math.floor(Math.random()*6-3);
      const pIdx=st.pSquad.findIndex(u=>!u.fallen);
      let newPSquad=st.pSquad.map((u,i)=>i===pIdx?{...u,hp:Math.max(0,u.hp-d),fallen:Math.max(0,u.hp-d)<=0}:u);
      const log=[...st.turnLog,`🔴 ${eU.name}: ${d} dmg → ${st.pSquad[pIdx].name}`];
      if(!activeUnit(newPSquad))return{...st,pSquad:newPSquad,phase:PHASES.DEFEAT,enemyDamageResult:d,turnLog:log,shakePlayer:true};
      const pFell=newPSquad[pIdx].fallen;
      if(pFell){const next=activeUnit(newPSquad);return{...st,pSquad:newPSquad,enemyDamageResult:d,turnLog:log,shakePlayer:true,phase:PHASES.UNIT_FALLEN,fallenMsg:`${st.pSquad[pIdx].name} has fallen! ${next.name} steps in!`};}
      return{...st,pSquad:newPSquad,enemyDamageResult:d,turnLog:log,shakePlayer:true};
    }
    case "AFTER_ENEMY":return advQ({...st,shakePlayer:false,shakeEnemy:false,fallenMsg:null});
    case "CLEAR":return{...st,shakeEnemy:false,shakePlayer:false};
    default:return st;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FIREBASE + AUTH
// ═════════════════════════════════════════════════════════════════════════════
async function saveUD(uid,d){try{await setDoc(doc(db,"users",uid),d,{merge:true});}catch(e){console.error("Save:",e);}}
async function loadUD(uid){try{const s=await getDoc(doc(db,"users",uid));return s.exists()?s.data():null;}catch(e){return null;}}
function AuthScreen(){const[isL,setIsL]=useState(true);const[em,setEm]=useState("");const[pw,setPw]=useState("");const[nm,setNm]=useState("");const[err,setErr]=useState("");const[ld,setLd]=useState(false);const go=async()=>{setErr("");setLd(true);try{if(isL){await signInWithEmailAndPassword(auth,em,pw);}else{const c=await createUserWithEmailAndPassword(auth,em,pw);if(nm.trim())await updateProfile(c.user,{displayName:nm.trim()});await saveUD(c.user.uid,{coins:0,upgrades:{maxHP:0,baseDmg:0,critRate:0},completed:[],wrongAnswers:[],unlockedUnits:["infantry"],displayName:nm.trim()||"Commander"});}}catch(e){setErr(e.code==="auth/email-already-in-use"?"Email taken":e.code==="auth/invalid-credential"?"Wrong credentials":e.code==="auth/weak-password"?"6+ chars":e.message);}setLd(false);};const iS={width:"100%",padding:"12px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#E0E0E0",fontFamily:fonts.body,fontSize:"0.95rem",outline:"none"};return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",gap:20,padding:24,background:"linear-gradient(180deg,#0d0d1a 0%,#1a1a2e 40%,#16213e 100%)"}}><div style={{fontFamily:fonts.heading,fontSize:"2rem",fontWeight:700,color:"#FFD700"}}>HISTORY LEGENDS</div><div style={{fontFamily:fonts.body,color:"#999"}}>{isL?"Sign in":"Create account"}</div><div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:12}}>{!isL&&<input placeholder="Commander Name" value={nm} onChange={e=>setNm(e.target.value)} style={iS}/>}<input type="email" placeholder="Email" value={em} onChange={e=>setEm(e.target.value)} style={iS}/><input type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} style={iS} onKeyDown={e=>e.key==="Enter"&&go()}/>{err&&<div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#EF5350",textAlign:"center"}}>{err}</div>}<button onClick={go} disabled={ld} style={{...goldBtn,width:"100%",padding:"14px",opacity:ld?0.6:1}}>{ld?"...":(isL?"Sign In":"Create Account")}</button><button onClick={()=>{setIsL(!isL);setErr("");}} style={{background:"none",border:"none",color:"#4FC3F7",fontFamily:fonts.body,fontSize:"0.85rem",cursor:"pointer",padding:8}}>{isL?"Sign up":"Sign in"}</button></div></div>);}

// ═════════════════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════
function Timer({duration,onTimeout,isActive,onTick}){const[r,setR]=useState(duration);const sR=useRef(null),fR=useRef(null);useEffect(()=>{if(!isActive){setR(duration);sR.current=null;return;}sR.current=Date.now();const t=()=>{const e=(Date.now()-sR.current)/1000;const l=Math.max(0,duration-e);setR(l);if(onTick)onTick(e/duration);if(l<=0){onTimeout();return;}fR.current=requestAnimationFrame(t);};fR.current=requestAnimationFrame(t);return()=>cancelAnimationFrame(fR.current);},[isActive,duration,onTimeout,onTick]);const p=(r/duration)*100,uc=r<10?"#D32F2F":r<20?"#F9A825":"#4FC3F7";return(<div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}><span style={{fontFamily:fonts.heading,fontSize:"0.55rem",color:"#9E9E9E",textTransform:"uppercase",letterSpacing:"0.12em"}}>Time</span><span style={{fontFamily:fonts.mono,fontSize:"1rem",color:uc,fontWeight:700,animation:r<10?"pulse 0.5s infinite":"none"}}>{r.toFixed(1)}s</span></div><div style={{background:"rgba(0,0,0,0.4)",borderRadius:4,height:6,overflow:"hidden"}}><div style={{width:`${p}%`,height:"100%",background:`linear-gradient(90deg,${uc},${uc}88)`,borderRadius:3}}/></div></div>);}
function QCard({question,onAnswer,disabled}){const[h,setH]=useState(null);const L=["A","B","C","D"];return(<div style={{background:"linear-gradient(135deg,rgba(28,28,48,0.96),rgba(18,18,36,0.96))",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}><div style={{fontFamily:fonts.body,fontSize:"0.95rem",color:"#E0E0E0",lineHeight:1.5,marginBottom:12,textAlign:"center"}}>{question.text}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>{question.options.map((o,i)=>(<button key={i} disabled={disabled} onClick={()=>onAnswer(i)} onMouseEnter={()=>setH(i)} onMouseLeave={()=>setH(null)} style={{background:h===i&&!disabled?"rgba(79,195,247,0.12)":"rgba(255,255,255,0.03)",border:`1px solid ${h===i&&!disabled?"rgba(79,195,247,0.3)":"rgba(255,255,255,0.06)"}`,borderRadius:8,padding:"9px 10px",color:"#E0E0E0",cursor:disabled?"default":"pointer",fontFamily:fonts.body,fontSize:"0.88rem",textAlign:"left",display:"flex",alignItems:"center",gap:7,opacity:disabled?0.5:1,transition:"all 0.2s"}}><span style={{fontFamily:fonts.heading,fontSize:"0.55rem",color:"#4FC3F7",fontWeight:700,width:18,height:18,borderRadius:"50%",border:"1px solid #4FC3F733",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{L[i]}</span>{o}</button>))}</div></div>);}
function BLog({log}){const r=useRef(null);useEffect(()=>{r.current?.scrollIntoView({behavior:"smooth"});},[log.length]);return(<div style={{background:"rgba(0,0,0,0.25)",borderRadius:6,padding:"6px 8px",maxHeight:70,overflowY:"auto",border:"1px solid rgba(255,255,255,0.04)"}}>{log.length===0?<div style={{fontFamily:fonts.body,fontSize:"0.7rem",color:"#555",fontStyle:"italic"}}>Battle begins...</div>:log.slice(-4).map((e,i)=><div key={i} style={{fontFamily:fonts.mono,fontSize:"0.6rem",color:"#BBB",marginBottom:2,opacity:i<log.slice(-4).length-1?0.45:1}}>{e}</div>)}<div ref={r}/></div>);}

// ─── Squad display for battle screen ─────────────────────────────────────────
function SquadPips({squad,side}){return(<div style={{display:"flex",gap:4,justifyContent:side==="left"?"flex-start":"flex-end"}}>{squad.map((u,i)=>(<div key={i} style={{width:22,height:22,borderRadius:"50%",background:u.fallen?"rgba(239,83,80,0.2)":"rgba(79,195,247,0.15)",border:`1.5px solid ${u.fallen?"#EF535044":"#4FC3F744"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.55rem",opacity:u.fallen?0.4:1}}>{u.fallen?"💀":(u.icon||"•")}</div>))}</div>);}

function MC({children,onClick,accent="#4FC3F7",disabled=false}){const[h,setH]=useState(false);return(<button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:h&&!disabled?"rgba(79,195,247,0.06)":"rgba(255,255,255,0.02)",border:`1px solid ${h&&!disabled?accent+"44":"rgba(255,255,255,0.06)"}`,borderRadius:12,padding:"16px 20px",color:"#E0E0E0",cursor:disabled?"default":"pointer",fontFamily:fonts.body,textAlign:"left",transition:"all 0.25s",display:"flex",alignItems:"center",gap:14,width:"100%",opacity:disabled?0.4:1}}>{children}</button>);}
function BB({onClick}){return<button onClick={onClick} style={{background:"none",border:"none",color:"#9E9E9E",fontFamily:fonts.heading,fontSize:"0.65rem",letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",padding:"6px 0"}}>← Back</button>;}
function ShopBtn({onClick,coins}){return(<button onClick={onClick} style={{position:"fixed",bottom:20,right:20,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:14,padding:"10px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",zIndex:10}}><span style={{fontSize:"1rem"}}>🪙</span><span style={{fontFamily:fonts.mono,fontSize:"0.8rem",color:"#FFD700",fontWeight:700}}>{coins}</span></button>);}

// ═════════════════════════════════════════════════════════════════════════════
// SCREEN COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════
function ShopScreen({onBack,coins,upgrades,onBuy}){return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BB onClick={onBack}/><div style={{textAlign:"center",marginBottom:20}}><div style={{fontFamily:fonts.heading,fontSize:"1.4rem",fontWeight:700,color:"#FFD700"}}>Upgrade Shop</div><div style={{fontFamily:fonts.mono,fontSize:"1rem",color:"#FFD700",marginTop:6}}>🪙 {coins}</div></div><div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:400,margin:"0 auto"}}>{["maxHP","baseDmg","critRate"].map(k=>{const u=UPGRADES[k],lv=upgrades[k],mx=lv>=u.levels.length-1,nc=mx?0:u.costs[lv+1],ca=coins>=nc;return(<div key={k} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"14px 16px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:"1.1rem"}}>{u.icon}</span><span style={{fontFamily:fonts.heading,fontSize:"0.75rem",fontWeight:700,color:"#E0E0E0"}}>{u.label}</span></div><span style={{fontFamily:fonts.mono,fontSize:"0.65rem",color:"#888"}}>Lv {lv+1}/{u.levels.length}</span></div><div style={{display:"flex",gap:3,marginBottom:8}}>{u.levels.map((_,i)=>(<div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=lv?"#4FC3F7":"rgba(255,255,255,0.08)"}}/>))}</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:fonts.mono,fontSize:"0.7rem",color:"#4FC3F7"}}>{u.desc[lv]}{!mx&&` → ${u.desc[lv+1]}`}</span>{mx?<span style={{fontFamily:fonts.heading,fontSize:"0.55rem",color:"#81C784"}}>MAX</span>:<button onClick={()=>ca&&onBuy(k)} style={{...btn(ca?"linear-gradient(135deg,#FFD700,#FFA000)":"rgba(255,255,255,0.05)",ca?"transparent":"rgba(255,255,255,0.1)"),padding:"5px 14px",fontSize:"0.6rem",color:ca?"#1a1a2e":"#666",fontWeight:700,cursor:ca?"pointer":"default",opacity:ca?1:0.5}}>🪙 {nc}</button>}</div></div>);})}</div></div>);}

function UnitSelectScreen({battle,unlockedUnits,coins,onUnlock,onGo,onBack}){
  const[squad,setSquad]=useState([]);
  const addUnit=u=>{if(squad.length<3)setSquad([...squad,u]);};
  const removeUnit=i=>setSquad(squad.filter((_,j)=>j!==i));
  return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BB onClick={onBack}/>
    <div style={{textAlign:"center",marginBottom:12}}><div style={{fontFamily:fonts.heading,fontSize:"0.55rem",letterSpacing:"0.2em",color:"#4FC3F7",textTransform:"uppercase"}}>Build Your Squad</div><div style={{fontFamily:fonts.heading,fontSize:"1.1rem",fontWeight:700,color:"#E0E0E0",marginTop:4}}>{battle.name}</div></div>
    {/* Current squad */}
    <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:16}}>
      {[0,1,2].map(i=>(
        <div key={i} onClick={()=>squad[i]&&removeUnit(i)} style={{width:70,height:80,borderRadius:10,border:`2px dashed ${squad[i]?"rgba(79,195,247,0.4)":"rgba(255,255,255,0.1)"}`,background:squad[i]?"rgba(79,195,247,0.06)":"rgba(255,255,255,0.02)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:squad[i]?"pointer":"default",transition:"all 0.2s"}}>
          {squad[i]?<><span style={{fontSize:"1.4rem"}}>{squad[i].icon}</span><span style={{fontFamily:fonts.heading,fontSize:"0.45rem",color:squad[i].color,marginTop:2}}>{squad[i].name}</span></>:<span style={{fontFamily:fonts.mono,fontSize:"0.6rem",color:"#555"}}>{i+1}</span>}
        </div>
      ))}
    </div>
    <div style={{textAlign:"center",marginBottom:12}}><span style={{fontFamily:fonts.mono,fontSize:"0.7rem",color:squad.length===3?"#81C784":"#999"}}>{squad.length}/3 selected</span></div>
    {/* Enemy preview */}
    <div style={{background:"rgba(211,47,47,0.06)",border:"1px solid rgba(211,47,47,0.15)",borderRadius:10,padding:"8px 14px",marginBottom:14,maxWidth:400,margin:"0 auto 14px"}}><div style={{fontFamily:fonts.heading,fontSize:"0.45rem",letterSpacing:"0.12em",color:"#FF5252",textTransform:"uppercase",marginBottom:4}}>Enemy Forces</div><div style={{display:"flex",gap:8,justifyContent:"center"}}>{battle.enemies.map((e,i)=>(<div key={i} style={{textAlign:"center"}}><span style={{fontSize:"1rem"}}>{e.icon}</span><div style={{fontFamily:fonts.mono,fontSize:"0.5rem",color:"#EF5350"}}>{e.name}</div><div style={{fontFamily:fonts.mono,fontSize:"0.45rem",color:"#888"}}>HP:{e.hp} DMG:{e.dmg}</div></div>))}</div></div>
    {/* Unit roster */}
    <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:400,margin:"0 auto"}}>
      {UNITS.map(u=>{const owned=unlockedUnits.includes(u.id);const canBuy=coins>=u.cost;
        return(<button key={u.id} onClick={()=>owned?addUnit(u):canBuy&&onUnlock(u)} disabled={(!owned&&!canBuy)||squad.length>=3} style={{background:owned?"rgba(79,195,247,0.04)":"rgba(255,255,255,0.02)",border:`1px solid ${owned?"rgba(79,195,247,0.2)":"rgba(255,255,255,0.06)"}`,borderRadius:10,padding:"10px 14px",textAlign:"left",cursor:(owned||canBuy)&&squad.length<3?"pointer":"default",opacity:(!owned&&!canBuy)||squad.length>=3?0.35:1,width:"100%",transition:"all 0.2s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:"1.1rem"}}>{u.icon}</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.7rem",fontWeight:700,color:u.color}}>{u.name}</div><div style={{fontFamily:fonts.body,fontSize:"0.7rem",color:"#999"}}>{u.desc}</div></div></div>
            {!owned&&<span style={{fontFamily:fonts.mono,fontSize:"0.7rem",color:canBuy?"#FFD700":"#666"}}>🪙 {u.cost}</span>}
            {owned&&<span style={{fontFamily:fonts.mono,fontSize:"0.55rem",color:u.color}}>HP×{u.hpMult} DMG×{u.dmgMult}</span>}
          </div>
        </button>);
      })}
    </div>
    {squad.length===3&&<div style={{textAlign:"center",marginTop:16}}><button onClick={()=>onGo(squad)} style={{...goldBtn,padding:"14px 48px",fontSize:"0.9rem"}}>⚔️ Deploy Squad</button></div>}
  </div>);
}

function HomeScreen({onNav,coins,userName,onLogout}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:24,padding:20}}><div style={{fontFamily:fonts.heading,fontSize:"2.2rem",fontWeight:700,color:"#FFD700",textAlign:"center"}}>HISTORY LEGENDS</div><div style={{fontFamily:fonts.body,color:"#9E9E9E"}}>Welcome, <span style={{color:"#4FC3F7"}}>{userName}</span></div><div style={{background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,padding:"10px 24px",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:"1.2rem"}}>🪙</span><span style={{fontFamily:fonts.mono,fontSize:"1.3rem",color:"#FFD700",fontWeight:700}}>{coins}</span></div><div style={{width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:10}}><MC onClick={()=>onNav(SCREENS.US_HISTORY)}><span style={{fontSize:"1.5rem"}}>🇺🇸</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#4FC3F7"}}>US HISTORY</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#888",marginTop:2}}>Revolutionary War</div></div></MC><MC disabled accent="#666"><span style={{fontSize:"1.5rem"}}>🏰</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",color:"#666"}}>EUROPEAN — Coming soon</div></div></MC></div><button onClick={onLogout} style={{background:"none",border:"none",fontFamily:fonts.body,fontSize:"0.8rem",color:"#666",cursor:"pointer",padding:8,marginTop:8}}>Sign Out</button></div>);}
function USScreen({onNav,onBack}){return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BB onClick={onBack}/><div style={{textAlign:"center",marginBottom:24}}><div style={{fontFamily:fonts.heading,fontSize:"1.5rem",fontWeight:700,color:"#E0E0E0"}}>US History</div></div><div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:400,margin:"0 auto"}}><MC onClick={()=>onNav(SCREENS.REV_WAR)}><span style={{fontSize:"1.4rem"}}>⚔️</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#4FC3F7"}}>REVOLUTIONARY WAR</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#888",marginTop:2}}>1775–1783 · 11 Battles</div></div></MC><MC disabled><span style={{fontSize:"1.4rem"}}>🦅</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",color:"#666"}}>CIVIL WAR — Coming soon</div></div></MC></div></div>);}

function MapScreen({onBack,onSelect,completed}){const sR=useRef(null);useEffect(()=>{if(sR.current)sR.current.scrollTop=sR.current.scrollHeight;},[]);const m=REV_WAR_MAP,ns=110,mh=m.length*ns+120,pw=320;const gX=i=>{const c=(m.length-1-i)%6;return[0.5,0.28,0.5,0.72,0.5,0.35][c];};const pts=m.map((_,i)=>({x:gX(i)*pw,y:60+i*ns}));const pD=pts.reduce((a,p,i)=>{if(i===0)return`M ${p.x} ${p.y}`;const pr=pts[i-1];const cy=(pr.y+p.y)/2;return`${a} C ${pr.x} ${cy}, ${p.x} ${cy}, ${p.x} ${p.y}`;},"");
  return(<div style={{height:"100vh",display:"flex",flexDirection:"column",animation:"fadeIn 0.4s ease-out"}}><div style={{padding:"12px 20px 8px",flexShrink:0}}><BB onClick={onBack}/><div style={{textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1.2rem",fontWeight:700,color:"#E0E0E0"}}>Revolutionary War</div></div></div><div ref={sR} style={{flex:1,overflowY:"auto",overflowX:"hidden"}}><div style={{position:"relative",width:"100%",maxWidth:pw,margin:"0 auto",height:mh}}><svg style={{position:"absolute",top:0,left:0,width:pw,height:mh,pointerEvents:"none"}} viewBox={`0 0 ${pw} ${mh}`}><path d={pD} fill="none" stroke="rgba(79,195,247,0.08)" strokeWidth="28" strokeLinecap="round"/><path d={pD} fill="none" stroke="rgba(79,195,247,0.15)" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 6"/></svg><div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",fontFamily:fonts.heading,fontSize:"0.6rem",letterSpacing:"0.2em",color:"#FFD700",opacity:0.5}}>🏆 Independence 🏆</div><div style={{position:"absolute",bottom:15,left:"50%",transform:"translateX(-50%)",fontFamily:fonts.heading,fontSize:"0.55rem",letterSpacing:"0.2em",color:"#4FC3F7"}}>▼ Start ▼</div>
    {m.map((b,i)=>{const pt=pts[i];const bc=BATTLES.find(x=>x.id===b.id);const ic=completed.includes(b.id);const bi=BATTLES.findIndex(x=>x.id===b.id);const av=bi===0||(bi>0&&completed.includes(BATTLES[bi-1].id));const iB=!!b.boss;const iF=b.boss==="FINAL BOSS";const sz=iF?56:iB?48:38;const nc=ic?"#81C784":av?"#4FC3F7":iF?"#FFD700":iB?"#FF8A65":"#444";
      return(<div key={b.id+i} style={{position:"absolute",top:pt.y-sz/2,left:pt.x,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",cursor:(av||ic)&&bc?"pointer":"default",zIndex:av?3:1}} onClick={()=>(av||ic)&&bc&&onSelect(bc)}>
        {iB&&<div style={{fontFamily:fonts.heading,fontSize:"0.42rem",letterSpacing:"0.12em",color:iF?"#FFD700":"#FF8A65",textTransform:"uppercase",marginBottom:2}}>{b.boss}</div>}
        <div style={{width:sz,height:sz,borderRadius:"50%",background:ic?"rgba(129,199,132,0.15)":av?"rgba(79,195,247,0.15)":"rgba(255,255,255,0.02)",border:`2px solid ${ic?"rgba(129,199,132,0.5)":av?nc+"88":nc+"33"}`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>{av&&!ic&&<div style={{position:"absolute",inset:-4,borderRadius:"50%",border:"2px solid rgba(79,195,247,0.3)",animation:"pulse 2s infinite"}}/>}<span style={{fontSize:iF?"1.2rem":iB?"1rem":"0.85rem"}}>{ic?"✅":av?b.icon:"🔒"}</span></div>
        <div style={{textAlign:"center",marginTop:3,maxWidth:110}}><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",fontWeight:700,color:ic?"#81C784":av?"#E0E0E0":"#666",lineHeight:1.2}}>{b.name}</div><div style={{fontFamily:fonts.mono,fontSize:"0.42rem",color:"#555",marginTop:1}}>{b.date}</div></div>
      </div>);})}
  </div></div></div>);}

function PreBattle({battle,onStart,onBack}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:14,padding:20,textAlign:"center",animation:"fadeIn 0.5s ease-out"}}><BB onClick={onBack}/>{battle.boss&&<div style={{fontFamily:fonts.heading,fontSize:"0.65rem",color:"#FF8A65"}}>⚠️ BOSS ⚠️</div>}<div style={{fontFamily:fonts.heading,fontSize:"1.3rem",fontWeight:700,color:"#E0E0E0"}}>{battle.name}</div><div style={{fontFamily:fonts.body,fontSize:"0.85rem",color:"#999"}}>{battle.date}</div>{battle.context&&<div style={{background:"rgba(79,195,247,0.06)",border:"1px solid rgba(79,195,247,0.12)",borderRadius:10,padding:"10px 14px",maxWidth:400}}><div style={{fontFamily:fonts.heading,fontSize:"0.42rem",letterSpacing:"0.1em",color:"#4FC3F7",textTransform:"uppercase",marginBottom:3}}>📜 Context</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#CCC",lineHeight:1.45}}>{battle.context}</div></div>}
    {/* Enemy squad preview */}
    <div style={{background:"rgba(211,47,47,0.06)",border:"1px solid rgba(211,47,47,0.12)",borderRadius:10,padding:"10px 14px",maxWidth:380}}>
      <div style={{fontFamily:fonts.heading,fontSize:"0.42rem",letterSpacing:"0.1em",color:"#FF5252",textTransform:"uppercase",marginBottom:6}}>Enemy Divisions</div>
      <div style={{display:"flex",gap:12,justifyContent:"center"}}>{battle.enemies.map((e,i)=>(<div key={i} style={{textAlign:"center"}}><span style={{fontSize:"1.2rem"}}>{e.icon}</span><div style={{fontFamily:fonts.heading,fontSize:"0.5rem",color:"#E0E0E0",marginTop:2}}>{e.name}</div><div style={{fontFamily:fonts.mono,fontSize:"0.45rem",color:"#999"}}>HP:{e.hp} ATK:{e.dmg}</div></div>))}</div>
    </div>
    {battle.boss&&<div style={{fontFamily:fonts.body,fontSize:"0.75rem",color:"#FF8A65",maxWidth:340}}>Phase 1: Review (reduced dmg) → Phase 2: Boss (full dmg). HP carries over!</div>}
    <button onClick={onStart} style={{...goldBtn,padding:"12px 44px",fontSize:"0.85rem"}}>Build Squad →</button>
  </div>);}
function ResultOvl({wasCorrect,question,selectedAnswer,damageResult,healAmt,onContinue}){return(<div style={{background:"linear-gradient(135deg,rgba(28,28,48,0.97),rgba(18,18,36,0.97))",borderRadius:11,padding:"14px 16px",border:`1px solid ${wasCorrect?"rgba(76,175,80,0.2)":"rgba(211,47,47,0.2)"}`,textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1.2rem",fontWeight:700,color:wasCorrect?"#66BB6A":"#EF5350",marginBottom:5}}>{wasCorrect?"CORRECT!":selectedAnswer===-1?"TIME'S UP!":"WRONG!"}</div>{wasCorrect&&damageResult&&<div style={{marginBottom:8}}><span style={{fontFamily:fonts.mono,fontSize:"1.4rem",color:damageResult.isCrit?"#FFD700":"#4FC3F7",fontWeight:700}}>{damageResult.damage}</span><span style={{fontFamily:fonts.body,fontSize:"0.75rem",color:"#999",marginLeft:4}}>dmg</span>{damageResult.isCrit&&<div style={{fontFamily:fonts.heading,fontSize:"0.55rem",color:"#FFD700",letterSpacing:"0.12em",marginTop:2}}>★ CRIT ★</div>}<div style={{fontFamily:fonts.mono,fontSize:"0.6rem",color:damageResult.tier.color,marginTop:2}}>{damageResult.tier.label} {damageResult.tier.multiplier}×</div>{healAmt>0&&<div style={{fontFamily:fonts.mono,fontSize:"0.6rem",color:"#66BB6A",marginTop:2}}>+{healAmt} HP healed</div>}</div>}{!wasCorrect&&<div style={{marginBottom:8}}><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#81C784",marginBottom:4}}>Answer: <strong>{question.options[question.answer]}</strong></div><div style={{background:"rgba(79,195,247,0.06)",border:"1px solid rgba(79,195,247,0.1)",borderRadius:7,padding:"6px 10px"}}><div style={{fontFamily:fonts.heading,fontSize:"0.4rem",letterSpacing:"0.1em",color:"#4FC3F7",textTransform:"uppercase",marginBottom:2}}>📝 Remember</div><div style={{fontFamily:fonts.body,fontSize:"0.75rem",color:"#CCC",lineHeight:1.4}}>{question.explanation}</div></div></div>}<button onClick={onContinue} style={blueBtn}>Continue</button></div>);}
function EnemyOvl({damage,name,onContinue}){return(<div style={{background:"linear-gradient(135deg,rgba(48,18,18,0.97),rgba(36,12,12,0.97))",borderRadius:11,padding:"14px 16px",border:"1px solid rgba(211,47,47,0.2)",textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"0.95rem",fontWeight:700,color:"#EF5350",marginBottom:4}}>ENEMY ATTACKS!</div><div style={{fontFamily:fonts.body,fontSize:"0.82rem",color:"#E0E0E0",marginBottom:4}}>{name} strikes!</div><span style={{fontFamily:fonts.mono,fontSize:"1.4rem",color:"#EF5350",fontWeight:700}}>-{damage}</span><span style={{fontFamily:fonts.body,fontSize:"0.75rem",color:"#999",marginLeft:4}}>HP</span><div style={{marginTop:10}}><button onClick={onContinue} style={blueBtn}>Continue</button></div></div>);}
function FallenOvl({msg,onContinue}){return(<div style={{background:"linear-gradient(135deg,rgba(28,28,48,0.97),rgba(18,18,36,0.97))",borderRadius:11,padding:"16px 18px",border:"1px solid rgba(255,215,0,0.2)",textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1rem",fontWeight:700,color:"#FFD700",marginBottom:8}}>⚔️ UNIT DOWN ⚔️</div><div style={{fontFamily:fonts.body,fontSize:"0.9rem",color:"#E0E0E0",lineHeight:1.4,marginBottom:12}}>{msg}</div><button onClick={onContinue} style={blueBtn}>Continue</button></div>);}
function VScreen({state,battle,onRestart,onMenu,onShop}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:14,padding:24,textAlign:"center",animation:"fadeIn 0.8s ease-out"}}><div style={{fontFamily:fonts.heading,fontSize:"2rem",fontWeight:700,color:"#FFD700"}}>VICTORY</div><div style={{fontSize:"2rem",letterSpacing:"0.2em",color:"#FFD700"}}>{"★".repeat(state.stars)+"☆".repeat(3-state.stars)}</div><div style={{fontFamily:fonts.body,fontSize:"1rem",color:"#E0E0E0"}}>{battle.general} defeated!</div><div style={{background:"rgba(0,0,0,0.25)",borderRadius:10,padding:"12px 24px",border:"1px solid rgba(255,215,0,0.12)"}}><div style={{display:"flex",gap:22,justifyContent:"center"}}><div><div style={{fontFamily:fonts.mono,fontSize:"1.2rem",color:"#4FC3F7",fontWeight:700}}>{state.questionsCorrect}/{state.questionsAnswered}</div><div style={{fontFamily:fonts.body,fontSize:"0.6rem",color:"#999"}}>Correct</div></div><div><div style={{fontFamily:fonts.mono,fontSize:"1.2rem",color:"#FFD700",fontWeight:700}}>🪙 {state.coinsEarned}</div><div style={{fontFamily:fonts.body,fontSize:"0.6rem",color:"#999"}}>Coins</div></div></div></div><div style={{display:"flex",gap:8}}><button onClick={onRestart} style={goldBtn}>Again</button><button onClick={onShop} style={{...btn("linear-gradient(135deg,#2E7D32,#1B5E20)","rgba(129,199,132,0.3)"),color:"#E0E0E0",fontWeight:700}}>Shop</button><button onClick={onMenu} style={blueBtn}>Map</button></div></div>);}
function DScreen({state,battle,onRestart,onMenu}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"80vh",gap:14,padding:24,textAlign:"center",animation:"fadeIn 0.8s ease-out"}}><div style={{fontFamily:fonts.heading,fontSize:"2rem",fontWeight:700,color:"#EF5350"}}>DEFEAT</div><div style={{fontSize:"2rem"}}>💀</div><div style={{fontFamily:fonts.body,fontSize:"1rem",color:"#E0E0E0"}}>Fell to {battle.general}.</div><div style={{fontFamily:fonts.body,fontSize:"0.85rem",color:"#999"}}>{state.questionsCorrect}/{state.questionsAnswered} correct</div><div style={{display:"flex",gap:8}}><button onClick={onRestart} style={redBtn}>Retry</button><button onClick={onMenu} style={blueBtn}>Map</button></div></div>);}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════════════════════
export default function HistoryLegends(){
  const[user,setUser]=useState(null);const[authLd,setAL]=useState(true);
  const[screen,setScreen]=useState(SCREENS.HOME);
  const[state,dispatch]=useReducer(gameReducer,{phase:"IDLE"});
  const[coins,setCoins]=useState(0);
  const[upgrades,setUpgrades]=useState({maxHP:0,baseDmg:0,critRate:0});
  const[completed,setCompleted]=useState([]);
  const[wrongAll,setWA]=useState([]);
  const[unlockedUnits,setUU]=useState(["infantry"]);
  const[curBattle,setCB]=useState(BATTLES[0]);
  const[curSquad,setCS]=useState([]);
  const[dLoaded,setDL]=useState(false);
  const eR=useRef(0);const sT=useRef(null);

  const pStats={maxHP:UPGRADES.maxHP.levels[upgrades.maxHP],baseDmg:UPGRADES.baseDmg.levels[upgrades.baseDmg],critRate:UPGRADES.critRate.levels[upgrades.critRate]};

  useEffect(()=>{const u=onAuthStateChanged(auth,u=>{setUser(u);setAL(false);});return u;},[]);
  useEffect(()=>{if(!user){setDL(false);return;}(async()=>{const d=await loadUD(user.uid);if(d){setCoins(d.coins||0);setUpgrades(d.upgrades||{maxHP:0,baseDmg:0,critRate:0});setCompleted(d.completed||[]);setWA((d.wrongAnswers||[]).filter(q=>q?.text));setUU(d.unlockedUnits||["infantry"]);}setDL(true);})();},[user]);
  const saveFS=useCallback(()=>{if(!user||!dLoaded)return;if(sT.current)clearTimeout(sT.current);sT.current=setTimeout(()=>{saveUD(user.uid,{coins,upgrades,completed,wrongAnswers:wrongAll.map(q=>({text:q.text,options:q.options,answer:q.answer,explanation:q.explanation})),unlockedUnits,displayName:user.displayName||"Commander",lastSaved:new Date().toISOString()});},1000);},[user,dLoaded,coins,upgrades,completed,wrongAll,unlockedUnits]);
  useEffect(()=>{saveFS();},[coins,upgrades,completed,wrongAll,unlockedUnits]);

  const hAns=useCallback(i=>{if(state.phase!==PHASES.PLAYER_TURN)return;dispatch({type:"ANSWER",idx:i,elapsed:eR.current});},[state.phase]);
  const hTO=useCallback(()=>{if(state.phase!==PHASES.PLAYER_TURN)return;dispatch({type:"TIMEOUT"});},[state.phase]);
  const hTick=useCallback(p=>{eR.current=p;},[]);

  useEffect(()=>{if(state.phase===PHASES.ENEMY_TURN&&!state.enemyDamageResult){const t=setTimeout(()=>dispatch({type:"ENEMY_ATK"}),600);return()=>clearTimeout(t);}},[state.phase,state.enemyDamageResult]);
  useEffect(()=>{if(state.shakeEnemy||state.shakePlayer){const t=setTimeout(()=>dispatch({type:"CLEAR"}),500);return()=>clearTimeout(t);}},[state.shakeEnemy,state.shakePlayer]);
  useEffect(()=>{
    if(state.phase===PHASES.VICTORY&&state.coinsEarned>0){setCoins(c=>c+state.coinsEarned);if(!completed.includes(curBattle.id))setCompleted(c=>[...c,curBattle.id]);}
    if((state.phase===PHASES.VICTORY||state.phase===PHASES.DEFEAT)&&state.wrongThisBattle?.length>0){setWA(p=>{const n=[...p];state.wrongThisBattle.forEach(q=>{if(q&&!n.find(w=>w.text===q.text))n.push(q);});return n;});}
  },[state.phase]);

  const startBattle=(battle,squad)=>{
    let rv=null;
    if(battle.boss){const wQ=wrongAll.filter(q=>q&&!battle.questions.find(b=>b.text===q.text));const pB=BATTLES.filter(b=>b.id!==battle.id&&!b.boss);const pQs=pB.flatMap(b=>b.questions);const nW=pQs.filter(q=>!wQ.find(w=>w.text===q.text));rv=[...wQ,...shuffleArray(nW).slice(0,Math.max(0,6-wQ.length))].slice(0,8);}
    setCS(squad);dispatch({type:"START",battle,squad,playerStats:pStats,reviewQs:rv});setScreen(SCREENS.BATTLE);
  };
  const goMap=()=>setScreen(SCREENS.REV_WAR);
  const goMenu=()=>setScreen(SCREENS.HOME);
  const logout=async()=>{await signOut(auth);setCoins(0);setUpgrades({maxHP:0,baseDmg:0,critRate:0});setCompleted([]);setWA([]);setUU(["infantry"]);};
  const buyUpg=k=>{const u=UPGRADES[k],lv=upgrades[k];if(lv>=u.levels.length-1)return;const c=u.costs[lv+1];if(coins<c)return;setCoins(v=>v-c);setUpgrades(v=>({...v,[k]:v[k]+1}));};
  const unlockU=u=>{if(coins<u.cost||unlockedUnits.includes(u.id))return;setCoins(c=>c-u.cost);setUU(v=>[...v,u.id]);};

  const pU=state.pSquad?activeUnit(state.pSquad):null;
  const eU=state.eSquad?activeUnit(state.eSquad):null;
  const ps=pU?getCS(pU.hp,pU.maxHP,state.phase,true,state.wasCorrect,!!state.enemyDamageResult):"idle";
  const es=eU?getCS(eU.hp,eU.maxHP,state.phase,false,state.wasCorrect,!!state.enemyDamageResult):"idle";

  if(authLd)return(<div style={{minHeight:"100vh",background:"#0d0d1a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontFamily:fonts.heading,color:"#FFD700",animation:"pulse 1s infinite"}}>Loading...</div></div>);
  if(!user)return<AuthScreen/>;
  if(!dLoaded)return(<div style={{minHeight:"100vh",background:"#0d0d1a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontFamily:fonts.heading,color:"#4FC3F7",animation:"pulse 1s infinite"}}>Loading save...</div></div>);

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#0d0d1a 0%,#1a1a2e 40%,#16213e 100%)",color:"#E0E0E0",fontFamily:fonts.body,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 20% 30%,rgba(79,195,247,0.03) 0%,transparent 50%),radial-gradient(circle at 80% 70%,rgba(198,40,40,0.03) 0%,transparent 50%)",pointerEvents:"none"}}/>
      <div style={{maxWidth:600,margin:"0 auto",padding:16,position:"relative",zIndex:1,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
        {screen!==SCREENS.BATTLE&&screen!==SCREENS.REV_WAR&&<div style={{textAlign:"center",padding:"8px 0 10px",borderBottom:"1px solid rgba(255,255,255,0.04)",marginBottom:12}}><div style={{fontFamily:fonts.heading,fontSize:"1.15rem",fontWeight:700,letterSpacing:"0.1em",color:"#FFD700",cursor:"pointer"}} onClick={goMenu}>HISTORY LEGENDS</div></div>}
        {screen!==SCREENS.BATTLE&&screen!==SCREENS.SHOP&&<ShopBtn onClick={()=>setScreen(SCREENS.SHOP)} coins={coins}/>}
        <div style={{flex:1}}>
          {screen===SCREENS.HOME&&<HomeScreen onNav={setScreen} coins={coins} userName={user.displayName||"Commander"} onLogout={logout}/>}
          {screen===SCREENS.US_HISTORY&&<USScreen onNav={setScreen} onBack={()=>setScreen(SCREENS.HOME)}/>}
          {screen===SCREENS.REV_WAR&&<MapScreen onBack={()=>setScreen(SCREENS.US_HISTORY)} onSelect={b=>{setCB(b);setScreen(SCREENS.PRE_BATTLE);}} completed={completed}/>}
          {screen===SCREENS.SHOP&&<ShopScreen onBack={()=>setScreen(SCREENS.HOME)} coins={coins} upgrades={upgrades} onBuy={buyUpg}/>}
          {screen===SCREENS.PRE_BATTLE&&<PreBattle battle={curBattle} onStart={()=>setScreen(SCREENS.UNIT_SELECT)} onBack={goMap}/>}
          {screen===SCREENS.UNIT_SELECT&&<UnitSelectScreen battle={curBattle} unlockedUnits={unlockedUnits} coins={coins} onUnlock={unlockU} onGo={sq=>startBattle(curBattle,sq)} onBack={()=>setScreen(SCREENS.PRE_BATTLE)}/>}

          {screen===SCREENS.BATTLE&&<>
            {state.phase===PHASES.VICTORY&&<VScreen state={state} battle={curBattle} onRestart={()=>setScreen(SCREENS.UNIT_SELECT)} onMenu={goMap} onShop={()=>setScreen(SCREENS.SHOP)}/>}
            {state.phase===PHASES.DEFEAT&&<DScreen state={state} battle={curBattle} onRestart={()=>setScreen(SCREENS.UNIT_SELECT)} onMenu={goMap}/>}
            {state.phase!==PHASES.VICTORY&&state.phase!==PHASES.DEFEAT&&state.pSquad&&state.eSquad&&<>
              {/* Header */}
              <div style={{textAlign:"center",padding:"3px 0 5px",flexShrink:0}}>
                <div style={{fontFamily:fonts.heading,fontSize:"0.48rem",letterSpacing:"0.18em",color:"#555",textTransform:"uppercase"}}>{curBattle.name} · {state.questionsCorrect}/{state.questionsAnswered}</div>
                {state.bossPhase&&<div style={{fontFamily:fonts.heading,fontSize:"0.48rem",marginTop:2,padding:"2px 10px",borderRadius:5,display:"inline-block",background:state.bossPhase==="review"?"rgba(79,195,247,0.1)":"rgba(255,138,101,0.1)",color:state.bossPhase==="review"?"#4FC3F7":"#FF8A65"}}>{state.bossPhase==="review"?"📖 REVIEW":"⚔️ BOSS"}</div>}
              </div>

              {/* ═══ 3v3 BATTLEFIELD ═══ */}
              <div style={{position:"relative",width:"100%",height:250,borderRadius:14,overflow:"hidden",marginBottom:8,flexShrink:0,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#4a6e8a 0%,#6d9ab5 30%,#8bb5c9 50%,#a8c8a0 65%,#5a8a3c 72%,#4a7a2e 100%)"}}/>
                <div style={{position:"absolute",top:12,left:"15%",width:55,height:18,borderRadius:18,background:"rgba(255,255,255,0.22)"}}/>
                <div style={{position:"absolute",top:22,left:"58%",width:70,height:20,borderRadius:18,background:"rgba(255,255,255,0.18)"}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:"35%",background:"linear-gradient(180deg,#4a7a2e,#3d6b24)",borderTop:"2px solid #5a8a3c"}}/>

                {/* Player squad (left side) — 3 units staggered */}
                <div style={{position:"absolute",bottom:"4%",left:"2%",display:"flex",gap:2,alignItems:"flex-end",zIndex:2,animation:state.shakePlayer?"shakeHit 0.4s ease-out":"none"}}>
                  {state.pSquad.map((u,i)=>{
                    const isActive=!u.fallen&&state.pSquad.findIndex(x=>!x.fallen)===i;
                    const sz=isActive?95:70;
                    const uState=isActive?ps:"idle";
                    return(<div key={`p${i}`} style={{display:"flex",flexDirection:"column",alignItems:"center",opacity:u.fallen?0.35:1,filter:u.fallen?"grayscale(1)":"none",transition:"all 0.3s",marginBottom:isActive?0:-5,zIndex:isActive?3:1}}>
                      {/* Mini HP bar */}
                      <div style={{width:sz-10,marginBottom:2}}>
                        <div style={{fontFamily:fonts.mono,fontSize:"0.35rem",color:u.fallen?"#888":u.color||"#42A5F5",textAlign:"center",textShadow:"0 1px 2px rgba(0,0,0,0.6)",marginBottom:1}}>{u.icon}{isActive?" ▶":""}</div>
                        <div style={{background:"rgba(0,0,0,0.6)",borderRadius:3,height:10,overflow:"hidden",border:`1px solid ${u.fallen?"#55555544":"rgba(66,165,245,0.3)"}`,position:"relative"}}>
                          <div style={{width:`${u.maxHP>0?Math.max(0,(u.hp/u.maxHP)*100):0}%`,height:"100%",background:u.fallen?"#555":`linear-gradient(90deg,${u.hp/u.maxHP>0.5?"#1565C0":"#D32F2F"},#42A5F5)`,borderRadius:2,transition:"width 0.5s"}}/>
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:fonts.mono,fontSize:"0.38rem",color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.8)",fontWeight:700}}>{u.fallen?"☠":u.hp}</div>
                        </div>
                      </div>
                      <div style={{filter:isActive?"drop-shadow(2px 3px 5px rgba(0,0,0,0.4))":"drop-shadow(1px 2px 3px rgba(0,0,0,0.3))"}}><PlayerChar state={u.fallen?"critical":uState} size={sz}/></div>
                      {u.fallen&&<div style={{position:"absolute",top:"40%",fontSize:"1.2rem"}}>💀</div>}
                    </div>);
                  })}
                </div>

                {/* Enemy squad (right side) — 3 units staggered */}
                <div style={{position:"absolute",bottom:"4%",right:"2%",display:"flex",flexDirection:"row-reverse",gap:2,alignItems:"flex-end",zIndex:2,animation:state.shakeEnemy?"shakeHit 0.4s ease-out":"none"}}>
                  {state.eSquad.map((u,i)=>{
                    const isActive=!u.fallen&&state.eSquad.findIndex(x=>!x.fallen)===i;
                    const sz=isActive?95:70;
                    const uState=isActive?es:"idle";
                    return(<div key={`e${i}`} style={{display:"flex",flexDirection:"column",alignItems:"center",opacity:u.fallen?0.35:1,filter:u.fallen?"grayscale(1)":"none",transition:"all 0.3s",marginBottom:isActive?0:-5,zIndex:isActive?3:1}}>
                      <div style={{width:sz-10,marginBottom:2}}>
                        <div style={{fontFamily:fonts.mono,fontSize:"0.35rem",color:u.fallen?"#888":"#FF5252",textAlign:"center",textShadow:"0 1px 2px rgba(0,0,0,0.6)",marginBottom:1}}>{u.icon}{isActive?" ▶":""}</div>
                        <div style={{background:"rgba(0,0,0,0.6)",borderRadius:3,height:10,overflow:"hidden",border:`1px solid ${u.fallen?"#55555544":"rgba(255,82,82,0.3)"}`,position:"relative"}}>
                          <div style={{width:`${u.maxHP>0?Math.max(0,(u.hp/u.maxHP)*100):0}%`,height:"100%",background:u.fallen?"#555":`linear-gradient(90deg,${u.hp/u.maxHP>0.5?"#C62828":"#D32F2F"},#FF5252)`,borderRadius:2,transition:"width 0.5s"}}/>
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:fonts.mono,fontSize:"0.38rem",color:"#fff",textShadow:"0 1px 2px rgba(0,0,0,0.8)",fontWeight:700}}>{u.fallen?"☠":u.hp}</div>
                        </div>
                      </div>
                      <div style={{filter:isActive?"drop-shadow(2px 3px 5px rgba(0,0,0,0.4))":"drop-shadow(1px 2px 3px rgba(0,0,0,0.3))",transform:"scaleX(-1)"}}><BritishSprite state={u.fallen?"critical":uState} size={sz}/></div>
                      {u.fallen&&<div style={{position:"absolute",top:"40%",fontSize:"1.2rem"}}>💀</div>}
                    </div>);
                  })}
                </div>

                {/* Damage floaters */}
                {state.phase==="ANSWER_RESULT"&&state.wasCorrect&&state.damageResult&&(<div style={{position:"absolute",top:"15%",right:"25%",zIndex:5,animation:"floatUp 1s ease-out",pointerEvents:"none"}}><span style={{fontFamily:fonts.mono,fontSize:state.damageResult.isCrit?"1.5rem":"1.1rem",fontWeight:700,color:state.damageResult.isCrit?"#FFD700":"#4FC3F7",textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>-{state.damageResult.damage}</span></div>)}
                {state.phase==="ENEMY_TURN"&&state.enemyDamageResult&&(<div style={{position:"absolute",top:"15%",left:"18%",zIndex:5,animation:"floatUp 1s ease-out",pointerEvents:"none"}}><span style={{fontFamily:fonts.mono,fontSize:"1.1rem",fontWeight:700,color:"#EF5350",textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>-{state.enemyDamageResult}</span></div>)}
              </div>

              {/* ═══ QUESTION UI ═══ */}
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,minHeight:0,overflowY:"auto"}}>
                {state.phase===PHASES.PLAYER_TURN&&<><Timer duration={TIMER_DURATION} onTimeout={hTO} isActive={true} onTick={hTick}/><QCard question={state.currentQuestion} onAnswer={hAns} disabled={false}/></>}
                {state.phase===PHASES.ANSWER_RESULT&&<ResultOvl wasCorrect={state.wasCorrect} question={state.currentQuestion} selectedAnswer={state.selectedAnswer} damageResult={state.damageResult} healAmt={state.wasCorrect&&pU?.special==="heal"?(pU.healAmt||8):0} onContinue={()=>dispatch({type:"PROCEED"})}/>}
                {state.phase===PHASES.UNIT_FALLEN&&<FallenOvl msg={state.fallenMsg} onContinue={()=>dispatch({type:"DISMISS_FALLEN"})}/>}
                {state.phase===PHASES.ENEMY_TURN&&state.enemyDamageResult&&<EnemyOvl damage={state.enemyDamageResult} name={eU?eU.name:curBattle.general} onContinue={()=>dispatch({type:"AFTER_ENEMY"})}/>}
                {state.phase===PHASES.ENEMY_TURN&&!state.enemyDamageResult&&<div style={{textAlign:"center",padding:16,fontFamily:fonts.heading,fontSize:"0.85rem",color:"#EF5350",animation:"pulse 0.8s infinite"}}>Enemy attacking...</div>}
                <div style={{marginTop:"auto",paddingTop:4}}><BLog log={state.turnLog}/></div>
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
        @keyframes floatUp{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-35px)}}
        @keyframes idleBob{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.015)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
        button:hover{filter:brightness(1.08);transform:translateY(-1px)}button:active{transform:translateY(0)}
        input:focus{border-color:rgba(79,195,247,0.5)!important;box-shadow:0 0 8px rgba(79,195,247,0.15)}
      `}</style>
    </div>
  );
}
