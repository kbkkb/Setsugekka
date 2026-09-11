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
  buf: '',              // 连段输入链（印记归属：111/122/13）
  bufUntil: 0,          // 链超时时间戳
  flags: { A:0, B:0, C:0 }, // 连击条件（FF14 式 flag，值为过期时间戳）
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
const DEATH_LOCK_MS = 3000; // 玩家死亡后禁止攻击的时长（随后复活）
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
    E.key = encKey;
    E.enc = enc;
    if(enc.kind==='arena'){
      this.arenaIdx = 0;
      this.arenaStart = Date.now();
      E.data = this.arenaData(0);
    } else {
      const e = ENEMIES[encKey];
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
    }
    E.casting = false;
    E.nextCastAt = Date.now() + (E.data.castEvery || 4000);
    E.castEndAt = 0;
    this.hideEnemyCast();

    P.hp = P.maxHp;
    P.buf = ''; P.bufUntil = 0;
    P.flags = { A:0, B:0, C:0 };
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
    P.zsUntil = 0; P.cdBuffUntil = 0;
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
    this.hideDeathOverlay();

    this.paintEnemy();
    $('zoneName').textContent = enc.label;
    this.renderButtons();
    this.renderSeals();
    this.renderQi();
    this.renderFollow();
    this.renderHp();

    this.showScreen('battle-screen');
    // 通知界面层：隐藏顶部货币栏与底部导航（若定义了）
    if(window.onBattleEnter) window.onBattleEnter();
    // 新手指南：弹窗关闭逻辑每次入场都绑定（供「?」按钮复用），仅首场自动弹出
    {
      const pop = $('tut-pop'), go = $('tutGo');
      if(pop && go){
        go.onclick = ()=>{
          const first = !P.tutDone;
          if(first){ P.tutDone = true; if(window.saveGame) saveGame(); }
          pop.classList.remove('show');
          this.startEnemyAttack();
        };
      }
      if(!P.tutDone){
        if(go) go.textContent = '开始战斗';
        if(pop) pop.classList.add('show');
      } else {
        if(pop) pop.classList.remove('show');
        this.startEnemyAttack();
      }
    }
  },

  startEnemyAttack(){
    this.stopEnemyAttack();
    E.attackTimer = setInterval(()=>{
      if(!this.active || !E.data || E.data.hp<=0) return;
      if(this.tutShowing()) return;   // 提示弹窗暂停
      if(E.casting) return;
      const now = Date.now();
      let dmg = Math.max(1, Math.round(E.data.atk - P.def + Math.random()*4));
      if(now < P.shieldUntil){
        // 格挡窗口内：成功减伤（Lv15 被动剑气+20 · Lv30 被动铁壁回元 CD-50%）
        dmg = Math.max(1, Math.round(dmg*0.3));
        let t = '🛡 减伤成功 -'+dmg;
        if(P.level >= UNLOCK_LV.qiSrc){ P.qi = Math.min(QI_MAX, P.qi + QI_PER_BLOCK); t += ' · 剑气+'+QI_PER_BLOCK; }
        if(P.level >= UNLOCK_LV.shieldCd && P.shieldCdUntil > now){
          P.shieldCdUntil = Math.round(now + (P.shieldCdUntil-now)*0.5);
          t += ' · 铁壁回元';
        }
        this.logPush('<span class="qi">'+t+'</span>');
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
      this.lifesteal(dmg);
      this.logPush('<span class="qi">⚡ '+QISTRIKE.name+' → <b>'+dmg+'</b>'+(this.lastCrit?' <span class="win">💥</span>':'')+'</span>');
      this.floatDmg(dmg, this.lastCrit);
      this.showSlashEffect(); this.flash(btn);
      this.renderQi();
      if(E.data.hp<=0){ this.onKill(); }
      return;
    }

    // ---- 战意高扬：8s 伤害 +20%（Lv40 被动 10s；独立冷却20s，不占公共GCD）----
    if(action === 'buff'){
      if(now < P.buffCdUntil){ this.logPush('战意冷却中…'); return; }
      P.buffUntil = now + warcryDur();
      P.buffCdTotal = WARCRY.cd; P.buffCdUntil = now + WARCRY.cd;
      this.logPush('<span class="warn">🔥 '+WARCRY.name+'：伤害+20%（'+warcryDur()/1000+'s）</span>');
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
      if(P.buf) P.bufUntil = now + CHI_MS;
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
      if(P.buf) P.bufUntil = now + CHI_MS;
      const dmg = this.calcDamage(FOLLOW.dmgBase, false, 'special');
      E.data.hp = Math.max(0, E.data.hp - dmg);
      this.lifesteal(dmg);
      this.logPush('<span class="dmg-you">'+FOLLOW.name+' → <b>'+dmg+'</b>'+(this.lastCrit?' <span class="win">💥</span>':'')+'</span>');
      this.floatDmg(dmg, true);
      this.showSlashEffect(); this.flash(btn);
      this.setGcd(FOLLOW.gcdMs);
      this.renderFollow();
      if(E.data.hp<=0){ this.onKill(); } else this.renderHp();
      return;
    }

    // ---- 连招（FF14 flag 制：req 消耗 / set 给予，支线互斥） ----
    const sel = this.nextAction(action);
    if(!sel){
      this.logPush('<span class="warn">「'+this.actionName(action)+'」需连击条件「'+COMBO_FLAGS.A+'」——先按「斩」起手</span>');
      return; // 不消耗 GCD
    }
    const skill = sel.skill, st = sel.st;
    this.applyFlags(skill, now);

    // 连击链缓冲（印记归属 111/122/13；窗口与 flag 同步 30s）
    P.buf = P.buf + action;
    P.bufUntil = now + CHI_MS;
    // 完整路线打完立即清空，避免残留 buf 吃掉下一轮起手
    if(COMBO_ROUTES.some(r=>r.seq===P.buf)){
      P.buf = '';
    } else if(!COMBO_ROUTES.some(r=>r.seq.startsWith(P.buf))){
      P.buf = ''; // 无效输入链清空
    }

    // 伤害（flag 为纯连击条件，无增伤；收益来自段倍率与收招 buff）
    const dmg = this.calcDamage(skill.mult, false, 'combo');
    E.data.hp = Math.max(0, E.data.hp - dmg);
    this.lifesteal(dmg);
    this.floatDmg(dmg, this.lastCrit);
    this.logPush('<span class="dmg-you">'+skill.name+' → <b>'+dmg+'</b>'+(this.lastCrit?' <span class="win">💥</span>':'')+'</span>');

    // 效果结算
    if(skill.set){
      this.logPush('<span class="muted">连击条件「'+COMBO_FLAGS[skill.set]+'」已备好（'+CHI_MS/1000+'s）</span>');
    }
    if(skill.seal){
      // 收招技：印记 + 剑气（Lv15 被动·剑心激活）+ 附加buff
      P.seals[skill.seal] = true;
      let qiGain = '';
      if(P.level >= UNLOCK_LV.qiSrc){
        P.qi = Math.min(QI_MAX, P.qi + QI_PER_SEAL);
        qiGain = ' · 剑气+'+QI_PER_SEAL;
      }
      this.logPush('<span class="warn">印「'+({snow:'雪 ❆',moon:'月 ☾',hana:'花 ❀'})[skill.seal]+'」凝聚'+qiGain+'</span>');
      if(skill.buff){
        if(skill.buff.key==='zs'){ P.zsUntil = now + skill.buff.durMs; }
        else { P.cdBuffUntil = now + skill.buff.durMs; }
        this.logPush('<span class="win">'+skill.buff.icon+' 获得「'+skill.buff.name+'」'+skill.buff.durMs/1000+'s</span>');
      }
      this.renderSeals();
      this.renderQi();
    }

    this.showSlashEffect(); this.flash(btn);
    this.setGcd(GCD_MS);
    this.renderButtons();

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
        const sel = this.nextAction('1') || {st:0};
        const s = BTN1[sel.st];
        const qiT = P.level>=UNLOCK_LV.qiSrc ? ' · 剑气+'+QI_PER_SEAL : '';
        const nm = ['1-1 斩','1-2 斩·贰','1-3 斩·叁'][sel.st];
        const req = ['无（唯一起手技）','需连击条件「势」（1-1 给予，本段消耗它）','需连击条件「续势」（1-2 给予，本段消耗它）'][sel.st];
        const bonus = sel.st===0
          ? '成功后给予连击条件「势」'+CHI_MS/1000+'s → 可接 1-2 / 2-1 / 3-1（三选一，消耗互斥）'
          : (sel.st===1 ? '成功后给予连击条件「续势」→ 可接 1-3' : '收招凝聚雪❆印'+qiT+' · 锐锋（+15%伤害 30s）');
        return { name:nm, lv:lvTxt('b1'), lock:lockTag('b1'), req:req,
                 effect:'造成 '+pct(s.mult)+' 伤害（共享GCD '+GCD_MS+'ms）', bonus:bonus };
      },
      '2': ()=>{
        const sel = this.nextAction('2') || {st:0};
        const s = BTN2[sel.st];
        const qiT = P.level>=UNLOCK_LV.qiSrc ? ' · 剑气+'+QI_PER_SEAL : '';
        const nm = ['2-1 突','2-2 扫'][sel.st];
        const req = sel.st===0 ? '需连击条件「势」（1-1 给予，本段消耗它）' : '需连击条件「锐势」（2-1 给予，本段消耗它）';
        const bonus = s.seal ? '收招凝聚月☾印'+qiT+' · 迅疾（GCD-10% 30s）' : '成功后给予连击条件「锐势」→ 可接 2-2';
        return { name:nm, lv:lvTxt('b2'), lock:lockTag('b2'), req:req,
                 effect:'造成 '+pct(s.mult)+' 伤害（共享GCD '+GCD_MS+'ms）', bonus:bonus };
      },
      '3': ()=>({ name:'3-1 斩落', lv:lvTxt('b3'), lock:lockTag('b3'),
                 req:'需连击条件「势」（1-1 给予，本段消耗它）· 最短成印路线',
                 effect:'造成 '+pct(BTN3.mult)+' 伤害（共享GCD '+GCD_MS+'ms）',
                 bonus:'收招凝聚花❀印'+(P.level>=UNLOCK_LV.qiSrc? ' · 剑气+'+QI_PER_SEAL : '') }),
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
                 effect:'持续 '+warcryDur()/1000+'s：造成的伤害+'+Math.round((WARCRY.dmgMul-1)*100)+'%',
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

  // 连招键当前是否真的可以释放（自动战斗用：flag 推导即可）
  comboReady(c){
    if(P.level < UNLOCK_LV['b'+c]) return false;
    return !!this.nextAction(c);
  },

  // 咏唱完成结算：大招伤害在此生效
  resolveCast(){
    const c = P.casting;
    P.casting = null;
    this.hideCastBar();
    if(!c || !this.active || !E.data || E.data.hp<=0) return;
    if(c.action === 'ult'){
      const dmg = this.calcDamage(ULT.dmgBase, false, 'special'); // 倍率刻度统一：dmgBase 60 → 攻击力×6
      E.data.hp = Math.max(0, E.data.hp - dmg);
      this.lifesteal(dmg);
      P.ultFollowReady = true; // 解锁后续技「追斩」
      this.logPush('<span class="warn big">❄☾❀ 居合·雪月花 → <b>'+dmg+'</b>'+(this.lastCrit?' 💥':'')+'　▸ 可接「'+FOLLOW.name+'」</span>');
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

  // ---------- 敌人技能读条 ----------
  showEnemyCast(name){
    const b = $('enemyCastBar'); if(b) b.classList.add('show');
    const t = $('enemyCastText'); if(t) t.textContent = name;
    const f = $('enemyCastFill'); if(f) f.style.width = '0%';
  },
  hideEnemyCast(){
    const b = $('enemyCastBar'); if(b) b.classList.remove('show');
  },

  // 提示弹窗是否打开（打开即战场暂停）
  tutShowing(){
    const p = $('tut-pop');
    return !!(p && p.classList.contains('show'));
  },

  // 倍率伤害：总攻击力 × 技能倍率 × 「势」加成 × buff 加成 × 被动 × 暴击
  // mult 为百分比倍率（如 130 表示 ×1.3）；kind: 'combo'连招 | 'special'居合/追斩
  calcDamage(mult, useChi, kind){
    const w = WEAPONS.find(x=>x.id===P.weapon);
    const atk = P.atk + weaponAtk(P.weapon);
    const now = Date.now();
    let m = mult / 10;
    if(useChi) m *= (1 + CHI_BONUS);          // 「势」+50%
    if(now < P.buffUntil) m *= WARCRY.dmgMul; // 战意高扬 +20%
    if(now < P.zsUntil)   m *= BUFF_ZS_DMG;   // 锐锋 +15%
    if(kind==='combo'){                        // 被动：连招增伤 Lv13/Lv35 各+20%（乘算）
      if(P.level >= UNLOCK_LV.atkUp1) m *= 1 + COMBO_UP;
      if(P.level >= UNLOCK_LV.atkUp2) m *= 1 + COMBO_UP;
    }
    if(kind==='special' && P.level >= UNLOCK_LV.specUp) m *= SPECIAL_UP; // Lv45 居合/追斩+50%
    this.lastCrit = Math.random() < CRIT_CHANCE;  // 所有攻击技能 30% 暴击 ×2
    if(this.lastCrit) m *= CRIT_MUL;
    return Math.max(1, Math.round(atk * m * (0.9+Math.random()*0.2)) - E.data.def);
  },

  // 被动吸血：Lv17 → 1%，Lv50 → 5%
  lifesteal(dmg){
    const r = P.level>=UNLOCK_LV.leech2 ? 0.05 : (P.level>=UNLOCK_LV.leech1 ? 0.01 : 0);
    if(r<=0 || !(dmg>0) || P.hp<=0 || P.hp>=P.maxHp) return;
    P.hp = Math.min(P.maxHp, P.hp + Math.max(1, Math.round(dmg*r)));
    this.renderHp();
  },

  // ------ Boss 反制 ------
  onCounter(){
    let dmg = Math.max(1, Math.round((P.atk+20) * 3));
    this.lastCrit = Math.random() < CRIT_CHANCE;
    if(this.lastCrit) dmg = Math.round(dmg * CRIT_MUL);
    E.data.hp = Math.max(0, E.data.hp - dmg);
    this.lifesteal(dmg);
    E.casting = false;
    E.nextCastAt = Date.now() + (E.data.castEvery||4000);
    this.logPush('<span class="dmg-you">⟲ 反制「'+E.data.castName+'」 → <b>'+dmg+'</b>'+(this.lastCrit?' <span class="win">💥</span>':'')+'</span>');
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
    const oldLv = P.level;
    while(P.exp >= expForLevel(P.level) && P.level < levelCap()){ P.level++; P.atk += 3; P.maxHp += 15; }
    this.logPush('<span class="win">击杀 '+E.data.name+'</span>');
    if(P.level > oldLv){
      const u = unlockNames(oldLv, P.level);
      if(u.length) this.logPush('<span class="win">🆕 升级解锁 ▸ '+u.join(' / ')+'</span>');
    }
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
    if(main){ main.classList.add('dying'); main.classList.remove('casting'); }
    E.casting = false; E.castEndAt = 0;   // 死亡时中断读条，防止 hp>0 门槛让 tick 永不重置
    this.hideEnemyCast();
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
    if(E.data && E.data.arena){
      if(this.arenaIdx < ARENA_SEQUENCE.length-1){
        this.arenaIdx++;
        E.data = this.arenaData(this.arenaIdx);
        this.paintEnemy();
        this.logPush('<span class="warn">▸ 第 '+(this.arenaIdx+1)+'/4 战「'+E.data.name+'」开始</span>');
      } else {
        const t = Date.now() - this.arenaStart;
        const rec = !P.arenaBest || t < P.arenaBest;
        if(rec){ P.arenaBest = t; if(window.saveGame) saveGame(); }
        this.logPush('<span class="win">🏆 四王连战通关 · 用时 '+fmtTime(t)+(rec? ' ✦ 新纪录！' : '（最佳 '+fmtTime(P.arenaBest)+'）')+'</span>');
        if(!P.arenaFirst){
          P.arenaFirst = true; P.crystal += ARENA_FIRST_REWARD;
          if(window.saveGame) saveGame();
          this.logPush('<span class="win">💎 首通奖励已发放：◆×'+ARENA_FIRST_REWARD+'</span>');
        }
        this.arenaIdx = 0; this.arenaStart = Date.now();
        E.data = this.arenaData(0);
        this.paintEnemy();
      }
    } else {
      E.data.hp = E.data.maxHp;
    }
    E.casting = false;
    E.nextCastAt = Date.now() + (E.data.castEvery || 4000);
    E.castEndAt = 0;
    this.active = true;
    this.renderButtons();
    this.renderSeals();
    this.startEnemyAttack();
    if(!(E.data && E.data.arena)) this.logPush('<span class="muted">'+E.data.name+' 又出现了…</span>');
    this.renderHp();
  },

  // 重绘敌人立绘/名牌（竞技场换阶段时复用）
  paintEnemy(){
    $('boss-name').textContent = E.data.name;
    const blv = $('bossLv'); if(blv) blv.textContent = E.data.isBoss ? '首领' : '小怪';
    const bh = $('boss-hp-text'); if(bh) bh.textContent = E.data.hp+'/'+E.data.maxHp;
    const im = $('enemy-img'); if(im){ im.src = E.data.img; im.className = E.data.isBoss ? 'boss' : ''; }
  },

  // 竞技场：四王强化版数据（HP×2.6 攻×1.25，材料照常掉落）
  arenaData(i){
    const b = ENEMIES[ARENA_SEQUENCE[i]];
    const hp = Math.round(b.hp * ARENA_MULT.hp);
    return {
      name: '觉醒·'+b.name,
      maxHp: hp, hp: hp,
      atk: Math.round(b.atk * ARENA_MULT.atk), def: Math.round(b.def * 1.3),
      exp: Math.round(b.exp * 1.5), gold: Math.round(b.gold * 1.5),
      img: b.img, drops: b.drops||[], interval: b.interval,
      isBoss: true,
      castName: b.castName, castEvery: b.castEvery, castTime: b.castTime, castDmgMul: b.castDmgMul,
      arena: true
    };
  },

  onDeath(){
    // 玩家被击败：立即停止一切战斗逻辑并锁定输入（active=false → 技能与 tick 战斗判定全部失效）
    this.active = false;
    this.stopEnemyAttack();
    this.setAuto(false);
    P.casting = null;
    this.hideCastBar();
    if(E.data){ E.casting = false; E.castEndAt = 0; }
    const es = $('enemy-sprite'); if(es) es.classList.remove('casting');
    this.hideEnemyCast();
    this.showDeathOverlay();
    this._respawnTimer && clearTimeout(this._respawnTimer);
    const self = this;
    this._respawnTimer = setTimeout(()=>self.revive(), DEATH_LOCK_MS);
    this.renderHp();
  },

  // 死亡遮罩：提示被谁击败 + 倒计时（期间 active=false，禁止一切攻击）
  showDeathOverlay(){
    const ov = $('death-overlay');
    if(!ov){
      this.logPush('<span class="dmg-ene">☠ 你被 '+E.data.name+' 击败，即将复活…</span>');
      return;
    }
    const by = $('deathBy'); if(by) by.textContent = '被 '+E.data.name+' 击败';
    ov.classList.add('show');
    this._deathReviveAt = Date.now() + DEATH_LOCK_MS;
    this._deathCountTimer && clearInterval(this._deathCountTimer);
    const upd = ()=>{
      const remain = Math.max(0, Math.ceil((this._deathReviveAt - Date.now())/1000));
      const el = $('deathCount');
      if(el) el.textContent = remain>0 ? remain+' 秒后复活' : '复活中…';
    };
    upd();
    this._deathCountTimer = setInterval(upd.bind(this), 200);
  },
  hideDeathOverlay(){
    const ov = $('death-overlay'); if(ov) ov.classList.remove('show');
    this._deathCountTimer && clearInterval(this._deathCountTimer);
    this._deathCountTimer = null;
  },

  // 玩家复活：重置技能状态与敌人状态，重新开战
  revive(){
    this.hideDeathOverlay();
    if(!E.data) return;
    // --- 重置玩家战斗状态（连段/印记/剑气/buff/咏唱全清，HP 回满）---
    P.hp = P.maxHp;
    P.buf = ''; P.bufUntil = 0;
    P.flags = { A:0, B:0, C:0 };
    P.seals = { snow:false, moon:false, hana:false };
    P.gcdUntil = 0; P.gcdTotal = 1;
    P.shieldUntil = 0; P.shieldCdUntil = 0;
    P.qi = 0;
    P.pressLockUntil = Date.now() + PRESS_LOCK_MS;
    P.buffUntil = 0;
    P.ultFollowReady = false;
    P.qiCdUntil = 0; P.qiCdTotal = 1;
    P.buffCdUntil = 0; P.buffCdTotal = 1;
    P.casting = null;
    P.zsUntil = 0; P.cdBuffUntil = 0;
    // --- 重置敌人状态（回满血、清读条、重置施法计时）---
    E.data.hp = E.data.maxHp;
    E.casting = false; E.castEndAt = 0;
    E.nextCastAt = Date.now() + (E.data.castEvery || 4000);
    const es = $('enemy-sprite'); if(es) es.classList.remove('dying','casting');
    this.hideEnemyCast();
    if($('kill-burst')) $('kill-burst').classList.remove('go');
    const dl = $('drop-layer'); if(dl) dl.innerHTML = '';
    // --- 重新开战 ---
    this.active = true;
    this.renderButtons(); this.renderSeals(); this.renderQi();
    this.renderFollow(); this.renderHp();
    this.startEnemyAttack();
    this.logPush('<span class="win">重新振作！'+E.data.name+' 恢复全盛状态</span>');
  },

  // ---------- 循环帧 ----------
  tick(){
    const now = Date.now();

    // 提示弹窗打开 = 战场暂停：顺延所有敌方计时器并跳过本帧
    if(this.tutShowing()){
      E.nextCastAt += TICK_MS;
      if(E.casting) E.castEndAt += TICK_MS;
      if(P.casting) P.casting.until += TICK_MS;
      if(E.enc && E.enc.kind==='arena' && this.arenaStart) this.arenaStart += TICK_MS; // 连战计时同步冻结
      return;
    }

    // 竞技场计时器（顶部 HUD）
    const tm = $('hud-timer');
    if(tm){
      const inArena = E.enc && E.enc.kind==='arena' && this.active && E.data;
      if(inArena){
        tm.style.display = '';
        tm.textContent = '⏱ '+fmtTime(now - this.arenaStart)+' · 第'+(this.arenaIdx+1)+'/4战';
      } else tm.style.display = 'none';
    }

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

    // 连击链超时（A/B/C flag 各自自然过期，无需手动复位）
    if(P.buf && now > P.bufUntil){ P.buf=''; }
    // 按钮文本/色相由 flag 实时派生
    this.renderButtons();

    // 「势」只作为 2-x/3-x 派生技的入场券（30s）；段数复位已改由连击窗口超时驱动

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

    // 条件不满足 → 置灰不可点（仅对已解锁技能生效；未解锁保留点击提示解锁等级）
    const setCond = (b, off)=>{
      if(!b) return;
      b.disabled = off;
      b.classList.toggle('cond-off', off);
    };
    setCond($('btnSkill6'), P.level>=UNLOCK_LV.qi && P.qi < QISTRIKE.qiCost);
    setCond($('btnSkill8'), P.level>=UNLOCK_LV.follow && !P.ultFollowReady);
    setCond(b4, P.level>=UNLOCK_LV.ult && !ready);
    setCond($('btnSkill2'), P.level>=UNLOCK_LV.b2 && !this.hasFlag('A') && !this.hasFlag('C'));
    setCond($('btnSkill3'), P.level>=UNLOCK_LV.b3 && !this.hasFlag('A'));

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
        E.castTotal = E.data.castTime || 1500;
        E.castEndAt = now + E.castTotal;
        $('enemy-sprite').classList.add('casting');
        this.showEnemyCast(E.data.castName);
        this.logPush('<span class="warn">'+E.data.name+' 读条「'+E.data.castName+'」！格挡反制！</span>');
      } else if(E.casting && now >= E.castEndAt){
        E.casting = false;
        E.nextCastAt = now + (E.data.castEvery||4000);
        $('enemy-sprite').classList.remove('casting');
        this.hideEnemyCast();
        if(now < P.shieldUntil){
          if(P.level >= UNLOCK_LV.qiSrc){ P.qi = Math.min(QI_MAX, P.qi + QI_PER_BLOCK); } // 反制成功也积累剑气（Lv15 被动）
          if(P.level >= UNLOCK_LV.shieldCd && P.shieldCdUntil > now){
            P.shieldCdUntil = Math.round(now + (P.shieldCdUntil-now)*0.5); // 铁壁回元
          }
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
      } else if(E.casting){
        const f = $('enemyCastFill');
        if(f) f.style.width = Math.min(100, Math.max(0, (1-(E.castEndAt-now)/E.castTotal)*100))+'%';
      }
    }

    // 自动连招驱动
    if(this.auto){ this.autoAction(); }
  },

  // ---------- FF14 式连击条件（flag）引擎 ----------
  hasFlag(f){ return Date.now() < (P.flags[f] || 0); },
  // 按当前 flag 推导该键此刻释放的段（null = 条件不足不可放）
  nextAction(action){
    if(action==='1'){
      if(this.hasFlag('B')) return { st:2, skill:BTN1[2] };
      if(this.hasFlag('A')) return { st:1, skill:BTN1[1] };
      return { st:0, skill:BTN1[0] };               // 1-1 起手永远可放
    }
    if(action==='2'){
      if(this.hasFlag('C')) return { st:1, skill:BTN2[1] };
      if(this.hasFlag('A')) return { st:0, skill:BTN2[0] };
      return null;
    }
    if(action==='3') return this.hasFlag('A') ? { st:0, skill:BTN3 } : null;
    return null;
  },
  // 消耗前置条件，给予新条件（支线互斥，不会错乱）
  applyFlags(skill, now){
    if(skill.req) P.flags[skill.req] = 0;
    if(skill.set) P.flags[skill.set] = now + CHI_MS;
  },

  // 当前可连击的按键提示（st>0 才算连段延续；未解锁不提示）
  nextHints(){
    const lvk = { '1':'b1', '2':'b2', '3':'b3' };
    const out = [];
    ['1','2','3'].forEach(c=>{
      if(P.level < UNLOCK_LV[lvk[c]]) return;
      const s = this.nextAction(c);
      // 按钮1 仅连段中提示（起手技常驻不高亮）；派生键只要有条件就提示
      if(s && (c==='1' ? s.st > 0 : true)) out.push(c);
    });
    return out;
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
    const s1 = this.nextAction('1'), s2 = this.nextAction('2');
    const st1 = s1?s1.st:0, st2 = s2?s2.st:0;
    if(i1){ i1.style.filter = TINTS[st1]; b1.textContent=BADGES[st1]; l1.textContent=BTN1[st1].name; }
    if(i2){ i2.style.filter = TINTS[st2]; b2.textContent=BADGES[st2]; l2.textContent=BTN2[st2].name + (s2? '' : '·待势'); }
    if(i3){ i3.style.filter = ''; l3.textContent=BTN3.name + (this.hasFlag('A')? '' : '·待势'); }
  },

  renderSeals(){
    const s = P.seals;
    $('sealSnow').classList.toggle('lit-snow', s.snow);
    $('sealMoon').classList.toggle('lit-moon', s.moon);
    $('sealHana').classList.toggle('lit-hana', s.hana);
  },

  // 剑气条（解锁「一闪」后才显示）
  renderQi(){
    P.qi = Math.max(0, Math.min(QI_MAX, P.qi));
    const fill = $('qi-fill');
    if(fill) fill.style.width = (P.qi/QI_MAX*100)+'%';
    const txt = $('qi-text');
    if(txt) txt.textContent = P.qi+'/'+QI_MAX;
    const w = $('qiWrap');
    if(w) w.style.display = P.level >= UNLOCK_LV.qi ? '' : 'none';
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
    const tg = $('tGold'); if(tg) tg.textContent = P.gold;
    const tc = $('tCry'); if(tc) tc.textContent = P.crystal;
    const tm = $('tMat'); if(tm) tm.textContent = MAT_ORDER.reduce((s,k)=>s+(P.materials[k]||0),0);
    this.renderExp();
  },

  // 玩家等级 + 经验条（战斗左下角，方便判断升级进度）
  renderExp(){
    const lv = $('ppLv'); if(lv) lv.textContent = 'Lv.'+P.level;
    const fill = $('ppExpFill'); if(!fill) return;
    if(P.level >= levelCap()){
      fill.style.width = '100%';
      return;
    }
    fill.style.width = expProgress().pct+'%';
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
    this._respawnTimer && clearTimeout(this._respawnTimer);   // 取消敌人重生/复活排程，防止后台把 active 重新置 true
    this.hideDeathOverlay();                                  // 关闭死亡遮罩并停止倒计时
    if(E.data){ E.casting = false; E.castEndAt = 0; }         // 清敌人读条状态
    this.hideEnemyCast();
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
    // 非 GCD 插入：剑气够放即一闪（0.1s CD，连发由剑气存量驱动）
    if(P.level >= UNLOCK_LV.qi && P.qi >= QISTRIKE.qiCost && now >= P.qiCdUntil){
      this.onSkillPress('qi', $('btnSkill6')); return;
    }
    // 非 GCD 插入：三印齐时先开战意，保证接下来的居合吃到 +20%
    const sealsFull = P.seals.snow && P.seals.moon && P.seals.hana;
    if(P.level >= UNLOCK_LV.buff && sealsFull && now >= P.buffCdUntil && now >= P.buffUntil){
      this.onSkillPress('buff', $('btnSkill7')); return;
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
      P.buf = ''; P.flags = { A:0, B:0, C:0 };
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
