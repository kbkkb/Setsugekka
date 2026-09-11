/* ============================================================
   main.js — 入口 + 事件绑定 + 战役解锁 + 锻造 + 存档
   ============================================================ */

// ---------- 存档（localStorage） ----------
const SAVE_KEY = 'zanji_save_v2';
// 跳过保存标记（删档后阻止 beforeunload 回写）
let skipSave = false;
// 只持久化成长数据，战斗内临时状态（HP/GCD/剑气等）不存
const SAVE_FIELDS = ['maxHp','atk','weapon','exp','level','gold','crystal',
                     'materials','kills','bossKills','weaponCount','weaponTier',
                     'arenaBest','arenaFirst','collOwn','collMax','tutDone'];

function saveGame(){
  if(skipSave) return;
  try{
    const d = {};
    SAVE_FIELDS.forEach(k=>{ d[k] = P[k]; });
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  }catch(e){ /* 隐私模式等场景下静默失败 */ }
}

function loadGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const d = JSON.parse(raw);
    SAVE_FIELDS.forEach(k=>{ if(d[k] !== undefined) P[k] = d[k]; });
    // 兜底：老档缺失字段用默认值补齐
    Object.keys(PLAYER_BASE).forEach(k=>{
      if(P[k] === undefined) P[k] = JSON.parse(JSON.stringify(PLAYER_BASE[k]));
    });
    // 老档迁移：weaponsOwned 数组 →  weaponCount/weaponTier
    if(d.weaponsOwned && Array.isArray(d.weaponsOwned)){
      P.weaponCount = {};
      d.weaponsOwned.forEach(id=>{ P.weaponCount[id] = (P.weaponCount[id]||0)+1; });
    }
    if(!P.weaponTier) P.weaponTier = {};
    if(!P.weaponCount) P.weaponCount = { katana:1 };
    return true;
  }catch(e){ return false; }
}

function wipeSave(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
}

// 顶部货币栏（非战斗界面显示数值）
function renderCurrency(){
  const tg = $('tGold'); if(tg) tg.textContent = P.gold;
  const tc = $('tCry'); if(tc) tc.textContent = P.crystal;
  const tm = $('tMat'); if(tm) tm.textContent = MAT_ORDER.reduce((s,k)=>s+(P.materials[k]||0),0);
}

// 界面切换（统一管理顶部货币栏与底部导航的显示/高亮）
// 战斗屏隐藏顶部货币栏与底部导航
function goScreen(name, navKey){
  Battle.showScreen(name);
  renderCurrency();
  const inBattle = (name === 'battle-screen');
  $('top-currency').style.display = inBattle ? 'none' : 'flex';
  $('reset-save').style.display = inBattle ? 'none' : 'flex';
  $('bottom-nav').style.display = inBattle ? 'none' : 'flex';
  $$('#bottom-nav .nav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.screen === navKey);
  });
}

// 进入战斗：由 Battle.enter 回调调用（其内部走 showScreen，不走 goScreen）
window.onBattleEnter = function(){
  $('top-currency').style.display = 'none';
  $('reset-save').style.display = 'none';
  $('bottom-nav').style.display = 'none';
  $$('#bottom-nav .nav-btn').forEach(b=>b.classList.remove('active'));
};

