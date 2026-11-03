import * as THREE from '../vendor/three.module.js';
import { ENEMIES } from './config.js';
import { clamp, randomBetween, pick } from './utils.js';

function standard(color, roughness=.72, metalness=.04, emissive=0x000000){
  return new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:emissive?0.32:0});
}

function addMesh(group, geometry, material, position, scale={x:1,y:1,z:1}, hit=null){
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position.x,position.y,position.z);mesh.scale.set(scale.x,scale.y,scale.z);mesh.castShadow=true;mesh.receiveShadow=true;
  if(hit)mesh.userData.hit=hit;group.add(mesh);return mesh;
}

export class Enemy {
  constructor(kind, room, position, scene, rng, callbacks={}){
    this.data=ENEMIES[kind];this.kind=kind;this.room=room;this.rng=rng;this.callbacks=callbacks;
    this.maxHp=this.data.hp;this.hp=this.data.hp;this.alive=true;this.age=0;this.attackCooldown=randomBetween(rng,.6,1.7);this.windup=0;this.attackType=null;this.recover=0;
    this.stun=0;this.flash=0;this.pathRefresh=0;this.nextRoom=null;this.isBoss=this.data.boss||false;this.isElite=this.data.elite||false;this.weakCloseTimer=0;this.sacCloseTimer=0;
    this.group=new THREE.Group();this.group.position.set(position.x,0,position.z);scene.add(this.group);
    this.parts=[];this.weakpoints=[];this.telegraph=null;this.sacks=[];this.coreOpen=false;this.weakOpen=this.kind==='rusher';this.chargeVelocity=null;
    this.buildVisual();
    if(this.isBoss){this.sacs=[120,120];this.phase=1;this.lastBossAttack=0;this.coreMesh=this.weakpoints.find(w=>w.part==='core')?.mesh;}
    if(this.kind==='siege'){this.sacs=[90,90];this.weakOpen=false;}
  }

  part(mesh, part='body', weak=false){
    mesh.userData.hit={target:'enemy',enemy:this,part,weak};this.parts.push(mesh);if(weak)this.weakpoints.push({mesh,part,active:true});return mesh;
  }

