# Climbing Trip Reports

A collection of detailed climbing trip reports, route logs, and statistics. 

This repository features a rich, interactive web UI hosted on GitHub Pages to browse and explore trips by year, complete with interactive Leaflet maps, downsampled GPX elevation charts, search functionality, and image lightboxes.

## Features

- **Interactive Maps**: Plot GPS tracks directly on topological, satellite, or standard maps using [Leaflet](https://leafletjs.com/).
- **Elevation Chart Profile**: Custom interactive canvas-based elevation charts. Hovering over the elevation profile plots a cursor synchronized in real-time with the track location on the map.
- **High-Performance GPX Downsampling**: A custom build script parses large GPX files (e.g., 4MB+) and simplifies them to lightweight JSON paths (~50KB) for instantaneous page loading.
- **Search & Filters**: Instantly filter trips by year or search for keywords, routes, styles, team members, or dates.
- **Premium Lightbox**: Click on any image within a trip report to open a full-resolution interactive image preview overlay.
- **CI/CD Deployment**: Automatic deployment to GitHub Pages via GitHub Actions on every push to `main` / `master`.

---

## Local Development

You can run the web interface locally using Node.js. No external npm dependencies are required.

### 1. Build the Data
Run the compiler script to process markdown files, downsample GPX tracks, and gather metadata into `dist/`:
```bash
npm run build
```

### 2. Start the Local Server
Start the lightweight static development server:
```bash
npm run dev
```
Then visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Adding New Trip Reports

The build system automatically registers new trips when organized according to the following conventions:

### 1. Folder Structure
Create a new directory inside the appropriate year folder:
```
<year>/
  └── <date>_<trip-name>/
      ├── <trip-report>.md             # Markdown file
      ├── <gps-track>.gpx              # GPX route file
      └── [images].png/jpg             # Inline images
```
*Example:* `2026/06-28_Temple-Crag-MGA/`

### 2. Markdown Format
Start the markdown file with a `#` title and a `### Summary` section with the following structured keys:
```markdown
# Trip Report: Temple Crag (MGA)
### Summary
 * **Date:** June 28, 2026
 * **Team:** Sergey & Rulik
 * **Route:** Moon Goddess Arête (with 5.9 Variation)
 * **Style:** Car-to-Car
 * **Total Time:** ~20:20
 * **Total Distance**: 16.2mi
 * **Total Elevation Gain**: 5,540ft
 * [Strava](https://www.strava.com/activities/19107078221)
 * [**GPX**](./Temple_Crag_Moon_Goddess_Arete.gpx)
```

The build script uses regular expressions to match these keys, extract stats for the dashboard, and link the GPX file for mapping. Images can be added using standard Markdown or HTML `<img>` tags, and paths will be auto-resolved.
