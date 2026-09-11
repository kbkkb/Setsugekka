/* ============================================================
   data.js — 数据配置 v2
   ============================================================ */

// ---------- 材料（每区域 2 种：普通 + 稀有） ----------
const MATERIALS = {
  iron:    { name:'玄铁碎片', color:'#c8c8d8', quality:1 },  // 区域A·普通
  amber:   { name:'流萤琥珀', color:'#ffb84d', quality:2 },  // 区域A·稀有
  bone:    { name:'冥骨玉',   color:'#4dff88', quality:1 },  // 区域B·普通
  moon:    { name:'白骨月华', color:'#aee7ff', quality:2 },  // 区域B·稀有
  crystal: { name:'幽晶矿',   color:'#4dc3ff', quality:1 },  // 区域C·普通
  heart:   { name:'晶心髓',   color:'#7dffd4', quality:2 },  // 区域C·稀有
  soul:    { name:'斩鬼之魂', color:'#a06aff', quality:1 },  // 区域D·普通
  remnant: { name:'刀魂残月', color:'#ff6ad5', quality:2 }   // 区域D·稀有
};
const MAT_ORDER = ['iron','amber','bone','moon','crystal','heart','soul','remnant'];

// ---------- 敌人类型 ----------
// 掉落规则：小怪固定掉本区普通材料；Boss 固定掉普通×3 + 中概率(35%)掉上区稀有 + 低概率(10%)掉本区稀有
const ENEMIES = {
  // 区域1·萤火森林
  goblin:       { name:'哥布林',     hp:80,  atk:6,  def:0, exp:15,  gold:25,  img:'img/goblin.svg',          interval:2500,
                  drops:[{m:'iron', n:1}] },
  goblin_king:  { name:'哥布林大王', hp:450, atk:18, def:5, exp:120, gold:220, img:'img/goblin_king.svg',      interval:2600,
                  isBoss:true, castName:'蛮力劈斩', castEvery:3800, castTime:1400, castDmgMul:2.2,
                  drops:[{m:'iron', n:3},{m:'amber', n:1, chance:0.10}] },
  // 区域2·遗忘遗迹
  skeleton:     { name:'骷髅武士',   hp:200, atk:15, def:5, exp:45,  gold:60,  img:'img/skeleton.svg',        interval:2800,
                  drops:[{m:'bone', n:1}] },
  skeleton_gen: { name:'骷髅将军·骸',hp:1000,atk:30, def:12,exp:320, gold:520, img:'img/skeleton_general.svg',interval:2700,
                  isBoss:true, castName:'亡者军势', castEvery:3600, castTime:1400, castDmgMul:2.4,
                  drops:[{m:'bone', n:3},{m:'amber', n:1, chance:0.35},{m:'moon', n:1, chance:0.10}] },
  // 区域3·幽暗矿洞
  lizard:       { name:'寻宝蜥蜴',   hp:520, atk:32, def:16,exp:110, gold:150, img:'img/lizard.svg',          interval:2600,
                  drops:[{m:'crystal', n:1}] },
  lizard_lord:  { name:'蜥蜴领主',   hp:2100,atk:52, def:26,exp:700, gold:1200,img:'img/lizard_lord.svg',     interval:2500,
                  isBoss:true, castName:'矿脉震荡', castEvery:3400, castTime:1300, castDmgMul:2.5,
                  drops:[{m:'crystal', n:3},{m:'moon', n:1, chance:0.35},{m:'heart', n:1, chance:0.10}] },
  // 区域4·城寨深处
  ronin:        { name:'无铭浪人',   hp:1300,atk:60, def:32,exp:280, gold:380, img:'img/ronin.svg',           interval:2400,
                  drops:[{m:'soul', n:1}] },
  boss_samurai: { name:'幕末武士·斩',hp:4200,atk:78, def:40,exp:2000,gold:3000,img:'img/boss_samurai.svg',    interval:2300,
                  isBoss:true, castName:'真刀斩击', castEvery:3200, castTime:1200, castDmgMul:2.8,
                  drops:[{m:'soul', n:3},{m:'heart', n:1, chance:0.35},{m:'remnant', n:1, chance:0.10}] }
};

