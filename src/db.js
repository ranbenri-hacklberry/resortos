import Dexie from 'dexie';
export const db = new Dexie('MLXStudioDB');
db.version(1).stores({
  sessions: 'id, phone',
  designerState: 'id, objects, businessId'
});
