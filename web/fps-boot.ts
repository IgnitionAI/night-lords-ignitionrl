import {beginLoading,failLoading} from './ui/loading';
beginLoading('fps');
try{await import('./main.ts');}catch(error){failLoading(error);}
