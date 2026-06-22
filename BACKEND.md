# Roundtrip Research Backend

This backend is the place where real provider access belongs. The Expo app should not store private API keys.

## What It Does

`POST /research/place`

Input:

```json
{
  "place": "Singapore"
}
```

Output:

```json
{
  "groups": [
    {
      "id": "researched-date-night-singapore",
      "title": "Date night",
      "icon": "💞",
      "items": [
        {
          "id": "youtube-date-night-abc123",
          "title": "Singapore date night ideas",
          "notes": "YouTube from Travel Channel.",
          "sourceLabel": "YouTube",
          "sourceProvider": "youtube",
          "url": "https://www.youtube.com/watch?v=abc123"
        }
      ]
    }
  ],
  "meta": {
    "providers": []
  }
}
```

## Run Locally

From the project folder:

```bash
cp backend/.env.example backend/.env
npm run backend
```

The backend runs on:

```text
http://localhost:8787
```

For the Expo app, set:

```bash
EXPO_PUBLIC_SOCIAL_RESEARCH_ENDPOINT=http://YOUR_MAC_IP:8787/research/place
```

If you are using Expo Go on your phone, `localhost` means the phone, not the Mac. Use your Mac's local IP address, or expose the backend with a tunnel.

## Keys To Get

### YouTube

1. Go to Google Cloud Console.
2. Create or choose a project.
3. Enable `YouTube Data API v3`.
4. Create an API key.
5. Put it in `backend/.env`:

```bash
YOUTUBE_API_KEY=your_key_here
```

Official docs: https://developers.google.com/youtube/v3/docs/search/list

### Google Places

1. Go to Google Cloud Console.
2. Create or choose a project with billing enabled.
3. Enable `Places API`.
4. Create an API key.
5. Restrict it to the backend later when deployed.
6. Put it in `backend/.env`:

```bash
GOOGLE_PLACES_API_KEY=your_key_here
```

Official docs: https://developers.google.com/maps/documentation/places/web-service/text-search

### TikTok

TikTok does not provide a simple public search API for consumer apps. The backend supports TikTok Research API if you get approved access and a client access token with the `research.data.basic` scope.

Put the token in `backend/.env`:

```bash
TIKTOK_RESEARCH_ACCESS_TOKEN=your_token_here
```

Official docs: https://developers.tiktok.com/doc/research-api-specs-query-videos/

## Important

If a provider key is missing, the backend does not invent tips. It reports that the provider is unconfigured and returns results only from configured providers.

