// Global Application State
let tripsData = [];
let climbersData = [];
let activeTripId = null;
let activeClimberId = null;
let mapInstance = null;
let hoverMarker = null;

// DOM Elements
const globalStats = document.getElementById('global-stats');
const searchInput = document.getElementById('search-input');
const yearFiltersContainer = document.getElementById('year-filters-container');
const tripsListContainer = document.getElementById('trips-list-container');
const climbersListContainer = document.getElementById('climbers-list-container');
const viewerContainer = document.getElementById('viewer-container');
const emptyState = document.getElementById('empty-state');
const detailView = document.getElementById('detail-view');
const climberView = document.getElementById('climber-view');
const backButton = document.getElementById('back-button');
const climberBackButton = document.getElementById('climber-back-button');
const tabTrips = document.getElementById('tab-trips');
const tabClimbers = document.getElementById('tab-climbers');
const appContainer = document.querySelector('.app-container');

// Lightbox Modal Setup
let lightboxModal = null;
function initLightbox() {
  lightboxModal = document.createElement('div');
  lightboxModal.className = 'lightbox-modal';
  lightboxModal.innerHTML = `
    <button class="lightbox-close" aria-label="Close image">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <img class="lightbox-img" src="" alt="">
    <div class="lightbox-caption"></div>
  `;
  document.body.appendChild(lightboxModal);

  lightboxModal.addEventListener('click', (e) => {
    if (e.target !== lightboxModal.querySelector('.lightbox-img')) {
      lightboxModal.classList.remove('active');
    }
  });

  lightboxModal.querySelector('.lightbox-close').addEventListener('click', () => {
    lightboxModal.classList.remove('active');
  });
}

function openLightbox(src, alt) {
  if (!lightboxModal) initLightbox();
  const img = lightboxModal.querySelector('.lightbox-img');
  const caption = lightboxModal.querySelector('.lightbox-caption');
  img.src = src;
  img.alt = alt || '';
  caption.textContent = alt || '';
  lightboxModal.classList.add('active');
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initLightbox();
  await loadTrips();
  await loadClimbers();
  setupEventListeners();
  handleRoute();
});

// Load the trips list JSON
async function loadTrips() {
  try {
    const res = await fetch('trips.json');
    if (!res.ok) throw new Error('Failed to load trips.json');
    tripsData = await res.json();
    
    calculateGlobalStats();
    populateYearFilters();
    renderTripsList();
  } catch (err) {
    console.error('Error initialization:', err);
    tripsListContainer.innerHTML = `<div class="loading-state">Error loading trip reports. Please ensure build has been run.</div>`;
  }
}

// Load the climbers list JSON
async function loadClimbers() {
  try {
    const res = await fetch('climbers.json');
    if (!res.ok) throw new Error('Failed to load climbers.json');
    climbersData = await res.json();
    renderClimbersList();
  } catch (err) {
    console.error('Error loading climbers:', err);
    climbersListContainer.innerHTML = `<div class="loading-state">Error loading climbers list.</div>`;
  }
}

// Calculate and render global stats
function calculateGlobalStats() {
  let totalTrips = tripsData.length;
  let totalDistanceMiles = 0;
  let totalVerticalFeet = 0;

  tripsData.forEach(t => {
    // Parse distance (e.g. "16.2mi" or "16.2 miles")
    const distMatch = t.distance.match(/([\d\.]+)/);
    if (distMatch) {
      totalDistanceMiles += parseFloat(distMatch[1]);
    }
    
    // Parse vertical (e.g. "5,540ft" or "5540 feet")
    const vertMatch = t.elevation.replace(/,/g, '').match(/([\d\.]+)/);
    if (vertMatch) {
      totalVerticalFeet += parseFloat(vertMatch[1]);
    }
  });

  globalStats.innerHTML = `
    <div class="stat-pill"><span class="stat-val">${totalTrips}</span> <span class="stat-lbl">trips</span></div>
    <div class="stat-pill"><span class="stat-val">${totalDistanceMiles.toFixed(1)}</span> <span class="stat-lbl">miles</span></div>
    <div class="stat-pill"><span class="stat-val">${totalVerticalFeet.toLocaleString()}</span> <span class="stat-lbl">vertical ft</span></div>
  `;
}

