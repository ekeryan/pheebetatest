const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// Download and process images from WNBA (not used for now)
async function downloadAndProcessImage(imgUrl, playerName) {
  const baseName = playerName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const normalPath = path.join(__dirname, `${baseName}.jpg`);
  const silhouettePath = path.join(__dirname, `${baseName}_silhouette.png`);

  const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  fs.writeFileSync(normalPath, buffer);

  await sharp(buffer)
    .resize(300, 400, { fit: 'fill' })
    .greyscale()
    .threshold(100)
    .toColourspace('b-w')
    .toFile(silhouettePath);

  return { normalPath, silhouettePath };
}

function parseHeight(heightStr) {
  if (!heightStr) return '';
  let match = heightStr.match(/(\d)[-'](\d{1,2})/);
  if (match) {
    return `${match[1]}'${match[2]}"`;
  }
  return heightStr;
}

// Scrape the WNBA team roster and try to get the WNBA player page URL
async function scrapeTeamRoster(teamUrl, teamCode, conf) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(teamUrl, { waitUntil: 'networkidle2' });

  const html = await page.content();
  fs.writeFileSync('debug_roster.html', html);
  console.log('Saved debug_roster.html. Open this file in your browser to inspect the structure.');
  await browser.close();

  const $ = cheerio.load(html);

  const players = [];
  $('h3[class^="_PlayerTile__player__name"]').each((i, el) => {
    const name = $(el).text().trim();
    const parent = $(el).closest('section, div');

    // Number
    const number = parent.find('span[class^="_PlayerTile__number__digit"]').first().text().trim();

    // Position
    const position = parent.find('p[class^="_PlayerTile__player__subtitle"] span').first().text().trim();

    // Height
    let height = '';
    parent.find('dt[class^="_PlayerTile__info__label"]').each((i, dt) => {
      if ($(dt).text().trim() === 'Height') {
        height = parseHeight($(dt).next('dd[class^="_PlayerTile__info__value"]').text().trim());
      }
    });

    // Try to get WNBA player page URL from a link in the tile (if present)
    let wnbaUrl = '';
    const link = parent.find('a[href*="/player/"]').attr('href');
    if (link) {
      wnbaUrl = link.startsWith('http') ? link : `https://www.wnba.com${link}`;
    }

    players.push({
      name,
      team: teamCode,
      position,
      number,
      age: 0,
      height,
      conf,
      previousTeams: [],
      img: '',
      wnbaUrl,
    });
  });

  console.log('Players found:', players.length);
  console.log(players);

  return players;
}

// Scrape jersey number from WNBA player page as fallback
async function getWNBAPlayerNumber(wnbaUrl) {
  if (!wnbaUrl) return '';
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(wnbaUrl, { waitUntil: 'networkidle2' });

    // Try both possible number containers
    const number = await page.evaluate(() => {
      let el = document.querySelector('div[class^="_PlayerProfileHeadshot__number"]');
      if (el) return el.textContent.trim();
      el = document.querySelector('.PlayerHeader__JerseyNumber');
      return el ? el.textContent.trim() : '';
    });

    await browser.close();
    return number;
  } catch (err) {
    console.log(`WNBA error for ${wnbaUrl}: ${err.message}`);
    return '';
  }
}

// Scrape previous teams from BBRef stats table using the "Tm" column
function parsePreviousTeams($, currentTeam) {
  const teams = [];
  // Only regular season rows (no class or class="full_table")
  $('table tbody tr').each((i, el) => {
    const rowClass = $(el).attr('class') || '';
    if (rowClass.includes('thead')) return; // skip header rows
    const team = $(el).find('td[data-stat="team"]').text().trim();
    if (
      team &&
      team !== currentTeam &&
      team !== 'TOT' &&
      !teams.includes(team)
    ) {
      teams.push(team);
    }
  });
  return teams;
}

