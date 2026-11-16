/** Authored encounter rhythm, not a learned policy. Tick rate: 10 Hz. */
export type HuntPhase = 'watch' | 'stalk' | 'strike' | 'withdraw';
export function huntPhase(tick:number):HuntPhase {
 if(tick<180)return 'watch';
 const cycle=Math.floor((tick-180)/490),t=(tick-180)%490;
 // Alternate approach lengths so the first contact isn't a metronome.
 const approach=120+(cycle%3)*20;
 return t<approach?'stalk':t<approach+50?'strike':'withdraw';
}
/** Two hunters commit; the other pair preserves the encirclement. */
export function huntStriking(tick:number,index:number):boolean {
 return huntPhase(tick)==='strike' && index%2===Math.floor((tick-180)/490)%2;
}
