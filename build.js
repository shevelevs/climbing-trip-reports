const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const webDir = path.join(srcDir, 'web');
const distDir = path.join(srcDir, 'dist');

// Helper to calculate distance in meters between two lat/lon points
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Simple parser for GPX to extract points [lat, lon, ele, dist]
function parseGPX(gpxPath) {
  try {
    const gpxText = fs.readFileSync(gpxPath, 'utf8');
    const trkptRegex = /<trkpt\s+([^>]+)>([\s\S]*?)<\/trkpt>/g;
    
    const rawPoints = [];
    let match;
    while ((match = trkptRegex.exec(gpxText)) !== null) {
      const attrs = match[1];
      const body = match[2];
      
      const latMatch = attrs.match(/lat=["']([^"']+)["']/);
      const lonMatch = attrs.match(/lon=["']([^"']+)["']/);
      
      if (latMatch && lonMatch) {
        const lat = parseFloat(latMatch[1]);
        const lon = parseFloat(lonMatch[1]);
        const eleMatch = body.match(/<ele>([^<]+)<\/ele>/);
        const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;
        
        if (!isNaN(lat) && !isNaN(lon)) {
          rawPoints.push({ lat, lon, ele });
        }
      }
    }

    if (rawPoints.length === 0) {
      console.warn(`Warning: No trackpoints found in GPX file: ${gpxPath}`);
      return null;
    }

    // Calculate cumulative distance and bounds
    let totalDist = 0;
    let minLat = rawPoints[0].lat;
    let maxLat = rawPoints[0].lat;
    let minLon = rawPoints[0].lon;
    let maxLon = rawPoints[0].lon;
    let minEle = rawPoints[0].ele;
    let maxEle = rawPoints[0].ele;

    const parsedPoints = [];
    for (let i = 0; i < rawPoints.length; i++) {
      const p = rawPoints[i];
      if (i > 0) {
        const prev = rawPoints[i - 1];
        totalDist += haversine(prev.lat, prev.lon, p.lat, p.lon);
      }
      
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
      minEle = Math.min(minEle, p.ele);
      maxEle = Math.max(maxEle, p.ele);

      parsedPoints.push({
        lat: p.lat,
        lon: p.lon,
        ele: p.ele,
        dist: totalDist
      });
    }

    // Downsample to target size (~800 points) to save bandwidth
    const targetPointsCount = 800;
    const step = Math.max(1, Math.floor(parsedPoints.length / targetPointsCount));
    const simplifiedPoints = [];
    
    for (let i = 0; i < parsedPoints.length; i += step) {
      const p = parsedPoints[i];
      simplifiedPoints.push([
        parseFloat(p.lat.toFixed(5)),
        parseFloat(p.lon.toFixed(5)),
        parseFloat(p.ele.toFixed(1)),
        parseFloat(p.dist.toFixed(1))
      ]);
    }
    
    // Always include the last point if it wasn't added
    if (parsedPoints.length > 1 && (parsedPoints.length - 1) % step !== 0) {
      const last = parsedPoints[parsedPoints.length - 1];
      simplifiedPoints.push([
        parseFloat(last.lat.toFixed(5)),
        parseFloat(last.lon.toFixed(5)),
        parseFloat(last.ele.toFixed(1)),
        parseFloat(last.dist.toFixed(1))
      ]);
    }

    return {
      points: simplifiedPoints,
      distanceMeters: Math.round(totalDist),
      elevationMin: Math.round(minEle),
      elevationMax: Math.round(maxEle),
      bounds: [
        [minLat, minLon],
        [maxLat, maxLon]
      ]
    };
  } catch (err) {
    console.error(`Error parsing GPX file ${gpxPath}:`, err);
    return null;
  }
}

// Parses trip markdown metadata
function parseMetadata(markdownText) {
  const getMatch = (regex) => {
    const m = markdownText.match(regex);
    return m ? m[1].trim() : '';
  };

  const titleMatch = markdownText.match(/^#\s+(?:Trip\s+Report:\s*)?([^\r\n]+)/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Trip';

  const date = getMatch(/\*\*(?:Date):\*\*\s*([^\r\n]+)/i);
  const team = getMatch(/\*\*(?:Team):\*\*\s*([^\r\n]+)/i);
  const route = getMatch(/\*\*(?:Route):\*\*\s*([^\r\n]+)/i);
  const style = getMatch(/\*\*(?:Style):\*\*\s*([^\r\n]+)/i);
  const time = getMatch(/\*\*(?:Total Time|Time):\*\*\s*([^\r\n]+)/i);
  const distance = getMatch(/\*\*(?:Total Distance|Distance)\*\*[:\s]*([^\r\n]+)/i);
  const elevation = getMatch(/\*\*(?:Total Elevation Gain|Elevation Gain|Elevation)\*\*[:\s]*([^\r\n]+)/i);
  const strava = getMatch(/\[(?:\*\*)?Strava(?:\*\*)?\]\(([^)]+)\)/i);
  const gpx = getMatch(/\[(?:\*\*)?GPX(?:\*\*)?\]\(([^)]+)\)/i);

  return { title, date, team, route, style, time, distance, elevation, strava, gpx };
}