function init(){
  loadGame();
  // 技能按钮（GCD：1/2/3/ult/follow；非GCD：shield/qi/buff）
  // 长按 350ms 显示技能详情，松手关闭；长按后的抬起不触发放技能
  [['1','btnSkill1'],['2','btnSkill2'],['3','btnSkill3'],['ult','btnSkill4'],
   ['shield','btnSkill5'],['qi','btnSkill6'],['buff','btnSkill7'],['follow','btnSkill8']]
    .forEach(([key,id])=>{
      const btn = $(id);
      if(!btn) return;
      let holdT = null, tipShown = false;
      btn.addEventListener('pointerdown', ()=>{
        tipShown = false;
        holdT = setTimeout(()=>{ tipShown = true; Battle.showSkillTip(key); }, 350);
      });
      ['pointerup','pointerleave','pointercancel'].forEach(ev=>
        btn.addEventListener(ev, ()=>{ clearTimeout(holdT); Battle.hideSkillTip(); }));
      btn.onclick = ()=>{
        if(tipShown){ tipShown = false; return; }  // 长按查看详情，不施放
        Battle.onSkillPress(key, btn);
      };
    });

  // 撤退（返回选关界面并停止战斗）
  $('btnRetreat').onclick = ()=>{ Battle.backToZone(); goScreen('screen-zone','screen-zone'); };
  $('btnAuto').onclick = ()=>Battle.toggleAuto();
  // 提示按钮：随时重看游玩指南（弹窗打开期间战场暂停）
  $('btnHelp').onclick = ()=>{
    const p = $('tut-pop'); if(!p || p.classList.contains('show')) return;
    if(P.tutDone){ const g = $('tutGo'); if(g) g.textContent = '继续战斗'; }
    p.classList.add('show');
  };

  // 主页进入讨伐
  $('btnEnter').onclick = ()=>{ renderZonePanel(); goScreen('screen-zone','screen-zone'); };
  // 商店调试：内购钻石入口（原型阶段测试用）
  $('btnTestDiamond').onclick = ()=>{ P.crystal +=1000; saveGame(); renderShop(); renderCurrency(); toast('◆ +1000 钻石（调试）'); };
  // 左上角：清空存档（测试用）
  $('reset-save').onclick = ()=>{
    if(confirm('确定清空存档、重新开始？')){
      skipSave = true;   // 阻止卸载前的自动保存回写
      wipeSave();
      location.reload();
    }
  };
  // 底部导航
  [['navZone','screen-zone','renderZonePanel'],['navChar','screen-char','renderChar'],
   ['navForge','screen-forge','renderForge'],['navShop','screen-shop','renderShop']].forEach(([id,screen,fn])=>{
    $(id).onclick = ()=>{ if(fn) window[fn](); goScreen(screen, screen); };
  });

  // 锻造：左右切换 + 滑动切换
  $('fvPrev').onclick = ()=>forgeSwipe(-1);
  $('fvNext').onclick = ()=>forgeSwipe(1);
  const fv = $('forgeViewer');
  fv.addEventListener('pointerdown', e=>{ forgeStartX = e.clientX; });
  fv.addEventListener('pointerup', e=>{
    if(forgeStartX === null) return;
    const dx = e.clientX - forgeStartX;
    forgeStartX = null;
    if(dx < -30) forgeSwipe(1);
    else if(dx > 30) forgeSwipe(-1);
  });

  startTick();
  renderZonePanel();
  goScreen('screen-home', null);
}

// 关页/切后台时兜底保存
window.addEventListener('beforeunload', saveGame);
// 升阶：消耗 1 把同类复制品 + 金币（最高 6 阶）
function upgradeTier(wp){
  const tier = tierOf(wp.id);
  if(tier >= TIER_MAX){ toast('已是最高阶（'+TIER_MAX+'阶）'); return; }
  const have = P.weaponCount[wp.id]||0;
  if(have < 2){ toast('需再持有 1 把「'+wp.name+'」作升阶材料'); return; }
  const cost = tierUpCost(tier);
  if(P.gold < cost){ toast('金币不足：需 ◈'+cost); return; }
  P.gold -= cost;
  P.weaponCount[wp.id] --;
  P.weaponTier[wp.id] = (P.weaponTier[wp.id]||0)+1;
  toast('「'+wp.name+'」升阶至 '+(tier+1)+' 阶！攻击力提升');
  saveGame();
  renderChar(); renderForge();
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveGame(); });

// 自动战斗解锁（全局 + 单敌人）
// 全局：需击杀第一章首领「哥布林大王」；单敌人：需累计击杀该敌人 10 次
// 暴露给 battle.js 使用
function autoUnlocked(){ return (P.bossKills['goblin_king']||0) >= 1; }
function enemyAutoReady(key){
  const n = (P.kills[key]||0) + (P.bossKills[key]||0);
  return autoUnlocked() && n >= 10;
}
window.autoUnlockMsg = function(){
  if(!autoUnlocked()) return '击杀第一章首领「哥布林大王」后解锁自动';
  const key = E.key;
  const n = (P.kills[key]||0) + (P.bossKills[key]||0);
  if(n < 10) return '需累计击杀「'+ENEMIES[key].name+'」×'+(10-n)+'/10 后解锁自动';
  return null;
};