  buildVisual(){
    const main=standard(this.data.color,.78,.12),dark=standard(0x352b25,.95),eye=standard(0xf3a352,.3,.06,0xc14d14),glow=standard(0x64dfba,.34,.16,0x1f9a73);
    const size=this.data.scale;
    const shellGeo=new THREE.DodecahedronGeometry(.72,0),bodyGeo=new THREE.SphereGeometry(.68,10,8),legGeo=new THREE.CylinderGeometry(.09,.16,.8,5);
    this.body=addMesh(this.group,this.isBoss?new THREE.DodecahedronGeometry(1.55,1):shellGeo,main,{x:0,y:.95*size,z:0},{x:1.2*size,y:.9*size,z:1.45*size});this.part(this.body);
    if(this.kind==='rusher'){
      this.body.position.set(0,.62,0);this.body.scale.set(.7,.55,1.12);
      addMesh(this.group,bodyGeo,dark,{x:0,y:.48,z:-.68},{x:.55,y:.45,z:.52});
      const tail=addMesh(this.group,new THREE.SphereGeometry(.36,9,7),glow,{x:0,y:.72,z:1.05},{x:.92,y:.86,z:1.12});this.part(tail,'tail',true);
    }else if(this.kind==='hauler'){
      this.body.position.y=.9;this.body.scale.set(1.2,.84,1.3);
      for(const s of [-1,1]){
        addMesh(this.group,legGeo,dark,{x:s*.55,y:.42,z:.4},{x:1.1,y:1.1,z:1});
        addMesh(this.group,new THREE.ConeGeometry(.22,.82,5),main,{x:s*.42,y:.66,z:-.92},{x:1,y:1,z:1}).rotation.x=-Math.PI/2;
      }
      addMesh(this.group,new THREE.ConeGeometry(.35,.95,6),dark,{x:0,y:.82,z:-1.05},{x:1,y:1,z:1}).rotation.x=-Math.PI/2;
    }else if(this.kind==='acid'||this.kind==='shard'){
      this.body.position.y=.78;this.body.scale.set(.8,.75,1.04);
      addMesh(this.group,new THREE.SphereGeometry(.38,9,8),this.kind==='acid'?glow:eye,{x:0,y:1.05,z:-.56},{x:.82,y:.75,z:.9});
      if(this.kind==='shard')for(let i=0;i<5;i++){const a=i*Math.PI*2/5;addMesh(this.group,new THREE.ConeGeometry(.2,.78,5),main,{x:Math.cos(a)*.52,y:1.15,z:Math.sin(a)*.5},{x:1,y:1,z:1}).rotation.z=Math.cos(a)*.65;}
    }else if(this.kind==='rupture'){
      this.body.position.y=1.05;this.body.scale.set(1.3,.95,1.6);
      for(const s of [-1,1]){addMesh(this.group,legGeo,dark,{x:s*.84,y:.55,z:.25},{x:1.35,y:1.2,z:1.15});addMesh(this.group,new THREE.ConeGeometry(.25,.8,5),main,{x:s*.66,y:.65,z:-1.2},{x:1,y:1,z:1}).rotation.x=-Math.PI/2;}
      const sac=addMesh(this.group,new THREE.SphereGeometry(.42,10,8),glow,{x:0,y:.65,z:.86},{x:1.22,y:.95,z:.8});this.part(sac,'sac',true);this.sacMesh=sac;
    }else if(this.kind==='siege'){
      this.body.position.y=1.2;this.body.scale.set(1.35,1.05,1.45);
      for(const s of [-1,1]){
        const sac=addMesh(this.group,new THREE.DodecahedronGeometry(.39,0),glow,{x:s*.88,y:1.55,z:.34},{x:1.05,y:1.1,z:.78});this.part(sac,s<0?'sacL':'sacR',true);this.sacks.push(sac);
        addMesh(this.group,new THREE.ConeGeometry(.22,.7,5),main,{x:s*.56,y:.82,z:-1.25},{x:1,y:1,z:1}).rotation.x=-Math.PI/2;
      }
    }else if(this.isBoss){
      this.body.position.y=2.2;this.body.scale.set(1.62,1.25,1.7);
      for(let i=0;i<6;i++){
        const side=i<3?-1:1,index=i%3;
        const leg=addMesh(this.group,new THREE.CylinderGeometry(.22,.43,2.9,7),dark,{x:side*(1.25+index*.28),y:.95,z:(index-1)*1.28},{x:1,y:1,z:1});leg.rotation.z=side*.42;leg.rotation.x=(index-1)*.15;
        addMesh(this.group,new THREE.ConeGeometry(.34,.6,6),main,{x:side*(1.85+index*.28),y:.18,z:(index-1)*1.28},{x:1,y:1,z:1});
      }
      for(const s of [-1,1]){
        const sac=addMesh(this.group,new THREE.SphereGeometry(.52,10,8),glow,{x:s*1.2,y:1.35,z:.5},{x:1.1,y:.9,z:.85});this.part(sac,s<0?'sacL':'sacR',true);this.sacks.push(sac);
      }
      const plates=addMesh(this.group,new THREE.BoxGeometry(1.3,.95,.18),main,{x:0,y:2.25,z:-1.48},{x:1,y:1,z:1});this.part(plates);
      const core=addMesh(this.group,new THREE.SphereGeometry(.58,12,10),glow,{x:0,y:2.05,z:-1.62},{x:1.25,y:1.08,z:.55});this.part(core,'core',true);this.coreMesh=core;core.visible=false;
      this.plates=plates;
      addMesh(this.group,new THREE.ConeGeometry(.58,1.25,7),dark,{x:0,y:2.45,z:-2.15},{x:1,y:1,z:1}).rotation.x=-Math.PI/2;
    }
    // Eyes and dorsal marks are decorative, not weakpoint hitboxes.
    for(const side of [-1,1])addMesh(this.group,new THREE.SphereGeometry(this.isBoss?.11:.08,7,6),eye,{x:side*(this.isBoss?.42:.2),y:this.isBoss?2.55:1.1,z:this.isBoss?-1.9:-.8},{x:1,y:1,z:.6});
  }

