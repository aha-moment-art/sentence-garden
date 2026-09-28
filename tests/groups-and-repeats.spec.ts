import {test, expect, type Page} from '@playwright/test';
import {initialState, makeSession, type State} from '../src/engine';

async function restore(page: Page, state: State) {
  await page.locator('input[type=file]').setInputFiles({name:'test-records.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(state))});
  await page.getByRole('button',{name:'确认替换并恢复'}).click();
  await expect(page.getByText('记录已恢复。',{exact:true})).toBeVisible();
}

test('personal groups use 20,20,5 entries with correct offsets and reviews start with 20',async({page})=>{
  await page.goto('./');
  const state=initialState();
  state.decks=[{id:'forty-five',name:'Forty five sentences',sentences:Array.from({length:45},(_,i)=>({id:`item-${i}`,en:`Practice sentence number ${i+1}.`,zh:''}))}];
  state.session=makeSession(state.decks[0].name,state.decks[0].sentences.slice(0,20),false,false,'typing');
  await restore(page,state);
  await page.getByRole('button',{name:'我的句库',exact:true}).click();
  await expect(page.getByLabel('练习范围').locator('option')).toHaveText(['1–20 句','21–40 句','41–45 句']);
  await page.getByLabel('练习范围').selectOption('1');
  await page.locator('.library-heading').getByRole('button',{name:'开始练习',exact:true}).click();
  await expect(page.locator('.target-sentence')).toHaveText('Practice sentence number 21.');
  await expect(page.locator('.sentence-count')).toContainText('/ 20');
  await page.getByRole('button',{name:'我的句库',exact:true}).click();
  await page.getByLabel('练习范围').selectOption('2');
  await page.locator('.library-heading').getByRole('button',{name:'开始练习',exact:true}).click();
  await expect(page.locator('.target-sentence')).toHaveText('Practice sentence number 41.');
  await expect(page.locator('.sentence-count')).toContainText('/ 5');
  for(const s of state.decks[0].sentences) state.reviews[s.id]={step:0,due:'2020-01-01T00:00:00Z',lastPracticed:'2020-01-01T00:00:00Z',needsReview:true};
  state.session=null;
  await restore(page,state);
  await page.getByRole('button',{name:'待复习',exact:true}).click();
  await page.getByRole('button',{name:'开始复习（前 20 句）'}).click();
  await expect(page.locator('.sentence-count')).toContainText('/ 20');
});

test('catalog starts 20 entries and the second group begins at entry 21',async({page})=>{
  await page.goto('./');
  await page.getByRole('button',{name:'项目句库',exact:true}).click();
  await page.locator('.project-card').filter({hasText:'British Ear'}).click();
  await expect(page.locator('.catalog-row').first()).toBeVisible();
  await page.getByLabel('练习组编号').fill('2');
  await page.getByRole('button',{name:'练这 20 条',exact:true}).click();
  await page.getByRole('button',{name:'确认',exact:true}).click();
  await expect(page.locator('.sentence-count')).toContainText('/ 20');
  const download=page.waitForEvent('download');
  await page.locator('footer').getByRole('button',{name:'导出记录'}).click();
  const stream=await (await download).createReadStream(), chunks:Buffer[]=[];
  for await(const chunk of stream!) chunks.push(chunk);
  const data=JSON.parse(Buffer.concat(chunks).toString());
  expect(data.session.tasks).toHaveLength(20);
  const collection=await (await page.request.get(new URL('library/index.json',page.url()).toString())).json();
  const selected=collection.collections.find((c:any)=>data.session.name.includes(c.name));
  const entries=await (await page.request.get(new URL(selected.file,page.url()).toString())).json();
  expect(data.session.tasks.map((t:any)=>t.sentence.id)).toEqual(entries.sentences.slice(20,40).map((s:any)=>s.id));
});

test('repeat setting persists, real MP3 repeats exactly 3 times and stop/sentence changes cancel old loops',async({page})=>{
  await page.addInitScript(()=>{
    const Original=window.Audio;
    (window as any).__audios=[];
    window.Audio=class extends Original {
      plays=0;
      constructor(src?:string){super(src);this.muted=true;(window as any).__audios.push(this);}
      play(){this.plays++;return super.play();}
    };
  });
  await page.goto('./');
  await page.getByRole('button',{name:'练习设置'}).click();
  await page.getByLabel('每句朗读次数',{exact:true}).fill('3');
  await page.getByLabel('朗读速度',{exact:true}).fill('1.5');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await expect(page.getByText('练习位置已保存',{exact:true})).toBeVisible();
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>(window as any).__audios.at(-1)?.plays)).toBe(1);
  await page.locator('#typing-input').pressSequentially('S');
  await expect.poll(()=>page.evaluate(()=>(window as any).__audios.at(-1)?.plays),{timeout:30000}).toBe(3);
  await expect(page.getByRole('button',{name:'朗读',exact:true})).toBeVisible({timeout:15000});
  expect(await page.evaluate(()=>(window as any).__audios.at(-1).plays)).toBe(3);
  await page.getByRole('button',{name:'朗读',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__audios.at(-1)?.plays),{timeout:30000}).toBe(3);
  await expect(page.getByRole('button',{name:'朗读',exact:true})).toBeVisible({timeout:15000});
  expect(await page.evaluate(()=>(window as any).__audios.at(-1).plays)).toBe(3);
  await page.getByRole('button',{name:'朗读',exact:true}).click();
  await page.getByRole('button',{name:'停止',exact:true}).click();
  await page.evaluate(()=>{const a=(window as any).__audios.at(-1);a.dispatchEvent(new Event('ended'));});
  expect(await page.evaluate(()=>(window as any).__audios.at(-1).plays)).toBe(1);
  await page.getByRole('button',{name:'朗读',exact:true}).click();
  await page.locator('#typing-input').fill('Small steps lead to meaningful progress.');
  await expect.poll(()=>page.evaluate(()=>(window as any).__audios.at(-1)?.src??'')).toContain('sample-2.mp3');
  await page.evaluate(()=>{const a=(window as any).__audios.at(-2);a.dispatchEvent(new Event('ended'));});
  expect(await page.evaluate(()=>(window as any).__audios.at(-2).plays)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__audios.at(-2).paused)).toBe(true);
  await page.getByRole('button',{name:'练习设置'}).click();
  await expect(page.getByLabel('每句朗读次数',{exact:true})).toHaveValue('3');
});

