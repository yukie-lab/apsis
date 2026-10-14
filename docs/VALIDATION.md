# Accuracy checks

The command `npm run report` writes this file from the files in `src/validation/measured/`.
The automatic tests (`npm test`) write those files. Do not change this file: the command writes it again.
The Accuracy screen of the application shows the same values.

## Rules

- A reference value comes from one of three sources: an exact solution, a published document of a mission, or JPL Horizons. The column "Reference" gives the source of each check.
- The output of the application is not a reference. The group "Solvers" is the only exception, and the text of that group gives the reason.
- "Measured" is the largest error that the test measured.
- "Test limit" is the limit of the automatic test. If the measured error is larger than the limit, the test result is a failure. A limit does not tell you the accuracy: the measured value is the result.
- The record of each reference value is in the directory `truth/`: the text that JPL Horizons sent, and the address and the date of each published value.

## Summary

| Subject | Number of checks | Checks in the limit |
|---------|-----------------:|--------------------:|
| Positions of the bodies | 49 | 49 |
| Exact solutions | 7 | 7 |
| Time scales and frames | 4 | 4 |
| Launch windows of actual missions | 15 | 15 |
| Actual missions with flybys | 107 | 107 |
| Propagation from the state of an actual spacecraft | 19 | 19 |
| Files for other programs | 16 | 16 |
| Solvers | 4 | 4 |
| All | 221 | |

The check of the order of the integrator has a smallest permitted value, not a largest permitted error.

## Positions of the bodies

The positions of the bodies agree with JPL Horizons. The product shows the measured errors.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Sun: maximum position difference | 0.00186 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Mercury: maximum position difference | 0.00396 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Venus: maximum position difference | 0.00399 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Earth: maximum position difference | 0.00306 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Moon: maximum position difference | 0.0107 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Earth-Moon barycenter: maximum position difference | 0.00306 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Mars: maximum position difference | 0.00264 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Mars system barycenter: maximum position difference | 0.00245 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Jupiter system barycenter: maximum position difference | 0.00186 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Saturn system barycenter: maximum position difference | 0.00218 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Uranus system barycenter: maximum position difference | 0.00255 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Neptune system barycenter: maximum position difference | 0.00181 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Pluto system barycenter: maximum position difference | 0.000945 km | 0.0500 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Jupiter: maximum position difference | 4.87 km | 10.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Saturn: maximum position difference | 9.69 km | 20.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Uranus: maximum position difference | 4 811 km | 6 000 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Neptune: maximum position difference | 2 208 km | 3 000 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Pluto: maximum position difference | 79.7 km | 150 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 312 epochs from 1950 to 2099 |
| Phobos: maximum position difference relative to Mars | 220 km | 374 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Deimos: maximum position difference relative to Mars | 162 km | 938 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Io: maximum position difference relative to Jupiter | 1 228 km | 16 921 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Europa: maximum position difference relative to Jupiter | 2 358 km | 26 742 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Ganymede: maximum position difference relative to Jupiter | 5 050 km | 42 799 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Callisto: maximum position difference relative to Jupiter | 5 811 km | 75 133 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Mimas: maximum position difference relative to Saturn | 28 381 km | 36 458 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Enceladus: maximum position difference relative to Saturn | 1 614 km | 9 476 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Tethys: maximum position difference relative to Saturn | 8 733 km | 11 786 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Dione: maximum position difference relative to Saturn | 928 km | 15 063 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Rhea: maximum position difference relative to Saturn | 1 871 km | 21 078 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Titan: maximum position difference relative to Saturn | 6 029 km | 49 637 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Iapetus: maximum position difference relative to Saturn | 41 398 km | 142 642 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Miranda: maximum position difference relative to Uranus | 2 145 km | 5 198 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Ariel: maximum position difference relative to Uranus | 791 km | 7 620 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Umbriel: maximum position difference relative to Uranus | 1 385 km | 10 641 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Titania: maximum position difference relative to Uranus | 741 km | 17 463 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Oberon: maximum position difference relative to Uranus | 2 401 km | 23 335 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Triton: maximum position difference relative to Neptune | 1 990 km | 14 192 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Charon: maximum position difference relative to Pluto | 83.2 km | 784 km | JPL Horizons vectors relative to the center of the planet, 106 epochs from 2000 to 2050 |
| Ceres: maximum position difference | 0.859 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Vesta: maximum position difference | 0.614 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Psyche: maximum position difference | 0.438 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Eros: maximum position difference | 1.02 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Itokawa: maximum position difference | 2.46 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Ryugu: maximum position difference | 0.133 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Bennu: maximum position difference | 0.0290 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Didymos: maximum position difference | 0.121 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Arrokoth: maximum position difference | 0.0738 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Halley: maximum position difference | 0.450 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |
| Churyumov-Gerasimenko: maximum position difference | 0.417 km | 50.0 km | JPL Horizons vectors (ICRF, relative to the solar system barycenter), 174 epochs from 1980 to 2059 |

## Exact solutions

