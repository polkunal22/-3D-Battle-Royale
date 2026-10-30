import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

/* ================= SOUND (WebAudio, no assets) ================= */
const AC=window.AudioContext||window.webkitAudioContext;
let audio=null;
function initAudio(){if(!audio)audio=new AC();}
function noiseBurst(dur,freq,vol,type="lowpass"){
  if(!audio)return;
  const n=audio.sampleRate*dur,b=audio.createBuffer(1,n,audio.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
  const src=audio.createBufferSource();src.buffer=b;
  const f=audio.createBiquadFilter();f.type=type;f.frequency.value=freq;
  const g=audio.createGain();g.gain.value=vol;
  src.connect(f).connect(g).connect(audio.destination);src.start();
}
function tone(freq,dur,vol,type="square",slide=0){
  if(!audio)return;
  const o=audio.createOscillator(),g=audio.createGain();
  o.type=type;o.frequency.value=freq;
  if(slide)o.frequency.linearRampToValueAtTime(freq+slide,audio.currentTime+dur);
  g.gain.setValueAtTime(vol,audio.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);
  o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur);
}
const sfx={
  shoot(){noiseBurst(.09,1800,.25);tone(160,.06,.12,"square",-80);},
  reload(){tone(320,.08,.08,"sine");setTimeout(()=>tone(480,.08,.08,"sine"),200);setTimeout(()=>tone(650,.1,.09,"sine"),450);},
  hit(){tone(880,.06,.12,"triangle");},
  kill(){tone(523,.09,.14,"triangle");setTimeout(()=>tone(784,.14,.14,"triangle"),90);},
  hurt(){tone(120,.15,.2,"sawtooth",-40);},
  empty(){tone(200,.05,.08,"square");}
};

/* ================= SCENE ================= */
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9fb7c8);
scene.fog=new THREE.Fog(0x9fb7c8,105,250);

const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,500);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdce8f2,0x596354,1.25));
const sun=new THREE.DirectionalLight(0xffe7c2,3.1);
sun.position.set(-45,85,32);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=sun.shadow.camera.bottom=-120;
sun.shadow.camera.right=sun.shadow.camera.top=120;
scene.add(sun);

function makeGroundTexture(){
  const canvas=document.createElement("canvas");
  canvas.width=canvas.height=256;
  const ctx=canvas.getContext("2d");
  const image=ctx.createImageData(canvas.width,canvas.height);
  for(let i=0;i<image.data.length;i+=4){
    const variation=Math.random()*34-17;
    image.data[i]=91+variation;
    image.data[i+1]=105+variation;
    image.data[i+2]=76+variation*.7;
    image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(28,28);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(240,240),
  new THREE.MeshStandardMaterial({map:makeGroundTexture(),color:0xc4c4b5,roughness:1})
);
ground.rotation.x=-Math.PI/2;
ground.receiveShadow=true;
scene.add(ground);

const obstacles=[],enemies=[],keys={};
const clock=new THREE.Clock();
const raycaster=new THREE.Raycaster();

let playing=false,paused=false,hp=100,maxHp=100,ammo=30,magSize=30,kills=0,gameOver=false;
let yaw=0,pitch=0,zoneRadius=90,elapsed=0,nextShrink=30;
let cooldown=0,reloading=false,reloadTime=0;
let shake=0;

/* ================= WORLD BUILDERS ================= */
function makeBox(w,h,d,color,x,y,z){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));
  m.position.set(x,y,z);
  m.castShadow=m.receiveShadow=true;
  scene.add(m);
  return m;
}