// ---------- 战役关卡表（顺序即解锁顺序） ----------
// boss 需本区域小怪击杀 3 次；普通怪需上一关 boss 击杀
const ENCOUNTERS = [
  { key:'goblin',       zone:'萤火森林', label:'萤火森林 · 刷怪',   kind:'mob'  },
  { key:'goblin_king',  zone:'萤火森林', label:'萤火森林 · 首领',   kind:'boss', needKills:'goblin',        recAtk:60 },
  { key:'skeleton',     zone:'遗忘遗迹', label:'遗忘遗迹 · 刷怪',   kind:'mob',   needBoss:'goblin_king' },
  { key:'skeleton_gen', zone:'遗忘遗迹', label:'遗忘遗迹 · 首领',   kind:'boss',  needKills:'skeleton',     recAtk:115 },
  { key:'lizard',       zone:'幽暗矿洞', label:'幽暗矿洞 · 刷怪',   kind:'mob',   needBoss:'skeleton_gen' },
  { key:'lizard_lord',  zone:'幽暗矿洞', label:'幽暗矿洞 · 首领',   kind:'boss',  needKills:'lizard',       recAtk:160 },
  { key:'ronin',        zone:'城寨深处', label:'城寨深处 · 强敌',   kind:'mob',   needBoss:'lizard_lord' },
  { key:'boss_samurai', zone:'城寨深处', label:'城寨深处 · 最终对决',kind:'boss', needKills:'ronin',        recAtk:210 },
  { key:'arena',        zone:'剑心试炼场', label:'最终 · 四王连战',  kind:'arena', needBoss:'boss_samurai', recAtk:260 }
];

// ---------- 武器（每区域 2 把：普通=追赶线 / 高级=本区稀有驱动） ----------
// 数值曲线保证：本区域普通武器不超越上一区域高级武器（5<16 · 13<16 · 26<30 · 45<52）
const WEAPONS = [
  { id:'katana',   name:'铁刀',        atk:5,  cost:{ iron:3, gold:40 } },                                  // 初始 · A普通
  { id:'w_firefly',name:'萤火灯笼',    atk:16, cost:{ amber:2, iron:6, gold:350 } },                        // A高级
  { id:'w_bone100',name:'百骨刀',      atk:13, cost:{ bone:6, gold:600 } },                                 // B普通
  { id:'w_kotuge', name:'骨月·影',     atk:30, cost:{ moon:1, bone:8, amber:1, gold:1300 } },               // B高级
  { id:'w_yusei',  name:'幽晶太刀',    atk:26, cost:{ crystal:9, gold:1600 } },                             // C普通
  { id:'w_shousin',name:'晶心·琉璃',   atk:52, cost:{ heart:1, crystal:12, moon:1, gold:3200 } },           // C高级
  { id:'w_zanki',  name:'斩鬼太刀',    atk:45, cost:{ soul:10, gold:4500 } },                               // D普通
  { id:'w_eikyoku',name:'残月·永劫',   atk:80, cost:{ remnant:1, soul:16, heart:1, gold:9000 } },            // D高级
  { id:'w_mitsurugi',name:'终式 · 雪月花', atk:110, cost:{ amber:12, moon:12, heart:12, remnant:12, gold:25000 } } // 全毕业 · 四区稀有各12
];

// ---------- 竞技场（最终 JJC · 四王连战计时） ----------
const ARENA_SEQUENCE = ['goblin_king','skeleton_gen','lizard_lord','boss_samurai'];
const ARENA_MULT = { hp:2.6, atk:1.25 };
function fmtTime(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}

