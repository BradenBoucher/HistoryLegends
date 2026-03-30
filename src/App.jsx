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
const SCREENS = { AUTH:"AUTH", HOME:"HOME", US_HISTORY:"US_HISTORY", REV_WAR:"REV_WAR", WW2:"WW2", PRE_BATTLE:"PRE_BATTLE", UNIT_SELECT:"UNIT_SELECT", BATTLE:"BATTLE", SHOP:"SHOP" };
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


// ═══════════════════════════════════════════════════════════════════════════════
// REVOLUTIONARY WAR QUESTION BANKS — APUSH Period 3 (1754–1800)
// Mix of Layer 1 (factual), Layer 2 (causation/significance), Layer 3 (sourcing)
// ═══════════════════════════════════════════════════════════════════════════════

const Q_LEXINGTON = [
  {text:"In what year did the Battles of Lexington and Concord take place?",options:["1774","1775","1776","1773"],answer:1,explanation:"Fought on April 19, 1775 — the first military engagements of the Revolution."},
  {text:"What was the primary British objective of the march to Concord?",options:["Arrest colonial governors","Seize colonial weapons and supplies","Establish a new fort","Collect overdue taxes"],answer:1,explanation:"British aimed to confiscate military supplies stockpiled by colonists."},
  {text:"Why did colonial leaders view the British march as especially threatening?",options:["It targeted civilian homes","It aimed to disarm them, removing their ability to resist","It was led by the King personally","It violated a formal ceasefire"],answer:1,explanation:"Disarmament would eliminate the colonists' capacity for organized resistance."},
  {text:"Who is credited with the famous midnight ride warning of British approach?",options:["Benjamin Franklin","John Adams","Paul Revere","Thomas Jefferson"],answer:2,explanation:"Revere rode from Boston to Lexington on April 18, 1775."},
  {text:"What were Minutemen?",options:["Continental Army regulars","Militia pledged to be ready at a minute's notice","British spies","Volunteer firefighters"],answer:1,explanation:"Minutemen were specially trained militia who could mobilize rapidly."},
  {text:"The first shot at Lexington is often called what?",options:["Shot of Freedom","Opening Salvo","Shot Heard Round the World","First Volley"],answer:2,explanation:"Phrase coined by Ralph Waldo Emerson — it symbolized the global significance of the revolt."},
  {text:"How did the fighting at Lexington and Concord change colonial views on reconciliation?",options:["Made peace more likely","Had no political effect","Made armed resistance seem necessary","Led to immediate independence"],answer:2,explanation:"Bloodshed made reconciliation with Britain seem increasingly impossible."},
  {text:"What signal warned colonists of the British route?",options:["Cannon shots","Flag signals","Lanterns in Old North Church","Drum patterns"],answer:2,explanation:"Two lanterns meant 'by sea' — the British crossed by boat to Cambridge."},
  {text:"Where did militia inflict heavy casualties on retreating British?",options:["Boston Harbor","Bunker Hill","Along the road back to Boston","Philadelphia"],answer:2,explanation:"Colonists fired from behind trees and stone walls during the long retreat."},
  {text:"Why do historians treat Lexington and Concord as a 'point of no return'?",options:["The Declaration was signed there","British forces surrendered","Violence made political compromise extremely difficult","France immediately allied with colonists"],answer:2,explanation:"Once blood was shed on both sides, the path to war became nearly inevitable."},
  {text:"What 1774 British acts directly fueled colonial anger before the battle?",options:["Stamp Act","Intolerable Acts","Townshend Acts","Navigation Acts"],answer:1,explanation:"The Intolerable Acts punished Massachusetts for the Boston Tea Party, escalating tensions."},
  {text:"About how many British soldiers marched toward Concord?",options:["250","700","1,500","3,000"],answer:1,explanation:"About 700 British regulars, outnumbering the initial militia at Lexington."},
];

const Q_TICONDEROGA = [
  {text:"Who led the colonial capture of Fort Ticonderoga?",options:["George Washington","Ethan Allen","John Adams","Nathanael Greene"],answer:1,explanation:"Ethan Allen led the surprise dawn attack in May 1775."},
  {text:"What militia group did Ethan Allen lead?",options:["Minutemen","Continental Army","Green Mountain Boys","Sons of Liberty"],answer:2,explanation:"The Green Mountain Boys were a Vermont militia."},
  {text:"What was the key strategic value of capturing Ticonderoga?",options:["It held political prisoners","It contained artillery and cannons","It was a major naval base","It had gold reserves"],answer:1,explanation:"The fort's cannons would later prove decisive at Boston."},
  {text:"Who transported the captured cannons to Boston?",options:["Paul Revere","Henry Knox","Benedict Arnold","Ethan Allen"],answer:1,explanation:"Henry Knox moved 60 tons of artillery overland in winter — a remarkable feat."},
  {text:"On what body of water did Ticonderoga sit?",options:["Hudson River","Lake Champlain","Lake Ontario","Atlantic Ocean"],answer:1,explanation:"It controlled the southern end of Lake Champlain — a key invasion route."},
  {text:"Why was the capture so easy despite the fort's strong defenses?",options:["French helped attack","Only about 48 British soldiers garrisoned it","Cannons malfunctioned","A traitor opened the gates"],answer:1,explanation:"The tiny garrison was completely surprised by the dawn raid."},
  {text:"Who also arrived with a Massachusetts commission to lead the attack?",options:["George Washington","Benedict Arnold","John Hancock","Thomas Jefferson"],answer:1,explanation:"Arnold arrived claiming authority — creating a leadership dispute with Allen."},
  {text:"How did the captured cannons later change the war?",options:["They sank British ships","They were placed on Dorchester Heights, forcing British from Boston","They were sold to France","They were never used"],answer:1,explanation:"Knox's cannons on Dorchester Heights made the British position in Boston untenable."},
];

const Q_BUNKER = [
  {text:"Where did the actual fighting at 'Bunker Hill' mostly take place?",options:["Bunker Hill","Breed's Hill","Dorchester Heights","Castle Island"],answer:1,explanation:"Fighting occurred on Breed's Hill, closer to Boston Harbor."},
  {text:"What famous order was given about when to fire?",options:["Fire at will","Shoot to kill","Don't fire until you see the whites of their eyes","Hold the line"],answer:2,explanation:"Attributed to Col. Prescott — it preserved scarce ammunition."},
  {text:"How many times did the British assault the hill?",options:["1","2","3","4"],answer:2,explanation:"Three assaults — the first two were repulsed with heavy British casualties."},
  {text:"Why might Bunker Hill be called a 'defeat that felt like a victory' for colonists?",options:["They captured British officers","The massive British casualties proved colonists could fight regulars","They held the hill permanently","Britain offered peace terms after"],answer:1,explanation:"Despite losing the position, inflicting ~1,000 British casualties proved colonial fighting capability."},
  {text:"What did the high British casualty count suggest about their assumptions?",options:["Their intelligence was correct","They underestimated colonial fighting ability","Their navy was too weak","They had superior numbers"],answer:1,explanation:"Britain assumed untrained militia would scatter — Bunker Hill shattered that assumption."},
  {text:"What American leader was killed during the British final assault?",options:["George Washington","Dr. Joseph Warren","Henry Knox","Nathanael Greene"],answer:1,explanation:"Warren was a prominent political and military figure — his death was a significant loss."},
  {text:"Who commanded the British assault forces?",options:["Gen. Gage","Gen. William Howe","Gen. Cornwallis","Gen. Burgoyne"],answer:1,explanation:"Gen. Howe led the attacks and was reportedly shaken by the casualties."},
  {text:"How did Bunker Hill affect the likelihood of peaceful resolution?",options:["Increased it","Decreased it significantly","Had no effect","Led to immediate negotiations"],answer:1,explanation:"Heavy casualties on both sides made compromise increasingly unlikely."},
  {text:"What did colonials build overnight on Breed's Hill?",options:["A stone fort","A redoubt (earthwork fortification)","A wooden stockade","A trench network"],answer:1,explanation:"They constructed earthworks in a single night — surprising the British at dawn."},
];