The results agree with exact solutions: the Hohmann transfer, the two-body orbit, the Tisserand parameter and the B-plane of a hyperbola.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Hohmann transfer from the Lambert solver: velocity change | 1.44 × 10⁻⁶ m/s | 0.0500 m/s | Analytic Hohmann transfer between circular orbits in one plane (1 au to 1.523679 au) |
| Lambert solutions: end position after a two-body propagation | 9.62 × 10⁻¹² (relative) | 1.00 × 10⁻⁸ (relative) | Analytic two-body propagation (universal variables) of each Lambert solution |
| Integrator: measured order of the error | 8.10 (order) | 7.50 (order) | Analytic two-body solution. Error ratio for the steps h and h/2. |
| Integrator: position error after 10 revolutions of an eccentric orbit | 0.0114 km | 1.00 km | Analytic two-body solution after 10 revolutions (a = 1.3 au, e = 0.5) |
| B-plane distance and periapsis radius of an exact hyperbola | 2.33 × 10⁻¹⁴ (relative) | 1.00 × 10⁻¹¹ (relative) | Exact two-body hyperbola from its elements: b = a √(e² − 1). |
| Tisserand parameter along a curve of constant speed at infinity | 2.51 × 10⁻¹³ | 1.00 × 10⁻⁹ | Analytic: T = 3 − (v∞ / V)² for a circular planet orbit |
| Tisserand graph: point of the Hohmann transfer | 3.92 × 10⁻¹⁶ | 1.00 × 10⁻¹² | Analytic: Hohmann transfer between circular orbits |

## Time scales and frames

The time scales and the frames agree with JPL Horizons.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Rotation between the ICRF and ECLIPJ2000 | 9.19 × 10⁻⁸ km | 0.0100 km | JPL Horizons vectors of the same body in the ICRF and in the ecliptic of J2000 |
| Heliocentric ecliptic positions of 4 bodies | 0.00157 km | 0.0200 km | JPL Horizons vectors (heliocentric, ecliptic of J2000) of Venus, the Earth, Mars and the Jupiter barycenter, from 1950 to 2099 |
| Osculating elements: semi-major axis | 4.08 × 10⁻⁹ (relative) | 1.00 × 10⁻⁸ (relative) | JPL Horizons osculating elements (heliocentric, ecliptic of J2000) of Venus, the Earth, Mars and the Jupiter barycenter |
| Conversion from UTC to TDB | 3.11 × 10⁻⁵ s | 5.00 × 10⁻⁵ s | JPL Horizons, column "delta-T" (TDB − UT) of the vector tables, 89 epochs from 1972 to 2099 |

## Launch windows of actual missions

The launch energy and the launch dates of actual missions agree with the JPL Horizons trajectories and with a published launch period. The length of the flight path of four Mars missions agrees with the published distances.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Voyager 2: launch C3 of the plan with the actual dates | 0.345 % | 4.00 % | JPL Horizons trajectory of Voyager 2: launch energy from the first state relative to the Earth |
| Voyager 1: launch C3 of the plan with the actual dates | 1.13 % | 4.00 % | JPL Horizons trajectory of Voyager 1: launch energy from the first state relative to the Earth |
| Cassini: launch C3 of the plan with the actual dates | 1.60 % | 4.00 % | JPL Horizons trajectory of Cassini: launch energy from the first state relative to the Earth |
| New Horizons: launch C3 of the plan with the actual dates | 0.651 % | 4.00 % | JPL Horizons trajectory of New Horizons: launch energy from the first state relative to the Earth |
| Galileo: launch C3 of the plan with the actual dates | 0.426 % | 4.00 % | JPL Horizons trajectory of Galileo: launch energy from the first state relative to the Earth |
| Ulysses: launch C3 of the plan with the actual dates | 1.12 % | 4.00 % | JPL Horizons trajectory of Ulysses: launch energy from the first state relative to the Earth |
| Pioneer 10: launch C3 of the plan with the actual dates | 1.01 % | 4.00 % | JPL Horizons trajectory of Pioneer 10: launch energy from the first state relative to the Earth |
| Pioneer 11: launch C3 of the plan with the actual dates | 1.48 % | 4.00 % | JPL Horizons trajectory of Pioneer 11: launch energy from the first state relative to the Earth |
| Mars 2020: launch C3 of the plan with the actual dates | 0.930 % | 4.00 % | JPL Horizons trajectory of Mars 2020: launch energy from the first state relative to the Earth |
| Mars 2020: day of the minimum C3 in the published launch period | 0 d | 0.500 d | JPL document "Mars 2020 Perseverance Launch Press Kit": launch period from 2020-07-20 to 2020-08-11, landing on 2021-02-18 |
| Mars 2020: ratio of the C3 at the actual dates to the minimum of the map | 1.11 (ratio) | 1.15 (ratio) | Actual launch date and arrival date of Mars 2020 (NSSDCA Master Catalog) |
| Mars 2020: length of the flight path from the Earth to Mars, compared with the published distance | 0.0659 % | 2.00 % | JPL document "Mars 2020 Perseverance Launch Press Kit": distance of the flight from the Earth to Mars, approximately 497 million km (for a launch on the first day of the launch period) |
| InSight: length of the flight path from the Earth to Mars, compared with the published distance | 0.0338 % | 2.00 % | JPL document "InSight Launch Press Kit": distance of the flight from the Earth to Mars, approximately 485 million km (for a launch on the first day of the launch period) |
| Mars Science Laboratory: length of the flight path from the Earth to Mars, compared with the published distance | 0.0367 % | 2.00 % | JPL document "Mars Science Laboratory Launch Press Kit": distance of the flight from the Earth to Mars, approximately 570 million km (the document gives no launch day, and the test uses the first day of the launch period) |
| Phoenix: length of the flight path from the Earth to Mars, compared with the published distance | 0.225 % | 2.00 % | JPL document "Phoenix Launch Press Kit": distance of the flight from the Earth to Mars, approximately 680 million km (the document gives no launch day, and the test uses the first day of the launch period) |

