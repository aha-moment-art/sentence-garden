import { initialState, validateState, type State } from "./engine";
import { validateAudio, type AudioClip } from "./audio";
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("sentence-garden", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("app"))
        request.result.createObjectStore("app");
      if (!request.result.objectStoreNames.contains("audio"))
        request.result.createObjectStore("audio");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("请关闭其他打开的拾句标签页后重试。"));
  });
  return dbPromise;
}
export async function readState(): Promise<State> {
  const db = await database();
  const store = db.transaction("app").objectStore("app");
  const get = (key: string) => new Promise<unknown>((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const [value, session] = await Promise.all([get("state"), get("session")]);
  if (!value) return initialState();
  const restored = session && typeof session === 'object' && 'value' in session
    ? {...value as State, session:session.value} : value;
  return validateState(restored);
}
let queue = Promise.resolve();
let lastWritten: State | undefined;
export async function readAudio(): Promise<AudioClip[]> {
  const db = await database();
  const value = await new Promise<unknown>((resolve, reject) => {
    const req = db.transaction("audio").objectStore("audio").get("clips");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return validateAudio(value);
}
export async function replaceAudio(clips: AudioClip[]): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("audio", "readwrite");
    tx.objectStore("audio").put(clips, "clips");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function restoreAll(state:State,clips:AudioClip[]):Promise<void>{
  await queue.catch(()=>{});
  const db=await database();
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['app','audio'],'readwrite');tx.objectStore('app').put(state,'state');tx.objectStore('app').put({value:state.session},'session');tx.objectStore('audio').put(clips,'clips');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  lastWritten = state;
}
export function writeState(state: State): Promise<void> {
  const run = async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("app", "readwrite");
      // Typing changes only the small session snapshot, not the entire library.
      const changed = !lastWritten || ['decks','reviews','settings','history'].some(key =>
        state[key as keyof State] !== lastWritten![key as keyof State]);
      if (changed) tx.objectStore("app").put({...state, session:null}, "state");
      tx.objectStore("app").put({value:state.session}, "session");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    lastWritten = state;
  };
  queue = queue.catch(() => {}).then(run);
  return queue;
}