// 战役解锁判定
function encounterLock(enc){
  if(enc.needKills){
    const need = ENEMIES[enc.needKills].name;
    const cur = P.kills[enc.needKills]||0;
    if(cur<3) return '需击杀「'+need+'」'+cur+'/3';
  }
  if(enc.needBoss){
    const bossName = ENEMIES[enc.needBoss].name;
    if((P.bossKills[enc.needBoss]||0)<1){
      return '需击败「'+bossName+'」解锁';
    }
  }
  return null;
}

// 状态条：所有材料 + 金币 + 战力
function statLine(){
  const w = WEAPONS.find(x=>x.id===P.weapon);
  const atk = P.atk + weaponAtk(w.id);
  const mats = MAT_ORDER.map(k=>{
    const n=P.materials[k]||0;
    return n>0?'<span style="color:'+MATERIALS[k].color+'">'+MATERIALS[k].name+':'+n+'</span>':'';
  }).filter(Boolean).join(' ');
  return 'Lv.'+P.level+'/'+levelCap()+' · 战力 <b>'+atk+'</b> · 武器 <b>'+weaponName()+'</b><br>'+
    '◈ '+P.gold+' · '+(mats||'暂无材料')+' · ◆ '+P.crystal;
}

function renderZonePanel(){
  $('zonePlayerInfo').innerHTML = statLine();
  const zoneList = $('zoneList'); zoneList.innerHTML='';
  const groups = [];
  ENCOUNTERS.forEach(enc=>{
    const z = enc.zone;
    if(!groups.length || groups[groups.length-1].zone!==z) groups.push({ zone:z, items:[], });
    groups[groups.length-1].items.push(enc);
  });
  groups.forEach((g,i)=>{
    const sec = document.createElement('div');
    sec.className = 'zone-sec';
    const head = document.createElement('div');
    head.className = 'zone-head';
    head.textContent = '—— '+g.zone+' ——';
    const body = document.createElement('div');
    body.className = 'zone-sec-body';
    g.items.forEach(enc=>{
      const isArena = enc.kind==='arena';
      const e = isArena ? { name:'四王连战 · 剑心试炼场' } : ENEMIES[enc.key];
      const lock = encounterLock(enc);
      const card = document.createElement('div');
      card.className = 'zone-card'+(lock?' locked':'');
      const extra = enc.kind==='boss'
        ? ' · <span style="color:var(--crystal)">首领</span>'+(enc.recAtk? '推荐战力>'+enc.recAtk : '')
        : (isArena ? ' · <span style="color:var(--crystal)">觉醒四王</span>'+(enc.recAtk? '推荐战力>'+enc.recAtk : '') : '');
      const kindTxt = isArena
        ? '连战计时'+(P.arenaBest? ' · 最佳 '+fmtTime(P.arenaBest) : '')+(P.arenaFirst? ' · 首通✓' : ' · 首通奖◆'+ARENA_FIRST_REWARD)
        : (enc.kind==='boss'?'首领战':'刷怪');
      let autoLine = '';
      if(autoUnlocked() && !lock){
        const n = (P.kills[enc.key]||0) + (P.bossKills[enc.key]||0);
        autoLine = n>=10
          ? '<div class="z-auto ok">⚔ 可自动</div>'
          : '<div class="z-auto">自动·需击杀 '+(10-n)+'/10</div>';
      }
      card.innerHTML = '<div class="z-name">'+e.name+'</div>'+
        '<div class="z-info">'+kindTxt+extra+'</div>'+
        (lock? '<div class="z-lock">🔒 '+lock+'</div>' : '')+
        autoLine;
      card.onclick = ()=> enterGuard(enc, lock);
      body.appendChild(card);
    });
    sec.appendChild(head); sec.appendChild(body);
    zoneList.appendChild(sec);
  });
}
function enterGuard(enc, lock){
  if(lock){ toast(lock); return; }
  Battle.enter(enc.key);
}

// ---------- 经验书 ----------
function addExp(n){
  P.exp += n;
  const oldLv = P.level;
  while(P.exp >= expForLevel(P.level) && P.level < levelCap()){ P.level++; P.atk += 3; P.maxHp += 15; }
  if(P.level > oldLv){
    const u = unlockNames(oldLv, P.level);
    if(u.length) toast('🆕 '+u.join(' / '));
  }
  saveGame();
}