### Launch energy in the published launch periods

The table shows the launch energy that the engine calculates for the published launch period of each mission. The arrival time is the published landing time.
These values have no test limit: a project selects its launch period with more conditions than the launch energy.
A published document about Mars Science Laboratory gives two limits of its launch period: the energy that the launch vehicle can give, and the entry velocity at Mars.
The record of the sources is in `truth/published/published.json`.

| Mission | Published launch period | C3 on the first day | C3 on the last day | Day of the minimum C3 | Days from the first day | Minimum in the period | Transfer angle on the first day | Transfer angle on the day of the minimum |
|---------|-------------------------|--------------------:|-------------------:|-----------------------|------------------------:|-----------------------|--------------------------------:|-----------------------------------------:|
| Mars 2020 | 2020-07-20 to 2020-08-11 | 14.0 km²/s² | 18.5 km²/s² | 2020-07-23 | 3 | Yes | 153° | 150° |
| InSight | 2018-05-05 to 2018-06-08 | 8.2 km²/s² | 14.6 km²/s² | 2018-05-11 | 6 | Yes | 156° | 150° |
| Mars Science Laboratory | 2011-11-25 to 2011-12-18 | 10.6 km²/s² | 20.3 km²/s² | 2011-11-07 | -18 | No | 173° | 191° |
| Phoenix | 2007-08-03 to 2007-08-24 | 29.1 km²/s² | 27.2 km²/s² | 2007-09-30 | 58 | No | 211° | 155° |

The day of the minimum C3 is the launch day with the smallest launch energy for the published arrival time. The search goes from 60 days before the period to 60 days after it.
The transfer angle is the angle about the Sun from the Earth at the launch to Mars at the arrival.
For Phoenix, the C3 on the last day uses the published landing day for a launch at the end of the period (2008-06-05).

## Actual missions with flybys

