import { CLASS_DATA, ENEMIES } from './config.js';
import { formatTime, clamp } from './utils.js';

export class HUD {
  constructor(){
    this.el=Object.fromEntries([...document.querySelectorAll('[id]')].map(node=>[node.id,node]));
    this.toastTimer=0;this.mapCtx=this.el.minimap.getContext('2d');this.lastMapDraw=0;
    this.el.enterBaseButton.addEventListener('click',()=>{this.el.welcomeOverlay.hidden=true;window.dispatchEvent(new CustomEvent('hud:enterBase'));});
    this.el.helpButton.addEventListener('click',()=>this.openHelp());
    this.el.closeHelpButton.addEventListener('click',()=>this.closeHelp());
    this.el.resumeButton.addEventListener('click',()=>this.closeHelp());
    this.el.returnBaseButton.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('hud:returnBase')));
    window.addEventListener('keydown',e=>{if(e.code==='F1'){e.preventDefault();this.el.helpOverlay.hidden?this.openHelp():this.closeHelp();}});
  }
  openHelp(){this.el.helpOverlay.hidden=false;window.dispatchEvent(new CustomEvent('hud:releasePointer'));}
  closeHelp(){this.el.helpOverlay.hidden=true;window.dispatchEvent(new CustomEvent('hud:resumePointer'));}
  setPauseVisible(visible){this.el.pauseIndicator.hidden=!visible;}
  setCinematic(visible,opacity,progress,title,subtitle,kicker){
    this.el.cinematicOverlay.style.opacity=String(opacity);this.el.cinematicOverlay.style.display=visible?'flex':'none';
    if(title)this.el.cinematicTitle.textContent=title;if(subtitle)this.el.cinematicSubtitle.textContent=subtitle;if(kicker)this.el.cinematicKicker.textContent=kicker;
    this.el.cinematicProgress.style.width=`${Math.round(clamp(progress,0,1)*100)}%`;
  }
  setStage(stage){
    const names={base:['基地整备','基地简报','准备出发','选择职业，在任务简报台接取远征任务。'],cave:['洞穴远征','地底战区','挖掘并交存晶矿','探索随机房间网络，交存 200 晶矿后撤离船自动返航。'],returning:['撤离返场','撤离船返航','撤离船正在前往撤离点','全体玩家登舱后飞船自动起飞。'],boarding:['等待全体登舱','撤离船已抵达','返回撤离船','洞穴增援持续增加；进入舱内安全区等待其他玩家。'],result:['行动结束','远征结算','任务结果已锁定','查看本局统计并返回基地。']};
    const v=names[stage]||names.base;this.el.stageText.textContent=v[0];this.el.phaseEyebrow.textContent=v[1];this.el.phaseTitle.textContent=v[2];this.el.phaseDescription.textContent=v[3];
    this.el.cargoCard.hidden=stage==='base'||stage==='result';this.el.threatCard.hidden=stage==='base'||stage==='result';this.el.mapCard.hidden=stage==='result';
    if(stage!=='base')this.el.missionPreview.hidden=true;
  }
  setClass(classId){const data=CLASS_DATA[classId];this.el.classHud.textContent=data.name;}
  setPrompt(text,visible=true,key='E'){this.el.interactPrompt.hidden=!visible;this.el.interactPrompt.querySelector('kbd').textContent=key;this.el.interactText.textContent=text;}
  setMissionPreview(visible,point,accepted=false,plan=null,resources=null){
    const panel=this.el.missionPreview;if(!panel)return;panel.hidden=!visible;if(!visible)return;
    this.el.previewState.textContent=accepted?'已接取':'待接取';
    const ids=plan?[...plan.commonTypes,...plan.eliteTypes,'boss']:[];
    this.el.previewEnemyTags.innerHTML=ids.map(id=>`<span class="enemy-tag ${ENEMIES[id]?.boss?'boss':ENEMIES[id]?.elite?'elite':'common'}">${ENEMIES[id]?.name||id}</span>`).join('');
    this.el.previewPlanLabel.textContent=plan?`波次 ${plan.id} · ${plan.name}`:'接取后随机抽取 1 套';
    if(resources){this.el.previewCrystalTotal.textContent=resources.crystal;this.el.previewNitraTotal.textContent=resources.nitra;}
    const x=clamp((point?.x??window.innerWidth*.58)+22,14,window.innerWidth-302),y=clamp((point?.y??window.innerHeight*.45)-90,82,window.innerHeight-300);
    panel.style.left=`${x}px`;panel.style.top=`${y}px`;
  }
  setHold(label,ratio,visible){this.el.holdProgress.hidden=!visible;if(visible){this.el.holdLabel.textContent=label;const p=Math.round(clamp(ratio,0,1)*100);this.el.holdPercent.textContent=`${p}%`;this.el.holdFill.style.width=`${p}%`;}}
  toast(text,kind='info'){
    this.el.toast.textContent=text;this.el.toast.dataset.kind=kind;this.el.toast.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.el.toast.classList.remove('show'),2100);
  }
  hit(crit=false){this.el.hitConfirm.classList.remove('show');void this.el.hitConfirm.offsetWidth;this.el.hitConfirm.textContent=crit?'✦':'×';this.el.hitConfirm.classList.toggle('crit',crit);this.el.hitConfirm.classList.add('show');}
  float(text,x,y,kind='normal'){
    const node=document.createElement('div');node.className=`float-text ${kind}`;node.textContent=text;node.style.left=`${x}px`;node.style.top=`${y}px`;this.el.floatingLayer.appendChild(node);setTimeout(()=>node.remove(),900);
  }
  showResult(result){
    this.setStage('result');
    const success=result.success;
    this.el.resultStamp.textContent=success?'MISSION COMPLETE':'MISSION FAILED';this.el.resultStamp.classList.toggle('failed',!success);
    this.el.resultTitle.textContent=success?'成功撤离':'任务失败';this.el.resultDescription.textContent=result.reason||'飞船已返航。';
    this.el.resultOre.textContent=`${result.deposited||0} / 200`;this.el.resultKills.textContent=String(result.kills||0);this.el.resultPlan.textContent=result.plan||'--';this.el.resultTime.textContent=formatTime(result.time||0);this.el.resultOverlay.hidden=false;
  }
  hideResult(){this.el.resultOverlay.hidden=true;}
  update(game,dt=0){
    const p=game.player;
    this.el.healthValue.textContent=Math.ceil(p.health);this.el.shieldValue.textContent=Math.ceil(p.shield);
    this.el.healthFill.style.width=`${clamp(p.health,0,100)}%`;this.el.shieldFill.style.width=`${clamp(p.shield/50*100,0,100)}%`;
    this.el.classHud.textContent=CLASS_DATA[p.classId].name;
    this.el.objectiveValue.textContent=Math.min(game.deposited.crystal,200);this.el.objectiveFill.style.width=`${clamp(game.deposited.crystal/200*100,0,100)}%`;
    this.el.crystalCarried.textContent=p.cargo.crystal;this.el.nitraCarried.textContent=p.cargo.nitra;this.el.crystalDeposited.textContent=game.deposited.crystal;this.el.nitraBank.textContent=game.teamNitra;
    const slot=p.selectedSlot??0,gear=CLASS_DATA[p.classId].loadout[slot];
    this.el.gearName.textContent=gear.name;this.el.gearSlot.textContent=`${gear.slot} · ${slot+1}`;this.el.gearBadge.textContent=gear.badge;
    if(gear.tool==='drill'){this.el.ammoValue.textContent=Math.floor(p.fuelBySlot[slot]??gear.fuel);this.el.magValue.textContent='';this.el.heatFill.style.width='0%';}
    else if(gear.fuel!==undefined){this.el.ammoValue.textContent=Math.floor(p.fuelBySlot[slot]??gear.fuel);this.el.magValue.textContent=Math.floor(p.fuelReserveBySlot[slot]??gear.reserve??0);this.el.heatFill.style.width=`${clamp(game.flameHeat,0,100)}%`;}
    else if(gear.mag!==undefined){this.el.ammoValue.textContent=p.reserveBySlot[slot]??gear.reserve??0;this.el.magValue.textContent=p.magBySlot[slot]??gear.mag;this.el.heatFill.style.width=gear.heat?`${clamp(game.weaponHeat,0,100)}%`:'0%';}
    else {this.el.ammoValue.textContent=gear.charges!==undefined?(p.chargesBySlot[slot]??gear.charges):'∞';this.el.magValue.textContent=gear.tool==='drill'?Math.floor(p.fuelBySlot[slot]??gear.fuel??0):'';this.el.heatFill.style.width='0%';}
    const hasMagazine=gear.mag!==undefined,hasFuelReserve=gear.fuel!==undefined&&gear.tool!=='drill';this.el.ammoSeparator.hidden=!(hasMagazine||hasFuelReserve);this.el.magValue.hidden=!(hasMagazine||hasFuelReserve);
    this.el.app.querySelectorAll('.slot-hints [data-slot]').forEach(key=>key.classList.toggle('active',Number(key.dataset.slot)===slot));
    this.el.grenadeValue.textContent=String(p.grenades);
    const stage=game.stage;
    if(stage==='base'){
      this.el.phaseStatus.textContent='行动待命';this.el.phaseStatusValue.textContent=game.accepted?'已接单':'未接单';
      this.el.roomLabel.textContent='基地';this.el.clockLabel.textContent='行动状态';this.el.clockValue.textContent=game.accepted?'READY':'BASE';this.el.clockSub.textContent=game.accepted?'ENTER THE SHIP':'PREPARE';
    }else if(stage==='cave'||stage==='returning'||stage==='boarding'){
      const t=game.elapsed;
      this.el.phaseStatus.textContent=game.deposited.crystal>=200?'主目标完成':'任务进度';this.el.phaseStatusValue.textContent=game.deposited.crystal>=200?'等待撤离':'进行中';
      this.el.roomLabel.textContent=game.currentRoom?`区段 ${String(game.currentRoom.id+1).padStart(2,'0')}`:'洞穴';
      if(game.shipArrived){this.el.clockLabel.textContent='撤离船已返场';this.el.clockValue.textContent=`+${formatTime(game.elapsed-game.shipArrivedAt)}`;this.el.clockSub.textContent='全体登舱 · 自动起飞';}
      else if(game.returnAt!==null){this.el.clockLabel.textContent='撤离船预计抵达';this.el.clockValue.textContent=formatTime(Math.max(0,game.returnAt-game.elapsed));this.el.clockSub.textContent=game.returnEarly?'自动返航':'PLAN RETURN 10:00';}
      else{this.el.clockLabel.textContent='撤离船计划返场';this.el.clockValue.textContent=formatTime(Math.max(0,600-t));this.el.clockSub.textContent='WAVE PRESSURE RISING';}
      if(game.nextWaveAt!==null){this.el.waveLabel.textContent=game.nextWaveAt<=game.elapsed?'虫潮增援':'虫潮预警';this.el.nextWaveText.textContent=game.nextWaveAt>game.elapsed?`下一波 ${formatTime(game.nextWaveAt-game.elapsed)}`:'增援队列已满';}
      this.el.wavePlanLabel.textContent=game.wavePlan?`${game.wavePlan.id} · ${game.wavePlan.name}`:'波次载入';
      const cap=game.activeCap??12,count=game.enemies.filter(e=>e.alive&&e.active!==false).length;
      this.el.enemyCount.textContent=`${count} / ${cap}`;this.el.threatFill.style.width=`${clamp(count/Math.max(1,cap)*100,0,100)}%`;
      this.el.bossCard.hidden=!game.boss||!game.boss.alive||game.boss.active===false;
      if(game.boss&&game.boss.alive){this.el.bossFill.style.width=`${clamp(game.boss.hp/game.boss.maxHp*100,0,100)}%`;this.el.bossHealthText.textContent=`${Math.ceil(game.boss.hp)} / ${game.boss.maxHp}`;this.el.bossPhase.textContent=`PHASE ${['I','II','III'][Math.max(0,game.boss.phase-1)]||'I'}`;this.el.bossWeakpointText.textContent=game.boss.coreOpen||game.boss.phaseSacsOpen?'弱点暴露 · 伤害 ×2':'寻找身体弱点';}
    }
    this.drawMap(game);
  }
  drawMap(game){
    if(!game.world.rooms.length)return;
    const now=performance.now();if(now-this.lastMapDraw<150)return;this.lastMapDraw=now;
    const canvas=this.el.minimap,ctx=this.mapCtx,w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(5,9,8,.75)';ctx.fillRect(0,0,w,h);
    const rooms=game.world.rooms,allX=rooms.map(r=>r.x),allZ=rooms.map(r=>r.z),minX=Math.min(...allX)-14,maxX=Math.max(...allX)+14,minZ=Math.min(...allZ)-14,maxZ=Math.max(...allZ)+14;
    const sx=(w-28)/(maxX-minX),sz=(h-24)/(maxZ-minZ),scale=Math.min(sx,sz),ox=(w-(maxX-minX)*scale)/2,oy=(h-(maxZ-minZ)*scale)/2;
    const pos=r=>({x:ox+(r.x-minX)*scale,y:oy+(r.z-minZ)*scale});
    ctx.lineWidth=2;for(const link of game.world.links){if(!link.roomA.visited&&!link.roomB.visited)continue;const a=pos(link.roomA),b=pos(link.roomB);ctx.strokeStyle=link.passable?'rgba(128,180,153,.6)':'rgba(151,136,103,.45)';ctx.setLineDash(link.passable?[]:[3,3]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.setLineDash([]);
    for(const room of rooms){if(!room.visited)continue;const p=pos(room);ctx.fillStyle=room===game.world.currentRoom?'#a5e1c3':'#6d8072';ctx.fillRect(p.x-5,p.y-4,10,8);if(room===game.world.exitRoom){ctx.strokeStyle='#ffb347';ctx.lineWidth=1.5;ctx.strokeRect(p.x-7,p.y-6,14,12);}if(room===game.world.bossRoom&&game.boss){ctx.fillStyle='#e65e4b';ctx.fillRect(p.x-2,p.y-2,4,4);}}
    if(game.player){const room=game.world.roomAt(game.player.position);if(room?.visited){const p=pos(room);ctx.fillStyle='#fff3b0';ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fill();}}
  }
}

