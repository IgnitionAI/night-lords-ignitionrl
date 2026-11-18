import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, T_IDLE, T_CFG } from '../src/sim';
import { freshLook, applyLookDelta, fpsPose } from '../web/camera/fps';
const duel = () => {
  const w = newWorld(12, {x:4,y:12,facing:0}, {fps:true});
  w.nls.forEach((n,i)=>{n.alive=i===0;n.x=11;n.y=12;n.facing=Math.PI;n.belief.valid=true;n.belief.x=4;n.belief.y=12;});
  return w;
};
test('souris droite et strafe droit suivent le même repère écran',()=>{
 const l=freshLook();applyLookDelta(l,100,0);assert.ok(l.yaw>0);
 const w=duel();for(let i=0;i<4;i++)step(w,{...T_IDLE,strafe:1},[0]);
 assert.ok(w.t.y>12);assert.equal(w.t.facing,0);assert.equal(w.t.x,4);
 const old=newWorld(12,{x:4,y:12,facing:0});step(old,{...T_IDLE,strafe:1},[0,0,0,0]);assert.equal(old.t.y,12);
});
test('diagonale plafonnée et demi-tour sans délai de rotation',()=>{
 const w=duel();for(let i=0;i<5;i++)step(w,{...T_IDLE,fwd:1,strafe:1},[0]);
 assert.ok(Math.hypot(w.t.vx,w.t.vy)<=5.001);
 step(w,{...T_IDLE,aimYaw:Math.PI},[0]);assert.ok(Math.abs(w.t.facing-Math.PI)<1e-6);
});
test('rafale alignée tue en trois impacts, viser trop haut manque',()=>{
 const w=duel();for(let i=0;i<3;i++)step(w,{...T_IDLE,bolt:true,aimYaw:0,aimPitch:-0.06},[0]);
 assert.equal(w.nls[0].alive,false);assert.equal(w.t.ammo,27);
 const miss=duel();for(let i=0;i<3;i++)step(miss,{...T_IDLE,bolt:true,aimPitch:.7},[0]);assert.equal(miss.nls[0].alive,true);
});
test('rechargement manuel remplit le chargeur sans tir pendant le cycle',()=>{
 const w=duel();w.t.ammo=12;step(w,{...T_IDLE,reload:true},[0]);
 for(let i=0;i<T_CFG.boltReload-1;i++)step(w,{...T_IDLE,bolt:true},[0]);
 assert.equal(w.t.ammo,30);assert.equal(w.t.reloadLeft,0);
});
test('tir ennemi annoncé : une esquive latérale évite les dégâts',()=>{
 const w=duel();for(let i=0;i<11;i++)step(w,T_IDLE,[0]);assert.equal(w.nls[0].shotTicks,8);
 for(let i=0;i<8;i++)step(w,{...T_IDLE,strafe:1},[0]);assert.equal(w.t.hp,30);
 const still=duel();for(let i=0;i<19;i++)step(still,T_IDLE,[0]);assert.equal(still.t.hp,28);
});
test('gantelet tue au contact après sa préparation',()=>{
 const w=duel();w.nls[0].x=5.5;step(w,{...T_IDLE,fist:true},[0]);
 for(let i=0;i<T_CFG.fistChargeTicks;i++)step(w,T_IDLE,[0]);assert.equal(w.nls[0].alive,false);
});