// Year Filters Setup
let activeYearFilter = 'All';
function populateYearFilters() {
  const years = new Set(tripsData.map(t => t.year));
  const sortedYears = Array.from(years).sort((a, b) => b - a);
  
  let html = `<button class="filter-pill ${activeYearFilter === 'All' ? 'active' : ''}" data-year="All">All</button>`;
  sortedYears.forEach(year => {
    html += `<button class="filter-pill ${activeYearFilter === year.toString() ? 'active' : ''}" data-year="${year}">${year}</button>`;
  });
  
  yearFiltersContainer.innerHTML = html;

  // Add event listener to year filter pills
  yearFiltersContainer.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      yearFiltersContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeYearFilter = e.target.dataset.year;
      renderTripsList();
    });
  });
}

// Render the sidebar trip cards list
function renderTripsList() {
  const query = searchInput.value.toLowerCase().trim();
  
  const filteredTrips = tripsData.filter(t => {
    // Year filter
    if (activeYearFilter !== 'All' && t.year.toString() !== activeYearFilter) {
      return false;
    }
    
    // Search query filter
    if (query) {
      const matchText = [t.title, t.route, t.team, t.style, t.date].join(' ').toLowerCase();
      return matchText.includes(query);
    }
    
    return true;
  });

  if (filteredTrips.length === 0) {
    tripsListContainer.innerHTML = `<div class="loading-state">No trips match your criteria.</div>`;
    return;
  }

  tripsListContainer.innerHTML = filteredTrips.map(t => `
    <div class="trip-card ${t.id === activeTripId ? 'active' : ''}" data-id="${t.id}">
      <div class="trip-card-header">
        <h4 class="trip-card-title">${t.title}</h4>
        <span class="trip-card-year">${t.year}</span>
      </div>
      <div class="trip-card-route">${t.route || 'Unknown Route'}</div>
      <div class="trip-card-stats">
        <div class="trip-card-stat-item">
          <span>📅</span>
          <span>${t.date.split(',')[0]}</span>
        </div>
        <div class="trip-card-stat-item">
          <span>🏃</span>
          <span>${t.distance || '—'}</span>
        </div>
        <div class="trip-card-stat-item">
          <span>🏔️</span>
          <span>${t.elevation || '—'}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Add click listeners to cards
  tripsListContainer.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => {
      const tripId = card.dataset.id;
      window.location.hash = `#/trip/${tripId}`;
    });
  });
}

// Render the sidebar climber cards list
function renderClimbersList() {
  if (climbersData.length === 0) {
    climbersListContainer.innerHTML = `<div class="loading-state">No climbers available.</div>`;
    return;
  }

  climbersListContainer.innerHTML = climbersData.map(c => {
    const count = tripsData.filter(t => {
      if (!t.team) return false;
      const names = t.team.split(/[\s&,]+/i).map(n => n.trim().toLowerCase());
      return names.includes(c.id) || names.includes(c.name.toLowerCase());
    }).length;

    return `
      <div class="trip-card climber-card ${c.id === activeClimberId ? 'active' : ''}" data-id="${c.id}" style="padding: 0.65rem 0.85rem;">
        <div style="display: flex; gap: 0.75rem; align-items: center; width: 100%;">
          ${c.photo ? `
            <img src="${c.photo}" class="climber-avatar-sm" alt="${c.name}">
          ` : `
            <div class="climber-avatar-sm-placeholder">${c.name[0]}</div>
          `}
          <div style="flex: 1; min-width: 0;">
            <div class="trip-card-header" style="padding: 0; border: none; background: none; margin-bottom: 0.15rem; display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <h4 class="trip-card-title" style="margin: 0; font-size: 0.9rem;">${c.name}</h4>
              <span class="trip-card-year" style="font-size: 0.75rem; background: var(--border-color); color: var(--text-primary); padding: 0.1rem 0.35rem; border-radius: 4px; flex-shrink: 0; margin-left: 0.5rem;">
                ${count} ${count === 1 ? 'trip' : 'trips'}
              </span>
            </div>
            <div class="trip-card-route" style="margin-top: 0; font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
              ${c.bio}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click listeners to climber cards
  climbersListContainer.querySelectorAll('.climber-card').forEach(card => {
    card.addEventListener('click', () => {
      const climberId = card.dataset.id;
      window.location.hash = `#/climber/${climberId}`;
    });
  });
}

