import {test,expect} from '@playwright/test';

test('each keystroke paints immediately, explains mistakes and keeps click/arrow cursors aligned', async ({page})=>{
  await page.addInitScript(()=>{
    (window as any).__paintChecks=[];
    document.addEventListener('input',e=>{
      if((e.target as HTMLElement).id!=='typing-input')return;
      requestAnimationFrame(()=>{
        const value=(document.querySelector('#typing-input') as HTMLTextAreaElement)?.value;
        (window as any).__paintChecks.push({value,typed:document.querySelectorAll('.target-sentence .typed').length,wrong:document.querySelectorAll('.target-sentence .mistyped').length});
      });
    });
  });
  await page.goto('./');
  const input=page.locator('#typing-input');
  await input.pressSequentially('Sma');
  await input.pressSequentially('x');
  await expect(page.locator('.letter.mistyped')).toHaveAttribute('data-entered','x');
  await expect(page.locator('.keystroke-feedback')).toContainText('输入了「x」，这里应为「l」');
  await expect.poll(()=>page.evaluate(()=>(window as any).__paintChecks.at(-1))).toEqual({value:'Smax',typed:3,wrong:1});
  const style=await page.locator('.letter.mistyped').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,transition:getComputedStyle(el).transitionDuration}));
  expect(style.color).toBe('rgb(180, 35, 50)'); expect(style.background).toBe('rgb(255, 217, 223)'); expect(style.transition).toBe('0s');
  await input.press('Backspace');
  await expect(page.locator('.letter.mistyped')).toHaveCount(0);
  await expect(page.locator('.keystroke-feedback')).toContainText('已输入的字符正确');
  // Keyboard End still resumes at the visible end after mouse positioning.
  await input.press('End');
  await input.pressSequentially('ll');
  await expect(input).toHaveValue('Small');
  await expect(page.locator('.letter.cursor')).toHaveText(' ');
  await expect(page.locator('.letter.cursor')).toHaveClass(/space/);
  await input.press('ArrowLeft');
  await expect(page.locator('.letter.cursor')).toHaveText('l');
  expect(await input.evaluate(el=>(el as HTMLTextAreaElement).selectionStart)).toBe(4);
  await input.press('Backspace');
  await expect(input).toHaveValue('Smal');
  await expect(page.locator('.letter.cursor')).toHaveText('l');
  await input.pressSequentially('l');
  await input.press('End');
  await input.pressSequentially('s');
  await expect(page.locator('.keystroke-feedback')).toContainText('这里应为「空格」');
});

test('keystrokes save only session data and restore the last edit',async({page})=>{
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.put;
    (window as any).__writes=[];
    IDBObjectStore.prototype.put=function(value,key){
      (window as any).__writes.push(String(key));
      return original.call(this,value,key);
    };
  });
  await page.goto('./');
  await expect(page.getByText('练习位置已保存',{exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__writes=[]);
  await page.locator('#typing-input').pressSequentially('Small steps');
  await expect(page.getByText('练习位置已保存',{exact:true})).toBeVisible();
  const keys=await page.evaluate(()=>(window as any).__writes as string[]);
  expect(keys.length).toBeGreaterThan(0); expect(keys.every(k=>k==='session')).toBe(true);
  await page.reload();
  await expect(page.locator('#typing-input')).toHaveValue('Small steps');
  await expect(page.locator('.target-sentence .typed')).toHaveCount(11);
});

test('upgrades an older single-snapshot record without losing typing progress',async({page})=>{
  await page.goto('./');
  await expect(page.getByText('练习位置已保存',{exact:true})).toBeVisible();
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('sentence-garden',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('app','readwrite'),store=tx.objectStore('app');
      const state=store.get('state'),session=store.get('session');
      let ready=0;
      const combine=()=>{if(++ready!==2)return;store.put({...state.result,session:{...session.result.value,input:'Small'}},'state');store.delete('session');};
      state.onsuccess=combine;session.onsuccess=combine;
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await page.reload();
  await expect(page.locator('#typing-input')).toHaveValue('Small');
  await page.locator('#typing-input').pressSequentially(' steps');
  await expect(page.getByText('练习位置已保存',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('#typing-input')).toHaveValue('Small steps');
});
