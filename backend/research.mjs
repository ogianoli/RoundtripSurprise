const defaultTopics = [
  {
    id: 'date-night',
    title: 'Date night',
    icon: '💞',
    searches: ['date night', 'romantic dinner', 'cocktail bar'],
    placeType: 'restaurant',
  },
  {
    id: 'food-finds',
    title: 'Food finds',
    icon: '🍜',
    searches: ['best food', 'hidden restaurants', 'street food'],
    placeType: 'restaurant',
  },
  {
    id: 'hidden-gems',
    title: 'Hidden gems',
    icon: '✨',
    searches: ['hidden gems', 'things to do', 'local tips'],
    placeType: 'tourist_attraction',
  },
];

export async function researchPlace({
  env = process.env,
  fetcher = fetch,
  maxResultsPerProvider = 2,
  place,
  topics = defaultTopics,
}) {
  const cleanPlace = String(place ?? '').trim();

  if (!cleanPlace) {
    return {
      groups: [],
      meta: {
        errors: ['Missing place'],
        providers: [],
      },
    };
  }

  const providerStatuses = [];
  const groupMap = new Map(
    topics.map((topic) => [
      topic.id,
      {
        id: `researched-${topic.id}-${slugify(cleanPlace)}`,
        icon: topic.icon,
        items: [],
        title: topic.title,
      },
    ]),
  );

  const providers = [
    youtubeProvider({ env, fetcher, maxResultsPerProvider }),
    googlePlacesProvider({ env, fetcher, maxResultsPerProvider }),
    tiktokProvider({ env, fetcher, maxResultsPerProvider }),
  ];

  for (const provider of providers) {
    const result = await provider.search({ place: cleanPlace, topics });
    providerStatuses.push(result.status);

    for (const topicResult of result.topicResults) {
      const group = groupMap.get(topicResult.topicId);
      if (group) {
        group.items.push(...topicResult.items);
      }
    }
  }

  return {
    groups: [...groupMap.values()].filter((group) => group.items.length > 0),
    meta: {
      fetchedAt: new Date().toISOString(),
      place: cleanPlace,
      providers: providerStatuses,
    },
  };
}

export async function suggestPlaces({
  env = process.env,
  fetcher = fetch,
  maxResults = 5,
  query,
}) {
  const cleanQuery = String(query ?? '').trim();

  if (!cleanQuery) {
    return {
      suggestions: [],
      meta: {
        errors: ['Missing query'],
        provider: { configured: false, id: 'google-places', label: 'Google Places API' },
      },
    };
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      suggestions: [],
      meta: {
        errors: ['Set GOOGLE_PLACES_API_KEY to enable place suggestions.'],
        provider: { configured: false, id: 'google-places', label: 'Google Places API' },
      },
    };
  }

  try {
    const response = await fetcher('https://places.googleapis.com/v1/places:searchText', {
      body: JSON.stringify({
        maxResultCount: maxResults,
        textQuery: cleanQuery,
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location',
      },
      method: 'POST',
    });

    if (!response.ok) {
      return {
        suggestions: [],
        meta: {
          errors: [`Google Places returned ${response.status}.`],
          provider: { configured: true, id: 'google-places', label: 'Google Places API' },
        },
      };
    }

    const payload = await response.json();
    const suggestions = (payload.places ?? [])
      .filter((place) => place.displayName?.text && place.location)
      .map((place) => ({
        address: place.formattedAddress,
        coordinates: {
          latitude: place.location.latitude,
          longitude: place.location.longitude,
        },
        googleMapsUri: place.googleMapsUri,
        id: place.id,
        name: place.displayName.text,
      }));

    return {
      suggestions,
      meta: {
        fetchedAt: new Date().toISOString(),
        provider: { configured: true, id: 'google-places', label: 'Google Places API' },
        query: cleanQuery,
      },
    };
  } catch {
    return {
      suggestions: [],
      meta: {
        errors: ['Could not fetch Google Places suggestions.'],
        provider: { configured: true, id: 'google-places', label: 'Google Places API' },
      },
    };
  }
}