// ---------- 商店 ----------
const SHOP_HEAD = { gold:'金币', exp:'经验书' };
const SHOP_ICO  = { gold:'◆', exp:'✦' };
const SHOP_COLOR = { gold:'var(--gold)', exp:'#a87cff' };

function renderShop(){
  const list = $('shopList');
  if(!list) return;
  list.innerHTML='';
  Object.keys(SHOP).forEach(cat=>{
    const head = document.createElement('div');
    head.className = 'zone-head';
    head.textContent = '—— '+SHOP_HEAD[cat]+' ——';
    list.appendChild(head);
SHOP[cat].forEach(item=>{
      const eff = cat==='gold' ? '获得金币 +'+item.qty : '获得经验 +'+expBookGain(item)+'（'+item.books+'本 × 单级20%）';
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML =
        '<div><div class="f-name">'+item.name+'</div>'+
        '<div class="f-cost">'+eff+'</div></div>'+
        '<div class="shop-right"><span class="shop-cost">◆ '+item.cost+' 钻石</span><button class="btn shop-btn">购买</button></div>';
      div.querySelector('.shop-btn').onclick = ()=>buyShop(cat, item);
      list.appendChild(div);
    });
  });
}

function buyShop(cat, item){
  if(P.crystal < item.cost){ toast('钻石不足：需 ◆'+item.cost); return; }
  P.crystal -= item.cost;
  if(cat==='gold'){ P.gold += item.qty; toast('购买 '+item.name+' 成功！'); }
  else if(cat==='exp'){ const q = expBookGain(item); addExp(q); toast('阅读 '+item.name+'：经验 +'+q); }
  saveGame();
  renderShop();
  renderCurrency();
}

function weaponName(){
  const w = WEAPONS.find(x=>x.id===P.weapon);
  return w ? w.name : '?';
}

