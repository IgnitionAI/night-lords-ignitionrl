import {test,expect} from 'bun:test';
import {LoadTracker} from '../web/ui/load-state';
test('does not reveal the scene after files alone or before GPU setup',()=>{
 const tracker=new LoadTracker(['module','models','scene']);tracker.file();tracker.file();tracker.complete('module');tracker.complete('models');
 expect(tracker.snapshot()).toMatchObject({phase:'loading',completed:2,files:2,total:3});
 tracker.complete('unknown');tracker.complete('models');expect(tracker.snapshot().completed).toBe(2);
 tracker.complete('scene');expect(tracker.snapshot().phase).toBe('ready');
});
test('a failed required resource stays failed as other downloads complete',()=>{
 const tracker=new LoadTracker(['models','scene']);tracker.complete('models');tracker.fail();tracker.file();tracker.complete('scene');
 expect(tracker.snapshot()).toMatchObject({phase:'error',completed:1});
});
