import * as THREE from '../vendor/three.module.js';
import { randomBetween, pick } from './utils.js';

const ROOM_SPACING = 30;
const ROOM_SIZE = 20;
const ROOM_HEIGHT = 7;

function textSprite(text, color = '#e9b35e', scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(7,12,11,.8)'; ctx.fillRect(0, 14, canvas.width, 100);
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(1, 15, canvas.width - 2, 98);
  ctx.font = 'bold 42px Microsoft YaHei, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(4.2 * scale, 1.05 * scale, 1); sprite.userData.noHit = true;
  return sprite;
}

function makeRngLayout(rng) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const count = 6 + Math.floor(rng() * 5);
    const cells = [{ gx: 0, gz: 0 }];
    const keys = new Set(['0,0']);
    while (cells.length < count) {
      const frontier = [];
      const frontierKeys = new Set();
      for (const cell of cells) {
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const gx = cell.gx + dx, gz = cell.gz + dz, key = `${gx},${gz}`;
          if (!keys.has(key) && !frontierKeys.has(key) && Math.abs(gx) <= 3 && Math.abs(gz) <= 3) {
            frontier.push({ gx, gz }); frontierKeys.add(key);
          }
        }
      }
      if (!frontier.length) break;
      const next = pick(rng, frontier); cells.push(next); keys.add(`${next.gx},${next.gz}`);
    }
    const edges = [];
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const dx = cells[j].gx - cells[i].gx, dz = cells[j].gz - cells[i].gz;
      if (Math.abs(dx) + Math.abs(dz) === 1) edges.push({ a: i, b: j, dx, dz });
    }
    const cycles = edges.length - cells.length + 1;
    if (cells.length === count && cycles >= 1 && cycles <= 4) return { cells, edges, cycles };
  }
  // Connected rectangular fallback with a loop, used only if a random polyomino fails validation.
  const cells = [{gx:0,gz:0},{gx:1,gz:0},{gx:2,gz:0},{gx:0,gz:1},{gx:1,gz:1},{gx:2,gz:1},{gx:0,gz:2}];
  const edges = [];
  for (let i=0;i<cells.length;i++) for (let j=i+1;j<cells.length;j++) {
    const dx=cells[j].gx-cells[i].gx,dz=cells[j].gz-cells[i].gz;
    if(Math.abs(dx)+Math.abs(dz)===1)edges.push({a:i,b:j,dx,dz});
  }
  return { cells, edges, cycles: edges.length - cells.length + 1 };
}

