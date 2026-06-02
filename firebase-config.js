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
  apiKey:            'AIzaSyCSd_F0czxhYthUQ_wM1_nTERALgxscBt0',
  authDomain:        'imagesquizzes.firebaseapp.com',
  databaseURL:       'https://imagesquizzes-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'imagesquizzes',
  storageBucket:     'imagesquizzes.firebasestorage.app',
  messagingSenderId: '606575268785',
  appId:             '1:606575268785:web:21f7564e2bb347c295e390'
};