The application makes the flights of actual missions again from their dates. The flybys have no engine burn, and the flyby conditions agree with JPL Horizons and with published values.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Voyager 2, calculated flight: speed at infinity at Jupiter (encounter 1) | 0.448 % | 1.00 % | JPL Horizons trajectory -32: speed at infinity, two-body orbit of the state at the closest approach |
| Voyager 2, calculated flight: radius of the closest approach to Jupiter (encounter 1) | 1.02 % | 3.00 % | JPL Horizons trajectory -32: radius of the closest approach |
| Voyager 2, calculated flight: speed at infinity at Saturn (encounter 2) | 0.0307 % | 1.00 % | JPL Horizons trajectory -32: speed at infinity, two-body orbit of the state at the closest approach |
| Voyager 2, calculated flight: radius of the closest approach to Saturn (encounter 2) | 0.185 % | 3.00 % | JPL Horizons trajectory -32: radius of the closest approach |
| Voyager 2, calculated flight: speed at infinity at Uranus (encounter 3) | 0.000660 % | 1.00 % | JPL Horizons trajectory -32: speed at infinity, two-body orbit of the state at the closest approach |
| Voyager 2, calculated flight: radius of the closest approach to Uranus (encounter 3) | 0.244 % | 3.00 % | JPL Horizons trajectory -32: radius of the closest approach |
| Voyager 2, calculated flight: speed at infinity at Neptune (encounter 4) | 0.0815 % | 1.00 % | JPL Horizons trajectory -32: speed at infinity, two-body orbit of the state at the closest approach |
| Voyager 2, calculated flight: sum of the correction maneuvers | 104 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Cassini, calculated flight: speed at infinity at Venus (encounter 1) | 0.0123 % | 1.00 % | JPL Horizons trajectory -82: speed at infinity, two-body orbit of the state at the closest approach |
| Cassini, calculated flight: radius of the closest approach to Venus (encounter 1) | 0.325 % | 3.00 % | JPL Horizons trajectory -82: radius of the closest approach |
| Cassini, calculated flight: speed at infinity at Venus (encounter 2) | 0.141 % | 1.00 % | JPL Horizons trajectory -82: speed at infinity, two-body orbit of the state at the closest approach |
| Cassini, calculated flight: radius of the closest approach to Venus (encounter 2) | 0.920 % | 3.00 % | JPL Horizons trajectory -82: radius of the closest approach |
| Cassini, calculated flight: speed at infinity at the Earth (encounter 3) | 0.0119 % | 1.00 % | JPL Horizons trajectory -82: speed at infinity, two-body orbit of the state at the closest approach |
| Cassini, calculated flight: radius of the closest approach to the Earth (encounter 3) | 0.0920 % | 3.00 % | JPL Horizons trajectory -82: radius of the closest approach |
| Cassini, calculated flight: speed at infinity at Jupiter (encounter 4) | 0.000577 % | 1.00 % | JPL Horizons trajectory -82: speed at infinity, two-body orbit of the state at the closest approach |
| Cassini, calculated flight: radius of the closest approach to Jupiter (encounter 4) | 0.0785 % | 3.00 % | JPL Horizons trajectory -82: radius of the closest approach |
| Cassini, calculated flight: speed at infinity at Saturn (encounter 5) | 0.480 % | 1.00 % | JPL Horizons trajectory -82: speed at infinity, two-body orbit of the state 11.6 h before the periapsis (approach hyperbola) |
| Cassini, calculated flight: sum of the correction maneuvers | 34.1 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| New Horizons, calculated flight: speed at infinity at Jupiter (encounter 1) | 0.000487 % | 1.00 % | JPL Horizons trajectory -98: speed at infinity, two-body orbit of the state at the closest approach |
| New Horizons, calculated flight: radius of the closest approach to Jupiter (encounter 1) | 0.0336 % | 3.00 % | JPL Horizons trajectory -98: radius of the closest approach |
| New Horizons, calculated flight: speed at infinity at Pluto (encounter 2) | 0.00675 % | 1.00 % | JPL Horizons trajectory -98: speed at infinity, two-body orbit of the state at the closest approach |
| New Horizons, calculated flight: sum of the correction maneuvers | 0.219 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Voyager 1, calculated flight: speed at infinity at Jupiter (encounter 1) | 0.143 % | 1.00 % | JPL Horizons trajectory -31: speed at infinity, two-body orbit of the state at the closest approach |
| Voyager 1, calculated flight: radius of the closest approach to Jupiter (encounter 1) | 0.248 % | 3.00 % | JPL Horizons trajectory -31: radius of the closest approach |
| Voyager 1, calculated flight: speed at infinity at Saturn (encounter 2) | 0.386 % | 1.00 % | JPL Horizons trajectory -31: speed at infinity, two-body orbit of the state at the closest approach |
| Voyager 1, calculated flight: sum of the correction maneuvers | 73.0 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Mars 2020, calculated flight: speed at infinity at Mars (encounter 1) | 0.0183 % | 1.00 % | JPL Horizons trajectory -168: speed at infinity, two-body orbit of the state 5.7 h before the periapsis (approach hyperbola) |
| Mars 2020, calculated flight: sum of the correction maneuvers | 0 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Juno, calculated flight: speed at infinity at the Earth (encounter 1) | 0.424 % | 1.00 % | JPL Horizons trajectory -61: speed at infinity, two-body orbit of the state at the closest approach |
| Juno, calculated flight: radius of the closest approach to the Earth (encounter 1) | 1.42 % | 3.00 % | JPL Horizons trajectory -61: radius of the closest approach |
| Juno, calculated flight: speed at infinity at Jupiter (encounter 2) | 0.0329 % | 1.00 % | JPL Horizons trajectory -61: speed at infinity, two-body orbit of the state 11.8 h before the periapsis (approach hyperbola) |
| Juno, calculated flight: sum of the correction maneuvers | 45.5 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Ulysses, calculated flight: speed at infinity at Jupiter (encounter 1) | 0.0513 % | 1.00 % | JPL Horizons trajectory -55: speed at infinity, two-body orbit of the state at the closest approach |
| Ulysses, calculated flight: sum of the correction maneuvers | 0 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Pioneer 11, calculated flight: speed at infinity at Jupiter (encounter 1) | 0.00171 % | 1.00 % | JPL Horizons trajectory -24: speed at infinity, two-body orbit of the state at the closest approach |
| Pioneer 11, calculated flight: radius of the closest approach to Jupiter (encounter 1) | 2.42 % | 3.00 % | JPL Horizons trajectory -24: radius of the closest approach |
| Pioneer 11, calculated flight: speed at infinity at Saturn (encounter 2) | 0.385 % | 1.00 % | JPL Horizons trajectory -24: speed at infinity, two-body orbit of the state at the closest approach |
| Pioneer 11, calculated flight: sum of the correction maneuvers | 35.6 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Cassini, calculated flight: deep-space maneuver | 0.846 % | 3.00 % | Velocity jump in the JPL Horizons trajectory of Cassini on 1998-12-03 (6 h samples) |
| Juno, calculated flight: deep-space maneuver | 6.12 % | 10.0 % | Sum of the two velocity jumps in the JPL Horizons trajectory of Juno (2012-08-30 and 2012-09-14, 6 h samples) |
| Cassini, calculated flight: apoapsis radius after the insertion burn | 1.30 × 10⁻⁵ % | 1.00 % | JPL Horizons trajectory -82: apoapsis radius of the osculating orbit 2 days after the insertion burn |
| Juno, calculated flight: apoapsis radius after the insertion burn | 9.77 × 10⁻⁸ % | 1.00 % | JPL Horizons trajectory -61: apoapsis radius of the osculating orbit 2 days after the insertion burn |
| Mars 2020, calculated flight: arrival time | 304 s | 480 s | JPL document "Mars 2020 Perseverance Launch Press Kit" and NSSDCA Master Catalog: the Earth got the landing signal at 2021-02-18 20:55 UTC |
| New Horizons: time of the closest approach to Pluto in the JPL trajectory | 16.1 s | 60.0 s | NSSDCA Master Catalog: closest approach to Pluto 2015-07-14 11:48:45 UTC |
| New Horizons, calculated flight: published distance of the flyby of Pluto | 0.0967 % | 2.00 % | NSSDCA Master Catalog: "within 12500 km of Pluto" |
| New Horizons, calculated flight: published distance of the flyby of Jupiter | 0.766 % | 3.00 % | NSSDCA Master Catalog: "within about 32 Jovian radii of Jupiter" |
| Cassini: corrections in the JPL trajectory before the flyby of the Earth | 96.9 m/s | 200 m/s | Velocity jumps in the JPL Horizons trajectory of Cassini between 1999-06-27 and 1999-08-16 (10-day samples, propagated with this engine) |
| Voyager 2: time of the closest approach to Jupiter in the JPL trajectory | 1.31 s | 90.0 s | NASA Science, page of the Voyager 2 mission: closest approach 1979-07-09 22:29 UT |
| Voyager 2: time of the closest approach to Uranus in the JPL trajectory | 8.65 s | 90.0 s | NASA Science, page of the Voyager 2 mission: closest approach 1986-01-24 17:59 UT |
| Voyager 2: time of the closest approach to Neptune in the JPL trajectory | 19.9 s | 90.0 s | NASA Science, page of the Voyager 2 mission: closest approach 1989-08-25 03:56 UT |
| Voyager 2, patched-conic plan: speed difference across the flyby of Jupiter | 1.26 % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby (the energy relative to the planet is constant). |
| Voyager 2, patched-conic plan: speed at infinity at Jupiter | 3.01 % | 5.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 at the flyby |
| Voyager 2, patched-conic plan: periapsis radius at Jupiter | 3.68 % | 5.00 % | Periapsis radius of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, patched-conic plan: speed difference across the flyby of Saturn | 1.18 % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby (the energy relative to the planet is constant). |
| Voyager 2, patched-conic plan: speed at infinity at Saturn | 0.868 % | 5.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 at the flyby |
| Voyager 2, patched-conic plan: periapsis radius at Saturn | 2.44 % | 5.00 % | Periapsis radius of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, patched-conic plan: speed difference across the flyby of Uranus | 0.0502 % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby (the energy relative to the planet is constant). |
| Voyager 2, patched-conic plan: speed at infinity at Uranus | 0.190 % | 5.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 at the flyby |
| Voyager 2, patched-conic plan: periapsis radius at Uranus | 0.0644 % | 5.00 % | Periapsis radius of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, patched-conic plan: speed at infinity at Neptune | 0.192 % | 5.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 at Neptune |
| Voyager 2, flight from the plan: speed at infinity at Jupiter | 0.367 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, flight from the plan: periapsis radius at Jupiter | 1.02 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, flight from the plan: published distance of the flyby of Jupiter | 0.342 % | 2.00 % | NASA Science, page of the Voyager 2 mission: closest approach at approximately 645000 km from the planet |
| Voyager 2, flight from the plan: speed at infinity at Saturn | 0.0319 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, flight from the plan: periapsis radius at Saturn | 0.185 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, flight from the plan: published distance of the flyby of Saturn | 0.174 % | 2.00 % | NASA Science, page of the Voyager 2 mission: closest approach at approximately 101000 km from the planet |
| Voyager 2, flight from the plan: speed at infinity at Uranus | 0.00645 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, flight from the plan: periapsis radius at Uranus | 0.244 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, flight from the plan: published distance of the flyby of Uranus | 0.333 % | 2.00 % | NASA Science, page of the Voyager 2 mission: closest approach at approximately 81500 km from the planet |
| Voyager 2, flight from the plan: speed at infinity at Neptune | 0.186 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Voyager 2 |
| Voyager 2, calculated flight: sum of the correction maneuvers | 104 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Cassini, patched-conic plan: speed difference across the flyby of Venus | 0 % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby. |
| Cassini, patched-conic plan: speed difference across the flyby of Venus | 6.40 × 10⁻¹³ % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby. |
| Cassini, patched-conic plan: speed difference across the flyby of the Earth | 1.16 % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby. |
| Cassini, patched-conic plan: speed difference across the flyby of Jupiter | 1.65 % | 3.00 % | A flyby with no engine burn has equal speeds at infinity before and after the flyby. |
| Cassini, patched-conic plan: deep-space maneuver | 19.2 % | 30.0 % | Velocity jump in the JPL Horizons trajectory of Cassini on 1998-12-03 |
| Cassini, flight from the plan: speed at infinity at Venus | 0.0183 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: periapsis radius at Venus | 0.171 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: published distance of the flyby of Venus | 0.167 % | 2.00 % | NASA Science, page "Timeline" of the Cassini mission: distance of closest approach (approximate values) |
| Cassini, flight from the plan: speed at infinity at Venus | 0.147 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: periapsis radius at Venus | 0.971 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: published distance of the flyby of Venus | 0.932 % | 2.00 % | NASA Science, page "Timeline" of the Cassini mission: distance of closest approach (approximate values) |
| Cassini, flight from the plan: speed at infinity at the Earth | 0.0151 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: periapsis radius at the Earth | 0.0912 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: published distance of the flyby of the Earth | 1.05 % | 2.00 % | NASA Science, page "Timeline" of the Cassini mission: distance of closest approach (approximate values) |
| Cassini, flight from the plan: speed at infinity at Jupiter | 0.127 % | 1.00 % | Speed at infinity of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: periapsis radius at Jupiter | 0.0924 % | 2.00 % | Periapsis radius of the JPL Horizons trajectory of Cassini |
| Cassini, flight from the plan: published distance of the flyby of Jupiter | 1.96 % | 5.00 % | NASA Science, page "Timeline" of the Cassini mission: distance of closest approach (approximate values) |
| Cassini, flight from the plan: deep-space maneuver | 1.03 % | 3.00 % | Velocity jump in the JPL Horizons trajectory of Cassini on 1998-12-03 |
| Cassini, calculated flight: sum of the correction maneuvers | 34.1 m/s | 200 m/s | A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys. |
| Propagation of Voyager 2 through the flyby of Jupiter: periapsis radius | 285 km | 2 000 km | JPL Horizons trajectory of Voyager 2 relative to the center of the planet, 1-minute samples |
| Propagation of Voyager 2 through the flyby of Saturn: periapsis radius | 60.4 km | 500 km | JPL Horizons trajectory of Voyager 2 relative to the center of the planet, 1-minute samples |
| Propagation of Voyager 2 through the flyby of Uranus: periapsis radius | 0.0800 km | 100 km | JPL Horizons trajectory of Voyager 2 relative to the center of the planet, 1-minute samples |
| Propagation of Voyager 2 through the flyby of Neptune: periapsis radius | 0.0926 km | 100 km | JPL Horizons trajectory of Voyager 2 relative to the center of the planet, 1-minute samples |
| Propagation of Cassini through the flyby of Venus: periapsis radius | 0.0574 km | 10.0 km | JPL Horizons trajectory of Cassini relative to the center of the planet, 1-minute samples |
| Propagation of Cassini through the flyby of Venus: periapsis radius | 2.21 km | 10.0 km | JPL Horizons trajectory of Cassini relative to the center of the planet, 1-minute samples |
| Propagation of Cassini through the flyby of the Earth: periapsis radius | 0.279 km | 10.0 km | JPL Horizons trajectory of Cassini relative to the center of the planet, 1-minute samples |
| Propagation of Cassini through the flyby of Jupiter: periapsis radius | 0.220 km | 50.0 km | JPL Horizons trajectory of Cassini relative to the center of the planet, 1-minute samples |
| Propagation of Galileo through the flyby of Venus: periapsis radius | 0.0388 km | 10.0 km | JPL Horizons trajectory of Galileo relative to the center of the planet, 1-minute samples |
| Propagation of Galileo through the flyby of the Earth: periapsis radius | 0.179 km | 10.0 km | JPL Horizons trajectory of Galileo relative to the center of the planet, 1-minute samples |
| Propagation of Galileo through the flyby of the Earth: periapsis radius | 0.209 km | 10.0 km | JPL Horizons trajectory of Galileo relative to the center of the planet, 1-minute samples |
| Propagation of New Horizons through the flyby of Jupiter: periapsis radius | 3.16 km | 50.0 km | JPL Horizons trajectory of New Horizons relative to the center of the planet, 1-minute samples |
| Propagation of New Horizons through the flyby of Pluto: periapsis radius | 13.5 km | 50.0 km | JPL Horizons trajectory of New Horizons relative to the center of the planet, 1-minute samples |
| Propagation of Juno through the flyby of the Earth: periapsis radius | 0.581 km | 10.0 km | JPL Horizons trajectory of Juno relative to the center of the planet, 1-minute samples |
| Propagation of Ulysses through the flyby of Jupiter: periapsis radius | 1.48 km | 50.0 km | JPL Horizons trajectory of Ulysses relative to the center of the planet, 1-minute samples |
| Propagation of MESSENGER through the flyby of the Earth: periapsis radius | 0.106 km | 10.0 km | JPL Horizons trajectory of MESSENGER relative to the center of the planet, 1-minute samples |
| Propagation of Rosetta through the flyby of the Earth: periapsis radius | 0.0536 km | 10.0 km | JPL Horizons trajectory of Rosetta relative to the center of the planet, 1-minute samples |

