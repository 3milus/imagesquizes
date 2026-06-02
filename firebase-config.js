// ─────────────────────────────────────────────────────────────────────────────
// Firebase setup — fill this in to enable multiplayer rooms.
//
// Steps:
//  1. Go to https://console.firebase.google.com/ and create a project.
//  2. Inside the project: Build → Realtime Database → Create database
//     Pick a region, start in "test mode" (you can lock it down later).
//  3. Inside the project: Build → Authentication → Sign-in method
//     Enable "Anonymous" sign-in.
//  4. Go to Project Settings → Your apps → Add app (Web icon </>).
//     Copy the firebaseConfig object values into the fields below.
//  5. Save this file and push to GitHub. Multiplayer will appear automatically.
//
// Firebase security rules (paste into Realtime Database → Rules tab):
// {
//   "rules": {
//     "rooms": {
//       "$code": {
//         ".read": "auth != null",
//         ".write": "auth != null"
//       }
//     }
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  databaseURL:       'https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID'
};
