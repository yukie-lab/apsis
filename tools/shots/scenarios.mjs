// Scenarios for tools/shots/shots.mjs: one entry for each screen and state that the pictures must show.
const busyDone = async (page) => { await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 180000 }); };

/** Open an actual mission from the start panel of the Mission screen and wait for its flight. */
const openFamous = async (page, name) => {
  await page.locator('tr', { hasText: name }).first().getByRole('button', { name: 'Open' }).click();
  await page.waitForTimeout(300);
  await busyDone(page);
  await page.waitForSelector('table.data tr.click', { timeout: 30000 });
};

/** Give a file of the project to the file field of the Files screen. */
const readFile = async (page, path) => {
  await page.locator('.nav button', { hasText: 'Files' }).click();
  await page.locator('input[type=file]').setInputFiles(path);
  await page.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 60000 });
};

export const scenarios = [
  { name: 'expert-ephemeris', hash: '#/expert/ephemeris', sizes: ['desktop', 'phone'], fullPage: true },
  { name: 'expert-ephemeris-source', hash: '#/expert/ephemeris', sizes: ['desktop', 'phone'],
    run: async (page) => { await page.locator('button.src').first().click(); await page.waitForSelector('.pop'); } },
  { name: 'expert-accuracy', hash: '#/expert/accuracy', sizes: ['desktop'], fullPage: true,
    run: async (page) => { await page.click('button.primary'); await page.waitForSelector('.banner.good, .banner.bad', { timeout: 60000 }); } },
  { name: 'expert-glossary', hash: '#/expert/glossary', sizes: ['desktop'], fullPage: true },
  { name: 'expert-transfer', hash: '#/expert/transfer', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => { await page.getByRole('button', { name: 'Find the best dates' }).click(); await page.waitForTimeout(300); await busyDone(page); } },
  { name: 'expert-windows', hash: '#/expert/windows', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => { await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page); } },
  { name: 'expert-windows-actual', hash: '#/expert/windows', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page);
      await page.getByRole('button', { name: 'Mars 2020' }).click(); await page.waitForTimeout(300); await busyDone(page);
    } },
  { name: 'expert-mission-start', hash: '#/expert/mission', sizes: ['desktop', 'phone'], fullPage: true },
  { name: 'expert-mission-voyager2', hash: '#/expert/mission', sizes: ['desktop'], fullPage: true, run: (page) => openFamous(page, 'Voyager 2') },
  { name: 'expert-mission-cassini', hash: '#/expert/mission', sizes: ['desktop', 'phone'], fullPage: true, run: (page) => openFamous(page, 'Cassini') },
  { name: 'expert-tour-voyager2', hash: '#/expert/mission', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => { await openFamous(page, 'Voyager 2'); await page.locator('.nav button', { hasText: 'Flyby tour' }).click(); await page.waitForSelector('canvas.tiss'); } },
  { name: 'expert-tour-cassini', hash: '#/expert/mission', sizes: ['desktop'], fullPage: true,
    run: async (page) => { await openFamous(page, 'Cassini'); await page.locator('.nav button', { hasText: 'Flyby tour' }).click(); await page.waitForSelector('canvas.tiss'); } },
  { name: 'expert-maneuvers-empty', hash: '#/expert/maneuvers', sizes: ['desktop', 'phone'], fullPage: true },
  { name: 'expert-maneuvers-cassini', hash: '#/expert/mission', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Maneuvers' }).click();
      await page.waitForSelector('table.inputs');
      // Select the deep-space maneuver: the orbit before and after it shows.
      await page.locator('table.inputs tbody tr').first().locator('button').first().click();
    } },
  { name: 'expert-maneuvers-target', hash: '#/expert/mission', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Maneuvers' }).click();
      await page.waitForSelector('table.inputs');
      // Aim the correction maneuver after the flyby of the Earth at a point 100 000 km farther from Jupiter.
      await page.locator('table.inputs tbody tr').nth(2).locator('button').first().click();
      await page.waitForFunction(() => [...document.querySelectorAll('select option:checked')].some((o) => o.textContent.startsWith('Jupiter')));
      await page.waitForTimeout(200);
      const bt = page.getByLabel('B·T', { exact: true });
      const now = Number((await bt.inputValue()).replace(/\s/g, ''));
      await bt.fill(String(now + 100000));
      await bt.blur();
      await page.getByRole('button', { name: /Calculate maneuver/ }).click();
      await page.waitForTimeout(300);
      await busyDone(page);
      await page.waitForSelector('.banner.good', { timeout: 30000 });
    } },
  { name: 'expert-propagation-new', hash: '#/expert/propagation', sizes: ['desktop', 'phone'], fullPage: true },
  { name: 'expert-propagation-earth', hash: '#/expert/propagation', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      // A low orbit about the Earth from the example values, then the comparison of the forces.
      await page.locator('.context select').nth(2).selectOption('EARTH');
      await page.getByRole('button', { name: /Set example values/ }).click();
      await page.getByRole('button', { name: 'Orbit elements', exact: true }).first().click();
      await page.getByRole('button', { name: 'Calculate the flight' }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.getByRole('button', { name: 'Do the comparison' }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.waitForSelector('canvas.wide', { timeout: 30000 });
    } },
  { name: 'expert-propagation-cassini', hash: '#/expert/mission', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Propagation' }).click();
      await page.getByRole('button', { name: 'Do the comparison' }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.waitForSelector('canvas.wide', { timeout: 30000 });
    } },
  { name: 'expert-files-empty', hash: '#/expert/files', sizes: ['desktop', 'phone'], fullPage: true },
  { name: 'expert-files-write', hash: '#/expert/mission', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => { await openFamous(page, 'Voyager 2'); await page.locator('.nav button', { hasText: 'Files' }).click(); await page.waitForSelector('pre.filetext'); } },
  { name: 'expert-files-write-fixed', hash: '#/expert/mission', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Voyager 2');
      await page.locator('.nav button', { hasText: 'Files' }).click();
      await page.getByRole('button', { name: 'Fixed step' }).click();
      await page.waitForSelector('.banner.bad');
    } },
  { name: 'expert-files-write-gmat', hash: '#/expert/mission', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Files' }).click();
      await page.locator('select').filter({ hasText: 'GMAT script' }).first().selectOption('gmat');
      await page.waitForSelector('ul.list');
    } },
  { name: 'expert-files-read-horizons', hash: '#/expert/files', sizes: ['desktop', 'phone'], fullPage: true,
    run: async (page) => { await readFile(page, 'truth/horizons/raw/enc_cassini_299_coarse.txt'); await page.waitForSelector('table.data'); } },
  { name: 'expert-files-read-search', hash: '#/expert/files', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      await readFile(page, 'truth/horizons/raw/enc_cassini_helio_10d.txt');
      await page.getByRole('button', { name: 'Search for maneuvers between the samples' }).click();
      await page.waitForTimeout(300);
      await busyDone(page);
      await page.getByRole('button', { name: 'Make a mission from this trajectory' }).click();
      await page.waitForTimeout(300);
      await busyDone(page);
      await page.waitForSelector('canvas.wide', { timeout: 60000 });
    } },
  { name: 'expert-files-read-error', hash: '#/expert/files', sizes: ['desktop'], fullPage: true,
    run: async (page) => {
      await page.locator('textarea').fill('CCSDS_OEM_VERS = 2.0\nCREATION_DATE = 2026-01-01T00:00:00\nORIGINATOR = TEST\n\nMETA_START\nOBJECT_NAME = X\nOBJECT_ID = 2026-001A\nCENTER_NAME = SUN\nREF_FRAME = EME2000\nTIME_SYSTEM = GPS\nSTART_TIME = 2026-01-01T00:00:00\nSTOP_TIME = 2026-01-02T00:00:00\nMETA_STOP\n');
      await page.getByRole('button', { name: 'Read this text' }).click();
      await page.waitForSelector('.banner.bad');
    } },
  ...['oem', 'stk', 'csv', 'opm', 'mission'].map((format) => ({
    name: 'expert-files-again-' + format, hash: '#/expert/mission', sizes: ['desktop'], fullPage: true,
    // Write the flight of Voyager 2 in one format, then read that file again on the same screen.
    run: async (page) => {
      await openFamous(page, 'Voyager 2');
      await page.locator('.nav button', { hasText: 'Files' }).click();
      await page.locator('select').filter({ hasText: 'GMAT script' }).first().selectOption(format);
      await page.waitForSelector('pre.filetext');
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Write the file' }).click()]);
      const path = 'shots/files/' + download.suggestedFilename();
      await download.saveAs(path);
      await page.locator('input[type=file]').setInputFiles(path);
      await page.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 60000 });
      await page.waitForSelector(format === 'opm' || format === 'mission' ? '.stack .panel + .panel' : 'table.data');
    } })),
];