const Q_BOSTON = [
  {text:"Approximately how long did the Siege of Boston last?",options:["3 months","6 months","11 months","2 years"],answer:2,explanation:"From April 1775 to March 1776 — about 11 months."},
  {text:"What strategic position did Washington fortify to force the British out?",options:["Bunker Hill","Dorchester Heights","Castle William","Fort Independence"],answer:1,explanation:"Dorchester Heights overlooked Boston — cannons there could devastate the city and harbor."},
  {text:"Where did the Dorchester Heights cannons come from?",options:["France","Fort Ticonderoga","Philadelphia","Local foundries"],answer:1,explanation:"Henry Knox's winter expedition dragged them from captured Ticonderoga."},
  {text:"Who took command of the Continental Army during the siege?",options:["Ethan Allen","Gen. Howe","George Washington","John Adams"],answer:2,explanation:"Washington arrived in July 1775 to organize the army besieging Boston."},
  {text:"When did the British evacuate Boston?",options:["January 1776","March 17, 1776","July 4, 1776","December 1776"],answer:1,explanation:"March 17 — still celebrated as Evacuation Day in Boston."},
  {text:"Where did the British fleet withdraw to?",options:["New York","London","Halifax, Nova Scotia","Charleston"],answer:2,explanation:"The fleet sailed to Halifax to regroup."},
  {text:"What influential pamphlet galvanized colonists during the siege?",options:["The Federalist Papers","Common Sense by Thomas Paine","Poor Richard's Almanack","The Rights of Man"],answer:1,explanation:"Published January 1776, it argued powerfully for complete independence."},
  {text:"Why was the siege significant beyond just liberating Boston?",options:["It proved Washington could organize an effective army","It ended the war","It secured French alliance","It captured the British king"],answer:0,explanation:"Washington transformed a disorganized militia into a functional fighting force during the siege."},
];

const Q_LONGISLAND = [
  {text:"When was the Battle of Long Island fought?",options:["June 1776","August 27, 1776","October 1776","December 1776"],answer:1,explanation:"August 27, 1776 — weeks after the Declaration of Independence."},
  {text:"What made this the largest battle of the entire Revolution?",options:["Most cannons used","Most troops engaged (~40,000 total)","Longest duration","Most territory changed hands"],answer:1,explanation:"About 32,000 British/Hessian and 10,000+ Americans — the war's largest engagement."},
  {text:"How did Washington save his army after the defeat?",options:["Fought through British lines","Masterful nighttime boat evacuation","Negotiated a ceasefire","Surrendered and was paroled"],answer:1,explanation:"Under cover of fog and darkness, the army crossed the East River — saving the Revolution."},
  {text:"What geographic feature did the British use to flank the Americans?",options:["Hudson River","Jamaica Pass","Central Park","Harlem Heights"],answer:1,explanation:"The unguarded Jamaica Pass allowed a devastating flanking maneuver."},
  {text:"What foreign soldiers fought alongside the British?",options:["French mercenaries","Spanish soldiers","Hessian (German) mercenaries","Dutch volunteers"],answer:2,explanation:"Hessians were German professional soldiers hired by Britain."},
  {text:"Why was defending New York both militarily and symbolically important?",options:["It was the capital","Its port controlled trade and communication","It had the most population","Washington lived there"],answer:1,explanation:"New York's harbor made it the most strategically valuable port in the colonies."},
  {text:"How can a commander 'lose a battle but preserve the war effort'?",options:["By surrendering honorably","By keeping the army intact to fight another day","By destroying supplies","By switching sides"],answer:1,explanation:"Washington's evacuation saved the Continental Army — losing it would have ended the Revolution."},
  {text:"Who commanded the British forces at Long Island?",options:["Gen. Cornwallis","Gen. Burgoyne","Gen. William Howe","Gen. Clinton"],answer:2,explanation:"Gen. Howe commanded the combined British and Hessian forces."},
];

const Q_TRENTON = [
  {text:"When did Washington cross the Delaware for the Battle of Trenton?",options:["December 25, 1776","January 3, 1777","November 1776","February 1777"],answer:0,explanation:"Christmas night, 1776 — a desperate gamble during the war's darkest period."},
  {text:"What river did Washington famously cross?",options:["Hudson River","Potomac River","Delaware River","Charles River"],answer:2,explanation:"The iconic crossing of the icy Delaware River."},
  {text:"Who were the enemy forces at Trenton?",options:["British regulars","French troops","Hessian mercenaries","Loyalist militia"],answer:2,explanation:"Hessian soldiers garrisoned at Trenton."},
  {text:"Why did morale matter as much as territory in late 1776?",options:["The army was well-supplied","Enlistments were expiring and men were losing hope","France had already allied","The war was almost over"],answer:1,explanation:"Without a victory, the army might simply dissolve as enlistments expired."},
  {text:"What weather conditions aided the surprise attack?",options:["Dense fog","A blizzard/sleet storm","Hurricane","Extreme heat"],answer:1,explanation:"Fierce sleet and snow provided cover and kept the Hessians indoors."},
  {text:"How many Hessians were captured at Trenton?",options:["About 100","About 500","About 900","About 2,000"],answer:2,explanation:"About 900 captured — a stunning reversal after months of defeat."},
  {text:"How did Trenton demonstrate a shift in American strategy?",options:["Hold cities at all costs","Survive and strike opportunistically","Rely only on militia","Avoid all combat"],answer:1,explanation:"Washington shifted to hitting vulnerable targets rather than defending fixed positions."},
  {text:"Why was Trenton significant for the Revolution's survival?",options:["It ended the war","It was the first victory in months, restoring hope","It captured a British general","It secured French alliance"],answer:1,explanation:"A desperately needed victory that kept the cause alive through the winter."},
];

const Q_PRINCETON = [
  {text:"How soon after Trenton was the Battle of Princeton?",options:["The next day","About 10 days","About a month","Six months"],answer:1,explanation:"January 3, 1777 — continuing the momentum of the 'Ten Crucial Days.'"},
  {text:"What tactic did Washington use to evade Cornwallis?",options:["Frontal assault","Left campfires burning and marched away at night","Naval escape","Sent a decoy force"],answer:1,explanation:"Kept fires burning to trick Cornwallis while the army slipped away in darkness."},
  {text:"What did the Trenton-Princeton sequence earn Washington?",options:["The nickname 'The Old Fox'","A promotion to King","A peace treaty","British surrender"],answer:0,explanation:"His cunning maneuvers earned him respect as a crafty strategist."},
  {text:"What did Washington establish after Princeton?",options:["A new capital","Winter quarters at Morristown","A naval fleet","A peace conference"],answer:1,explanation:"The army went into winter quarters at Morristown, New Jersey."},
  {text:"Why are Trenton and Princeton often taught together?",options:["Same commander led both sides","They form one continuous strategic episode","They happened in the same hour","They were in the same town"],answer:1,explanation:"Together they constitute the 'Ten Crucial Days' that saved the Revolution."},
  {text:"What does the Trenton-Princeton sequence suggest about Patriot strategy evolution?",options:["They abandoned guerrilla tactics","They shifted from defending cities to mobile, opportunistic strikes","They relied entirely on France","They stopped fighting in winter"],answer:1,explanation:"The shift to maneuver warfare showed strategic maturation from 1775's defensive posture."},
];

