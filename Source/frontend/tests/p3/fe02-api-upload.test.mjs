import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import { draftFirst, loadModule } from '../draft-root.mjs'

// Real clients/shared API run unchanged. Only fetch is replaced; no real upload, database or mail.
// Paths and allowed fields come from the P3-2..P3-5 controllers/DTOs and FILE-01/02.
const api = loadModule(draftFirst('src/features/contracts/api.ts'))
const views = loadModule(draftFirst('src/features/viewings/api.ts'))
const shared = loadModule(draftFirst('src/shared/api.ts'))
const upload = loadModule(draftFirst('src/features/rooms/upload.ts'))
const originalFetch = globalThis.fetch
let calls

function respond(data = { id: 31 }, status = 200, meta) {
  return new Response(JSON.stringify({ data, ...(meta ? { meta } : {}) }), { status, headers: { 'Content-Type': 'application/json' } })
}
function fakeFetch(handler = () => respond()) {
  calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url, ...init, headers: init.headers ?? {} }
    calls.push(call)
    return handler(call)
  }
}
beforeEach(() => {
  shared.setAccessToken('test-access')
  shared.setAuthHandlers({})
  shared.forceLanguage(null)
  shared.setLanguage('vi')
  fakeFetch()
})
afterEach(() => { globalThis.fetch = originalFetch; shared.setAccessToken(null); shared.setLanguage('vi') })

const asset = { assetId: 'fake_asset', publicId: 'contracts/2/31/contract-scan-fixture', version: 8, format: 'pdf' }
const photo = { assetId: 'fake_photo', publicId: 'contracts/2/31/id-photo-fixture', version: 9, format: 'jpg' }