export class ExpeditionWorld {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.solids = [];
    this.rayTargets = [];
    this.cameraOccluders = [];
    this.cells = [];
    this.oreCells = [];
    this.drops = [];
    this.interactables = [];
    this.decorLights = [];
    this.visitedRooms = new Set();
    this.currentMode = 'base';
    this.rooms = [];
    this.links = [];
    this.seed = 0;
    this.resourceTotals = { crystal: 300, nitra: 240 };
    this.resourceRemaining = { crystal: 300, nitra: 240 };
    this.bossRoom = null;
    this.exitRoom = null;
    this.startRoom = null;
    this.robotRoom = null;
    this.ship = null;
    this.bot = null;
    this.rayHelper = new THREE.Raycaster();
  }

  clear() {
    this.scene.remove(this.group);
    const geometries = new Set(), materials = new Set();
    this.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.solids = []; this.rayTargets = []; this.cameraOccluders = []; this.cells = []; this.oreCells = []; this.drops = []; this.debris = [];
    this.interactables = []; this.supplyPacks = []; this.decorLights = []; this.rooms = []; this.links = []; this.visitedRooms.clear();this.currentRoom=null;
    this.bossRoom = null; this.exitRoom = null; this.startRoom = null; this.robotRoom = null; this.ship = null; this.bot = null;
  }

  material(color, roughness = .92, metalness = .02, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  }

  addBox(parent, position, size, material, { solid = false, ray = true, camera = false, userData = {} } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.set(position.x, position.y, position.z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { ...userData };
    parent.add(mesh);
    if (ray) this.rayTargets.push(mesh);
    if (camera) this.cameraOccluders.push(mesh);
    if (solid) this.addSolid(mesh, size, userData);
    return mesh;
  }

  addSolid(mesh, size, userData = {}) {
    const entry = { mesh, size: { ...size }, data: userData };
    this.solids.push(entry);
    return entry;
  }

  addCylinder(parent, position, radiusTop, radiusBottom, height, material, segments = 8) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
    mesh.position.set(position.x, position.y, position.z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  addLabel(parent, text, position, color = '#ffc36d', scale = 1) {
    const sprite = textSprite(text, color, scale); sprite.position.set(position.x, position.y, position.z); parent.add(sprite); return sprite;
  }

  buildBase() {
    this.clear(); this.currentMode = 'base';
    const floorMat = this.material(0x252d2a), wallMat = this.material(0x343b36), darkMat = this.material(0x161e1b), orangeMat = this.material(0xeaa346, .42, .18), paleMat = this.material(0xbac2b6, .7, .08);
    this.addBox(this.group, {x:0,y:-.35,z:0}, {x:66,y:.7,z:66}, floorMat, {ray:false});
    // Hangar perimeter and equipment alcoves.
    for (let x=-33;x<=33;x+=11) {
      this.addBox(this.group,{x,y:7,z:-33},{x:11,y:14,z:1},wallMat,{solid:true,camera:true});
      this.addBox(this.group,{x,y:7,z:33},{x:11,y:14,z:1},wallMat,{solid:true,camera:true});
    }
    for (let z=-22;z<=22;z+=11) {
      this.addBox(this.group,{x:-33,y:7,z},{x:1,y:14,z:11},wallMat,{solid:true,camera:true});
      this.addBox(this.group,{x:33,y:7,z},{x:1,y:14,z:11},wallMat,{solid:true,camera:true});
    }
    // Ceiling ribs.
    for (let x=-28;x<=28;x+=14) this.addBox(this.group,{x,y:13.4,z:0},{x:1.1,y:1,z:64},darkMat,{ray:false});
    const classDefs = [
      {id:'scout',x:-15,z:2,color:0x68b6dc}, {id:'engineer',x:-5,z:2,color:0xa78ce0},
      {id:'gunner',x:5,z:2,color:0xf1aa4d}, {id:'driller',x:15,z:2,color:0xf07851}
    ];
    this.interactables = [];
    for (const def of classDefs) {
      const pedestal = this.addCylinder(this.group,{x:def.x,y:.35,z:def.z},1.7,2.1,.7,this.material(def.color,.45,.25),8);
      const pillar = this.addBox(this.group,{x:def.x,y:1.75,z:def.z},{x:2.5,y:2.1,z:2.5},this.material(def.color,.5,.16),{solid:true,camera:true});
      this.addLabel(this.group,({scout:'侦察兵',engineer:'工程师',gunner:'枪手',driller:'钻机手'})[def.id],{x:def.x,y:3.4,z:def.z-1.5},'#f6c775',.68);
      this.interactables.push({type:'class',id:def.id,name:({scout:'侦察兵',engineer:'工程师',gunner:'枪手',driller:'钻机手'})[def.id],position:new THREE.Vector3(def.x,0,def.z),mesh:pedestal,range:4});
    }
    // Mission board.
    const board = this.addBox(this.group,{x:0,y:1.8,z:-10},{x:6,y:3.6,z:.8},darkMat,{solid:true,camera:true});
    this.addBox(this.group,{x:0,y:1.35,z:-9.48},{x:4.8,y:2.2,z:.08},this.material(0x354139,.4,.24,{emissive:0x33230e,emissiveIntensity:.38}),{ray:false});
    this.addLabel(this.group,'远征简报',{x:0,y:3.3,z:-9.3},'#1a1c18',.72);
    this.interactables.push({type:'mission',name:'远征任务简报台',position:new THREE.Vector3(0,0,-10),mesh:board,range:4.8});
    // Supply locker.
    const locker = this.addBox(this.group,{x:10,y:1.35,z:-10},{x:4.1,y:2.7,z:3},this.material(0x52615a,.64,.08),{solid:true,camera:true});
    this.addBox(this.group,{x:10,y:2.75,z:-8.45},{x:1.2,y:.16,z:.12},orangeMat,{ray:false});
    this.addLabel(this.group,'无限整备库',{x:10,y:3.5,z:-10},'#f4c878',.62);
    this.interactables.push({type:'supply',name:'无限整备库',position:new THREE.Vector3(10,0,-10),mesh:locker,range:4.2});
    // Transport pod / ship.
    const ship = new THREE.Group(); ship.position.set(0,0,19); this.group.add(ship);
    this.addBox(ship,{x:0,y:2.3,z:0},{x:12,y:4.6,z:14},this.material(0x454e48,.62,.24),{solid:false,camera:true});
    this.addBox(ship,{x:0,y:4.8,z:0},{x:9,y:.6,z:10},orangeMat,{ray:false});
    this.addBox(ship,{x:0,y:1.1,z:6.9},{x:7,y:2.2,z:.25},this.material(0x101715,.3,.4),{ray:false});
    this.addCylinder(ship,{x:-4,y:1.2,z:-4},1.4,1.7,2.8,paleMat,8);
    this.addCylinder(ship,{x:4,y:1.2,z:-4},1.4,1.7,2.8,paleMat,8);
    this.addLabel(this.group,'出发 / 撤离舱',{x:0,y:6,z:19},'#e9bd72',.78);
    this.interactables.push({type:'ship',name:'远征飞船',position:new THREE.Vector3(0,0,19),mesh:ship,range:6,solidRadius:3});
    // Training targets and prop crates.
    for (let i=0;i<3;i++) {
      const x=-13+i*13,z=-24;
      const target=this.addCylinder(this.group,{x,y:1.1,z},.7,.9,2.2,this.material(0x7d897e,.55,.15),7);
      this.addBox(this.group,{x,y:2.1,z},{x:1.2,y:.12,z:1.2},orangeMat,{ray:false});
      target.userData.entity={kind:'target'};this.rayTargets.push(target);
      this.interactables.push({type:'target',name:'无限生命训练靶',position:new THREE.Vector3(x,0,z),mesh:target,range:6});
    }
    for (let i=0;i<18;i++) {
      const x=randomBetween(this.rng,-28,28),z=randomBetween(this.rng,-28,28);
      if(Math.abs(x)<18&&Math.abs(z)<18)continue;
      const s=randomBetween(this.rng,.6,1.4);
      this.addBox(this.group,{x,y:s/2,z},{x:s*1.8,y:s,z:s*1.4},this.material(pick(this.rng,[0x414a45,0x343c38,0x4b5149])),{solid:true,camera:true});
    }
    // Hanger lights.
    for(const [x,z] of [[-24,-22],[24,-22],[-24,22],[24,22]]){
      const light=new THREE.PointLight(0xe6a64e,55,28,2);light.position.set(x,8,z);this.group.add(light);
      this.addCylinder(this.group,{x,y:4,z},.15,.25,8,this.material(0x39423b),6);
    }
  }

  generateCave(seed, wavePlanId) {
    this.clear(); this.currentMode='cave'; this.seed=seed; this.wavePlanId=wavePlanId;
    const layoutRng = this.rng;
    const {cells,edges,cycles}=makeRngLayout(layoutRng);
    this.graphCycles=cycles;
    this.rooms=cells.map((cell,i)=>({id:i,gx:cell.gx,gz:cell.gz,x:cell.gx*ROOM_SPACING,z:cell.gz*ROOM_SPACING,width:ROOM_SIZE+randomBetween(layoutRng,-1.5,1.5),depth:ROOM_SIZE+randomBetween(layoutRng,-1.5,1.5),ceilingY:ROOM_HEIGHT,visited:false}));
    this.startRoom=pick(layoutRng,this.rooms);
    const nonStart=this.rooms.filter(r=>r!==this.startRoom);
    this.bossRoom=pick(layoutRng,nonStart);
    const nonSpecial=nonStart.filter(r=>r!==this.bossRoom);
    this.exitRoom=pick(layoutRng,nonSpecial);
    const otherRooms=this.rooms.filter(r=>r!==this.startRoom&&r!==this.bossRoom&&r!==this.exitRoom);
    this.robotRoom=otherRooms.length?pick(layoutRng,otherRooms):this.startRoom;
    this.startNitraSlot=0;
    const shellMat=this.material(0x252c28,.98),floorMats=[0x303833,0x343a34,0x292f2b].map(c=>this.material(c,.98));
    const wallMats=[0x4a5149,0x3d463f,0x54584d].map(c=>this.material(c,.96));
    const darkMat=this.material(0x1b211e,.98), corridorMat=this.material(0x242b27,.98);
    this.doors=[];
    for(const room of this.rooms)this.buildRoom(room,layoutRng,pick(layoutRng,floorMats),pick(layoutRng,wallMats),darkMat);
    for(const edge of edges){
      const a=this.rooms[edge.a],b=this.rooms[edge.b];
      const dir=edge.dx===1?'east':edge.dx===-1?'west':edge.dz===1?'south':'north';
      const door=this.buildLink(a,b,dir,layoutRng,corridorMat);
      this.links.push({...edge,roomA:a,roomB:b,dir,door,passable:door.passable});
      a.links??=[];b.links??=[];a.links.push(door);b.links.push(door);
    }
    this.placeDecor(layoutRng);
    this.placeResources(layoutRng);
    this.placeRoomObjects(layoutRng);
    this.markVisited(this.startRoom);
    return {rooms:this.rooms,links:this.links,startRoom:this.startRoom,bossRoom:this.bossRoom,exitRoom:this.exitRoom,robotRoom:this.robotRoom,cycles:this.graphCycles};
  }

  buildRoom(room,rng,floorMat,wallMat,darkMat){
    const x=room.x,z=room.z,w=room.width,d=room.depth,h=ROOM_HEIGHT;
    room.group=new THREE.Group();this.group.add(room.group);
    this.addBox(room.group,{x,y:-.28,z},{x:w,y:.56,z:d},floorMat,{ray:false});
    const sides=[['north',z-d/2,{x:w,y:h,z:.8},'z'],['south',z+d/2,{x:w,y:h,z:.8},'z'],['west',x-w/2,{x:.8,y:h,z:d},'x'],['east',x+w/2,{x:.8,y:h,z:d},'x']];
    for(const [side,edge,size,axis] of sides){
      const edgeLinks=this.linksForGrid(room,side);
      if(!edgeLinks.length){
        const p=axis==='z'?{x,y:h/2,z:edge}:{x:edge,y:h/2,z};
        this.addBox(room.group,p,size,wallMat,{solid:true,camera:true});
      }else{
        const gap=6.2;
        if(axis==='z'){
          const left=x-w/2,right=x+w/2;
          const p1=(left+(x-gap/2))/2,p2=(right+(x+gap/2))/2;
          this.addBox(room.group,{x:p1,y:h/2,z:edge},{x:(x-gap/2)-left,y:h,z:.8},wallMat,{solid:true,camera:true});
          this.addBox(room.group,{x:p2,y:h/2,z:edge},{x:right-(x+gap/2),y:h,z:.8},wallMat,{solid:true,camera:true});
          this.addBox(room.group,{x,y:h-1.25,z:edge},{x:gap,y:2.5,z:.8},wallMat,{solid:true,camera:true});
        }else{
          const top=z-d/2,bottom=z+d/2;
          const p1=(top+(z-gap/2))/2,p2=(bottom+(z+gap/2))/2;
          this.addBox(room.group,{x:edge,y:h/2,z:p1},{x:.8,y:h,z:(z-gap/2)-top},wallMat,{solid:true,camera:true});
          this.addBox(room.group,{x:edge,y:h/2,z:p2},{x:.8,y:h,z:bottom-(z+gap/2)},wallMat,{solid:true,camera:true});
          this.addBox(room.group,{x:edge,y:h-1.25,z},{x:.8,y:2.5,z:gap},wallMat,{solid:true,camera:true});
        }
        // Clearly readable but non-directional rock ribs around the tunnel mouth.
        const ribMat=this.material(0x62675b,.96);
        if(axis==='z'){
          for(const ox of [-3.3,3.3])this.addBox(room.group,{x:x+ox,y:2.1,z:edge},{x:.55,y:4.2,z:1.2},ribMat,{solid:true,camera:true});
        }else{
          for(const oz of [-3.3,3.3])this.addBox(room.group,{x:edge,y:2.1,z:z+oz},{x:1.2,y:4.2,z:.55},ribMat,{solid:true,camera:true});
        }
      }
    }
    // Uneven cave ribs and boulders, kept clear of the center and door mouths.
    const boulderGeo=new THREE.DodecahedronGeometry(1,0);
    for(let i=0;i<5;i++){
      const side=i%4, offset=randomBetween(rng,-7,7),size=randomBetween(rng,1.2,2.4);
      let p;
      if(side===0)p={x:x+offset,y:5.9,z:z-d/2+1.4};
      else if(side===1)p={x:x+offset,y:5.9,z:z+d/2-1.4};
      else if(side===2)p={x:x-w/2+1.4,y:5.9,z:z+offset};
      else p={x:x+w/2-1.4,y:5.9,z:z+offset};
      const rock=new THREE.Mesh(boulderGeo,this.material(pick(rng,[0x53564c,0x414941,0x5b5a4e]),1));
      rock.position.set(p.x,p.y,p.z);rock.scale.set(size*1.3,size*.7,size*1.1);rock.castShadow=true;rock.receiveShadow=true;room.group.add(rock);
    }
    const light=new THREE.PointLight(0xc58a4b,42,31,1.55);light.position.set(x,5.8,z);light.visible=false;room.light=light;this.group.add(light);this.decorLights.push(light);
    room.label=textSprite(`区段 ${String(room.id+1).padStart(2,'0')}`,'#ad9b7a',.48);room.label.position.set(x,5.8,z);room.label.visible=false;this.group.add(room.label);
  }

  linksForGrid(room,side){
    const delta=side==='north'?[0,-1]:side==='south'?[0,1]:side==='west'?[-1,0]:[1,0];
    return this.rooms.filter(r=>r!==room&&r.gx===room.gx+delta[0]&&r.gz===room.gz+delta[1]);
  }

  buildLink(a,b,dir,rng,corridorMat){
    const horizontal=dir==='east'||dir==='west';
    const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
    const length=ROOM_SPACING-ROOM_SIZE;
    const floorSize=horizontal?{x:length,y:.5,z:6.2}:{x:6.2,y:.5,z:length};
    this.addBox(this.group,{x:mid.x,y:-.3,z:mid.z},floorSize,corridorMat,{ray:false});
    const sideMat=this.material(0x313932,.98);
    if(horizontal){
      for(const oz of [-3.35,3.35])this.addBox(this.group,{x:mid.x,y:1.7,z:mid.z+oz},{x:length,y:3.4,z:.55},sideMat,{solid:true,camera:true});
    }else{
      for(const ox of [-3.35,3.35])this.addBox(this.group,{x:mid.x+ox,y:1.7,z:mid.z},{x:.55,y:3.4,z:length},sideMat,{solid:true,camera:true});
    }
    const r=rng();let seal=r<.34?'full':r<.58?'partial':'open';
    const door={id:`link-${a.id}-${b.id}`,a,b,dir,center:new THREE.Vector3(mid.x,2,mid.z),cells:[],passable:seal==='open',seal};
    if(seal!=='open'){
      const cellMat=this.material(0x615f51,.99);
      for(let row=0;row<3;row++)for(let col=0;col<4;col++){
        if(seal==='partial'&&((row===2&&col===0)||(row===2&&col===3)))continue;
        const sx=horizontal?1.55:.78,sz=horizontal?.78:1.55;
        const cx=mid.x+(horizontal?(col-1.5)*1.55:0),cz=mid.z+(horizontal?0:(col-1.5)*1.55);
        const cy=.72+row*1.42;
        const mesh=this.addBox(this.group,{x:cx,y:cy,z:cz},{x:sx,y:1.42,z:sz},cellMat,{solid:true,camera:true,userData:{kind:'rockCell',name:'封堵岩块'}});
        const cell={kind:'rock',mesh,hp:30,maxHp:30,door,doorRow:row,doorCol:col,resource:0,worldPosition:new THREE.Vector3(cx,cy,cz),size:{x:sx,y:1.42,z:sz},removed:false};
        mesh.userData.entity=cell;door.cells.push(cell);this.cells.push(cell);
      }
      this.refreshDoor(door);
    }
    return door;
  }

  refreshDoor(door){
    const cleared=new Set(door.cells.filter(c=>c.removed).map(c=>`${c.doorCol},${c.doorRow}`));
    let passage=false;
    for(let col=0;col<4;col++)if(cleared.has(`${col},0`)&&cleared.has(`${col},1`))passage=true;
    door.passable=passage;
    for(const link of this.links)if(link.door===door)link.passable=passage;
  }

  placeDecor(rng){
    for(const room of this.rooms){
      const count=2+Math.floor(rng()*3);
      for(let i=0;i<count;i++){
        const side=Math.floor(rng()*4),t=randomBetween(rng,-7,7),s=randomBetween(rng,.8,1.6);
        let p;if(side===0)p={x:room.x+t,y:s*.44,z:room.z-room.depth/2+1.5};else if(side===1)p={x:room.x+t,y:s*.44,z:room.z+room.depth/2-1.5};else if(side===2)p={x:room.x-room.width/2+1.5,y:s*.44,z:room.z+t};else p={x:room.x+room.width/2-1.5,y:s*.44,z:room.z+t};
        this.addBox(this.group,p,{x:s*1.4,y:s*.9,z:s*1.3},this.material(pick(rng,[0x464c43,0x535448,0x3d463f]),1),{solid:true,camera:true});
      }
    }
  }

  placeResources(rng){
    const crystalNodes=Array.from({length:30},(_,i)=>({id:`crystal-${i}`,type:'crystal',value:10}));
    const nitraNodes=Array.from({length:24},(_,i)=>({id:`nitra-${i}`,type:'nitra',value:10}));
    const forced=nitraNodes.splice(0,8);
    for(const node of forced)this.placeVein(this.startRoom,node,rng,true);
    const rest=[...crystalNodes,...nitraNodes];
    for(const node of rest){
      const room=pick(rng,this.rooms);
      this.placeVein(room,node,rng,false);
    }
  }

  placeVein(room,node,rng,startGuarantee=false){
    const side=Math.floor(rng()*4), offsets=[-6,-2,2,6];
    const offset=startGuarantee?offsets[this.startNitraSlot++%offsets.length]+Math.floor((this.startNitraSlot-1)/4)*.35:pick(rng,offsets)+randomBetween(rng,-.45,.45);
    room.veinSlots??=[];let chosen=offset;
    for(let attempt=0;attempt<8;attempt++){
      if(room.veinSlots.every(p=>Math.abs(p.side-side)>0||Math.abs(p.offset-chosen)>2.7))break;
      chosen=pick(rng,offsets)+randomBetween(rng,-.5,.5);
    }
    room.veinSlots.push({side,offset:chosen});
    let base;
    if(side===0)base={x:room.x+chosen,y:1.85,z:room.z-room.depth/2+.15};
    else if(side===1)base={x:room.x+chosen,y:1.85,z:room.z+room.depth/2-.15};
    else if(side===2)base={x:room.x-room.width/2+.15,y:1.85,z:room.z+chosen};
    else base={x:room.x+room.width/2-.15,y:1.85,z:room.z+chosen};
    const group=new THREE.Group();room.group.add(group);
    const material=this.material(node.type==='crystal'?0x62dbbd:0xe8796f,.36,.28,{emissive:node.type==='crystal'?0x12483b:0x4e1518,emissiveIntensity:.45});
    const cells=[];
    for(let i=0;i<5;i++){
      const row=Math.floor(i/2),col=i%2;
      const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(.56,0),material);
      let x=base.x,z=base.z;
      if(side<2){x+= (col-.5)*.72+randomBetween(rng,-.12,.12);z+=side===0?.1:-.1;}
      else{z+=(col-.5)*.72+randomBetween(rng,-.12,.12);x+=side===2?.1:-.1;}
      mesh.position.set(x,base.y+(row-1)*.78,z);mesh.scale.set(.8,.78,.42);mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.userData={kind:'oreCell',name:node.type==='crystal'?'晶矿':'硝石'};group.add(mesh);
      const cell={kind:'ore',type:node.type,nodeId:node.id,mesh,hp:18,maxHp:18,value:2,worldPosition:mesh.position.clone(),removed:false};
      mesh.userData.entity=cell;cells.push(cell);this.oreCells.push(cell);this.rayTargets.push(mesh);
    }
    room.veins??=[];room.veins.push({id:node.id,type:node.type,value:10,cells,group});
  }

  placeRoomObjects(rng){
    this.interactables=[];
    this.bot=this.createBot(this.robotRoom);
    this.interactables.push({type:'robot',name:'运输机器人',position:new THREE.Vector3(this.bot.position.x,0,this.bot.position.z),mesh:this.bot,range:4.5,room:this.robotRoom});
    this.exitPad=new THREE.Group();this.exitRoom.group.add(this.exitPad);
    const padMat=this.material(0x6a685b,.7,.2);
    this.addCylinder(this.exitPad,{x:this.exitRoom.x,y:.08,z:this.exitRoom.z},4.2,4.2,.16,padMat,12);
    this.addCylinder(this.exitPad,{x:this.exitRoom.x,y:.18,z:this.exitRoom.z},3.5,3.5,.08,this.material(0xd9913c,.45,.35,{emissive:0x482308}),12);
    this.exitPad.visible=false;
    this.exitPosition=new THREE.Vector3(this.exitRoom.x,0,this.exitRoom.z);
    this.addLabel(this.exitPad,'撤离船返场点',{x:this.exitRoom.x,y:4,z:this.exitRoom.z},'#ffc36d',.62);
    // Stable supply and boss locations are room functions, not fixed world coordinates.
    this.bossPosition=new THREE.Vector3(this.bossRoom.x,0,this.bossRoom.z);
  }

  createBot(room){
    const group=new THREE.Group();room.group.add(group);group.position.set(room.x+3,0,room.z+2);
    const body=this.addBox(group,{x:0,y:.78,z:0},{x:1.6,y:1.4,z:1.2},this.material(0x8d9a8c,.76,.12),{ray:false});
    this.addBox(group,{x:0,y:1.54,z:-.08},{x:.9,y:.26,z:.78},this.material(0x434b45,.4,.2),{ray:false});
    this.addCylinder(group,{x:-.55,y:.18,z:.52},.33,.33,.22,this.material(0x252c29),8);
    this.addCylinder(group,{x:.55,y:.18,z:.52},.33,.33,.22,this.material(0x252c29),8);
    const beacon=new THREE.PointLight(0xf4bd64,8,8,2);beacon.position.set(0,2.5,0);group.add(beacon);
    return group;
  }

  spawnShip(){
    if(this.ship)return this.ship;
    this.ship=new THREE.Group();this.exitRoom.group.add(this.ship);this.ship.position.set(this.exitRoom.x,0,this.exitRoom.z);this.ship.visible=true;
    const hull=this.material(0x46524b,.66,.22),trim=this.material(0xd39b4d,.38,.44,{emissive:0x291707,emissiveIntensity:.3}),glass=this.material(0x70b6b0,.25,.25,{emissive:0x143633,emissiveIntensity:.65});
    this.addBox(this.ship,{x:0,y:2,z:0},{x:8,y:3.5,z:10},hull,{ray:false});
    this.addBox(this.ship,{x:0,y:3.8,z:0},{x:6.5,y:.42,z:8.6},trim,{ray:false});
    this.addBox(this.ship,{x:0,y:1.8,z:5.04},{x:5,y:2.7,z:.12},glass,{ray:false});
    this.addBox(this.ship,{x:0,y:.9,z:6.2},{x:5.5,y:.16,z:2.2},trim,{ray:false});
    for(const x of [-3.4,3.4]){
      this.addBox(this.ship,{x,y:1,z:-1.7},{x:1,y:2,z:3.8},hull,{ray:false});
      const glow=new THREE.PointLight(0xf6b251,12,9,2);glow.position.set(x,2.4,-1);this.ship.add(glow);
    }
    this.addLabel(this.ship,'撤离船',{x:0,y:5.2,z:0},'#ffd27b',.78);
    this.interactables.push({type:'ship',name:'撤离船',position:new THREE.Vector3(this.exitRoom.x,0,this.exitRoom.z),mesh:this.ship,range:6,room:this.exitRoom});
    this.exitPad.visible=true;
    return this.ship;
  }

  markVisited(room){
    if(!room)return;
    room.visited=true;this.visitedRooms.add(room.id);if(room.light)room.light.visible=true;if(room.label)room.label.visible=true;
  }

  roomAt(position){
    let nearest=this.rooms[0],best=Infinity;
    for(const room of this.rooms){
      const dx=Math.max(Math.abs(position.x-room.x)-room.width/2,0),dz=Math.max(Math.abs(position.z-room.z)-room.depth/2,0);
      const d=dx*dx+dz*dz;
      if(d<best){best=d;nearest=room;}
    }
    for(const link of this.links)if(link.passable){const dx=position.x-link.door.center.x,dz=position.z-link.door.center.z;if(Math.hypot(dx,dz)<6)return this.roomAtDoor(link,position);}
    return nearest;
  }

  roomAtDoor(link,position){
    const da=(position.x-link.roomA.x)**2+(position.z-link.roomA.z)**2;
    const db=(position.x-link.roomB.x)**2+(position.z-link.roomB.z)**2;
    return da<db?link.roomA:link.roomB;
  }

  reachableRooms(fromRoom){
    const seen=new Set([fromRoom?.id]);const q=[fromRoom];
    while(q.length){const room=q.shift();for(const link of room?.links??[]){if(!link.passable)continue;const next=link.a===room?link.b:link.a;if(!seen.has(next.id)){seen.add(next.id);q.push(next);}}}
    return this.rooms.filter(r=>seen.has(r.id));
  }

  nextRoomToward(fromRoom,toRoom){
    if(!fromRoom||!toRoom||fromRoom===toRoom)return fromRoom;
    const q=[fromRoom],prev=new Map([[fromRoom.id,null]]);
    while(q.length){const room=q.shift();if(room===toRoom)break;for(const link of room.links??[]){if(!link.passable)continue;const next=link.a===room?link.b:link.a;if(!prev.has(next.id)){prev.set(next.id,room);q.push(next);}}}
    if(!prev.has(toRoom.id))return null;
    let node=toRoom;while(prev.get(node.id)&&prev.get(node.id)!==fromRoom)node=prev.get(node.id);
    return node;
  }

  updateCurrentRoom(position){
    const room=this.roomAt(position);this.currentRoom=room;if(room&&!room.visited)this.markVisited(room);return room;
  }

  spawnDrop(position,type,amount){
    const color=type==='crystal'?0x6de0bf:0xef8174;
    const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(.23,0),this.material(color,.32,.2,{emissive:color,emissiveIntensity:.3}));
    mesh.position.copy(position);mesh.position.y=Math.max(.25,mesh.position.y);mesh.castShadow=true;mesh.userData={kind:'drop',type,amount};this.group.add(mesh);this.rayTargets.push(mesh);
    const drop={mesh,type,amount,age:0,grounded:false,velocity:new THREE.Vector3((this.rng()-.5)*2,2+this.rng()*1.2,(this.rng()-.5)*2),removed:false};this.drops.push(drop);return drop;
  }

  addDebris(position,color=0x77756b,count=3){
    const room=Math.max(0,128-(this.debris??[]).length);count=Math.min(count,room);if(count<=0)return;
    const material=this.material(color,.96);
    for(let i=0;i<count;i++){
      const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(randomBetween(this.rng,.08,.16),0),material);
      mesh.position.copy(position);mesh.castShadow=true;this.group.add(mesh);
      const obj={mesh,velocity:new THREE.Vector3((this.rng()-.5)*3,randomBetween(this.rng,1,3),(this.rng()-.5)*3),life:1.1};this.debris??=[];this.debris.push(obj);
    }
  }

  canMove(position,radius=.42,height=2.15){
    const minY=position.y??0,maxY=minY+height;
    for(const solid of this.solids){
      const m=solid.mesh;if(!m.parent||!m.visible)continue;
      const half=solid.size;const dx=Math.max(Math.abs(position.x-m.position.x)-half.x/2-radius,0);const dz=Math.max(Math.abs(position.z-m.position.z)-half.z/2-radius,0);
      const vertical=m.position.y+half.y/2>minY&&m.position.y-half.y/2<maxY;
      if(vertical&&dx*dx+dz*dz<.012)return false;
    }
    return true;
  }

  nearestInteractable(position,aimDirection){
    let best=null,bestD=Infinity;
    for(const item of this.interactables){
      if(item.type==='ship'&&this.currentMode==='cave'&&(!this.ship||!this.ship.visible))continue;
      if(item.type==='robot'&&this.currentMode!=='cave')continue;
      const dx=item.position.x-position.x,dz=item.position.z-position.z,d=Math.hypot(dx,dz);
      if(d>item.range||d>=bestD)continue;
      const to=new THREE.Vector3(dx,0,dz).normalize();
      const dot=aimDirection?to.dot(aimDirection):1;
      if(d>2.5&&dot<-.2)continue;
      best=item;bestD=d;
    }
    return best;
  }

  getMapData(playerPos){
    return {rooms:this.rooms,links:this.links,visited:this.visitedRooms,playerRoom:this.roomAt(playerPos),exitRoom:this.exitRoom,bossRoom:this.bossRoom,robotRoom:this.robotRoom};
  }

  cellDestroyed(cell){
    if(cell.removed)return;
    cell.removed=true;this.group.remove(cell.mesh);
    this.solids=this.solids.filter(s=>s.mesh!==cell.mesh);
    this.rayTargets=this.rayTargets.filter(o=>o!==cell.mesh);
    this.cameraOccluders=this.cameraOccluders.filter(o=>o!==cell.mesh);
    cell.mesh.visible=false;
    if(cell.kind==='ore'){
      this.resourceRemaining[cell.type]=Math.max(0,this.resourceRemaining[cell.type]-cell.value);
      this.spawnDrop(cell.worldPosition.clone(),cell.type,cell.value);
    }else{
      this.addDebris(cell.worldPosition.clone(),0x776f60,4);
      if(cell.door)this.refreshDoor(cell.door);
    }
  }

  updateDrops(dt,player){
    for(const drop of this.drops){
      if(drop.removed)continue;
      drop.age+=dt;
      if(!drop.grounded){drop.velocity.y-=9.8*dt;drop.mesh.position.addScaledVector(drop.velocity,dt);if(drop.mesh.position.y<=.24){drop.mesh.position.y=.24;drop.velocity.set(0,0,0);drop.grounded=true;}}
      else{drop.mesh.rotation.y+=dt*1.8;drop.mesh.position.y=.24+Math.sin(drop.age*2.5)*.07;}
      if(drop.grounded&&drop.age>.35){
        const distance=Math.hypot(drop.mesh.position.x-player.position.x,drop.mesh.position.z-player.position.z);
        if(distance<1.9&&player.cargo[drop.type]<40){const take=Math.min(drop.amount,40-player.cargo[drop.type]);player.cargo[drop.type]+=take;drop.amount-=take;if(drop.amount<=0){drop.removed=true;this.group.remove(drop.mesh);this.rayTargets=this.rayTargets.filter(o=>o!==drop.mesh);}}
      }
    }
    for(const debris of this.debris??[]){if(debris.life<=0)continue;debris.life-=dt;debris.velocity.y-=9*dt;debris.mesh.position.addScaledVector(debris.velocity,dt);debris.mesh.rotation.x+=dt*4;debris.mesh.rotation.z+=dt*3;if(debris.life<=0){this.group.remove(debris.mesh);debris.mesh.visible=false;}}
    this.debris=(this.debris??[]).filter(d=>d.life>0);
  }

  dispose(){
    this.clear();
  }
}