  damage(amount,part='body'){
    if(!this.alive)return {actual:0,crit:false,killed:false};
    let weak=this.weakpoints.find(w=>w.part===part&&w.active&&w.mesh.visible);
    const activeEliteWeak=(this.kind==='rupture'&&this.weakOpen&&part==='sac')||(this.kind==='siege'&&this.weakOpen&&(part==='sacL'||part==='sacR'));
    const activeBossWeak=(this.isBoss&&((this.coreOpen&&part==='core')||this.phaseSacsOpen&&(part==='sacL'||part==='sacR')));
    const isWeak=Boolean(weak&&(this.kind==='rusher'||activeEliteWeak||activeBossWeak));
    const dealt=amount*(isWeak?(this.data.weakMultiplier||2):1);
    const actual=Math.min(this.hp,dealt);this.hp=Math.max(0,this.hp-dealt);this.flash=.1;
    if(isWeak&&this.kind==='siege'){
      const index=part==='sacL'?0:1;this.sacs[index]-=amount;
      if(this.sacs[index]<=0){this.sacks[index].visible=false;const w=this.weakpoints.find(p=>p.part===part);if(w)w.active=false;}
    }
    if(isWeak&&this.isBoss&&(part==='sacL'||part==='sacR')){
      const index=part==='sacL'?0:1;this.sacs[index]-=amount;
      if(this.sacs[index]<=0){this.sacks[index].visible=false;const w=this.weakpoints.find(p=>p.part===part);if(w)w.active=false;}
    }
    const killed=this.hp<=0;if(killed)this.die();
    return {actual,display:dealt,crit:isWeak,killed};
  }

  die(){this.alive=false;this.group.visible=false;if(this.telegraph)this.telegraph.visible=false;}

  setTelegraph(game,type,position,radius,duration=.8){
    if(this.telegraph)game.removeTelegraph(this.telegraph);
    this.telegraph=game.addTelegraph(type,position,radius,duration);
  }

  update(dt,game){
    if(!this.alive)return;
    this.age+=dt;this.attackCooldown-=dt;this.recover=Math.max(0,this.recover-dt);this.stun=Math.max(0,this.stun-dt);this.flash=Math.max(0,this.flash-dt);
    if(this.weakCloseTimer>0){this.weakCloseTimer-=dt;if(this.weakCloseTimer<=0){this.weakOpen=false;if(this.sacMesh)this.sacMesh.material.emissiveIntensity=.32;for(const sack of this.sacks)sack.material.emissiveIntensity=.32;}}
    if(this.sacCloseTimer>0){this.sacCloseTimer-=dt;if(this.sacCloseTimer<=0){this.phaseSacsOpen=false;for(const sack of this.sacks)sack.material.emissiveIntensity=.32;}}
    this.group.position.y=this.isBoss?0:Math.sin(this.age*6)*.035;
    if(this.flash>0)this.body.material.emissive.setHex(0x5a2e19);else this.body.material.emissive.setHex(0x000000);
    if(this.isBoss){this.updateBoss(dt,game);return;}
    if(this.windup>0){this.updateAttack(dt,game);return;}
    if(this.stun>0||this.recover>0)return;
    const player=game.player,target=game.getEnemyTarget?.(this)||player.position;const dx=target.x-this.group.position.x,dz=target.z-this.group.position.z,dist=Math.hypot(dx,dz);
    const forward=new THREE.Vector3(dx,0,dz).normalize();
    if(dist>.01)this.group.rotation.y=Math.atan2(forward.x,forward.z);
    if(this.kind==='rupture'){
      if(this.attackCooldown<=0&&dist>4.5&&dist<12){this.beginAttack('charge',.95,6.5,game);return;}
      if(dist>2.4)this.moveAlongPath(dt,game,forward,dist,3.1);
      else if(this.attackCooldown<=0)this.beginAttack('claw',.8,3.2,game);
      return;
    }
    if(this.kind==='siege'||this.data.ranged){
      const desired=this.kind==='siege'?16:this.kind==='acid'?9:15;
      if(dist<desired*.68)this.moveAlongPath(dt,game,forward,-dist,this.data.speed);
      else if(dist>desired*1.35)this.moveAlongPath(dt,game,forward,dist,this.data.speed);
      else if(this.attackCooldown<=0&&game.hasLineOfSight(this.group.position,player.position)){
        if(this.kind==='acid')this.beginAttack('acid',.75,3.8,game);
        else if(this.kind==='shard')this.beginAttack('shard',.65,4.2,game);
        else if(this.kind==='siege')this.beginAttack('mortar',1,7,game);
      }
      return;
    }
    if(this.kind==='hauler'){
      if(dist>2.3)this.moveAlongPath(dt,game,forward,dist,1.9);
      else if(this.attackCooldown<=0)this.beginAttack(dist<1.8?'bash':'sweep',dist<1.8?.9:.8,dist<1.8?5:2.8,game);
      return;
    }
    if(dist>1.85)this.moveAlongPath(dt,game,forward,dist,this.data.speed);
    else if(this.attackCooldown<=0)this.beginAttack('bite',.55,1.7,game);
  }

