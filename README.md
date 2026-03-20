# YTTReborn — YouTube Trending, Reborn

YouTube removed Trending — so we brought it back. A lightweight, zero-dependency web app that pulls live trending data from the **YouTube Data API v3** and displays it in a premium dark-mode interface. No server required.

![YTTReborn Screenshot](https://raw.githubusercontent.com/Jake-Fieldhouse/YTTReborn/main/screenshot.png)

---

## Setup

### 1. Get a YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **YouTube Data API v3** — [direct link](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy your new API key

### 2. Run YTTReborn

Because YTTReborn is a static HTML file with zero dependencies, you don't even need Git installed to run it.

**Option 1: The truly zero-dependency way (No Git required)**

1. Go to the top of this GitHub page.
2. Click the green **`<> Code`** button and select **Download ZIP**.
3. Extract the folder and double click `index.html`.

*(That's it. It will open directly in your browser).*

---

**Option 2: For Developers (Requires Git)**

If you have Git installed, here are the fastest one-liners to clone and launch immediately:

#### Windows (PowerShell)

```powershell
git clone https://github.com/Jake-Fieldhouse/YTTReborn.git; start YTTReborn\index.html
```

#### macOS

```bash
git clone https://github.com/Jake-Fieldhouse/YTTReborn.git && open YTTReborn/index.html
```

#### Linux

```bash
git clone https://github.com/Jake-Fieldhouse/YTTReborn.git && xdg-open YTTReborn/index.html
```

### 3. Paste Your Key

On first launch, YTTReborn will ask for your API key. Paste it in, hit **Start Browsing**, and you're done. Your key is saved locally in your browser — you only need to enter it once.

---

## Features

| Feature | Description |
| ------- | ----------- |
| **🔥 Trending Feed** | The same algorithmic ranking YouTube's Trending page used — not just "most viewed" |
| **🌍 Auto Region Detection** | Detects your country via IP and loads local trending automatically |
| **🗂️ Category Filtering** | Filter by Music, Gaming, Sports, Comedy, Entertainment, and more |
| **🌐 20 Regions** | Switch between US, UK, Canada, Australia, Germany, France, Japan, Korea, India, Brazil, and 10 more |
| **🔴 LIVE Badges** | Pulsing red badge + concurrent viewer count for livestreams |
| **⏱️ Auto-Refresh** | Feed refreshes every 5 minutes (pauses when tab is hidden to save quota) |
| **🖼️ Smart Thumbnails** | 3-tier fallback chain — no broken image icons, ever |
| **📊 Rich Metadata** | Compact view counts (1.2M), relative timestamps (3 hours ago), duration badges |
| **🎨 Premium UI** | Dark glassmorphism design, skeleton loading, staggered animations, responsive grid |
| **🔑 Secure** | Your API key stays in your browser's localStorage — never leaves your machine |
| **📦 Zero Dependencies** | Pure HTML/CSS/JS — no frameworks, no build step, no backend |

---

## API Quota

YouTube gives you **10,000 free API units per day**. Each trending request costs ~1 unit. With auto-refresh every 5 minutes, that's ~288 units/day — well within the free tier.

---

## Project Structure

```text
YTTReborn/
├── index.html      # Main page + setup modal
├── style.css       # Design system
├── app.js          # API logic + rendering
├── favicon.svg     # App icon
└── README.md       # You're reading it
```

---

## License

MIT — do whatever you want with it.