const Q_BRANDYWINE = [
  {text:"What city was Washington trying to protect at Brandywine?",options:["New York","Boston","Philadelphia","Charleston"],answer:2,explanation:"Philadelphia — the colonial capital and seat of the Continental Congress."},
  {text:"What flanking tactic did the British use?",options:["Amphibious landing","Divided army to attack from two sides","Night assault","Cavalry charge"],answer:1,explanation:"Howe sent Cornwallis on a wide flanking march while pinning Washington frontally."},
  {text:"Which French volunteer was wounded in his first battle here?",options:["Rochambeau","Marquis de Lafayette","De Grasse","Von Steuben"],answer:1,explanation:"Lafayette was wounded at Brandywine — his dedication impressed Americans."},
  {text:"What happened to Philadelphia after Brandywine?",options:["Successfully defended","British captured and occupied it","It was burned","Congress held firm"],answer:1,explanation:"The British occupied Philadelphia — Congress fled to York, Pennsylvania."},
  {text:"When was the Battle of Brandywine?",options:["July 1777","September 11, 1777","October 1777","December 1777"],answer:1,explanation:"September 11, 1777."},
  {text:"Why did losing Philadelphia NOT end the Revolution?",options:["It wasn't the real capital","The war was about the army, not any single city","France intervened immediately","Britain gave it back"],answer:1,explanation:"As long as Washington's army survived, the Revolution continued — capitals could be retaken."},
];

const Q_GERMANTOWN = [
  {text:"What was Washington's plan at Germantown?",options:["Defend a fort","Launch a surprise dawn attack on the British camp","Negotiate peace","Retreat to Valley Forge"],answer:1,explanation:"A bold four-column surprise attack on British positions near Philadelphia."},
  {text:"What weather condition caused confusion and friendly fire?",options:["Rain","Dense fog","Snow","Extreme heat"],answer:1,explanation:"Thick fog caused American units to fire on each other."},
  {text:"What stone house became a British stronghold during the battle?",options:["Independence Hall","The Chew House (Cliveden)","Valley Forge HQ","Betsy Ross House"],answer:1,explanation:"British troops barricaded in the Chew House, disrupting the American advance."},
  {text:"Though a defeat, how did Germantown influence the war?",options:["Discouraged all allies","Impressed France, helping secure the alliance","Ended fighting for the year","Had no broader impact"],answer:1,explanation:"French observers were impressed that Americans could mount bold offensive operations."},
  {text:"What happened to some American units in the fog?",options:["They surrendered","They fired on each other","They got lost at sea","They defected"],answer:1,explanation:"Friendly fire incidents in the confusion disrupted coordination."},
  {text:"Why is Germantown significant despite being a tactical loss?",options:["Washington was captured","It demonstrated offensive capability that helped convince France to ally","All British generals were killed","It liberated Philadelphia"],answer:1,explanation:"The willingness to attack, even unsuccessfully, showed France the Americans were serious."},
];

const Q_SARATOGA = [
  {text:"Why do historians call Saratoga the war's 'turning point'?",options:["Most casualties","It convinced France to formally ally with America","It was the last battle","Washington commanded personally"],answer:1,explanation:"French alliance brought money, troops, and naval power — transforming the war."},
  {text:"Who commanded the British forces at Saratoga?",options:["Gen. Howe","Gen. Clinton","Gen. Burgoyne","Lord Cornwallis"],answer:2,explanation:"'Gentleman Johnny' Burgoyne led the failed invasion from Canada."},
  {text:"What was Burgoyne's strategic goal?",options:["Capture Philadelphia","Split New England from the other colonies via the Hudson River","Invade France","Defend New York City"],answer:1,explanation:"Controlling the Hudson would isolate rebellious New England."},
  {text:"What happened to Burgoyne's entire army?",options:["Escaped to Canada","Surrendered (~6,000 troops)","Won and held position","Retreated to New York"],answer:1,explanation:"The entire army surrendered — a catastrophic British defeat."},
  {text:"Which American general fought heroically at Saratoga but later became a traitor?",options:["Nathanael Greene","Henry Knox","Benedict Arnold","Charles Lee"],answer:2,explanation:"Arnold's battlefield bravery at Saratoga contrasts sharply with his later defection."},
  {text:"Who was the American commander at Saratoga?",options:["Washington","Gen. Horatio Gates","Gen. Greene","Lafayette"],answer:1,explanation:"Gen. Horatio Gates commanded, though Arnold's aggressive tactics were crucial."},
  {text:"How many distinct battles made up Saratoga?",options:["One","Two","Three","Four"],answer:1,explanation:"Freeman's Farm (Sept 19) and Bemis Heights (Oct 7)."},
  {text:"How did Saratoga 'internationalize' the war?",options:["It was fought on French soil","France formally allied, and Spain/Netherlands later joined against Britain","Russia invaded Britain","All European nations declared neutrality"],answer:1,explanation:"French alliance in 1778 transformed a colonial rebellion into a global conflict."},
  {text:"Why did European powers care about an American rebellion?",options:["They wanted American land","Weakening Britain served their own geopolitical interests","They shared democratic values","They were required by treaty"],answer:1,explanation:"France especially saw an opportunity to weaken its longtime rival Britain."},
];

const Q_VALLEYFORGE = [
  {text:"Valley Forge was what type of event?",options:["A major battle","A six-month winter encampment","A naval engagement","A peace negotiation"],answer:1,explanation:"Not a battle — a grueling winter camp where the army was transformed."},
  {text:"What was the biggest threat to soldiers at Valley Forge?",options:["British attacks","Disease, cold, and starvation","Flooding","Desertion to the enemy"],answer:1,explanation:"About 2,000 of 12,000 men died from disease and exposure."},
  {text:"Who trained the Continental Army at Valley Forge?",options:["Lafayette","Gen. Greene","Baron von Steuben","Gen. Knox"],answer:2,explanation:"Prussian drillmaster von Steuben taught European military discipline and tactics."},
  {text:"What country was von Steuben from?",options:["France","Spain","Prussia (Germany)","Netherlands"],answer:2,explanation:"He was a Prussian military officer who volunteered his expertise."},
  {text:"What transformation occurred at Valley Forge?",options:["The army became a navy","Untrained militia became a professional fighting force","All soldiers were replaced","The army surrendered"],answer:1,explanation:"Von Steuben's drilling transformed the army's discipline and effectiveness."},
  {text:"Why is Valley Forge significant even though no battle was fought?",options:["It's where independence was declared","The army that emerged was fundamentally more capable","It was the war's last event","All generals were replaced"],answer:1,explanation:"The army that left Valley Forge in June 1778 was a transformed fighting force."},
  {text:"When did the army leave Valley Forge?",options:["March 1778","June 1778","September 1778","December 1778"],answer:1,explanation:"June 1778 — emerging as a professional army ready for Monmouth."},
];

