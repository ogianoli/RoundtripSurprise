import { describe, expect, it } from 'vitest';

import { sampleTrip } from '../data/sampleTrip';
import {
  distanceMeters,
  getCurrentTripDay,
  getRollingTripDates,
  getRouteCoordinates,
  getStopsForDay,
  getTripDayForOffset,
  getTripProgress,
  getUpcomingStop,
  offsetCoordinates,
  resolvePlaceCoordinates,
} from './itinerary';

describe('itinerary helpers', () => {
  it('returns stops for a day in itinerary order', () => {
    const stops = getStopsForDay(sampleTrip, sampleTrip.days[1]);

    expect(stops.map((stop) => stop.id)).toEqual(['lx176-arrival', 'mondrian-singapore']);
  });

  it('selects the next upcoming stop from the whole route', () => {
    const next = getUpcomingStop(sampleTrip.stops, new Date('2026-08-04T07:00:00+08:00'));

    expect(next?.id).toBe('singapore-days');
  });

  it('falls back to the first day before the trip starts', () => {
    const day = getCurrentTripDay(sampleTrip, new Date('2026-06-17T12:00:00+02:00'));

    expect(day.id).toBe('day-0');
  });

  it('only returns a real trip day for the actual date', () => {
    expect(getTripDayForOffset(sampleTrip, new Date('2026-06-17T12:00:00+02:00'))).toBeUndefined();
    expect(getTripDayForOffset(sampleTrip, new Date('2026-08-04T12:00:00+08:00'))?.id).toBe(
      'day-2',
    );
  });

  it('starts the rolling trip date panels at the first trip date before departure', () => {
    expect(getRollingTripDates(sampleTrip, new Date('2026-06-17T12:00:00+02:00'))).toEqual([
      '2026-08-02',
      '2026-08-03',
    ]);
    expect(getRollingTripDates(sampleTrip, new Date('2026-08-03T12:00:00+08:00'))).toEqual([
      '2026-08-03',
      '2026-08-04',
    ]);
  });

  it('calculates rough trip progress', () => {
    const progress = getTripProgress(sampleTrip.stops, new Date('2026-08-14T12:00:00+08:00'));

    expect(progress).toBeGreaterThan(50);
    expect(progress).toBeLessThan(90);
  });

  it('calculates distance in meters', () => {
    const distance = distanceMeters(
      { latitude: 1.2834, longitude: 103.8607 },
      { latitude: 1.2816, longitude: 103.8636 },
    );

    expect(distance).toBeGreaterThan(300);
    expect(distance).toBeLessThan(500);
  });

  it('offsets anchored surprises away from the exact stop coordinate', () => {
    const anchor = { latitude: -8.5069, longitude: 115.2625 };
    const shifted = offsetCoordinates(anchor, 2);

    expect(shifted).not.toEqual(anchor);
  });

  it('resolves known added places to real coordinates', () => {
    const fallback = { latitude: 1, longitude: 1 };
    const gili = resolvePlaceCoordinates('Gili Islands', fallback);
    const ubud = resolvePlaceCoordinates('Ubud, Bali', fallback);

    expect(gili.latitude).toBeCloseTo(-8.3483);
    expect(gili.longitude).toBeCloseTo(116.0389);
    expect(ubud.latitude).toBeCloseTo(-8.5069);
  });

  it('generates curved multi-point routes for flights', () => {
    const route = getRouteCoordinates(
      { latitude: 47.4581, longitude: 8.5555 },
      { latitude: 1.3644, longitude: 103.9915 },
      'flight',
    );

    expect(route.length).toBeGreaterThan(2);
    expect(route[0]).toEqual({ latitude: 47.4581, longitude: 8.5555 });
    expect(route[route.length - 1].latitude).toBeCloseTo(1.3644);
  });
});
