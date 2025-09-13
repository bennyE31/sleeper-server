const express = require('express');
const cron = require('cron');
const Database = require('better-sqlite3');
const app = express();
const PORT = process.env.PORT || 3000;
const LEAGUE_YEAR = process.env.LEAGUE_YEAR || 2025;
const db = new Database('sleeper.db');
const cors = require('cors');



// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS player_info (
    id TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS player_stats (
    id TEXT PRIMARY KEY,
    data TEXT
  );
`);

// Function to fetch and update player info and stats
async function updateData() {
  try {
    const infoRes = await fetch('https://api.sleeper.app/v1/players/nfl');
    const statsRes = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${LEAGUE_YEAR}`);
    const infoJson = await infoRes.json();
    const statsJson = await statsRes.json();

    const allowedPositions = new Set(['QB', 'RB', 'WR', 'TE']);

    const insertInfo = db.prepare('INSERT OR REPLACE INTO player_info (id, data) VALUES (?, ?)');
    const insertStats = db.prepare('INSERT OR REPLACE INTO player_stats (id, data) VALUES (?, ?)');

    // Filter player IDs to only those with allowed positions
    const filteredIds = Object.keys(infoJson).filter(id => {
      const pos = infoJson[id].depth_chart_position;
      return allowedPositions.has(pos);
    });

    const infoTransaction = db.transaction(() => {
      for (const id of filteredIds) {
        insertInfo.run(id, JSON.stringify(infoJson[id]));
      }
    });
    const statsTransaction = db.transaction(() => {
      for (const id of filteredIds) {
        if (statsJson[id]) {
          insertStats.run(id, JSON.stringify(statsJson[id]));
        }
      }
    });

    infoTransaction();
    statsTransaction();

    console.log('Data updated and saved to SQLite.');
  } catch (err) {
    console.error('Failed to update data:', err);
  }
}

// Get stats of player by id
function getPlayerStatsById(id) {
  const row = db.prepare('SELECT data FROM player_stats WHERE id = ?').get(id);
  return row ? JSON.parse(row.data) : null;
}

// Get ID of player by name
function getPlayerIdByName(name) {
  const row = db.prepare(
    "SELECT id FROM player_info WHERE json_extract(data, '$.full_name') = ?"
  ).get(name);
  return row ? row.id : null;
}

// Schedule update at midnight
const job = new cron.CronJob(
  '0 0 * * *',
  updateData,
  null,
  true,
  'America/Chicago'
);
job.start();

// Optionally, run once at startup
updateData();

app.use(cors());

app.get('/', (req, res) => {
    res.send('<p>Hello!</p>')
});

app.get('/player/:name/stats', (req, res) => {
    const playerName = req.params.name;
    const playerId = getPlayerIdByName(playerName);
    if (!playerId) {
        console.error('Player id not found for name:', playerName);
        return res.status(404).json({ error: 'Player not found' });
    }
    const stats = getPlayerStatsById(playerId);
    if (!stats) {
        console.error('Stats not found for player ID:', playerId);
        return res.status(404).json({ error: 'Stats not found' });
    }
    console.log('Request for stats name:', playerName, 'found for ID:', playerId);
    res.json(stats);
});

app.get('/player/:name/id', (req, res) => {
    const playerName = req.params.name;
    const playerId = getPlayerIdByName(playerName);
    if (!playerId) {
        console.error('Player id not found for name:', playerName);
        return res.status(404).json({ error: 'Player not found' });
    }
    console.log('Request for player name:', playerName, 'found ID:', playerId);
    res.json({ id: playerId });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});