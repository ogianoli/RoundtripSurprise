# Roundtrip Surprise Deployment

This is the production path for a real iPhone install through TestFlight.

## 1. Apple Access

Use the same Apple ID for all Apple steps.

1. Enroll in the Apple Developer Program at https://developer.apple.com/programs/.
2. Wait for Apple to confirm the membership is active.
3. Open https://appstoreconnect.apple.com.
4. If asked, accept any updated developer agreements.
5. Go to Apps and create a new app when you are ready to submit.

If EAS or App Store Connect shows no Apple team, the Apple ID is probably not enrolled in the paid Developer Program yet, or the membership/agreements are not active yet.

## 2. Backend On Render

The phone app cannot use `localhost` on your Mac. It needs a public HTTPS backend.

Recommended first backend host: Render.

1. Push this project to a GitHub repository.
2. Create a Render account at https://render.com.
3. In Render, create a new Blueprint and connect the GitHub repository.
4. Render will read `render.yaml`.
5. When Render asks for secret values, enter:

```text
YOUTUBE_API_KEY=your_youtube_key
GOOGLE_PLACES_API_KEY=your_google_places_key
TIKTOK_RESEARCH_ACCESS_TOKEN=
```

Leave TikTok empty until you have approved access.

Render will create a URL like:

```text
https://roundtrip-research-backend.onrender.com
```

Test it in your browser:

```text
https://roundtrip-research-backend.onrender.com/health
```

Expected response:

```json
{"ok":true}
```

The app endpoint will be:

```text
https://roundtrip-research-backend.onrender.com/research/place
```

## 3. EAS Environment Variable

After the backend is live, add the public backend endpoint to EAS:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SOCIAL_RESEARCH_ENDPOINT --value https://YOUR_RENDER_URL/research/place --environment production --visibility plaintext
```

Use the real Render URL.

## 4. Build

From the project folder:

```bash
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios --profile production
```

When EAS asks about Apple credentials, let EAS manage certificates and provisioning profiles.

If Firebase sync is enabled, add the Firebase `EXPO_PUBLIC_FIREBASE_*` values from `FIREBASE_SYNC.md` before building.

## 5. Submit To TestFlight

After the iOS build succeeds:

```bash
npx eas-cli@latest submit --platform ios --latest
```

Then wait for App Store Connect processing and install through the TestFlight app on the iPhone.