## Propagation from the state of an actual spacecraft

The application propagates a state of an actual spacecraft or asteroid and measures the difference from the JPL Horizons trajectory.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Maneuver search: size of the deep-space maneuver of Cassini | 0.000298 % | 1.00 % | Velocity jump in the JPL Horizons trajectory of Cassini (6 h samples) on 1998-12-03 |
| Maneuver search: time of the deep-space maneuver of Cassini | 0.0930 d | 0.250 d | Time of the velocity jump in the JPL Horizons trajectory of Cassini (6 h samples) |
| Maneuver search: size of a known impulse of 25 m/s | 1.40 × 10⁻⁵ mm/s | 1.00 mm/s | Exact: the impulse is an input of the test trajectory (25 m/s) |
| Propagation of Eros: maximum position difference after 168 days | 0.0450 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of Ceres: maximum position difference after 168 days | 0.0593 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of Vesta: maximum position difference after 168 days | 0.0866 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of Psyche: maximum position difference after 168 days | 0.172 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of Arrokoth: maximum position difference after 168 days | 0.00173 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of Didymos: maximum position difference after 168 days | 0.0233 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of Ryugu: maximum position difference after 168 days | 0.0648 km | 1.00 km | JPL Horizons vectors of the asteroid, 5 arcs of 168 days |
| Propagation of New Horizons, 2008 to 2009: position difference at the end | 671 km | 1 500 km | JPL Horizons trajectory of the spacecraft relative to the Sun (New Horizons, cruise in hibernation, 364 days) |
| Propagation of New Horizons, 2012 to 2014: position difference at the end | 7 903 km | 16 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (New Horizons, cruise, 730 days) |
| Propagation of Voyager 2, 1990 to 1992: position difference at the end | 7 443 km | 15 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Voyager 2, after Neptune, 730 days) |
| Propagation of Voyager 1, 1995 to 2000: position difference at the end | 45 648 km | 90 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Voyager 1, 1820 days) |
| Propagation of Pioneer 10, 1980 to 1985: position difference at the end | 152 562 km | 300 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Pioneer 10, 1820 days) |
| Propagation of Cassini, 2001 to 2002: position difference at the end | 9 233 km | 18 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Cassini, cruise after Jupiter, 364 days) |
| Propagation of Juno, 2014 to 2015: position difference at the end | 8 624 km | 17 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Juno, cruise after the Earth flyby, 364 days) |
| Propagation of Ulysses, 1993 to 1994: position difference at the end | 12 810 km | 25 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Ulysses, 364 days) |
| Propagation of Mars 2020 in cruise: position difference at the end | 6 455 km | 12 000 km | JPL Horizons trajectory of the spacecraft relative to the Sun (Mars 2020, cruise with correction maneuvers, 174 days) |

