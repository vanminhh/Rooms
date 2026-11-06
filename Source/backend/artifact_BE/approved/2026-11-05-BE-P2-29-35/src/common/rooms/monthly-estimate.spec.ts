import { buildEstimate, type EstimateService } from './monthly-estimate.js';
import type { PublicRateView } from '../../modules/rooms/public.types.js';

// CP-2 (BE-P2-30) · ROOM-08, A-05, SVC-04, Q-P6-4. Pure function, nothing mocked:
// buildEstimate takes plain data, no DB/Prisma edge to isolate.

function rate(unitPrice: number, overrides: Partial<PublicRateView> = {}): PublicRateView {
  return {
    kind: 'SERVICE', serviceId: 1, serviceName: null, unit: null,
    effectiveFrom: '2026-01-01', tiers: [{ tierNo: 1, upTo: null, unitPrice }],
    ...overrides,
  };
}

function service(name: string, unit: EstimateService['unit'], rateOrNull: PublicRateView | null): EstimateService {
  return { name, unit, rate: rateOrNull };
}

describe('CP-2 (BE-P2-30) · buildEstimate: ROOM-08 PER_M3', () => {
  it('ROOM-08 PER_M3: monthlyEstimate = price + Σ(ROOM services) + Σ(PERSON services × 1); deposit = price; no electric/water-m3 added', () => {
    const wifi = service('Wifi', 'ROOM', rate(100_000));
    const trash = service('Rác', 'PERSON', rate(50_000));
    const out = buildEstimate({
      price: 2_500_000, waterMode: 'PER_M3', water: rate(15_000), services: [wifi, trash],
    });
    // Hand calc: 2_500_000 (giá thuê) + 100_000 (wifi) + 50_000 (rác × 1 người) = 2_650_000.
    expect(out.monthlyEstimate).toBe(2_650_000);
    expect(out.deposit).toBe(2_500_000);
    expect(out.estimate.items).toEqual([
      { label: 'Giá thuê', amount: 2_500_000 },
      { label: 'Wifi', amount: 100_000 },
      { label: 'Rác', amount: 50_000 },
    ]);
    expect(out.estimate.missing).toEqual([]);
    expect(out.estimate.meteredNote).toBe('chưa gồm điện, nước – tính theo đồng hồ của phòng');
  });

  it('ROOM-08: electric is never part of the input and PER_M3 water is never added even when a water rate is present', () => {
    const out = buildEstimate({ price: 2_000_000, waterMode: 'PER_M3', water: rate(20_000), services: [] });
    expect(out.monthlyEstimate).toBe(2_000_000);
    expect(out.estimate.items).toEqual([{ label: 'Giá thuê', amount: 2_000_000 }]);
  });
});

describe('CP-2 (BE-P2-30) · buildEstimate: ROOM-08 PER_PERSON', () => {
  it('ROOM-08 PER_PERSON: adds water tier-1 unit price × 1 person on top of price + services (acceptance 11)', () => {
    const wifi = service('Wifi', 'ROOM', rate(100_000));
    const out = buildEstimate({ price: 2_500_000, waterMode: 'PER_PERSON', water: rate(80_000), services: [wifi] });
    // Hand calc: 2_500_000 + 100_000 (wifi) + 80_000 (nước 1 người) = 2_680_000.
    expect(out.monthlyEstimate).toBe(2_680_000);
    expect(out.estimate.items).toEqual([
      { label: 'Giá thuê', amount: 2_500_000 },
      { label: 'Wifi', amount: 100_000 },
      { label: 'Nước (1 người)', amount: 80_000 },
    ]);
  });

  it('ROOM-08 PER_PERSON: no water rate in effect -> water line is skipped, not added as 0 and not listed as missing by buildEstimate itself', () => {
    const out = buildEstimate({ price: 2_000_000, waterMode: 'PER_PERSON', water: null, services: [] });
    expect(out.monthlyEstimate).toBe(2_000_000);
    expect(out.estimate.items).toEqual([{ label: 'Giá thuê', amount: 2_000_000 }]);
  });
});

describe('CP-2 (BE-P2-30) · buildEstimate: SVC-04 missing rate', () => {
  it('SVC-04: an active ROOM service with no rate in effect is not added to the total and its name lands in missing', () => {
    const out = buildEstimate({
      price: 2_000_000, waterMode: 'PER_M3', water: null,
      services: [service('Thang máy', 'ROOM', null)],
    });
    expect(out.monthlyEstimate).toBe(2_000_000);
    expect(out.estimate.missing).toEqual(['chưa gồm: Thang máy (chưa có giá)']);
  });

  // Locked (is_active = false) services never reach buildEstimate: the caller (loadPublicRates)
  // only loads services where isActive = true, so there is nothing to assert here beyond that
  // input shape; the exclusion itself is covered by the HTTP-level tests of loadPublicRates.
});

describe('CP-2 (BE-P2-30) · buildEstimate: VEHICLE services (Q-P6-4 = A)', () => {
  it('Q-P6-4 (a): VEHICLE active, no rate yet -> listed in missing, not added to the total', () => {
    const out = buildEstimate({
      price: 2_000_000, waterMode: 'PER_M3', water: null,
      services: [service('Gửi xe máy', 'VEHICLE', null)],
    });
    expect(out.monthlyEstimate).toBe(2_000_000);
    expect(out.estimate.missing).toEqual(['chưa gồm: Gửi xe máy (chưa có giá)']);
  });

  it('Q-P6-4 (b): VEHICLE active with a rate -> not added to the total and not in missing (same total with or without it)', () => {
    const withoutVehicle = buildEstimate({ price: 2_000_000, waterMode: 'PER_M3', water: null, services: [] });
    const withVehicle = buildEstimate({
      price: 2_000_000, waterMode: 'PER_M3', water: null,
      services: [service('Gửi xe máy', 'VEHICLE', rate(150_000))],
    });
    expect(withVehicle.monthlyEstimate).toBe(withoutVehicle.monthlyEstimate);
    expect(withVehicle.estimate.missing).toEqual([]);
    expect(withVehicle.estimate.items.map((i) => i.label)).not.toContain('Gửi xe máy');
  });

  it('Q-P6-4 (c): a VEHICLE service with is_active = false never reaches buildEstimate (caller filters isActive before calling); confirmed by omitting it from the services array entirely with an unchanged total', () => {
    const out = buildEstimate({ price: 2_000_000, waterMode: 'PER_M3', water: null, services: [] });
    expect(out.monthlyEstimate).toBe(2_000_000);
    expect(out.estimate.missing).toEqual([]);
  });
});

describe('CP-2 (BE-P2-30) · buildEstimate: fail-proof sanity', () => {
  it('sums integers exactly with no floating point drift across several services', () => {
    const out = buildEstimate({
      price: 1_990_000, waterMode: 'PER_PERSON', water: rate(77_777),
      services: [service('Wifi', 'ROOM', rate(33_333)), service('Rác', 'PERSON', rate(11_111))],
    });
    expect(out.monthlyEstimate).toBe(1_990_000 + 33_333 + 11_111 + 77_777);
    expect(Number.isInteger(out.monthlyEstimate)).toBe(true);
  });
});