function character(color){
  const g=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({color});
  const skin=new THREE.MeshStandardMaterial({color:0xe4b18b});
  const dark=new THREE.MeshStandardMaterial({color:0x273342});
  const gear=new THREE.MeshStandardMaterial({color:0x343a38,roughness:.92});
  const pouchMat=new THREE.MeshStandardMaterial({color:0x59604f,roughness:.95});
  const metal=new THREE.MeshStandardMaterial({color:0x171e27,metalness:.72,roughness:.32});
  const trim=new THREE.MeshStandardMaterial({color:0x46515d,metalness:.55,roughness:.38});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.43,.5,1.2,10),material);
  body.position.y=1.35;g.add(body);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(.62,.72,.14),gear);
  vest.position.set(0,1.42,-.35);vest.castShadow=true;g.add(vest);
  for(const x of [-.2,0,.2]){
    const pouch=new THREE.Mesh(new THREE.BoxGeometry(.15,.2,.09),pouchMat);
    pouch.position.set(x,1.25,-.445);pouch.castShadow=true;g.add(pouch);
  }
  const backpack=new THREE.Mesh(new THREE.BoxGeometry(.48,.66,.2),gear);
  backpack.position.set(0,1.43,.38);backpack.castShadow=true;g.add(backpack);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,16,12),skin);
  head.position.y=2.25;g.add(head);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.355,16,10,0,Math.PI*2,0,Math.PI*.48),gear);
  helmet.position.y=2.48;helmet.castShadow=true;g.add(helmet);
  for(const x of[-.25,.25]){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.25,.85,.3),dark);
    leg.position.set(x,.43,0);g.add(leg);
    const boot=new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.48),gear);
    boot.position.set(x,.12,-.07);boot.castShadow=true;g.add(boot);
  }
  function makeArm(start,end,radius=.105){
    const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(radius*.82,radius,a.distanceTo(b),8),material);
    arm.position.copy(a).add(b).multiplyScalar(.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());
    arm.castShadow=true;g.add(arm);
  }
  makeArm([.39,1.76,0],[.5,1.51,-.2]);
  makeArm([.5,1.51,-.2],[.43,1.42,-.48]);
  makeArm([-.39,1.76,0],[-.24,1.5,-.32]);
  makeArm([-.24,1.5,-.32],[.16,1.43,-.79],.09);
  const rightHand=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),skin);
  rightHand.position.set(.43,1.42,-.48);g.add(rightHand);
  const leftHand=new THREE.Mesh(new THREE.SphereGeometry(.105,10,8),skin);
  leftHand.position.set(.16,1.43,-.79);g.add(leftHand);

  const weapon=new THREE.Group();
  weapon.position.set(.34,1.48,-.42);
  const addPart=(geometry,partMaterial,position)=>{
    const part=new THREE.Mesh(geometry,partMaterial);
    part.position.set(...position);part.castShadow=true;part.receiveShadow=true;weapon.add(part);
    return part;
  };
  addPart(new THREE.BoxGeometry(.22,.2,.66),metal,[0,0,-.14]);
  addPart(new THREE.BoxGeometry(.09,.09,.62),trim,[0,.015,-.62]);
  addPart(new THREE.CylinderGeometry(.065,.07,.3,8),metal,[0,0,-.96]).rotation.x=Math.PI/2;
  addPart(new THREE.BoxGeometry(.17,.12,.25),dark,[0,0,.3]);
  addPart(new THREE.BoxGeometry(.13,.28,.16),dark,[0,-.2,-.12]).rotation.x=-.18;
  addPart(new THREE.BoxGeometry(.11,.2,.13),dark,[0,-.15,.02]).rotation.x=-.28;
  addPart(new THREE.BoxGeometry(.09,.11,.14),trim,[0,.14,-.32]);
  const weaponPivot=new THREE.Group();
  weaponPivot.add(weapon);g.add(weaponPivot);
  g.userData.weaponPivot=weaponPivot;
  return g;
}

const player=character(0x2679df);
scene.add(player);

function blocked(p,r=.6){
  return obstacles.some(o=>
    Math.abs(p.x-o.position.x)<o.userData.w/2+r&&
    Math.abs(p.z-o.position.z)<o.userData.d/2+r);
}

