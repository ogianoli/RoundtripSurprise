import { describe, expect, it } from 'vitest';

import { createSocialResearchGroups } from './socialResearch';

describe('social research helpers', () => {
  it('returns no social tips without API or backend config', async () => {
    const groups = await createSocialResearchGroups('Singapore');

    expect(groups).toEqual([]);
  });

  it('maps YouTube API results into recommendation links', async () => {
    const fetcher = async () =>
      ({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: 'abc123' },
              snippet: {
                channelTitle: 'Travel Channel',
                title: 'Best Singapore date night spots',
              },
            },
          ],
        }),
      }) as Response;

    const groups = await createSocialResearchGroups('Singapore', {
      fetcher,
      youtubeApiKey: 'test-key',
    });

    expect(groups[0].items.some((item) => item.url?.includes('watch?v=abc123'))).toBe(true);
  });

  it('does not add fallback links when a configured backend returns no groups', async () => {
    const fetcher = async () =>
      ({
        ok: true,
        json: async () => ({ groups: [] }),
      }) as Response;

    const groups = await createSocialResearchGroups('Singapore', {
      backendEndpoint: 'http://localhost:8787/research/place',
      fetcher,
    });

    expect(groups).toEqual([]);
  });
});