function build() {
  console.log('Starting site build...');
  
  // 1. Clean and create dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  const trips = [];
  
  // 2. Scan year directories
  const files = fs.readdirSync(srcDir);
  const yearDirs = files.filter(f => /^[0-9]{4}$/.test(f) && fs.statSync(path.join(srcDir, f)).isDirectory());

  for (const year of yearDirs) {
    const yearPath = path.join(srcDir, year);
    const tripFolders = fs.readdirSync(yearPath).filter(f => fs.statSync(path.join(yearPath, f)).isDirectory());

    for (const folder of tripFolders) {
      const folderPath = path.join(yearPath, folder);
      
      // Find the markdown file
      const mdFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
      if (mdFiles.length === 0) continue;
      
      const mdFileName = mdFiles[0];
      const mdFilePath = path.join(folderPath, mdFileName);
      
      console.log(`Processing trip: ${year}/${folder}`);
      const markdownText = fs.readFileSync(mdFilePath, 'utf8');
      const meta = parseMetadata(markdownText);
      
      // Setup dist destination folder for this trip
      const distTripFolder = path.join(distDir, year, folder);
      fs.mkdirSync(distTripFolder, { recursive: true });
      
      // Process GPX if present
      let hasTrack = false;
      if (meta.gpx) {
        // Resolve GPX path relative to md file
        const gpxPath = path.resolve(folderPath, meta.gpx);
        if (fs.existsSync(gpxPath)) {
          const trackData = parseGPX(gpxPath);
          if (trackData) {
            fs.writeFileSync(path.join(distTripFolder, 'track.json'), JSON.stringify(trackData, null, 2));
            hasTrack = true;
          }
        }
      }

      // Copy all contents of the trip folder to dist
      const allFiles = fs.readdirSync(folderPath);
      for (const file of allFiles) {
        const srcFilePath = path.join(folderPath, file);
        const destFilePath = path.join(distTripFolder, file);
        // Copy everything except raw GPX to save space, but actually copying GPX is fine if users want to download it
        fs.copyFileSync(srcFilePath, destFilePath);
      }

      // Store trip info
      trips.push({
        id: `${year}/${folder}`,
        year: parseInt(year),
        folder: folder,
        title: meta.title,
        date: meta.date,
        team: meta.team,
        route: meta.route,
        style: meta.style,
        time: meta.time,
        distance: meta.distance,
        elevation: meta.elevation,
        strava: meta.strava,
        gpxPath: `${year}/${folder}/${path.basename(meta.gpx || '')}`,
        mdPath: `${year}/${folder}/${mdFileName}`,
        hasTrack: hasTrack
      });
    }
  }

  // Sort trips descending by Date (we parse date if possible, otherwise by year/folder name)
  trips.sort((a, b) => {
    const parseDate = (dStr) => {
      const parsed = Date.parse(dStr);
      return isNaN(parsed) ? 0 : parsed;
    };
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    if (dateA !== dateB) return dateB - dateA;
    return b.id.localeCompare(a.id);
  });

  // Write out the trips JSON list
  fs.writeFileSync(path.join(distDir, 'trips.json'), JSON.stringify(trips, null, 2));
  console.log(`Found and built ${trips.length} trip report(s).`);

  // 3. Copy web assets to dist
  if (fs.existsSync(webDir)) {
    const webFiles = fs.readdirSync(webDir);
    for (const file of webFiles) {
      const srcFilePath = path.join(webDir, file);
      const destFilePath = path.join(distDir, file);
      if (fs.statSync(srcFilePath).isFile()) {
        fs.copyFileSync(srcFilePath, destFilePath);
      }
    }
  } else {
    console.error('Error: Web directory does not exist!');
  }

  console.log('Site build completed successfully!');
}

build();
