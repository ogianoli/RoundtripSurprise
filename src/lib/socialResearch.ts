import { PlaceRecommendation, PlaceRecommendationGroup } from '../types/trip';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SocialResearchOptions = {
  backendEndpoint?: string;
  fetcher?: Fetcher;
  maxResultsPerTopic?: number;
  youtubeApiKey?: string;
};

type SocialResearchTopic = {
  id: string;
  title: string;
  icon: string;
  searches: string[];
};

type YouTubeSearchResponse = {
  items?: Array<{
    id?: {
      videoId?: string;
    };
    snippet?: {
      channelTitle?: string;
      description?: string;
      title?: string;
    };
  }>;
};

const socialTopics: SocialResearchTopic[] = [
  {
    id: 'date-night',
    title: 'Date night',
    icon: '💞',
    searches: ['date night', 'romantic dinner', 'cocktail bar'],
  },
  {
    id: 'local-food',
    title: 'Food finds',
    icon: '🍜',
    searches: ['best food', 'hidden restaurants', 'street food'],
  },
  {
    id: 'hidden-gems',
    title: 'Hidden gems',
    icon: '✨',
    searches: ['hidden gems', 'things to do', 'local tips'],
  },
];

export async function createSocialResearchGroups(
  place: string,
  options: SocialResearchOptions = {},
): Promise<PlaceRecommendationGroup[]> {
  const backendGroups = await fetchBackendResearch(place, options);
  if (backendGroups) {
    return backendGroups;
  }

  if (!options.youtubeApiKey) {
    return [];
  }

  return Promise.all(
    socialTopics.map(async (topic) => ({
      id: `social-${topic.id}-${slugify(place)}`,
      title: topic.title,
      icon: topic.icon,
      items: await createSocialItems(place, topic, options),
    })),
  );
}

async function fetchBackendResearch(
  place: string,
  options: SocialResearchOptions,
): Promise<PlaceRecommendationGroup[] | undefined> {
  if (!options.backendEndpoint) {
    return undefined;
  }

  try {
    const response = await getFetcher(options.fetcher)(options.backendEndpoint, {
      body: JSON.stringify({ place, topics: socialTopics }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { groups?: PlaceRecommendationGroup[] };
    return Array.isArray(payload.groups) ? payload.groups : [];
  } catch {
    return undefined;
  }
}

async function createSocialItems(
  place: string,
  topic: SocialResearchTopic,
  options: SocialResearchOptions,
): Promise<PlaceRecommendation[]> {
  const youtubeItems = await fetchYouTubeItems(place, topic, options);

  if (youtubeItems.length > 0) {
    return youtubeItems;
  }

  return [];
}

async function fetchYouTubeItems(
  place: string,
  topic: SocialResearchTopic,
  options: SocialResearchOptions,
): Promise<PlaceRecommendation[]> {
  if (!options.youtubeApiKey) {
    return [];
  }

  const maxResults = options.maxResultsPerTopic ?? 2;
  const query = `${topic.searches.join(' | ')} ${place} travel tips`;
  const params = new URLSearchParams({
    key: options.youtubeApiKey,
    maxResults: String(maxResults),
    order: 'relevance',
    part: 'snippet',
    q: query,
    safeSearch: 'moderate',
    type: 'video',
    videoDuration: 'short',
  });

  try {
    const response = await getFetcher(options.fetcher)(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    );
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as YouTubeSearchResponse;
    return (payload.items ?? [])
      .filter((item) => item.id?.videoId && item.snippet?.title)
      .map((item) => ({
        id: `youtube-${topic.id}-${item.id!.videoId}`,
        title: item.snippet!.title!,
        notes: `YouTube tip${item.snippet?.channelTitle ? ` from ${item.snippet.channelTitle}` : ''}.`,
        url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
      }));
  } catch {
    return [];
  }
}

function getFetcher(fetcher?: Fetcher): Fetcher {
  return fetcher ?? fetch;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
