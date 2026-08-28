/* ============================================================
   data.js — 数据配置 v2
   ============================================================ */

// ---------- 材料（品质 白/绿/蓝/紫） ----------
const MATERIALS = {
  iron:    { name:'玄铁碎片', color:'#c8c8d8', quality:1 },
  bone:    { name:'冥骨玉',   color:'#4dff88', quality:2 },
  crystal: { name:'幽晶矿',   color:'#4dc3ff', quality:3 },
  soul:    { name:'斩鬼之魂', color:'#a06aff', quality:4 }
};
const MAT_ORDER = ['iron','bone','crystal','soul'];

// ---------- 敌人类型 ----------
const ENEMIES = {
  // 区域1·萤火森林
  goblin:       { name:'哥布林',     hp:80,  atk:6,  def:0, exp:15,  gold:25,  img:'img/goblin.svg',          interval:2500,
                  drops:[{m:'iron', n:1}] },
  goblin_king:  { name:'哥布林大王', hp:450, atk:18, def:5, exp:120, gold:220, img:'img/goblin_king.svg',      interval:2600,
                  isBoss:true, castName:'蛮力劈斩', castEvery:3800, castTime:1400, castDmgMul:2.2,
                  drops:[{m:'iron', n:3},{m:'bone', n:1, chance:0.45}] },
  // 区域2·遗忘遗迹
  skeleton:     { name:'骷髅武士',   hp:200, atk:15, def:5, exp:45,  gold:60,  img:'img/skeleton.svg',        interval:2800,
                  drops:[{m:'bone', n:1}] },
  skeleton_gen: { name:'骷髅将军·骸',hp:1000,atk:30, def:12,exp:320, gold:520, img:'img/skeleton_general.svg',interval:2700,
                  isBoss:true, castName:'亡者军势', castEvery:3600, castTime:1400, castDmgMul:2.4,
                  drops:[{m:'bone', n:3},{m:'crystal', n:1, chance:0.4}] },
  // 区域3·幽暗矿洞
  lizard:       { name:'寻宝蜥蜴',   hp:520, atk:32, def:16,exp:110, gold:150, img:'img/lizard.svg',          interval:2600,
                  drops:[{m:'crystal', n:1}] },
  lizard_lord:  { name:'蜥蜴领主',   hp:2100,atk:52, def:26,exp:700, gold:1200,img:'img/lizard_lord.svg',     interval:2500,
                  isBoss:true, castName:'矿脉震荡', castEvery:3400, castTime:1300, castDmgMul:2.5,
                  drops:[{m:'crystal', n:3},{m:'soul', n:1, chance:0.35}] },
  // 区域4·城寨深处
  ronin:        { name:'无铭浪人',   hp:1300,atk:60, def:32,exp:280, gold:380, img:'img/ronin.svg',           interval:2400,
                  drops:[{m:'soul', n:1, chance:0.5}] },
  boss_samurai: { name:'幕末武士·斩',hp:4200,atk:78, def:40,exp:2000,gold:3000,img:'img/boss_samurai.svg',    interval:2300,
                  isBoss:true, castName:'真刀斩击', castEvery:3200, castTime:1200, castDmgMul:2.8,
                  drops:[{m:'soul', n:3}] }
};

// ---------- 战役关卡表（顺序即解锁顺序） ----------
// boss 需本区域小怪击杀 3 次；普通怪需上一关 boss 击杀
const ENCOUNTERS = [
  { key:'goblin',       zone:'萤火森林', label:'萤火森林 · 刷怪',   kind:'mob'  },
  { key:'goblin_king',  zone:'萤火森林', label:'萤火森林 · 首领',   kind:'boss', needKills:'goblin',        recAtk:15 },
  { key:'skeleton',     zone:'遗忘遗迹', label:'遗忘遗迹 · 刷怪',   kind:'mob',   needBoss:'goblin_king' },
  { key:'skeleton_gen', zone:'遗忘遗迹', label:'遗忘遗迹 · 首领',   kind:'boss',  needKills:'skeleton',     recAtk:32 },
  { key:'lizard',       zone:'幽暗矿洞', label:'幽暗矿洞 · 刷怪',   kind:'mob',   needBoss:'skeleton_gen' },
  { key:'lizard_lord',  zone:'幽暗矿洞', label:'幽暗矿洞 · 首领',   kind:'boss',  needKills:'lizard',       recAtk:55 },
  { key:'ronin',        zone:'城寨深处', label:'城寨深处 · 强敌',   kind:'mob',   needBoss:'lizard_lord' },
  { key:'boss_samurai', zone:'城寨深处', label:'城寨深处 · 最终对决',kind:'boss', needKills:'ronin',        recAtk:85 }
];