// ---------- 角色（状态总览） ----------
function renderChar(){
  const w = WEAPONS.find(x=>x.id===P.weapon);
  const cap = levelCap();
  const atCap = P.level >= cap;
  const pg = expProgress();
  const pct = atCap ? 100 : pg.pct;
  const expLine = atCap
    ? (cap>=LEVEL_CAP ? '经验 MAX · 已达满级' : '经验已积攒 '+P.exp+' · 等级上限 '+cap+'，击败本区域首领解锁')
    : '经验 '+pg.cur+' / '+pg.span+'（'+pg.pct+'%）';
  const res = MAT_ORDER.map(k=>'<span style="color:'+MATERIALS[k].color+'">'+MATERIALS[k].name+' '+ (P.materials[k]||0)+'</span>').join(' ');
  $('charStats').innerHTML =
    '<div class="lv-line">Lv.<b>'+P.level+'</b></div>'+
    '<div class="exp-bar"><div class="exp-fill" style="width:'+pct+'%"></div></div>'+
    '<div class="exp-line">'+expLine+'</div>'+
    '<div class="stat-line">生命 <b>'+P.maxHp+'</b> · 攻击 <b>'+(P.atk+weaponAtk(w.id))+'</b>（武器+'+weaponAtk(w.id)+'）</div>'+
    '<div class="stat-line">◈ 金币 '+P.gold+' · '+res+'</div>';
  // 更换武器按钮（打开二级弹窗）
  const btn = $('charWeaponBtn');
  if(btn){
    btn.innerHTML = '武器 '+weaponName()+' · 攻+'+weaponAtk(w.id)+'（'+tierOf(w.id)+'阶） ▸';
    btn.onclick = openWeaponPick

  }
  renderCharSkills();
}
function openWeaponPick(){
  renderWeaponCards();
  const p = $('weaponPick'); if(p) p.classList.add('show');
}
function closeWeaponPick(){
  const p = $('weaponPick'); if(p) p.classList.remove('show');
}
function renderWeaponCards(){
  const wb = $('charWeapons'); if(!wb) return;
  wb.innerHTML = WEAPONS.map(wp=>{
    const owned = isWeaponOwned(wp.id);
    const isEq = P.weapon===wp.id;
    const atk = weaponAtk(wp.id);
    const stars = Array.from({length:TIER_MAX},(_,i)=>'<span class="fv-star'+(i<tierOf(wp.id)?' on':'')+'">✦</span>').join('');
    return '<div class="wp-card'+(isEq?' eq':'')+(!owned?' locked':'')+'" data-id="'+wp.id+'">'+
      '<img class="wp-ico" src="img/ico_slash.svg" style="filter:hue-rotate('+FORGE_HUES[WEAPONS.indexOf(wp)%FORGE_HUES.length]+'deg)"></img>'+
      '<div class="wp-name">'+wp.name+'</div>'+
      '<div class="wp-atk">攻+'+atk+'</div>'+
      '<div class="wp-tier">'+stars+'</div>'+
      (owned? (isEq? '<div class="wp-badge eq">装备中</div>':'<div class="wp-badge">点击装备</div>') : '<div class="wp-badge">未拥有</div>')+'</div>';
  }).join('');
  wb.querySelectorAll('.wp-card').forEach(c=>{
    c.onclick = ()=>{
      const id = c.dataset.id;
      if(!isWeaponOwned(id)){ toast('尚未拥有该武器'); return; }
      equipWeapon(WEAPONS.find(x=>x.id===id));
      closeWeaponPick(); renderChar();
    };
  });
  const close = $('weaponPickClose'); if(close) close.onclick = closeWeaponPick;

  const ov = $('weaponPick'); if(ov) ov.onclick = (e)=>{ if(e.target===ov) closeWeaponPick(); };
}
function renderCharSkills(){
  const box = $('charSkills'); if(!box) return;
  const pct = m => Math.round(m*10)+'%';
  const chiTxt = m => pct(m)+'（有「势」'+pct(Math.round(m*(1+CHI_BONUS)))+'）';
  const chip = (on,lv)=>'<span class="sk-chip'+(on?' on':' off')+'">'+(on? '已解锁' : 'Lv.'+lv+' 解锁')+'</span>';
  // 技能条目：图标 / 名称 / 解锁徽章 / 效果描述（被动带紫色标记）
  const card = (icon, hue,name,effect,on,lv,psv)=>'<div class="sk-item'+(on?' on':' off')+(psv?' psv':'')+'">'+
    '<div class="sk-ico" style="filter:hue-rotate('+hue+'deg)"><img src="'+icon+'" alt=""></div>'+
    '<div class="sk-body"><div class="sk-head">'+name+chip(on,lv)+'</div>'+
    '<div class="sk-eff">'+effect+'</div></div></div>';
  const rows = [];
  const lv1 = UNLOCK_LV.b1, lv2 = UNLOCK_LV.b2, lv3 = UNLOCK_LV.b3;
  const flagName = { A:'势', B:'续势', C:'锐势' };
  // —— 1-x 连击 flag 链 ——
  BTN1.forEach((s,i)=>{
    const cond = i===0 ? '唯一起手 · 无需条件' : '需连击条件「'+flagName[s.req]+'」（消耗）';
    const give = i===0 ? ' · 成功后给「势」→ 可续 1-2 / 2-1 / 3-1' :
                 i===1 ? ' · 成功后给「续势」→ 可续 1-3' : ' · 收招凝聚雪❆印 · 锐锋+15%';
    rows.push(card('img/ico_slash.svg',0,'1-'+(i+1)+' '+s.name,
      cond+' · 造成 '+pct(s.mult)+' 伤害'+give+' · GCD '+GCD_MS/1000+'s · 30%暴击', P.level>=lv1, lv1));
  });
  BTN2.forEach((s,i)=>{
    const give = i===0? ' · 成功后给「锐势」→ 可续 2-2' : ' · 收招凝聚月☾印 · 迅疾GCD-10%';
    rows.push(card('img/ico_slash.svg',40,(i===0?'2-1 突':'2-2 扫'),
      '需连击条件「'+flagName[s.req]+'」（消耗） · 造成 '+pct(s.mult)+' 伤害'+give+' · GCD '+GCD_MS/1000+'s · 30%暴击', P.level>=lv2, lv2));
  });
  rows.push(card('img/ico_slash.svg',80,'3-1 斩落',
    '需连击条件「'+flagName[BTN3.req]+'」（消耗） · 造成 '+pct(BTN3.mult)+' 伤害 · 收招凝聚花❀印 · 最短成印路线 · GCD '+GCD_MS/1000+'s · 30%暴击', P.level>=lv3, lv3));
  // —— 按等级排序的主动/被动条目 ——
  const entries = [
    { k:'shield',  ico:'img/ico_shield.svg', hue:0,
      eff:'持续 '+SHIELD.duration/1000+'s：受到伤害降低70% · 独立CD '+SHIELD.cd/1000+'s · 可反制敌方读条' },
    { k:'ult',     ico:'img/ico_hana.svg', hue:0, crit:1,
      eff:'咏唱 '+ULT.castMs/1000+'s 后造成 攻击力×'+pct(ULT.dmgBase)+'（冷却自咏唱起 '+ULT.gcdMs/1000+'s）· 命中解锁追斩' },
    { k:'atkUp1',  ico:'img/ico_slash.svg', hue:90 },
    { k:'qi',      ico:'img/ico_snow.svg', hue:0, crit:1,
      eff:'剑气≥'+QISTRIKE.qiCost+' · 造成 攻击力×'+pct(QISTRIKE.dmgBase)+'（瞬发 · 独立CD '+QISTRIKE.cd/1000+'s · 不占GCD）' },
    { k:'qiSrc',   ico:'img/ico_snow.svg', hue:120 },
    { k:'leech1',  ico:'img/ico_slash.svg', hue:150 },
    { k:'buff',    ico:'img/ico_hana.svg', hue:40,
      eff:'基础8s（Lv40被动→10s）：伤害+'+Math.round((WARCRY.dmgMul-1)*100)+'% · 独立CD '+WARCRY.cd/1000+'s' },
    { k:'follow',  ico:'img/ico_moon.svg', hue:0, crit:1,
      eff:'居合后释放 · 造成 攻击力×'+pct(FOLLOW.dmgBase)+'（GCD '+FOLLOW.gcdMs/1000+'s · 不中断连段）' },
    { k:'shieldCd',ico:'img/ico_shield.svg', hue:60 },
    { k:'atkUp2',  ico:'img/ico_slash.svg', hue:210 },
    { k:'buffDur', ico:'img/ico_hana.svg', hue:240 },
    { k:'specUp',  ico:'img/ico_hana.svg', hue:270 },
    { k:'leech2',  ico:'img/ico_slash.svg', hue:300 }
  ];
  entries.forEach(en=>{
    const info = UNLOCK_INFO[en.k], lv = UNLOCK_LV[en.k];
    const eff = en.eff || info.d;
    const isPsv = info.n.indexOf('被动') === 0;
    rows.push(card(en.ico, en.hue, info.n, eff + (en.crit? ' · 30%暴击' : ''), P.level>=lv, lv, isPsv));
  });
  box.innerHTML = rows.join('');
}// ---------- 锻造（武器查看器·轮播） ----------
let forgeIdx = 0, forgeStartX = null;
// 每把武器的图标色相偏移（12 把循环用）
const FORGE_HUES = [0,40,80,120,160,200,240,280,320,0,40,80];