// Asphalt roads, sidewalks, and broken center lines create a small town grid.
const roadCoords=[-84,-42,0,42,84];
const asphaltMat=new THREE.MeshStandardMaterial({color:0x343a3d,roughness:.94});
const curbMat=new THREE.MeshStandardMaterial({color:0xaaa99f,roughness:.92});
const roadMarkMat=new THREE.MeshStandardMaterial({color:0xc7c4b8,roughness:.8});
for(const lane of roadCoords){
  const horizontal=makeBox(240,.08,8,0x343a3d,0,.025,lane);
  horizontal.material=asphaltMat;
  const vertical=makeBox(8,.08,240,0x343a3d,lane,.026,0);
  vertical.material=asphaltMat;
  for(const side of [-1,1]){
    const walkX=makeBox(240,.16,1.3,0xaaa99f,0,.09,lane+side*4.8);
    walkX.material=curbMat;
    const walkZ=makeBox(1.3,.16,240,0xaaa99f,lane+side*4.8,.09,0);
    walkZ.material=curbMat;
  }
}
const dashGeo=new THREE.BoxGeometry(3,.025,.13);
const dashMesh=new THREE.InstancedMesh(dashGeo,roadMarkMat,420);
const dashDummy=new THREE.Object3D();
let dashCount=0;
for(const lane of roadCoords){
  for(let t=-114;t<=114;t+=8){
    dashDummy.position.set(t,.078,lane);dashDummy.rotation.set(0,0,0);dashDummy.updateMatrix();dashMesh.setMatrixAt(dashCount++,dashDummy.matrix);
    dashDummy.position.set(lane,.079,t);dashDummy.rotation.y=Math.PI/2;dashDummy.updateMatrix();dashMesh.setMatrixAt(dashCount++,dashDummy.matrix);
  }
}
dashMesh.count=dashCount;dashMesh.receiveShadow=true;scene.add(dashMesh);

// Shared window geometry keeps the building detail inexpensive to render.
const windowMaterial=new THREE.MeshStandardMaterial({color:0x91b3c3,metalness:.32,roughness:.24});
const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(.95,.82,.07),windowMaterial,6000);
windows.castShadow=false;windows.receiveShadow=true;
const windowDummy=new THREE.Object3D();
let windowCount=0;
function addWindow(x,y,z,rotation=0){
  windowDummy.position.set(x,y,z);windowDummy.rotation.set(0,rotation,0);windowDummy.updateMatrix();
  windows.setMatrixAt(windowCount++,windowDummy.matrix);
}
const buildingColors=[0xaaa69c,0x938f87,0xb6b2a8,0x817f7a,0xc0b9a9,0x858e91];
const buildingMaterial=buildingColors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.9}));
const roofMat=new THREE.MeshStandardMaterial({color:0x5c6060,roughness:.94});
const doorMat=new THREE.MeshStandardMaterial({color:0x403c36,roughness:.8});

// Buildings sit inside the blocks, leaving the roads and the center spawn clear.
for(let i=0;i<32;i++){
  const w=6+Math.random()*7,d=6+Math.random()*7,h=5+Math.random()*13;
  let x,z,attempts=0;
  do{
    x=(Math.random()-.5)*200;z=(Math.random()-.5)*200;attempts++;
  }while(attempts<300&&(Math.hypot(x,z)<19||
    roadCoords.some(lane=>Math.min(Math.abs(x-lane),Math.abs(z-lane))<10)||
    blocked(new THREE.Vector3(x,0,z),Math.max(w,d)/2+1)));
  if(attempts>=300)continue;
  const building=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),buildingMaterial[Math.floor(Math.random()*buildingMaterial.length)]);
  building.position.set(x,h/2,z);building.castShadow=true;building.receiveShadow=true;
  building.userData={w,d};scene.add(building);obstacles.push(building);
  const floors=Math.max(1,Math.floor((h-1.2)/3));
  const columnsX=Math.max(1,Math.floor(w/2.2)),columnsZ=Math.max(1,Math.floor(d/2.2));
  for(let floor=0;floor<floors;floor++){
    const y=1.8+floor*2.7;
    for(let col=0;col<columnsX;col++){
      const px=x+(col-(columnsX-1)/2)*2.1;
      addWindow(px,y,z+d/2+.045);addWindow(px,y,z-d/2-.045,Math.PI);
    }
    for(let col=0;col<columnsZ;col++){
      const pz=z+(col-(columnsZ-1)/2)*2.1;
      addWindow(x+w/2+.045,y,pz,Math.PI/2);addWindow(x-w/2-.045,y,pz,-Math.PI/2);
    }
  }
  const door=makeBox(1.15,2,.12,0x403c36,x,1,z+d/2+.08);door.material=doorMat;
  const roofUnit=makeBox(1.5,.65,1.2,0x5c6060,x-w*.22,h+.32,z);roofUnit.material=roofMat;
  roofUnit.castShadow=true;
}
windows.count=windowCount;scene.add(windows);