// ---------- 初始角色 ----------
const PLAYER_BASE = {
  maxHp:100, atk:12,
  weapon:'katana',
  exp:0, level:1,
  gold:100, crystal:10,
  materials: { iron:0, amber:0, bone:0, moon:0, crystal:0, heart:0, soul:0, remnant:0 },
  kills: {}, bossKills: {},
  arenaBest: null,             // 四王连战最佳用时（ms）
  arenaFirst: false,           // 四王连战首通已领奖
  collOwn: false,              // 图鉴：全武器收集奖励已发
  collMax: false,              // 图鉴：全满阶奖励已发
  tutDone: false,              // 新手引导已看
  weaponCount: { katana:1 },   // 各武器持有数（含可消耗的复制品）
  weaponTier: {}               // 各武器阶级（0~6）
};
// 一次性收集/首通钻石奖励
const ARENA_FIRST_REWARD = 300;
const COLL_OWN_REWARD = 200;
const COLL_MAX_REWARD = 1000;

// 技能（倍率制：伤害 = 总攻击力 × 倍率；连招带释放条件与加成）
const GCD_MS = 1200;
const COMBO_TIMEOUT = 4000;
// 「势」系连击条件（flag）持续时间
const CHI_MS = 30000;
const CHI_BONUS = 0.5; // （已弃用增益：势系为纯连击条件，不再增伤）
// FF14 式连击：每段 req=所需连击条件(消耗) · set=成功后给予的新条件，条件间互不干涉
//   1-1 ─给A「势」→ { 1-2, 2-1, 3-1 } 各自消耗 A 开启自己的支线
//   1-2 ─给B「续势」→ 1-3 收招成雪❆
//   2-1 ─给C「锐势」→ 2-2 收招成月☾ · 3-1 收招成花❀
const COMBO_FLAGS = { A:'势', B:'续势', C:'锐势' };
const BTN1 = [
  { name:'斩',    mult:10, req:null, set:'A' },                       // 1-1 唯一起手
  { name:'斩·贰', mult:14, req:'A',  set:'B' },                       // 1-2 消A给B
  { name:'斩·叁', mult:20, req:'B',  set:null,                        // 1-3 消B收招
    seal:'snow', buff:{ key:'zs', name:'锐锋', icon:'⚔', durMs:30000 } }
];
const BTN2 = [
  { name:'突',    mult:16, req:'A',  set:'C' },                       // 2-1 消A给C
  { name:'扫',    mult:24, req:'C',  set:null,                        // 2-2 消C收招
    seal:'moon', buff:{ key:'cd', name:'迅疾', icon:'⚡', durMs:30000 } }
];
const BTN3 = { name:'斩落', mult:30, req:'A', set:null, seal:'hana' }; // 3-1 消A收招 · 最快

// 收尾buff效果数值
const BUFF_ZS_DMG = 1.15;   // 锐锋：+15% 伤害
const CDR_PCT = 0.10;       // 迅疾：GCD 冷却 -10%

const COMBO_ROUTES = [
  { seq:'111', seal:'snow', sealName:'雪', icon:'❆' },
  { seq:'122', seal:'moon', sealName:'月', icon:'☾' },
  { seq:'13',  seal:'hana', sealName:'花', icon:'❀' }
];
const ULT = { name:'居合·雪月花', gcdMs:2500, dmgBase:60, castMs:1500 }; // 咏唱1.5s，咏唱开始即进入冷却
// 追斩：大招后续连击技（走 GCD）
const FOLLOW = { name:'追斩·残月', gcdMs:1400, dmgBase:42 };
// 剑气·一闪：消耗剑气瞬发（不走公共GCD，有独立冷却）
const QISTRIKE = { name:'剑气·一闪', qiCost:50, dmgBase:26, cd:100 };  // CD 仅 0.1s 点击锁，可凭剑气快速连发
// 战意高扬：15s 伤害加成 buff（不走公共GCD，有独立冷却）
const WARCRY = { name:'战意高扬', durMs:8000, durMsUp:10000, dmgMul:1.2, cd:20000 };  // 8s，Lv40 被动延至 10s
const SHIELD = { cd:8000, duration:2000 };   // 格挡减伤窗口 2s
// 全局点击锁：所有技能按下后 0.1s 内不能再按任何技能
const PRESS_LOCK_MS = 100;
// 剑气资源
const QI_MAX = 100;
const QI_PER_SEAL = 20;    // 完整连招成印 +20
const QI_PER_BLOCK = 20;   // 格挡内受击成功减伤 +20

