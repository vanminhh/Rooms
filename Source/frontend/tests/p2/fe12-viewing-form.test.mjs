import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { buttonByText, byName, dispatch, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, fail, until, wait } from './public-dom.mjs'
const require=createRequire(import.meta.url), React=require('react'), { QueryClient, QueryClientProvider }=require('@tanstack/react-query')
const mod=p=>loadModule(draftFirst(`src/${p}`))
const { ViewingForm }=mod('features/viewings/ViewingForm.tsx')
const schemas=mod('features/viewings/schemas.ts'), { todayHanoi, plusDays }=mod('features/viewings/time.ts')
const day=plusDays(todayHanoi(),1), at=`${day}T10:00`, values={roomId:101,guestName:'Khách A',guestPhone:'0900000004',visitAt:at,note:''}
after(()=>{setTimeout(()=>process.exit(process.exitCode??0),100).unref()})
for(const [field,value] of [['roomId',0],['roomId',2147483648],['guestName','A'],['guestName','x'.repeat(101)],['guestPhone','123'],['visitAt',`${day}T07:00`],['visitAt',`${day}T20:00`],['visitAt',`${day}T10:30`],['visitAt','2026-02-30T10:00'],['visitAt',`${plusDays(todayHanoi(),31)}T10:00`],['note','x'.repeat(501)]]) test(`VIEW-03/08: rejects invalid ${field} ${String(value).slice(0,25)}`,()=>{
 assert.equal(schemas.viewingFormSchema.safeParse({...values,[field]:value}).success,false)
})
test('VIEW-08: accepts 08:00 and 19:00 through day30 and notes of 500 characters',()=>{
 for(const hour of ['08','19'])assert.equal(schemas.viewingFormSchema.safeParse({...values,visitAt:`${plusDays(todayHanoi(),30)}T${hour}:00`,note:'x'.repeat(500)}).success,true)
})
for(const status of ['CANCELLED','LOST']) test(`VIEW-04: ${status} needs a nonblank note`,()=>{
 for(const outcomeNote of ['', '   ', 'x'.repeat(501)])assert.equal(schemas.outcomeFormSchema(status).safeParse({outcomeNote}).success,false)
 assert.equal(schemas.outcomeFormSchema(status).safeParse({outcomeNote:'  Lý do giữ nguyên  '}).data.outcomeNote,'  Lý do giữ nguyên  ')
})
async function setup(response=()=>ok({id:1})){
 let saved=0
 const calls=fakeFetch([{prefix:'/rooms',handler:()=>ok([{id:101,code:'A101'}],{page:1,limit:100,total:1})},{prefix:'/viewings',method:'POST',handler:response}])
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const app=await mount(React.createElement(QueryClientProvider,{client},React.createElement(ViewingForm,{buildingId:10,onSaved:()=>saved++,onCancel(){}})))
 await until(()=>find(app.container,n=>n.tagName==='OPTION'&&n.value==='101').length,'rooms')
 for(const [name,value] of Object.entries(values)){const field=byName(app.container,name);if(field){if(field.tagName==='SELECT'){field.type='select-one';field.value=String(value);dispatch(app.container,field,'change')}else fill(app.container,field,value)}}
 return {...app,calls,saved:()=>saved}
}
test('VIEW-03: manual creation sends one exact Hanoi hour with typed contact and note',async()=>{
 const app=await setup()
 try{dispatch(app.container,find(app.container,n=>n.tagName==='FORM')[0],'submit');await until(()=>app.saved()===1,'saved');const post=app.calls.find(c=>c.method==='POST');assert.deepEqual(JSON.parse(post.body),{roomId:101,guestName:'Khách A',guestPhone:'0900000004',visitAt:`${at}:00+07:00`})}finally{await app.stop()}
})
for(const [code,status] of [['VIEWING_TIME_TAKEN',409],['OUT_OF_SCOPE',403]])test(`VIEW-03/16: ${code} keeps manual form open`,async()=>{
 const app=await setup(()=>fail(status,code,code))
 try{dispatch(app.container,find(app.container,n=>n.tagName==='FORM')[0],'submit');await until(()=>app.container.textContent.includes(code),'error');assert.equal(app.saved(),0);assert.equal(byName(app.container,'guestName').value,'Khách A')}finally{await app.stop()}
})

test('VIEW-03/16a: manual overlap requires an explicit retry with the same payload', async () => {
 const app=await setup(call=>JSON.parse(call.body).acceptOverlap ? ok({id:1}) : fail(409,'VIEWING_OVERLAP_WARNING','Cùng giờ ở tòa khác',{visitAt:'Lưu ý di chuyển giữa hai quận'}))
 try {
  dispatch(app.container,find(app.container,n=>n.tagName==='FORM')[0],'submit')
  await until(()=>buttonByText(app.container,'Vẫn đặt'),'manual warning')
  assert.equal(app.saved(),0)
  dispatch(app.container,buttonByText(app.container,'Chọn giờ khác'),'click');await wait(15)
  assert.equal(app.calls.filter(c=>c.method==='POST').length,1)
  dispatch(app.container,find(app.container,n=>n.tagName==='FORM')[0],'submit')
  await until(()=>buttonByText(app.container,'Vẫn đặt'),'manual warning again')
  dispatch(app.container,buttonByText(app.container,'Vẫn đặt'),'click')
  await until(()=>app.saved()===1,'manual accepted')
  const posts=app.calls.filter(c=>c.method==='POST').map(c=>JSON.parse(c.body))
  assert.deepEqual(posts[2],{...posts[1],acceptOverlap:true})
 } finally {await app.stop()}
})