// Broadleaf trees use clustered canopies and tapered trunks instead of cones.
const foliageMat=new THREE.MeshStandardMaterial({color:0x426747,roughness:1});
const foliage=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),foliageMat,240);
const foliageDummy=new THREE.Object3D();
let foliageCount=0;
for(let i=0;i<42;i++){
  let x,z,attempts=0;
  do{x=(Math.random()-.5)*220;z=(Math.random()-.5)*220;attempts++;}
  while(attempts<250&&(Math.hypot(x,z)<13||
    roadCoords.some(lane=>Math.min(Math.abs(x-lane),Math.abs(z-lane))<7)||
    blocked(new THREE.Vector3(x,0,z),2.5)));
  if(attempts>=250)continue;
  const height=3.8+Math.random()*1.4;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2,.42,height,9),
    new THREE.MeshStandardMaterial({color:0x66513d,roughness:1}));
  trunk.position.set(x,height/2,z);trunk.castShadow=true;trunk.receiveShadow=true;scene.add(trunk);
  const treeBlock=makeBox(1.2,height,1.2,0x66513d,x,height/2,z);
  treeBlock.visible=false;treeBlock.userData={w:1.2,d:1.2};obstacles.push(treeBlock);
  const canopyY=height+1.5;
  for(const [ox,oy,oz,sx,sy,sz] of [
    [0,0,0,1.7,1.45,1.6],[-1,.15,0,1.15,1.05,1.1],[1,.1,.1,1.2,1.1,1.15],[0,.25,1,1.1,1.05,1.05],
    [0,1.05,0,1.15,1.05,1.1]
  ]){
    foliageDummy.position.set(x+ox,canopyY+oy,z+oz);
    foliageDummy.scale.set(sx*(.85+Math.random()*.3),sy*(.85+Math.random()*.3),sz*(.85+Math.random()*.3));
    foliageDummy.rotation.set(Math.random()*.2,Math.random()*Math.PI*2,Math.random()*.2);
    foliageDummy.updateMatrix();foliage.setMatrixAt(foliageCount++,foliageDummy.matrix);
  }
}
foliage.count=foliageCount;foliage.castShadow=true;foliage.receiveShadow=true;scene.add(foliage);