// Scrape number, age, height, previous teams from Basketball Reference
async function getBBRefInfo(name, currentTeam) {
  function generateBBRefUrl(name) {
    const cleaned = name.replace(/[^a-zA-Z\s'-]/g, '').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' ');
    if (parts.length < 2) return null;
    const first = parts[0].toLowerCase();
    const last = parts[parts.length - 1].toLowerCase();
    return `https://www.basketball-reference.com/wnba/players/${last[0]}/${last.slice(0, 5)}${first.slice(0, 2)}01w.html`;
  }

  const url = generateBBRefUrl(name);
  if (!url) return { number: '', age: 0, height: '', previousTeams: [] };

  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' }
    });
    const $ = cheerio.load(data);

    // Number
    let number = $('#info .jersey').first().text().replace('#', '').trim();
    if (!number) {
      const h1 = $('#info h1').text();
      const match = h1.match(/#(\d+)/);
      if (match) number = match[1];
    }
    if (!number) {
      // Fallback: SVG jersey number
      number = $('#info .uni_holder.bbr text').first().text().trim();
    }

    // Height
    let height = $('#info [itemprop="height"]').first().text().trim();
    if (!height) {
      $('#info').find('*').each((i, el) => {
        const txt = $(el).text().trim();
        if (/^\d[-']\d{1,2}$/.test(txt)) {
          height = txt;
          return false;
        }
      });
    }
    if (height.match(/^\d-\d{1,2}$/)) {
      const [feet, inches] = height.split('-');
      height = `${feet}'${inches}"`;
    }

    // Age
    let age = 0;
    let birthYear = null;
    const bornText = $('#info #necro-birth').text();
    if (bornText) {
      const match = bornText.match(/\b(19|20)\d{2}\b/);
      if (match) birthYear = match[0];
    }
    if (!birthYear) {
      $('#info').find('*').each((i, el) => {
        const txt = $(el).text();
        const match = txt.match(/\b(19|20)\d{2}\b/);
        if (match) {
          birthYear = match[0];
          return false;
        }
      });
    }
    if (birthYear) {
      const now = new Date();
      age = now.getFullYear() - parseInt(birthYear, 10);
    }

    // Previous teams
    const previousTeams = parsePreviousTeams($, currentTeam);

    // Manual patch for Dana Evans if BBRef is wrong
    if (name === "Dana Evans") {
      // As of 2024: DAL, CHI
      return { number, age, height, previousTeams: ["DAL", "CHI"] };
    }

    return { number, age, height, previousTeams };
  } catch (err) {
    console.log(`BBRef error for ${name}: ${err.message}`);
    // Manual patch for Dana Evans if BBRef fails
    if (name === "Dana Evans") {
      return { number: '', age: 0, height: '', previousTeams: ["DAL", "CHI"] };
    }
    return { number: '', age: 0, height: '', previousTeams: [] };
  }
}

// Main batch function
async function runBatchForTeam(teamUrl, teamCode, conf) {
  const players2Path = path.join(__dirname, 'players2.js');
  fs.writeFileSync(players2Path, 'const players = [\n');

  const players = await scrapeTeamRoster(teamUrl, teamCode, conf);

  let id = 1;
  for (const player of players) {
    try {
      // Use teamCode as current team abbreviation for previousTeams logic
      const bbref = await getBBRefInfo(player.name, player.team);

      // Fallback to WNBA data if BBRef is missing
      let number = bbref.number || player.number;
      let height = bbref.height || player.height;
      let age = bbref.age || player.age;
      let previousTeams = bbref.previousTeams || [];

      // Replace SAS with LVA and TUL with DAL
      previousTeams = previousTeams.map(t =>
        t === "SAS" ? "LVA" : t === "TUL" ? "DAL" : t
      );

      // Remove current team from previousTeams if present
      previousTeams = previousTeams.filter(t => t !== player.team);

      // Remove duplicates, keep order
      previousTeams = [...new Set(previousTeams)];

      // If rookie, ensure previousTeams is empty
      if (previousTeams.length === 1 && previousTeams[0] === player.team) {
        previousTeams = [];
      }

      // Fallback to WNBA player page if number is still missing and URL is available
      if (!number && player.wnbaUrl) {
        number = await getWNBAPlayerNumber(player.wnbaUrl);
      }

      // Special case for A'ja Wilson if needed (manual patch)
      if (player.name === "A'ja Wilson" && (number === "" || age === 0 || height === "")) {
        number = "22";
        height = "6'4\"";
        age = 27;
      }

      fs.appendFileSync(
        players2Path,
        `  { id: ${id}, name: "${player.name}", team: "${player.team}", position: "${player.position}", number: "${number}", age: ${age}, height: "${height}", conf: "${player.conf}", previousTeams: [${previousTeams.map(t => `"${t}"`).join(', ')}] },\n`
      );
      console.log(`Added: ${player.name}`);
      id++;
    } catch (err) {
      console.log(`Error for player ${player.name}: ${err.message}`);
    }
  }
  fs.appendFileSync(players2Path, '];\n\nexport default players;\n');
  console.log(`\nDone! ${players.length} players added to players2.js`);
}

// Only call this one function:
runBatchForTeam(
  'https://storm.wnba.com/roster',
  'SEA',
  'West'
);