const Q_COWPENS = [
  {text:"When was the Battle of Cowpens?",options:["October 1780","January 17, 1781","March 1781","June 1781"],answer:1,explanation:"January 17, 1781 — a critical Southern Campaign victory."},
  {text:"Who commanded American forces at Cowpens?",options:["Washington","Gen. Greene","Gen. Daniel Morgan","Lafayette"],answer:2,explanation:"Brigadier General Daniel Morgan designed a brilliant tactical plan."},
  {text:"What British officer led the forces defeated at Cowpens?",options:["Cornwallis","Col. Banastre Tarleton","Gen. Howe","Gen. Clinton"],answer:1,explanation:"Tarleton was known for aggressive cavalry tactics."},
  {text:"What was Morgan's innovative tactic?",options:["Frontal assault","Used militia as a deliberate 'retreat' to lure British into a trap","Naval bombardment","Night attack"],answer:1,explanation:"He positioned militia to fire and fall back, drawing the British into prepared lines."},
  {text:"Why was Cowpens significant for the Southern Campaign?",options:["It ended the war","It destroyed a significant portion of Cornwallis's mobile force","It captured Charleston","France landed troops there"],answer:1,explanation:"Tarleton's defeat weakened Cornwallis and set up the Yorktown campaign."},
  {text:"How did Cowpens show American tactical maturation?",options:["They copied British tactics exactly","A commander designed strategy around his troops' actual strengths and weaknesses","They used only cavalry","They avoided all combat"],answer:1,explanation:"Morgan built his plan around militia's tendency to retreat — turning a weakness into a trap."},
  {text:"In what colony/state was Cowpens fought?",options:["Virginia","North Carolina","South Carolina","Georgia"],answer:2,explanation:"In the South Carolina backcountry."},
  {text:"Why are southern victories like Cowpens considered precursors to Yorktown?",options:["They captured Cornwallis","They weakened British forces and pushed Cornwallis toward the coast","They secured French ships","They ended British naval power"],answer:1,explanation:"Each southern defeat reduced Cornwallis's strength and limited his strategic options."},
];

const Q_YORKTOWN = [
  {text:"When did the Siege of Yorktown take place?",options:["June 1781","Sep 28–Oct 19, 1781","December 1781","March 1782"],answer:1,explanation:"The decisive siege lasted about three weeks in fall 1781."},
  {text:"Who commanded American and French forces at Yorktown?",options:["Gates and Lafayette","Washington and Rochambeau","Greene and von Steuben","Knox and Lafayette"],answer:1,explanation:"Washington commanded Americans; Rochambeau commanded French troops."},
  {text:"Who commanded the trapped British forces?",options:["Gen. Howe","Gen. Clinton","Lord Cornwallis","Gen. Burgoyne"],answer:2,explanation:"Cornwallis was trapped on the Yorktown peninsula."},
  {text:"What role did the French navy play?",options:["Transported British troops","Blocked British naval rescue at the Battle of the Chesapeake","Bombarded Yorktown","Evacuated civilians"],answer:1,explanation:"Admiral de Grasse's fleet prevented the Royal Navy from rescuing Cornwallis."},
  {text:"Why is Yorktown considered 'decisive' even though the Treaty of Paris came later?",options:["Every British soldier was killed","It destroyed Britain's political will to continue the war","It captured King George","America invaded England"],answer:1,explanation:"The surrender made continued war politically unsustainable in Parliament."},
  {text:"How many British soldiers surrendered at Yorktown?",options:["2,000","5,000","About 8,000","15,000"],answer:2,explanation:"About 8,000 troops surrendered — a devastating blow to British strength."},
  {text:"What does Yorktown demonstrate about the importance of alliance coordination?",options:["Allies weren't needed","Victory required precise timing between American troops, French army, and French navy","Only the navy mattered","France did all the fighting"],answer:1,explanation:"The convergence of land and naval forces from multiple nations made the siege possible."},
  {text:"How had American military capability changed from 1776 to 1781?",options:["It hadn't changed","The army could now execute complex, multi-force siege operations","They relied entirely on militia","They had abandoned all European tactics"],answer:1,explanation:"From retreating across New Jersey to conducting a professional siege — a dramatic transformation."},
  {text:"What did the British band reportedly play during the surrender?",options:["God Save the King","Rule Britannia","The World Turned Upside Down","Yankee Doodle"],answer:2,explanation:"The tune symbolized how improbable the American victory seemed to the British."},
];

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD WAR II QUESTION BANKS — APUSH Period 7 (1890–1945)
// Emphasis on causation, mobilization, strategic significance, home front
// ═══════════════════════════════════════════════════════════════════════════════

const Q_PEARLHARBOR = [
  {text:"When did Japan attack Pearl Harbor?",options:["December 7, 1941","June 6, 1944","August 6, 1945","September 1, 1939"],answer:0,explanation:"December 7, 1941 — 'a date which will live in infamy.'"},
  {text:"Where is Pearl Harbor located?",options:["Philippines","Hawaii","California","Guam"],answer:1,explanation:"On the island of Oahu, Hawaii — home to the U.S. Pacific Fleet."},
  {text:"What was the primary Japanese strategic goal of the attack?",options:["Invade the U.S. mainland","Destroy the Pacific Fleet to prevent interference with expansion","Capture Hawaii permanently","Force immediate U.S. surrender"],answer:1,explanation:"Japan wanted to cripple U.S. naval power so it could conquer Southeast Asia unopposed."},
  {text:"How did Pearl Harbor change U.S. political constraints on entering the war?",options:["Congress still refused to act","It unified public opinion and Congress declared war the next day","Only the Navy responded","The U.S. remained neutral"],answer:1,explanation:"The attack eliminated isolationist opposition — war was declared with only one dissenting vote."},
  {text:"What critical U.S. assets were NOT at Pearl Harbor during the attack?",options:["Submarines","Aircraft carriers","Destroyers","Fuel depots"],answer:1,explanation:"The carriers were at sea — their survival proved crucial for the Pacific War."},
  {text:"How many American service members were killed at Pearl Harbor?",options:["About 500","About 1,200","About 2,400","About 5,000"],answer:2,explanation:"About 2,400 killed and 1,100 wounded."},
  {text:"What famous ship was sunk and became a memorial?",options:["USS Missouri","USS Arizona","USS Enterprise","USS Yorktown"],answer:1,explanation:"The USS Arizona sank with 1,177 crew — now a memorial at Pearl Harbor."},
  {text:"Why can Pearl Harbor be understood as both a military AND psychological event?",options:["The damage was minimal","The shock unified a divided nation and transformed public willingness to fight","Japan immediately surrendered","It had no lasting impact"],answer:1,explanation:"Beyond physical damage, the attack psychologically transformed American isolationism into war resolve."},
  {text:"What was the U.S. foreign policy stance before Pearl Harbor?",options:["Actively at war","Officially neutral but providing aid to Allies","Allied with Japan","Completely isolationist with no foreign involvement"],answer:1,explanation:"Lend-Lease and other programs aided Britain, but the U.S. was not formally at war."},
];

