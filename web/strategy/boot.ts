import {beginLoading,failLoading} from '../ui/loading';
beginLoading('tactical');
try{const game=await import('./main.ts');await game.ready;}catch(error){failLoading(error);}