// Load and render details for a selected climber
async function loadClimberProfile(climberId) {
  const climber = climbersData.find(c => c.id === climberId);
  if (!climber) {
    window.location.hash = '#/climbers';
    return;
  }

  // Hide other views and show climber view
  emptyState.classList.add('hidden');
  detailView.classList.add('hidden');
  climberView.classList.remove('hidden');

  // Set climber details
  document.getElementById('climber-name').textContent = climber.name;
  
  const avatarContainer = document.getElementById('climber-avatar-container');
  if (climber.photo) {
    avatarContainer.innerHTML = `<img src="${climber.photo}" class="climber-avatar-lg" alt="${climber.name}">`;
  } else {
    avatarContainer.innerHTML = `<div class="climber-avatar-lg-placeholder">${climber.name[0]}</div>`;
  }
  
  const bioContainer = document.getElementById('climber-bio');
  bioContainer.innerHTML = '<div class="loading-state">Loading biography...</div>';
  
  try {
    const res = await fetch(climber.mdPath);
    if (!res.ok) throw new Error('Biography file not found');
    const mdText = await res.text();
    
    // Parse using marked.js
    let htmlContent = marked.parse(mdText);
    
    // Remove the main H1 tag if it exists in the bio output
    htmlContent = htmlContent.replace(/<h1[^>]*>.*?<\/h1>/i, '');
    
    bioContainer.innerHTML = htmlContent;
    
    // Resolve relative assets
    const climberFolderUrl = `climbers/${climberId}`;
    bioContainer.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
        const cleanedSrc = src.startsWith('./') ? src.substring(2) : src;
        img.src = `${climberFolderUrl}/${cleanedSrc}`;
      }
      img.addEventListener('click', () => {
        openLightbox(img.src, img.alt);
      });
    });
  } catch (err) {
    console.error('Error loading biography:', err);
    bioContainer.innerHTML = `<div class="loading-state">Failed to load biography.</div>`;
  }

  // Render Mountain Project and other climber links in right column links card
  const linksCard = document.getElementById('climber-links-card');
  linksCard.innerHTML = '';
  if (climber.mountainProject) {
    linksCard.classList.remove('hidden');
    const a = document.createElement('a');
    a.href = climber.mountainProject;
    a.target = '_blank';
    a.className = 'btn-link btn-mp';
    a.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      <span>Mountain Project Profile</span>
    `;
    linksCard.appendChild(a);
  } else {
    linksCard.classList.add('hidden');
  }

  // Render trips this climber participated in
  const climberTrips = tripsData.filter(t => {
    if (!t.team) return false;
    const names = t.team.split(/[\s&,]+/i).map(n => n.trim().toLowerCase());
    return names.includes(climberId) || names.includes(climber.name.toLowerCase());
  });

  const climberTripsContainer = document.getElementById('climber-trips-container');
  if (climberTrips.length === 0) {
    climberTripsContainer.innerHTML = `<div class="loading-state">No trips recorded for this climber.</div>`;
    return;
  }

  climberTripsContainer.innerHTML = climberTrips.map(t => `
    <div class="trip-card" data-id="${t.id}" style="cursor: pointer; max-width: 100%; box-sizing: border-box;">
      <div class="trip-card-header">
        <h4 class="trip-card-title">${t.title}</h4>
        <span class="trip-card-year">${t.year}</span>
      </div>
      <div class="trip-card-route">${t.route || 'Unknown Route'}</div>
      <div class="trip-card-stats">
        <div class="trip-card-stat-item">
          <span>📅</span>
          <span>${t.date.split(',')[0]}</span>
        </div>
        <div class="trip-card-stat-item">
          <span>🏃</span>
          <span>${t.distance || '—'}</span>
        </div>
        <div class="trip-card-stat-item">
          <span>🏔️</span>
          <span>${t.elevation || '—'}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Add click listeners to trip cards inside climber profile to navigate back to trip details
  climberTripsContainer.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => {
      const tripId = card.dataset.id;
      window.location.hash = `#/trip/${tripId}`;
    });
  });
}

