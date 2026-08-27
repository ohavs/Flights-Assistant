import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'עוזר טיסות — Flights Assistant',
        short_name: 'עוזר טיסות',
        description: 'אפליקציית עזר לטיסות ותכנון טיולים',
        theme_color: '#0b0b30',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        dir: 'rtl',
        lang: 'he',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        // Share Target (Android/Chrome, installed PWA) — puts the app in the
        // system share sheet, so sharing a place from Google Maps lands on
        // /share with the place name and its link as query params.
        share_target: {
          action: '/share',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
          },
        },
        // Long-press shortcuts (Android) — show up next to the home-screen
        // icon so the user can jump directly to a feature without first
        // opening the app and tapping through tabs.
        shortcuts: [
          {
            name: 'הטיולים שלי',
            short_name: 'טיולים',
            description: 'רשימת הטיולים',
            url: '/?screen=home',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'המרת מטבעות',
            short_name: 'מטבעות',
            description: 'מחשבון המרת מטבעות עם נתונים אופליין',
            url: '/?screen=converter',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/leaflet.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'leaflet-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Basemap tiles for the flight-path map: Esri's Gray Canvas, plus
            // OpenStreetMap because MapComponent falls back to it if Esri stops
            // answering. Must track every host MapComponent can ask for — a
            // stale pattern means tiles are never cached and the map is blank
            // offline. maxEntries covers two layers (ground + labels) now.
            urlPattern: /^https:\/\/(server\.arcgisonline\.com|tile\.openstreetmap\.org)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Currency exchange rates — keep last response for offline.
            urlPattern: /^https:\/\/api\.frankfurter\.app\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'currency-rates-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'weather-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 }
            }
          },
          {
            // Hebrew TTF served from /fonts (for PDF export) — cache long.
            urlPattern: /\/fonts\/.*\.ttf$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-local-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
})
