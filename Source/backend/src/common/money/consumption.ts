export interface ReadingPoint {
  value: number;
  isMeterReplaced: boolean;
  oldMeterFinal: number | null;
}

// MTR-05: sum of consecutive pairs from the period's opening reading to its closing reading. A replacement reading b
// counts b.oldMeterFinal − a.value for the old meter, and the new meter starts at b.value.
export function consumption(readings: readonly ReadingPoint[]): number {
  if (readings.length < 2) throw new RangeError('consumption needs an opening and a closing reading');
  let total = 0;
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1];
    const b = readings[i];
    let used: number;
    if (b.isMeterReplaced) {
      if (b.oldMeterFinal === null) throw new RangeError('a meter replacement needs old_meter_final');
      used = b.oldMeterFinal - a.value;
    } else {
      used = b.value - a.value;
    }
    if (used < 0) throw new RangeError('a reading is lower than the previous one (MTR-03)');
    total += used;
  }
  return total;
}

// MTR-08 (A-04, D-44): consumption above twice the average of the previous 3 periods; fewer than 3 periods → no check.
export function isAbnormal(current: number, previous: readonly number[]): boolean {
  if (previous.length < 3) return false;
  const last3 = previous.slice(-3);
  return current * 3 > 2 * last3.reduce((sum, v) => sum + v, 0);
}
