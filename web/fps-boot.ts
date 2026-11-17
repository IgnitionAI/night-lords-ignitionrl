import {beginLoading,failLoading} from './ui/loading';
beginLoading('fps');
try{await import('./main');}catch(error){failLoading(error);}
