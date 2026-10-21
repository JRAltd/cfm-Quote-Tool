# CFM Quote Tool

A web-based quote generation and management tool for CFM Distributors, featuring customer lookup, line items with markup calculations, cost page export, print/PDF generation, and cloud quote storage powered by **Firebase (Authentication & Cloud Firestore)**.

---

## Features

- **Quote Generation**: Automatically formats quotes with lead times, part numbers, descriptions, costs, markups, individual unit prices, and line totals.
- **Customer Lookup**: Fast instant search by customer name, city, or account number.
- **Section Subtotals & Notes**: Add project breakdowns and customizable line/general notes.
- **Clean PDF & Cost Page Export**: Formatted for print or clean PDF export without browser headers/footers.
- **Cloud Quote Storage (Firebase)**:
  - **User Accounts**: Users create an account or sign in with email and password via **Firebase Authentication**.
  - **Save & Update Quotes**: Save active quotes to **Cloud Firestore** or update existing quotes in real-time.
  - **Recall & Edit**: Browse all previously saved quotes, search by customer/quote #/account #/PO, and load them back into the editor with one click.
  - **Duplicate / New from Existing**: Clone an existing quote to start a new draft with a fresh quote number.
  - **Multi-user Security (Firestore Security Rules)**: Each user can only view, edit, and delete their own quotes.
  - **Offline/Local Fallback**: The app still works locally if Firebase is not configured.

---

## Firebase Setup Guide

Follow these steps to connect your Firebase project:

### 1. Create a Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com/) and sign in with your Google account.
2. Click **Create a project** (or **Add project**), name your project (e.g. `cfm-quote-tool`), and complete the setup wizard.
3. On the Project Overview page, click the **Web icon (`</>`)** to register a Web App (e.g. `CFM Quote Tool`) and copy the `firebaseConfig` object shown.

### 2. Enable Email/Password Authentication
1. In the Firebase Console sidebar, go to **Build** &rarr; **Authentication** and click **Get started**.
2. Under the **Sign-in method** tab, click **Email/Password**, toggle **Enable** on, and click **Save**.

### 3. Create Cloud Firestore & Publish Security Rules
1. In the Firebase Console sidebar, go to **Build** &rarr; **Firestore Database** and click **Create database**.
2. Choose your preferred location and complete creation.
3. Open the **Rules** tab in Firestore Database.
4. Copy the contents of [`firestore.rules`](firestore.rules) from this repository, paste it into the editor, and click **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /quotes/{quoteId} {
         allow read, update, delete: if request.auth != null && request.auth.uid == resource.data.user_id;
         allow create: if request.auth != null && request.auth.uid == request.resource.data.user_id;
       }
     }
   }
   ```

### 4. Connect the Web App to Firebase
You can connect the web app using either of these two methods:

#### Method A: Directly in the Web App UI (No code edits required)
1. Open `index.html` in your browser.
2. In the top toolbar, click **⚙ Connect Firebase**.
3. Paste your entire `firebaseConfig` snippet into the **Quick Paste** box (which auto-fills the fields), or enter your **Firebase Project ID** and **Web API Key**.
4. Click **Save & Connect**.
5. Click **Log In / Sign Up** &rarr; **Create Account** to create your first user account.

#### Method B: In `firebase-config.js`
Open `firebase-config.js` in your text editor and set your credentials:
```javascript
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSy...',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef123456'
};
```

---

## Deployment (GitHub Pages, Firebase Hosting, or Cloudflare Pages)

Because this application is built with standard HTML5, CSS, and vanilla JavaScript, it requires **zero build steps** and can be deployed anywhere static sites are hosted:

- **GitHub Pages**:
  1. Go to repository **Settings** &rarr; **Pages**.
  2. Under **Build and deployment** &rarr; **Branch**, select `main` and `/ (root)`.
  3. Click **Save**.
  *(Note: When deploying to a custom domain or `github.io`, add that domain under Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains).*
- **Firebase Hosting / Cloudflare Pages / Netlify / Vercel**:
  - Set Build command to empty / none, and Root directory to `/`.

---

## File Structure

```
cfm-Quote-Tool/
├── index.html                   # Main quote tool application UI
├── customers.js                 # Customer autocomplete dataset
├── firestore.rules              # Cloud Firestore Security Rules
├── firebase-client.js           # Firebase Auth & Cloud Firestore CRUD client
├── firebase-ui.js               # Modal dialogs, notifications, and event handlers
├── firebase-ui.css              # Light & dark mode styles for Firebase UI
├── firebase-config.js           # Firebase connection settings
├── firebase-config.example.js   # Template configuration file
├── button-spacing.css           # Button styling
├── logo-black.png               # Brand logo (light mode)
├── logo-white.png               # Brand logo (dark mode)
└── .gitignore                   # Excludes secret overrides and temporary files
```

---

## Security Notes
- Firebase Web API keys and configuration values identify your Firebase project on the client and are safe to include in client-side web applications.
- Security is strictly enforced on the database level via **Cloud Firestore Security Rules** (`firestore.rules`) using `request.auth.uid == resource.data.user_id`. Unauthorized users cannot view, modify, or delete anyone else's quotes.
