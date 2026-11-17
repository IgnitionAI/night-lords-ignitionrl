// One-off migration helper: explicit rendering boundaries, no mutation observer.
import {parse} from '@babel/parser';
import {readFileSync,writeFileSync} from 'node:fs';
for(const file of ['web/strategy/main.ts','web/main.ts']){
 let s=readFileSync(file,'utf8');if(s.includes('setHTML,setText,localize'))continue;const edits=[];
 const ast=parse(s,{sourceType:'module',plugins:['typescript']});
 function walk(n){if(!n||typeof n!=='object')return;
  if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&['innerHTML','textContent','title'].includes(n.left.property.name)&&['=','+='].includes(n.operator)){
   const obj=s.slice(n.left.object.start,n.left.object.end),right=s.slice(n.right.start,n.right.end),prop=n.left.property.name;
   edits.push({start:n.start,end:n.end,value:prop==='title'?`${obj}.title=t(${right})`:`${prop==='innerHTML'?'setHTML':'setText'}(${obj}, ${right}${n.operator==='+='?', true':''})`});return;
  }
  for(const [k,v]of Object.entries(n))if(k!=='loc')if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
 }
 walk(ast);
 for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.value+s.slice(e.end);
 const path=file.includes('/strategy/')?'../i18n':'./i18n';
 s=`import {t,setHTML,setText,localize,languagePicker,onLocaleChange,getLocale} from '${path}';\n`+s;
 writeFileSync(file,s);
 console.log(file,edits.length);
}