const cases = [
  ['FE-P3-04/D-41', () => api.getContractDates('2027-01-31', 3), 'GET', '/contracts/end-date?startDate=2027-01-31&termMonths=3'],
  ['FE-P3-07/UI-04', () => api.previewContractCancellation(31, { reason: 'Preview', depositKept: 0, refund: 99 }), 'POST', '/contracts/31/cancel-preview', { reason: 'Preview', depositKept: 0 }],
  ['FE-P3-07/CON-12', () => api.cancelContract(31, { reason: 'Confirmed', depositKept: 0, expectedDepositReceived: 0, refund: 99 }, 'preview-key'), 'POST', '/contracts/31/cancel', { reason: 'Confirmed', depositKept: 0, expectedDepositReceived: 0 }, 'preview-key'],
  ['FE-P3-10/SCOPE-03 list', () => api.listMyContracts(2, 20), 'GET', '/me/contracts?page=2&limit=20'],
  ['FE-P3-12/SCOPE-03 detail', () => api.getMyContract(31), 'GET', '/me/contracts/31'],
  ['FE-P3-12/CON-16', () => api.getMyContractScan(31), 'GET', '/me/contracts/31/scan'],
  ['FE-P3-13/CON-22', () => api.getMyContractPrint(31), 'GET', '/me/contracts/31/print'],
  ['FE-P3-12/CON-13/15', () => api.createMyOccupant(31, { fullName: 'Roommate', moveInDate: '2027-02-01', isSigner: true, tenantId: 99, idNumberEnc: 'ignored' }), 'POST', '/me/contracts/31/occupants', { fullName: 'Roommate', moveInDate: '2027-02-01' }],
  ['CON-01/07', () => api.createContract({
    roomId: 8, signer: { fullName: 'Test signer', phone: '0900000991', email: 'signer@example.test', dateOfBirth: '2000-01-01', idNumber: '000123456789', role: 'BOSS' },
    startDate: '2027-01-31', termMonths: 3, deposit: 0, serviceIds: [4, 6], terms: 'Terms', viewingId: 11,
    confirmedGuestAccountId: 15, confirmDifferentViewingOwner: true, tenantId: 99, rent: 1,
  }), 'POST', '/contracts', {
    roomId: 8, signer: { fullName: 'Test signer', phone: '0900000991', email: 'signer@example.test', dateOfBirth: '2000-01-01', idNumber: '000123456789' },
    startDate: '2027-01-31', termMonths: 3, deposit: 0, serviceIds: [4, 6], terms: 'Terms', viewingId: 11,
    confirmedGuestAccountId: 15, confirmDifferentViewingOwner: true,
  }],
  ['CON detail', () => api.getContract(31), 'GET', '/contracts/31'],
  ['CON-06/FILE-02', () => api.signContract(31, { ...asset, url: 'https://example.test/private', signature: 'not-metadata' }), 'POST', '/contracts/31/sign', asset],
  ['CON-09 reset', () => api.resetContractPassword(31), 'POST', '/contracts/31/reset-password'],
  ['CON-22', () => api.getContractPrint(31), 'GET', '/contracts/31/print'],
  ['CON-16 scan', () => api.getContractScan(31), 'GET', '/contracts/31/scan'],
  ['CON-10/D-38', () => api.moveInContract(31, {
    electric: 100, water: 20, readOn: '2027-01-31', note: 'Replacement',
    electricReplacement: { oldMeterFinal: 500, url: 'not-a-meter-field' }, waterReplacement: { oldMeterFinal: 80 },
    photos: ['not-accepted'], electricPhoto: asset,
  }), 'POST', '/contracts/31/move-in', {
    electric: 100, water: 20, readOn: '2027-01-31', note: 'Replacement',
    electricReplacement: { oldMeterFinal: 500 }, waterReplacement: { oldMeterFinal: 80 },
  }],
  ['CON-12/API-05', () => api.cancelContract(31, { reason: 'Guest cancels', depositKept: 1_000_000, refund: 7 }, 'cancel-key'), 'POST', '/contracts/31/cancel', { reason: 'Guest cancels', depositKept: 1_000_000 }, 'cancel-key'],
  ['BIL-11/API-05', () => api.recordDepositPayment(82, { method: 'CASH', paidAt: '2027-01-31T10:00:00+07:00', note: 'Received', amount: 1, status: 'PAID' }, 'payment-key'), 'POST', '/invoices/82/payment', { method: 'CASH', paidAt: '2027-01-31T10:00:00+07:00', note: 'Received' }, 'payment-key'],
  ['CON-13 list', () => api.listOccupants(31), 'GET', '/contracts/31/occupants'],
  ['CON-13 create', () => api.createOccupant(31, {
    fullName: 'Roommate', phone: null, dateOfBirth: null, idNumber: null,
    idFront: { ...photo, url: 'must-not-be-sent' }, idBack: null, moveInDate: '2027-02-01', moveOutDate: null,
    isSigner: true, tenantId: 99, idNumberEncrypted: 'not-an-input',
  }), 'POST', '/contracts/31/occupants', {
    fullName: 'Roommate', phone: null, dateOfBirth: null, idNumber: null,
    idFront: photo, idBack: null, moveInDate: '2027-02-01', moveOutDate: null,
  }],
  ['CON-13 update', () => api.updateOccupant(31, 52, { moveOutDate: '2027-02-20', idFront: null, isSigner: false }), 'PATCH', '/contracts/31/occupants/52', { moveOutDate: '2027-02-20', idFront: null }],
  ['CON-16 ID photos', () => api.getOccupantIdPhotos(31, 52), 'GET', '/contracts/31/occupants/52/id-photos'],
  ['CON-14 list', () => api.listContractVehicles(31), 'GET', '/contracts/31/vehicles'],
  ['CON-14 create', () => api.createContractVehicle(31, { plate: '29 a 123', type: 'MOTORBIKE', serviceId: 6, registeredAt: '2027-02-01', contractId: 99, buildingId: 99 }), 'POST', '/contracts/31/vehicles', { plate: '29 a 123', type: 'MOTORBIKE', serviceId: 6, registeredAt: '2027-02-01' }],
  ['CON-14 stop', () => api.updateContractVehicle(31, 62, { isActive: false, removedAt: '2027-02-20', contractId: 99 }), 'PATCH', '/contracts/31/vehicles/62', { isActive: false, removedAt: '2027-02-20' }],
  ['CON-14 edit', () => api.updateContractVehicle(31, 62, { plate: '29B456', type: 'CAR', serviceId: 7, registeredAt: '2027-02-01' }), 'PATCH', '/contracts/31/vehicles/62', { plate: '29B456', type: 'CAR', serviceId: 7, registeredAt: '2027-02-01' }],
  ['D-07/DB-B5 list', () => api.listContractServices(31), 'GET', '/contracts/31/services'],
  ['D-07/DB-B5 replace', () => api.updateContractServices(31, [4, 9]), 'PATCH', '/contracts/31/services', { serviceIds: [4, 9] }],
  ['D-07/DB-B5 clear', () => api.updateContractServices(31, []), 'PATCH', '/contracts/31/services', { serviceIds: [] }],
  ['VIEW-06/D-39', () => views.markViewingCalled(11), 'POST', '/viewings/11/called'],
]

