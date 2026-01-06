
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { KernelEvent } from '../types';

interface ZenBFileSystem extends DBSchema {
  'event-log': {
    key: [number, number]; // [timestamp, seq]
    value: KernelEvent & { seq: number };
    indexes: { 'timestamp': number, 'type': string };
  };
  'meta': {
    key: string;
    value: any;
  };
}

class BioFileSystem {
  private dbPromise: Promise<IDBPDatabase<ZenBFileSystem>>;
  private isSupported: boolean;
  private health = { ok: true, supported: true as boolean, lastError: undefined as string|undefined };
  private listeners = new Set<(h:any)=>void>();

  constructor() {
    this.isSupported = typeof window !== 'undefined' && 'indexedDB' in window;
    
    if (this.isSupported) {
      this.dbPromise = openDB<ZenBFileSystem>('zenb-bio-os', 2, { // Version bumped
        upgrade(db, oldVersion, newVersion, transaction) {
          if (oldVersion < 1) {
             // Initial creation
             const eventStore = db.createObjectStore('event-log', { keyPath: ['timestamp', 'seq'] });
             eventStore.createIndex('timestamp', 'timestamp');
             eventStore.createIndex('type', 'type');
             db.createObjectStore('meta');
          } else {
             // Migration logic if needed, for now we assume fresh start or compatible
             if (!db.objectStoreNames.contains('meta')) {
                 db.createObjectStore('meta');
             }
             // Note: Changing keyPath of existing store is complex in IDB, 
             // for this update we assume users can clear data or we handle migration loosely.
             // In a real prod environment, we'd do a cursor migration.
          }
        },
      }).catch(e => {
          this.setHealth({ ok: false, lastError: String(e) });
          throw e;
      });
    } else {
      this.health.supported = false;
      this.dbPromise = Promise.reject('IndexedDB not supported');
    }
  }

  public subscribeHealth(fn:(h:any)=>void){ this.listeners.add(fn); return ()=>this.listeners.delete(fn); }
  
  public getHealth(){ return this.health; }
  
  private setHealth(p:Partial<typeof this.health>){ Object.assign(this.health,p); this.listeners.forEach(l=>l(this.health)); }

  public async getMeta<T=any>(k:string):Promise<T|undefined>{
    if(!this.isSupported) return undefined;
    try{ const db=await this.dbPromise; return await db.get('meta',k); }
    catch(e:any){ this.setHealth({ok:false,lastError:String(e)}); return undefined; }
  }

  public async setMeta(k:string,v:any){ if(!this.isSupported) return;
    try{ const db=await this.dbPromise; await db.put('meta',v,k); }
    catch(e:any){ this.setHealth({ok:false,lastError:String(e)}); }
  }

  /**
   * Write a kernel event to the permanent filesystem
   */
  public async writeEvent(event: KernelEvent): Promise<void> {
    if (!this.isSupported) return;
    try {
      const db = await this.dbPromise;
      // Get next sequence number to handle multiple events at same ms
      const seq = (await this.getMeta<number>('eventSeq')) ?? 0;
      await db.put('event-log', { ...event, seq });
      await this.setMeta('eventSeq', seq+1);
    } catch (err: any) {
      this.setHealth({ok:false,lastError:String(err)});
    }
  }

  /**
   * Retrieve the full session log for "Time Travel" debugging
   */
  public async getSessionLog(start: number, end: number): Promise<KernelEvent[]> {
    if (!this.isSupported) return [];
    try {
      const db = await this.dbPromise;
      const range = IDBKeyRange.bound([start, 0], [end, Infinity]);
      const results = await db.getAll('event-log', range);
      return results.sort((a,b) => a.timestamp - b.timestamp || a.seq - b.seq);
    } catch (err: any) {
      this.setHealth({ok:false,lastError:String(err)});
      return [];
    }
  }

  /**
   * Purge old logs to prevent storage overflow (GC)
   */
  public async garbageCollect(retentionMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.isSupported) return;
    const cutoff = Date.now() - retentionMs;
    try {
        const db = await this.dbPromise;
        const range = IDBKeyRange.upperBound([cutoff, Infinity]);
        const tx = db.transaction('event-log', 'readwrite');
        const store = tx.objectStore('event-log');
        
        let cursor = await store.openCursor(range);
        while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
        }
        await tx.done;
    } catch (err: any) {
        this.setHealth({ok:false,lastError:String(err)});
    }
  }
}

export const bioFS = new BioFileSystem();
