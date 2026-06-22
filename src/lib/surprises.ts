import {
  RevealContext,
  RevealedSurprise,
  SurpriseStop,
  SurpriseVisibility,
} from '../types/trip';
import { distanceMeters } from './itinerary';

export const DEFAULT_OWNER_PIN = '4565';
export const OWNER_ACCESS_SEQUENCE = [
  'palette',
  'palette',
  'palette',
  'appearance-title',
  'close-settings',
];

export function doesAccessSequenceUnlock(input: string[], secret = OWNER_ACCESS_SEQUENCE): boolean {
  if (input.length < secret.length) {
    return false;
  }

  return secret.every((step, index) => input[input.length - secret.length + index] === step);
}

export function getSurpriseVisibility(
  surprise: SurpriseStop,
  context: RevealContext,
): SurpriseVisibility {
  if (context.ownerMode) {
    return 'revealed';
  }

  if (surprise.visibility === 'revealed' || shouldAutoReveal(surprise, context)) {
    return 'revealed';
  }

  if (surprise.visibility === 'teaser') {
    return 'teaser';
  }

  return 'hidden';
}

export function getVisibleSurprises(
  surprises: SurpriseStop[],
  context: RevealContext,
): RevealedSurprise[] {
  return surprises
    .map((surprise) => ({
      ...surprise,
      currentVisibility: getSurpriseVisibility(surprise, context),
    }))
    .filter(
      (surprise): surprise is RevealedSurprise => surprise.currentVisibility !== 'hidden',
    );
}

export function revealSurprise(surprises: SurpriseStop[], surpriseId: string): SurpriseStop[] {
  return surprises.map((surprise) =>
    surprise.id === surpriseId ? { ...surprise, visibility: 'revealed' } : surprise,
  );
}

function shouldAutoReveal(surprise: SurpriseStop, context: RevealContext): boolean {
  if (surprise.revealMode === 'time' && surprise.revealAt) {
    return Date.parse(surprise.revealAt) <= context.now.getTime();
  }

  if (
    surprise.revealMode === 'location' &&
    surprise.coordinates &&
    context.currentLocation &&
    surprise.revealRadiusMeters
  ) {
    return (
      distanceMeters(context.currentLocation, surprise.coordinates) <= surprise.revealRadiusMeters
    );
  }

  if (surprise.revealMode === 'after_stop' && surprise.afterStopId) {
    return Boolean(context.completedStopIds?.includes(surprise.afterStopId));
  }

  return false;
}