for (const [requirement, run, method, path, body, key] of cases) {
  test(`FE-P3-02/${requirement}: ${method} ${path} sends only its DTO fields and preserves API transport`, async () => {
    const paged = path.startsWith('/me/contracts?')
    const meta = { page: 2, limit: 20, total: 21 }
    const result = paged ? [{ marker: 'returned-by-api' }] : { marker: 'returned-by-api' }
    fakeFetch(() => respond(result, 200, paged ? meta : undefined))
    assert.deepEqual(await run(), paged ? { data: result, meta } : result)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/v1' + path)
    assert.equal(calls[0].method, method)
    assert.equal(calls[0].headers.Authorization, 'Bearer test-access')
    assert.equal(calls[0].credentials, 'include')
    assert.equal(calls[0].headers['Accept-Language'], 'vi')
    assert.equal(calls[0].headers['Idempotency-Key'], key)
    assert.deepEqual(calls[0].body === undefined ? undefined : JSON.parse(calls[0].body), body)
  })
}

test('FE-P3-02/API-02/SCOPE-02: contract list encodes its filters and preserves pagination metadata', async () => {
  const meta = { page: 2, limit: 10, total: 21 }, rows = [{ id: 31 }]
  fakeFetch(() => respond(rows, 200, meta))
  assert.deepEqual(await api.listContracts({ buildingId: 2, status: 'HOLD', q: 'An & 29_%', sort: 'createdAt', page: 2, limit: 10, tenantId: 99 }), { data: rows, meta })
  const url = new URL(calls[0].url, 'http://localhost')
  assert.equal(url.pathname, '/api/v1/contracts')
  assert.deepEqual(Object.fromEntries(url.searchParams), { page: '2', limit: '10', buildingId: '2', status: 'HOLD', q: 'An & 29_%', sort: 'createdAt' })
})

test('FE-P3-02/SCOPE-02: all/null building selections omit buildingId rather than expanding scope in the client', async () => {
  fakeFetch(() => respond([], 200, { page: 1, limit: 20, total: 0 }))
  for (const buildingId of [undefined, 'all', null]) await api.listContracts({ buildingId })
  for (const call of calls) assert.equal(call.url, '/api/v1/contracts?page=1&limit=20')
})

test('FE-P3-02/CON-14: vehicle lookup preserves literal partial search and sends only accepted query fields', async () => {
  fakeFetch(() => respond([], 200, { page: 1, limit: 20, total: 0 }))
  await api.lookupVehicles({ plate: '29 %_\\', isActive: false, buildingId: 99 })
  const url = new URL(calls[0].url, 'http://localhost')
  assert.equal(url.pathname, '/api/v1/vehicles')
  assert.deepEqual(Object.fromEntries(url.searchParams), { page: '1', limit: '20', plate: '29 %_\\', isActive: 'false' })
})

test('FE-P3-02/API-02: invalid list pagination fails before fetch', async () => {
  assert.throws(() => api.listContracts({ page: 0 }), RangeError)
  assert.throws(() => api.lookupVehicles({ limit: 101 }), RangeError)
  assert.equal(calls.length, 0)
})

test('FE-P3-02/UI-05/CON-07: structured guest confirmation fields are preserved for the form', async () => {
  const fields = { 'signer.phone': 'Xác nhận tài khoản', guestAccountId: '15', guestAccountName: 'Existing guest', guestAccountEmail: 'guest@example.test' }
  fakeFetch(() => new Response(JSON.stringify({ error: { code: 'PHONE_TAKEN', message: 'Số điện thoại đã có tài khoản', fields } }), { status: 409 }))
  await assert.rejects(() => api.createContract({ roomId: 8, signer: { fullName: 'Signer', phone: '0900000991' }, startDate: '2027-01-31', termMonths: 3, serviceIds: [] }), error => {
    assert.ok(error instanceof shared.ApiError)
    assert.equal(error.code, 'PHONE_TAKEN')
    assert.deepEqual(error.fields, fields)
    return true
  })
})

