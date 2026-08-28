/* ============================================================
   main.js — 入口 + 事件绑定 + 战役解锁 + 锻造 + 存档
   ============================================================ */

// ---------- 存档（localStorage） ----------
const SAVE_KEY = 'zanji_save_v1';
// 跳过保存标记（删档后阻止 beforeunload 回写）
let skipSave = false;
// 只持久化成长数据，战斗内临时状态（HP/GCD/剑气等）不存
const SAVE_FIELDS = ['maxHp','atk','weapon','exp','level','gold','crystal',
                     'materials','kills','bossKills','weaponCount','weaponTier'];

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
    if(cur<3) return '需击杀「'+need+'」×'+(3-cur)+'/3';
  }
  if(enc.needBoss){
    const before = ENCOUNTERS.find(x=>x.key===enc.needBoss);
    const bossName = ENEMIES[enc.needBoss].name;
    if((P.bossKills[enc.needBoss]||0)<1){
      return (before?ENEMIES[before.key].name+'掉落物制造武器后，再击败「'+bossName+'」':' ');
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
  return 'Lv.'+P.level+' · 战力 <b>'+atk+'</b> · 武器 <b>'+weaponName()+'</b><br>'+
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
    head.innerHTML = '<span class="zh-arrow">▸</span><span class="zh-name">'+g.zone+'</span>';
    const body = document.createElement('div');
    body.className = 'zone-sec-body'+(i===0? ' open':'');
    g.items.forEach(enc=>{
      const e = ENEMIES[enc.key];
      const lock = encounterLock(enc);
      const card = document.createElement('div');
      card.className = 'zone-card'+(lock?' locked':'');
      const extra = enc.kind==='boss'
        ? ' · <span style="color:var(--crystal)">首领</span>'+(enc.recAtk? '推荐战力>'+enc.recAtk : '')
        : '';
      let autoLine = '';
      if(autoUnlocked() && !lock){
        const n = (P.kills[enc.key]||0) + (P.bossKills[enc.key]||0);
        autoLine = n>=10
          ? '<div class="z-auto ok">⚔ 可自动</div>'
          : '<div class="z-auto">自动·需击杀 '+(10-n)+'/10</div>';
      }
      card.innerHTML = '<div class="z-name">'+e.name+'</div>'+
        '<div class="z-info">'+(enc.kind==='boss'?'首领战':'刷怪')+extra+'</div>'+
        (lock? '<div class="z-lock">🔒 '+lock+'</div>' : '')+
        autoLine;
      card.onclick = ()=> enterGuard(enc, lock);
      body.appendChild(card);
    });
    head.onclick = ()=>{
      const open = body.classList.toggle('open');
      head.querySelector('.zh-arrow').textContent = open? '▾' : '▸';
    };
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
  while(P.exp >= expForLevel(P.level) && P.level < LEVEL_CAP){ P.level++; P.atk += 3; P.maxHp += 15; }
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
      const eff = cat==='gold' ? '获得金币 +'+item.qty : '获得经验 +'+item.qty;
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
  else if(cat==='exp'){ addExp(item.qty); toast('阅读 '+item.name+'！'); }
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
  const expNeed = expForLevel(P.level);
  const pct = Math.max(0, Math.min(100, Math.floor(P.exp/expNeed*100)));
  const res = MAT_ORDER.map(k=>'<span style="color:'+MATERIALS[k].color+'">'+MATERIALS[k].name+' '+ (P.materials[k]||0)+'</span>').join(' ');
  $('charStats').innerHTML =
    '<div class="lv-line">Lv.<b>'+P.level+'</b></div>'+
    '<div class="exp-bar"><div class="exp-fill" style="width:'+pct+'%"></div></div>'+
    '<div class="exp-line">经验 '+P.exp+' / '+expNeed+'（'+pct+'%）</div>'+
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
  // 技能条目：图标 / 名称 / 解锁徽章 / 效果描述
  const card = (icon, hue,name,effect,on,lv)=>'<div class="sk-item'+(on?' on':' off')+'">'+
    '<div class="sk-ico" style="filter:hue-rotate('+hue+'deg)"><img src="'+icon+'" alt=""></div>'+
    '<div class="sk-body"><div class="sk-head">'+name+chip(on,lv)+'</div>'+
    '<div class="sk-eff">'+effect+'</div></div></div>';
  // 合并连招拆分为独立段显示（斩三段 / 突两段）
  const rows = [];
  const lv1 = UNLOCK_LV.b1, lv2 = UNLOCK_LV.b2, lv3 = UNLOCK_LV.b3;
  // —— 斩三段 ——
  BTN1.forEach((s,i)=>{
    rows.push(card('img/ico_slash.svg',0,'斩 · 段'+(i+1)+' · '+s.name,
      '造成 '+chiTxt(s.mult)+' 伤害（GCD '+GCD_MS/1000+'s）'+(s.needChi? ' · 需「势」' : ' · 起手获「势」'+CHI_MS/1000+'s')+
      (i===2? ' · 雪❆印+剑气+'+QI_PER_SEAL+' · 锐锋+15%' : ''), P.level>=lv1, lv1));
  });
  // —— 突两段 ——
  BTN2.forEach((s,i)=>{
    rows.push(card('img/ico_slash.svg',40,'突 · 段'+(i+1)+' · '+s.name,
      '造成 '+chiTxt(s.mult)+' 伤害（GCD '+GCD_MS/1000+'s · 需「势」）'+(i===1? ' · 月☾印+剑气+'+QI_PER_SEAL+' · 迅疾GCD-10%' : ''), P.level>=lv2, lv2));
  });
  // —— 斩落 ——
  rows.push(card('img/ico_slash.svg',80,'斩落',
    '造成 '+chiTxt(BTN3.mult)+' 伤害（GCD '+GCD_MS/1000+'s · 需「势」）· 花❀印+剑气+'+QI_PER_SEAL, P.level>=lv3, lv3));
  // —— 格挡 / 居合 / 剑气一闪 / 战意高扬 / 追斩 ——
  rows.push(card('img/ico_shield.svg',0,'格挡',
    '持续 '+SHIELD.duration/1000+'s：受到伤害降低70% · 独立CD '+SHIELD.cd/1000+'s（不占GCD）· 成功减伤剑气+'+QI_PER_BLOCK, P.level>=UNLOCK_LV.shield, UNLOCK_LV.shield));
  rows.push(card('img/ico_hana.svg',0,ULT.name,
    '咏唱 '+ULT.castMs/1000+'s 后造成 攻击力×'+pct(ULT.dmgBase)+'（冷却自咏唱起 '+ULT.gcdMs/1000+'s）· 命中解锁追斩', P.level>=UNLOCK_LV.ult, UNLOCK_LV.ult));
  rows.push(card('img/ico_snow.svg',0,QISTRIKE.name,
    '剑气≥'+QISTRIKE.qiCost+' · 造成 攻击力×'+pct(QISTRIKE.dmgBase)+'（瞬发 · 独立CD '+QISTRIKE.cd/1000+'s · 不占GCD）', P.level>=UNLOCK_LV.qi, UNLOCK_LV.qi));
  rows.push(card('img/ico_hana.svg',40,WARCRY.name,
    '持续 '+WARCRY.durMs/1000+'s：伤害+'+Math.round((WARCRY.dmgMul-1)*100)+'% · 独立CD '+WARCRY.cd/1000+'s（不占GCD）', P.level>=UNLOCK_LV.buff, UNLOCK_LV.buff));
  rows.push(card('img/ico_moon.svg',0,FOLLOW.name,
    '居合后释放 · 造成 攻击力×'+pct(FOLLOW.dmgBase)+'（GCD '+FOLLOW.gcdMs/1000+'s · 不中断连段）', P.level>=UNLOCK_LV.follow, UNLOCK_LV.follow));
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
  ['iron','bone','crystal','soul'].forEach(k=>{
    if(wp.cost[k]){ const m=MATERIALS[k]; parts.push('<span style="color:'+m.color+'">'+m.name+'×'+wp.cost[k]+'</span>'); }
  });
  return parts.join(' ');
}
function costHtml(wp){
  const owned = MaterialOwnCounts();
  const okGold = wp.cost.gold===undefined || P.gold>=wp.cost.gold;
  const okMats = ['iron','bone','crystal','soul'].every(k=> !wp.cost[k] || (P.materials[k]||0)>=wp.cost[k]);
  const text = costText(wp);
  return (okGold&&okMats)
    ? '<span style="color:var(--green)">可锻造</span>'
    : '<span style="color:var(--red)">材料不足</span>';
}
function MaterialOwnCounts(){ return P.materials; }

function canAfford(wp){
  if(!wp.cost) return true;
  if(wp.cost.gold && P.gold<wp.cost.gold) return false;
  return ['iron','bone','crystal','soul'].every(k=> !wp.cost[k] || (P.materials[k]||0)>=wp.cost[k]);
}
function disabled(wp){
  // 初始武器可装备；锻造需材料，但可预览
  return false;
}

// 锻造复制品（已持有武器再锻一把，用于升阶）
function forgeCopy(wp){
  if(!canAfford(wp)){ toast('材料不足：'+costText(wp).replace(/<[^>]+>/g,'')); return; }
  if(wp.cost.gold) P.gold -= wp.cost.gold;
  ['iron','bone','crystal','soul'].forEach(k=>{ if(wp.cost[k]) P.materials[k]-=wp.cost[k]; });
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
      ['iron','bone','crystal','soul'].forEach(k=>{ if(wp.cost[k]) P.materials[k]-=wp.cost[k]; });
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
  ['iron','bone','crystal','soul'].forEach(k=>{ if(wp.cost[k]) P.materials[k]-=wp.cost[k]; });
  P.weaponCount[wp.id] = (P.weaponCount[wp.id]||0) + 1;
  P.weapon = wp.id;
  toast('锻造并装备 '+wp.name+'！');
  saveGame();
  renderChar(); renderForge();
}

window.addEventListener('load', init);
