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

// ---- Explorer mode ----

/** Wait for the start screen of the Explorer mode and for the maps of the 3D view. */
const homeReady = async (page) => {
  await page.waitForSelector('.xp-home', { timeout: 60000 });
  await page.waitForSelector('.view3d canvas', { timeout: 30000 });
  await page.waitForTimeout(3500);
};
const pickChip = (page, text) => page.locator('.xp-chips .chip', { hasText: text }).first().click();
/** A new flight starts the time: wait for that, then stop the time. */
const stopTime = async (page) => {
  const stop = page.getByRole('button', { name: 'Stop the time' });
  await stop.first().waitFor({ timeout: 15000 });
  await stop.first().click();
  await page.getByRole('button', { name: 'Start the time' }).first().waitFor({ timeout: 5000 });
};
/** Make a new mission to a body with the default settings and stop the time at its start. */
const flyTo = async (page, body) => {
  await homeReady(page);
  await pickChip(page, body);
  await page.locator('.xp-card .btn.primary').click();
  await page.waitForSelector('.xp-flight', { timeout: 300000 });
  await stopTime(page);
};
/** Start an actual mission from the second tab of the start screen and stop the time at its start. */
const flyMission = async (page, name) => {
  await homeReady(page);
  await pickChip(page, name);
  await page.locator('.xp-card .btn.primary').click();
  await page.waitForSelector('.xp-flight', { timeout: 300000 });
  await stopTime(page);
};
/** Move the time line of the flight to a fraction of the flight. */
const setTimeline = (page, fraction) => page.locator('.transport input[type=range]').evaluate((el, f) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(Math.round(1000 * f)));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, fraction);
/** The titles of the caption of the flight (one title for each event at the time of the caption). */
const caption = async (page) => (await page.locator('.xp-caption b').allTextContents()).join(' | ');
/** Push the button for the next event until the caption of the flight has this text. */
const toEvent = async (page, text) => {
  for (let k = 0; k < 24; k++) {
    await page.getByRole('button', { name: 'Go to the next event' }).click();
    await page.waitForTimeout(500);
    if ((await caption(page)).includes(text)) return;
    if (await page.locator('.xp-done').count()) break;
  }
  throw new Error('The flight has no event with the text: ' + text);
};
/** Go to the end of the flight: the screen then shows the summary of the flight. */
const toEnd = async (page) => {
  for (let k = 0; k < 40 && !(await page.locator('.xp-done').count()); k++) {
    await page.getByRole('button', { name: 'Go to the next event' }).click();
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('.xp-done', { timeout: 5000 });
};
/** Go to the last closest approach of the flight at a body. If the flight ends at the body, stay at the end. */
const toLastEvent = async (page, body) => {
  await toEnd(page);
  for (let k = 0; k < 8; k++) {
    await page.getByRole('button', { name: 'Go to the event before this time' }).click();
    await page.waitForTimeout(500);
    if ((await caption(page)).includes(body)) return;
  }
  await toEnd(page);
};

export const scenarios = [
  { name: 'expert-ephemeris', hash: '#/expert/ephemeris', fullPage: true },
  { name: 'expert-ephemeris-source', hash: '#/expert/ephemeris',
    run: async (page) => { await page.locator('button.src').first().click(); await page.waitForSelector('.pop'); } },
  { name: 'expert-accuracy', hash: '#/expert/accuracy', fullPage: true,
    run: async (page) => { await page.click('button.primary'); await page.waitForSelector('.banner.good, .banner.bad', { timeout: 60000 }); } },
  { name: 'expert-glossary', hash: '#/expert/glossary', fullPage: true },
  { name: 'expert-transfer', hash: '#/expert/transfer', fullPage: true,
    run: async (page) => { await page.getByRole('button', { name: 'Find the best dates' }).click(); await page.waitForTimeout(300); await busyDone(page); } },
  { name: 'expert-windows', hash: '#/expert/windows', fullPage: true,
    run: async (page) => { await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page); } },
  { name: 'expert-windows-actual', hash: '#/expert/windows', fullPage: true,
    run: async (page) => {
      await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page);
      await page.getByRole('button', { name: 'Mars 2020' }).click(); await page.waitForTimeout(300); await busyDone(page);
    } },
  { name: 'expert-mission-start', hash: '#/expert/mission', fullPage: true },
  { name: 'expert-mission-voyager2', hash: '#/expert/mission', fullPage: true, run: (page) => openFamous(page, 'Voyager 2') },
  { name: 'expert-mission-cassini', hash: '#/expert/mission', fullPage: true, run: (page) => openFamous(page, 'Cassini') },
  { name: 'expert-tour-voyager2', hash: '#/expert/mission', fullPage: true,
    run: async (page) => { await openFamous(page, 'Voyager 2'); await page.locator('.nav button', { hasText: 'Flyby tour' }).click(); await page.waitForSelector('canvas.tiss'); } },
  { name: 'expert-tour-cassini', hash: '#/expert/mission', fullPage: true,
    run: async (page) => { await openFamous(page, 'Cassini'); await page.locator('.nav button', { hasText: 'Flyby tour' }).click(); await page.waitForSelector('canvas.tiss'); } },
  { name: 'expert-maneuvers-empty', hash: '#/expert/maneuvers', fullPage: true },
  { name: 'expert-maneuvers-cassini', hash: '#/expert/mission', fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Maneuvers' }).click();
      await page.waitForSelector('table.inputs');
      // Select the deep-space maneuver: the orbit before and after it shows.
      await page.locator('table.inputs tbody tr').first().locator('button').first().click();
    } },
  { name: 'expert-maneuvers-target', hash: '#/expert/mission', fullPage: true,
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
  { name: 'expert-propagation-new', hash: '#/expert/propagation', fullPage: true },
  { name: 'expert-propagation-earth', hash: '#/expert/propagation', fullPage: true,
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
  { name: 'expert-propagation-cassini', hash: '#/expert/mission', fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Propagation' }).click();
      await page.getByRole('button', { name: 'Do the comparison' }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.waitForSelector('canvas.wide', { timeout: 30000 });
    } },
  { name: 'expert-files-empty', hash: '#/expert/files', fullPage: true },
  { name: 'expert-files-write', hash: '#/expert/mission', fullPage: true,
    run: async (page) => { await openFamous(page, 'Voyager 2'); await page.locator('.nav button', { hasText: 'Files' }).click(); await page.waitForSelector('pre.filetext'); } },
  { name: 'expert-files-write-fixed', hash: '#/expert/mission', fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Voyager 2');
      await page.locator('.nav button', { hasText: 'Files' }).click();
      await page.getByRole('button', { name: 'Fixed step' }).click();
      await page.waitForSelector('.banner.bad');
    } },
  { name: 'expert-files-write-gmat', hash: '#/expert/mission', fullPage: true,
    run: async (page) => {
      await openFamous(page, 'Cassini');
      await page.locator('.nav button', { hasText: 'Files' }).click();
      await page.locator('select').filter({ hasText: 'GMAT script' }).first().selectOption('gmat');
      await page.waitForSelector('ul.list');
    } },
  { name: 'expert-files-read-horizons', hash: '#/expert/files', fullPage: true,
    run: async (page) => { await readFile(page, 'truth/horizons/raw/enc_cassini_299_coarse.txt'); await page.waitForSelector('table.data'); } },
  { name: 'expert-files-read-search', hash: '#/expert/files', fullPage: true,
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
  { name: 'expert-files-read-error', hash: '#/expert/files', fullPage: true,
    run: async (page) => {
      await page.locator('textarea').fill('CCSDS_OEM_VERS = 2.0\nCREATION_DATE = 2026-01-01T00:00:00\nORIGINATOR = TEST\n\nMETA_START\nOBJECT_NAME = X\nOBJECT_ID = 2026-001A\nCENTER_NAME = SUN\nREF_FRAME = EME2000\nTIME_SYSTEM = GPS\nSTART_TIME = 2026-01-01T00:00:00\nSTOP_TIME = 2026-01-02T00:00:00\nMETA_STOP\n');
      await page.getByRole('button', { name: 'Read this text' }).click();
      await page.waitForSelector('.banner.bad');
    } },
  ...['oem', 'stk', 'csv', 'opm', 'mission'].map((format) => ({
    name: 'expert-files-again-' + format, hash: '#/expert/mission', fullPage: true,
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
  // ---- Explorer mode ----
  { name: 'explorer-home', hash: '#/explorer', sizes: ['desktop', 'phone', 'landscape'], run: homeReady },
  { name: 'explorer-home-destination', hash: '#/explorer',
    run: async (page) => { await homeReady(page); await pickChip(page, 'Mars'); await page.waitForSelector('.xp-card'); await page.waitForTimeout(3500); } },
  { name: 'explorer-home-options', hash: '#/explorer', sizes: ['desktop', 'phone', 'landscape'],
    run: async (page) => {
      await homeReady(page); await pickChip(page, 'Saturn'); await page.waitForSelector('.xp-card');
      await page.locator('.xp-card details summary').click(); await page.waitForTimeout(3500);
    } },
  { name: 'explorer-home-busy', hash: '#/explorer',
    // The progress line in the panel during the calculation of a flight.
    run: async (page) => { await homeReady(page); await pickChip(page, 'Jupiter'); await page.locator('.xp-card .btn.primary').click(); await page.waitForSelector('.busy-line', { timeout: 20000 }); },
    settle: 0 },
  { name: 'explorer-famous', hash: '#/explorer/famous', run: homeReady },
  { name: 'explorer-famous-mission', hash: '#/explorer/famous', sizes: ['desktop', 'phone', 'landscape'],
    run: async (page) => { await homeReady(page); await pickChip(page, 'Cassini'); await page.waitForSelector('.xp-card'); await page.waitForTimeout(3500); } },
  { name: 'explorer-flight-mars', hash: '#/explorer', sizes: ['desktop', 'phone', 'landscape'],
    // A new mission to Mars: the start, the cruise, the closest approach, the notes of the picture and the end.
    run: async (page, size, shot) => {
      await flyTo(page, 'Mars');
      await page.waitForTimeout(4000); await shot('1-start');
      await setTimeline(page, 0.5); await page.waitForTimeout(4500); await shot('2-cruise');
      await toEvent(page, 'Closest approach to Mars'); await page.waitForTimeout(6000); await shot('3-approach');
      await page.locator('.scene-note-line').click(); await page.waitForSelector('.scene-note-text'); await page.waitForTimeout(400); await shot('4-notes');
      await page.locator('.scene-note-line').click();
      await toEnd(page);
    }, settle: 3000 },
  { name: 'explorer-flight-saturn-orbit', hash: '#/explorer',
    // A new mission that goes into orbit around Saturn: the rings from near and the views that the user selects.
    run: async (page, size, shot) => {
      await homeReady(page); await pickChip(page, 'Saturn'); await page.waitForSelector('.xp-card');
      await page.locator('.xp-card').getByRole('button', { name: 'Go into orbit', exact: true }).click();
      await page.locator('.xp-card .btn.primary').click();
      await page.waitForSelector('.xp-flight', { timeout: 300000 });
      await stopTime(page);
      await toEvent(page, 'Closest approach to Saturn'); await page.waitForTimeout(6000); await shot('1-approach');
      await page.locator('.xp-views').getByRole('button', { name: 'Spacecraft', exact: true }).click(); await page.waitForTimeout(4000); await shot('2-spacecraft');
      await page.locator('.xp-views').getByRole('button', { name: 'Saturn', exact: true }).click(); await page.waitForTimeout(4000); await shot('3-body');
      await page.locator('.xp-views').getByRole('button', { name: 'Solar system', exact: true }).click(); await page.waitForTimeout(4000);
    } },
  { name: 'explorer-flight-voyager2', hash: '#/explorer/famous', sizes: ['desktop', 'phone', 'landscape'],
    // The actual mission with four flybys: one picture at each planet.
    run: async (page, size, shot) => {
      await flyMission(page, 'Voyager 2');
      for (const body of ['Jupiter', 'Saturn', 'Uranus']) { await toEvent(page, 'Closest approach to ' + body); await page.waitForTimeout(6000); await shot(body.toLowerCase()); }
      await toEvent(page, 'Closest approach to Neptune');
    }, settle: 6000 },
  { name: 'explorer-flight-cassini', hash: '#/explorer/famous',
    run: async (page, size, shot) => {
      await flyMission(page, 'Cassini');
      await toEvent(page, 'Closest approach to Venus'); await page.waitForTimeout(6000); await shot('venus');
      await toEvent(page, 'Closest approach to the Earth'); await page.waitForTimeout(6000); await shot('earth');
      await toEvent(page, 'Closest approach to Saturn');
    }, settle: 6000 },
  ...[['New Horizons', 'Pluto'], ['Voyager 1', 'Saturn'], ['Mars 2020', 'Mars'], ['Juno', 'Jupiter'], ['Ulysses', 'Jupiter'], ['Pioneer 11', 'Saturn']].map(([mission, body]) => ({
    name: 'explorer-flight-' + mission.toLowerCase().replace(/\s/g, ''), hash: '#/explorer/famous',
    // The last encounter of each of the other actual missions.
    run: async (page) => { await flyMission(page, mission); await toLastEvent(page, body); }, settle: 6000,
  })),
  { name: 'explorer-to-expert', hash: '#/explorer',
    // The same mission in the Expert mode, then the Explorer mode again: the mission stays open.
    run: async (page, size, shot) => {
      await flyTo(page, 'Venus');
      await toEvent(page, 'Closest approach to Venus'); await page.waitForTimeout(5000);
      await page.locator('.xp-top').getByRole('button', { name: 'Show the numbers' }).click();
      await page.waitForSelector('.expert table.data', { timeout: 30000 }); await page.waitForTimeout(3000); await shot('1-expert');
      await page.locator('.mode button').first().click();
      await page.waitForSelector('.xp-flight, .xp-home', { timeout: 30000 });
    }, settle: 4000 },
  // ---- 3D view of the Expert mode ----
  { name: 'expert-view3d', hash: '#/expert/mission',
    run: async (page, size, shot) => {
      await openFamous(page, 'Cassini');
      await page.locator('.view3d.inpanel').scrollIntoViewIfNeeded();
      await page.waitForTimeout(5000); await shot('1-system');
      for (let k = 0; k < 2; k++) { await page.getByRole('button', { name: 'Go to the next event' }).first().click(); await page.waitForTimeout(300); }
      await page.locator('.scene-views').getByRole('button', { name: 'Spacecraft', exact: true }).click();
      await page.waitForTimeout(5000);
    } },
  // ---- About screen ----
  { name: 'about', hash: '#/about', fullPage: true, run: async (page) => { await page.waitForSelector('.about-maps article', { timeout: 30000 }); } },
  { name: 'about-from-expert', hash: '#/expert/mission',
    run: async (page) => { await page.locator('.top').getByRole('button', { name: 'About', exact: true }).click(); await page.waitForSelector('.about-maps article', { timeout: 30000 }); } },
  { name: 'about-remove-data', hash: '#/about', reloads: true,
    // The question before the application removes the stored data, then the check that the data is not there.
    run: async (page, size, shot) => {
      await page.evaluate(() => localStorage.setItem('apsis.probe', '1'));
      await page.getByRole('button', { name: 'Remove the stored data' }).click();
      await page.waitForSelector('.dialog'); await shot('1-question');
      await Promise.all([page.waitForEvent('load'), page.locator('.dialog').getByRole('button', { name: 'Remove', exact: true }).click()]);
      await page.waitForSelector('.app', { timeout: 30000 });
      if (await page.evaluate(() => localStorage.getItem('apsis.probe') !== null)) throw new Error('The stored data stayed in the browser.');
    } },
];