const Q_MIDWAY = [
  {text:"When was the Battle of Midway?",options:["December 1941","June 1942","August 1942","November 1943"],answer:1,explanation:"June 4–7, 1942 — six months after Pearl Harbor."},
  {text:"Why is Midway considered a turning point in the Pacific War?",options:["Japan surrendered","It shifted naval initiative from Japan to the United States","The U.S. invaded Japan","Germany was defeated there"],answer:1,explanation:"Japan lost four fleet carriers — it could no longer maintain offensive operations."},
  {text:"What U.S. advantage proved decisive at Midway?",options:["More ships","Intelligence — they had broken Japanese codes","Better weather","Surprise attack"],answer:1,explanation:"Codebreaking allowed the U.S. to anticipate Japanese plans and set a trap."},
  {text:"How many Japanese aircraft carriers were sunk at Midway?",options:["1","2","4","6"],answer:2,explanation:"Four fleet carriers — Akagi, Kaga, Soryu, and Hiryu — were destroyed."},
  {text:"How did Midway differ from Pearl Harbor in terms of initiative?",options:["Japan had initiative at both","The U.S. had initiative at both","Japan attacked at Pearl Harbor; the U.S. set the trap at Midway","Neither side had initiative"],answer:2,explanation:"Pearl Harbor was a Japanese surprise; Midway was an American ambush using intelligence."},
  {text:"Why were aircraft carriers so important in Pacific naval warfare?",options:["They carried troops","They projected air power over vast ocean distances, replacing battleships as decisive","They were fastest ships","They carried supplies"],answer:1,explanation:"Carrier-based aviation could strike hundreds of miles away, making them the new capital ships."},
  {text:"What does Midway show about the role of decision-making under uncertainty?",options:["Commanders had perfect information","Key moments depended on imperfect intelligence and split-second tactical choices","Technology decided everything","Leadership didn't matter"],answer:1,explanation:"Despite intelligence advantages, critical decisions under fog of war shaped the outcome."},
];

const Q_DDAY = [
  {text:"What was the code name for the Allied invasion of Normandy?",options:["Operation Market Garden","Operation Overlord","Operation Barbarossa","Operation Torch"],answer:1,explanation:"Operation Overlord — the largest amphibious invasion in history."},
  {text:"On what date did D-Day take place?",options:["June 6, 1944","June 6, 1943","July 4, 1944","May 8, 1945"],answer:0,explanation:"June 6, 1944."},
  {text:"Who was the Supreme Commander of Allied forces?",options:["George Patton","Bernard Montgomery","Dwight D. Eisenhower","Douglas MacArthur"],answer:2,explanation:"General Eisenhower coordinated the massive multi-national operation."},
  {text:"How many beaches were assaulted on D-Day?",options:["3","4","5","7"],answer:2,explanation:"Five beaches: Utah, Omaha, Gold, Juno, and Sword."},
  {text:"Which beach saw the heaviest American casualties?",options:["Utah","Omaha","Gold","Sword"],answer:1,explanation:"Omaha Beach — strong German defenses caused devastating casualties."},
  {text:"What did Allied paratroopers do before the beach landings?",options:["Bombed bridges","Dropped behind enemy lines to disrupt German reinforcements","Landed by submarine","Attacked from the south"],answer:1,explanation:"82nd and 101st Airborne divisions dropped overnight behind German lines."},
  {text:"What was the Atlantic Wall?",options:["A U.S. naval fleet","German coastal fortification system","A British spy network","An Allied bombing campaign"],answer:1,explanation:"Extensive German coastal defenses built to repel an invasion."},
  {text:"Who commanded German forces in Normandy?",options:["Hitler directly","Field Marshal Rommel","General Guderian","Admiral Dönitz"],answer:1,explanation:"Rommel oversaw the Atlantic Wall defenses in the invasion area."},
  {text:"About how many Allied troops landed on D-Day?",options:["50,000","100,000","156,000","300,000"],answer:2,explanation:"Approximately 156,000 troops from multiple nations."},
  {text:"Why was D-Day a political and strategic achievement, not just tactical?",options:["It ended the war immediately","Securing a beachhead opened a second front, relieving pressure on the Soviet Union","It captured Hitler","France switched sides"],answer:1,explanation:"The Western Front forced Germany to fight on two fronts simultaneously."},
  {text:"How does D-Day illustrate the relationship between industrial capacity and warfare?",options:["Industry didn't matter","The invasion required massive production of ships, vehicles, weapons, and supplies","Only brave soldiers mattered","Technology was irrelevant"],answer:1,explanation:"D-Day was possible only because of America's enormous industrial output."},
];

const Q_BULGE = [
  {text:"When did the Battle of the Bulge begin?",options:["June 1944","October 1944","December 16, 1944","January 1945"],answer:2,explanation:"Germany's surprise offensive began December 16, 1944."},
  {text:"Why was it called the 'Battle of the Bulge'?",options:["Soldiers gained weight","German advance created a bulge in Allied lines","The terrain was hilly","Troops had excess supplies"],answer:1,explanation:"The German push created a 'bulge' in the Allied front."},
  {text:"Why would Germany launch a risky winter offensive so late in the war?",options:["They were winning easily","A desperate gamble to split Allied forces and negotiate a separate peace","They had unlimited reserves","The weather was favorable for offense"],answer:1,explanation:"Hitler hoped to split the Allies and force negotiation — a last-ditch gamble."},
  {text:"Which town's defense became legendary?",options:["Paris","Bastogne","Antwerp","Aachen"],answer:1,explanation:"The 101st Airborne's surrounded defense of Bastogne became iconic."},
  {text:"What was General McAuliffe's famous reply when asked to surrender?",options:["Never!","Come and get us","Nuts!","No thank you"],answer:2,explanation:"The one-word response became one of WWII's most famous quotes."},
  {text:"What weather condition initially helped the Germans?",options:["Heavy rain","Dense fog and overcast skies grounding Allied aircraft","Extreme heat","Flooding"],answer:1,explanation:"Cloud cover neutralized Allied air superiority for critical days."},
  {text:"Which general's army made a remarkable turn to relieve Bastogne?",options:["Eisenhower","Bradley","Patton","Montgomery"],answer:2,explanation:"Patton's Third Army executed a 90-degree pivot in winter — a remarkable feat."},
  {text:"About how many American casualties occurred in the Bulge?",options:["19,000","47,000","80,000","120,000"],answer:2,explanation:"About 80,000 — the costliest single American battle of WWII."},
  {text:"Why can 'holding the line' be historically significant even without gaining territory?",options:["It can't be","Preventing a breakthrough preserved Allied strategy and morale","Only offensive victories matter","Defense is always insignificant"],answer:1,explanation:"Bastogne's defense denied Germany its objectives and bought time for counterattack."},
];

const Q_IWOJIMA = [
  {text:"Where is Iwo Jima located?",options:["Philippines","Pacific Ocean, about 750 miles south of Tokyo","Mediterranean Sea","English Channel"],answer:1,explanation:"A small volcanic island strategically positioned near the Japanese mainland."},
  {text:"Why did the U.S. want to capture Iwo Jima?",options:["Oil reserves","Airfields for fighter escorts and emergency B-29 bomber landings","Naval port","Prisoner rescue"],answer:1,explanation:"Its airfields would support the strategic bombing campaign against Japan."},
  {text:"What famous photograph was taken on Iwo Jima?",options:["V-J Day kiss","Raising the flag on Mount Suribachi","MacArthur's return","Eisenhower with paratroopers"],answer:1,explanation:"The iconic flag-raising became one of the most famous images in American history."},
  {text:"What made Iwo Jima so difficult to attack?",options:["Dense jungle","An elaborate system of 11 miles of tunnels and hundreds of bunkers","Swamp terrain","Naval mines"],answer:1,explanation:"Japanese defenders built an underground fortress connected by tunnels."},
  {text:"Who commanded Japanese forces on Iwo Jima?",options:["Admiral Yamamoto","General Tojo","General Kuribayashi","Admiral Nagumo"],answer:2,explanation:"Kuribayashi designed the innovative defense-in-depth strategy."},
  {text:"How long did the battle last?",options:["3 days","2 weeks","About 36 days","3 months"],answer:2,explanation:"February 19 to March 26, 1945 — far longer than the expected few days."},
  {text:"How did 'expected quick victory' assumptions affect planning?",options:["They improved accuracy","Underestimating the defense led to insufficient preparation for a prolonged fight","They had no effect","Commanders always expected a long battle"],answer:1,explanation:"The gap between expectation and reality cost thousands of additional casualties."},
  {text:"How many U.S. Marines were killed on Iwo Jima?",options:["About 2,000","About 7,000","About 15,000","About 25,000"],answer:1,explanation:"About 6,800 killed and 19,000 wounded — horrific casualty rates."},
  {text:"What does the famous photograph tell us about the power of images in wartime?",options:["Nothing — it's just a photo","A single image can shape public perception, boost morale, and become a symbol far beyond the event itself","Photos always show the full truth","Images were irrelevant in WWII"],answer:1,explanation:"The image became the most reproduced photograph in history and a symbol of American resolve."},
];

