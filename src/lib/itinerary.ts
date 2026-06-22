import { Coordinates, TravelMode, Trip, TripDay, TripStop } from '../types/trip';

const knownPlaces: Array<{
  patterns: string[];
  coordinates: Coordinates;
}> = [
  { patterns: ['zurich', 'zürich', 'zrh'], coordinates: { latitude: 47.4581, longitude: 8.5555 } },
  { patterns: ['changi', 'singapore airport', 'sin airport'], coordinates: { latitude: 1.3644, longitude: 103.9915 } },
  { patterns: ['mondrian', 'duxton'], coordinates: { latitude: 1.2795, longitude: 103.8416 } },
  { patterns: ['singapore', 'marina bay'], coordinates: { latitude: 1.2834, longitude: 103.8607 } },
  { patterns: ['sentosa'], coordinates: { latitude: 1.2494, longitude: 103.8303 } },
  { patterns: ['jewel'], coordinates: { latitude: 1.3602, longitude: 103.9899 } },
  { patterns: ['punggol', 'coney island'], coordinates: { latitude: 1.4088, longitude: 103.9176 } },
  { patterns: ['singapore zoo', 'night safari'], coordinates: { latitude: 1.4043, longitude: 103.793 } },
  { patterns: ['bali', 'denpasar', 'dps'], coordinates: { latitude: -8.7482, longitude: 115.1675 } },
  { patterns: ['ubud'], coordinates: { latitude: -8.5069, longitude: 115.2625 } },
  { patterns: ['canggu'], coordinates: { latitude: -8.65, longitude: 115.1383 } },
  { patterns: ['seminyak'], coordinates: { latitude: -8.6913, longitude: 115.1682 } },
  { patterns: ['uluwatu'], coordinates: { latitude: -8.8291, longitude: 115.0849 } },
  { patterns: ['bromo', 'tengger'], coordinates: { latitude: -7.9425, longitude: 112.953 } },
  { patterns: ['ijen', 'kawah ijen'], coordinates: { latitude: -8.0583, longitude: 114.2428 } },
  { patterns: ['east java', 'malang'], coordinates: { latitude: -7.9666, longitude: 112.6326 } },
  { patterns: ['surabaya', 'juanda'], coordinates: { latitude: -7.3798, longitude: 112.7873 } },
  { patterns: ['lombok'], coordinates: { latitude: -8.6509, longitude: 116.3249 } },
  { patterns: ['kuta lombok'], coordinates: { latitude: -8.8948, longitude: 116.2753 } },
  { patterns: ['gerupuk', 'south lombok surf'], coordinates: { latitude: -8.9147, longitude: 116.3516 } },
  { patterns: ['rinjani', 'mount rinjani'], coordinates: { latitude: -8.4113, longitude: 116.4573 } },
  { patterns: ['gili', 'gili islands', 'gili trawangan'], coordinates: { latitude: -8.3483, longitude: 116.0389 } },
  { patterns: ['labuan bajo', 'bajo'], coordinates: { latitude: -8.496, longitude: 119.8877 } },
  { patterns: ['komodo'], coordinates: { latitude: -8.5856, longitude: 119.4413 } },
  { patterns: ['flores'], coordinates: { latitude: -8.6574, longitude: 121.0794 } },
  { patterns: ['nusa penida'], coordinates: { latitude: -8.7278, longitude: 115.5444 } },
  { patterns: ['crystal bay', 'nusa penida sunset'], coordinates: { latitude: -8.7155, longitude: 115.4564 } },
  { patterns: ['kelingking'], coordinates: { latitude: -8.7516, longitude: 115.4737 } },
  { patterns: ['denpasar'], coordinates: { latitude: -8.65, longitude: 115.2167 } },
  { patterns: ['campuhan', 'ridge walk'], coordinates: { latitude: -8.4939, longitude: 115.2552 } },
  { patterns: ['monkey forest', 'sacred monkey'], coordinates: { latitude: -8.5194, longitude: 115.2606 } },
  { patterns: ['tegallalang', 'rice terraces'], coordinates: { latitude: -8.4317, longitude: 115.2794 } },
  { patterns: ['tegenungan', 'waterfall'], coordinates: { latitude: -8.5756, longitude: 115.2894 } },
];

const broadPlacePatterns = new Set(['singapore', 'bali', 'lombok']);

export function getStopsForDay(trip: Trip, day: TripDay): TripStop[] {
  const byId = new Map(trip.stops.map((stop) => [stop.id, stop]));
  return day.stops
    .map((stopId) => byId.get(stopId))
    .filter((stop): stop is TripStop => Boolean(stop));
}

export function getUpcomingStop(stops: TripStop[], now: Date): TripStop | undefined {
  return stops
    .slice()
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
    .find((stop) => Date.parse(stop.startsAt) >= now.getTime());
}

