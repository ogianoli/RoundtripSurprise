import test from 'node:test';
import assert from 'node:assert/strict';

import { researchPlace } from './research.mjs';

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

