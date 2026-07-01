#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function printHelp() {
  console.log(`
Seeking Beta: Strava Activity Search Tool
=========================================
Allows you to search for climbing, running, or hiking activities inside a Strava export ZIP file.

Usage:
  node scripts/search_strava.js [options]

Options:
  --zip <path>        Path to the Strava export ZIP file.
                      (Default: /Users/ssh/Downloads/export_1101878.zip)
  --keyword <term>    Keyword to search for in name, type, or description (case-insensitive).
  --date <date>       Filter by exact date (YYYY-MM-DD) or month/year prefix (e.g., YYYY-MM or YYYY).
  --start <date>      Filter by start date (YYYY-MM-DD) for range search.
  --end <date>        Filter by end date (YYYY-MM-DD) for range search.
  --duration <expr>   Filter by elapsed duration in hours using expressions:
                        "3-5"   -> between 3 and 5 hours (inclusive)
                        ">3"    -> more than 3 hours
                        "<5"    -> less than 5 hours
                        ">=3"   -> 3 or more hours
                        "3"     -> 3 or more hours (alias for >=3)
  --help, -h          Display this help message.

Examples:
  node scripts/search_strava.js --keyword "Temple"
  node scripts/search_strava.js --duration "3-5"
  node scripts/search_strava.js --duration ">3"
  node scripts/search_strava.js --keyword "Hike" --duration ">=5"
`);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDurationExpr(expr) {
  if (!expr) return null;
  expr = expr.trim();
  
  // 1. Range e.g. "3-5" or "3 - 5"
  const rangeMatch = expr.match(/^([\d\.]+)\s*-\s*([\d\.]+)$/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      strictMin: false,
      strictMax: false
    };
  }
  
  // 2. Greater than or equal ">=3" or "gte3"
  const gteMatch = expr.match(/^(?:>=|gte)\s*([\d\.]+)$/i);
  if (gteMatch) {
    return {
      min: parseFloat(gteMatch[1]),
      max: null,
      strictMin: false,
      strictMax: false
    };
  }
  
  // 3. Less than or equal "<=5" or "lte5"
  const lteMatch = expr.match(/^(?:<=|lte)\s*([\d\.]+)$/i);
  if (lteMatch) {
    return {
      min: null,
      max: parseFloat(lteMatch[1]),
      strictMin: false,
      strictMax: false
    };
  }
  
  // 4. Greater than ">3" or "gt3"
  const gtMatch = expr.match(/^(?:>|gt)\s*([\d\.]+)$/i);
  if (gtMatch) {
    return {
      min: parseFloat(gtMatch[1]),
      max: null,
      strictMin: true,
      strictMax: false
    };
  }
  
  // 5. Less than "<5" or "lt5"
  const ltMatch = expr.match(/^(?:<|lt)\s*([\d\.]+)$/i);
  if (ltMatch) {
    return {
      min: null,
      max: parseFloat(ltMatch[1]),
      strictMin: false,
      strictMax: true
    };
  }
  
  // 6. Plain number e.g. "3" -> treat as >= 3
  const plainMatch = expr.match(/^([\d\.]+)$/);
  if (plainMatch) {
    return {
      min: parseFloat(plainMatch[1]),
      max: null,
      strictMin: false,
      strictMax: false
    };
  }
  
  return null;
}

function formatDate(date) {
  if (!date) return '—';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds === '') return '—';
  const secNum = parseInt(seconds, 10);
  if (isNaN(secNum)) return '—';
  const hrs = Math.floor(secNum / 3600);
  const mins = Math.floor((secNum % 3600) / 60);
  const secs = secNum % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

