import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { buttonByText, byName, dispatch, fakeFetch, fill, find, loadModule, draftFirst, mount, ok, fail, until, wait } from './public-dom.mjs'
const require=createRequire(import.meta.url),React=require('react'),{QueryClient,QueryClientProvider}=require('@tanstack/react-query')
const mod=p=>loadModule(draftFirst(`src/${p}`)),{ViewingCard}=mod('features/viewings/ViewingCard.tsx'),{ViewingsPage}=mod('pages/staff/ViewingsPage.tsx')
const { BuildingSelectionContext }=mod('features/buildings/building-selection.ts'),{hourInstant,todayHanoi,plusDays}=mod('features/viewings/time.ts')
const at=hourInstant(plusDays(todayHanoi(),1),10),past=new Date(Date.now()-3600_000).toISOString()
const row={id:8,roomId:101,roomCode:'A101',buildingId:10,buildingName:'Tòa A',guestName:'Khách A',guestPhone:'0900000004',guestEmail:'guest@example.test',visitAt:at,visitDate:null,timeSlot:null,timeSlotLabel:null,status:'NEW',statusLabel:'Chờ xác nhận',source:'WEB',note:null,outcomeNote:null,overdue:false,overlap:false,roomLocked:false}
async function card(over={},response=()=>ok({...row,status:'CONFIRMED'})){
 const calls=fakeFetch([{prefix:'/viewings/8',handler:response}]),client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const app=await mount(React.createElement(QueryClientProvider,{client},React.createElement(ViewingCard,{viewing:{...row,...over}})))
 return {...app,calls,client}
}
const submit=app=>dispatch(app.container,find(app.container,n=>n.tagName==='FORM')[0],'submit')
after(()=>{setTimeout(()=>process.exit(process.exitCode??0),100).unref()})
for(const [button,via] of [['Xác nhận','PHONE'],['Gửi email xác nhận','EMAIL']])for(const visitAt of [at,past])test(`VIEW-15/15a: ${via} ${visitAt===at?'future':'late'} uses confirm endpoint`,async()=>{
 const app=await card({visitAt})
 try{dispatch(app.container,buttonByText(app.container,button),'click');await until(()=>app.calls.length===1,'confirm');assert.equal(app.calls[0].url,'/api/v1/viewings/8/confirm');assert.equal(app.calls[0].method,'POST');assert.deepEqual(JSON.parse(app.calls[0].body),{via})}finally{await app.stop()}
})
test('VIEW-15: manual/missing owner email disables EMAIL; PHONE remains available',async()=>{
 const app=await card({guestEmail:null,source:'MANUAL'})
 try{assert.equal(buttonByText(app.container,'Gửi email xác nhận').hasAttribute('disabled'),true);assert.equal(buttonByText(app.container,'Xác nhận').hasAttribute('disabled'),false)}finally{await app.stop()}
})
test('VIEW-15: mail failure remains NEW with error',async()=>{
 const app=await card({},()=>fail(503,'MAIL_UNAVAILABLE','Không gửi được email'))
 try{dispatch(app.container,buttonByText(app.container,'Gửi email xác nhận'),'click');await until(()=>app.container.textContent.includes('Không gửi được email'),'mail error');assert.match(app.container.textContent,/Chờ xác nhận/)}finally{await app.stop()}
})
for(const status of ['NEW','CONFIRMED'])for(const visitAt of [at,past])test(`VIEW-04: ${status} ${visitAt===at?'future':'past'} DONE eligibility, never direct LOST`,async()=>{
 const app=await card({status,visitAt})
 try{assert.equal(!!buttonByText(app.container,'Đã xem'),visitAt===past);assert.equal(buttonByText(app.container,'Không thành'),undefined);if(visitAt===past){dispatch(app.container,buttonByText(app.container,'Đã xem'),'click');await until(()=>app.calls.length===1,'done');assert.deepEqual(JSON.parse(app.calls[0].body),{status:'DONE'})}}finally{await app.stop()}
})
for(const status of ['NEW','CONFIRMED'])test(`VIEW-04: ${status} cancellation requires note and sends note, no cancellation metadata`,async()=>{
 const app=await card({status})
 try{dispatch(app.container,buttonByText(app.container,'Hủy'),'click');await wait(20);assert.equal(app.calls.length,0);submit(app);await until(()=>app.container.textContent.includes('Cần ghi chú'),'required');fill(app.container,byName(app.container,'outcomeNote'),'Khách bận');submit(app);await until(()=>app.calls.length===1,'cancel');assert.deepEqual(JSON.parse(app.calls[0].body),{status:'CANCELLED',note:'Khách bận'})}finally{await app.stop()}
})
test('VIEW-04: DONE may become LOST only with outcomeNote; WON action stays unavailable',async()=>{
 const app=await card({status:'DONE',statusLabel:'Đã xem'})
 try{assert.equal(buttonByText(app.container,'Chốt').hasAttribute('disabled'),true);dispatch(app.container,buttonByText(app.container,'Không thành'),'click');await wait(20);submit(app);await until(()=>app.container.textContent.includes('Cần ghi kết quả'),'required');fill(app.container,byName(app.container,'outcomeNote'),'Không phù hợp');submit(app);await until(()=>app.calls.length===1,'lost');assert.deepEqual(JSON.parse(app.calls[0].body),{status:'LOST',outcomeNote:'Không phù hợp'})}finally{await app.stop()}
})
test('VIEW-09: legacy keeps slot label until staff explicitly selects an exact hour; conflict preserves input',async()=>{
 const app=await card({visitAt:null,visitDate:plusDays(todayHanoi(),1),timeSlot:'MORNING'},()=>fail(409,'VIEWING_TIME_TAKEN','Giờ đã kín'))
 try{assert.match(app.container.textContent,/Sáng \(8:00–11:00\)/);dispatch(app.container,buttonByText(app.container,'Đổi ngày/giờ'),'click');await wait(20);assert.equal(byName(app.container,'visitAt').value,'');const next=`${plusDays(todayHanoi(),2)}T11:00`;fill(app.container,byName(app.container,'visitAt'),next);submit(app);await until(()=>app.container.textContent.includes('Giờ đã kín'),'conflict');assert.deepEqual(JSON.parse(app.calls[0].body),{visitAt:`${next}:00+07:00`});assert.equal(byName(app.container,'visitAt').value,next)}finally{await app.stop()}
})
test('VIEW-17/22: render only backend conflict/overdue flags and public contact actions',async()=>{
 const app=await card({overdue:true,overlap:true,roomLocked:true})
 try{assert.match(app.container.textContent,/Quá giờ, chưa xác nhận/);assert.match(app.container.textContent,/Trùng giờ/);assert.ok(find(app.container,n=>n.attributes?.href==='tel:0900000004').length);assert.ok(find(app.container,n=>n.attributes?.href==='https://zalo.me/0900000004'&&n.attributes.rel==='noopener noreferrer').length)}finally{await app.stop()}
})
for(const status of ['WON','LOST','CANCELLED'])test(`VIEW-04: ${status} has no state-changing buttons`,async()=>{
 const app=await card({status})
 try{for(const label of ['Hủy','Đã xem','Không thành','Đổi ngày/giờ','Xác nhận'])assert.equal(buttonByText(app.container,label),undefined)}finally{await app.stop()}
})
test('VIEW-03/SCOPE-02: staff list sends building and date filter, groups exact and legacy dates',async()=>{
 const calls=fakeFetch([{prefix:'/viewings',handler:()=>ok([row,{...row,id:9,visitAt:null,visitDate:plusDays(todayHanoi(),2),timeSlot:'MORNING'}],{page:1,limit:100,total:2})}])
 const app=await mount(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(BuildingSelectionContext.Provider,{value:{selectedBuildingId:10}},React.createElement(ViewingsPage))))
 try{await until(()=>app.container.textContent.includes('A101'),'list');assert.match(calls[0].url,/buildingId=10/);assert.match(calls[0].url,/from=/);assert.ok(buttonByText(app.container,'Thêm lịch hẹn'))}finally{await app.stop()}
})