const Q_OKINAWA = [
  {text:"When did the Battle of Okinawa begin?",options:["February 1945","April 1, 1945","June 1945","August 1945"],answer:1,explanation:"U.S. forces landed on April 1, 1945 — the last major battle before the planned invasion of Japan."},
  {text:"Why was Okinawa called a 'doorstep' battle?",options:["It had many doors","It was close enough to Japan to serve as a staging base for invasion","It was Japan's capital","It was the smallest island"],answer:1,explanation:"Only 340 miles from mainland Japan — the last stepping stone."},
  {text:"How long did the battle last?",options:["1 week","3 weeks","About 82 days","6 months"],answer:2,explanation:"April 1 to June 22, 1945 — nearly three months of intense fighting."},
  {text:"What Japanese tactic caused devastating naval casualties?",options:["Submarine warfare","Kamikaze (suicide aircraft) attacks","Naval mines","Torpedo boats"],answer:1,explanation:"Kamikaze attacks sank or damaged hundreds of Allied ships."},
  {text:"Approximately how many people died in the Battle of Okinawa (all sides + civilians)?",options:["10,000","50,000","100,000","Over 200,000"],answer:3,explanation:"Over 200,000 total — including approximately 100,000 Okinawan civilians."},
  {text:"How did the massive casualties at Okinawa influence U.S. decision-making?",options:["They had no influence","The projected cost of invading mainland Japan shaped debates about alternative ways to end the war","The U.S. decided to negotiate immediately","Casualties were considered acceptable"],answer:1,explanation:"Okinawa's losses directly influenced the decision to use atomic weapons rather than invade."},
  {text:"What changes from earlier Pacific campaigns to Okinawa in 1945?",options:["Fighting became easier","Japanese defensive strategies became more sophisticated and costly","The U.S. had fewer resources","Weather no longer mattered"],answer:1,explanation:"Each island battle taught Japan to build deeper defenses, making each assault more costly."},
  {text:"How did Okinawa affect the civilian population?",options:["Civilians were safely evacuated","Massive civilian casualties occurred — caught between two armies","No civilians lived there","Civilians all escaped by boat"],answer:1,explanation:"Okinawan civilians suffered terribly, including mass suicides driven by propaganda."},
];