// Setup global event listeners
function setupEventListeners() {
  searchInput.addEventListener('input', () => {
    renderTripsList();
  });

  backButton.addEventListener('click', () => {
    window.location.hash = '#/';
  });

  climberBackButton.addEventListener('click', () => {
    window.location.hash = '#/climbers';
  });

  window.addEventListener('hashchange', handleRoute);
}

// Handle client-side routing
async function handleRoute() {
  const hash = window.location.hash;
  
  // 1. Setup tab active states and sidebar visibility
  if (hash.startsWith('#/climbers') || hash.startsWith('#/climber/')) {
    tabTrips.classList.remove('active');
    tabClimbers.classList.add('active');
    
    document.querySelector('.search-filter-box').classList.add('hidden');
    tripsListContainer.classList.add('hidden');
    climbersListContainer.classList.remove('hidden');
    renderClimbersList();
  } else {
    tabTrips.classList.add('active');
    tabClimbers.classList.remove('active');
    
    document.querySelector('.search-filter-box').classList.remove('hidden');
    tripsListContainer.classList.remove('hidden');
    climbersListContainer.classList.add('hidden');
  }

  // 2. Handle main viewer routing
  if (hash.startsWith('#/trip/')) {
    const tripId = hash.replace('#/trip/', '');
    activeTripId = tripId;
    activeClimberId = null;
    appContainer.classList.add('show-detail');
    
    climberView.classList.add('hidden');
    await loadTripDetails(tripId);
  } else if (hash.startsWith('#/climber/')) {
    const climberId = hash.replace('#/climber/', '');
    activeClimberId = climberId;
    activeTripId = null;
    appContainer.classList.add('show-detail');
    
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    
    await loadClimberProfile(climberId);
  } else if (hash === '#/climbers') {
    activeTripId = null;
    activeClimberId = null;
    appContainer.classList.remove('show-detail');
    
    emptyState.classList.remove('hidden');
    detailView.classList.add('hidden');
    climberView.classList.add('hidden');
    
    // Update empty state text for climbers
    emptyState.querySelector('h2').textContent = 'Explore Our Climbers';
    emptyState.querySelector('p').textContent = 'Select a climber from the sidebar to view their biography and climbing accomplishments.';
    
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  } else {
    // Default dashboard
    activeTripId = null;
    activeClimberId = null;
    appContainer.classList.remove('show-detail');
    
    emptyState.classList.remove('hidden');
    detailView.classList.add('hidden');
    climberView.classList.add('hidden');
    
    // Reset empty state text
    emptyState.querySelector('h2').textContent = 'Explore Climbing Adventures';
    emptyState.querySelector('p').textContent = 'Select a trip report from the sidebar to view full logs, route maps, elevation profiles, and climbing statistics.';
    
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  }
  
  // 3. Update active states on sidebar cards
  tripsListContainer.querySelectorAll('.trip-card').forEach(card => {
    if (card.dataset.id === activeTripId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  climbersListContainer.querySelectorAll('.climber-card').forEach(card => {
    if (card.dataset.id === activeClimberId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}

// Load and render details for a selected trip
async function loadTripDetails(tripId) {
  const trip = tripsData.find(t => t.id === tripId);
  if (!trip) {
    window.location.hash = '#/';
    return;
  }

  // Hide empty state and show detail container
  emptyState.classList.add('hidden');
  detailView.classList.remove('hidden');

  // Set header values
  document.getElementById('trip-title').textContent = trip.title;
  document.getElementById('meta-date').textContent = trip.date || '—';
  document.getElementById('meta-route').textContent = trip.route || '—';
  const metaTeam = document.getElementById('meta-team');
  if (trip.team) {
    const names = trip.team.split(/[\s&,]+/i).map(n => n.trim()).filter(n => n.length > 0 && n.toLowerCase() !== 'and');
    metaTeam.innerHTML = '';
    const teamLinks = names.map(name => {
      const match = climbersData.find(c => c.name.toLowerCase() === name.toLowerCase() || c.id === name.toLowerCase());
      if (match) {
        return `<a href="#/climber/${match.id}" class="climber-link">${name}</a>`;
      }
      return name;
    });
    metaTeam.innerHTML = teamLinks.join(' & ');
  } else {
    metaTeam.textContent = '—';
  }
  document.getElementById('meta-style').textContent = trip.style || '—';

  document.getElementById('stat-distance').textContent = trip.distance || '—';
  document.getElementById('stat-elevation').textContent = trip.elevation || '—';
  document.getElementById('stat-time').textContent = trip.time || '—';

  // Strava and GPX link setup
  const stravaContainer = document.getElementById('strava-links-container');
  stravaContainer.innerHTML = '';
  if (trip.stravaLinks && trip.stravaLinks.length > 0) {
    trip.stravaLinks.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.className = 'btn-link btn-strava';
      a.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L11.213 0 5.387 11.458h4.172"/>
        </svg>
        <span>View on Strava ${link.label ? `(${link.label})` : ''}</span>
      `;
      stravaContainer.appendChild(a);
    });
  } else if (trip.strava) {
    const a = document.createElement('a');
    a.href = trip.strava;
    a.target = '_blank';
    a.className = 'btn-link btn-strava';
    a.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L11.213 0 5.387 11.458h4.172"/>
      </svg>
      <span>View on Strava</span>
    `;
    stravaContainer.appendChild(a);
  }

  const gpxBtn = document.getElementById('link-gpx');
  gpxBtn.href = trip.gpxPath;

  // Render markdown content
  const markdownContainer = document.getElementById('markdown-content');
  markdownContainer.innerHTML = '<div class="loading-state">Loading trip details...</div>';

  try {
    const res = await fetch(trip.mdPath);
    if (!res.ok) throw new Error('Markdown file not found');
    let mdText = await res.ok ? await res.text() : '';
    
    // Parse using marked.js
    const htmlContent = marked.parse(mdText);
    markdownContainer.innerHTML = htmlContent;

    // Resolve relative assets
    const tripFolderUrl = trip.id; // e.g. "2026/06-28_Temple-Crag-MGA"
    
    // Fix image paths
    markdownContainer.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
        const cleanedSrc = src.startsWith('./') ? src.substring(2) : src;
        img.src = `${tripFolderUrl}/${cleanedSrc}`;
      }
      
      // Make images clickable for Lightbox
      img.addEventListener('click', () => {
        openLightbox(img.src, img.alt);
      });
    });

    // Fix file link paths
    markdownContainer.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('#')) {
        const cleanedHref = href.startsWith('./') ? href.substring(2) : href;
        a.href = `${tripFolderUrl}/${cleanedHref}`;
      }
    });

  } catch (err) {
    console.error('Error loading markdown:', err);
    markdownContainer.innerHTML = `<div class="loading-state">Failed to load trip report details.</div>`;
  }

  // Load Map & Elevation Chart
  const elevationCard = document.getElementById('elevation-card');
  if (trip.hasTrack) {
    elevationCard.classList.remove('hidden');
    await loadMapAndElevation(trip);
  } else {
    elevationCard.classList.add('hidden');
    // Hide map card as well or initialize empty map
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  }
}

