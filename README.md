# CFM Quote Tool

A web-based quote generation and management tool for CFM Distributors, featuring customer lookup, line items with markup calculations, cost page export, print/PDF generation, and cloud quote storage powered by **Supabase**.

---

## Features

- **Quote Generation**: Automatically formats quotes with lead times, part numbers, descriptions, costs, markups, individual unit prices, and line totals.
- **Customer Lookup**: Fast instant search by customer name, city, or account number.
- **Section Subtotals & Notes**: Add project breakdowns and customizable line/general notes.
- **Clean PDF & Cost Page Export**: Formatted for print or clean PDF export without browser headers/footers.
- **Cloud Quote Storage (Supabase)**:
  - **User Accounts**: Users create an account or sign in with email and password.
  - **Save & Update Quotes**: Save active quotes to the cloud or update existing quotes in real-time.
  - **Recall & Edit**: Browse all previously saved quotes, search by customer/quote #, and load them back into the editor with one click.
  - **Duplicate / New from Existing**: Clone an existing quote to start a new draft with a fresh quote number.
  - **Multi-user Security (Row Level Security)**: Each user can only view, edit, and delete their own quotes.
  - **Offline/Local Fallback**: The app still works locally if Supabase is not configured.

---

## Supabase Setup Guide

Follow these steps to connect your Supabase project:

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in or create a free account.
2. Click **New Project**, choose an organization, name your project (e.g. `cfm-quote-tool`), and set a strong database password.
3. Select your preferred region and click **Create new project**.

### 2. Run the Database Schema
1. In your Supabase dashboard, click **SQL Editor** on the left navigation bar.
2. Click **New query**.
3. Open the [`supabase-schema.sql`](supabase-schema.sql) file from this repository and copy its entire content.
4. Paste it into the Supabase SQL Editor and click **Run**.
5. This automatically creates:
   - The `quotes` table with JSON storage for line items and notes.
   - Performance indexes for fast searching by customer name, quote number, and date.
   - An automatic `updated_at` timestamp trigger.
   - **Row Level Security (RLS) policies** ensuring users only access their own quotes.

### 3. Connect the Web App to Supabase
You can connect the web app using either of these two methods:

#### Method A: Directly in the Web App UI (No code edits required)
1. Open `index.html` in your browser.
2. In the top toolbar, click **⚙ Connect Supabase**.
3. In your Supabase dashboard, navigate to **Project Settings** &rarr; **API**:
   - Copy the **Project URL** (e.g., `https://xyzcompany.supabase.co`).
   - Copy the **Project API keys** &rarr; `anon` `public` key (e.g., `eyJhbGciOi...`).
4. Paste them into the modal and click **Save & Connect**.
5. Click **Log In / Sign Up** &rarr; **Create Account** to create your first user account.

#### Method B: In `supabase-config.js`
Open `supabase-config.js` in your text editor and set your credentials:
```javascript
window.SUPABASE_CONFIG = {
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-public-key'
};
```

---

## GitHub & Deployment Instructions

### 1. Git Workflow
This feature is staged on branch `feature/supabase-integration`:

```bash
# Check current status
git status

# Push the branch to GitHub
git push -u origin feature/supabase-integration
```

Then create a Pull Request on GitHub from `feature/supabase-integration` into `main`.

### 2. Deployment (GitHub Pages or Cloudflare Pages)
Because this application is built with standard HTML5, CSS, and vanilla JavaScript, it requires **zero build steps** and can be deployed anywhere static sites are hosted:

- **GitHub Pages**:
  1. Go to repository **Settings** &rarr; **Pages**.
  2. Under **Build and deployment** &rarr; **Branch**, select `main` and `/ (root)`.
  3. Click **Save**. Your tool will be live in minutes!
- **Cloudflare Pages / Netlify / Vercel**:
  - Connect your GitHub repository.
  - Set Build command to empty / none, and Root directory to `/`.

---

## File Structure

```
cfm-Quote-Tool/
├── index.html                   # Main quote tool application UI
├── customers.js                 # Customer autocomplete dataset
├── supabase-schema.sql          # Supabase SQL migration script with RLS
├── supabase-client.js           # Supabase client SDK integration & CRUD methods
├── supabase-ui.js               # Modal dialogs, notifications, and event handlers
├── supabase-ui.css              # Light & dark mode styles for Supabase UI
├── supabase-config.js           # Supabase connection settings
├── supabase-config.example.js   # Template configuration file
├── button-spacing.css           # Button styling
├── logo-black.png               # Brand logo (light mode)
├── logo-white.png               # Brand logo (dark mode)
└── .gitignore                   # Excludes secret overrides and temporary files
```

---

## Security Notes
- The Supabase **Anon Public Key** is intended to be public in client-side web applications.
- Security is strictly enforced on the database level via **Postgres Row Level Security (RLS)** using `auth.uid() = user_id`. Even with the public anon key, unauthorized users cannot view, modify, or delete anyone else's quotes.
