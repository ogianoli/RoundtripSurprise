# Roundtrip Surprise

Private trip-planning app for iPhone builds through Expo EAS and TestFlight.

## Build And Submit

From the project folder:

```bash
cd "/Users/oliviergianoli/Library/Mobile Documents/com~apple~CloudDocs/Desktop_14/Importante/00_myCodes/RoundtripSurprise"
```

Check git first:

```bash
git status
```

If it is not clean, commit and push the intended changes before building:

```bash
git add .
git commit -m "Describe the change"
git push
```

Run checks:

```bash
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/vitest/vitest.mjs run src/lib/itinerary.test.ts --pool forks
node node_modules/vitest/vitest.mjs run src/lib/socialResearch.test.ts --pool forks
node node_modules/vitest/vitest.mjs run src/lib/surprises.test.ts --pool forks
npm run backend:test
```

Build iOS:

```bash
npx eas-cli@latest build --platform ios --profile production --non-interactive
```

After the build finishes, EAS may bump the iOS build number in `app.json`. If that happens:

```bash
git status
git add app.json
git commit -m "Bump iOS build number"
git push
```

Submit the latest build to TestFlight:

```bash
npx eas-cli@latest submit --platform ios --latest
```

## Firebase Before Testing

Before testing account login, trip creation, invites, and live sync, make sure:

- Firebase Authentication > Sign-in method > Email/Password is enabled.
- Firestore Database > Rules uses the rules from `FIREBASE_SYNC.md`.
- The rules are published.

## More Docs

- `DEPLOYMENT.md`: full deployment setup.
- `FIREBASE_SYNC.md`: Firebase environment variables, rules, and troubleshooting.
