# The Grand Journey of Deployment: From Localhost to the Cloud 🚀

So, you've built VideoMind! It works perfectly on your computer... but right now, nobody else in the world can see it. 

Welcome to the **Deployment guide**. This document explains exactly what deployment means, the story of how your app moves to the cloud, what changes we must make, and how we handle Google Auth in production.

---

## 📖 Chapter 1: What Actually *is* Deployment?

Imagine you built a magnificent, high-tech library (your app). 
Right now, this library is built in your own private, locked backyard (`localhost`). You can go in, read books, and use the computers. But if you tell your friend "Hey, come to my library!", they can't—because it's not on a public street map.

**Localhost (`127.0.0.1` or `localhost:5173`)** simply means "this computer". When you run your code locally, your computer is talking to itself.

**Deployment** is the process of picking up your library from your backyard and moving it to a public city street (the Internet) and giving it an official address (a domain name or URL). 

To do this, we need **servers**—computers that run 24/7 without ever turning off. We are going to rent two servers:
1. **Vercel** - The perfect host for our **Frontend** (React/Vite). It serves our visual website to the user.
2. **Render** - The perfect host for our **Backend** (Django). It handles the heavy lifting, the database, FFmpeg, AI integrations, and APIs.

---

## ⚖️ Chapter 2: Before vs. After Deploying (The Map of Changes)

When we move our app to the internet, our code needs to know its new "address". Right now, your frontend and backend talk to each other using local addresses. This has to change.

### The Big Shift
| Feature | Before Deploying (Localhost) 🏠 | After Deploying (Cloud) ☁️ |
|---------|---------------------------------|-----------------------------|
| **Frontend URL** | `http://localhost:5173` | `https://videomind.vercel.app` (Example) |
| **Backend URL** | `http://localhost:8000` | `https://videomind-api.onrender.com` (Example) |
| **API Calls** | Frontend asks `localhost:8000/api` | Frontend asks `https://videomind-api.onrender.com/api` |
| **CORS** | Backend trusts `localhost:5173` | Backend MUST trust `https://videomind.vercel.app` |
| **Database** | SQLite (`db.sqlite3` file) | PostgreSQL (Render provides a real database) |
| **Google Auth** | Google redirects to `localhost` | Google redirects to your live Vercel/Render URLs |

---

## 🛠️ Chapter 3: The Action Plan (Where do we start?)

Here is the exact step-by-step storyline of changes we need to make to your codebase *before* pushing to GitHub for deployment.

### Step 1: Frontend Changes (Preparing for Vercel)
Right now, your frontend is hardcoded to talk to your computer's backend.

**What we must do:** 
In `frontend/src/services/api.js`, we need to change how `API_BASE_URL` is defined.
* **Before:** `const API_BASE_URL = 'http://localhost:8000/api';`
* **After:**
  ```javascript
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  ```
* **Why?** This tells the frontend: "If we are in the cloud, use the cloud URL. If we are on my laptop, use localhost."

### Step 2: Backend Changes (Preparing for Render)
Django needs security updates before it goes live.

**What we must do in `backend/config/settings.py`:**
1. **Turn off Debug Mode:** 
   * **Before:** `DEBUG = True`
   * **After:** `DEBUG = os.getenv('DEBUG', 'False') == 'True'` (Keeps it true locally, false in cloud).
2. **Allowed Hosts:** Django blocks unknown domains. We must whitelist Render.
   * **After:** `ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'your-app.onrender.com']`
3. **CORS Origins:** We must tell Django to accept API requests from Vercel.
   * **Before:** `CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]`
   * **After:** Add `"https://your-frontend.vercel.app"` to the list.
4. **Prepare for a Production Web Server:** Render doesn't use `python manage.py runserver`. It uses a production server called `gunicorn`, and needs `whitenoise` to serve static files. 
   * Add `gunicorn` and `whitenoise` to `backend/requirements.txt`.
   * Configure `whitenoise` middleware in `settings.py`.
   * Create a `build.sh` script for Render to run migrations automatically.

---

## 🔑 Chapter 4: Setting the Secrets (API Keys & Environment Variables)

When running locally, you stored secrets in a `.env` file. We **do not** upload `.env` to GitHub because it's public. So, how does Vercel or Render get our API keys?

Through **Environment Variables dashboards** on their platforms!

### On Render (Backend Dashboard):
You will manually paste these into Render's Environment Variables settings:
* `GROQ_API_KEY` = `your-groq-key`
* `OPENAI_API_KEY` = `your-openai-key`
* `GOOGLE_CLIENT_ID` = `your-google-id`
* `GOOGLE_CLIENT_SECRET` = `your-google-secret`
* `SECRET_KEY` = `a-random-long-secure-django-string`

### On Vercel (Frontend Dashboard):
You will manually paste these into Vercel's Environment Variables settings:
* `VITE_GOOGLE_CLIENT_ID` = `your-google-id`
* `VITE_API_BASE_URL` = `https://your-backend.onrender.com/api`

---

## 🔐 Chapter 5: Taming the Google Cloud Console (The Auth Fix)

This is where 90% of deployments fail! Google is very strict. You told Google that `localhost:5173` is allowed to use your Google Login. When a user tries to log in from `videomind.vercel.app`, Google will scream **"Unauthorized Client!"** and block them.

**What we must do in Google Cloud Console:**

1. Go to **Google Cloud Console** > **APIs & Services** > **Credentials**.
2. Click on your existing **OAuth 2.0 Client ID** (the one for Web Application).
3. Look at **Authorized JavaScript origins**.
   * **Old:** `http://localhost:5173`
   * **Action:** Click "Add URI" and paste your new Vercel URL: `https://your-frontend.vercel.app`
4. Look at **Authorized redirect URIs**.
   * **Old:** `http://localhost:5173` and `http://localhost:8000/accounts/google/login/callback/`
   * **Action:** Click "Add URI" and paste:
     * `https://your-frontend.vercel.app`
     * `https://your-backend.onrender.com/accounts/google/login/callback/`
5. Click **Save**. (It may take 5 minutes to take effect).

*Note: Since your app is still in "Testing" mode in Google Cloud, you will only be able to log in with test emails you specifically added in the "OAuth consent screen" tab. To let anyone log in, you must eventually click "Publish App".*

---

## 🎬 Chapter 6: The Final Deployment Steps (The Climax)

Once the code changes are done in your editor, the actual deployment looks like this:

1. **Push to GitHub**: You commit all these changes and push your code to your GitHub repository.
2. **Deploy Backend (Render)**:
   * Log into Render, click "New Web Service".
   * Connect your GitHub repo. Set the Root Directory to `backend`.
   * Build Command: `pip install -r requirements.txt` (or `./build.sh` if you made one).
   * Start Command: `gunicorn config.wsgi:application`
   * Paste your Environment Variables.
   * Click Deploy. Wait approx 5 minutes until you get your `onrender.com` link.
3. **Deploy Frontend (Vercel)**:
   * Log into Vercel, click "Add New Project".
   * Connect your GitHub repo. Set the Root Directory to `frontend`.
   * Vercel will automatically detect Vite. 
   * Open "Environment Variables", paste `VITE_API_BASE_URL` (using the Render link you just got) and `VITE_GOOGLE_CLIENT_ID`.
   * Click Deploy. Within 2 minutes, your site is live globally!

### Congratulations! 🎉
Your house has been successfully moved from the forest to the city center. You have a frontend URL. You have a backend URL. Google knows about both of them. And your users can now upload videos and generate PDFs from anywhere in the world!