function renderForge(){
  // 初始定位到当前装备的武器
  const eqIdx = WEAPONS.findIndex(w=>w.id===P.weapon);
  if(eqIdx >= 0) forgeIdx = eqIdx;
  renderForgeView();
  renderForgeMats();
  renderCollection();
}

// 武器图鉴：收集全部 / 全部满阶，达成自动发钻石
function renderCollection(){
  const box = $('forgeColl'); if(!box) return;
  const all = WEAPONS.length;
  const ownedN = WEAPONS.filter(w=>isWeaponOwned(w.id)).length;
  const maxN = WEAPONS.filter(w=>isWeaponOwned(w.id) && tierOf(w.id)>=TIER_MAX).length;
  if(ownedN>=all && !P.collOwn){
    P.collOwn = true; P.crystal += COLL_OWN_REWARD; saveGame(); renderCurrency();
    toast('📖 图鉴达成：集齐全部武器 ◆+'+COLL_OWN_REWARD);
  }
  if(maxN>=all && !P.collMax){
    P.collMax = true; P.crystal += COLL_MAX_REWARD; saveGame(); renderCurrency();
    toast('👑 图鉴达成：全部武器满阶 ◆+'+COLL_MAX_REWARD);
  }
  box.innerHTML = '<span class="fc-label">📖 武器图鉴</span>'+
    '<span class="fc-chip'+(P.collOwn?' got':'')+'">收集 '+ownedN+'/'+all+(P.collOwn?' ✓已领':' ·◆'+COLL_OWN_REWARD)+'</span>'+
    '<span class="fc-chip'+(P.collMax?' got':'')+'">满阶 '+maxN+'/'+all+(P.collMax?' ✓已领':' ·◆'+COLL_MAX_REWARD)+'</span>';
}