// ---------- 养成：等级上限与技能解锁 ----------
// 节奏：1~20 级每 2~3 级一个解锁（主动+被动交替），20 级后每 5 级一个被动
const LEVEL_CAP = 50;
const UNLOCK_LV = {
  b1:1,        // 斩·三段
  b2:3,        // 突·两段
  b3:5,        // 斩落
  shield:7,    // 格挡
  ult:10,      // 居合·雪月花
  atkUp1:13,   // 被动：连招伤害 +20%
  qi:15,       // 剑气·一闪
  qiSrc:15,    // 被动：成印/格挡成功 +20 剑气（剑气条激活）
  leech1:17,   // 被动：攻击 1% 吸血
  buff:20,     // 战意高扬
  follow:25,   // 追斩·残月
  shieldCd:30, // 被动：格挡成功 CD 减半
  atkUp2:35,   // 被动：连招再 +20%
  buffDur:40,  // 被动：战意持续 8s→10s
  specUp:45,   // 被动：居合/追斩 +50%
  leech2:50    // 被动：吸血 1%→5%
};
// 展示文案（选关技能列表 / 升级播报）
const UNLOCK_INFO = {
  b1:      { n:'斩·三段',      d:'三连段轻击，起手获「势」，收尾凝聚雪❆印' },
  b2:      { n:'突·两段',      d:'需「势」的两段突刺，收尾凝聚月☾印' },
  b3:      { n:'斩落',         d:'需「势」重击，直接凝聚花❀印（最快成印路线）' },
  shield:  { n:'格挡',         d:'持续 2s 受伤 -70%，可反制敌方读条' },
  ult:     { n:'居合·雪月花',  d:'三印齐后咏唱 1.5s，超高爆发并解锁追斩' },
  atkUp1:  { n:'被动 · 锐锋剑意', d:'连招（斩/突/斩落）伤害 +20%' },
  qi:      { n:'剑气·一闪',    d:'耗 50 剑气瞬发高伤，不占 GCD，可连发' },
  qiSrc:   { n:'被动 · 剑心',  d:'成印 +20 剑气 · 格挡成功 +20 剑气，剑气条由此激活' },
  leech1:  { n:'被动 · 吞食',  d:'造成伤害的 1% 转化为生命偷取' },
  buff:    { n:'战意高扬',     d:'8s 内伤害 +20%，独立 CD 20s' },
  follow:  { n:'追斩·残月',    d:'居合命中后的追加重斩' },
  shieldCd:{ n:'被动 · 铁壁回元', d:'格挡成功后，剩余冷却直接减半' },
  atkUp2:  { n:'被动 · 烈刃式', d:'连招伤害再 +20%（叠乘共 +44%）' },
  buffDur: { n:'被动 · 战意不熄', d:'战意高扬持续 8s → 10s' },
  specUp:  { n:'被动 · 剑圣',  d:'居合·雪月花与追斩伤害 +50%' },
  leech2:  { n:'被动 · 噬魂',  d:'生命偷取 1% → 5%' }
};
// 升级播报：(from, to] 区间内解锁的技能名
function unlockNames(fromLv, toLv){
  const out = [];
  Object.keys(UNLOCK_LV).forEach(k=>{
    const info = UNLOCK_INFO[k];
    if(info && UNLOCK_LV[k] > fromLv && UNLOCK_LV[k] <= toLv) out.push('Lv.'+UNLOCK_LV[k]+' '+info.n);
  });
  return out;
}
// 全局暴击：所有攻击技能 30% 概率 ×2
const CRIT_CHANCE = 0.30, CRIT_MUL = 2;
const COMBO_UP = 0.20;    // 连招被动：Lv13 / Lv35 各 +20%（乘算）
const SPECIAL_UP = 1.5;   // Lv45：居合/追斩 ×1.5
function warcryDur(){ return P.level >= UNLOCK_LV.buffDur ? WARCRY.durMsUp : WARCRY.durMs; }

