/* ============================================================
   battle.js — 核心战斗逻辑（时间戳驱动 · 轮换连段 + 雪月花印）
   ============================================================ */

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ---------- 玩家状态 ----------
const P = {
  ...JSON.parse(JSON.stringify(PLAYER_BASE)),
  hp: PLAYER_BASE.maxHp,
  def: 0,
  buf: '',              // 连段输入缓冲 "1"/"11"/"12"
  bufUntil: 0,          // 缓冲超时时间戳
  stage: { 1:0, 2:0 },  // 按钮轮换阶段
  seals: { snow:false, moon:false, hana:false },
  gcdUntil: 0,
  gcdTotal: 1,
  shieldUntil: 0,
  shieldCdUntil: 0,
  shieldCdTotal: 1,
  qi: 0,                // 剑气值
  pressLockUntil: 0,    // 全局点击锁（0.1s 防连点）
  buffUntil: 0,         // 战意高扬结束时间
  ultFollowReady: false, // 大招后可接追斩
  qiCdUntil: 0, qiCdTotal: 1,      // 一闪独立冷却
  buffCdUntil: 0, buffCdTotal: 1,  // 战意独立冷却
  casting: null,          // 咏唱中 {action, until, total}
  chiUntil: 0,            // 「势」结束时间（连击资源）
  zsUntil: 0,             // 锐锋 buff（+15%伤）
  cdBuffUntil: 0          // 迅疾 buff（GCD-10%）
};

// ---------- 敌人状态 ----------
const E = {
  key: null,
  data: null,
  zone: null,
  attackTimer: null,
  casting: false,
  nextCastAt: 0,
  castEndAt: 0
};

const TICK_MS = 100;
const BADGES = ['Ⅰ','Ⅱ','Ⅲ'];
const TINTS  = ['', 'hue-rotate(120deg) saturate(1.4)', 'hue-rotate(240deg) saturate(1.4)'];
// GCD 技能动作表（其余为非 GCD：shield / qi / buff）
const GCD_ACTIONS = ['1','2','3','ult','follow'];

// 白色/金色火花元素
function TSPARK(){
  const s = document.createElement('div');
  s.className = 'drop-spark';
  return s;
}