export function getCurrentTripDay(trip: Trip, now: Date): TripDay {
  const isoDate = now.toISOString().slice(0, 10);
  const exactDay = trip.days.find((day) => day.date === isoDate);

  if (exactDay) {
    return exactDay;
  }

  const sortedDays = trip.days
    .slice()
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  const nextDay = sortedDays.find((day) => Date.parse(day.date) >= now.getTime());
  return nextDay ?? sortedDays[sortedDays.length - 1];
}

export function getTripDayForOffset(
  trip: Trip,
  now: Date,
  offsetDays = 0,
): TripDay | undefined {
  const date = getDateInTimeZone(now, trip.homeTimezone, offsetDays);
  return trip.days.find((day) => day.date === date);
}

export function getRollingTripDates(trip: Trip, now: Date, count = 2): string[] {
  const firstDate = getFirstTripDate(trip);
  const currentDate = getDateInTimeZone(now, trip.homeTimezone, 0);
  const startOffset = Math.max(0, daysBetweenIsoDates(firstDate, currentDate));

  return Array.from({ length: count }, (_, index) => addDaysToIsoDate(firstDate, startOffset + index));
}

export function getTripDayByDate(trip: Trip, date: string): TripDay | undefined {
  return trip.days.find((day) => day.date === date);
}

export function getTripProgress(stops: TripStop[], now: Date): number {
  if (stops.length === 0) {
    return 0;
  }

  const completed = stops.filter((stop) => Date.parse(stop.startsAt) < now.getTime()).length;
  return Math.round((completed / stops.length) * 100);
}

export function offsetCoordinates(anchor: Coordinates, index: number): Coordinates {
  const direction = index % 2 === 0 ? 1 : -1;
  const distance = 0.006 + index * 0.001;
  return {
    latitude: anchor.latitude + distance * direction,
    longitude: anchor.longitude + distance * -direction,
  };
}

export function resolvePlaceCoordinates(input: string, fallback: Coordinates): Coordinates {
  const normalized = normalizePlaceText(input);
  const match = knownPlaces
    .flatMap((place) =>
      place.patterns.map((pattern) => ({
        coordinates: place.coordinates,
        pattern: normalizePlaceText(pattern),
      })),
    )
    .filter((place) => normalized.includes(place.pattern))
    .sort((left, right) => getPlacePatternScore(right.pattern) - getPlacePatternScore(left.pattern))[0];

  return match?.coordinates ?? fallback;
}

export function getRouteCoordinates(
  from: Coordinates,
  to: Coordinates,
  mode?: TravelMode,
): Coordinates[] {
  if (mode === 'flight') {
    return interpolateGreatCircle(from, to, 32);
  }

  return [from, to];
}

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const earthRadiusMeters = 6371000;
  const fromLat = degreesToRadians(from.latitude);
  const toLat = degreesToRadians(to.latitude);
  const latDelta = degreesToRadians(to.latitude - from.latitude);
  const lngDelta = degreesToRadians(to.longitude - from.longitude);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function getDateInTimeZone(now: Date, timeZone: string, offsetDays: number): string {
  const shifted = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(shifted);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function getFirstTripDate(trip: Trip): string {
  return trip.days
    .map((day) => day.date)
    .sort((left, right) => Date.parse(`${left}T12:00:00`) - Date.parse(`${right}T12:00:00`))[0];
}

function addDaysToIsoDate(date: string, offsetDays: number): string {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

function daysBetweenIsoDates(start: string, end: string): number {
  const startTime = Date.parse(`${start}T12:00:00Z`);
  const endTime = Date.parse(`${end}T12:00:00Z`);
  return Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000));
}

function interpolateGreatCircle(
  from: Coordinates,
  to: Coordinates,
  segments: number,
): Coordinates[] {
  const fromLat = degreesToRadians(from.latitude);
  const fromLng = degreesToRadians(from.longitude);
  const toLat = degreesToRadians(to.latitude);
  const toLng = degreesToRadians(to.longitude);
  const delta =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((toLat - fromLat) / 2) ** 2 +
          Math.cos(fromLat) * Math.cos(toLat) * Math.sin((toLng - fromLng) / 2) ** 2,
      ),
    );

  if (delta === 0) {
    return [from, to];
  }

  return Array.from({ length: segments + 1 }, (_, index) => {
    if (index === 0) {
      return from;
    }

    if (index === segments) {
      return to;
    }

    const fraction = index / segments;
    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);
    const x = a * Math.cos(fromLat) * Math.cos(fromLng) + b * Math.cos(toLat) * Math.cos(toLng);
    const y = a * Math.cos(fromLat) * Math.sin(fromLng) + b * Math.cos(toLat) * Math.sin(toLng);
    const z = a * Math.sin(fromLat) + b * Math.sin(toLat);

    return {
      latitude: radiansToDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      longitude: radiansToDegrees(Math.atan2(y, x)),
    };
  });
}

function normalizePlaceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getPlacePatternScore(pattern: string): number {
  return pattern.length - (broadPlacePatterns.has(pattern) ? 100 : 0);
}