// Parked cars add scale and street-level detail; their bodies block movement and shots.
const carPaints=[0x5c7181,0x8b4439,0xb7b4a7,0x384348,0x7b806d,0x293d53];
const carGlass=new THREE.MeshStandardMaterial({color:0x344c59,metalness:.3,roughness:.2});
const tireMat=new THREE.MeshStandardMaterial({color:0x202326,roughness:.95});
const wheelGeo=new THREE.CylinderGeometry(.38,.38,.22,12);
wheelGeo.rotateZ(Math.PI/2);
for(let i=0;i<11;i++){
  let alongX=Math.random()<.5;
  const lane=roadCoords[Math.floor(Math.random()*roadCoords.length)];
  let x=alongX?(Math.random()-.5)*190:lane+(Math.random()<.5?-1:1)*2.3;
  let z=alongX?lane+(Math.random()<.5?-1:1)*2.3:(Math.random()-.5)*190;
  const candidate=new THREE.Vector3(x,0,z);
  if(Math.hypot(x,z)<24||blocked(candidate,2.5)){i--;continue;}
  const car=new THREE.Group();
  const paint=new THREE.MeshStandardMaterial({color:carPaints[i%carPaints.length],metalness:.45,roughness:.38});
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.9,.62,4.25),paint);
  body.position.y=.72;body.castShadow=true;body.receiveShadow=true;car.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.58,.78,2.05),paint);
  cabin.position.set(0,1.36,-.18);cabin.castShadow=true;car.add(cabin);
  const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.48,.58,.045),carGlass);
  windshield.position.set(0,1.39,-1.22);windshield.rotation.x=-.16;car.add(windshield);
  const rearGlass=new THREE.Mesh(new THREE.BoxGeometry(1.45,.52,.04),carGlass);
  rearGlass.position.set(0,1.4,.88);rearGlass.rotation.x=.2;car.add(rearGlass);
  for(const side of [-1,1]){
    const sideGlass=new THREE.Mesh(new THREE.BoxGeometry(.035,.48,1.55),carGlass);
    sideGlass.position.set(side*.8,1.4,-.15);car.add(sideGlass);
    for(const axleZ of [-1.3,1.3]){
      const wheel=new THREE.Mesh(wheelGeo,tireMat);wheel.position.set(side*.96,.43,axleZ);wheel.castShadow=true;car.add(wheel);
    }
  }
  const lampMat=new THREE.MeshStandardMaterial({color:0xf2d7a2,emissive:0x71501b,emissiveIntensity:.35});
  const tailMat=new THREE.MeshStandardMaterial({color:0x8e3026,emissive:0x3b0905,emissiveIntensity:.3});
  for(const side of [-1,1]){
    const headlamp=new THREE.Mesh(new THREE.BoxGeometry(.35,.16,.045),lampMat);
    headlamp.position.set(side*.62,.82,-2.15);car.add(headlamp);
    const tailLamp=new THREE.Mesh(new THREE.BoxGeometry(.3,.16,.045),tailMat);
    tailLamp.position.set(side*.65,.82,2.15);car.add(tailLamp);
  }
  car.position.set(x,0,z);
  if(alongX)car.rotation.y=Math.PI/2;
  scene.add(car);
  const carBlock=makeBox(alongX?4.5:2.5,.8,alongX?2.5:4.5,0x343a3d,x,.4,z);
  carBlock.visible=false;carBlock.userData={w:alongX?4.5:2.5,d:alongX?2.5:4.5};obstacles.push(carBlock);
}

// Enemies
for(let i=0;i<12;i++){
  const bot=character(0xd63b36);
  let p;
  do{p=new THREE.Vector3((Math.random()-.5)*125,0,(Math.random()-.5)*125);}
  while(Math.hypot(p.x,p.z)<18||blocked(p));
  bot.position.copy(p);
  scene.add(bot);
  enemies.push({mesh:bot,hp:100,alive:true,attack:Math.random()*2});
}

// Zone: glowing wall cylinder + edge ring
const zoneWall=new THREE.Mesh(
  new THREE.CylinderGeometry(1,1,60,96,1,true),
  new THREE.MeshBasicMaterial({color:0x00d9ff,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false})
);
zoneWall.position.y=30;scene.add(zoneWall);
const zonePts=[];
for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;zonePts.push(new THREE.Vector3(Math.cos(a),.15,Math.sin(a)));}
const zoneLine=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(zonePts),
  new THREE.LineBasicMaterial({color:0x00d9ff}));
scene.add(zoneLine);

/* ================= SHOOT FX ================= */
const tracers=[];
const tracerGeo=new THREE.CylinderGeometry(.02,.02,1,4);
tracerGeo.translate(0,.5,0);tracerGeo.rotateX(Math.PI/2);
function tracer(from,to){
  const m=new THREE.Mesh(tracerGeo,new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,opacity:.9}));
  m.position.copy(from);
  m.lookAt(to);
  m.scale.z=from.distanceTo(to);
  scene.add(m);tracers.push({m,life:.08});
}
// muzzle flash quad attached near player gun
const flash=new THREE.Mesh(new THREE.PlaneGeometry(.6,.6),
  new THREE.MeshBasicMaterial({color:0xffd166,transparent:true,opacity:0,depthWrite:false}));