test('device speech follows the repeat setting and ignores cancelled completions',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).__spoken=[];
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class {text:string;constructor(text:string){this.text=text;}}});
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'en-GB'}],addEventListener:()=>{},removeEventListener:()=>{},cancel:()=>{},speak:(u:any)=>(window as any).__spoken.push(u)}});
  });
  await page.goto('./');
  const state=initialState();
  state.settings.readRepeats=3;
  state.decks=[{id:'device',name:'Device test',sentences:[{id:'device-1',en:'A unique sentence for device speech repetition.',zh:''}]}];
  state.session=makeSession(state.decks[0].name,state.decks[0].sentences,false,false,'typing');
  await restore(page,state);
  await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(1);
  await page.evaluate(()=>(window as any).__spoken.at(-1).onend());
  await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(2);
  await page.evaluate(()=>(window as any).__spoken.at(-1).onend());
  await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(3);
  await page.evaluate(()=>(window as any).__spoken.at(-1).onend());
  await expect(page.getByRole('button',{name:'设备朗读',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'设备朗读',exact:true}).click();
  await page.getByRole('button',{name:'停止',exact:true}).click();
  await page.evaluate(()=>(window as any).__spoken.at(-1).onend());
  expect(await page.evaluate(()=>(window as any).__spoken.length)).toBe(4);
});

test('change group opens the project library without a selection modal',async({page})=>{
  await page.goto('./');
  await page.getByRole('button',{name:'换一组句子'}).click();
  await expect(page.locator('.project-card').filter({hasText:'British Ear'})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('选一组，慢慢记住',{exact:true})).toHaveCount(0);
});
