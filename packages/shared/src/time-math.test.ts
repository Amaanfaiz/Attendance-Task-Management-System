import { describe, expect, it } from 'vitest';
import { calculateBreakMinutes, calculateNetWorkingMinutes, calculateTaskMinutes, reconcile } from './time-math';

describe('calculateNetWorkingMinutes (BR-008)', () => {
  it('subtracts completed break time from gross attendance', () => {
    const attendance = { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T17:30:00Z') };
    const breaks = [{ start: new Date('2026-01-01T12:00:00Z'), end: new Date('2026-01-01T12:45:00Z') }];
    expect(calculateNetWorkingMinutes(attendance, breaks)).toBeCloseTo(465, 5); // 8h30m - 45m
  });

  it('never goes negative even with an over-long break', () => {
    const attendance = { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T09:30:00Z') };
    const breaks = [{ start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T10:00:00Z') }];
    expect(calculateNetWorkingMinutes(attendance, breaks)).toBe(0);
  });

  it('uses now() as the end boundary for an open (not yet clocked out) session', () => {
    const start = new Date(Date.now() - 10 * 60_000);
    const minutes = calculateNetWorkingMinutes({ start, end: null }, []);
    expect(minutes).toBeGreaterThanOrEqual(9.9);
    expect(minutes).toBeLessThanOrEqual(10.1);
  });
});

describe('calculateBreakMinutes (AC-004-003-03)', () => {
  it('sums completed break durations within the attendance window', () => {
    const attendance = { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T17:30:00Z') };
    const breaks = [
      { start: new Date('2026-01-01T11:00:00Z'), end: new Date('2026-01-01T11:15:00Z') },
      { start: new Date('2026-01-01T14:00:00Z'), end: new Date('2026-01-01T14:30:00Z') },
    ];
    expect(calculateBreakMinutes(attendance, breaks)).toBeCloseTo(45, 5); // 15m + 30m
  });

  it('is exactly the figure calculateNetWorkingMinutes subtracts, not a separate calculation', () => {
    const attendance = { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T17:30:00Z') };
    const breaks = [{ start: new Date('2026-01-01T12:00:00Z'), end: new Date('2026-01-01T12:45:00Z') }];
    const grossMinutes = 510; // 8h30m
    expect(calculateNetWorkingMinutes(attendance, breaks)).toBeCloseTo(
      grossMinutes - calculateBreakMinutes(attendance, breaks),
      5,
    );
  });
});

describe('calculateTaskMinutes (BR-009)', () => {
  it('sums multiple closed segments', () => {
    const segments = [
      { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T10:00:00Z') },
      { start: new Date('2026-01-01T11:00:00Z'), end: new Date('2026-01-01T11:30:00Z') },
    ];
    expect(calculateTaskMinutes(segments)).toBe(90);
  });
});

describe('daylight-saving boundary safety (NFR-005, RISK-011)', () => {
  // US Eastern DST ends 2026-11-01 02:00 local (falls back to 01:00) - that
  // calendar day has 25 real hours. A session spanning it, read naively off
  // local wall-clock times ("9:00 PM to 9:00 AM" -> looks like 12h), is
  // actually 13h of real elapsed time. Every stored timestamp in this system
  // is UTC (Postgres timestamptz + toISOString()), so this only stays correct
  // because the math never touches local wall-clock time at all - these are
  // the real UTC instants that "9:00 PM EDT" and "9:00 AM EST" correspond to.
  it('computes true elapsed minutes across a real US fall-back transition, not naive wall-clock subtraction', () => {
    const clockInUtc = new Date('2026-11-01T01:00:00Z'); // 2026-10-31 21:00 EDT (UTC-4)
    const clockOutUtc = new Date('2026-11-01T14:00:00Z'); // 2026-11-01 09:00 EST (UTC-5)
    const naiveWallClockMinutes = 12 * 60; // what "9 PM to 9 AM" looks like if you ignore the fall-back
    const trueMinutes = calculateNetWorkingMinutes(
      { start: clockInUtc, end: clockOutUtc },
      [],
    );
    expect(trueMinutes).toBeCloseTo(13 * 60, 5); // 780 real minutes elapsed
    expect(trueMinutes).not.toBeCloseTo(naiveWallClockMinutes, 5);
  });

  // US Eastern DST begins 2026-03-08 02:00 local (springs forward to 03:00) -
  // that calendar day has only 23 real hours. Same principle, opposite
  // direction: "9:00 PM to 9:00 AM" naive wall-clock reads 12h, but only 11h
  // of real time actually passed.
  it('computes true elapsed minutes across a real US spring-forward transition', () => {
    const clockInUtc = new Date('2026-03-08T02:00:00Z'); // 2026-03-07 21:00 EST (UTC-5)
    const clockOutUtc = new Date('2026-03-08T13:00:00Z'); // 2026-03-08 09:00 EDT (UTC-4)
    const naiveWallClockMinutes = 12 * 60;
    const trueMinutes = calculateNetWorkingMinutes(
      { start: clockInUtc, end: clockOutUtc },
      [],
    );
    expect(trueMinutes).toBeCloseTo(11 * 60, 5); // 660 real minutes elapsed
    expect(trueMinutes).not.toBeCloseTo(naiveWallClockMinutes, 5);
  });
});

describe('reconcile (BR-010)', () => {
  it('matches the worked example from the spec: 7h30m worked, 6h45m tasked -> 45m unallocated', () => {
    const attendance = { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T17:00:00Z') };
    // 8h gross, no break modelled here directly; instead model 6h45m of task time against
    // a net working time of 7h30m by giving a 30-minute break (8h - 30m = 7h30m net).
    const breaks = [{ start: new Date('2026-01-01T12:00:00Z'), end: new Date('2026-01-01T12:30:00Z') }];
    const tasks = [
      { start: new Date('2026-01-01T09:30:00Z'), end: new Date('2026-01-01T12:30:00Z') }, // 3h dev
      { start: new Date('2026-01-01T13:00:00Z'), end: new Date('2026-01-01T15:00:00Z') }, // 2h test
      { start: new Date('2026-01-01T15:00:00Z'), end: new Date('2026-01-01T16:45:00Z') }, // 1h45m docs
    ];
    const result = reconcile(attendance, breaks, tasks);
    expect(result.netWorkingMinutes).toBeCloseTo(450, 5); // 7h30m
    expect(result.taskMinutes).toBeCloseTo(405, 5); // 6h45m
    expect(result.unallocatedMinutes).toBeCloseTo(45, 5);
    expect(result.hasDataQualityException).toBe(false);
  });

  it('flags a data-quality exception when task time exceeds net working time (AC-007-003-02)', () => {
    const attendance = { start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T10:00:00Z') };
    const tasks = [{ start: new Date('2026-01-01T09:00:00Z'), end: new Date('2026-01-01T11:00:00Z') }];
    const result = reconcile(attendance, [], tasks);
    expect(result.hasDataQualityException).toBe(true);
    expect(result.unallocatedMinutes).toBe(0); // clamped, never negative
  });
});
