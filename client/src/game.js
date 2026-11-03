import * as THREE from '../vendor/three.module.js';
import { CLASS_DATA, ENEMIES, WAVE_PLANS, WAVE_TOTALS, WAVE_TIMES, ELITE_COUNTS, ACTIVE_CAPS, RETURN_AT, EARLY_RETURN_TRAVEL, WEAKPOINT_MULTIPLIER } from './config.js';
import { seeded, clamp, randomBetween, pick, allocateWeighted, formatTime } from './utils.js';
import { ExpeditionWorld } from './world.js';
import { Enemy } from './entities.js';
import { HUD } from './ui.js';

function playerMaterial(color,roughness=.75,metalness=.1){return new THREE.MeshStandardMaterial({color,roughness,metalness});}

export class Game {
  constructor(){
    this.canvas=document.getElementById('scene');this.hud=new HUD();
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));this.renderer.setSize(window.innerWidth,window.innerHeight,false);
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x0a100f);this.scene.fog=new THREE.FogExp2(0x0d1411,.006);
    this.camera=new THREE.PerspectiveCamera(68,window.innerWidth/window.innerHeight,.08,180);
    this.hemi=new THREE.HemisphereLight(0x9caeaa,0x20261d,2.0);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xffd59a,2.8);this.sun.position.set(-24,36,18);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1536,1536);this.scene.add(this.sun);
    this.clock=new THREE.Clock();this.raycaster=new THREE.Raycaster();this.camRay=new THREE.Raycaster();this.screenCenter=new THREE.Vector2(0,0);
    this.rng=seeded(Date.now());this.world=new ExpeditionWorld(this.scene,this.rng);this.world.buildBase();
    this.stage='base';this.started=false;this.accepted=false;this.elapsed=0;this.missionSeed=0;this.wavePlan=null;this.waveIndex=0;this.nextWaveAt=null;this.overtimeIndex=0;this.activeCap=12;
    this.enemies=[];this.projectiles=[];this.throwables=[];this.telegraphs=[];this.acidPatches=[];this.sentries=[];this.platforms=[];this.ziplines=[];this.flareLights=[];this.shieldBubbles=[];this.satchels=[];this.ifgFields=[];this.lures=[];this.spawnQueue=[];this.pendingSpawnTimer=0;
    this.boss=null;this.bossSpawned=false;this.shipArrived=false;this.shipArrivedAt=0;this.returnAt=null;this.returnEarly=false;this.shipDoorOpen=false;this.playerBoarded=false;
    this.deposited={crystal:0,nitra:0};this.teamNitra=0;this.totalKills=0;this.damageTaken=0;this.interactTarget=null;this.depositAccumulator=0;this.reloadTimer=0;this.weaponCooldown=0;this.weaponHeat=0;this.flameHeat=0;this.overheatedUntil=0;this.lightCooldown=0;this.actionCooldown={};
    this.keys=new Set();this.mouseDown=false;this.eHeld=false;this.pointerActive=false;this.grapple=null;this.jumpVelocity=0;this.playerSpeed=6.6;this.cameraYaw=0;this.cameraPitch=.22;this.cameraDistance=5.6;this.cameraLookAt=new THREE.Vector3();this.cameraPosition=new THREE.Vector3();this.elapsedAccumulator=0;
    this.previousMouseDown=false;this.activeSupplyPack=null;this.supplyHold=0;this.ifgFields=[];this.lures=[];this.ziplineRide=null;this.platforms=[];this.introWake=false;this.previewPlan=null;
    this.player=this.createPlayer('gunner');this.player.position.set(0,0,-6);this.player.group.position.copy(this.player.position);this.scene.add(this.player.group);this.world.markVisited?.(null);
    this.bindInput();this.bindHUD();window.addEventListener('resize',()=>this.resize());
    this.hud.setStage('base');this.hud.setClass('gunner');
    this.animate();
  }

  createPlayer(classId){
    const data=CLASS_DATA[classId],group=new THREE.Group();
    const suit=playerMaterial(0x5c655e,.68,.24),dark=playerMaterial(0x222b27,.7,.2),trim=playerMaterial(data.color,.42,.36,{emissive:data.color,emissiveIntensity:.08}),visor=playerMaterial(0x93bab0,.23,.35,{emissive:0x285c55,emissiveIntensity:.25});
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.86,4,8),suit);torso.position.y=1.13;torso.castShadow=true;group.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.31,12,10),dark);head.position.set(0,1.91,-.02);head.castShadow=true;group.add(head);
    const visorMesh=new THREE.Mesh(new THREE.BoxGeometry(.42,.15,.1),visor);visorMesh.position.set(0,1.98,.26);group.add(visorMesh);
    const chest=new THREE.Mesh(new THREE.BoxGeometry(.83,.38,.42),trim);chest.position.set(0,1.31,.05);chest.castShadow=true;group.add(chest);
    const pack=new THREE.Mesh(new THREE.BoxGeometry(.56,.75,.4),dark);pack.position.set(0,1.35,-.42);pack.castShadow=true;group.add(pack);
    const helmetLamp=new THREE.PointLight(0xd9e8c9,18,15,1.7);helmetLamp.position.set(0,1.82,.35);group.add(helmetLamp);
    for(const s of [-1,1]){
      const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.24,9,8),trim);shoulder.position.set(s*.55,1.45,.02);group.add(shoulder);
      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.58,3,6),dark);leg.position.set(s*.22,.5,0);leg.castShadow=true;group.add(leg);
    }
    // Visible hand-held tool silhouette; changes accent color with the selected slot.
    const weapon=new THREE.Group();weapon.name='weaponModel';
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.075,.12,.92,8),dark);barrel.rotation.x=Math.PI/2;barrel.position.set(.31,1.22,.61);weapon.add(barrel);
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(.34,.26,.62),trim);receiver.position.set(.1,1.22,.38);weapon.add(receiver);group.add(weapon);
    group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    const loadout=data.loadout;
    const player={classId,group,position:new THREE.Vector3(),velocity:new THREE.Vector3(),health:100,shield:50,cargo:{crystal:0,nitra:0},selectedSlot:0,
      magBySlot:loadout.map(x=>x.mag??0),reserveBySlot:loadout.map(x=>x.reserve??0),fuelBySlot:loadout.map(x=>x.fuel??x.maxFuel??0),fuelReserveBySlot:loadout.map(x=>x.reserve??0),chargesBySlot:loadout.map(x=>x.charges??x.maxCharges??0),grenades:data.grenade.count,
      lastDamage:-99,shieldRegenDelay:6,shieldRegen:10,alive:true,weapon,flareCharges:4,flareRestore:0,legs:group.children.filter(o=>o.isMesh&&o.geometry?.type==='CapsuleGeometry'),state:'standing'};
    player.stats={shots:0,hits:0,weakHits:0,terrainBroken:0};
    return player;
  }

  bindInput(){
    window.addEventListener('keydown',e=>{
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      if(e.repeat)return;
      if(!this.hud.el.helpOverlay.hidden&&e.code!=='Escape')return;
      this.keys.add(e.code);
      if(e.code==='Digit1')this.selectSlot(0);if(e.code==='Digit2')this.selectSlot(1);if(e.code==='Digit3')this.selectSlot(2);if(e.code==='Digit4')this.selectSlot(3);if(e.code==='Digit5')this.selectSlot(4);
      if(e.code==='KeyE')this.startInteract();
      if(e.code==='KeyR')this.reload();
      if(e.code==='KeyF')this.throwFlare();
      if(e.code==='KeyG')this.throwGrenade();
      if(e.code==='KeyB')this.callSupply();
      if(e.code==='Space')this.jump();
      if(e.code==='Escape'&&this.started){if(document.pointerLockElement)document.exitPointerLock();else if(this.hud.el.helpOverlay.hidden)this.hud.openHelp();else this.hud.closeHelp();}
    });
    window.addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code==='KeyE')this.endInteract();});
    this.canvas.addEventListener('mousedown',e=>{if(e.button===0){if(!document.pointerLockElement&&!this.hud.el.helpOverlay.hidden)return;this.requestPointer();this.mouseDown=true;}});
    window.addEventListener('mouseup',e=>{if(e.button===0)this.mouseDown=false;});
    this.canvas.addEventListener('click',()=>{if(this.started&&!document.pointerLockElement&&!this.hud.el.helpOverlay.hidden)this.requestPointer();});
    window.addEventListener('mousemove',e=>{if(!document.pointerLockElement||!this.started)return;this.cameraYaw-=e.movementX*.0026;this.cameraPitch=clamp(this.cameraPitch-e.movementY*.0018,-.26,.72);});
    document.addEventListener('pointerlockchange',()=>{this.pointerActive=Boolean(document.pointerLockElement);this.hud.setPauseVisible(this.started&&!this.pointerActive&&!this.hud.el.helpOverlay.hidden&&!this.hud.el.resultOverlay.hidden);});
    this.canvas.addEventListener('wheel',e=>{if(!this.started)return;e.preventDefault();this.selectSlot((this.player.selectedSlot+(e.deltaY>0?1:4))%5);},{passive:false});
    window.addEventListener('hud:enterBase',()=>{this.started=true;this.requestPointer();this.hud.setPauseVisible(false);this.hud.toast('基地整备完成 · 选择职业并接取任务');});
    window.addEventListener('hud:releasePointer',()=>{if(document.pointerLockElement)document.exitPointerLock();});
    window.addEventListener('hud:resumePointer',()=>{if(this.started&&!this.hud.el.resultOverlay.hidden)this.requestPointer();});
    window.addEventListener('hud:returnBase',()=>{this.hud.el.resultOverlay.hidden=true;this.returnToBase();});
  }

  bindHUD(){
    const btn=this.hud.el.helpButton;btn.addEventListener('click',()=>{if(document.pointerLockElement)document.exitPointerLock();});
  }

  requestPointer(){if(this.started&&!this.hud.el.helpOverlay.hidden&&!this.hud.el.resultOverlay.hidden)this.canvas.requestPointerLock?.();}
  resize(){this.renderer.setSize(window.innerWidth,window.innerHeight,false);this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));}

  enterMission(){
    const seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
    this.missionSeed=seed;const worldRng=seeded(seed);this.world.rng=worldRng;this.rng=seeded((seed^0x85ebca6b)>>>0);
    const waveRng=seeded((seed^0x9e3779b9)>>>0);this.wavePlan=this.previewPlan||pick(waveRng,WAVE_PLANS);this.previewPlan=this.wavePlan;
    this.world.generateCave(seed,this.wavePlan.id);
    this.stage='cave';this.elapsed=0;this.waveIndex=0;this.overtimeIndex=0;this.nextWaveAt=WAVE_TIMES[0];this.activeCap=12;
    this.clearTransient();this.enemies=[];this.spawnQueue=[];this.projectiles=[];this.throwables=[];this.telegraphs=[];this.acidPatches=[];this.sentries=[];this.platforms=[];this.ziplines=[];this.flareLights=[];this.shieldBubbles=[];this.satchels=[];this.ifgFields=[];this.lures=[];this.ziplineRide=null;this.boss=null;this.bossSpawned=false;
    this.shipArrived=false;this.shipArrivedAt=0;this.returnAt=null;this.returnEarly=false;this.shipDoorOpen=false;this.playerBoarded=false;
    this.deposited={crystal:0,nitra:0};this.teamNitra=0;this.totalKills=0;this.damageTaken=0;this.depositAccumulator=0;this.weaponCooldown=0;this.weaponHeat=0;this.flameHeat=0;this.overheatedUntil=0;this.waveSpawned=false;this.toastBossSeen=false;
    this.scene.remove(this.player.group);this.player=this.createPlayer(this.player.classId);this.player.group.position.copy(this.world.startRoom?new THREE.Vector3(this.world.startRoom.x,0,this.world.startRoom.z):new THREE.Vector3());this.player.position.copy(this.player.group.position);this.player.yaw=0;this.scene.add(this.player.group);this.currentRoom=this.world.startRoom;this.world.markVisited(this.currentRoom);
    if(this.world.bossRoom){this.boss=new Enemy('boss',this.world.bossRoom,new THREE.Vector3(this.world.bossRoom.x,0,this.world.bossRoom.z),this.scene,this.rng);this.boss.active=false;this.boss.group.visible=false;this.enemies.push(this.boss);}
    this.hud.setStage('cave');this.hud.toast(`随机地图已生成 · 波次编排 ${this.wavePlan.id}「${this.wavePlan.name}」`);
    this.requestPointer();
  }

  startLaunchCinematic(ship){
    const target=ship.position.clone().add(new THREE.Vector3(0,2,0));
    this.cinematic={type:'launch',time:0,duration:3.8,ship,fromCamera:this.camera.position.clone(),target,switched:false};
    this.stage='cinematic';this.mouseDown=false;this.hud.setCinematic(true,0,0,'舱门闭锁','飞船正在准备发射','LAUNCH SEQUENCE');
  }

  startReturnCinematic(reason){
    const ship=this.world.ship,target=ship?ship.position.clone().add(new THREE.Vector3(0,2,0)):this.player.position.clone().add(new THREE.Vector3(0,2,0));
    this.cinematic={type:'return',time:0,duration:4.1,ship,fromCamera:this.camera.position.clone(),target,switched:false,reason,result:{deposited:this.deposited.crystal,kills:this.totalKills,plan:this.wavePlan?`${this.wavePlan.id} · ${this.wavePlan.name}`:'--',time:this.elapsed}};
    this.stage='cinematic';this.mouseDown=false;this.hud.setCinematic(true,0,0,'全员登舱','撤离船正在离开洞穴','EXTRACTION COMPLETE');
  }

  updateCinematic(dt){
    const c=this.cinematic;if(!c)return;c.time+=dt;const t=c.time;
    if(c.type==='launch'){
      if(c.ship?.parent){c.ship.position.y=Math.sin(Math.min(t/2,1)*Math.PI)*.48;c.ship.rotation.y=Math.sin(t*.8)*.04;}
      if(t<1.85){const u=clamp(t/1.85,0,1),ship=c.ship?.position||new THREE.Vector3(0,0,19),close=ship.clone().add(new THREE.Vector3(7,3.6,9)),look=ship.clone().add(new THREE.Vector3(0,1.8,1));this.camera.position.copy(c.fromCamera).lerp(close,1-Math.pow(1-u,3));this.camera.lookAt(look);this.hud.setCinematic(true,clamp((t-1.15)/.7,0,1),u,'舱门闭锁','地面组已就位 · 引擎点火','LAUNCH SEQUENCE');}
      if(t>=1.9&&!c.switched){c.switched=true;this.hud.setCinematic(true,1,.55,'','穿越矿层 · 空降准备','DROP TRANSIT');this.enterMission();this.stage='cinematic';c.target=this.player.position.clone().add(new THREE.Vector3(0,1.6,0));c.toCamera=this.player.position.clone().add(new THREE.Vector3(.8,3.6,6.5));}
      if(c.switched){const u=clamp((t-2)/1.8,0,1);this.camera.position.lerp(c.toCamera,1-Math.pow(1-u,3));this.camera.lookAt(c.target);this.hud.setCinematic(true,1-u,.55+u*.45,u<.55?'':'抵达战区','',u<.55?'DROP TRANSIT':'INSERTION COMPLETE');if(t>=c.duration){this.cinematic=null;this.stage='cave';this.hud.setCinematic(false,0,1);this.hud.setStage('cave');this.requestPointer();}}
      return;
    }
    if(c.type==='return'){
      if(t<1.75&&c.ship?.parent){c.ship.position.y=Math.min(5,t*1.9);c.ship.rotation.y+=dt*.1;}
      if(t<1.9){const u=clamp(t/1.9,0,1),ship=c.ship?.position||c.target,close=ship.clone().add(new THREE.Vector3(7,3.6,9)),look=ship.clone().add(new THREE.Vector3(0,1.8,0));this.camera.position.copy(c.fromCamera).lerp(close,1-Math.pow(1-u,3));this.camera.lookAt(look);this.hud.setCinematic(true,clamp((t-1.2)/.7,0,1),u,'全员登舱','舱门闭锁 · 飞船离地','RETURN TRANSIT');}
      if(t>=1.95&&!c.switched){c.switched=true;this.hud.setCinematic(true,1,.55,'','返回基地 · 准备接管','BASE APPROACH');this.returnToBase();this.stage='cinematic';c.arrivalShip=this.world.interactables.find(item=>item.type==='ship')?.mesh;if(c.arrivalShip){c.arrivalShip.position.y=12;c.arrivalCamera=c.arrivalShip.position.clone().add(new THREE.Vector3(8,7,12));c.arrivalLook=c.arrivalShip.position.clone().add(new THREE.Vector3(0,2,0));}c.target=this.player.position.clone().add(new THREE.Vector3(0,1.5,0));c.toCamera=this.player.position.clone().add(new THREE.Vector3(.8,3.6,6.5));}
      if(c.switched){const u=clamp((t-2.1)/1.9,0,1),approach=clamp(u/.35,0,1);if(c.arrivalShip){c.arrivalShip.position.y=12*(1-u);c.arrivalShip.rotation.y=Math.sin(u*Math.PI)*.08;}const blend=1-Math.pow(1-approach,3);this.camera.position.copy(c.arrivalCamera||c.toCamera).lerp(c.toCamera,blend);this.camera.lookAt((c.arrivalLook||c.target).clone().lerp(c.target,blend));this.hud.setCinematic(true,1-u,.55+u*.45,u<.35?'基地接收返航舱':'落地完成',u<.35?'接近停机坪 · 减速着陆':'基地回收完成 · 控制权已交还',u<.35?'BASE APPROACH':'TOUCHDOWN');if(t>=c.duration){this.cinematic=null;this.stage='base';this.hud.setCinematic(false,0,1);this.hud.setStage('base');const r=c.result||{};this.hud.toast(`任务成功 · 晶矿 ${r.deposited||200}/200 · 击杀 ${r.kills||0}`,'success');this.requestPointer();}}
    }
  }

  returnToBase(){
    this.scene.remove(this.player.group);this.clearTransient();this.enemies=[];this.spawnQueue=[];this.world.buildBase();this.stage='base';this.accepted=false;this.started=true;this.elapsed=0;this.player=this.createPlayer(this.player.classId);this.player.group.position.set(0,0,-6);this.player.position.set(0,0,-6);this.scene.add(this.player.group);
    this.shipArrived=false;this.returnAt=null;this.boss=null;this.wavePlan=null;this.previewPlan=null;this.currentRoom=null;this.hud.setStage('base');this.hud.setPauseVisible(false);this.hud.toast('返回基地 · 本局资源已清空');this.requestPointer();
  }

  selectSlot(slot){if(!this.started||this.stage==='result')return;this.player.selectedSlot=slot;this.weaponCooldown=0;this.hud.toast(CLASS_DATA[this.player.classId].loadout[slot].name);}

  startInteract(){
    if(this.ziplineRide){this.ziplineRide=null;this.jumpVelocity=2;this.endInteract();this.hud.toast('已离开滑索');return;}
    this.eHeld=true;
    if(this.stage==='base'){
      const aim=this.getAimDirection();const item=this.world.nearestInteractable(this.player.position,aim);
      if(!item){this.hud.toast('靠近并对准设备后按 E');return;}
      if(item.type==='class'){this.changeClass(item.id);return;}
      if(item.type==='mission'){if(!this.previewPlan)this.previewPlan=pick(this.rng,WAVE_PLANS);this.accepted=true;this.hud.toast('远征任务已接取 · 走入飞船出发');this.hud.update(this);return;}
      if(item.type==='supply'){this.restoreLoadout();this.hud.toast('整备完成 · 装备已补满');return;}
      if(item.type==='ship'){
        if(!this.accepted){this.hud.toast('请先在简报台接取任务');return;}
        this.startLaunchCinematic(item.mesh);return;
      }
      if(item.type==='target'){this.hud.toast('训练靶命中 · 不消耗弹药');return;}
    }
    if(this.stage==='cave'||this.stage==='returning'||this.stage==='boarding'){
      const item=this.world.nearestInteractable(this.player.position,this.getAimDirection());
      if(item?.type==='supplyPack'){this.activeSupplyPack=item;this.supplyHold=0;this.hud.setPrompt('长按 E 领取补给',true);return;}
      if(item?.type==='axe'){const max=CLASS_DATA[this.player.classId].grenade.max;if(this.player.grenades>=max){this.hud.toast('冲击斧携带量已满');return;}this.player.grenades++;item.used=true;this.world.group.remove(item.mesh);this.world.interactables=this.world.interactables.filter(x=>x!==item);this.hud.toast('冲击斧已回收');return;}
      if(item?.type==='zipline'){this.ziplineRide={line:item.line,t:item.endpoint===0?0:1,direction:item.endpoint===0?1:-1};this.eHeld=false;this.hud.toast('已乘上滑索 · Space 或 E 可离开');return;}
      if(item?.type==='robot'&&this.player.cargo.crystal+this.player.cargo.nitra===0){this.hud.toast('背包里没有可交存的矿物');return;}
    }
  }

  endInteract(){this.eHeld=false;this.depositAccumulator=0;}

  changeClass(classId){
    const old=this.player.group;this.scene.remove(old);this.player=this.createPlayer(classId);this.player.group.position.copy(old.position);this.player.position.copy(old.position);this.scene.add(this.player.group);this.hud.setClass(classId);this.hud.toast(`${CLASS_DATA[classId].name} · ${CLASS_DATA[classId].role}`);
  }

  restoreLoadout(){
    const data=CLASS_DATA[this.player.classId];this.player.health=100;this.player.shield=50;this.player.magBySlot=data.loadout.map(g=>g.mag??0);this.player.reserveBySlot=data.loadout.map(g=>g.reserve??0);this.player.fuelBySlot=data.loadout.map(g=>g.fuel??g.maxFuel??0);this.player.fuelReserveBySlot=data.loadout.map(g=>g.reserve??0);this.player.chargesBySlot=data.loadout.map(g=>g.charges??g.maxCharges??0);this.player.grenades=data.grenade.count;this.player.cargo={crystal:0,nitra:0};this.player.selectedSlot=0;
  }

  update(dt){
    if(!this.started||this.stage==='result')return;
    if(!this.hud.el.helpOverlay.hidden)return;
    if(this.stage==='cave'||this.stage==='returning'||this.stage==='boarding')this.elapsed+=dt;
    this.updatePlayer(dt);this.updateCamera(dt);this.updateInteractions(dt);this.updateWeapons(dt);this.updateEnemies(dt);this.updateProjectiles(dt);this.updateTelegraphs(dt);this.updatePatches(dt);this.updateSentries(dt);this.updatePowerups(dt);this.updateDrops(dt);this.updateWaves(dt);this.updateEvac(dt);this.updateBossTrigger();
    this.hud.update(this,dt);
  }

  updatePlayer(dt){
    const p=this.player;
    if(this.stage==='base'||this.stage==='cave'||this.stage==='returning'||this.stage==='boarding'){
      if(this.ziplineRide){this.updateZiplineRide(dt);p.group.position.set(p.position.x,p.position.y,p.position.z);if(this.stage!=='base')this.currentRoom=this.world.updateCurrentRoom(p.position);}
      else{
      let forward=(this.keys.has('KeyW')?1:0)-(this.keys.has('KeyS')?1:0),side=(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0);
      const len=Math.hypot(forward,side);if(len>0){forward/=len;side/=len;}
      const f=new THREE.Vector3(Math.sin(this.cameraYaw),0,-Math.cos(this.cameraYaw));const r=new THREE.Vector3(Math.cos(this.cameraYaw),0,Math.sin(this.cameraYaw));
      const speed=(this.keys.has('ShiftLeft')?9.5:6.6);let dx=(f.x*forward+r.x*side)*speed*dt,dz=(f.z*forward+r.z*side)*speed*dt;
      if(this.grapple){this.grapple.t+=dt;const t=clamp(this.grapple.t/this.grapple.duration,0,1);const ease=1-Math.pow(1-t,3);const pos=this.grapple.from.clone().lerp(this.grapple.to,ease);p.position.x=pos.x;p.position.z=pos.z;if(this.grapple.line){this.grapple.line.geometry.dispose();this.grapple.line.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.position.x,1.25,p.position.z),this.grapple.to.clone().setY(2)]);}if(t>=1){if(this.grapple.line)this.scene.remove(this.grapple.line);this.grapple=null;}}
      else if(len){const candidate=new THREE.Vector3(p.position.x+dx,p.position.y,p.position.z+dz);if(this.world.canMove(candidate,.42,2.1)){p.position.x=candidate.x;p.position.z=candidate.z;}else{const xOnly=new THREE.Vector3(p.position.x+dx,p.position.y,p.position.z);if(this.world.canMove(xOnly,.42,2.1))p.position.x=xOnly.x;const zOnly=new THREE.Vector3(p.position.x,p.position.y,p.position.z+dz);if(this.world.canMove(zOnly,.42,2.1))p.position.z=zOnly.z;}}
      const ground=this.platformGroundAt(p.position.x,p.position.z,p.position.y);
      if(this.jumpVelocity>0||p.position.y>ground){this.jumpVelocity-=20*dt;p.position.y=Math.max(ground,p.position.y+this.jumpVelocity*dt);if(p.position.y<=ground+.001)this.jumpVelocity=0;}else p.position.y=ground;
      p.group.position.set(p.position.x,p.position.y,p.position.z);
      const aim=this.getAimDirection();p.group.rotation.y=Math.atan2(aim.x,aim.z);
      if(this.stage!=='base'){this.currentRoom=this.world.updateCurrentRoom(p.position);}
      }
    }
    if(this.stage==='cave'||this.stage==='returning'||this.stage==='boarding'){
      if(this.elapsed-p.lastDamage>6&&p.shield<50)p.shield=Math.min(50,p.shield+10*dt);
      for(const bubble of this.shieldBubbles){if(bubble.life>0&&Math.hypot(p.position.x-bubble.mesh.position.x,p.position.z-bubble.mesh.position.z)<bubble.radius)p.shield=Math.min(50,p.shield+25*dt);}
    }
  }

  platformGroundAt(x,z,currentY){
    let top=0;for(const p of this.platforms){if(p.life<=0)continue;if(Math.abs(x-p.x)<=p.width/2&&Math.abs(z-p.z)<=p.depth/2&&currentY>=p.top-.38&&currentY<=p.top+1.1)top=Math.max(top,p.top);}return top;
  }

  updateZiplineRide(dt){
    const ride=this.ziplineRide;if(!ride)return;const line=ride.line,a=line.start,b=line.end,len=Math.max(.1,a.distanceTo(b));ride.t=clamp(ride.t+ride.direction*(4*dt/len),0,1);this.player.position.lerpVectors(a,b,ride.t);this.player.position.y=Math.max(.4,this.player.position.y);this.player.group.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);if(ride.t===0||ride.t===1){this.ziplineRide=null;this.hud.toast('已到达滑索终点');}
  }

  updateCamera(dt){
    const p=this.player.position,forward=new THREE.Vector3(Math.sin(this.cameraYaw),0,-Math.cos(this.cameraYaw));const right=new THREE.Vector3(Math.cos(this.cameraYaw),0,Math.sin(this.cameraYaw));
    const target=new THREE.Vector3(p.x+right.x*.56,p.y+1.55,p.z+right.z*.56);
    const dist=this.cameraDistance*Math.cos(this.cameraPitch),up=this.cameraDistance*Math.sin(this.cameraPitch);
    const desired=target.clone().addScaledVector(forward,-dist).addScaledVector(right,.45);desired.y+=up+0.22;
    const ray=new THREE.Vector3().subVectors(desired,target),length=ray.length();ray.normalize();this.camRay.set(target,ray);this.camRay.far=length;
    const occluders=this.world.cameraOccluders.filter(m=>m.visible&&m.parent);
    const hit=occluders.length?this.camRay.intersectObjects(occluders,false)[0]:null;
    const final=hit?target.clone().addScaledVector(ray,Math.max(1.1,hit.distance-.3)):desired;
    this.camera.position.lerp(final,1-Math.exp(-dt*12));this.camera.lookAt(target);
  }

  updateInteractions(dt){
    this.hud.setPrompt('',false);this.hud.setHold('',0,false);
    if(this.stage==='base'){
      const item=this.world.nearestInteractable(this.player.position,this.getAimDirection());
      if(item){const label=item.type==='class'?`选择${item.name}`:item.type==='mission'?(this.accepted?'任务已接取':'接取远征任务'):item.type==='supply'?'免费整备':item.type==='ship'?(this.accepted?'进入飞船出发':'请先接取任务'):'训练靶';this.hud.setPrompt(label,true);if(item.type==='mission'){if(!this.previewPlan)this.previewPlan=pick(this.rng,WAVE_PLANS);const p=new THREE.Vector3(item.position.x,3.4,item.position.z).project(this.camera);this.hud.setMissionPreview(true,{x:(p.x*.5+.5)*innerWidth,y:(-p.y*.5+.5)*innerHeight},this.accepted,this.previewPlan,this.world.resourceTotals);}else this.hud.setMissionPreview(false);}
      else this.hud.setMissionPreview(false);
      return;
    }
    if(this.stage!=='cave'&&this.stage!=='returning'&&this.stage!=='boarding')return;
    const item=this.world.nearestInteractable(this.player.position,this.getAimDirection());
    if(this.activeSupplyPack){
      if(!this.eHeld||!this.activeSupplyPack.mesh.parent){this.activeSupplyPack=null;this.supplyHold=0;}
      else{this.supplyHold+=dt;this.hud.setHold('正在领取补给',this.supplyHold/3,true);if(this.supplyHold>=3){this.takeSupply(this.activeSupplyPack);this.activeSupplyPack=null;this.supplyHold=0;}}
      return;
    }
    if(item?.type==='robot'){
      const canDeposit=this.player.cargo.crystal>0||this.player.cargo.nitra>0;
      this.hud.setPrompt(canDeposit?'长按 E 交存矿物':'运输机器人 · 物资已交存',canDeposit);
      if(this.eHeld&&canDeposit){this.depositAccumulator+=dt*20;let quota=Math.floor(this.depositAccumulator);if(quota>0){this.depositAccumulator-=quota;let left=quota;
          const cr=Math.min(left,this.player.cargo.crystal);if(cr>0){this.player.cargo.crystal-=cr;this.deposited.crystal+=cr;left-=cr;}
          const ni=Math.min(left,this.player.cargo.nitra);if(ni>0){this.player.cargo.nitra-=ni;this.deposited.nitra+=ni;this.teamNitra+=ni;}
          if(cr||ni){this.hud.toast(`交存 ${cr?`${cr} 晶矿`:''}${cr&&ni?' · ':''}${ni?`${ni} 硝石`:''}`);if(this.deposited.crystal>=200&&!this.returnAt)this.beginReturn(true);}
        }
        this.hud.setHold('正在交存',(this.elapsed%0.6)/0.6,true);
      }
    }
    if(item?.type==='zipline')this.hud.setPrompt('乘坐滑索',true,'E');
    if(item?.type==='axe')this.hud.setPrompt('回收冲击斧',true,'E');
    if(this.shipArrived&&this.world.ship){
      const d=Math.hypot(this.player.position.x-this.world.ship.position.x,this.player.position.z-this.world.ship.position.z);
      if(d<7)this.hud.setPrompt('进入舱内 · 自动登舱',true,'自动');
    }
  }

  updateWeapons(dt){
    this.weaponCooldown=Math.max(0,this.weaponCooldown-dt);this.reloadTimer=Math.max(0,this.reloadTimer-dt);this.lightCooldown=Math.max(0,this.lightCooldown-dt);
    const justPressed=this.mouseDown&&!this.previousMouseDown;this.previousMouseDown=this.mouseDown;
    if(!this.mouseDown||!this.started||!this.pointerActive||this.stage==='result'){
      this.weaponHeat=Math.max(0,this.weaponHeat-26*dt);this.flameHeat=Math.max(0,this.flameHeat-20*dt);
      const ret=document.getElementById('reticle');ret.classList.remove('firing');return;
    }
    const gear=CLASS_DATA[this.player.classId].loadout[this.player.selectedSlot];
    if(this.stage==='base'&&(gear.tool||gear.mining))return;
    if(gear.tool==='drill'){
      if(this.weaponCooldown>0)return;
      const tick=.16,fuel=this.player.fuelBySlot[3]??gear.fuel;if(fuel<=0){this.hud.toast('动力钻燃料耗尽');return;}
      this.weaponCooldown=tick;this.player.fuelBySlot[3]=Math.max(0,fuel-(gear.fuelRate||10)*tick);
      this.damageAimedCell((gear.terrain||20)*tick,gear.range);
      return;
    }
    if(gear.mining){if(this.weaponCooldown<=0){this.weaponCooldown=gear.rate;this.damageAimedCell(gear.terrain,gear.range);}return;}
    if(['grapple','zipline','shield','flaregun','platform','sentry','satchel'].includes(gear.tool)){
      if(justPressed&&this.weaponCooldown<=0){this.weaponCooldown=.45;this.useTool(gear);}return;
    }
    if(gear.flame){
      if(this.weaponCooldown>0)return;this.weaponCooldown=.1;
      if(this.elapsed<this.overheatedUntil)return;
      if(this.player.fuelBySlot[0]<=0)return;
      this.player.fuelBySlot[0]=Math.max(0,this.player.fuelBySlot[0]-1);this.flameHeat=Math.min(100,this.flameHeat+1.5);
      if(this.flameHeat>=100){this.overheatedUntil=this.elapsed+2.2;this.hud.toast('喷火器过热');}
      this.fireFlame(gear);return;
    }
    if(this.weaponCooldown>0||this.reloadTimer>0||this.elapsed<this.overheatedUntil)return;
    const slot=this.player.selectedSlot;
    if(gear.mag!==undefined&&this.player.magBySlot[slot]<=0){this.reload();return;}
    if(gear.heat&&this.weaponHeat>=100){this.overheatedUntil=this.elapsed+2.4;this.hud.toast('机枪过热');return;}
    this.weaponCooldown=gear.rate;
    if(gear.mag!==undefined&&this.stage!=='base')this.player.magBySlot[slot]--;
    if(gear.heat&&this.stage!=='base')this.weaponHeat=Math.min(100,this.weaponHeat+3.6);
    this.fireGun(gear);
    document.getElementById('reticle').classList.add('firing');setTimeout(()=>document.getElementById('reticle').classList.remove('firing'),100);
  }

  reload(){const slot=this.player.selectedSlot,gear=CLASS_DATA[this.player.classId].loadout[slot];if(gear.mag===undefined||this.reloadTimer>0||this.player.magBySlot[slot]>=gear.mag)return;if(this.stage==='base'){this.player.magBySlot[slot]=gear.mag;this.hud.toast('训练装填 · 不消耗弹药');return;}if(this.player.reserveBySlot[slot]<=0)return;this.reloadTimer=gear.reload||1.4;setTimeout(()=>{if(this.stage==='result')return;const missing=gear.mag-this.player.magBySlot[slot],load=Math.min(missing,this.player.reserveBySlot[slot]);this.player.magBySlot[slot]+=load;this.player.reserveBySlot[slot]-=load;this.hud.toast(`${gear.name} 已装填`);},this.reloadTimer*1000);}

  fireGun(gear){
    const dirs=[];const pellets=gear.pellets||1;
    for(let i=0;i<pellets;i++){
      const dir=this.getAimDirection();if(gear.spread){dir.x+=(Math.random()-.5)*gear.spread;dir.y+=(Math.random()-.5)*gear.spread;dir.z+=(Math.random()-.5)*gear.spread;dir.normalize();}dirs.push(dir);
    }
    for(const dir of dirs){this.raycaster.set(this.camera.position,dir);this.raycaster.far=gear.range||55;
      const targets=[...this.world.rayTargets,...this.enemies.filter(e=>e.alive&&e.active!==false&&e.group.visible).flatMap(e=>e.parts.filter(p=>p.visible))];
      const hit=this.raycaster.intersectObjects(targets,false)[0];this.player.stats.shots++;
      if(!hit)continue;const entity=hit.object.userData.entity,hitData=hit.object.userData.hit;
      if(entity?.kind==='ore'){entity.hp-=gear.terrain||gear.damage;this.player.stats.hits++;this.hud.hit(false);if(entity.hp<=0){this.world.cellDestroyed(entity);this.player.stats.terrainBroken++;this.damageText(hit.point,`+${entity.value} 矿物`,'ore');}}
      else if(entity?.kind==='rock'){entity.hp-=gear.terrain||gear.damage;this.player.stats.hits++;this.hud.hit(false);if(entity.hp<=0){this.world.cellDestroyed(entity);this.player.stats.terrainBroken++;this.damageText(hit.point,'碎块脱落','ore');}}
      else if(hitData?.target==='enemy')this.hitEnemy(hitData.enemy,gear.damage,hitData.part,hit.point);
      else if(entity?.kind==='target')this.hud.toast('命中训练靶 · 无限生命');
    }
  }

  fireFlame(gear){
    const dir=this.getAimDirection(),origin=this.camera.position.clone();
    for(const enemy of this.enemies){if(!enemy.alive)continue;const to=enemy.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(origin);const distance=to.length();if(distance>gear.range)continue;to.normalize();if(to.dot(dir)<.92)continue;if(!this.hasLineOfSight(origin,enemy.group.position))continue;this.hitEnemy(enemy,gear.damage,'body',enemy.group.position.clone().add(new THREE.Vector3(0,1,0)));}
    this.damageAimedCell(gear.terrain,gear.range);
  }

  damageAimedCell(damage,range=3){
    const dir=this.getAimDirection(),origin=this.player.position.clone().add(new THREE.Vector3(0,1.35,0));this.raycaster.set(origin,dir);this.raycaster.far=range;
    const hit=this.raycaster.intersectObjects(this.world.rayTargets.filter(m=>m.visible&&m.parent),false)[0];if(!hit)return;
    const cell=hit.object.userData.entity;if(cell?.kind==='ore'||cell?.kind==='rock'){
      cell.hp-=damage;if(cell.hp<=0){this.world.cellDestroyed(cell);this.player.stats.terrainBroken++;this.hud.hit(false);this.damageText(hit.point,cell.kind==='ore'?`+${cell.value} 矿物`:'碎块脱落','ore');}
    }
  }

  hitEnemy(enemy,baseDamage,part,point){
    if(!enemy?.alive)return;
    const result=enemy.damage(baseDamage*this.enemyDamageMultiplier(enemy.group.position),part);if(result.actual<=0)return;
    this.player.stats.hits++;if(result.crit)this.player.stats.weakHits++;
    this.hud.hit(result.crit);this.damageText(point||enemy.group.position.clone().add(new THREE.Vector3(0,1.2,0)),String(Math.round(result.display)),result.crit?'crit':'normal');
    if(result.killed){this.totalKills+=enemy.data.score;this.hud.toast(`${enemy.data.name} 已击杀`,'kill');if(enemy.isBoss){this.bossDefeated=true;this.hud.toast('渊脊母虫已击败','boss');}}
  }

  damageText(position,text,kind){const p=position.clone().project(this.camera);if(p.z<0)return;const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight;this.hud.float(text,x,y,kind);}

  aimHit(maxDistance=40){
    const direction=this.getAimDirection();this.raycaster.set(this.camera.position,direction);this.raycaster.far=maxDistance;
    const targets=[...this.world.rayTargets.filter(m=>m.visible&&m.parent),...this.enemies.filter(e=>e.alive&&e.active!==false&&e.group.visible).flatMap(e=>e.parts.filter(p=>p.visible))];
    const hit=this.raycaster.intersectObjects(targets,false)[0];
    return hit?{point:hit.point.clone(),object:hit.object,distance:hit.distance,entity:hit.object.userData.entity,hitData:hit.object.userData.hit}:{point:this.camera.position.clone().addScaledVector(direction,maxDistance),object:null,distance:maxDistance,entity:null,hitData:null};
  }

  useTool(gear){
    const slot=this.player.selectedSlot,available=this.player.chargesBySlot[slot]??0,aim=this.aimHit(gear.tool==='zipline'?30:20);
    if(gear.tool==='grapple'){
      if(this.actionCooldown.grapple>this.elapsed)return;
      if(aim.entity?.kind==='ore'||aim.entity?.kind==='rock'){this.hud.toast('抓钩不能锚定可破坏岩矿');return;}
      const distance=Math.hypot(aim.point.x-this.player.position.x,aim.point.z-this.player.position.z);
      if(distance>gear.range||distance<2){this.hud.toast('抓钩目标距离不合适');return;}
      const to=aim.point.clone();to.y=0;const dir=to.clone().sub(this.player.position).normalize();to.addScaledVector(dir,-1.2);
      if(!this.world.canMove(to,.45,2.1)){this.hud.toast('落点空间不足');return;}
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(this.player.position.x,1.25,this.player.position.z),aim.point.clone().setY(2)]),new THREE.LineBasicMaterial({color:0x81c9e4}));this.scene.add(line);
      this.grapple={from:this.player.position.clone(),to,t:0,duration:clamp(distance/22,.38,.9),line};this.actionCooldown.grapple=this.elapsed+gear.cooldown;this.player.chargesBySlot[slot]=Math.max(0,available-1);this.hud.toast('抓钩发射');return;
    }
    if(gear.tool==='zipline'){
      if(available<=0){this.hud.toast('滑索弹已耗尽');return;}const distance=Math.hypot(aim.point.x-this.player.position.x,aim.point.z-this.player.position.z);
      if(distance<4||distance>30||aim.entity?.kind==='ore'||aim.entity?.kind==='rock'){this.hud.toast('无法在该位置架设滑索');return;}
      const start=new THREE.Vector3(this.player.position.x,.7,this.player.position.z),end=aim.point.clone().setY(Math.max(1.2,aim.point.y));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineBasicMaterial({color:0xe8b34f}));this.scene.add(line);const zip={line,start,end,life:Infinity};this.ziplines.push(zip);
      this.world.interactables.push({type:'zipline',name:'乘坐滑索',position:new THREE.Vector3(start.x,0,start.z),line:zip,endpoint:0,range:2.4},{type:'zipline',name:'乘坐滑索',position:new THREE.Vector3(end.x,0,end.z),line:zip,endpoint:1,range:2.4});
      this.player.chargesBySlot[slot]--;this.hud.toast('滑索已架设 · 靠近端点按 E 乘坐');return;
    }
    if(gear.tool==='shield'){
      if(available<=0){this.hud.toast('护盾充能已耗尽');return;}const mesh=new THREE.Mesh(new THREE.SphereGeometry(3,20,14),new THREE.MeshStandardMaterial({color:0x53c8d0,transparent:true,opacity:.12,emissive:0x14585c,emissiveIntensity:.4,side:THREE.DoubleSide,depthWrite:false}));mesh.position.copy(this.player.position);mesh.position.y=1.5;this.scene.add(mesh);const light=new THREE.PointLight(0x4cbfcb,12,8,2);light.position.copy(mesh.position);this.scene.add(light);this.shieldBubbles.push({mesh,light,position:mesh.position,radius:3,life:6});this.player.chargesBySlot[slot]--;this.hud.toast('护盾发生器已启动');return;
    }
    if(gear.tool==='flaregun'){
      if(available<=0){this.hud.toast('照明弹已耗尽');return;}this.createFlare(aim.point,20,12);this.player.chargesBySlot[slot]--;this.hud.toast('照明弹已固定');return;
    }
    if(gear.tool==='platform'){
      if(available<=0){this.hud.toast('平台弹药已耗尽');return;}const point=aim.point.clone();if(!aim.object){const dir=this.getAimDirection();point.copy(this.player.position).addScaledVector(dir,5);point.y=2.2;}
      const pos={x:point.x,y:Math.min(1.0,Math.max(.8,point.y)),z:point.z},width=3,depth=3,thickness=.48;this.world.addBox(this.world.group,pos,{x:width,y:thickness,z:depth},new THREE.MeshStandardMaterial({color:0x806f5e,roughness:.95}),{solid:true,camera:true});this.platforms.push({x:pos.x,y:pos.y,z:pos.z,width,depth,top:pos.y+thickness/2,life:Infinity});this.player.chargesBySlot[slot]--;this.hud.toast('平台已部署 · Space 可跳上平台');return;
    }
    if(gear.tool==='sentry'){
      if(this.sentries.some(t=>t.life>0)){this.hud.toast('自动哨戒机枪已部署');return;}if(available<=0){this.hud.toast('哨戒机枪部署次数已用尽');return;}
      const dir=this.getAimDirection(),pos=new THREE.Vector3(this.player.position.x+dir.x*2,0,this.player.position.z+dir.z*2);const group=new THREE.Group();group.position.copy(pos);this.scene.add(group);const mat=new THREE.MeshStandardMaterial({color:0x777c6f,metalness:.42,roughness:.55});const base=new THREE.Mesh(new THREE.CylinderGeometry(.5,.62,.45,8),mat);base.position.y=.25;group.add(base);const stem=new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,.75,7),mat);stem.position.y=.82;group.add(stem);const head=new THREE.Mesh(new THREE.BoxGeometry(.8,.44,1.1),mat);head.position.y=1.34;group.add(head);this.sentries.push({group,life:120,cooldown:.2,range:14});this.player.chargesBySlot[slot]--;this.hud.toast('自动哨戒机枪已部署');return;
    }
    if(gear.tool==='satchel'){
      const active=this.satchels.find(s=>s.alive);if(active){this.detonateSatchel(active);active.alive=false;this.satchels=this.satchels.filter(s=>s.alive);this.hud.toast('遥控炸药已引爆');return;}
      if(available<=0){this.hud.toast('遥控炸药已耗尽');return;}const p=aim.point.clone();if(!aim.object){p.copy(this.player.position).addScaledVector(this.getAimDirection(),4);p.y=.45;}
      const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(.36,0),new THREE.MeshStandardMaterial({color:0xd87742,emissive:0x401309,emissiveIntensity:.25}));mesh.position.copy(p);this.scene.add(mesh);this.satchels.push({mesh,position:p,life:Infinity,alive:true,radius:5,damage:200});this.player.chargesBySlot[slot]--;this.hud.toast('遥控炸药已放置 · 再次使用引爆');
    }
  }

  detonateSatchel(satchel){if(!satchel?.alive)return;this.radialDamage(satchel.position,satchel.radius,satchel.damage);this.scene.remove(satchel.mesh);satchel.alive=false;}

  throwGrenade(){
    if(this.stage==='base'||this.stage==='result'||!this.pointerActive)return;const p=this.player;if(p.grenades<=0){this.hud.toast(`${CLASS_DATA[p.classId].grenade.name} 已耗尽`);return;}
    p.grenades--;const data=CLASS_DATA[p.classId].grenade,mesh=new THREE.Mesh(new THREE.SphereGeometry(.22,8,7),new THREE.MeshStandardMaterial({color:data.color,emissive:data.color,emissiveIntensity:.25}));mesh.position.copy(p.position).add(new THREE.Vector3(0,1.25,0));this.scene.add(mesh);
    const dir=this.getAimDirection();this.throwables.push({mesh,position:mesh.position,velocity:dir.multiplyScalar(11).add(new THREE.Vector3(0,4,0)),type:p.classId==='scout'?'ifg':p.classId==='engineer'?'lure':p.classId==='driller'?'axe':'sticky',damage:data.damage,radius:data.radius,life:1.15,color:data.color});this.hud.toast(`${data.name} 已投出`);
  }

  throwFlare(){
    if(this.stage==='base'||this.stage==='result'||this.lightCooldown>0)return;if(this.player.flareCharges<=0){this.hud.toast('照明棒正在恢复');return;}
    const aim=this.aimHit(18),point=aim.point.clone();if(!aim.object){const dir=this.getAimDirection();point.copy(this.player.position).addScaledVector(dir,8);point.y=2.5;}
    this.createFlare(point,30,8);this.player.flareCharges--;this.player.flareRestore=0;this.lightCooldown=.3;this.hud.toast('照明棒已投出');
  }

  createFlare(point,duration=30,radius=8){
    const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(.12,0),new THREE.MeshStandardMaterial({color:0xffc06a,emissive:0xff9634,emissiveIntensity:1}));mesh.position.copy(point);this.scene.add(mesh);const light=new THREE.PointLight(0xffad50,18,radius,1.7);light.position.copy(point);this.scene.add(light);this.flareLights.push({mesh,light,life:duration});
  }

  callSupply(){
    if(this.stage==='base'||this.stage==='result')return;if(this.teamNitra<80){this.hud.toast(`硝石不足 · 需要 80（现有 ${this.teamNitra}）`);return;}
    this.teamNitra-=80;this.hud.toast('补给舱已呼叫 · 4 份补给即将送达','warning');const center=this.player.position.clone();
    for(let i=0;i<4;i++){
      const angle=i*Math.PI/2+.6,pos=new THREE.Vector3(center.x+Math.cos(angle)*3.3,0,center.z+Math.sin(angle)*3.3),group=new THREE.Group();group.position.copy(pos);this.world.group.add(group);
      const mat=new THREE.MeshStandardMaterial({color:0x829087,roughness:.76,metalness:.12});const crate=new THREE.Mesh(new THREE.BoxGeometry(1.05,.9,.82),mat);crate.position.y=.46;group.add(crate);const stripe=new THREE.Mesh(new THREE.BoxGeometry(1.08,.12,.85),new THREE.MeshStandardMaterial({color:0xf0ad48,emissive:0x3b1d05}));stripe.position.y=.67;group.add(stripe);
      const item={type:'supplyPack',name:'补给份额',position:pos.clone(),mesh:group,range:2.4,used:false};this.world.interactables.push(item);this.world.supplyPacks??=[];this.world.supplyPacks.push(item);
    }
  }

  takeSupply(item){
    if(!item||item.used)return;const p=this.player,data=CLASS_DATA[p.classId];let restored=false;
    if(p.health<100){p.health=Math.min(100,p.health+50);restored=true;}
    for(let i=0;i<data.loadout.length;i++){
      const g=data.loadout[i];
      if(g.mag!==undefined&&p.reserveBySlot[i]<g.reserve){p.reserveBySlot[i]=Math.min(g.reserve,p.reserveBySlot[i]+Math.ceil(g.reserve*.5));restored=true;}
      if(g.fuel!==undefined&&p.fuelBySlot[i]<g.fuel){p.fuelBySlot[i]=Math.min(g.fuel,p.fuelBySlot[i]+g.fuel*.5);restored=true;}
      if(g.maxFuel!==undefined&&p.fuelBySlot[i]<g.maxFuel){p.fuelBySlot[i]=Math.min(g.maxFuel,p.fuelBySlot[i]+g.maxFuel*.5);restored=true;}
      if(g.maxCharges!==undefined&&p.chargesBySlot[i]<g.maxCharges){p.chargesBySlot[i]=Math.min(g.maxCharges,p.chargesBySlot[i]+Math.ceil(g.maxCharges*.5));restored=true;}
      if(g.mag!==undefined&&p.magBySlot[i]<g.mag&&p.reserveBySlot[i]===0){const load=Math.min(g.mag-p.magBySlot[i],Math.ceil(g.mag*.5));p.magBySlot[i]+=load;restored=true;}
    }
    if(p.grenades<data.grenade.max){p.grenades=Math.min(data.grenade.max,p.grenades+Math.ceil(data.grenade.max*.5));restored=true;}
    if(p.flareCharges<4){p.flareCharges=Math.min(4,p.flareCharges+2);restored=true;}
    if(!restored){this.hud.toast('装备状态已满 · 补给份额保留');return;}
    item.used=true;this.world.group.remove(item.mesh);this.world.interactables=this.world.interactables.filter(x=>x!==item);this.hud.toast('补给领取完成');
  }

  jump(){if(this.ziplineRide){this.ziplineRide=null;this.jumpVelocity=3;return;}if(this.stage==='base'||this.stage==='cave'||this.stage==='returning'||this.stage==='boarding'){if(this.player.position.y<=this.platformGroundAt(this.player.position.x,this.player.position.z,this.player.position.y)+.01)this.jumpVelocity=7.2;}}

  radialDamage(position,radius,peak){
    for(const enemy of this.enemies){if(!enemy.alive||enemy.active===false||!enemy.group.visible)continue;const d=Math.hypot(enemy.group.position.x-position.x,enemy.group.position.z-position.z);if(d>=radius)continue;if(!this.hasLineOfSight(position,enemy.group.position))continue;const damage=Math.floor(peak*Math.max(0,1-d/radius));if(damage>0)this.hitEnemy(enemy,damage,'body',enemy.group.position.clone().add(new THREE.Vector3(0,1,0)));}
    for(const cell of [...this.world.cells,...this.world.oreCells]){if(cell.removed)continue;const d=Math.hypot(cell.worldPosition.x-position.x,cell.worldPosition.z-position.z);if(d<radius){cell.hp-=peak*Math.max(0,1-d/radius);if(cell.hp<=0)this.world.cellDestroyed(cell);}}
  }

  detonateThrowable(t){
    if(t.type==='ifg'){const mesh=new THREE.Mesh(new THREE.CircleGeometry(t.radius||4,24),new THREE.MeshBasicMaterial({color:0x65d9d0,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(t.position.x,.04,t.position.z);this.scene.add(mesh);this.ifgFields.push({mesh,position:t.position.clone(),radius:4,life:5});}
    else if(t.type==='lure'){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.45,8,7),new THREE.MeshStandardMaterial({color:0xb798eb,emissive:0x513187,emissiveIntensity:.5,transparent:true,opacity:.65}));mesh.position.copy(t.position);mesh.position.y=.5;this.scene.add(mesh);this.lures.push({mesh,position:t.position.clone(),life:6});}
    else if(t.type==='axe'){let target=null,best=2.6;for(const e of this.enemies){const d=Math.hypot(e.group.position.x-t.position.x,e.group.position.z-t.position.z);if(e.alive&&d<best){best=d;target=e;}}if(target){this.hitEnemy(target,t.damage,'body',target.group.position.clone().add(new THREE.Vector3(0,1,0)));this.scene.remove(t.mesh);}else{t.mesh.position.y=.22;this.world.group.add(t.mesh);const item={type:'axe',name:'可回收冲击斧',position:t.mesh.position,mesh:t.mesh,range:2.2,used:false};this.world.interactables.push(item);}}
    else this.radialDamage(t.position,t.radius||5,t.damage||100);
    if(t.type!=='axe'||!t.alive)this.scene.remove(t.mesh);
  }

  detonateSatchel(s){if(!s?.alive)return;this.radialDamage(s.position,s.radius,s.damage);this.scene.remove(s.mesh);s.alive=false;}
  getActiveCap(){
    if(this.elapsed<45)return 12;let cap=12;
    for(let i=0;i<WAVE_TIMES.length;i++)if(this.elapsed>=WAVE_TIMES[i])cap=ACTIVE_CAPS[i];
    if(this.elapsed>=480)cap=Math.min(72,36+6*Math.floor((this.elapsed-480)/30));
    return cap;
  }
  enemySlowFactor(position){for(const f of this.ifgFields)if(f.life>0&&Math.hypot(position.x-f.position.x,position.z-f.position.z)<f.radius)return .65;return 1;}
  enemyDamageMultiplier(position){for(const f of this.ifgFields)if(f.life>0&&Math.hypot(position.x-f.position.x,position.z-f.position.z)<f.radius)return 1.2;return 1;}
  findLure(position){let target=null,dist=8;for(const l of this.lures)if(l.life>0){const d=Math.hypot(position.x-l.position.x,position.z-l.position.z);if(d<dist){dist=d;target=l;}}return target;}
  getEnemyTarget(enemy){return this.findLure(enemy.group.position)?.position||this.player.position;}
  spawnBossAdds(boss){const room=boss.room;for(const type of ['rusher','acid']){if(this.enemies.filter(e=>e.alive&&e.active!==false).length>=this.activeCap)break;const p=new THREE.Vector3(room.x+randomBetween(this.rng,-5,5),0,room.z+randomBetween(this.rng,-5,5));if(this.world.canMove(p,.5,1.8))this.enemies.push(new Enemy(type,room,p,this.scene,this.rng));}}
  clearTransient(){
    if(this.grapple?.line)this.scene.remove(this.grapple.line);this.grapple=null;
    for(const e of this.enemies??[])this.scene.remove(e.group);
    for(const list of [this.projectiles,this.throwables])for(const v of list??[])this.scene.remove(v.mesh);
    for(const t of this.telegraphs??[])this.scene.remove(t.mesh);
    for(const a of this.acidPatches??[]){this.scene.remove(a.mesh);this.scene.remove(a.ring);}
    for(const t of this.sentries??[])this.scene.remove(t.group);
    for(const t of this.ziplines??[])this.scene.remove(t.line);
    for(const f of this.flareLights??[]){this.scene.remove(f.mesh);this.scene.remove(f.light);}
    for(const b of this.shieldBubbles??[]){this.scene.remove(b.mesh);this.scene.remove(b.light);}
    for(const f of this.ifgFields??[])this.scene.remove(f.mesh);
    for(const l of this.lures??[])this.scene.remove(l.mesh);
    this.enemies=[];this.projectiles=[];this.throwables=[];this.telegraphs=[];this.acidPatches=[];this.sentries=[];this.ziplines=[];this.flareLights=[];this.shieldBubbles=[];this.satchels=[];this.ifgFields=[];this.lures=[];this.spawnQueue=[];
  }
  audioCue(type){if(type==='boss'&&navigator.vibrate)navigator.vibrate([100,50,120]);}

  animate(){
    requestAnimationFrame(()=>this.animate());
    const dt=Math.min(this.clock.getDelta(),.05);
    if(this.cinematic){this.updateCinematic(dt);this.renderer.render(this.scene,this.camera);return;}
    this.update(dt);this.renderer.render(this.scene,this.camera);
  }

  updateEnemies(dt){
    this.enemies=this.enemies.filter(e=>e.alive||e.isBoss);
    for(const enemy of this.enemies)if(enemy.alive)enemy.update(dt,this);
  }

  updateWaves(dt){
    if(this.stage==='base'||this.stage==='result')return;
    const alive=this.enemies.filter(e=>e.alive&&e.active!==false).length;
    this.activeCap=this.getActiveCap();
    while(this.waveIndex<WAVE_TIMES.length&&this.elapsed>=WAVE_TIMES[this.waveIndex]){
      const index=this.waveIndex++;this.queueWave(index);
    }
    if(this.elapsed>=480){
      const wanted=Math.floor((this.elapsed-480)/30)+1;
      while(this.overtimeIndex<wanted){this.queueOvertime(++this.overtimeIndex);}
    }
    if(this.spawnQueue.length&&alive<this.activeCap){
      this.pendingSpawnTimer-=dt;
      if(this.pendingSpawnTimer<=0){const item=this.spawnQueue.shift();this.spawnPack(item);this.pendingSpawnTimer=3.5;}
    }
    this.nextWaveAt=this.waveIndex<WAVE_TIMES.length?WAVE_TIMES[this.waveIndex]:null;
  }

  queueWave(index){
    const total=WAVE_TOTALS[index],eliteCount=ELITE_COUNTS[index],plan=this.wavePlan;
    const eliteTypes=this.eliteSequence(plan,eliteCount,index);
    const normalCounts=allocateWeighted(total-eliteCount,plan.weights);
    const normal=[];for(const [kind,count] of Object.entries(normalCounts))for(let i=0;i<count;i++)normal.push(kind);
    const rng=seeded((this.missionSeed+index*0x45d9f3b)>>>0);this.shuffleInPlace(normal,rng);
    const all=[...normal,...eliteTypes];this.shuffleInPlace(all,rng);
    const pack=6;for(let i=0;i<all.length;i+=pack)this.spawnQueue.push({types:all.slice(i,i+pack),wave:index+1,createdAt:this.elapsed});
    this.hud.toast(`虫潮第 ${index+1} 波 · ${total} 只增援`,'warning');
  }

  queueOvertime(k){
    const total=6+6*k,eliteCount=Math.min(1+Math.floor((k-1)/2),Math.floor(total/2));
    const normalCounts=allocateWeighted(total-eliteCount,this.wavePlan.weights);const all=[];
    for(const [kind,count]of Object.entries(normalCounts))for(let i=0;i<count;i++)all.push(kind);
    const elites=this.eliteSequence(this.wavePlan,eliteCount,7+k);all.push(...elites);
    this.shuffleInPlace(all,seeded((this.missionSeed+k*0x9e3779b9)>>>0));
    for(let i=0;i<all.length;i+=6)this.spawnQueue.push({types:all.slice(i,i+6),wave:`加时 ${k}`,createdAt:this.elapsed});
    this.hud.toast(`增援加压 · +${total} 只 · 精英 ${eliteCount}`,'warning');
  }

  eliteSequence(plan,count,index){
    const kinds=[];for(let i=0;i<count;i++){
      if(plan.eliteBias==='rupture')kinds.push(i%4===3?'siege':'rupture');
      else if(plan.eliteBias==='siege')kinds.push(i%4===3?'rupture':'siege');
      else if(plan.eliteBias==='alternate')kinds.push((i+index)%2?'siege':'rupture');
      else kinds.push(i%2?'siege':'rupture');
    }return kinds;
  }

  shuffleInPlace(array,rng){for(let i=array.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[array[i],array[j]]=[array[j],array[i]];}}

  spawnPack(pack){
    const playerRoom=this.world.roomAt(this.player.position),reachable=this.world.reachableRooms(playerRoom).filter(r=>r.visited);
    const rooms=reachable.length?reachable:[playerRoom||this.world.startRoom];
    const room=pick(this.rng,rooms);
    for(const type of pack.types){
      let pos=this.findSpawnPoint(room,10);
      if(!pos)pos=new THREE.Vector3(room.x+randomBetween(this.rng,-6,6),0,room.z+randomBetween(this.rng,-6,6));
      const enemy=new Enemy(type,room,pos,this.scene,this.rng);
      if(type==='boss')continue;
      this.enemies.push(enemy);
    }
  }

  findSpawnPoint(room,minDistance=10){
    for(let i=0;i<20;i++){
      const side=Math.floor(this.rng()*4),t=randomBetween(this.rng,-6,6);let x=room.x,z=room.z;
      if(side===0){x+=t;z-=7;}else if(side===1){x+=t;z+=7;}else if(side===2){x-=7;z+=t;}else{x+=7;z+=t;}
      const pos=new THREE.Vector3(x,0,z);if(Math.hypot(x-this.player.position.x,z-this.player.position.z)>=minDistance&&this.world.canMove(pos,.5,1.8))return pos;
    }return null;
  }

  updateBossTrigger(){
    if(this.stage==='base'||this.stage==='result'||this.stage==='cinematic'||this.bossSpawned||!this.boss)return;
    const inBossRoom=this.currentRoom===this.world.bossRoom;
    if(inBossRoom||this.elapsed>=390){this.bossSpawned=true;this.boss.active=true;this.boss.group.visible=true;this.hud.toast('固定 Boss 事件 · 渊脊母虫苏醒','boss');if(inBossRoom)this.world.markVisited(this.world.bossRoom);}
  }

  updateEvac(dt){
    if(this.stage==='base'||this.stage==='result')return;
    if(!this.returnAt&&this.deposited.crystal>=200){this.beginReturn(true);}
    if(!this.returnAt&&this.elapsed>=RETURN_AT)this.beginReturn(false);
    if(this.returnAt!==null&&this.elapsed>=this.returnAt&&!this.shipArrived){this.shipArrived=true;this.shipArrivedAt=this.elapsed;this.stage='boarding';this.world.spawnShip();this.hud.setStage('boarding');this.hud.toast('撤离船已抵达 · 返回船边进入登舱等待','warning');}
    if(this.shipArrived&&this.world.ship){
      const distance=Math.hypot(this.player.position.x-this.world.ship.position.x,this.player.position.z-this.world.ship.position.z);
      if(distance<7&&!this.shipDoorOpen){this.shipDoorOpen=true;this.hud.toast('登舱区已开放 · 等待全体玩家登舱');}
      if(distance<3.25&&this.shipDoorOpen){
        this.playerBoarded=true;
        if(this.deposited.crystal>=200){this.finishMission(true,'全体玩家已登舱 · 飞船自动返航');}
        else this.finishMission(false,'撤离时未完成 200 晶矿主目标');
      }
    }
  }

  beginReturn(early){
    if(this.returnAt!==null)return;
    this.returnEarly=early;this.returnAt=Math.min(RETURN_AT,this.elapsed+EARLY_RETURN_TRAVEL);this.stage='returning';
    this.hud.toast(early?'主目标完成 · 撤离船自动返航':'撤离船计划返场中','warning');
  }

  finishMission(success,reason){
    if(this.stage==='result')return;
    if(success){this.startReturnCinematic(reason);this.spawnQueue=[];return;}
    this.stage='result';this.mouseDown=false;this.eHeld=false;if(document.pointerLockElement)document.exitPointerLock();
    this.hud.el.resultOverlay.hidden=false;this.hud.showResult({success,reason,deposited:this.deposited.crystal,kills:this.totalKills,plan:this.wavePlan?`${this.wavePlan.id} · ${this.wavePlan.name}`:'--',time:this.elapsed});
    this.spawnQueue=[];this.projectiles=[];this.telegraphs.forEach(t=>this.removeTelegraph(t));this.telegraphs=[];this.hud.setStage('result');
  }

  updateProjectiles(dt){
    for(const p of this.projectiles){if(!p.alive)continue;if(p.delay>0){p.delay-=dt;continue;}p.life-=dt;const previous=p.mesh.position.clone();p.mesh.position.addScaledVector(p.velocity,dt);
      const sweep=new THREE.Vector3().subVectors(p.mesh.position,previous),travel=sweep.length();if(travel>0){this.raycaster.set(previous,sweep.normalize());this.raycaster.far=travel;const wall=this.raycaster.intersectObjects(this.world.cameraOccluders.filter(m=>m.visible&&m.parent),false)[0];if(wall){if(p.type==='acid')this.spawnAcidPatch(wall.point.clone(),1.4,2.5);p.alive=false;this.scene.remove(p.mesh);continue;}}
      if(p.life<=0){if(p.type==='acid')this.spawnAcidPatch(p.mesh.position.clone(),1.4,2.5);p.alive=false;this.scene.remove(p.mesh);continue;}
      const d=Math.hypot(p.mesh.position.x-this.player.position.x,p.mesh.position.z-this.player.position.z);
      if(d<.85){this.damagePlayer(p.damage,p.mesh.position,p.type==='acid'?'酸液吐弹':'晶棘');p.alive=false;this.scene.remove(p.mesh);if(p.type==='acid')this.spawnAcidPatch(p.mesh.position.clone(),1.4,2.5);}
    }this.projectiles=this.projectiles.filter(p=>p.alive);
    for(const t of this.throwables??[]){if(!t.alive)continue;t.life-=dt;t.velocity.y-=9.5*dt;t.position.addScaledVector(t.velocity,dt);t.mesh.position.copy(t.position);if(t.position.y<.2){t.position.y=.2;t.velocity.set(0,0,0);}if(t.life<=0){this.detonateThrowable(t);t.alive=false;}}
    this.throwables=(this.throwables??[]).filter(t=>t.alive);
  }

  spawnProjectile(enemy,type,damage,speed,bursts=1){
    const origin=enemy.group.position.clone().add(new THREE.Vector3(0,type==='acid'?1.15:1.4,0));
    for(let i=0;i<bursts;i++){
      const target=this.player.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.4,1,(Math.random()-.5)*1.4));const dir=target.sub(origin).normalize();
      const color=type==='acid'?0x93d679:0xd4e2d0;const mesh=new THREE.Mesh(new THREE.SphereGeometry(type==='acid'?.24:.14,8,7),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.45,roughness:.3}));mesh.position.copy(origin);this.scene.add(mesh);
      this.projectiles.push({mesh,velocity:dir.multiplyScalar(speed),damage,type,life:type==='acid'?2.4:1.7,delay:type==='shard'?i*.28:0,alive:true});
    }
  }

  spawnMortarPattern(enemy){
    for(let i=0;i<3;i++){const angle=Math.random()*Math.PI*2,r=randomBetween(this.rng,2.5,7);const p=new THREE.Vector3(this.player.position.x+Math.cos(angle)*r,0,this.player.position.z+Math.sin(angle)*r);this.addTimedArea('mortar',p,1.5,1.1,18,.18);}
  }

  spawnAcidPatch(position,radius=1.4,duration=2.5){this.addTimedArea('acid',position,radius,0,4,duration);}

  addTimedArea(type,position,radius,delay,damage,duration=2.5){
    const color=type==='acid'?0x9ed56f:type==='mortar'?0xffb54e:0xf15343;
    const mesh=new THREE.Mesh(new THREE.CircleGeometry(radius,20),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(position.x,.035,position.z);this.scene.add(mesh);
    const ring=new THREE.Mesh(new THREE.RingGeometry(radius*.82,radius,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(position.x,.045,position.z);this.scene.add(ring);
    this.acidPatches.push({type,mesh,ring,position:position.clone(),radius,delay,life:duration+(type==='mortar'?delay:0),damage,nextTick:0,applied:false});
  }

  addTelegraph(type,position,radius,duration,owner){
    const color=type==='acid'||type==='mortar'?0xf5b34a:0xf35c4c;
    const mesh=new THREE.Mesh(new THREE.RingGeometry(Math.max(.4,radius-.12),radius,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(position.x,.08,position.z);this.scene.add(mesh);
    const t={mesh,type,position:position.clone(),radius,duration,remaining:duration,owner,alive:true};this.telegraphs.push(t);return t;
  }

  removeTelegraph(t){if(!t||!t.alive)return;t.alive=false;this.scene.remove(t.mesh);}
  updateTelegraphs(dt){for(const t of this.telegraphs){if(!t.alive)continue;t.remaining-=dt;const k=1-clamp(t.remaining/t.duration,0,1);t.mesh.scale.setScalar(.55+k*.45);t.mesh.material.opacity=.4+.4*(1-k);if(t.remaining<=0){this.removeTelegraph(t);}}this.telegraphs=this.telegraphs.filter(t=>t.alive);}
  updatePatches(dt){for(const a of this.acidPatches){if(!a.alive)continue;if(a.delay>0){a.delay-=dt;a.mesh.material.opacity=.08+Math.sin(performance.now()*.02)*.05;continue;}if(a.type==='mortar'&&!a.applied){a.applied=true;if(Math.hypot(this.player.position.x-a.position.x,this.player.position.z-a.position.z)<a.radius)this.damagePlayer(a.damage,a.position,'震荡落晶');}a.life-=dt;a.nextTick-=dt;if(a.type==='acid'&&a.nextTick<=0&&Math.hypot(this.player.position.x-a.position.x,this.player.position.z-a.position.z)<a.radius){this.damagePlayer(a.damage,a.position,'酸液灼伤');a.nextTick=1;}a.mesh.material.opacity=Math.max(.04,.22*a.life/2.5);a.ring.material.opacity=Math.max(0,.5*a.life/2.5);if(a.life<=0){a.alive=false;this.scene.remove(a.mesh);this.scene.remove(a.ring);}}this.acidPatches=this.acidPatches.filter(a=>a.alive);}

  updateSentries(dt){for(const t of this.sentries){if(t.life<=0){this.scene.remove(t.group);continue;}t.life-=dt;t.cooldown-=dt;let target=null,best=t.range;for(const e of this.enemies){if(!e.alive||e.active===false||!e.group.visible)continue;const d=Math.hypot(e.group.position.x-t.group.position.x,e.group.position.z-t.group.position.z);if(d<best&&this.hasLineOfSight(t.group.position,e.group.position)){target=e;best=d;}}if(target){t.group.rotation.y=Math.atan2(target.group.position.x-t.group.position.x,target.group.position.z-t.group.position.z);if(t.cooldown<=0){t.cooldown=.32;this.hitEnemy(target,8,'body',target.group.position.clone().add(new THREE.Vector3(0,1,0)));}}}this.sentries=this.sentries.filter(t=>t.life>0);}
  updatePowerups(dt){
    for(const f of this.flareLights){f.life-=dt;if(f.life<=0){this.scene.remove(f.light);this.scene.remove(f.mesh);}}this.flareLights=this.flareLights.filter(f=>f.life>0);
    for(const b of this.shieldBubbles){b.life-=dt;if(b.life<=0){this.scene.remove(b.mesh);this.scene.remove(b.light);}}this.shieldBubbles=this.shieldBubbles.filter(b=>b.life>0);
    for(const s of this.satchels){if(s.life!==Infinity){s.life-=dt;if(s.life<=0)this.detonateSatchel(s);}}this.satchels=this.satchels.filter(s=>s.alive);
    for(const f of this.ifgFields){f.life-=dt;if(f.life<=0)this.scene.remove(f.mesh);}this.ifgFields=this.ifgFields.filter(f=>f.life>0);
    for(const l of this.lures){l.life-=dt;if(l.life<=0)this.scene.remove(l.mesh);}this.lures=this.lures.filter(l=>l.life>0);
    if(this.stage==='cave'||this.stage==='returning'||this.stage==='boarding'){
      this.player.flareRestore+=dt;if(this.player.flareRestore>=15&&this.player.flareCharges<4){this.player.flareRestore=0;this.player.flareCharges++;}
    }
  }

  updateDrops(dt){this.world.updateDrops(dt,this.player);}
  damagePlayer(damage,source,reason='受击'){
    if(this.stage==='result'||this.playerBoarded)return;
    const p=this.player;p.lastDamage=this.elapsed;let remaining=damage;const shieldLoss=Math.min(p.shield,remaining);p.shield-=shieldLoss;remaining-=shieldLoss;if(remaining>0)p.health=Math.max(0,p.health-remaining);this.damageTaken+=damage;this.hud.toast(`${reason} · -${Math.ceil(damage)}`,'damage');this.hud.hit(false);
    const away=new THREE.Vector3(p.position.x-source.x,0,p.position.z-source.z).normalize();p.position.addScaledVector(away,.28);p.group.position.copy(p.position);
    if(p.health<=0){p.alive=false;this.finishMission(false,'生命归零 · 玩家阵亡');}
  }

  getAimDirection(){const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);return dir.normalize();}
  hasLineOfSight(from,to){const start=from.clone();start.y+=1;const end=to.clone();end.y+=.9;const delta=end.sub(start),distance=delta.length();if(distance<.1)return true;this.raycaster.set(start,delta.normalize());this.raycaster.far=distance;const hits=this.raycaster.intersectObjects(this.world.cameraOccluders.filter(m=>m.visible&&m.parent),false);return !hits.length||hits[0].distance>=distance-.6;}
}
