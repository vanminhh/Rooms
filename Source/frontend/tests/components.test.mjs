import assert from 'node:assert/strict'
import test from 'node:test'
import { getJourneyFrame } from '../src/components/journey-frame.ts'
import { formatMoney } from '../src/shared/formatters.ts'

test('empty journeys have no texture indices to load', () => {
  assert.equal(getJourneyFrame(0.5, 0), null)
})

test('a single image never requests a nonexistent next texture', () => {
  assert.deepEqual(getJourneyFrame(1, 1), { from: 0, to: 0, mix: 0, dolly: 0.85 })
})

test('journey progress clamps overscroll and keeps final indices in range', () => {
  assert.deepEqual(getJourneyFrame(-0.4, 3), { from: 0, to: 1, mix: 0, dolly: 0 })
  assert.deepEqual(getJourneyFrame(2, 3), { from: 2, to: 2, mix: 0, dolly: 0 })
})

test('intermediate scroll positions transition between consecutive images', () => {
  assert.deepEqual(getJourneyFrame(0.25, 3), { from: 0, to: 1, mix: 0.5, dolly: 0.425 })
  assert.deepEqual(getJourneyFrame(0.75, 3), { from: 1, to: 2, mix: 0.5, dolly: 0.425 })
})

test('an invalid measured progress starts at the first image', () => {
  assert.deepEqual(getJourneyFrame(Number.NaN, 2), { from: 0, to: 1, mix: 0, dolly: 0 })
})

test('UI-01: monetary values display in Vietnamese dong without currency conversion', () => {
  assert.equal(formatMoney(2984000), '2.984.000 đ')
  assert.equal(formatMoney(0), '0 đ')
})

test('UI-01: invalid monetary inputs never become a plausible price or NaN currency', () => {
  for (const value of [NaN, Infinity, -Infinity, 4500000.5, Number.MAX_SAFE_INTEGER + 1, undefined, null, '4500000']) {
    assert.equal(formatMoney(value), '—')
  }
  assert.equal(formatMoney(-50000), '-50.000 đ')
})
