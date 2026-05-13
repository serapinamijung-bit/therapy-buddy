const CACHE_NAME = 'therapy-buddy-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // don't intercept API calls - let them go through normally
  if (e.request.url.includes('script.google.com') ||
      e.request.url.includes('supabase.co') ||
      e.request.url.includes('netlify/functions') ||
      e.request.url.includes('anthropic.com')) {
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