// ---------- 战斗管理器 ----------
const Battle = {
  log: [],
  active: false,
  lastDrops: [],
  auto: false,   // 自动连招（仅连招/大招，不格挡）

  playerAtk(){
    const w = WEAPONS.find(x=>x.id===P.weapon);
    return P.atk + weaponAtk(P.weapon);
  },

  enter(encKey){
    const enc = ENCOUNTERS.find(x=>x.key===encKey);
    if(!enc) return;
    const e = ENEMIES[encKey];
    E.key = encKey;
    E.enc = enc;
    E.data = {
      name: e.name,
      maxHp: e.hp, hp: e.hp,
      atk: e.atk, def: e.def,
      exp: e.exp, gold: e.gold,
      img: e.img, drops: e.drops||[],
      interval: e.interval,
      isBoss: !!e.isBoss,
      castName: e.castName, castEvery: e.castEvery, castTime: e.castTime,
      castDmgMul: e.castDmgMul
    };
    E.casting = false;
    E.nextCastAt = Date.now() + (e.castEvery || 4000);
    E.castEndAt = 0;

    P.hp = P.maxHp;
    P.buf = ''; P.bufUntil = 0;
    P.stage[1] = 0; P.stage[2] = 0;
    P.seals = { snow:false, moon:false, hana:false };
    P.gcdUntil = 0;
    P.shieldUntil = 0;
    P.shieldCdUntil = 0;
    P.qi = 0;
    P.pressLockUntil = 0;
    P.buffUntil = 0;
    P.ultFollowReady = false;
    P.qiCdUntil = 0; P.buffCdUntil = 0;
    P.casting = null;
    P.chiUntil = 0; P.zsUntil = 0; P.cdBuffUntil = 0;
    this.hideCastBar();
    this.log = [];
    this.lastDrops = [];
    this.active = true;
    this.setAuto(false);

    // 清理上次战斗残留（消逝动画/喷泉/结算）
    this._settleTimer && clearTimeout(this._settleTimer);
    if($('enemy-sprite')) $('enemy-sprite').classList.remove('dying');
    if($('kill-burst')) $('kill-burst').classList.remove('go');
    const dl = $('drop-layer'); if(dl) dl.innerHTML = '';
    if($('overlay')) $('overlay').classList.remove('show');

    $('boss-name').textContent = E.data.name;
    const blv = $('bossLv'); if(blv) blv.textContent = E.data.isBoss ? '首领' : '小怪';
    const bh = $('boss-hp-text'); if(bh) bh.textContent = E.data.hp+'/'+E.data.maxHp;
    $('enemy-img').src = E.data.img;
    $('enemy-img').className = E.data.isBoss ? 'boss' : '';
    $('zoneName').textContent = enc.label;
    this.renderButtons();
    this.renderSeals();
    this.renderQi();
    this.renderFollow();
    this.renderHp();

    this.startEnemyAttack();
    this.showScreen('battle-screen');
    // 通知界面层：隐藏顶部货币栏与底部导航（若定义了）
    if(window.onBattleEnter) window.onBattleEnter();
    this.logPush('遭遇 <b style="color:var(--red)">'+E.data.name+'</b>');
  },

  startEnemyAttack(){
    this.stopEnemyAttack();
    E.attackTimer = setInterval(()=>{
      if(!this.active || !E.data || E.data.hp<=0) return;
      if(E.casting) return;
      const now = Date.now();
      let dmg = Math.max(1, Math.round(E.data.atk - P.def + Math.random()*4));
      if(now < P.shieldUntil){
        // 格挡窗口内：成功减伤 +20 剑气
        dmg = Math.max(1, Math.round(dmg*0.3));
        P.qi = Math.min(QI_MAX, P.qi + QI_PER_BLOCK);
        this.logPush('<span class="qi">🛡 减伤成功 -'+dmg+' · 剑气+'+QI_PER_BLOCK+'</span>');
        this.renderQi();
      } else {
        this.logPush('<span class="dmg-ene">'+E.data.name+' 攻击 → '+dmg+'</span>');
      }
      P.hp = Math.max(0, P.hp - dmg);
      if(P.hp<=0){ this.onDeath(); return; }
      this.renderHp();
    }, E.data.interval);
  },
  stopEnemyAttack(){ if(E.attackTimer){ clearInterval(E.attackTimer); E.attackTimer=null; } },

  // 动作键:
  //   GCD 技能    : '1'|'2'|'3' 连招 | 'ult' 居合 | 'follow' 追斩
  //   非 GCD 技能 : 'shield' 格挡 | 'qi' 剑气·一闪 | 'buff' 战意高扬
  // 所有技能共用 0.1s 点击锁；非 GCD 只受点击锁限制，不显示倒计时遮罩，
  // 因此可在两个 GCD 技能的等待间隙插入非 GCD 技能打伤害。
  onSkillPress(action, btn){
    if(!this.active || !E.data || E.data.hp<=0) return;
    const now = Date.now();

    // ---- 全局点击锁（所有技能通用，防快速连点）----
    if(now < P.pressLockUntil) return;
    P.pressLockUntil = now + PRESS_LOCK_MS;

    // ---- 等级解锁门控 ----
    const UNLOCK_OF = {'1':'b1','2':'b2','3':'b3',ult:'ult',follow:'follow',shield:'shield',qi:'qi',buff:'buff'};
    const uKey = UNLOCK_OF[action];
    if(uKey && P.level < UNLOCK_LV[uKey]){
      this.logPush('<span class="warn">🔒 「'+this.actionName(action)+'」需 '+UNLOCK_LV[uKey]+' 级解锁</span>');
      return;
    }

    // ---- GCD 检查（仅 GCD 技能；咏唱期间封锁其他 GCD 技）----
    if(GCD_ACTIONS.indexOf(action)>=0){
      if(P.casting){ this.logPush('咏唱中…'); return; }
      if(now < P.gcdUntil){ this.logPush('冷却中…'); return; }
    }

    // ================= 非 GCD 技能 =================

    // ---- 格挡：2s 减伤窗，受击成功减伤 +20 剑气；可反制读条 ----
    if(action === 'shield'){
      if(now < P.shieldCdUntil){ this.logPush('格挡冷却中'); return; }
      P.shieldUntil = now + SHIELD.duration;
      P.shieldCdUntil = now + SHIELD.cd;
      P.shieldCdTotal = SHIELD.cd;
      this.logPush('<span class="dmg-def">🛡 格挡姿态（减伤2s，受击+剑气）</span>');
      this.flash(btn);
      return;
    }

    // ---- 剑气·一闪：消耗 50 剑气瞬发伤害（独立冷却3s，不占公共GCD）----
    if(action === 'qi'){
      if(now < P.qiCdUntil){ this.logPush('一闪冷却中…'); return; }
      if(P.qi < QISTRIKE.qiCost){
        this.logPush('<span class="warn">剑气不足 '+P.qi+'/'+QISTRIKE.qiCost+'</span>');
        return;
      }
      P.qi -= QISTRIKE.qiCost;
      P.qiCdTotal = QISTRIKE.cd; P.qiCdUntil = now + QISTRIKE.cd;
      const dmg = this.calcDamage(QISTRIKE.dmgBase);
      E.data.hp = Math.max(0, E.data.hp - dmg);
      this.logPush('<span class="qi">⚡ '+QISTRIKE.name+' → <b>'+dmg+'</b></span>');
      this.floatDmg(dmg, false);
      this.showSlashEffect(); this.flash(btn);
      this.renderQi();
      if(E.data.hp<=0){ this.onKill(); }
      return;
    }

    // ---- 战意高扬：15s 伤害 +20%（独立冷却20s，不占公共GCD）----
    if(action === 'buff'){
      if(now < P.buffCdUntil){ this.logPush('战意冷却中…'); return; }
      P.buffUntil = now + WARCRY.durMs;
      P.buffCdTotal = WARCRY.cd; P.buffCdUntil = now + WARCRY.cd;
      this.logPush('<span class="warn">🔥 '+WARCRY.name+'：伤害+20%（15s）</span>');
      this.flash(btn);
      return;
    }

    // ================= GCD 技能 =================

    // ---- 居合·雪月花：咏唱 1.5s 后生效；咏唱开始即进入冷却 ----
    if(action === 'ult'){
      if(P.casting){ this.logPush('咏唱中…'); return; }
      if(!(P.seals.snow && P.seals.moon && P.seals.hana)){
        this.logPush('<span class="warn">三印未齐（雪❆ 月☾ 花❀）</span>');
        return;
      }
      P.seals = { snow:false, moon:false, hana:false };
      // 咏唱不中断连击：延长连击窗口
      if(P.buf) P.bufUntil = now + COMBO_TIMEOUT;
      // 冷却从咏唱开始时计算（而非咏唱结束时）
      this.setGcd(ULT.gcdMs);
      P.casting = { action:'ult', until: now + ULT.castMs, total: ULT.castMs };
      const cb = $('cast-bar');
      if(cb){
        $('cast-text').textContent = '咏唱中 · '+ULT.name;
        const cf = $('cast-fill'); if(cf) cf.style.width = '0%';
        cb.classList.add('show');
      }
      this.logPush('<span class="warn">开始咏唱「居合·雪月花」…</span>');
      this.renderSeals();
      this.flash(btn);
      return;
    }

    // ---- 追斩·残月：大招后续连击技（走 GCD）----
    if(action === 'follow'){
      if(!P.ultFollowReady){
        this.logPush('<span class="muted">「'+FOLLOW.name+'」需在释放居合后使用</span>');
        return;
      }
      P.ultFollowReady = false;
      // 追斩不中断连招：延长连击窗口（与居合同理）
      if(P.buf) P.bufUntil = now + COMBO_TIMEOUT;
      const dmg = this.calcDamage(FOLLOW.dmgBase);
      E.data.hp = Math.max(0, E.data.hp - dmg);
      this.logPush('<span class="dmg-you">'+FOLLOW.name+' → <b>'+dmg+'</b></span>');
      this.floatDmg(dmg, true);
      this.showSlashEffect(); this.flash(btn);
      this.setGcd(FOLLOW.gcdMs);
      this.renderFollow();
      if(E.data.hp<=0){ this.onKill(); } else this.renderHp();
      return;
    }

    // ---- 普通轮换技（连招：条件 + 「势」加成 + 收尾结算）----
    const hasChi = now < P.chiUntil;
    let skill, st = null;
    if(action==='1'){ st = P.stage[1]; skill = BTN1[st]; }
    else if(action==='2'){ st = P.stage[2]; skill = BTN2[st]; }
    else { skill = BTN3; }

    // 释放条件：非起手技需要「势」（由 1-1「斩」赋予）
    if(skill.needChi && !hasChi){
      if(action==='1') P.stage[1] = 0;
      if(action==='2') P.stage[2] = 0;
      this.renderButtons();
      this.logPush('<span class="warn">需先以「斩」起手获得「势」</span>');
      return; // 不消耗 GCD
    }

    // 连段缓冲（路线判定，供提示与轮换复位）
    P.buf = P.buf + action;
    P.bufUntil = now + COMBO_TIMEOUT;
    // 完整路线打完立即清空，避免残留 buf 吃掉下一轮起手
    if(COMBO_ROUTES.some(r=>r.seq===P.buf)){
      P.buf = '';
    } else if(!COMBO_ROUTES.some(r=>r.seq.startsWith(P.buf))){
      P.buf = ''; // 无效输入链清空
    }

    // 伤害（有「势」时 +50%）
    const dmg = this.calcDamage(skill.mult, hasChi && !!skill.needChi);
    E.data.hp = Math.max(0, E.data.hp - dmg);
    this.floatDmg(dmg, false);
    const chiTag = (skill.needChi && hasChi) ? '<span class="qi">⚡势+50%</span> ' : '';
    this.logPush('<span class="dmg-you">'+skill.name+' → <b>'+dmg+'</b> '+chiTag+'</span>');

    // 效果结算
    if(action==='1' && st===0){
      // 1-1 起手：获得/刷新「势」
      P.chiUntil = now + CHI_MS;
      this.logPush('<span class="muted">「势」涌动（后续连段 +50%）</span>');
    }
    if(skill.seal){
      // 收尾技：印记 + 剑气 + 附加buff
      P.seals[skill.seal] = true;
      P.qi = Math.min(QI_MAX, P.qi + QI_PER_SEAL);
      this.logPush('<span class="warn">印「'+({snow:'雪 ❆',moon:'月 ☾',hana:'花 ❀'})[skill.seal]+'」凝聚 · 剑气+'+QI_PER_SEAL+'</span>');
      if(skill.buff){
        if(skill.buff.key==='zs'){ P.zsUntil = now + skill.buff.durMs; }
        else { P.cdBuffUntil = now + skill.buff.durMs; }
        this.logPush('<span class="win">'+skill.buff.icon+' 获得「'+skill.buff.name+'」'+skill.buff.durMs/1000+'s</span>');
      }
      this.renderSeals();
      this.renderQi();
    }

    // 轮换推进（仅在成功释放后）
    if(action==='1') P.stage[1] = (st+1)%BTN1.length;
    if(action==='2') P.stage[2] = (st+1)%BTN2.length;

    this.showSlashEffect(); this.flash(btn);
    this.setGcd(GCD_MS);
    this.restoreStages();

    if(E.data.hp<=0){ this.onKill(); } else this.renderHp();
  },

  setGcd(ms){
    // 迅疾 buff：GCD 冷却 -10%
    const cdr = Date.now() < P.cdBuffUntil ? (1 - CDR_PCT) : 1;
    P.gcdTotal = ms * cdr;
    P.gcdUntil = Date.now() + ms * cdr;
  },

  // 动作中文名（用于提示）
  actionName(action){
    return ({'1':'斩','2':'突','3':'斩落',ult:ULT.name,follow:FOLLOW.name,
             shield:'格挡',qi:QISTRIKE.name,buff:WARCRY.name})[action] || action;
  },

  // ---------- 技能详情（长按弹出） ----------
  skillInfo(action){
    const pct = m => Math.round(m*10) + '%';
    const chiTxt = m => pct(m) + '（有「势」' + pct(Math.round(m*(1+CHI_BONUS))) + '）';
    const lvTxt = k => 'Lv.' + UNLOCK_LV[k];
    const lockTag = k => P.level < UNLOCK_LV[k] ? ' <span class="st-lock">🔒 未解锁</span>' : '';
    const map = {
      '1': ()=>{
        const s = BTN1[P.stage[1]];
        const nm = ['1-1 斩','1-2 斩·贰','1-3 斩·叁'][P.stage[1]];
        const req = P.stage[1]===0 ? '无（连招起手）' : '「势」持续中（先按「斩」起手）';
        const bonus = P.stage[1]===0
          ? '获得「势」'+CHI_MS/1000+'s：后续连段技伤害+'+Math.round(CHI_BONUS*100)+'%'
          : (s.seal ? '凝聚雪❆印 · 剑气+'+QI_PER_SEAL+' · 锐锋（+15%伤害 30s）' : '延续连段，指向雪❆印');
        return { name:nm, lv:lvTxt('b1'), lock:lockTag('b1'), req:req,
                 effect:'造成 '+chiTxt(s.mult)+' 伤害（共享GCD '+GCD_MS+'ms）', bonus:bonus };
      },
      '2': ()=>{
        const s = BTN2[P.stage[2]];
        const nm = ['2-1 突','2-2 扫'][P.stage[2]];
        const req = '「势」持续中（先按「斩」起手）';
        const bonus = s.seal ? '凝聚月☾印 · 剑气+'+QI_PER_SEAL+' · 迅疾（GCD-10% 30s）' : '延续连段，指向月☾印';
        return { name:nm, lv:lvTxt('b2'), lock:lockTag('b2'), req:req,
                 effect:'造成 '+chiTxt(s.mult)+' 伤害（共享GCD '+GCD_MS+'ms）', bonus:bonus };
      },
      '3': ()=>({ name:'3-1 斩落', lv:lvTxt('b3'), lock:lockTag('b3'),
                 req:'「势」持续中（最快成印路线：斩→斩落）',
                 effect:'造成 '+chiTxt(BTN3.mult)+' 伤害（共享GCD '+GCD_MS+'ms）',
                 bonus:'凝聚花❀印 · 剑气+'+QI_PER_SEAL }),
      'ult': ()=>({ name:ULT.name, lv:lvTxt('ult'), lock:lockTag('ult'),
                 req:'三印齐（雪❆ 月☾ 花❀）；咏唱期间封锁其他GCD技',
                 effect:'咏唱 '+ULT.castMs/1000+'s 后造成 攻击力×'+pct(ULT.dmgBase)+'（冷却自咏唱开始计算）',
                 bonus:'命中后解锁后续技「'+FOLLOW.name+'」' }),
      'follow': ()=>({ name:FOLLOW.name, lv:lvTxt('follow'), lock:lockTag('follow'),
                 req:'释放居合·雪月花之后',
                 effect:'造成 攻击力×'+pct(FOLLOW.dmgBase)+'（共享GCD '+FOLLOW.gcdMs+'ms）',
                 bonus:'不中断当前连段缓冲' }),
      'shield': ()=>({ name:'格挡', lv:lvTxt('shield'), lock:lockTag('shield'),
                 req:'独立冷却 '+SHIELD.cd/1000+'s（不占公共GCD）',
                 effect:'持续 '+SHIELD.duration/1000+'s：受到伤害降低70%',
                 bonus:'每次成功减伤剑气+'+QI_PER_BLOCK+'；可反制Boss读条造成高额伤害' }),
      'qi': ()=>({ name:QISTRIKE.name, lv:lvTxt('qi'), lock:lockTag('qi'),
                 req:'剑气≥'+QISTRIKE.qiCost+' · 独立冷却 '+QISTRIKE.cd/1000+'s',
                 effect:'瞬发造成 攻击力×'+pct(QISTRIKE.dmgBase)+'（不占公共GCD，仅受0.1s点击锁限制）',
                 bonus:'可在两个GCD技能的等待间隙插入补伤' }),
      'buff': ()=>({ name:WARCRY.name, lv:lvTxt('buff'), lock:lockTag('buff'),
                 req:'独立冷却 '+WARCRY.cd/1000+'s（不占公共GCD）',
                 effect:'持续 '+WARCRY.durMs/1000+'s：造成的伤害+'+Math.round((WARCRY.dmgMul-1)*100)+'%',
                 bonus:'激活期间按钮橙光提示；与其他加成乘算叠加' })
    };
    return (map[action]||(()=>({name:this.actionName(action),lv:'-',req:'-',effect:'-',bonus:'-'})))();
  },

  showSkillTip(action){
    const el = $('skill-tip');
    if(!el) return;
    const i = this.skillInfo(action);
    el.innerHTML =
      '<div class="st-name">'+i.name+i.lock+'</div>'+
      '<div class="st-row"><span class="st-k">解锁等级</span><span>'+i.lv+'</span></div>'+
      '<div class="st-row"><span class="st-k">前置需求</span><span>'+i.req+'</span></div>'+
      '<div class="st-row"><span class="st-k">技能效果</span><span>'+i.effect+'</span></div>'+
      '<div class="st-row"><span class="st-k">触发加成</span><span>'+i.bonus+'</span></div>';
    el.classList.add('show');
  },

  hideSkillTip(){
    const el = $('skill-tip');
    if(el) el.classList.remove('show');
  },

  // 连招键当前是否真的可以释放（自动战斗用，含自救复位）
  comboReady(c){
    if(P.level < UNLOCK_LV['b'+c]) return false;
    const arr = c==='1' ? BTN1 : c==='2' ? BTN2 : null;
    let s = arr ? arr[c==='1'?P.stage[1]:P.stage[2]] : BTN3;
    if(s.needChi && Date.now() >= P.chiUntil){
      if(!arr) return false;
      // 复位到起手技后再判断
      if(arr===BTN1) P.stage[1]=0; else P.stage[2]=0;
      this.renderButtons();
      s = arr[0];
      if(s.needChi && Date.now() >= P.chiUntil) return false;
    }
    return true;
  },

  // 咏唱完成结算：大招伤害在此生效
  resolveCast(){
    const c = P.casting;
    P.casting = null;
    this.hideCastBar();
    if(!c || !this.active || !E.data || E.data.hp<=0) return;
    if(c.action === 'ult'){
      const dmg = this.calcDamage(ULT.dmgBase); // 倍率刻度统一：dmgBase 60 → 攻击力×6
      E.data.hp = Math.max(0, E.data.hp - dmg);
      P.ultFollowReady = true; // 解锁后续技「追斩」
      this.logPush('<span class="warn big">❄☾❀ 居合·雪月花 → <b>'+dmg+'</b>　▸ 可接「'+FOLLOW.name+'」</span>');
      this.floatDmg(dmg, true);
      this.showSlashEffect();
      this.renderQi(); this.renderFollow();
      if(E.data.hp<=0){ this.onKill(); } else this.renderHp();
    }
  },

  hideCastBar(){
    const cb = $('cast-bar');
    if(cb) cb.classList.remove('show');
  },

  // 倍率伤害：总攻击力 × 技能倍率 × 「势」加成 × buff 加成
  // mult 为百分比倍率（如 130 表示 ×1.3）
  calcDamage(mult, useChi){
    const w = WEAPONS.find(x=>x.id===P.weapon);
    const atk = P.atk + weaponAtk(P.weapon);
    const now = Date.now();
    let m = mult / 10;
    if(useChi) m *= (1 + CHI_BONUS);          // 「势」+50%
    if(now < P.buffUntil) m *= WARCRY.dmgMul; // 战意高扬 +20%
    if(now < P.zsUntil)   m *= BUFF_ZS_DMG;   // 锐锋 +15%
    return Math.max(1, Math.round(atk * m * (0.9+Math.random()*0.2)) - E.data.def);
  },

  // ------ Boss 反制 ------
  onCounter(){
    const dmg = Math.max(1, Math.round((P.atk+20) * 3));
    E.data.hp = Math.max(0, E.data.hp - dmg);
    E.casting = false;
    E.nextCastAt = Date.now() + (E.data.castEvery||4000);
    this.logPush('<span class="dmg-you">⟲ 反制「'+E.data.castName+'」 → <b>'+dmg+'</b></span>');
    this.showSlashEffect();
    if(E.data.hp<=0){ this.onKill(); } else this.renderHp();
  },

  onKill(){
    this.stopEnemyAttack();
    P.gold += E.data.gold;
    P.exp += E.data.exp;
    // 击杀计数（解锁首领 / 解锁下一区域）
    if(E.data.isBoss){ P.bossKills[E.key]=(P.bossKills[E.key]||0)+1; }
    else             { P.kills[E.key]=(P.kills[E.key]||0)+1; }
    while(P.exp >= expForLevel(P.level) && P.level < LEVEL_CAP){ P.level++; P.atk += 3; P.maxHp += 15; }
    this.logPush('<span class="win">击杀 '+E.data.name+'</span>');
    // 掉落入账
    const drops = [];
    E.data.drops.forEach(d=>{
      if(d.chance===undefined || Math.random()<d.chance){
        P.materials[d.m]=(P.materials[d.m]||0)+d.n;
        drops.push({m:d.m,n:d.n,material:MATERIALS[d.m]});
      }
    });
    this.lastDrops = drops;
    if(window.saveGame) saveGame(); // 成长数据即时落盘
    // 消逝 + 喷泉 + 右侧横幅
    this.dieEffect();
    this.respawnSoon();
    this.renderHp();
  },

  // 掉落横幅（右上角小横幅）
  showBanner(header, lines, dur=2400){
    const b = $('banner'); if(!b) return;
    const dropHtml = lines.map(d=>'<span class="b-drop" style="color:'+d.material.color+'">'+d.material.name+'×'+d.n+'</span>').join(' ');
    b.innerHTML = '<div class="b-t">'+header+'</div>'+(dropHtml?'<div>'+dropHtml+'</div>':'');
    b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(()=>b.classList.remove('show'), dur);
  },

  // 敌人消逝 + 材料喷泉（不弹结算窗）
  dieEffect(){
    const main = $('enemy-sprite');
    if(main) main.classList.add('dying');
    const kb = $('kill-burst');
    if(kb){ kb.classList.remove('go'); void kb.offsetWidth; kb.classList.add('go'); }
    const layer = $('drop-layer');
    // 材料色光点喷泉（掉落物彩色）
    if(layer){
      if(this.lastDrops && this.lastDrops.length){
        const baseN = Math.min(22, Math.max(12, this.lastDrops.length*5));
        for(let i=0;i<baseN;i++){
          const d = this.lastDrops[i % this.lastDrops.length];
          const orb = document.createElement('div');
          orb.className = 'drop-orb';
          orb.style.color = d.material.color;
          this.spray(orb, layer, 90, 240);
        }
      }
      // 保底火花（击杀必有，亮白/金色）
      const sparks = Math.min(14, Math.max(8, 8));
      for(let i=0;i<sparks;i++){
        this.spray(TSPARK(), layer, 160, 300, true);
      }
    }
    // 右侧横幅：击杀 + 掉落
    this.showBanner('⚔ 击杀 '+E.data.name, this.lastDrops||[]);
  },

  spray(el, layer, rMin, rMax, isSpark){
    const a = Math.random()*Math.PI*2;
    const r = rMin + Math.random()*(rMax-rMin);
    el.style.setProperty('--tx', (Math.cos(a)*r).toFixed(0)+'px');
    el.style.setProperty('--ty', (Math.sin(a)*r - 60).toFixed(0)+'px');
    el.style.animationDelay = (Math.random()*0.15)+'s';
    layer.appendChild(el);
    setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, 1000);
  },

  // 复活（无限刷）
  respawnSoon(){
    this._respawnTimer && clearTimeout(this._respawnTimer);
    const self = this;
    this._respawnTimer = setTimeout(()=>self.respawn(), 1400);
  },
  respawn(){
    // 仅刷新敌人自身状态（无限刷）；不影响玩家 HP/连击/印记/货币等
    if($('enemy-sprite')) $('enemy-sprite').classList.remove('dying');
    if($('kill-burst')) $('kill-burst').classList.remove('go');
    const dl = $('drop-layer'); if(dl) dl.innerHTML = '';
    E.data.hp = E.data.maxHp;
    E.casting = false;
    E.nextCastAt = Date.now() + (E.data.castEvery || 4000);
    E.castEndAt = 0;
    this.active = true;
    this.renderButtons();
    this.renderSeals();
    this.startEnemyAttack();
    this.logPush('<span class="muted">'+E.data.name+' 又出现了…</span>');
    this.renderHp();
  },

  onDeath(){
    this.stopEnemyAttack();
    this.announceDeath();
    P.hp = P.maxHp;   // 回满继续刷
    this.respawnSoon();
    this.renderHp();
  },

  announceDeath(){
    const b = $('banner'); if(!b) return;
    b.innerHTML = '<div class="b-t b-title-msg">☠ 你被 '+E.data.name+' 击败</div>';
    b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(()=>b.classList.remove('show'), 2600);
  },

  // ---------- 循环帧 ----------
  tick(){
    const now = Date.now();

    // 咏唱读条推进 + 咏唱完成结算
    if(P.casting){
      const remain = P.casting.until - now;
      const cf = $('cast-fill');
      if(cf) cf.style.width = Math.max(0,(1-remain/P.casting.total)*100)+'%';
      if(remain<=0){ this.resolveCast(); }
    }

    // GCD 冷却圈（GCD 技能：按钮1~4 + 追斩cd8）
    const frac = now < P.gcdUntil ? (P.gcdUntil-now)/P.gcdTotal : 0;
    for(let i=1;i<=4;i++){ this.setSweep($('cd'+i), frac); }
    this.setSweep($('cd8'), frac);
    // 非 GCD 技能各自的独立冷却遮罩（不占公共冷却，但有自己的CD）
    const shFrac  = now < P.shieldCdUntil ? (P.shieldCdUntil-now)/P.shieldCdTotal : 0;
    const qiFrac  = now < P.qiCdUntil     ? (P.qiCdUntil-now)/P.qiCdTotal       : 0;
    const bufFrac = now < P.buffCdUntil   ? (P.buffCdUntil-now)/P.buffCdTotal   : 0;
    this.setSweep($('cd5'), shFrac);
    this.setSweep($('cd6'), qiFrac);
    this.setSweep($('cd7'), bufFrac);
    // 战意高扬激活高亮
    const bBuff = $('btnSkill7');
    if(bBuff) bBuff.classList.toggle('buff-active', now < P.buffUntil);

    if(!this.active) return;

    // 连段缓冲超时
    if(P.buf && now > P.bufUntil){ P.buf=''; }

    // 「势」过期 = 连击中断：按钮轮换复位到第一段（图标/角标恢复初始）
    if(P.chiUntil && now >= P.chiUntil && (P.stage[1]!==0 || P.stage[2]!==0)){
      P.stage[1] = 0; P.stage[2] = 0;
      this.renderButtons();
    }

    // 下一步提示（黄色虚线；未解锁按钮不提示）
    const next = this.nextHints();
    for(let i=1;i<=3;i++){
      const b = $('btnSkill'+i);
      if(b) b.classList.toggle('hint', next.indexOf(String(i))>=0 && P.level>=UNLOCK_LV['b'+i]);
    }
    // 未解锁按钮置灰 + 显示解锁等级
    [['btnSkill1','b1'],['btnSkill2','b2'],['btnSkill3','b3'],
     ['btnSkill4','ult'],['btnSkill5','shield'],['btnSkill6','qi'],
     ['btnSkill7','buff'],['btnSkill8','follow']].forEach(([id,k])=>{
      const b = $(id); if(!b) return;
      b.classList.toggle('locked', P.level < UNLOCK_LV[k]);
      const ub = b.querySelector('.unlock-badge');
      if(ub){
        if(P.level < UNLOCK_LV[k]){ ub.textContent = 'Lv.'+UNLOCK_LV[k]; ub.style.display='flex'; }
        else ub.style.display='none';
      }
    });
    // 大招高亮
    const b4 = $('btnSkill4');
    const ready = P.seals.snow && P.seals.moon && P.seals.hana;
    if(b4){ b4.classList.toggle('ult-ready', ready && P.level>=UNLOCK_LV.ult); }

    // buff 持续角标（锐锋/迅疾）
    const cz = $('chipZs');
    if(cz){
      const rz = P.zsUntil - now;
      cz.style.display = rz>0 ? '' : 'none';
      if(rz>0) cz.textContent = '⚔锐锋 '+Math.ceil(rz/1000)+'s';
    }
    const cc = $('chipCd');
    if(cc){
      const rc = P.cdBuffUntil - now;
      cc.style.display = rc>0 ? '' : 'none';
      if(rc>0) cc.textContent = '⚡迅疾 '+Math.ceil(rc/1000)+'s';
    }

    // Boss 读条
    if(E.data && E.data.isBoss && E.data.hp>0){
      if(!E.casting && now >= E.nextCastAt){
        E.casting = true;
        E.castEndAt = now + (E.data.castTime||1500);
        $('enemy-sprite').classList.add('casting');
        this.logPush('<span class="warn">'+E.data.name+' 读条「'+E.data.castName+'」！格挡反制！</span>');
      } else if(E.casting && now >= E.castEndAt){
        E.casting = false;
        E.nextCastAt = now + (E.data.castEvery||4000);
        $('enemy-sprite').classList.remove('casting');
        if(now < P.shieldUntil){
          P.qi = Math.min(QI_MAX, P.qi + QI_PER_BLOCK); // 反制成功也积累剑气
          this.renderQi();
          this.onCounter();
        }
        else{
          const dmg = Math.max(1, Math.round(E.data.atk*E.data.castDmgMul - P.def));
          P.hp = Math.max(0, P.hp - dmg);
          this.logPush('<span class="dmg-ene">'+E.data.castName+' 命中 → <b>'+dmg+'</b></span>');
          if(P.hp<=0){ this.onDeath(); return; }
        }
        this.renderHp();
      }
    }

    // 自动连招驱动
    if(this.auto){ this.autoAction(); }
  },

  // 当前缓冲下，哪些按钮可以继续连段（起手不提示；未解锁按钮不提示）
  nextHints(){
    if(!P.buf) return [];
    const set = [];
    COMBO_ROUTES.forEach(r=>{
      if(r.seq.length > P.buf.length && r.seq.slice(0,P.buf.length)===P.buf){
        const c = r.seq[P.buf.length];
        if(set.indexOf(c)<0 && P.level >= UNLOCK_LV['b'+c]) set.push(c);
      }
    });
    return set;
  },

  setSweep(el, frac){
    if(!el) return;
    if(frac>0){
      el.style.setProperty('--p', (frac*100)+'%');
      el.classList.add('show');
    } else {
      el.style.setProperty('--p', '0%');
      el.classList.remove('show');
    }
  },

  // 按钮阶段外观（图标色相 + 段数角标 + 名称）
  renderButtons(){
    const i1 = $('icon1'), b1 = $('badge1'), l1 = $('label1');
    const i2 = $('icon2'), b2 = $('badge2'), l2 = $('label2');
    const i3 = $('icon3'), l3 = $('label3');
    if(i1){ i1.style.filter = TINTS[P.stage[1]]; b1.textContent=BADGES[P.stage[1]]; l1.textContent=BTN1[P.stage[1]].name; }
    if(i2){ i2.style.filter = TINTS[P.stage[2]]; b2.textContent=BADGES[P.stage[2]]; l2.textContent=BTN2[P.stage[2]].name; }
    if(i3){ i3.style.filter = ''; l3.textContent=BTN3.name; }
  },

  // 连击后恢复：未参与当前连击链的按钮回到一阶段技能
  // 只有 1/2/3 改变连击；大招/格挡不经过这里，故不会中断连击
  restoreStages(){
    const next = this.nextHints();
    if(!P.buf || next.indexOf('1')<0) P.stage[1]=0;
    if(!P.buf || next.indexOf('2')<0) P.stage[2]=0;
    this.renderButtons();
  },

  renderSeals(){
    const s = P.seals;
    $('sealSnow').classList.toggle('lit-snow', s.snow);
    $('sealMoon').classList.toggle('lit-moon', s.moon);
    $('sealHana').classList.toggle('lit-hana', s.hana);
    const n = (s.snow?1:0)+(s.moon?1:0)+(s.hana?1:0);
    $('sealTip').textContent = n===3 ? '居合可放！' : ('印 '+n+'/3');
  },

  // 剑气条
  renderQi(){
    P.qi = Math.max(0, Math.min(QI_MAX, P.qi));
    const fill = $('qi-fill'), txt = $('qi-text');
    if(fill) fill.style.width = (P.qi/QI_MAX*100)+'%';
    if(txt) txt.textContent = P.qi+'/'+QI_MAX;
    const b6 = $('btnSkill6');
    if(b6) b6.classList.toggle('qi-ready', P.qi >= QISTRIKE.qiCost);
  },

  // 追斩高亮（大招后可接）
  renderFollow(){
    const b8 = $('btnSkill8');
    if(b8) b8.classList.toggle('follow-ready', P.ultFollowReady);
  },

  renderHp(){
    if(E.data){
      $('boss-hp-fill').style.width = (E.data.hp/E.data.maxHp*100)+'%';
      const bt = $('boss-hp-text'); if(bt) bt.textContent = E.data.hp+'/'+E.data.maxHp;
    }
    $('player-hp-fill').style.width = (P.hp/P.maxHp*100)+'%';
    $('player-hp-text').textContent = P.hp+'/'+P.maxHp;
    $('statGold').textContent = P.gold;
    $('statCrystal').textContent = P.crystal;
    const tg = $('tGold'); if(tg) tg.textContent = P.gold;
    const tc = $('tCry'); if(tc) tc.textContent = P.crystal;
    const tm = $('tMat'); if(tm) tm.textContent = MAT_ORDER.reduce((s,k)=>s+(P.materials[k]||0),0);
    $('statMat').textContent = MAT_ORDER.map(k=>{
      const n=P.materials[k]||0;
      return n>0 ? '<span style="color:'+MATERIALS[k].color+'">'+MATERIALS[k].name+':'+n+'</span>' : '';
    }).filter(Boolean).join(' ') || '0';
  },

  logPush(str){
    this.log.unshift(str);
    if(this.log.length>14) this.log.pop();
    const el = $('combat-log'); if(el) el.innerHTML = this.log.join('<br>');
  },

  showSlashEffect(){
    const el = $('slash-effect');
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  },
  flash(btn){
    if(!btn) return;
    btn.classList.remove('used'); void btn.offsetWidth; btn.classList.add('used');
  },

  // 飘字伤害数字
  floatDmg(dmg, crit){
    const layer = $('dmg-nums');
    if(!layer) return;
    const el = document.createElement('div');
    el.className = 'dmg-num' + (crit?' crit':'');
    el.textContent = dmg;
    el.style.left = (Math.random()*60-30)+'px';
    el.style.setProperty('--dx', (Math.random()*40-20)+'px');
    layer.appendChild(el);
    setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, 820);
  },

  showScreen(name){
    $$('.screen').forEach(s=>s.classList.remove('active'));
    $(name).classList.add('active');
  },

  backToZone(){
    this.active = false;
    this.stopEnemyAttack();
    this.setAuto(false);
    P.casting = null;
    this.hideCastBar();
    if($('overlay')) $('overlay').classList.remove('show');
    this._settleTimer && clearTimeout(this._settleTimer);
    this.showScreen('screen-zone');
  },

  // ---------- 自动战斗 ----------
  // 解锁规则见 main.js toggleAutoUnlock：全局需击杀第一章首领，单个敌人需累计击杀 10 次
  setAuto(on){
    this.auto = !!on;
    const b = $('btnAuto');
    if(b){ b.classList.toggle('on', this.auto); b.textContent = this.auto ? '⚔ 自动·开' : '⚔ 自动'; }
    return this.auto;
  },
  toggleAuto(){
    const locked = window.autoUnlockMsg && window.autoUnlockMsg();
    if(locked){ toast(locked); return; }
    if(this.auto){ this.setAuto(false); this.logPush('<span class="muted">自动连招关闭</span>'); }
    else {
      this.setAuto(true);
      this.logPush('<span class="win">⚔ 自动连招开启（连招/大招/追斩/满剑气一闪）</span>');
    }
  },
  // 自动 AI：连招路线 + 大招 + 追斩 + 剑气满放一闪
  // 绝不释放格挡与战意（防御/增益交给玩家手操）
  // 所有动作先判定解锁/资源/前置，不满足则跳过；缓冲无法推进时重置自救
  autoAction(){
    const now = Date.now();
    if(P.casting) return;               // 咏唱中不动作
    if(now < P.pressLockUntil) return;
    // 非 GCD 插入：剑气满时立即一闪（独立CD好才放；不占公共GCD，不会卡住连招节奏）
    if(P.level >= UNLOCK_LV.qi && P.qi >= QI_MAX && now >= P.qiCdUntil){
      this.onSkillPress('qi', $('btnSkill6')); return;
    }
    if(now < P.gcdUntil) return;            // 等 GCD

    const ultOk = P.level >= UNLOCK_LV.ult;
    if(ultOk && P.seals.snow && P.seals.moon && P.seals.hana){
      this._autoRoute = null;
      this.onSkillPress('ult', $('btnSkill4')); return;
    }
    // 居合命中后立即接追斩（一次性机会，用完即失）
    if(P.ultFollowReady && P.level >= UNLOCK_LV.follow){
      this.onSkillPress('follow', $('btnSkill8')); return;
    }

    // 连招推进：仅当下一步确实可释放（未解锁/缺势 → 换路或自救）
    if(P.buf){
      const r = this._autoRoute;
      if(r && P.buf.length < r.length && r.slice(0,P.buf.length)===P.buf
             && this.comboReady(r[P.buf.length])){
        this.onSkillPress(r[P.buf.length], $('btnSkill'+r[P.buf.length]));
        return;
      }
      const hf = this.nextHints().filter(c=>this.comboReady(c));
      if(hf.length){
        this.onSkillPress(hf[0], $('btnSkill'+hf[0]));
        return;
      }
      // 卡死自救：当前缓冲无法继续 → 清空重来
      P.buf = ''; P.stage[1] = 0; P.stage[2] = 0;
      this.renderButtons();
    }

    // 起手选路：优先补缺失印记；印记全满（或大招未解锁）时轮换全部已解锁路线
    // 注：所有路线均以 1-1 起手，「势」由起手获得，故选路只看解锁等级
    const routeOpen = x => x.seq.split('').every(c=>P.level >= UNLOCK_LV['b'+c]);
    let r2 = COMBO_ROUTES.find(x=>!P.seals[x.seal] && routeOpen(x));
    if(!r2){
      const avail = COMBO_ROUTES.filter(routeOpen);
      if(avail.length){
        this._autoIdx = (this._autoIdx || 0) + 1;
        r2 = avail[this._autoIdx % avail.length];   // 轮换：雪→月→花→雪…
      }
    }
    if(r2){ this._autoRoute = r2.seq; this.onSkillPress(r2.seq[0], $('btnSkill'+r2.seq[0])); }
  },
};

window.P = P; window.E = E; window.Battle = Battle;

function startTick(){ setInterval(()=>Battle.tick(), TICK_MS); }

function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 2200);
}