flash.position.set(.35,1.55,-1.3);
player.add(flash);
let flashTime=0;

function hitMarker(){const h=document.getElementById("hitmark");h.style.opacity=1;setTimeout(()=>h.style.opacity=0,120);}

function killFeed(text){
  const feed=document.getElementById("feed");
  const el=document.createElement("div");
  el.className="feedItem";el.textContent=text;
  feed.appendChild(el);
  setTimeout(()=>{el.style.opacity=0;setTimeout(()=>el.remove(),500);},2600);
}

function flashDamage(){
  const d=document.getElementById("dmg");
  d.style.opacity=.9;setTimeout(()=>d.style.opacity=0,180);
}

/* ================= GAME LOGIC ================= */
const $=id=>document.getElementById(id);
function updateHUD(){
  $("hp").textContent=Math.ceil(Math.max(0,hp));
  $("ammo").textContent=reloading?"…":ammo+"/"+magSize;
  $("kills").textContent=kills;
  $("left").textContent=enemies.filter(e=>e.alive).length;
  $("zone").textContent=Math.ceil(zoneRadius)+"m";
  $("zoneR").textContent=Math.ceil(zoneRadius);
  $("hpBar").firstElementChild.style.width=Math.max(0,hp/maxHp*100)+"%";
  $("ammoBar").firstElementChild.style.width=(reloading?0:ammo/magSize*100)+"%";
  $("weaponMeter").style.width=(reloading?0:ammo/magSize*100)+"%";
}

function resetGame(){
  for(const e of enemies){if(!e.alive)scene.add(e.mesh);e.mesh.visible=true;e.alive=true;e.hp=100;e.attack=Math.random()*2;}
  for(const e of enemies){
    let p;do{p=new THREE.Vector3((Math.random()-.5)*125,0,(Math.random()-.5)*125);}while(Math.hypot(p.x,p.z)<18||blocked(p));
    e.mesh.position.copy(p);
  }
  hp=100;ammo=magSize;kills=0;elapsed=0;nextShrink=30;zoneRadius=90;
  player.position.set(0,0,0);
  yaw=0;pitch=0;cooldown=0;reloading=false;gameOver=false;
  $("feed").innerHTML="";
  updateHUD();
}

function endGame(win){
  if(gameOver)return;
  gameOver=true;playing=false;
  if(document.pointerLockElement)document.exitPointerLock();
  const panel=document.querySelector(".panel");
  panel.innerHTML=
    `<h1>${win?"🏆 #1 VICTORY!":"💀 ELIMINATED"}</h1>
    <p class="sub">${win?"WINNER WINNER CHICKEN DINNER!":"BETTER LUCK NEXT DROP"}</p>
    <div id="resultStats">
      <div><b>${kills}</b>KILLS</div>
      <div><b>${win?1:Math.ceil(enemies.filter(e=>e.alive).length)}</b>${win?"PLACE":"REMAINING"}</div>
      <div><b>${Math.floor(elapsed)}s</b>SURVIVED</div>
    </div>
    <button id="again">PLAY AGAIN</button>`;
  $("screen").style.display="flex";
  $("again").onclick=startGame;
  tone(win?523:220,win?.5:.4,.15,"triangle",win?400:-100);
}

function reload(){
  if(!playing||paused||reloading||ammo===magSize)return;
  reloading=true;reloadTime=1.5;
  sfx.reload();updateHUD();
}

function shoot(){
  if(!playing||paused||cooldown>0||reloading)return;
  if(ammo<=0){sfx.empty();reload();return;}
  ammo--;cooldown=.13;
  shake=.05;flashTime=.06;flash.material.opacity=1;
  if(player.userData.weaponPivot)player.userData.weaponPivot.rotation.x=-.08;
  sfx.shoot();

  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const targets=[];
  for(const e of enemies){
    if(e.alive)e.mesh.traverse(o=>{if(o.isMesh){o.userData.enemy=e;targets.push(o);}});
  }
  const hits=raycaster.intersectObjects([...targets,...obstacles],false);
  if(hits.length){
    const hit=hits[0];
    tracer(flash.getWorldPosition(new THREE.Vector3()),hit.point);
    const enemy=hit.object.userData.enemy;
    if(enemy){
      enemy.hp-=40;
      sfx.hit();hitMarker();
      if(enemy.hp<=0){
        enemy.alive=false;scene.remove(enemy.mesh);
        kills++;sfx.kill();
        killFeed(`💀 Enemy eliminated · ${kills}/${enemies.length}`);
        if(kills===enemies.length)endGame(true);
      }
    }
  }else{
    const far=raycaster.ray.at(80,new THREE.Vector3());
    tracer(flash.getWorldPosition(new THREE.Vector3()),far);
  }
  updateHUD();
}

