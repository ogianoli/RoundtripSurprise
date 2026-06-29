import test from 'node:test';
import assert from 'node:assert/strict';

import { researchPlace, suggestPlaces } from './research.mjs';

test('reports unavailable providers without credentials', async () => {
  const result = await researchPlace({ env: {}, place: 'Singapore' });

  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.providers.length, 3);
  assert.equal(result.meta.providers.every((provider) => provider.configured === false), true);
});

test('maps YouTube provider results into place recommendation groups', async () => {
  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          id: { videoId: 'abc123' },
          snippet: {
            channelTitle: 'Travel Channel',
            title: 'Singapore date night ideas',
          },
        },
      ],
    }),
  });

  const result = await researchPlace({
    env: { YOUTUBE_API_KEY: 'test-key' },
    fetcher,
    maxResultsPerProvider: 1,
    place: 'Singapore',
  });

  assert.equal(result.groups[0].title, 'Date night');
  assert.equal(result.groups[0].items[0].sourceProvider, 'youtube');
  assert.equal(result.groups[0].items[0].url, 'https://www.youtube.com/watch?v=abc123');
});

test('maps Google Places suggestions into coordinates', async () => {
  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      places: [
        {
          displayName: { text: 'Mondrian Singapore Duxton' },
          formattedAddress: '16A Duxton Hill, Singapore',
          googleMapsUri: 'https://maps.google.com/?cid=123',
          id: 'places/mondrian',
          location: { latitude: 1.2795, longitude: 103.8416 },
        },
      ],
    }),
  });

  const result = await suggestPlaces({
    env: { GOOGLE_PLACES_API_KEY: 'test-key' },
    fetcher,
    query: 'Mondrian Singapore',
  });

  assert.equal(result.suggestions[0].name, 'Mondrian Singapore Duxton');
  assert.equal(result.suggestions[0].coordinates.latitude, 1.2795);
  assert.equal(result.suggestions[0].googleMapsUri, 'https://maps.google.com/?cid=123');
});
