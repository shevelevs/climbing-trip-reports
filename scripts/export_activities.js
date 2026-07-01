const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const zipPath = '/Users/ssh/Downloads/export_1101878.zip';
const targetDir = path.join(__dirname, '../strava-activities');

if (!fs.existsSync(zipPath)) {
  console.error(`Error: Strava export zip not found at ${zipPath}`);
  process.exit(1);
}

// 1. Create target directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 2. Parse activities.csv from ZIP
console.log('Parsing activities.csv...');
const csvData = execSync(`unzip -p "${zipPath}" activities.csv`, { maxBuffer: 15 * 1024 * 1024 }).toString('utf8');

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

const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);
const headers = parseCSVLine(lines[0]);
const col = {
  id: headers.findIndex(h => h.toLowerCase() === 'activity id'),
  date: headers.findIndex(h => h.toLowerCase() === 'activity date'),
  name: headers.findIndex(h => h.toLowerCase() === 'activity name'),
  type: headers.findIndex(h => h.toLowerCase() === 'activity type'),
  time: headers.findIndex(h => h.toLowerCase() === 'elapsed time'),
  dist: headers.findIndex(h => h.toLowerCase() === 'distance'),
  file: headers.findIndex(h => h.toLowerCase() === 'filename')
};

function formatDate(date) {
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
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const matchingActivities = [];
const filesToExtract = [];

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length < Math.max(...Object.values(col))) continue;

  const id = row[col.id];
  const dateStr = row[col.date];
  const name = row[col.name];
  const type = row[col.type];
  const time = row[col.time];
  const dist = row[col.dist];
  const file = row[col.file];

  const actDate = new Date(dateStr);
  if (isNaN(actDate.getTime())) continue;

  // Filter duration > 3 hours
  const durationSeconds = parseInt(time, 10);
  if (isNaN(durationSeconds)) continue;
  const durationHours = durationSeconds / 3600;

  if (durationHours > 3) {
    matchingActivities.push({
      id,
      date: actDate,
      dateFormatted: formatDate(actDate),
      name,
      type,
      time,
      dist,
      file
    });

    if (file) {
      filesToExtract.push(file);
    }
  }
}

// Sort chronologically (newest first)
matchingActivities.sort((a, b) => b.date - a.date);

console.log(`Found ${matchingActivities.length} activities longer than 3 hours.`);

// 3. Extract files in batches of 15 to avoid command line length limits
const batchSize = 15;
console.log('Extracting activity files...');
for (let i = 0; i < filesToExtract.length; i += batchSize) {
  const batch = filesToExtract.slice(i, i + batchSize);
  const escapedFiles = batch.map(f => `"${f}"`).join(' ');
  try {
    // -j: junk paths (extract files directly, don't recreate subfolders)
    // -o: overwrite existing files without prompting
    execSync(`unzip -j -o "${zipPath}" ${escapedFiles} -d "${targetDir}"`, { stdio: 'ignore' });
  } catch (err) {
    console.warn(`Warning: Some files in batch starting at index ${i} failed to extract.`);
  }
}

// 4. Generate index.md
console.log('Generating index.md...');
let md = `# Exported Strava Activities (> 3 Hours)

This directory contains Strava activity tracks (GPX/FIT) for all activities longer than 3 hours, along with direct links to the original activities on Strava.

## Activities List

| Date | Activity Name | Type | Distance | Duration | Original Link | Track File |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

matchingActivities.forEach(r => {
  const distVal = r.dist ? `${parseFloat(r.dist).toFixed(2)} mi` : '—';
  const durationVal = formatDuration(r.time);
  const stravaUrl = `[Strava](https://www.strava.com/activities/${r.id})`;
  
  let fileLink = '—';
  if (r.file) {
    const baseName = path.basename(r.file);
    const localPath = path.join(targetDir, baseName);
    if (fs.existsSync(localPath)) {
      fileLink = `[${baseName}](./${baseName})`;
    }
  }

  // Clean activity name for markdown table safety
  const cleanName = r.name.replace(/\|/g, '\\|').trim();
  
  md += `| ${r.dateFormatted} | ${cleanName} | ${r.type} | ${distVal} | ${durationVal} | ${stravaUrl} | ${fileLink} |\n`;
});

fs.writeFileSync(path.join(targetDir, 'index.md'), md, 'utf8');
console.log('Export completed successfully!');