// Load GPX track data, plot on Map, and draw Elevation Chart
async function loadMapAndElevation(trip) {
  try {
    const res = await fetch(`${trip.id}/track.json`);
    if (!res.ok) throw new Error('Track JSON not found');
    const trackData = await res.json();

    // 1. Initialize Map
    if (mapInstance) {
      mapInstance.remove();
    }
    
    mapInstance = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: false // disable scrolling zoom by default to prevent page scroll hijack
    });

    // Add scroll zoom on map click
    mapInstance.on('click', () => {
      mapInstance.scrollWheelZoom.enable();
    });
    mapInstance.on('mouseout', () => {
      mapInstance.scrollWheelZoom.disable();
    });

    // Base Layers
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri'
    });
    
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data: &copy; OpenTopoMap contributors'
    });
    
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    });

    satelliteLayer.addTo(mapInstance);

    L.control.layers({
      "Satellite Map": satelliteLayer,
      "Topo Map": topoLayer,
      "Street Map": streetLayer
    }, null, { position: 'topright' }).addTo(mapInstance);

    // Plot Route Polyline
    const latlngs = trackData.points.map(p => [p[0], p[1]]);
    const polyline = L.polyline(latlngs, {
      color: '#51acf0', // Sky Blue for theme consistency
      weight: 4,
      opacity: 0.9
    }).addTo(mapInstance);

    mapInstance.fitBounds(trackData.bounds, { padding: [20, 20] });
    
    // 2. Draw Elevation Profile Canvas Chart
    drawElevationChart(trackData);

  } catch (err) {
    console.error('Error loading GPX track map:', err);
  }
}