function run() {
  const args = process.argv.slice(2);
  let zipPath = '/Users/ssh/Downloads/export_1101878.zip';
  let keyword = '';
  let exactDate = '';
  let startDate = '';
  let endDate = '';
  let durationRaw = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--zip' && args[i + 1]) {
      zipPath = args[i + 1];
      i++;
    } else if (arg === '--keyword' && args[i + 1]) {
      keyword = args[i + 1];
      i++;
    } else if (arg === '--date' && args[i + 1]) {
      exactDate = args[i + 1];
      i++;
    } else if (arg === '--start' && args[i + 1]) {
      startDate = args[i + 1];
      i++;
    } else if (arg === '--end' && args[i + 1]) {
      endDate = args[i + 1];
      i++;
    } else if (arg === '--duration' && args[i + 1]) {
      durationRaw = args[i + 1];
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Error: Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  // Verify zip exists
  if (!fs.existsSync(zipPath)) {
    console.error(`Error: Strava export zip file not found at: ${zipPath}`);
    process.exit(1);
  }

  const durationFilter = parseDurationExpr(durationRaw);
  if (durationRaw && !durationFilter) {
    console.error(`Error: Invalid duration expression: "${durationRaw}". Use formats like "3-5", ">3", "<5", or "3".`);
    process.exit(1);
  }

  console.log(`Reading activities from ${zipPath}...`);
  let csvData;
  try {
    csvData = execSync(`unzip -p "${zipPath}" activities.csv`, { maxBuffer: 15 * 1024 * 1024 }).toString('utf8');
  } catch (err) {
    console.error(`Error: Failed to read activities.csv from ZIP: ${err.message}`);
    process.exit(1);
  }

  const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) {
    console.log('No activities found in the CSV file.');
    return;
  }

  const headers = parseCSVLine(lines[0]);
  const col = {
    id: headers.findIndex(h => h.toLowerCase() === 'activity id'),
    date: headers.findIndex(h => h.toLowerCase() === 'activity date'),
    name: headers.findIndex(h => h.toLowerCase() === 'activity name'),
    type: headers.findIndex(h => h.toLowerCase() === 'activity type'),
    desc: headers.findIndex(h => h.toLowerCase() === 'activity description'),
    time: headers.findIndex(h => h.toLowerCase() === 'elapsed time'),
    dist: headers.findIndex(h => h.toLowerCase() === 'distance'),
    file: headers.findIndex(h => h.toLowerCase() === 'filename')
  };

  if (col.date === -1 || col.name === -1) {
    console.error('Error: Required columns "Activity Date" or "Activity Name" not found in CSV.');
    process.exit(1);
  }

  const results = [];
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(...Object.values(col))) continue;

    const id = col.id !== -1 ? row[col.id] : '';
    const dateStr = row[col.date];
    const name = row[col.name];
    const type = col.type !== -1 ? row[col.type] : '';
    const desc = col.desc !== -1 ? row[col.desc] : '';
    const time = col.time !== -1 ? row[col.time] : '';
    const dist = col.dist !== -1 ? row[col.dist] : '';
    const file = col.file !== -1 ? row[col.file] : '';

    const actDate = new Date(dateStr);
    if (isNaN(actDate.getTime())) continue;

    // 1. Keyword filter
    if (keyword) {
      const matchWord = keyword.toLowerCase();
      const inName = name.toLowerCase().includes(matchWord);
      const inType = type.toLowerCase().includes(matchWord);
      const inDesc = desc.toLowerCase().includes(matchWord);
      if (!inName && !inType && !inDesc) continue;
    }

    // 2. Exact date / prefix filter
    if (exactDate) {
      const dateString = formatDate(actDate);
      if (exactDate.length === 10) {
        if (dateString !== exactDate) continue;
      } else {
        if (!dateString.startsWith(exactDate)) continue;
      }
    }

    // 3. Date range filter
    if (start && actDate < start) continue;
    if (end && actDate > end) continue;

    // 4. Duration expression filter
    if (durationFilter) {
      const durationSeconds = parseInt(time, 10);
      if (isNaN(durationSeconds)) continue;
      const durationHours = durationSeconds / 3600;
      
      const { min, max, strictMin, strictMax } = durationFilter;
      if (min !== null) {
        if (strictMin) {
          if (durationHours <= min) continue;
        } else {
          if (durationHours < min) continue;
        }
      }
      if (max !== null) {
        if (strictMax) {
          if (durationHours >= max) continue;
        } else {
          if (durationHours > max) continue;
        }
      }
    }

    results.push({
      id,
      date: actDate,
      dateFormatted: formatDate(actDate),
      name,
      type,
      desc,
      time,
      dist,
      file
    });
  }

  // Sort chronologically (newest first)
  results.sort((a, b) => b.date - a.date);

  console.log(`\nFound ${results.length} matching activities:\n`);
  
  if (results.length === 0) {
    return;
  }

  // Format table output
  const colWidths = {
    date: 12,
    link: 43,
    type: 10,
    dist: 10,
    time: 10
  };

  // Print Header
  console.log(
    'Date'.padEnd(colWidths.date) + ' | ' +
    'Strava Link'.padEnd(colWidths.link) + ' | ' +
    'Type'.padEnd(colWidths.type) + ' | ' +
    'Distance'.padEnd(colWidths.dist) + ' | ' +
    'Duration'.padEnd(colWidths.time) + ' | ' +
    'Activity Name'
  );
  console.log('-'.repeat(colWidths.date + colWidths.link + colWidths.type + colWidths.dist + colWidths.time + 50));

  results.forEach(r => {
    const formattedDist = r.dist ? `${parseFloat(r.dist).toFixed(2)} mi` : '—';
    const formattedDuration = formatDuration(r.time);
    const shortName = r.name.length > 50 ? r.name.substring(0, 47) + '...' : r.name;
    const stravaLink = r.id ? `https://www.strava.com/activities/${r.id}` : '—';
    
    console.log(
      r.dateFormatted.padEnd(colWidths.date) + ' | ' +
      stravaLink.padEnd(colWidths.link) + ' | ' +
      r.type.substring(0, colWidths.type).padEnd(colWidths.type) + ' | ' +
      formattedDist.padEnd(colWidths.dist) + ' | ' +
      formattedDuration.padEnd(colWidths.time) + ' | ' +
      shortName
    );
  });
  console.log('');
}

run();