// 材料总览条：显示全部材料与数量（为 0 也显示，置灰）
function renderForgeMats(){
  const box = $('forgeMats'); if(!box) return;
  box.innerHTML = MAT_ORDER.map(k=>{
    const n = P.materials[k]||0;
    return '<span class="fm'+(n>0?'':' none')+'"><span class="fm-ico" style="color:'+MATERIALS[k].color+'">◆</span>'+MATERIALS[k].name+' <b>'+n+'</b></span>';
  }).join('');
}

function renderForgeView(){
  const wp = WEAPONS[forgeIdx];
  if(!wp) return;
  const owned = isWeaponOwned(wp.id);
  const equipped = P.weapon===wp.id;

  // 武器图（用色相区分）
  const img = $('fvImg');
  if(img){ img.style.filter = 'hue-rotate('+FORGE_HUES[forgeIdx % FORGE_HUES.length]+'deg) saturate(1.3)'; }
 
  $('fvName').textContent = wp.name;
  $('fvStat').innerHTML = '攻击力 <b style="color:var(--gold)">+'+weaponAtk(wp.id)+'</b>'+(equipped? ' · <span style="color:var(--green)">装备中</span>':'');
  // 阶级（0~6 星标）
  const tierStars = Array.from({length:TIER_MAX},(_,i)=>'<span class="fv-star'+(i<tierOf(wp.id)?' on':'')+'">✦</span>').join('');
  $('fvTier').innerHTML = '<span class="fv-tier-lbl">阶级</span>'+tierStars;
// 持有情况
  let ownTxt, ownCls;
  const copies = P.weaponCount[wp.id]||0;
  if(equipped){ ownTxt='当前装备'; ownCls='ok'; }
  else if(owned){ ownTxt='已持有'; ownCls='ok'; }
  else { ownTxt='未锻造'; ownCls='no'; }
  $('fvOwn').innerHTML = '<span class="fv-own-'+ownCls+'">'+ownTxt+' · 持有 '+copies+' 把</span>';

 // 升阶按钮
  const upg = $('fvUpg');
  if(upg){
    const tier = tierOf(wp.id);
    const canUpg = owned && copies >= 2 && tier < TIER_MAX;
    upg.textContent = tier >= TIER_MAX ? '已满阶（'+TIER_MAX+'）'
      : (owned? '升阶 · 消耗1把同款 · ◈'+tierUpCost(tier) : '—');
    upg.disabled = !canUpg;
    upg.classList.toggle('disabled', !canUpg);
    upg.onclick = ()=>upgradeTier(wp);
  }
 
  // 锻造需求
  $('fvReq').innerHTML = wp.cost ? costText(wp) : '<span class="muted">初始武器 · 无需锻造</span>';
 
  // 锻造按钮（独立）：未拥有→锻造并装备；已拥有→锻造复制品（用于升阶）
  const forge = $('fvForge');
  if(forge){
    if(!owned){
      forge.textContent = canAfford(wp) ? '锻造并装备' : '材料不足';
      forge.disabled = !canAfford(wp);
      forge.onclick = ()=>forgeOrEquip(wp);
    } else {
      forge.textContent = canAfford(wp) ? '锻造复制品' : '材料不足';
      forge.disabled = !canAfford(wp);
      forge.onclick = ()=>forgeCopy(wp);
    }
    forge.classList.toggle('disabled', !canAfford(wp));
  }

  // 装备按钮（独立）：已拥有未装备时显示
  const eq = $('fvEquip');
  if(eq){
    const showEquip = owned && !equipped;
    eq.style.display = showEquip ? '' : 'none';
    eq.textContent = '装备';
    eq.onclick = ()=>equipWeapon(wp);
  }

  // 升阶按钮
  const upg2 = $('fvUpg');
  if(upg2){
    const tier = tierOf(wp.id);
    const canUpg = owned && copies >= 2 && tier < TIER_MAX;
    upg2.textContent = tier >= TIER_MAX ? '已满阶（'+TIER_MAX+'）'
      : (owned? '升阶 · 消耗1把同款 · ◈'+tierUpCost(tier) : '未锻造不可升阶');
    upg2.disabled = !canUpg;
    upg2.classList.toggle('disabled', !canUpg);
    upg2.onclick = ()=>upgradeTier(wp);
  }
 
  // 圆点指示
  const dots = $('fvDots');
  dots.innerHTML = WEAPONS.map((w,i)=>'<span class="fv-dot'+(i===forgeIdx?' on':'')+'"></span>').join('');
}