// Draw Elevation profile on Canvas with custom interactive hover
function drawElevationChart(trackData) {
  const canvas = document.getElementById('elevation-chart');
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('chart-tooltip');
  
  // Set dimensions correctly (retina display scale)
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  // Extract variables: X = distance in miles, Y = elevation in feet
  // Each point in trackData.points is [lat, lon, ele_meters, dist_meters]
  const data = trackData.points.map(p => {
    return {
      lat: p[0],
      lon: p[1],
      ele: p[2] * 3.28084, // convert meters to feet
      dist: p[3] * 0.000621371 // convert meters to miles
    };
  });

  const maxDist = data[data.length - 1].dist;
  const elevations = data.map(d => d.ele);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  
  // Update elevation stat label
  document.getElementById('ele-max').textContent = Math.round(maxEle).toLocaleString();
  document.getElementById('ele-min').textContent = Math.round(minEle).toLocaleString();

  // Padding inside canvas
  const padLeft = 40;
  const padRight = 10;
  const padTop = 15;
  const padBottom = 20;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  // Scales
  const getX = (dist) => padLeft + (dist / maxDist) * chartWidth;
  const getY = (ele) => padTop + chartHeight - ((ele - minEle) / (maxEle - minEle || 1)) * chartHeight;

  function renderChart(hoverIndex = null) {
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Lines & Axes Labels
    ctx.strokeStyle = '#232a3b';
    ctx.lineWidth = 1;
    ctx.font = '9px Inter';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Horizontal grid lines (elevation)
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const eleVal = minEle + (i / steps) * (maxEle - minEle);
      const y = getY(eleVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(Math.round(eleVal).toLocaleString(), padLeft - 6, y);
    }

    // X-Axis Distance labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const distSteps = 4;
    for (let i = 0; i <= distSteps; i++) {
      const distVal = (i / distSteps) * maxDist;
      const x = getX(distVal);
      ctx.beginPath();
      ctx.moveTo(x, padTop + chartHeight);
      ctx.lineTo(x, padTop + chartHeight + 4);
      ctx.stroke();
      ctx.fillText(`${distVal.toFixed(1)}mi`, x, padTop + chartHeight + 6);
    }

    // 2. Draw Filled Gradient Area
    ctx.beginPath();
    ctx.moveTo(getX(data[0].dist), padTop + chartHeight);
    
    data.forEach(d => {
      ctx.lineTo(getX(d.dist), getY(d.ele));
    });
    
    ctx.lineTo(getX(data[data.length - 1].dist), padTop + chartHeight);
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartHeight);
    grad.addColorStop(0, 'rgba(81, 172, 240, 0.35)'); // Tahoe sky blue gradient start
    grad.addColorStop(1, 'rgba(81, 172, 240, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 3. Draw Profile Line
    ctx.beginPath();
    ctx.moveTo(getX(data[0].dist), getY(data[0].ele));
    data.forEach(d => {
      ctx.lineTo(getX(d.dist), getY(d.ele));
    });
    ctx.strokeStyle = '#51acf0'; // Tahoe sky blue line
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 4. Draw Hover Element
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length) {
      const point = data[hoverIndex];
      const hoverX = getX(point.dist);
      const hoverY = getY(point.ele);

      // Draw vertical alignment line
      ctx.beginPath();
      ctx.moveTo(hoverX, padTop);
      ctx.lineTo(hoverX, padTop + chartHeight);
      ctx.strokeStyle = 'rgba(81, 172, 240, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // Draw dot
      ctx.beginPath();
      ctx.arc(hoverX, hoverY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#51acf0'; // Tahoe sky blue dot
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Initial draw
  renderChart();

  // Mouse interactivity
  function handleMouseMove(e) {
    const mouseX = e.offsetX;
    
    // Constrain within chart region
    if (mouseX < padLeft || mouseX > width - padRight) {
      hideTooltipAndMarker();
      renderChart();
      return;
    }

    // Find corresponding data point index
    const pct = (mouseX - padLeft) / chartWidth;
    const hoverDist = pct * maxDist;
    
    // Find closest index in sorted distance array
    let closestIdx = 0;
    let minDistDiff = Infinity;
    
    for (let i = 0; i < data.length; i++) {
      const diff = Math.abs(data[i].dist - hoverDist);
      if (diff < minDistDiff) {
        minDistDiff = diff;
        closestIdx = i;
      }
    }

    const point = data[closestIdx];
    const hoverX = getX(point.dist);
    const hoverY = getY(point.ele);

    // Update map marker tracking
    if (mapInstance) {
      if (!hoverMarker) {
        hoverMarker = L.circleMarker([point.lat, point.lon], {
          radius: 6,
          fillColor: '#51acf0', // sky blue marker fill
          color: '#ffffff',
          weight: 2.5,
          fillOpacity: 1
        }).addTo(mapInstance);
      } else {
        hoverMarker.setLatLng([point.lat, point.lon]);
      }
    }

    // Update canvas drawing
    renderChart(closestIdx);

    // Position & update tooltip
    tooltip.style.display = 'block';
    tooltip.style.left = `${hoverX + 10}px`;
    tooltip.style.top = `${hoverY - 35}px`;
    tooltip.innerHTML = `
      <strong>${point.dist.toFixed(2)} mi</strong><br/>
      ${Math.round(point.ele).toLocaleString()} ft
    `;
  }

  function hideTooltipAndMarker() {
    tooltip.style.display = 'none';
    if (hoverMarker && mapInstance) {
      hoverMarker.remove();
      hoverMarker = null;
    }
  }

  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', () => {
    hideTooltipAndMarker();
    renderChart();
  });
}
