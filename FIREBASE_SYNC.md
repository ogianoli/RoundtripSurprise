# Firebase Cloud Sync

The app keeps local storage as the offline fallback. Firebase sync turns on only when the public Firebase web config values are present in EAS.

## What To Create

1. Open https://console.firebase.google.com.
2. Create a Firebase project, or use an existing one.
3. Add a Web app to the project.
4. Copy the Firebase config values from Project settings.
5. Enable Authentication > Sign-in method > Anonymous.
6. Create Firestore Database in production mode.

## EAS Environment Variables

Add these values to the EAS `production` environment:

```bash
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_API_KEY --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_APP_ID --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_TRIP_ID --value "singapore-indonesia-2026"
```

These are safe to expose in the app bundle. Do not add Firebase service-account keys to Expo.

## Firestore Rules For The Prototype

Use this for the first private TestFlight version:

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/singapore-indonesia-2026 {
      allow read, write: if request.auth != null;
    }
  }
}
```

This lets signed-in app users share the one trip document. The app signs in anonymously.

Before a public App Store release, tighten this with a proper member list or invite code.

## How It Behaves

- If Firebase env vars are missing, the app stays local-only.
- If Firebase is configured, the app signs in anonymously and syncs the shared trip document.
- Local edits are saved locally first and pushed to Firestore with a short debounce.
- Remote edits from another phone are pulled into the app and then cached locally.
- PDF files still live locally in this version; cloud file storage for PDFs/photos should be a later pass.

Official docs:

- Firebase web setup: https://firebase.google.com/docs/web/setup
- Firestore quickstart: https://firebase.google.com/docs/firestore/quickstart
- Anonymous auth: https://firebase.google.com/docs/auth/web/anonymous-auth
