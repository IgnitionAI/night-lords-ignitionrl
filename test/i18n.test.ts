import {test,expect} from 'bun:test';
import {initialLocale,t} from '../web/i18n';
import messages from '../web/i18n/messages.json';
import {MISSIONS,CARDS,ROLES} from '../src/strategy/tactics';

test('remembered language wins; French regional browsers use French; other browsers use English',()=>{
 expect(initialLocale('fr',['en-US'])).toBe('fr');expect(initialLocale('en',['fr-CA'])).toBe('en');
 expect(initialLocale(null,['fr-CA'])).toBe('fr');expect(initialLocale(null,['en-GB'])).toBe('en');expect(initialLocale('bad',['de-DE'])).toBe('en');
});
test('all mission, card and role descriptions have explicit English translations',()=>{
 const keys=new Set(messages.map(([fr])=>fr));
 for(const m of Object.values(MISSIONS))for(const s of [m.name,m.brief])expect(keys.has(s)).toBe(true);
 for(const c of Object.values(CARDS))for(const s of [c.name,c.description])if(s!=='Sabotage')expect(keys.has(s)).toBe(true);
 for(const r of Object.values(ROLES))for(const s of [r.name,r.ability,r.description])expect(keys.has(s)).toBe(true);
});
test('historical reports retain facts, names, coordinates and numbers',()=>{
 expect(t('VRAK touche VAEL (−4).','en')).toBe('VRAK hits VAEL (−4).');
 expect(t('6 contact(s) connu(s) ; 4 PC disponibles ; posture pression coordonnée.','en')).toBe('6 known contact(s) ; 4 CP available ; stance coordinated pressure.');
 expect(t('Relais de commandement sécurisé par les Terminators.','en')).toBe('Command relay secured by the Terminators.');
 expect(t('CAEL stabilise TOR (+3 armure).','en')).toBe('CAEL stabilises TOR (+3 armour).');
 expect(t('TOUR 01 / 18','fr')).toBe('TOUR 01 / 18');
 expect(t('VAEL n0 t0 D1 3,10 boarding-v1','en')).toBe('VAEL n0 t0 D1 3,10 boarding-v1');
});
test('catalog has no ambiguous keys or empty translations',()=>{
 expect(new Set(messages.map(([fr])=>fr)).size).toBe(messages.length);
 for(const [fr,en] of messages){expect(fr.trim().length).toBeGreaterThan(0);expect(en.trim().length).toBeGreaterThan(0);}
});
