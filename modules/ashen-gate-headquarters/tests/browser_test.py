"""Chromium smoke harness for UI event wiring. Uses fake Foundry objects, NOT a live Foundry runtime test."""
import asyncio
import re
import base64
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-web-security','--allow-file-access-from-files'])
        page=await browser.new_page(viewport={'width':1400,'height':960});page.set_default_timeout(2500)
        errors=[]
        page.on('pageerror',lambda err:(errors.append(str(err)),print('PAGE ERROR',err)))
        page.on('console',lambda msg:print('CONSOLE',msg.text))
        here=Path(__file__).parent
        original=(here/'browser-harness.html').read_text()
        stub=re.search(r'<script type="module">(.*?)</script>',original,re.S).group(1)
        stub=stub.replace('class ApplicationV2 {','class FakeApplicationV2 {').replace('api:{ApplicationV2,','api:{ApplicationV2:FakeApplicationV2,')
        main=(here.parent/'js/main.mjs').read_text()
        # Inline the entry module but preserve genuine ES imports as data URLs.
        # This checks module import wiring, rather than concat-rewriting globals.
        hireling_url='data:text/javascript;base64,'+base64.b64encode((here.parent/'js/hirelings.mjs').read_bytes()).decode('ascii')
        logic_source=(here.parent/'js/logic.mjs').read_text().replace("from './hirelings.mjs'",f"from '{hireling_url}'")
        logic_url='data:text/javascript;base64,'+base64.b64encode(logic_source.encode()).decode('ascii')
        for filename in ('logic.mjs','access.mjs','private-state.mjs','player-intent-bridge.mjs',
                         'hq-authoritative-writer.mjs','staffing-reconciliation.mjs',
                         'source-resolver-adapter.mjs','native-hireling-definitions.mjs','ag-launchers.mjs'):
            source=(here.parent/'js'/filename).read_text()
            source=source.replace("from './hirelings.mjs'",f"from '{hireling_url}'")
            source=source.replace("from './logic.mjs'",f"from '{logic_url}'")
            url='data:text/javascript;base64,'+base64.b64encode(source.encode('utf-8')).decode('ascii')
            main=main.replace(f"from './{filename}'",f"from '{url}'")
        main=main.replace("from './hirelings.mjs'",f"from '{hireling_url}'")
        combined=stub.replace("await import('../js/main.mjs');",main)
        css=(here.parent/'styles/headquarters.css').read_text()
        await page.set_content('<html><head><style>.fake-window{width:1200px;height:800px;background:#171f29}'+css+'</style></head><body><script type="module">'+combined+'</script></body></html>')
        await page.wait_for_function('window.fakeReady',timeout=3500)
        assert await page.evaluate('window.apiBeforeReady') is True
        assert await page.evaluate('window.menuBeforeReady') is True
        assert await page.evaluate('typeof globalThis.JournalEntry') == 'undefined'

        # Verify the shared Ashen Gate launcher group: top of the Actors header, stable order, no duplicates.
        await page.evaluate('''() => {
          const directory=document.createElement('section');directory.id='actors';
          directory.innerHTML='<header class="directory-header"><div class="header-actions">Create</div><div class="header-search">Actor search</div></header><div class="directory-list">Actor list</div>';
          document.body.appendChild(directory);
          fireHook('renderActorDirectory',{tabName:'actors',element:directory},directory);
          const group=directory.querySelector('#ashen-gate-launchers');
          if(!group || group.parentElement.className!=='directory-header' || group.parentElement.firstElementChild!==group)throw Error('Launcher group not at top of Actors header');
          const synthetic=document.createElement('button');synthetic.dataset.agLauncher='ashen-gate-utilities';synthetic.className='ag-launcher';synthetic.textContent='Utilities';group.prepend(synthetic);
          fireHook('renderActorDirectory',{tabName:'actors',element:directory},directory);
          fireHook('renderActorDirectory',{tabName:'actors',element:directory},directory);
        }''')
        assert await page.locator('[data-ag-launcher="ashen-gate-headquarters"]').count()==1
        assert await page.locator('#ashen-gate-launchers > button').all_text_contents()==['Headquarters','Utilities']
        assert await page.locator('[data-ag-launcher="ashen-gate-headquarters"]').evaluate('(el)=>el.getBoundingClientRect().width')==await page.locator('[data-ag-launcher="ashen-gate-utilities"]').evaluate('(el)=>el.getBoundingClientRect().width')
        await page.locator('[data-ag-launcher="ashen-gate-headquarters"]').click()
        assert await page.locator('text=Guildhall not activated').count()==1
        await page.locator('button[data-action="help"]').first.click()
        assert await page.locator('text=Headquarters — Help').count()==1
        await page.locator('button[data-action="help"]').first.click()
        assert await page.locator('text=Guildhall not activated').count()==1
        await page.locator('[data-aghq-form="activate"] button[type=submit]').click()
        await page.wait_for_function('getState().active')
        await page.locator('button[data-action="help"]').first.click()
        assert await page.locator('text=Headquarters — Help').count()==1
        await page.locator('button[data-action="help"]').first.click()
        await page.locator('button[data-tab="manage"]').click()
        await page.locator('button[data-action="load-demo"]').click()
        await page.wait_for_function('getState().catalog.length === 3')
        await page.locator('button[data-action="unlock-facility"][data-id="FAC-DEMO-FORGE"]').click()
        await page.wait_for_function('getState().core.guild_state.unlocked_facility_refs.includes("FAC-DEMO-FORGE")')
        await page.locator('button[data-action="acquire"][data-id="FAC-DEMO-FORGE"]').click()
        await page.wait_for_function('getState().inventory.length===1',timeout=4500)
        await page.locator('[data-catalog-search]').fill('demo forge')
        assert await page.locator('.aghq-catalogrow:visible').count()==1
        await page.locator('[data-catalog-search]').fill('')
        assert await page.locator('.aghq-catalogrow:visible').count()==3
        await page.screenshot(path=str(here.parent/'tests'/'ui-gm-catalog-fake.png'),full_page=True)
        await page.locator('button[data-tab="builder"]').click()
        await page.locator('button[data-action="take-lock"]').click()
        await page.wait_for_function('getState().editor_lease?.user_id === "gm1"')
        await page.evaluate('''() => {
          const from=document.querySelector('[data-copy]');
          const board=document.querySelector('[data-board="common"]');
          const dt=new DataTransfer();
          from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,clientX:0,clientY:0,dataTransfer:dt}));
          const b=board.getBoundingClientRect();
          board.dispatchEvent(new DragEvent('drop',{bubbles:true,clientX:b.left+40,clientY:b.top+40,dataTransfer:dt}));
        }''')
        await page.wait_for_function('getState().core.headquarters_states[0].installations.length===1',timeout=4500)
        assert await page.locator('[data-installed]').count()==1
        await page.locator('[data-installed]').click()
        await page.locator('button[data-action="rotate"]').click()
        await page.wait_for_function('getState().core.headquarters_states[0].installations[0].placement.rotation===90')
        assert await page.evaluate('getPrivatePointer().startsWith("vault")')
        assert await page.evaluate('getRawState().personnel.hirelings.length')==0
        await page.screenshot(path=str(here.parent/'tests'/'ui-builder-fake.png'),full_page=True)
        # Des v1 roster integration: mocked Manager-imported native HIRE/HPERK.
        await page.evaluate("""() => {
          const mk=(id,type,record)=>({name:record.name,uuid:`Item.${id}`,img:'icons/svg/mystery-man.svg',
            flags:{'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility:'player',scope:'setting_adapter',record:{...record,entity_type:type,scope:'setting_adapter'}}}},
            testUserPermission:()=>true});
          game.items={contents:[
            mk('HIRE-TEST-001','Hireling',{id:'HIRE-TEST-001',name:'Test Smith',role:'Blacksmith',capabilities:[{key:'smith'}],refs:[{relation:'has_hireling_perk',target_id:'HPERK-TEST-001',mode:'optional'}]}),
            mk('HPERK-TEST-001','HirelingPerk',{id:'HPERK-TEST-001',name:'Working Hands',contexts:['headquarters'],conditions:{requires_working:true,requires_presence:true},stacking:{overlap_group:'workshop'}})
          ]};
          window.confirm=()=>true;
        }""")
        print('STAGE','await page.locator(\'button[data-tab="hirelings"]\').click()',flush=True)
        await page.locator('button[data-tab="hirelings"]').click()
        assert await page.locator('text=Hirelings Roster').count()==1
        print('STAGE','await page.locator(\'[data-aghq-form="add-hireling"] button[type=submit]\').click()',flush=True)
        await page.locator('[data-aghq-form="add-hireling"] button[type=submit]').click()
        await page.wait_for_function('getState().personnel?.hirelings?.length===1')
        assert await page.locator('text=Test Smith').count()>0
        await page.locator('[data-aghq-form="staff-hireling"] select').select_option(await page.evaluate('getRawState().core.headquarters_states[0].installations[0].key'))
        print('STAGE','await page.locator(\'[data-aghq-form="staff-hireling"] button[type=submit]\').click()',flush=True)
        await page.locator('[data-aghq-form="staff-hireling"] button[type=submit]').click()
        await page.wait_for_function('getState().core.headquarters_states[0].staffing_slots.some(x=>x.occupant_hireling_ref==="HIRE-TEST-001")')
        await page.locator('button[data-action="toggle-hireling-working"]').click()
        await page.wait_for_function('getState().personnel.hirelings[0].working===false')
        assert await page.locator('text=inactive: Working OFF').count()>0
        assert await page.locator('text=Working OFF').count()>0
        await page.locator('button[data-action="toggle-hireling-working"]').click()
        await page.wait_for_function('getState().personnel.hirelings[0].working===true')
        await page.locator('[data-aghq-form="depart-hireling"] select').select_option('retired')
        print('STAGE','await page.locator(\'[data-aghq-form="depart-hireling"] button[type=submit]\').click()',flush=True)
        await page.locator('[data-aghq-form="depart-hireling"] button[type=submit]').click()
        await page.wait_for_function('getState().personnel.hirelings[0].employment_status==="retired"')
        assert await page.evaluate('getState().core.headquarters_states[0].staffing_slots.every(x=>x.occupant_hireling_ref===null)')
        assert await page.evaluate('getState().personnel.hirelings[0].history.length===1')
        await page.screenshot(path=str(here.parent/'tests'/'ui-hirelings-fake.png'),full_page=True)
        await page.locator('button[data-tab="builder"]').click()
        await page.locator('button[data-tab="manage"]').click()
        await page.locator('button[data-action="add-rooms"]').click()
        await page.wait_for_function('getState().core.headquarters_states[0].rooms.length===3')
        await page.locator('button[data-tab="quarters"]').click()
        assert await page.locator('button[data-room]').count()==2
        # Release the GM's edit lock, then verify a real player edit uses the
        # Actor-document transport and authenticated GM processing (mocked).
        await page.locator('button[data-tab="builder"]').click()
        await page.evaluate("() => document.querySelector('[data-action=release]')?.click()")
        await page.wait_for_function('getState().editor_lease===null')
        await page.evaluate("async()=>{useUser('alice');await testOpen().render();}")
        assert await page.locator('button[data-tab="manage"]').count()==0
        # The real public API and synchronized settings cannot reveal the
        # earlier synthetic roster entry even though the GM retains it.
        assert await page.evaluate('''() => {
          const module=game.modules.get('ashen-gate-headquarters');
          for(const method of ['getState','getPersonnel','exportState']){
            let denied=false;try{module.api[method]();}catch(e){denied=/GM-only/.test(e.message);}
            if(!denied)return false;
          }
          const raw=game.settings.get('ashen-gate-headquarters','state');
          if(JSON.stringify(raw).includes('HIRE-TEST-001'))return false;
          if(raw.personnel.hirelings.length!==0)return false;
          if(game.journal.contents.length!==0)return false;
          return true;
        }''') is True
        await page.locator('button[data-tab="builder"]').click()
        await page.locator('button[data-action="take-lock"]').click()
        await page.wait_for_function('getRawState().editor_lease?.user_id === "alice"',timeout=4500)
        # ACK was GM-authored in this simulated hook; no socket mutation fallback.
        assert await page.evaluate("(()=>{const prior=game.user;useUser('gm1');try{return getState().processed_player_requests.length>=1;}finally{game.user=prior;}})()")
        await page.evaluate('async()=>{await testOpen().render();}')
        await page.locator('button[data-action="release"]').click()
        await page.wait_for_function('getRawState().editor_lease===null',timeout=4500)
        assert await page.locator('[data-ag-launcher="ashen-gate-headquarters"]').count()==1
        # DEC-0072, existing upgrade stays Visible unless GM changes it.
        assert await page.evaluate('testGetAccess().playerAccessEnabled') is True
        # GM-only setEnabled, including when invoked through public API.
        assert await page.evaluate('''async()=>{try{await testSetAccess(false);return false;}catch(e){return /Only a GM/.test(e.message);}}''')
        # Previously opened player window is closed on live Hidden transition.
        await page.evaluate('''async()=>{useUser('gm1');await testSetAccess(false);useUser('alice');simulatePlayerSync();}''')
        assert await page.locator('[data-ag-launcher="ashen-gate-headquarters"]').count()==0
        assert await page.locator('.fake-window').count()==0
        assert await page.evaluate('testGetAccess().playerAccessEnabled') is False
        assert await page.evaluate('testOpen()===null') is True
        assert await page.evaluate('''async()=>{try{getState();return false;}catch(e){return /GM-only/.test(e.message);}}''')
        # The GM opens regardless of Hidden; state survives a toggle.
        before=await page.evaluate('getRawState().core.headquarters_states[0].installations.length')
        # Old player socket packets cannot mutate guild state after Hidden.
        await page.evaluate("""() => {
          useUser('gm1');
          window.hiddenRevisionBefore=getRawState().state_revision;
          game.socket.emit('module.ashen-gate-headquarters',{type:'request',from:'alice',id:'stale-hidden-write',op:'lock',payload:{}});
        }""")
        await page.wait_for_timeout(80)
        assert await page.evaluate('getRawState().state_revision === hiddenRevisionBefore') is True
        await page.evaluate('''async()=>{useUser('gm1');await testOpen().render();}''')
        assert await page.locator('.fake-window').count()==1
        await page.locator('button[data-tab="manage"]').click()
        await page.locator('[data-aghq-form="player-access"] input').check()
        await page.locator('[data-aghq-form="player-access"] button[type=submit]').click()
        await page.wait_for_function('testGetAccess().playerAccessEnabled')
        assert await page.evaluate('getRawState().core.headquarters_states[0].installations.length')==before
        await page.evaluate("useUser('alice');fireHook('renderActorDirectory',{tabName:'actors',element:document.querySelector('#actors')},document.querySelector('#actors'))")
        assert await page.locator('[data-ag-launcher="ashen-gate-headquarters"]').count()==1
        assert await page.evaluate('testOpen()!==null') is True
        # v0.6.0: closes must not strand the singleton; reopen from the same
        # public API used by Actors, Manager and keyboard shortcuts.
        await page.evaluate("useUser('gm1')")
        await page.evaluate("async () => {const win=testOpen();await win.close();}")
        await page.wait_for_function("document.querySelectorAll('.fake-window').length===0")
        await page.evaluate("testOpen()")
        await page.wait_for_function("document.querySelectorAll('.fake-window').length===1")
        assert await page.locator('button[data-tab="manage"]').count()==1
        await page.locator('button[data-tab="manage"]').click()
        assert await page.locator('[name="background_fit"]').count()==1
        assert await page.locator('[name="background_opacity"]').count()==1
        assert await page.locator('[data-hq-section="catalog"]').count()==1
        assert await page.locator('[data-catalog-search]').count()==1
        # An action in the catalog must preserve its filter and its scroll view.
        await page.locator('[data-catalog-search]').fill('forge')
        assert await page.locator('.aghq-catalogrow:visible').count()==1
        await page.locator('button[data-action="acquire"][data-id="FAC-DEMO-FORGE"]').click()
        await page.wait_for_function("getState().inventory.filter(x=>x.facility_ref==='FAC-DEMO-FORGE').length>=2")
        assert await page.locator('[data-catalog-search]').input_value()=='forge'
        assert await page.locator('.aghq-catalogrow:visible').count()==1
        # Preserve the private vault while saving image fit and opacity.
        await page.locator('[name="background_fit"]').select_option('cover')
        await page.locator('[name="background_x"]').fill('32')
        await page.locator('[name="background_y"]').fill('64')
        await page.locator('[name="background_opacity"]').fill('95')
        await page.locator('[data-aghq-form="config"] button[type="submit"]').click()
        await page.wait_for_function("getState().config.background_fit==='cover'")
        assert await page.evaluate("getState().config.background_x===32 && getState().config.background_y===64 && getState().config.background_opacity===95")
        await page.screenshot(path=str(here.parent/'tests'/'ui-background-controls-fake.png'),full_page=True)
        assert not errors,errors
        # Synthetic private-state initialization failure must not suppress
        # Manager API, Actors launcher or GM Settings fallback.
        failure_page=await browser.new_page(viewport={'width':1100,'height':780})
        failure_combined=combined.replace(
            'for(const hook of callbacks.ready||[])await hook();',
            '''foundry.documents.JournalEntry={create:async()=>{throw new Error("Simulated vault unavailable");}};
            for(const hook of callbacks.ready||[])await hook();''')
        await failure_page.set_content('<html><head><style>'+css+'</style></head><body><script type="module">'+failure_combined+'</script></body></html>')
        await failure_page.wait_for_function('window.fakeReady',timeout=3500)
        assert await failure_page.evaluate('window.apiBeforeReady && window.menuBeforeReady') is True
        assert await failure_page.evaluate('''() => {
          const directory=document.createElement('section');directory.id='actors';
          directory.innerHTML='<header class="directory-header">Actors</header><div class="directory-list">One Actor</div>';
          document.body.appendChild(directory);
          const app={element:directory};ui.actors=app;
          fireHook('renderActorDirectory',app,directory);
          return directory.querySelectorAll('[data-ag-launcher="ashen-gate-headquarters"]').length===1;
        }''') is True
        assert await failure_page.evaluate('testOpen()===null') is True
        assert await failure_page.evaluate('game.settings.get("ashen-gate-headquarters","state").active===false') is True
        await failure_page.close()
        await browser.close()
        print('BROWSER HARNESS OK: launcher/order, canvas, hosted Hirelings, GM vault migration, direct non-GM settings/API/export denials, mock Actor edits, player gate and persistence. Mock Foundry only.')

if __name__=='__main__':asyncio.run(main())