function startGame(){
  resetGame();
  playing=true;paused=false;
  initAudio();audio.resume?.();
  $("screen").style.display="none";
  renderer.domElement.requestPointerLock?.();
}

$("start").onclick=startGame;

document.addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="KeyR")reload();
  if(e.code==="Escape"&&playing){paused=!paused;$("pausedTag").style.display=paused?"flex":"none";}
});
document.addEventListener("keyup",e=>keys[e.code]=false);

document.addEventListener("mousemove",e=>{
  if(!playing||paused||document.pointerLockElement!==renderer.domElement)return;
  yaw-=e.movementX*.0025;
  pitch=Math.max(-.65,Math.min(.65,pitch-e.movementY*.002));
});

document.addEventListener("mousedown",e=>{
  if(e.button!==0||!playing||paused)return;
  if(document.pointerLockElement!==renderer.domElement){
    renderer.domElement.requestPointerLock?.();paused=false;$("pausedTag").style.display="none";
    return;
  }
  shoot();
});

/* ================= MINIMAP ================= */
const mm=$("minimap").getContext("2d");
function drawMinimap(){
  const S=160,R=110;
  mm.clearRect(0,0,S,S);
  const toMap=(x,z)=>[S/2+x/R*(S/2-6),S/2+z/R*(S/2-6)];
  // zone circle
  mm.strokeStyle="#00d9ff";mm.lineWidth=2;
  mm.beginPath();mm.arc(...toMap(0,0),zoneRadius/R*(S/2-6),0,7);mm.stroke();
  // obstacles
  mm.fillStyle="#7a8494";
  for(const o of obstacles){
    const[x,y]=toMap(o.position.x,o.position.z);
    mm.fillRect(x-1.5,y-1.5,3,3);
  }
  // enemies
  mm.fillStyle="#ff5252";
  for(const e of enemies){
    if(!e.alive)continue;
    const[x,y]=toMap(e.mesh.position.x,e.mesh.position.z);
    mm.beginPath();mm.arc(x,y,2.6,0,7);mm.fill();
  }
  // player
  const[px,py]=toMap(player.position.x,player.position.z);
  mm.fillStyle="#4dabf7";
  mm.beginPath();mm.arc(px,py,3.4,0,7);mm.fill();
  mm.strokeStyle="#fff";mm.lineWidth=1.5;
  mm.beginPath();mm.moveTo(px,py);
  mm.lineTo(px-Math.sin(yaw)*8,py+Math.cos(yaw)*8);mm.stroke();
}