// ─── BATTLE CONFIGS ──────────────────────────────────────────────────────────
const BATTLES = [
  {id:"lexington",name:"Lexington & Concord",date:"Apr 1775",general:"Gen. Gage",icon:"🔫",questions:Q_LEXINGTON,context:"British troops marched to seize colonial weapons. The resulting skirmishes ignited the Revolution.",enemies:[{name:"British Regulars",hp:70,dmg:14,icon:"🔴"},{name:"Light Infantry",hp:65,dmg:16,icon:"🟠"},{name:"Gage\'s Guard",hp:65,dmg:18,icon:"⭐"}]},
  {id:"ticonderoga",name:"Fort Ticonderoga",date:"May 1775",general:"Capt. Delaplace",icon:"🏰",questions:Q_TICONDEROGA,context:"Ethan Allen\'s Green Mountain Boys captured this fort, providing vital artillery for Boston.",enemies:[{name:"Fort Garrison",hp:70,dmg:16,icon:"🔴"},{name:"British Sentries",hp:70,dmg:18,icon:"🟠"},{name:"Delaplace\'s Guard",hp:80,dmg:20,icon:"⭐"}]},
  {id:"bunker",name:"Bunker Hill",date:"Jun 1775",general:"Gen. Howe",icon:"⛰️",questions:Q_BUNKER,context:"Colonial forces on Breed\'s Hill withstood two British assaults. The pyrrhic British victory proved colonials could fight.",enemies:[{name:"British Grenadiers",hp:80,dmg:18,icon:"🔴"},{name:"Light Companies",hp:75,dmg:20,icon:"🟠"},{name:"Howe\'s Vanguard",hp:85,dmg:22,icon:"⭐"}]},
  {id:"boston",name:"Siege of Boston",date:"Mar 1776",general:"Gen. Howe",icon:"🏘️",questions:Q_BOSTON,context:"Washington surrounded Boston for 11 months. Knox\'s cannons on Dorchester Heights forced British evacuation.",enemies:[{name:"Boston Garrison",hp:85,dmg:18,icon:"🔴"},{name:"Royal Marines",hp:80,dmg:20,icon:"🟠"},{name:"Howe\'s Regulars",hp:95,dmg:22,icon:"⭐"}]},
  {id:"longisland",name:"Battle of Long Island",date:"Aug 1776",general:"Gen. Howe",icon:"🏝️",boss:true,bossReviewDmg:10,questions:Q_LONGISLAND,context:"The largest battle of the Revolution. Washington\'s nighttime evacuation saved the army from destruction.",enemies:[{name:"Hessian Grenadiers",hp:110,dmg:22,icon:"🔴"},{name:"British Flankers",hp:120,dmg:24,icon:"🟠"},{name:"Gen. Howe",hp:130,dmg:28,icon:"👑"}]},
  {id:"trenton",name:"Battle of Trenton",date:"Dec 1776",general:"Col. Rall",icon:"🎄",questions:Q_TRENTON,context:"Washington crossed the Delaware on Christmas night to surprise Hessian forces — a desperately needed victory.",enemies:[{name:"Hessian Fusiliers",hp:65,dmg:16,icon:"🔴"},{name:"Hessian Jägers",hp:65,dmg:18,icon:"🟠"},{name:"Col. Rall\'s Guard",hp:70,dmg:20,icon:"⭐"}]},
  {id:"princeton",name:"Battle of Princeton",date:"Jan 1777",general:"Cornwallis",icon:"⚔️",questions:Q_PRINCETON,context:"Washington left campfires burning to trick Cornwallis, completing the \'Ten Crucial Days\' that saved the Revolution.",enemies:[{name:"4th Regiment",hp:75,dmg:18,icon:"🔴"},{name:"55th Regiment",hp:75,dmg:20,icon:"🟠"},{name:"Cornwallis Rear Guard",hp:80,dmg:22,icon:"⭐"}]},
  {id:"brandywine",name:"Brandywine",date:"Sep 1777",general:"Gen. Howe",icon:"🌊",questions:Q_BRANDYWINE,context:"Washington tried to block the British advance on Philadelphia. Howe\'s flanking led to defeat and Philadelphia fell.",enemies:[{name:"British Regulars",hp:85,dmg:20,icon:"🔴"},{name:"Cornwallis Flankers",hp:85,dmg:22,icon:"🟠"},{name:"Howe\'s Command",hp:90,dmg:24,icon:"⭐"}]},
  {id:"germantown",name:"Germantown",date:"Oct 1777",general:"Gen. Howe",icon:"⚔️",questions:Q_GERMANTOWN,context:"Washington\'s bold dawn attack failed due to fog, but the attempt impressed France enough to help secure the alliance.",enemies:[{name:"British Pickets",hp:85,dmg:20,icon:"🔴"},{name:"Chew House Defenders",hp:90,dmg:22,icon:"🟠"},{name:"Howe\'s Reserve",hp:95,dmg:24,icon:"⭐"}]},
  {id:"saratoga",name:"Battle of Saratoga",date:"Oct 1777",general:"Burgoyne",icon:"🏳️",boss:true,bossReviewDmg:10,questions:Q_SARATOGA,context:"The turning point. Burgoyne\'s surrender convinced France to formally ally with America.",enemies:[{name:"British Line Infantry",hp:130,dmg:24,icon:"🔴"},{name:"Hessian Auxiliaries",hp:120,dmg:26,icon:"🟠"},{name:"Gen. Burgoyne",hp:150,dmg:30,icon:"👑"}]},
  {id:"valleyforge",name:"Valley Forge",date:"Winter 1777-78",general:"Winter",icon:"🏕️",questions:Q_VALLEYFORGE,context:"A grueling winter camp where von Steuben transformed the Continental Army into a professional fighting force.",enemies:[{name:"Bitter Cold",hp:100,dmg:16,icon:"❄️"},{name:"Disease",hp:100,dmg:18,icon:"🤒"},{name:"Starvation",hp:100,dmg:20,icon:"💀"}]},
  {id:"cowpens",name:"Battle of Cowpens",date:"Jan 1781",general:"Col. Tarleton",icon:"🐄",questions:Q_COWPENS,context:"Daniel Morgan\'s brilliant tactics turned militia\'s weakness into a trap, destroying a key British force in the South.",enemies:[{name:"British Dragoons",hp:90,dmg:20,icon:"🔴"},{name:"Tarleton\'s Legion",hp:95,dmg:22,icon:"🟠"},{name:"Col. Tarleton",hp:100,dmg:26,icon:"⭐"}]},
  {id:"yorktown",name:"Siege of Yorktown",date:"Oct 1781",general:"Lord Cornwallis",icon:"🏰",boss:true,bossReviewDmg:12,questions:Q_YORKTOWN,context:"The decisive siege. American and French forces trapped Cornwallis while the French navy blocked escape. Britain\'s surrender ended the war.",enemies:[{name:"British Regulars",hp:140,dmg:26,icon:"🔴"},{name:"Hessian Veterans",hp:130,dmg:28,icon:"🟠"},{name:"Lord Cornwallis",hp:160,dmg:32,icon:"👑"}]},
];
const REV_WAR_MAP = [
  {id:"yorktown",name:"Yorktown",date:"Oct 1781",general:"Cornwallis",boss:"FINAL BOSS",icon:"🏰"},
  {id:"cowpens",name:"Cowpens",date:"Jan 1781",general:"Tarleton",boss:"BOSS",icon:"🐄"},
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

// ─── WW2 BATTLE CONFIGS ─────────────────────────────────────────────────────
const WW2_BATTLES = [
  {id:"pearlharbor",name:"Pearl Harbor",date:"Dec 1941",general:"Admiral Nagumo",icon:"💥",questions:Q_PEARLHARBOR,context:"Japan\'s surprise attack on the U.S. Pacific Fleet brought America into World War II overnight.",enemies:[{name:"Zero Fighters",hp:70,dmg:16,icon:"🔴"},{name:"Torpedo Bombers",hp:75,dmg:18,icon:"🟠"},{name:"Imperial Strike Force",hp:85,dmg:22,icon:"⭐"}]},
  {id:"midway",name:"Battle of Midway",date:"Jun 1942",general:"Admiral Yamamoto",icon:"⚓",questions:Q_MIDWAY,context:"U.S. codebreakers set a trap that destroyed four Japanese carriers — shifting Pacific initiative to America.",enemies:[{name:"IJN Escorts",hp:80,dmg:18,icon:"🔴"},{name:"Carrier Air Groups",hp:85,dmg:20,icon:"🟠"},{name:"Admiral Yamamoto",hp:95,dmg:24,icon:"⭐"}]},
  {id:"dday",name:"D-Day: Normandy",date:"Jun 1944",general:"FM Rommel",icon:"🏖️",boss:true,bossReviewDmg:10,questions:Q_DDAY,context:"The largest amphibious invasion in history. Allied forces stormed five Normandy beaches, opening the Western Front.",enemies:[{name:"Beach Defenders",hp:110,dmg:22,icon:"🔴"},{name:"Wehrmacht Infantry",hp:120,dmg:24,icon:"🟠"},{name:"Atlantic Wall HQ",hp:130,dmg:28,icon:"👑"}]},
  {id:"bulge",name:"Battle of the Bulge",date:"Dec 1944",general:"German Command",icon:"❄️",questions:Q_BULGE,context:"Germany\'s last major offensive. The heroic defense of Bastogne and Patton\'s relief became legendary.",enemies:[{name:"Panzer Division",hp:95,dmg:22,icon:"🔴"},{name:"Volksgrenadiers",hp:90,dmg:24,icon:"🟠"},{name:"King Tigers",hp:110,dmg:28,icon:"⭐"}]},
  {id:"iwojima",name:"Iwo Jima",date:"Feb 1945",general:"Gen. Kuribayashi",icon:"🏔️",questions:Q_IWOJIMA,context:"Marines fought 36 days through miles of tunnels to capture vital airfields near Japan.",enemies:[{name:"Tunnel Defenders",hp:100,dmg:22,icon:"🔴"},{name:"Imperial Marines",hp:100,dmg:24,icon:"🟠"},{name:"Kuribayashi\'s HQ",hp:120,dmg:28,icon:"⭐"}]},
  {id:"okinawa",name:"Battle of Okinawa",date:"Apr 1945",general:"Gen. Ushijima",icon:"🌊",boss:true,bossReviewDmg:12,questions:Q_OKINAWA,context:"The last major battle before the planned invasion of Japan. 82 days of brutal fighting with massive casualties on all sides.",enemies:[{name:"Shuri Line Defenders",hp:130,dmg:26,icon:"🔴"},{name:"Kamikaze Squadrons",hp:120,dmg:28,icon:"🟠"},{name:"Gen. Ushijima",hp:150,dmg:32,icon:"👑"}]},
];
const WW2_MAP = [
  {id:"berlin",name:"Fall of Berlin",date:"Apr 1945",general:"Soviet Forces",boss:"FINAL BOSS",icon:"🏛️"},
  {id:"okinawa",name:"Okinawa",date:"Apr 1945",general:"Ushijima",boss:"BOSS",icon:"🌊"},
  {id:"iwojima",name:"Iwo Jima",date:"Feb 1945",general:"Kuribayashi",icon:"🏔️"},
  {id:"bulge",name:"Battle of the Bulge",date:"Dec 1944",general:"German HQ",icon:"❄️"},
  {id:"dday",name:"D-Day",date:"Jun 1944",general:"Rommel",boss:"BOSS",icon:"🏖️"},
  {id:"midway",name:"Midway",date:"Jun 1942",general:"Yamamoto",icon:"⚓"},
  {id:"pearlharbor",name:"Pearl Harbor",date:"Dec 1941",general:"Nagumo",icon:"💥"},
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
function GISprite({state="idle",size=140}){
  const src=`/sprites/gi-${state}.png`;
  return <img src={src} alt={`GI ${state}`} style={{height:size,width:"auto",imageRendering:"auto",objectFit:"contain",transformOrigin:"bottom center",animation:"idleBob 3.5s ease-in-out infinite"}} onError={e=>{e.target.style.display="none";}}/>;
}
function GermanSprite({state="idle",size=140}){
  const src=`/sprites/german-${state}.png`;
  return <img src={src} alt={`German ${state}`} style={{height:size,width:"auto",imageRendering:"auto",objectFit:"contain",transformOrigin:"bottom center",animation:"idleBob 3.5s ease-in-out infinite",animationDelay:"-1.5s"}} onError={e=>{e.target.style.display="none";}}/>;
}
// Universal sprite picker based on era
function EraPlayerSprite({era,state,size}){return era==="ww2"?<GISprite state={state} size={size}/>:<ColonialSprite state={state} size={size}/>;}
function EraEnemySprite({era,state,size}){return era==="ww2"?<GermanSprite state={state} size={size}/>:<BritishSprite state={state} size={size}/>;}


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
function USScreen({onNav,onBack}){return(<div style={{padding:20,animation:"fadeIn 0.4s ease-out"}}><BB onClick={onBack}/><div style={{textAlign:"center",marginBottom:24}}><div style={{fontFamily:fonts.heading,fontSize:"1.5rem",fontWeight:700,color:"#E0E0E0"}}>US History</div></div><div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:400,margin:"0 auto"}}><MC onClick={()=>onNav(SCREENS.REV_WAR)}><span style={{fontSize:"1.4rem"}}>⚔️</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#4FC3F7"}}>REVOLUTIONARY WAR</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#888",marginTop:2}}>1775–1783 · 13 Battles</div></div></MC><MC onClick={()=>onNav(SCREENS.WW2)}><span style={{fontSize:"1.4rem"}}>🪖</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",fontWeight:700,color:"#81C784"}}>WORLD WAR II</div><div style={{fontFamily:fonts.body,fontSize:"0.8rem",color:"#888",marginTop:2}}>1941–1945 · 6 Battles</div></div></MC><MC disabled><span style={{fontSize:"1.4rem"}}>🦅</span><div><div style={{fontFamily:fonts.heading,fontSize:"0.85rem",color:"#666"}}>CIVIL WAR — Coming soon</div></div></MC></div></div>);}

function MapScreen({onBack,onSelect,completed,mapData,battles,title}){const sR=useRef(null);useEffect(()=>{if(sR.current)sR.current.scrollTop=sR.current.scrollHeight;},[]);const m=mapData,ns=110,mh=m.length*ns+120,pw=320;const gX=i=>{const c=(m.length-1-i)%6;return[0.5,0.28,0.5,0.72,0.5,0.35][c];};const pts=m.map((_,i)=>({x:gX(i)*pw,y:60+i*ns}));const pD=pts.reduce((a,p,i)=>{if(i===0)return`M ${p.x} ${p.y}`;const pr=pts[i-1];const cy=(pr.y+p.y)/2;return`${a} C ${pr.x} ${cy}, ${p.x} ${cy}, ${p.x} ${p.y}`;},"");
  return(<div style={{height:"100vh",display:"flex",flexDirection:"column",animation:"fadeIn 0.4s ease-out"}}><div style={{padding:"12px 20px 8px",flexShrink:0}}><BB onClick={onBack}/><div style={{textAlign:"center"}}><div style={{fontFamily:fonts.heading,fontSize:"1.2rem",fontWeight:700,color:"#E0E0E0"}}>{title}</div></div></div><div ref={sR} style={{flex:1,overflowY:"auto",overflowX:"hidden"}}><div style={{position:"relative",width:"100%",maxWidth:pw,margin:"0 auto",height:mh}}><svg style={{position:"absolute",top:0,left:0,width:pw,height:mh,pointerEvents:"none"}} viewBox={`0 0 ${pw} ${mh}`}><path d={pD} fill="none" stroke="rgba(79,195,247,0.08)" strokeWidth="28" strokeLinecap="round"/><path d={pD} fill="none" stroke="rgba(79,195,247,0.15)" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 6"/></svg><div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",fontFamily:fonts.heading,fontSize:"0.6rem",letterSpacing:"0.2em",color:"#FFD700",opacity:0.5}}>🏆 Victory 🏆</div><div style={{position:"absolute",bottom:15,left:"50%",transform:"translateX(-50%)",fontFamily:fonts.heading,fontSize:"0.55rem",letterSpacing:"0.2em",color:"#4FC3F7"}}>▼ Start ▼</div>
    {m.map((b,i)=>{const pt=pts[i];const bc=battles.find(x=>x.id===b.id);const ic=completed.includes(b.id);const bi=battles.findIndex(x=>x.id===b.id);const av=bi===0||(bi>0&&completed.includes(battles[bi-1].id));const iB=!!b.boss;const iF=b.boss==="FINAL BOSS";const sz=iF?56:iB?48:38;const nc=ic?"#81C784":av?"#4FC3F7":iF?"#FFD700":iB?"#FF8A65":"#444";
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
  const[curEra,setEra]=useState("revwar");
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
    if(battle.boss){const allB=curEra==="ww2"?WW2_BATTLES:BATTLES;const wQ=wrongAll.filter(q=>q&&!battle.questions.find(b=>b.text===q.text));const pB=allB.filter(b=>b.id!==battle.id&&!b.boss);const pQs=pB.flatMap(b=>b.questions);const nW=pQs.filter(q=>!wQ.find(w=>w.text===q.text));rv=[...wQ,...shuffleArray(nW).slice(0,Math.max(0,6-wQ.length))].slice(0,8);}
    setCS(squad);dispatch({type:"START",battle,squad,playerStats:pStats,reviewQs:rv});setScreen(SCREENS.BATTLE);
  };
  const goMap=()=>setScreen(curEra==="ww2"?SCREENS.WW2:SCREENS.REV_WAR);
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
          {screen===SCREENS.REV_WAR&&<MapScreen onBack={()=>setScreen(SCREENS.US_HISTORY)} onSelect={b=>{setCB(b);setEra("revwar");setScreen(SCREENS.PRE_BATTLE);}} completed={completed} mapData={REV_WAR_MAP} battles={BATTLES} title="Revolutionary War"/>}
          {screen===SCREENS.WW2&&<MapScreen onBack={()=>setScreen(SCREENS.US_HISTORY)} onSelect={b=>{setCB(b);setEra("ww2");setScreen(SCREENS.PRE_BATTLE);}} completed={completed} mapData={WW2_MAP} battles={WW2_BATTLES} title="World War II"/>}
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
                      <div style={{filter:isActive?"drop-shadow(2px 3px 5px rgba(0,0,0,0.4))":"drop-shadow(1px 2px 3px rgba(0,0,0,0.3))"}}><EraPlayerSprite era={curEra} state={u.fallen?"critical":uState} size={sz}/></div>
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
                      <div style={{filter:isActive?"drop-shadow(2px 3px 5px rgba(0,0,0,0.4))":"drop-shadow(1px 2px 3px rgba(0,0,0,0.3))",transform:"scaleX(-1)"}}><EraEnemySprite era={curEra} state={u.fallen?"critical":uState} size={sz}/></div>
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
