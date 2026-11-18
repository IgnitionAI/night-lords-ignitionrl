import {parse} from '@babel/parser';
import {readFileSync,writeFileSync} from 'node:fs';
import {t} from '../web/i18n';
const files=['web/strategy/main.ts','web/main.ts','web/camera/fps-hud.ts','src/match.ts','src/mission.ts','src/recorder.ts','src/strategy/tactics.ts','src/strategy/engine.ts','src/strategy/boarding-agents.ts'];
const found=new Set<string>();
for(const file of files){
 const s=readFileSync(file,'utf8'),ast=parse(s,{sourceType:'module',plugins:['typescript']});
 function walk(n:any){if(!n||typeof n!=='object')return;
  if(n.type==='StringLiteral'||n.type==='TemplateElement'){
   const source=n.type==='StringLiteral'?n.value:n.value.cooked;
   for(const part of source.split(/<[^>]*>/g)){
    const en=t(part,'en');if(/[àâçéèêëîïôùûüœ]/i.test(en)&&!/^#[0-9a-f]/i.test(en))found.add(`${file}:${n.loc.start.line} ${JSON.stringify(part)} => ${JSON.stringify(en)}`);
   }
  }
  for(const [k,v]of Object.entries(n))if(!['loc','comments','leadingComments','trailingComments'].includes(k))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
 }walk(ast);
}
writeFileSync('docs/i18n/source-audit.txt',[...found].join('\n'));console.log([...found].join('\n'));
