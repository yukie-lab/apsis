# Decisions

This file records each design decision and its reason. Newest entries are at the end.

| # | Decision | Reason |
|---|----------|--------|
| D1 | Product name: **Apsis**. | Short. An apsis is the nearest or the farthest point of an orbit: a term that experts know and that is easy to say. |
| D2 | Project directory: `~/Desktop/test/apsis`. All tools, caches and downloads stay in it. | Instruction of the owner (2026-10-13): work in a new directory below `test/`. |
| D3 | Stack: TypeScript, Vite, React, three.js, zustand, vitest. Screens are tested with playwright-core and the installed Chrome. | Static output, no server. No browser download is necessary. |
| D4 | Planet ephemeris: JPL DE440 (`de440s.bsp`), fitted again with Chebyshev polynomials for 1949-12-14 to 2100-01-12 TDB, 4.3 MB. Fit tolerance 10 m. | DE440 is the reference of the industry. The full file (32 MB) is too large for a web page. The fit error is measured and published in the product. |
| D5 | Truth data: JPL Horizons API (planets, spacecraft, moons, small bodies). The raw responses are kept in `truth/horizons/raw/`. | The specification requires truth from Horizons, analytic solutions or primary documents. The raw text is the record of the source. |
| D6 | Internal time: TDB seconds after J2000.0. Internal frame: ICRF, origin at the solar system barycentre. Units: km, km/s, s. | Same conventions as SPICE and DE440. Conversions occur only at the user interface. |
| D7 | Physical constants (GM, radii, rotation) come from the NAIF kernels `gm_de440.tpc`, `pck00011.tpc`, `naif0012.tls`, converted by a script. | No constant comes from memory. |
| D8 | Moons use an analytic model (precessing ellipse) fitted to Horizons data. Small bodies use Chebyshev fits of Horizons vectors (1980 to 2060). The measured errors are published. | Full satellite ephemerides are too large. The user must know that the moon model is approximate. |
| D9 | One mission model for the two modes. A mission has a *plan* (patched conics: Lambert legs and flybys) and a *flight* (numerical trajectory with maneuvers in the full force model). | The specification requires the same engine and the same state in the two modes. |
| D10 | Integrator: Runge-Kutta-Fehlberg 7(8) with adaptive step. | High order, no external dependency. The order and the accuracy are tested against the analytic two-body solution. |
| D11 | Interchange formats: CCSDS OEM and OPM (KVN), GMAT script, STK ephemeris (`.e`), and the Apsis mission file (JSON). | OEM and OPM are the standards that STK, GMAT, Orekit and others read. |
| D12 | All text is in `src/i18n/locales/en.json`. A new language is a new JSON file in the same directory; the language switch shows automatically when more than one file exists. | The specification requires that Japanese can be added with no change to the code. |
| D13 | Spacecraft and planets are drawn from open sources only (NASA public domain, CC BY). `docs/ASSETS.md` lists each asset, its source and its licence. | Specification: no asset with an unknown licence. |
| D14 | Test limits are regression limits. The product publishes the *measured* value of each check, not the limit. First run 2026-10-14: three limits that I had guessed before the first measurement were corrected with a written reason in the test file (TDB-TT formula accuracy 30 microseconds; planet centres of Uranus and Neptune where two JPL sources disagree by thousands of km; moon model of Mimas). No engine constant was changed to pass a test. | The specification forbids tests that are tuned to pass. A limit must have a physical reason. |
| D15 | The force model includes the point masses of Ceres, Vesta and Psyche (1980 to 2060, the range of the small-body data). | First run of the asteroid propagation test: Vesta had an error of 1.15 km in 168 days. The cause is the gravity of Ceres (with Ceres in the model the error is 0.01 km). The fix is in the model, not in the test limit. |
| D16 | Limit of the patched-conic flyby check: the speeds at infinity before and after a flyby agree within 3 %. | The first limit (100 m/s) was a guess. Cassini at the Earth has 155 m/s, which is 1.0 % of 16 km/s. 3 % is the documented accuracy of the zero-sphere-of-influence model. The numerical model then makes each flyby ballistic. |
| D17 | Real missions are made again from the sequence of bodies and the real dates only. The path is solved by the engine at run time. | The specification forbids trajectories that are made in advance. The dates are facts (JPL Horizons and NASA pages); the path is a result. |