## Files for other programs

The application reads the files that it writes, and it reads tables of JPL Horizons. These checks do not use the other programs.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| JPL Horizons vector tables: positions and velocities from the reader | 0 km | 1.00 × 10⁻⁹ km | The numbers of truth/horizons/*.json for 166 output files of JPL Horizons (vector tables). An independent parser made these numbers. The same decimal text gives the same number, thus the correct value is 0. |
| JPL Horizons vector tables: times from the reader | 2.03 × 10⁻⁵ s | 2.10 × 10⁻⁵ s | Julian dates of the same output files as one 64-bit number (step 40 microseconds) in truth/horizons/*.json |
| JPL Horizons vector tables in au and days: positions from the reader | 8.94 × 10⁻⁸ km | 2.00 × 10⁻⁷ km | JPL Horizons tables of the same bodies in km and s (truth/horizons/frames.json). The test reads tables of Mars and Venus in au and days and a table of the Earth in km and days. |
| OEM file that the application wrote and read again: position | 4.77 × 10⁻⁷ km | 1.00 × 10⁻⁶ km | The application writes a flight table (Voyager 2, 4515 samples, 4 segments) to an OEM file and reads the file. The reference is the table before the file. The limit comes from the digits of the file (16 digits). |
| OEM file that the application wrote and read again: velocity | 7.11 × 10⁻¹⁵ km/s | 1.00 × 10⁻¹⁴ km/s | The same test with an OEM file. The reference is the table before the file. The limit comes from the digits of the file (16 digits). |
| OEM file with UTC times that the application wrote and read again: time | 3.58 × 10⁻⁷ s | 1.00 × 10⁻⁶ s | The same test with an OEM file with UTC times. The reference is the table before the file. The limit comes from the digits of the file (6 decimals of the second). |
| STK ephemeris file that the application wrote and read again: position | 4.77 × 10⁻⁷ km | 1.00 × 10⁻⁶ km | The same test with an STK ephemeris file. The reference is the table before the file. The limit comes from the digits of the file (16 digits). |
| STK ephemeris file that the application wrote and read again: velocity | 7.11 × 10⁻¹⁵ km/s | 1.00 × 10⁻¹⁴ km/s | The same test with an STK ephemeris file. The reference is the table before the file. The limit comes from the digits of the file (16 digits). |
| STK ephemeris file that the application wrote and read again: time | 3.58 × 10⁻⁷ s | 1.00 × 10⁻⁶ s | The same test with an STK ephemeris file. The reference is the table before the file. The limit comes from the digits of the file (seconds after the epoch with 6 decimals). |
| CSV table with calendar times that the application wrote and read again: time | 3.58 × 10⁻⁷ s | 1.00 × 10⁻⁶ s | The same test with a CSV file with calendar times. The reference is the table before the file. The limit comes from the digits of the file (6 decimals of the second). Positions and velocities have 17 digits and do not change. |
| OPM file that the application wrote and read again: position | 2.98 × 10⁻⁸ km | 3.00 × 10⁻⁷ km | The application writes the start state of a flight (Voyager 2, heliocentric, ecliptic frame) to an OPM file and reads the file. The reference is the state before the file. The limit comes from the 16 digits of the file. |
| Interpolation in a table (Hermite, degree 7): position on an exact circular orbit | 3.78 × 10⁻⁷ km | 3.91 × 10⁻⁷ km | Analytic circular orbit (radius 7000 km, 0.2 rad between samples). The interpolation is at the center of each interval between samples. The limit is the remainder of the Hermite formula of degree 7. |
| Table with the steps of the integrator (Voyager 2): interpolation error between the samples | 0.0584 km | 1.00 km | Flight of Voyager 2 (12 years, 4 flybys). The test compares the Hermite interpolation of degree 7 in the table of integrator steps with a new integration to the center of each interval. The two values come from this application: the test is not an independent check. |
| Closest approach of Cassini to Venus from a JPL Horizons table with 1-hour samples: radius | 0.0190 km | 1.00 km | JPL Horizons trajectory of Cassini at Venus (1998-04-26), 1-minute samples: closest approach from the table with 1-hour samples |
| Closest approach of Cassini to Venus from a JPL Horizons table with 1-day samples: radius | 0.00764 km | 1.00 km | JPL Horizons trajectory of Cassini at Venus (1998-04-26), 1-minute samples: closest approach from the table with 1-day samples |
| Closest approaches of Cassini to Venus and to the Earth from a JPL Horizons table with 10-day samples: radius | 3.71 km | 5.00 km | JPL Horizons trajectory of Cassini at Venus (2 flybys) and at the Earth, 1-minute samples: closest approaches from the table with 10-day samples relative to the Sun |

## Solvers

The target of each solver is an input. These checks show that the solver gets to the target. They do not show that the models of the engine are correct.

| Check | Measured | Test limit | Reference |
|-------|---------:|-----------:|-----------|
| Flight solver: number of the 352 quick missions with no solution | 0 missions | 0 missions | The target of each solution is an input: this is a test of the solvers. |
| Targeter: distance from the aim point after a new propagation | 0.000895 km | 0.500 km | The aim point is an input. The test propagates the flight that the targeter gives and measures its aim point. |
| Targeter, flyby of Jupiter at 137 radii (Cassini): distance from the aim point after a new propagation | 0.301 km | 2.00 km | The aim point is an input. The test propagates the flight that the targeter gives and measures its aim point. |
| Targeter, encounter with an orbit insertion: distance from the aim point after a new propagation | 0.0105 km | 0.500 km | The aim point is an input. The test propagates the flight that the targeter gives and measures its aim point. |

## Items with no check

These items have no comparison with an independent reference. Use them with caution.

### Centers of Uranus and Neptune

The barycenters of the two planet systems agree with JPL Horizons to 0.003 km. The application calculates each planet center from the barycenter and the moon model. The JPL Horizons centers are 4 811 km (Uranus) and 2 208 km (Neptune) from these results. The moons cannot move the planet that far. A possible cause is that Horizons uses satellite ephemeris files with a different barycenter. There is no check of this cause.

### Rotation angle of the bodies

The application uses the pole and the rotation rate of the NAIF file pck00011.tpc to show the maps of the bodies. No test compares the rotation angle with a reference. The trajectory calculations do not use the rotation angle. They use the pole direction for the J2 force.

### Files in other programs

The file writers obey the format documents of CCSDS, STK and GMAT. The tests read the files again with the readers of this application. No test opened the files in STK or in GMAT, because these programs were not available.

### Simplified Technical English

A script examined the texts of the application with the writing rules of ASD-STE100 and a word list. The script does not have the official dictionary of the specification.

### Spacecraft masses

The masses and the specific impulse of each spacecraft are example values. They are not the values of the actual spacecraft.

### Insertion burns of Cassini and Juno

The application calculates each insertion burn as an impulse that gives the orbit of the JPL trajectory after the burn. No test compares the size of the burn with a published value.

### Maneuvers that the search finds in a table

The Files screen finds velocity changes in a trajectory table. For the deep-space maneuver of Cassini, the size and the time agree with the velocity change in the JPL Horizons table. No test compares the results with the maneuver documents of a mission.

### Dimensions of the spacecraft models

The 3D models obey published dimensions where a source was available. The dimensions of the models of the Mars 2020 cruise stage and of Ulysses are estimates.

### Colors and brightness of the bodies in the 3D view

The maps come from mission data. The brightness of each map and the values of each atmosphere do not come from measured data: the project set them for a good picture. No test compares the pictures with images from spacecraft or telescopes. The source of the Jupiter map does not give the longitude of the map. Thus the 3D view can show the clouds of Jupiter at an incorrect longitude.

### Shapes of the small bodies in the 3D view

The shape of an asteroid or a comet in the 3D view is approximate: it shows the type of the shape, not a measured model. A body with no radius in the JPL Small-Body Database has a radius of 10 km in the picture.

### Other browsers and computers

The check of the pictures of the screens was in one browser on one computer. The check for a small screen used a browser window with the size of a phone screen: no check used an actual phone. The engine tests used Node.js. The checks on this screen show if your browser gives the same numbers.

## Limits of the models

The engine has no model for these effects.

### Burns are impulses

Each maneuver changes the velocity in zero time. A long burn of an actual engine has losses that the model does not include.

### Forces of the model

The force model has point-mass gravity, the J2 of the planets and the relativity term of the Sun. If you set it, the model also has radiation pressure on a sphere. It has no atmosphere, no higher gravity terms and no attitude.

### Moons

The moon positions come from an analytic model with errors of 83 km to 41 400 km. A plan can use the flyby of a planet. It cannot give an accurate flyby of a moon.

### Plans around the Sun only

A plan is a sequence of transfers around the Sun with flybys. The application cannot make a plan around a planet, for example a tour of the moons of Jupiter. After an arrival burn, a flight can stay in an orbit around the planet.

### Launch

A flight starts in a circular parking orbit. The model does not include the launch site or the flight from the ground to the orbit.

### Atmosphere entry

A flight with an entry stops at the equatorial radius of the body. The model does not include the atmosphere.

### Interpolation

Between the steps of the integrator, the positions come from an interpolation. For the flight of Voyager 2, the largest interpolation error that the test measured is 0.06 km.

### Date range

The planet data is for 1950 to 2100. The small-body data is for 1980 to 2060.

### UTC before 1972

UTC has leap seconds from 1972. For a date before 1972, the application uses TAI − UTC = 9 s. This is not the UTC of those years: the error of a UTC time before 1972 can be some seconds. This limit does not change the TDB times.

### No light time

All positions are geometric positions at one time. The application does not correct a position for the time of the light between a body and the point of view.

### Trajectory tables with a fixed step

A table with a fixed step has large interpolation errors at a flyby. For the flight of Voyager 2, a table with 1-day samples has an error of 149 000 km at Neptune. The table with the steps of the integrator has an error of 0.06 km with a third of the samples. The Files screen shows this error before it writes a file.

### JPL Horizons tables of a spacecraft relative to the barycenter

For Cassini in 1999 and for Juno in 2013, the JPL Horizons tables relative to the Sun and to the Earth agree. The table relative to the solar system barycenter is 118 km (Cassini) and 117 km (Juno) from them. For the flyby of the Earth by Cassini, the table relative to the barycenter gives an altitude that is 86 km too small. A possible cause is that Horizons uses a different planet file for the barycenter. There is no check of this cause. Use a table relative to the Sun or to the planet of the flyby.