function forgeSwipe(dir){
  forgeIdx = (forgeIdx + dir + WEAPONS.length) % WEAPONS.length;
  renderForgeView();
}

function isWeaponOwned(id){ return (P.weaponCount[id]||0) > 0; }

function costText(wp){
  const parts = [];
  if(wp.cost.gold) parts.push('◈'+wp.cost.gold);
  MAT_ORDER.forEach(k=>{
    if(wp.cost[k]){ const m=MATERIALS[k]; parts.push('<span style="color:'+m.color+'">'+m.name+'×'+wp.cost[k]+'</span>'); }
  });
  return parts.join(' ');
}
function costHtml(wp){
  const owned = MaterialOwnCounts();
  const okGold = wp.cost.gold===undefined || P.gold>=wp.cost.gold;
  const okMats = MAT_ORDER.every(k=> !wp.cost[k] || (P.materials[k]||0)>=wp.cost[k]);
  const text = costText(wp);
  return (okGold&&okMats)
    ? '<span style="color:var(--green)">可锻造</span>'
    : '<span style="color:var(--red)">材料不足</span>';
}
function MaterialOwnCounts(){ return P.materials; }

function canAfford(wp){
  if(!wp.cost) return true;
  if(wp.cost.gold && P.gold<wp.cost.gold) return false;
  return MAT_ORDER.every(k=> !wp.cost[k] || (P.materials[k]||0)>=wp.cost[k]);
}
function disabled(wp){
  // 初始武器可装备；锻造需材料，但可预览
  return false;
}

// 锻造复制品（已持有武器再锻一把，用于升阶）
function forgeCopy(wp){
  if(!canAfford(wp)){ toast('材料不足：'+costText(wp).replace(/<[^>]+>/g,'')); return; }
  if(wp.cost.gold) P.gold -= wp.cost.gold;
  MAT_ORDER.forEach(k=>{ if(wp.cost[k]) P.materials[k]-=wp.cost[k]; });
  P.weaponCount[wp.id]=(P.weaponCount[wp.id]||1)+1;
  toast('锻造 '+wp.name+' 复制品×1！');
  saveGame(); renderChar(); renderForge();
}
function equipWeapon(wp){
  P.weapon = wp.id;
  toast('装备 '+wp.name);
  saveGame(); renderChar(); renderForge();
}

function forgeOrEquip(wp){
  if(isWeaponOwned(wp.id)){
    if(canAfford(wp) && wp.cost){
      if(wp.cost.gold) P.gold -= wp.cost.gold;
      MAT_ORDER.forEach(k=>{ if(wp.cost[k]) P.materials[k]-=wp.cost[k]; });
      P.weaponCount[wp.id] = (P.weaponCount[wp.id]||1)+1;
      toast('锻造 '+wp.name+' 复制品×1！可用于升阶');
      saveGame(); renderChar(); renderForge(); return;
    }
    P.weapon = wp.id;
    toast('装备 '+wp.name);
    saveGame(); renderChar(); renderForge(); return;
  }
  if(!wp.cost){ toast('初始武器已领取'); return; }
  if(!canAfford(wp)){ toast('材料不足：'+costText(wp).replace(/<[^>]+>/g,'')); return; }
  // 消耗
  if(wp.cost.gold) P.gold -= wp.cost.gold;
  MAT_ORDER.forEach(k=>{ if(wp.cost[k]) P.materials[k]-=wp.cost[k]; });
  P.weaponCount[wp.id] = (P.weaponCount[wp.id]||0) + 1;
  P.weapon = wp.id;
  toast('锻造并装备 '+wp.name+'！');
  saveGame();
  renderChar(); renderForge();
}

window.addEventListener('load', init);
