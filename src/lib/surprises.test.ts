import { describe, expect, it } from 'vitest';

import { SurpriseStop } from '../types/trip';
import {
  DEFAULT_OWNER_PIN,
  doesAccessSequenceUnlock,
  getSurpriseVisibility,
  getVisibleSurprises,
  revealSurprise,
} from './surprises';

const baseSurprise: SurpriseStop = {
  id: 'secret-dinner',
  title: 'Secret dinner',
  city: 'Ubud',
  country: 'Indonesia',
  coordinates: { latitude: -8.5069, longitude: 115.2625 },
  message: 'Dinner is booked.',
  teaser: 'Something is waiting in Ubud.',
  revealMode: 'manual',
  visibility: 'hidden',
  createdBy: 'owner',
  createdAt: '2026-06-17T12:00:00+02:00',
};

describe('surprise helpers', () => {
  it('keeps the default owner pin explicit for the first prototype', () => {
    expect(DEFAULT_OWNER_PIN).toBe('4565');
  });

  it('unlocks only when the hidden settings gesture sequence is the latest sequence', () => {
    expect(doesAccessSequenceUnlock(['palette', 'palette', 'appearance-title'])).toBe(false);
    expect(
      doesAccessSequenceUnlock([
        'noise',
        'palette',
        'palette',
        'palette',
        'appearance-title',
        'close-settings',
      ]),
    ).toBe(true);
    expect(
      doesAccessSequenceUnlock(['palette', 'palette', 'palette', 'close-settings', 'appearance-title']),
    ).toBe(false);
  });

  it('shows hidden surprises to owner mode only', () => {
    expect(
      getSurpriseVisibility(baseSurprise, {
        ownerMode: false,
        now: new Date('2026-06-17T12:00:00+02:00'),
      }),
    ).toBe('hidden');

    expect(
      getSurpriseVisibility(baseSurprise, {
        ownerMode: true,
        now: new Date('2026-06-17T12:00:00+02:00'),
      }),
    ).toBe('revealed');
  });

  it('allows teaser cards without exposing the full message', () => {
    const teaser = { ...baseSurprise, visibility: 'teaser' as const };
    const visible = getVisibleSurprises([teaser], {
      ownerMode: false,
      now: new Date('2026-06-17T12:00:00+02:00'),
    });

    expect(visible).toHaveLength(1);
    expect(visible[0].currentVisibility).toBe('teaser');
  });

  it('reveals timed surprises once their reveal time passes', () => {
    const timed = {
      ...baseSurprise,
      revealMode: 'time' as const,
      revealAt: '2026-07-11T07:30:00+08:00',
    };

    expect(
      getSurpriseVisibility(timed, {
        ownerMode: false,
        now: new Date('2026-07-11T07:31:00+08:00'),
      }),
    ).toBe('revealed');
  });

  it('reveals nearby surprises inside the radius', () => {
    const nearby = {
      ...baseSurprise,
      revealMode: 'location' as const,
      revealRadiusMeters: 100,
    };

    expect(
      getSurpriseVisibility(nearby, {
        ownerMode: false,
        now: new Date('2026-06-17T12:00:00+02:00'),
        currentLocation: { latitude: -8.50692, longitude: 115.26251 },
      }),
    ).toBe('revealed');
  });

  it('marks a surprise as revealed manually', () => {
    const updated = revealSurprise([baseSurprise], baseSurprise.id);

    expect(updated[0].visibility).toBe('revealed');
  });
});