// ---------- 武器（12 把，材料逐级升高） ----------
const WEAPONS = [
{ id:'katana', name:'铁刀', atk:5, cost:{ iron:3, gold:40 } },  // 初始武器也有配方，可锻造复制品升阶
  // 区域1 白装
  { id:'w_temper', name:'淬火铁刀',      atk:10,  cost:{ iron:4,  gold:60 } },
  { id:'w_hund',   name:'百炼钢刀',      atk:16,  cost:{ iron:9,  gold:180 } },
  // 区域1→2 过渡（白+绿）
  { id:'w_byakuya',name:'白夜',          atk:24,  cost:{ iron:12, bone:4,  gold:400 } },
  // 区域2 绿装
  { id:'w_hone',   name:'骨纹刀·骸',     atk:34,  cost:{ bone:9,  gold:800 } },
  { id:'w_onikiri',name:'鬼切·骨魅',     atk:46,  cost:{ bone:14, crystal:3, gold:1500 } },
  // 区域3 蓝装
  { id:'w_mineko', name:'矿光太刀',      atk:60,  cost:{ crystal:9, gold:2600 } },
  { id:'w_zanko',  name:'幽晶刃·残光',   atk:76,  cost:{ crystal:14, soul:3, gold:4200 } },
  // 区域4 紫装
  { id:'w_muramasa',name:'妖刀·村正',    atk:95,  cost:{ soul:9,  gold:6500 } },
  { id:'w_ikkaku', name:'一期一振',      atk:118, cost:{ soul:16, gold:10000 } },
  // 最终武器
  { id:'w_zangetsu',name:'传说·翳月',    atk:150, cost:{ soul:28, crystal:20, gold:16000 } }
];

// ---------- 初始角色 ----------
const PLAYER_BASE = {
  maxHp:100, atk:12,
  weapon:'katana',
  exp:0, level:1,
  gold:100, crystal:10,
  materials: { iron:0, bone:0, crystal:0, soul:0 },
  kills: {}, bossKills: {},
  weaponCount: { katana:1 },   // 各武器持有数（含可消耗的复制品）
  weaponTier: {}               // 各武器阶级（0~6）
};

// 技能（倍率制：伤害 = 总攻击力 × 倍率；连招带释放条件与加成）
const GCD_MS = 1200;
const COMBO_TIMEOUT = 4000;
// 「势」：1-1「斩」命中后获得的连击资源；持续期间后续连段技 +50% 伤害
const CHI_MS = 30000;
const CHI_BONUS = 0.5;

// 按钮1（Lv1解锁）：三段斩 → 雪❆印 + 锐锋（+15%伤害 30s）
// mult 为攻击力百分比（10 = 100% 攻击力）
const BTN1 = [
  { name:'斩',    mult:10 },                             // 1-1 起手，获得「势」
  { name:'斩·贰', mult:13, needChi:true },               // 1-2 需「势」，+50%
  { name:'斩·叁', mult:18, needChi:true,                 // 1-3 收尾，+50%
    seal:'snow', buff:{ key:'zs', name:'锐锋', icon:'⚔', durMs:30000 } }
];
// 按钮2（Lv3解锁）：两段突刺 → 月☾印 + 迅疾（冷却-10% 30s）
const BTN2 = [
  { name:'突',    mult:14, needChi:true },               // 2-1 需「势」，+50%
  { name:'扫',    mult:20, needChi:true,                 // 2-2 收尾，+50%
    seal:'moon', buff:{ key:'cd', name:'迅疾', icon:'⚡', durMs:30000 } }
];
// 按钮3（Lv5解锁）：一击斩落 → 花❀印（无附加buff）
const BTN3 = { name:'斩落', mult:24, needChi:true, seal:'hana' };

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
const QISTRIKE = { name:'剑气·一闪', qiCost:50, dmgBase:26, cd:3000 };
// 战意高扬：15s 伤害加成 buff（不走公共GCD，有独立冷却）
const WARCRY = { name:'战意高扬', durMs:15000, dmgMul:1.2, cd:20000 };
const SHIELD = { cd:8000, duration:2000 };   // 格挡减伤窗口 2s
// 全局点击锁：所有技能按下后 0.1s 内不能再按任何技能
const PRESS_LOCK_MS = 100;
// 剑气资源
const QI_MAX = 100;
const QI_PER_SEAL = 20;    // 完整连招成印 +20
const QI_PER_BLOCK = 20;   // 格挡内受击成功减伤 +20

// ---------- 养成：等级上限与技能解锁 ----------
const LEVEL_CAP = 50;
const UNLOCK_LV = {
  b1:1,      // 连招按钮1（斩三段）
  b2:3,      // 连招按钮2（突两段）
  b3:5,      // 连招按钮3（斩落）→ 完整基础连招
  shield:7,  // 格挡
  ult:10,    // 居合（印记可用）
  qi:13,     // 剑气·一闪
  buff:15,   // 战意高扬
  follow:20  // 追斩 → 全技能解锁
};

// ---------- 商店配置（钻石为内购付费货币） ----------
const SHOP = {
  gold: [   // 金币包：花钻石买金币
    { name:'金币小袋', qty:1000, cost:20 },
    { name:'金币中袋', qty:3000, cost:50 },
    { name:'金币大袋', qty:8000, cost:120 }
  ],
  exp: [   // 经验书：花钻石买经验
    { name:'初级经验书', qty:200, cost:10 },
    { name:'中级经验书', qty:600, cost:25 },
    { name:'高级经验书', qty:1500, cost:50 }
  ]
};

function expForLevel(lv){ return lv*120; }

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