function youtubeProvider({ env, fetcher, maxResultsPerProvider }) {
  return {
    async search({ place, topics }) {
      const apiKey = env.YOUTUBE_API_KEY;
      if (!apiKey) {
        return unavailableProvider('youtube', 'Set YOUTUBE_API_KEY to enable YouTube Data API search.');
      }

      const topicResults = [];

      for (const topic of topics) {
        const query = `${topic.searches.join(' | ')} ${place} travel tips`;
        const params = new URLSearchParams({
          key: apiKey,
          maxResults: String(maxResultsPerProvider),
          order: 'relevance',
          part: 'snippet',
          q: query,
          safeSearch: 'moderate',
          type: 'video',
          videoDuration: 'short',
        });

        try {
          const response = await fetcher(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
          if (!response.ok) {
            topicResults.push({ items: [], topicId: topic.id });
            continue;
          }

          const payload = await response.json();
          const items = (payload.items ?? [])
            .filter((item) => item.id?.videoId && item.snippet?.title)
            .map((item) => ({
              id: `youtube-${topic.id}-${item.id.videoId}`,
              notes: `YouTube${item.snippet.channelTitle ? ` from ${item.snippet.channelTitle}` : ''}.`,
              sourceLabel: 'YouTube',
              sourceProvider: 'youtube',
              title: item.snippet.title,
              url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            }));

          topicResults.push({ items, topicId: topic.id });
        } catch {
          topicResults.push({ items: [], topicId: topic.id });
        }
      }

      return {
        status: { configured: true, id: 'youtube', label: 'YouTube Data API' },
        topicResults,
      };
    },
  };
}

function googlePlacesProvider({ env, fetcher, maxResultsPerProvider }) {
  return {
    async search({ place, topics }) {
      const apiKey = env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        return unavailableProvider('google-places', 'Set GOOGLE_PLACES_API_KEY to enable Google Places search.');
      }

      const topicResults = [];

      for (const topic of topics) {
        const textQuery = `${topic.searches[0]} in ${place}`;

        try {
          const response = await fetcher('https://places.googleapis.com/v1/places:searchText', {
            body: JSON.stringify({
              includedType: topic.placeType,
              maxResultCount: maxResultsPerProvider,
              textQuery,
            }),
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount',
            },
            method: 'POST',
          });

          if (!response.ok) {
            topicResults.push({ items: [], topicId: topic.id });
            continue;
          }

          const payload = await response.json();
          const items = (payload.places ?? []).map((foundPlace) => {
            const title = foundPlace.displayName?.text ?? 'Google Places result';
            const rating =
              foundPlace.rating && foundPlace.userRatingCount
                ? `${foundPlace.rating} stars from ${foundPlace.userRatingCount} ratings.`
                : 'Google Places result.';

            return {
              id: `google-places-${topic.id}-${slugify(title)}`,
              notes: `${rating}${foundPlace.formattedAddress ? ` ${foundPlace.formattedAddress}` : ''}`,
              sourceLabel: 'Google Places',
              sourceProvider: 'google-places',
              title,
              url: foundPlace.googleMapsUri,
            };
          });

          topicResults.push({ items, topicId: topic.id });
        } catch {
          topicResults.push({ items: [], topicId: topic.id });
        }
      }

      return {
        status: { configured: true, id: 'google-places', label: 'Google Places API' },
        topicResults,
      };
    },
  };
}

function tiktokProvider({ env, fetcher, maxResultsPerProvider }) {
  return {
    async search({ place, topics }) {
      const accessToken = env.TIKTOK_RESEARCH_ACCESS_TOKEN;
      if (!accessToken) {
        return unavailableProvider(
          'tiktok',
          'Set TIKTOK_RESEARCH_ACCESS_TOKEN after approved TikTok Research API access.',
        );
      }

      const topicResults = [];

      for (const topic of topics) {
        try {
          const response = await fetcher(
            'https://open.tiktokapis.com/v2/research/video/query/?fields=id,video_description,create_time,view_count,like_count,comment_count,username',
            {
              body: JSON.stringify({
                max_count: maxResultsPerProvider,
                query: {
                  and: [
                    {
                      field_name: 'keyword',
                      field_values: [`${topic.searches[0]} ${place}`],
                      operation: 'EQ',
                    },
                  ],
                },
              }),
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              method: 'POST',
            },
          );

          if (!response.ok) {
            topicResults.push({ items: [], topicId: topic.id });
            continue;
          }

          const payload = await response.json();
          const videos = payload.data?.videos ?? payload.videos ?? [];
          const items = videos.map((video) => {
            const url = video.username && video.id ? `https://www.tiktok.com/@${video.username}/video/${video.id}` : undefined;
            const engagement = [
              video.view_count ? `${video.view_count} views` : '',
              video.like_count ? `${video.like_count} likes` : '',
            ]
              .filter(Boolean)
              .join(', ');

            return {
              id: `tiktok-${topic.id}-${video.id}`,
              notes: `${engagement || 'TikTok Research API result.'} ${video.video_description ?? ''}`.trim(),
              sourceLabel: 'TikTok',
              sourceProvider: 'tiktok',
              title: trimTitle(video.video_description ?? `TikTok tip for ${place}`),
              url,
            };
          });

          topicResults.push({ items, topicId: topic.id });
        } catch {
          topicResults.push({ items: [], topicId: topic.id });
        }
      }

      return {
        status: { configured: true, id: 'tiktok', label: 'TikTok Research API' },
        topicResults,
      };
    },
  };
}

function unavailableProvider(id, reason) {
  return {
    status: { configured: false, id, reason },
    topicResults: defaultTopics.map((topic) => ({ items: [], topicId: topic.id })),
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function trimTitle(value) {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}