test('FE-P3-02/API-05: refresh retries a cancellation with the same idempotency key and body', async () => {
  fakeFetch(call => {
    if (call.url === '/api/v1/auth/refresh') return respond({ accessToken: 'fresh-access' })
    if (call.headers.Authorization === 'Bearer test-access') return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }), { status: 401 })
    return respond({ id: 31, status: 'CANCELLED' })
  })
  await api.cancelContract(31, { reason: 'Cancelled', depositKept: 0 }, 'same-operation')
  const writes = calls.filter(call => call.url.endsWith('/cancel'))
  assert.equal(writes.length, 2)
  assert.deepEqual(writes.map(call => call.headers['Idempotency-Key']), ['same-operation', 'same-operation'])
  assert.equal(writes[0].body, writes[1].body)
  assert.equal(writes[1].headers.Authorization, 'Bearer fresh-access')
})

const signedRoom = {
  cloudName: 'demo', apiKey: 'key', uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  timestamp: 1700000000, folder: 'rooms/2/8', allowedFormats: 'jpg,png,webp', transformation: 'c_limit,w_1920', signature: 'synthetic-signature',
}
const signedPrivate = {
  cloudName: 'demo', apiKey: 'key', uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  timestamp: 1700000000, folder: 'contracts/2/31', allowedFormats: 'jpg,png,webp,pdf',
  type: 'authenticated', publicId: 'contract-scan-fixture', overwrite: false, signature: 'synthetic-signature',
}

test('FE-P3-12/SCOPE-03/FILE-01: roommate ID signature uses only the tenant endpoint and validates private fields', async () => {
  const signed = { ...signedPrivate, allowedFormats: 'jpg,png,webp', publicId: 'id-photo-fixture' }
  fakeFetch(() => respond(signed))
  assert.deepEqual(await upload.signMyIdPhotoUpload(31), signed)
  assert.equal(calls[0].url, '/api/v1/me/contracts/31/id-photo-sign')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].body, undefined)
  fakeFetch(() => respond({ ...signed, type: 'upload' }))
  await assert.rejects(() => upload.signMyIdPhotoUpload(31))
})
const pdf = () => new File(['synthetic fixture'], 'contract.pdf', { type: 'application/pdf' })

test('FE-P3-02/FILE-01: signUpload(roomId) and explicit ROOM_IMAGE preserve the existing room target', async () => {
  fakeFetch(() => respond(signedRoom))
  assert.deepEqual(await upload.signUpload(8), signedRoom)
  assert.deepEqual(await upload.signUpload(8, 'ROOM_IMAGE'), signedRoom)
  for (const call of calls) assert.deepEqual(JSON.parse(call.body), { purpose: 'ROOM_IMAGE', roomId: 8 })
})

for (const purpose of ['CONTRACT_SCAN', 'ID_PHOTO']) {
  test(`FE-P3-02/FILE-01: ${purpose} signs a contract target rather than a room`, async () => {
    fakeFetch(() => respond(signedPrivate))
    assert.deepEqual(await upload.signUpload(31, purpose), signedPrivate)
    assert.equal(calls[0].url, '/api/v1/files/sign')
    assert.deepEqual(JSON.parse(calls[0].body), { purpose, contractId: 31 })
  })
}

test('FE-P3-02/FILE-01: only CONTRACT_SCAN accepts PDF; room and ID photos retain their image formats', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    for (const purpose of ['ROOM_IMAGE', 'CONTRACT_SCAN', 'ID_PHOTO']) assert.doesNotThrow(() => upload.assertUploadFile({ type, size: 1024 }, purpose))
  }
  assert.doesNotThrow(() => upload.assertUploadFile(pdf(), 'CONTRACT_SCAN'))
  assert.throws(() => upload.assertUploadFile(pdf(), 'ID_PHOTO'), /Ảnh CCCD/)
  assert.throws(() => upload.assertUploadFile(pdf(), 'ROOM_IMAGE'), /định dạng/)
  assert.throws(() => upload.assertUploadFile({ type: 'text/html', size: 1024 }, 'CONTRACT_SCAN'), /PDF/)
  assert.throws(() => upload.assertUploadFile({ type: 'image/png', size: 5_000_001 }, 'ROOM_IMAGE'), /5 MB/)
  assert.equal(calls.length, 0)
})