/* ================= UPDATE ================= */
function update(dt){
  if(!playing||paused)return;

  elapsed+=dt;
  cooldown=Math.max(0,cooldown-dt);
  flash.material.opacity=Math.max(0,flash.material.opacity-dt*18);
  if(player.userData.weaponPivot)player.userData.weaponPivot.rotation.x=THREE.MathUtils.lerp(player.userData.weaponPivot.rotation.x,0,dt*12);
  shake=Math.max(0,shake-dt*.4);

  if(reloading){
    reloadTime-=dt;
    if(reloadTime<=0){reloading=false;ammo=magSize;}
    updateHUD();
  }

  // Zone shrink schedule
  const remain=Math.max(0,30-elapsed);
  $("zoneTimer").textContent=remain>0?Math.ceil(remain)+"s":"SHRINKING";
  zoneRadius=Math.max(12,90-elapsed*.28);
  zoneWall.scale.set(zoneRadius,1,zoneRadius);
  zoneLine.scale.set(zoneRadius,1,zoneRadius);

  // Player movement
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const move=new THREE.Vector3();
  if(keys.KeyW||keys.ArrowUp)move.add(forward);
  if(keys.KeyS||keys.ArrowDown)move.sub(forward);
  if(keys.KeyD)move.add(right);
  if(keys.KeyA)move.sub(right);

  if(move.lengthSq()>0){
    move.normalize();
    const sprint=keys.ShiftLeft||keys.ShiftRight;
    const speed=sprint?11.5:7;
    const next=player.position.clone().addScaledVector(move,speed*dt);
    next.x=THREE.MathUtils.clamp(next.x,-110,110);
    next.z=THREE.MathUtils.clamp(next.z,-110,110);
    if(!blocked(next))player.position.copy(next);
  }
  player.rotation.y=yaw;

  // Third-person camera (with recoil shake)
  const camOffset=new THREE.Vector3(Math.sin(yaw)*5,3.6,Math.cos(yaw)*5);
  const desired=player.position.clone().add(camOffset);
  camera.position.lerp(desired,Math.min(1,dt*12));
  if(shake>0)camera.position.add(new THREE.Vector3((Math.random()-.5)*shake,(Math.random()-.5)*shake,0));
  const look=player.position.clone();
  look.y=1.7;look.addScaledVector(forward,15);
  look.y+=Math.tan(pitch)*15;
  camera.lookAt(look);

  // Zone damage
  const pd=Math.hypot(player.position.x,player.position.z);
  if(pd>zoneRadius){
    hp-=12*dt;
    flashDamage();
  }

  // Tracer fade
  for(let i=tracers.length-1;i>=0;i--){
    tracers[i].life-=dt;
    tracers[i].m.material.opacity=Math.max(0,tracers[i].life/.08*.9);
    if(tracers[i].life<=0){scene.remove(tracers[i].m);tracers.splice(i,1);}
  }

  // Enemy AI
  let zoneHitPlayer=false;
  for(const e of enemies){
    if(!e.alive)continue;
    const delta=player.position.clone().sub(e.mesh.position);
    delta.y=0;
    const dist=delta.length();

    // Enemy zone damage
    if(Math.hypot(e.mesh.position.x,e.mesh.position.z)>zoneRadius){
      e.hp-=8*dt;
      if(e.hp<=0){
        e.alive=false;scene.remove(e.mesh);
        killFeed("☠️ Enemy died to the zone");
        if(kills===enemies.length)endGame(true);
        continue;
      }
    }

    if(dist>2.5&&dist<55){
      const next=e.mesh.position.clone().addScaledVector(delta.normalize(),dt*2.3);
      if(!blocked(next,.5))e.mesh.position.copy(next);
    }
    e.mesh.lookAt(player.position.x,e.mesh.position.y,player.position.z);
    e.mesh.rotateY(Math.PI);

    e.attack-=dt;
    if(dist<24&&e.attack<=0){
      e.attack=1.4+Math.random()*.8;
      const origin=e.mesh.position.clone().add(new THREE.Vector3(0,1.6,0));
      const target=player.position.clone().add(new THREE.Vector3(0,1.6,0));
      const direction=target.clone().sub(origin);
      const distance=direction.length();
      raycaster.set(origin,direction.normalize());
      const wallHits=raycaster.intersectObjects(obstacles,false);
      tracer(origin,origin.clone().addScaledVector(direction.clone().normalize(),Math.min(distance,24)));
      if(!wallHits.length||wallHits[0].distance>distance){
        hp-=5+Math.random()*6;
        sfx.hurt();flashDamage();zoneHitPlayer=true;
      }
    }
  }

  if(hp<=0)endGame(false);
  else if(enemies.every(e=>!e.alive))endGame(true);
  if(hp<=100)updateHUD();
  drawMinimap();
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  update(dt);
  renderer.render(scene,camera);
}
updateHUD();
drawMinimap();
animate();

window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