// ---------- 区域等级锁：击败该区域首领前，等级封顶，不能靠等级压制 ----------
const ZONE_CAPS = [
  { boss:'goblin_king',  cap:20 },   // 萤火森林
  { boss:'skeleton_gen', cap:30 },   // 遗忘遗迹
  { boss:'lizard_lord',  cap:40 },   // 幽暗矿洞
  { boss:'boss_samurai', cap:50 }    // 城寨深处（=满级）
];
function levelCap(){
  for(const z of ZONE_CAPS){
    if(!P.bossKills || !(P.bossKills[z.boss] > 0)) return z.cap;
  }
  return LEVEL_CAP;
}

// ---------- 商店配置（钻石为内购付费货币） ----------
const SHOP = {
  gold: [   // 金币包：花钻石买金币
    { name:'金币小袋', qty:1000, cost:20 },
    { name:'金币中袋', qty:3000, cost:50 },
    { name:'金币大袋', qty:8000, cost:120 }
  ],
  exp: [   // 经验书：只有一种书，三个档位卖不同本数（本数越多单价越划算）
    { name:'经验书',        books:1,  cost:10 },
    { name:'经验书 ×5',    books:5,  cost:45 },
    { name:'经验书 ×12',   books:12, cost:100 }
  ]
};
// 单本经验 = 当前级区间需求的 20%（比例制防通胀），档位按本数合计
const EXP_BOOK_FRAC = 0.20;
function expBookGain(item){
  const prev = P.level <= 1 ? 0 : expForLevel(P.level-1);
  const one = Math.max(1, Math.round((expForLevel(P.level) - prev) * EXP_BOOK_FRAC));
  return one * item.books;
}

// 经验曲线：返回值 = 升到 lv+1 所需的【累计】总经验
// （P.exp 为累计总经验，必须与累计阈值比较，否则一杀连锁升多级）
// 1~10 级低门槛快速解锁技能；11 级起二次陡增加长后期
function expForLevel(lv){
  if(lv <= 10) return Math.round(40 * (Math.pow(1.18, lv) - 1) / 0.18);          // 快速解锁期
  if(lv <= 20){                                                                    // 缓坡过渡期
    const t = lv - 10;
    return Math.round(expForLevel(10) + 300*t + 35*t*(t+1));
  }
  const t = lv - 20;                                                               // 后期陡增
  return Math.round(expForLevel(20) + 1500*t + 75*t*t + 25*(t*(t+1)*(2*t+1))/6);
}
// 当前级区间进度（UI 用）：本级已攒 / 本级区间 / 百分比
function expProgress(){
  const prev = P.level <= 1 ? 0 : expForLevel(P.level-1);
  const next = expForLevel(P.level);
  const span = Math.max(1, next - prev);
  const cur = Math.max(0, Math.min(P.exp, next) - prev);
  return { cur, span, pct: Math.floor(cur/span*100) };
}

// ---------- 武器阶级 ----------
const TIER_MAX = 6;
const TIER_ATK_PER = 0.15;   // 每阶攻击力 +15%
const TIER_GOLD_BASE = 50;    // 升阶金币 = 基础 × 目标阶数
function tierOf(id){ return P && P.weaponTier ? (P.weaponTier[id]||0) : 0; }
function tierAtkMul(id){ return 1 + TIER_ATK_PER * tierOf(id); }
function weaponAtk(id){
  const w = WEAPONS.find(x=>x.id===id);
  return w ? Math.round(w.atk * tierAtkMul(id)) : 0;
}
function tierUpCost(tier){ return TIER_GOLD_BASE * (tier+1); }  // 升到 tier+1 阶的金币消耗
