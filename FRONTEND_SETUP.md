# Frontend Developer Setup - Live Database Connection Guide

This guide helps you connect your local Next.js development server to our shared cloud Supabase database. 

By using the cloud database, **you do not need to install Docker Desktop or run local database containers** on your PC!

---

## 1. Setup Instructions

### Step 1: Create your Environment File
In the root directory of the project, create a file named:
```text
.env.local
```

### Step 2: Paste the Configuration Template
Copy and paste the configuration block below into your new `.env.local` file. 

*(Replace the placeholder values with the real keys sent to you by email)*:
```env
# Shared Cloud Supabase Configuration
# (Obtain the secret values from the team email)

NEXT_PUBLIC_SUPABASE_URL=https://dcopjwapiqeqyjesdzmq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_THE_SECRET_KEY_RECEIVED_VIA_EMAIL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PASTE_THE_SECRET_KEY_RECEIVED_VIA_EMAIL
```

### Step 3: Launch Next.js Dev Server
Once the variables are saved, launch the local developer compiler:
```bash
npm run dev
```

### Step 4: Verify the Connection
1.  Open your browser to [http://localhost:3000](http://localhost:3000).
2.  Click **"Sign in to verify"** in the top-right header and log in with Google.
3.  If your Google account avatar and name load successfully, you are connected to the live database!

---

## 2. Developing Offline (No Database Needed)

If you have no internet access or want to write code without database calls, simply **rename or delete** your `.env.local` file. 

The application is built to detect the lack of environment keys and automatically switch to **Local Storage Mode**:
*   All reported markers, warning paths, and logs will read and write to your browser's local cache.
*   Clicking sign-in will log you into a mock **"Demo Session"** profile so you can test voting controls.
