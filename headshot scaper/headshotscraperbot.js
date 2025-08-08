const puppeteer = require('puppeteer');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = './output';
const SILHOUETTE_DIR = './output/silhouettes';

// Add as many team roster URLs as you want here
const TEAM_ROSTER_URLS = [
    { name: 'sun', url: 'https://sun.wnba.com/roster' },
  
    // Add more teams here...
];

async function scrapeTeamRoster(teamName, rosterUrl) {
    const teamOutputDir = path.join(OUTPUT_DIR, teamName);
    const teamSilhouetteDir = path.join(SILHOUETTE_DIR, teamName);

    if (!fs.existsSync(teamOutputDir)) fs.mkdirSync(teamOutputDir, { recursive: true });
    if (!fs.existsSync(teamSilhouetteDir)) fs.mkdirSync(teamSilhouetteDir, { recursive: true });

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(rosterUrl, { waitUntil: 'networkidle2' });

    const playerData = await page.$$eval('ul[class*="TeamRoster_roster"] > li', players =>
        players.map(player => {
            const img = player.querySelector('img[src*="headshots"]');
            const nameElem = player.querySelector('h3');
            return img && nameElem
                ? {
                    name: nameElem.textContent.trim().replace(/[^a-zA-Z ]/g, '').replace(/\s+/g, '').toLowerCase(),
                    imgUrl: img.src
                }
                : null;
        }).filter(Boolean)
    );

    console.log(`[${teamName}] Found ${playerData.length} player headshots.`);

    for (const { name, imgUrl } of playerData) {
        const imagePath = path.join(teamOutputDir, `${name}-actual.png`);
        const silhouettePath = path.join(teamSilhouetteDir, `${name}-headshot.png`);

        try {
            const image = await Jimp.read(imgUrl);
            image.resize(350, 254);
            await image.writeAsync(imagePath);

            // Create silhouette: set all non-transparent pixels to black, keep alpha
            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                const alpha = this.bitmap.data[idx + 3];
                if (alpha > 0) {
                    this.bitmap.data[idx + 0] = 0; // R
                    this.bitmap.data[idx + 1] = 0; // G
                    this.bitmap.data[idx + 2] = 0; // B
                }
            });
            await image.writeAsync(silhouettePath);

            console.log(`[${teamName}] Saved: ${name}`);
        } catch (err) {
            console.error(`[${teamName}] Failed to process image for ${name}:`, err.message);
        }
    }

    await browser.close();
}

async function scrapeAllTeams() {
    for (const { name, url } of TEAM_ROSTER_URLS) {
        await scrapeTeamRoster(name, url);
    }
}

scrapeAllTeams().catch(console.error);