  moveAlongPath(dt,game,direction,distance,speed){
    const pos=this.group.position;
    let target=game.getEnemyTarget?.(this)||game.player.position;
    const myRoom=game.world.roomAt(pos),playerRoom=game.world.roomAt(game.player.position);
    if(myRoom&&playerRoom&&myRoom!==playerRoom){
      const next=game.world.nextRoomToward(myRoom,playerRoom);
      const link=next&&(myRoom.links||[]).find(l=>l.passable&&((l.a===myRoom&&l.b===next)||(l.b===myRoom&&l.a===next)));
      if(link)target=link.door.center;
    }
    const dx=target.x-pos.x,dz=target.z-pos.z,len=Math.hypot(dx,dz)||1;
    const dir=new THREE.Vector3(dx/len,0,dz/len);
    const step=speed*(game.enemySlowFactor?.(pos)??1)*dt*Math.sign(distance||1);
    const candidate=new THREE.Vector3(pos.x+dir.x*step,0,pos.z+dir.z*step);
    if(game.world.canMove(candidate,.45,1.8))pos.set(candidate.x,pos.y,candidate.z);
    else{
      const slide=new THREE.Vector3(pos.x-dir.z*step,0,pos.z+dir.x*step);
      if(game.world.canMove(slide,.45,1.8))pos.set(slide.x,pos.y,slide.z);
    }
  }

  beginAttack(type,windup,cooldown,game){
    this.attackType=type;this.windup=windup;this.attackCooldown=cooldown;this.attackStart=game.elapsed;this.telegraph=game.addTelegraph(type,this.group.position, type==='mortar'?2.8:type==='charge'?1.4:2.3,windup,this);
    game.audioCue('warning');
  }

  updateAttack(dt,game){
    this.windup-=dt;
    if(this.attackType==='charge'&&this.windup<.15){const d=new THREE.Vector3(game.player.position.x-this.group.position.x,0,game.player.position.z-this.group.position.z).normalize();this.group.position.addScaledVector(d,5.4*dt);}
    if(this.windup>0)return;
    const p=game.player.position,dx=p.x-this.group.position.x,dz=p.z-this.group.position.z,dist=Math.hypot(dx,dz);
    const forward=new THREE.Vector3(Math.sin(this.group.rotation.y),0,Math.cos(this.group.rotation.y));
    if(this.attackType==='bite'&&dist<2.15)game.damagePlayer(this.data.damage,this.group.position,'撕咬');
    if(this.attackType==='sweep'&&dist<2.7&&forward.dot(new THREE.Vector3(dx,0,dz).normalize())>.15)game.damagePlayer(20,this.group.position,'钩颚横扫');
    if(this.attackType==='bash'&&dist<1.8)game.damagePlayer(24,this.group.position,'钩颚顶撞');
    if(this.attackType==='claw'&&dist<2.8&&forward.dot(new THREE.Vector3(dx,0,dz).normalize())>-.2)game.damagePlayer(16,this.group.position,'精英双钩');
    if(this.attackType==='charge'){
      if(dist<2.4)game.damagePlayer(30,this.group.position,'破岩冲锋');
      this.recover=1.1;this.weakOpen=true;this.weakCloseTimer=1.1;this.sacMesh.material.emissiveIntensity=.95;
    }
    if(this.attackType==='acid')game.spawnProjectile(this,'acid',this.data.damage,10);
    if(this.attackType==='shard')game.spawnProjectile(this,'shard',this.data.damage,16,3);
    if(this.attackType==='mortar'){game.spawnMortarPattern(this);this.weakOpen=true;this.weakCloseTimer=1.2;for(const sack of this.sacks)sack.material.emissiveIntensity=.95;}
    if(this.telegraph)game.removeTelegraph(this.telegraph);this.telegraph=null;this.attackType=null;
  }