test('FE-P3-02/D-37/FILE-02: private FormData binds authenticated delivery, exact public ID and overwrite=false', async () => {
  fakeFetch(() => new Response(JSON.stringify({ asset_id: 'fake_asset', public_id: 'contracts/2/31/contract-scan-fixture', version: 8, format: 'pdf', secure_url: 'must-not-be-returned' }), { status: 200 }))
  assert.deepEqual(await upload.uploadToCloudinary(signedPrivate, pdf()), asset)
  const call = calls[0]
  assert.equal(call.url, signedPrivate.uploadUrl)
  assert.equal(call.method, 'POST')
  assert.equal(call.credentials, 'omit')
  assert.equal(call.headers.Authorization, undefined)
  assert.equal(call.headers['Content-Type'], undefined, 'Browser sets the FormData boundary')
  assert.deepEqual(Object.fromEntries([...call.body.entries()].filter(([key]) => key !== 'file')), {
    api_key: 'key', timestamp: '1700000000', folder: 'contracts/2/31', allowed_formats: 'jpg,png,webp,pdf',
    type: 'authenticated', public_id: 'contract-scan-fixture', overwrite: 'false', signature: 'synthetic-signature',
  })
  assert.equal(call.body.get('file').type, 'application/pdf')
})

for (const [label, malformed] of [
  ['public delivery type', { ...signedPrivate, type: 'upload' }],
  ['missing delivery type', { ...signedPrivate, type: undefined }],
  ['missing public ID', { ...signedPrivate, publicId: undefined }],
  ['empty public ID', { ...signedPrivate, publicId: '' }],
  ['overwrite enabled', { ...signedPrivate, overwrite: true }],
  ['null response', null],
]) {
  test(`FE-P3-02/D-37: a private signature with ${label} fails closed`, async () => {
    fakeFetch(() => respond(malformed))
    await assert.rejects(() => upload.signUpload(31, 'CONTRACT_SCAN'), /Tải tài liệu lên không thành công/)
    assert.equal(calls.length, 1, 'Only the API signature request occurred; no file upload')
  })
}

test('FE-P3-02/D-37: upload rejects a malformed private signature before sending any file', async () => {
  for (const malformed of [{ ...signedPrivate, type: 'upload' }, { ...signedPrivate, overwrite: undefined }, { ...signedPrivate, publicId: undefined }]) {
    await assert.rejects(() => upload.uploadToCloudinary(malformed, pdf()), /Tải tài liệu lên không thành công/)
  }
  assert.equal(calls.length, 0)
})

test('FE-P3-02/FILE-02: upload network/provider failures are sanitized without metadata or provider errors', async () => {
  fakeFetch(() => { throw new Error('Private provider internals') })
  await assert.rejects(() => upload.uploadToCloudinary(signedPrivate, pdf()), /^Error: Tải tài liệu lên không thành công, vui lòng thử lại\.$/)
  for (const response of [{ status: 400, body: { error: 'provider details' } }, { status: 200, body: { asset_id: 'a', public_id: 'p', version: 1.5, format: 'pdf' } }, { status: 200, body: {} }, { status: 200, body: null }, { status: 200, body: [] }]) {
    fakeFetch(() => new Response(JSON.stringify(response.body), { status: response.status }))
    await assert.rejects(() => upload.uploadToCloudinary(signedPrivate, pdf()), /^Error: Tải tài liệu lên không thành công, vui lòng thử lại\.$/)
  }
  fakeFetch(() => new Response('<invalid-json>', { status: 200 }))
  await assert.rejects(() => upload.uploadToCloudinary(signedPrivate, pdf()), /^Error: Tải tài liệu lên không thành công, vui lòng thử lại\.$/)
})
