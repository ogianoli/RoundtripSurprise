# Firebase Cloud Sync

The app keeps local storage as the offline fallback. Firebase sync turns on only when the public Firebase web config values are present in EAS.

## What To Create

1. Open https://console.firebase.google.com.
2. Create a Firebase project, or use an existing one.
3. Add a Web app to the project.
4. Copy the Firebase config values from Project settings.
5. Enable Authentication > Sign-in method > Email/Password.
6. Create Firestore Database in production mode.

## EAS Environment Variables

Add these values to the EAS `production` environment:

```bash
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_API_KEY --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "..."
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_APP_ID --value "..."
```

These are safe to expose in the app bundle. Do not add Firebase service-account keys to Expo.

## Firestore Rules For The Prototype

Use this for the first private TestFlight version:

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if request.auth != null;
    }

    match /tripIndex/{tripId} {
      allow read, write: if request.auth != null;
    }

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /usernames/{username} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }
  }
}
```

This lets signed-in app users share trip documents and the trip list index. The username directory is readable before login so username-based login can find the account email.

Before a public App Store release, tighten this with real authenticated users and member-based rules.

## How It Behaves

- If Firebase env vars are missing, the app stays local-only.
- If Firebase is configured, users create/login with username, email, and password.
- Passwords are handled by Firebase Auth; Firestore only stores user profiles and username lookup entries.
- Trip list membership is stored in `tripIndex` with Firebase user ids; the full cards/calendar/todos live in `trips`.
- Local edits are saved locally first and pushed to Firestore with a short debounce.
- Remote edits from another phone are pulled into the app and then cached locally.
- Push notification device tokens are stored in the same trip document under `pushDevices`.
- Each phone must open Settings and enable surprise alerts once before it can receive reveal notifications.
- Profile photos are disabled in this version to avoid Firebase Storage billing setup.
- PDF files still live locally in this version; cloud file storage for PDFs should be a later pass.

## Registration Troubleshooting

If account creation fails:

1. Check Authentication > Users.
   - If no user was created, enable Authentication > Sign-in method > Email/Password.
   - If a user was created but no `users/{uid}` or `usernames/{username}` document exists, Firestore rules blocked the profile write.
2. Check Firestore Database > Rules, not Realtime Database rules.
3. After changing rules, click Publish.

Official docs:

- Firebase web setup: https://firebase.google.com/docs/web/setup
- Firestore quickstart: https://firebase.google.com/docs/firestore/quickstart
- Anonymous auth: https://firebase.google.com/docs/auth/web/anonymous-auth