  updateBoss(dt,game){
    const p=game.player.position,dx=p.x-this.group.position.x,dz=p.z-this.group.position.z,dist=Math.hypot(dx,dz),dir=new THREE.Vector3(dx,0,dz).normalize();
    const nextPhase=this.hp/this.maxHp>.66?1:this.hp/this.maxHp>.3?2:3;
    if(nextPhase!==this.phase){this.phase=nextPhase;this.stun=1.2;game.toast(`渊脊母虫进入阶段 ${this.phase}`,'warning');game.audioCue('boss');}
    if(this.coreCloseTimer>0){this.coreCloseTimer-=dt;if(this.coreCloseTimer<=0){this.coreOpen=false;this.plates.visible=true;this.coreMesh.visible=false;}}
    if(dist>7&&this.recover<=0&&this.windup<=0)this.moveAlongPath(dt,game,dir,dist,1.65*(this.phase===3?1.12:1));
    if(dist>.01)this.group.rotation.y=Math.atan2(dir.x,dir.z);
    if(this.windup>0){this.updateBossAttack(dt,game);return;}
    if(this.stun>0||this.recover>0)return;
    if(this.age>15&&this.age-this.lastBossAttack>13&&!this.summonPending){this.beginBossAttack('summon',1.3,14,game);return;}
    if(this.attackCooldown<=0){
      let types=this.phase===3?['acidSweep','slam','burrow','seismic']:['acidSweep','slam','burrow'];
      this.beginBossAttack(pick(this.rng,types),this.phase===3?1.25:.95,randomBetween(this.rng,3.3,5.2)*(this.phase===3?.85:1),game);
    }
  }

  beginBossAttack(type,windup,cooldown,game){
    this.attackType=type;this.windup=windup;this.attackCooldown=cooldown;this.lastBossAttack=this.age;
    this.coreOpen=false;this.plates.visible=true;this.coreMesh.visible=false;
    const radius=type==='seismic'?10:type==='slam'?4.2:type==='burrow'?3.2:3.5;
    this.telegraph=game.addTelegraph(type,this.group.position,radius,windup,this);
    if(type==='summon')this.summonPending=true;
    game.audioCue('warning');
  }

  updateBossAttack(dt,game){
    this.windup-=dt;
    if(this.attackType==='burrow'&&this.windup<.55&&!this.burrowMoving){this.burrowMoving=true;this.group.visible=false;}
    if(this.attackType==='burrow'&&this.burrowMoving&&this.windup<.28){this.group.position.x=game.player.position.x+randomBetween(this.rng,-5,5);this.group.position.z=game.player.position.z+randomBetween(this.rng,-5,5);this.group.visible=true;this.burrowMoving=false;}
    if(this.windup>0)return;
    const p=game.player.position,dx=p.x-this.group.position.x,dz=p.z-this.group.position.z,dist=Math.hypot(dx,dz);
    const forward=new THREE.Vector3(Math.sin(this.group.rotation.y),0,Math.cos(this.group.rotation.y));
    if(this.attackType==='acidSweep'){
      if(dist<10&&forward.dot(new THREE.Vector3(dx,0,dz).normalize())>.3)game.damagePlayer(22,this.group.position,'腐蚀横扫');
      game.spawnAcidPatch(this.group.position.clone().addScaledVector(forward,4),3,3);
      this.coreOpen=true;this.plates.visible=false;this.coreMesh.visible=true;this.coreCloseTimer=2.2;
    }
    if(this.attackType==='slam'&&dist<4.2)game.damagePlayer(26,this.group.position,'前爪震地');
    if(this.attackType==='burrow'){
      if(dist<2.8)game.damagePlayer(20,this.group.position,'掘地破土');
      this.phaseSacsOpen=true;this.sacCloseTimer=2.5;for(const w of this.weakpoints)if(w.part==='sacL'||w.part==='sacR')w.mesh.material.emissiveIntensity=.9;
    }
    if(this.attackType==='seismic'){
      if(dist<9&&dist>3.2)game.damagePlayer(28,this.group.position,'深渊震荡');
      this.coreOpen=true;this.plates.visible=false;this.coreMesh.visible=true;this.coreCloseTimer=2.2;
    }
    if(this.attackType==='summon'){
      game.spawnBossAdds(this);
      this.lastBossAttack=this.age;this.summonPending=false;
    }
    this.recover=this.attackType==='summon'?.8:.9;
    if(this.telegraph)game.removeTelegraph(this.telegraph);this.telegraph=null;this.attackType=null;
  }
}

