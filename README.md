<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/53c12559-6ee5-4b82-909a-ec49331ea039

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Android API connection

The Android build uses `VITE_API_BASE_URL` for the remote Express/ Gemini backend.
The default native API origin is the Cloud Run URL already embedded in the previously
provided VEER APK. Set `VITE_API_BASE_URL` at build time if the backend is moved.
Web builds continue to use same-origin `/api` routes. Keep `GEMINI_API_KEY` only
on the server; never add it to a `VITE_` variable or the Android app.
