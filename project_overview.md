# Flights-Assistant — Project Overview & Architecture

## Introduction
Flights-Assistant is a mobile-first, premium Progressive Web Application (PWA) designed to assist travelers in planning, tracking, and managing their flight and hotel bookings, packing checklists, and trip itineraries. The app is optimized for mobile screens, supports full offline capability, synchronizes with Firestore in real-time, and supports collaborative editing between users.

---

## Technical Stack & Architecture

### Frontend Layer
- **React (Vite)**: Clean, modern React application bundled with Vite for fast HMR and high-performance production builds.
- **RTL (Right-to-Left)**: Fully localized and oriented for Hebrew, ensuring alignment, input behavior, and UI layouts adhere to RTL standards.
- **Lucide React**: Lightweight vector icons to ensure premium, high-resolution visuals.

### Data & Synchronization Layer
- **Firebase Firestore**: Multi-level real-time document synchronization. 
  - Each trip is stored as a root document: `/trips/{tripId}`
  - Itinerary details are subcollections: `/trips/{tripId}/planning`
  - Checklist tasks are subcollections: `/trips/{tripId}/checklist`
- **Multi-User Collaboration**: Allows multiple registered Google users to share access to the same trip by entering their Google email. The app synchronizes changes across all users in real-time.
- **Offline Support**: Firestore's offline persistence layer is configured to cache data locally. If a traveler goes offline (e.g., in flight or roaming without internet), changes are queued and synced automatically when a connection is re-established.

### PWA Capabilities
- **Service Worker**: Caches main bundles, HTML, CSS, JavaScript, and assets (fonts, icons).
- **Web App Manifest**: Fully customized with launcher icons, themed splash screens, and configured to run in standalone window mode.

---

## Styling & Design System (`index.css`)
Flights-Assistant uses a custom-tailored dark glassmorphic design system to create a premium feel. Key design tokens include:

- **Colors**:
  - Primary Theme (Dark Navy): `#0b0b30`
  - Accent Color (Indigo Purple): `#4f46e5`
  - Safe Success Green: `#059669`
  - Gradients: Sleek background color blends (`#e0e7ff` to `#fae8ff`).
- **Glassmorphism**: `.glass-card` classes utilize `rgba` background fills, thin white borders (`rgba(255,255,255,0.7)`), and heavy backdrop blur filters (`blur(16px)`) to mimic frosted glass.
- **Micro-Animations**:
  - Pulse states for active elements.
  - Smooth card pulsing highlights (`.highlight-pulse`) utilizing glowing indigo shadows to draw attention to specific sections.

---

## Key Components

### 1. `FlightTab.jsx`
- Displays outbound and return flight information, aircraft registration details, and flight status.
- Integrates a leaflet-based map (`MapComponent.jsx`) to show path routing and real-time flight progress.
- Features automatic simulation/lookup of flight statistics using local simulator databases when flight codes and dates are entered.
- Stacks form inputs vertically (specifically check-in/check-out fields) to prevent mobile layout breaks.

### 2. `CustomDatePicker.jsx`
- Custom Hebrew/RTL calendar component overlay.
- Exposes `CustomDatePicker` (date-only) and `CustomDateTimePicker` (date + time).
- Implements custom selectors that override native OS date-pickers, preserving theme aesthetics.

### 3. `PlanningTab.jsx` & `ChecklistTab.jsx`
- Interactive timeline planning for cafes, attractions, and hotels.
- Real-time checkboxes and list management for travel packing lists and pre-trip preparation.
