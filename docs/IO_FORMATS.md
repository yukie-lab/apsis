# Interchange formats

This page describes the files that Apsis exchanges with other programs.
The code is in `src/engine/io/`.
The tests are in `tests/io.test.ts`.
The date of this page is 2026-10-14.

Each format has a "Verified" list and a "Not verified" list.
An item is in a "Verified" list only if a test in `tests/io.test.ts` does the check.
The words "manual check" show an exception: the author of the module did that check one time, and no test does it.

STK and GMAT were not available.
No program other than Apsis read a file that Apsis wrote.

## 1. Summary

| Format | Apsis writes | Apsis reads | Functions |
|---|---|---|---|
| CCSDS Orbit Ephemeris Message (OEM) | Version 2.0 | Versions 1.0, 2.0, 3.0 | `writeOem`, `parseOem` |
| CCSDS Orbit Parameter Message (OPM) | Version 2.0 | Versions 1.0, 2.0, 3.0 | `writeOpm`, `parseOpm`, `opmFromFlight`, `flightFromOpm` |
| STK ephemeris file (`.e`) | Format `EphemerisTimePosVel` | Format `EphemerisTimePosVel` | `writeStkEphemeris`, `parseStkEphemeris` |
| GMAT script | Fields of the guide R2015a | No | `writeGmatScript`, `gmatDifferences` |
| CSV table | Yes | Yes | `writeCsv`, `parseCsv` |
| JPL Horizons vector table | No | Yes | `parseHorizonsVectors` |

Tools for tables: `tableFromTrajectory`, `tableToCenterFrame`, `interpolateTable`.
All the functions are exports of `src/engine/io/index.ts`.

## 2. Rules for all formats

### 2.1 Data in memory

- A time in memory is `et`: TDB seconds after J2000 (JD 2451545.0 TDB).
- A position is in km. A velocity is in km/s.
- An `EphemerisTable` holds a table of states.
- A table has the name and the identifier of the object, the centre, the frame and the time scale of the file text.
- A table also has the times, the states, the comments and the starts of the segments.
- The centre is an Apsis body identifier or `SSB` (the barycentre of the solar system).
- The frame is `ICRF` or `ECLIPJ2000`.
- The engine does not read a clock. The caller gives the creation time of a file.
- The engine has no sentences for the user. The comment text in a file comes from the caller.

### 2.2 Segments and maneuvers

A maneuver of Apsis changes the velocity in zero time.
Thus a table has segments.

- A segment is the part of a table between two maneuvers.
- The last sample of a segment is the state before the maneuver.
- The first sample of the next segment is the state after the maneuver.
- These two samples have the same time.
- Interpolation uses the samples of one segment only.

`tableFromTrajectory` makes a table from a trajectory of the engine.

- The step is constant in the time scale of the file. For UTC, the step is a number of SI seconds.
- The first time and the last time of the trajectory are always in the table.
- The start and the end of each segment are always in the table.
- The grid starts at the first time of the propagation.
- The table does not use a grid time that is nearer than 0.001 s to the end of a segment.
- A table can have 5 000 000 grid times at most.
- The times of a table increase, also for a trajectory that goes backward in time.

`tableToCenterFrame` changes the centre and the frame of a table.
`interpolateTable` gives the state at a time between the samples.
It uses Hermite interpolation with 4 samples, which is a polynomial of degree 7.

### 2.3 Time scales

Apsis reads and writes the time scales UTC, TAI, TT and TDB.

- TT = TAI + 32.184 s.
- The difference TDB - TT comes from the formula of the engine. Its accuracy is approximately 30 microseconds.
- UTC has leap seconds. The engine has the table of the leap seconds (source: NAIF file `naif0012.tls`).
- A UTC time in a leap second has the second 60, for example `2016-12-31T23:59:60.5`.
- The readers accept the second 60 only in UTC and only in a real leap second.
- Before 1972-01-01 the engine uses TAI - UTC = 9 s. This is not the UTC of those years.

The writers give a calendar time as `YYYY-MM-DDThh:mm:ss.ffffff`.

### 2.4 Frames

- `ICRF`: the axes of the International Celestial Reference Frame.
- `ECLIPJ2000`: the ICRF axes turned about the x axis by 84381.448 arcseconds.
- The readers use the frame names `EME2000` and `J2000` as the ICRF axes.
- The EME2000 axes and the ICRF axes are different by a constant rotation of approximately 0.02 arcsecond.
- Apsis does not apply this rotation. The angle is 1e-7 rad, which is 15 km at a distance of 1 au.

### 2.5 Centres

The writers of the CCSDS messages give these names:

| Apsis identifier | Name in the file |
|---|---|
| `SSB` | `SOLAR SYSTEM BARYCENTER` |
| `EMB` | `EARTH BARYCENTER` |
| `JUPITER_BARYCENTER` and equivalent identifiers | `JUPITER BARYCENTER` |
| A body (`SUN`, `EARTH`, `MOON`, `CERES`) | The identifier in upper case, with a blank for each `_` |

The readers of the CCSDS messages and of the STK file accept these names:

- The Apsis identifiers.
- The names of the table above, in upper case or lower case, with a blank or `_` between the words.
- `EARTH MOON BARYCENTER` and `EARTH-MOON BARYCENTER`.
- `MERCURY BARYCENTER` and `VENUS BARYCENTER`. These planets have no moon: the reader uses the planet.
- A small body with its number or its designation, as in the SANA registry: `1 CERES`, `433 EROS`, `1P/HALLEY`.

The Horizons reader uses the NAIF integer code in the header of the table (0, 10, 399, 5).

### 2.6 Numbers

| File | Positions and velocities | Times |
|---|---|---|
| OEM, OPM, STK | 16 significant digits, exponent form | 6 decimals of the second |
| CSV | 17 significant digits, exponent form | 6 decimals of the second, or a Julian date with 12 decimals |
| GMAT script | The shortest text that gives the same 64-bit number | Epoch: 11 decimals of the day (0.9 microsecond) |

- 16 digits are the maximum of the CCSDS standard (502.0-B-2, sections 6.5.4 and 6.5.5).
- With 16 digits, the last digit of a coordinate below 1e10 km (67 au) is 1e-6 km or smaller.
- With 16 digits, the last digit of a velocity component below 100 km/s is 1e-14 km/s or smaller.
- With 17 digits, a reader gets the same 64-bit number again.
- A time in memory is one 64-bit number. Its step is 1.2e-7 s for times from 17 to 34 years from J2000.
- From 34 to 68 years from J2000 the step is 2.4e-7 s.

### 2.7 Errors

A reader or a writer that finds a problem throws an `IoError`.

- `code`: a short machine code, for example `oem.keyword`. Section 9 has the list.
- `line`: the line number in the text. The first line is 1. A writer gives no line number.
- `detail`: the keyword, the value or the index that caused the problem, if that helps.

The user interface translates the codes.

## 3. CCSDS Orbit Ephemeris Message (OEM)

Functions: `writeOem(table, options)` and `parseOem(text)`.
The notation is "keyword = value" (KVN). Apsis does not read or write the XML notation.

### 3.1 What Apsis writes

| Item | Value |
|---|---|
| Version | `CCSDS_OEM_VERS = 2.0` (CCSDS 502.0-B-2) |
| Header | `CCSDS_OEM_VERS`, `COMMENT`, `CREATION_DATE`, `ORIGINATOR` |
| Metadata of a block | `OBJECT_NAME`, `OBJECT_ID`, `CENTER_NAME`, `REF_FRAME`, `TIME_SYSTEM`, `START_TIME`, `STOP_TIME`, `INTERPOLATION`, `INTERPOLATION_DEGREE` |
| Blocks | One metadata block with its data lines for each segment of the table |
| Data line | Time, X, Y, Z, X_DOT, Y_DOT, Z_DOT |
| Frame | `REF_FRAME = ICRF` always |
| Centre | A name of section 2.5 |
| Time scales | `UTC`, `TAI`, `TT`, `TDB` |
| Units | km and km/s. An OEM has no unit text. |
| Digits | 16 significant digits. Times have 6 decimals of the second. |
| Interpolation | `HERMITE`, degree 7. A block with n lines has the degree 2n - 1 at most. |
| Text values | Upper case, printable ASCII. An empty value becomes `UNKNOWN`. |
| Lines | 254 characters at most. A long comment continues on the next `COMMENT` line. |
| Creation date | UTC with whole seconds. The caller gives the time. |

- The standard says that a reader must not interpolate across a metadata block (5.2.4.6). This is correct for a maneuver.
- Version 2.0 has no frame name for the ecliptic. The writer thus turns an `ECLIPJ2000` table to the ICRF.
- The writer does not give `USEABLE_START_TIME`, `USEABLE_STOP_TIME`, accelerations or a covariance matrix.
- The last line of a block and the first line of the next block have the same time.
- Version 1.0 permits such a repeated time in words (4.3.5 c).
- Versions 2.0 and 3.0 permit "a possibly shared endpoint" of the useable time spans (5.2.4.4).

### 3.2 What Apsis reads

| Item | Value |
|---|---|
| Versions | 1.0, 2.0 and 3.0. The first number of `CCSDS_OEM_VERS` must be 1, 2 or 3. |
| Header | `CLASSIFICATION`, `CREATION_DATE`, `ORIGINATOR`, `MESSAGE_ID`. `CREATION_DATE` and `ORIGINATOR` are necessary. |
| Metadata | The keywords of section 3.1, and `REF_FRAME_EPOCH`, `USEABLE_START_TIME`, `USEABLE_STOP_TIME` |
| Frames | `ICRF`, `ICRFn`, `GCRF`, `GCRFn`, `EME2000`, `J2000` (ICRF axes) and `J2000_ECLIPTIC` |
| Centres | Section 2.5 |
| Time scales | `UTC`, `TAI`, `TT`, `TDB` |
| Time text | `YYYY-MM-DDThh:mm:ss[.d][Z]` and `YYYY-DDDThh:mm:ss[.d][Z]`. Version 1.0: also a Julian date. |
| Data line | 7 values, or 10 values with the acceleration |
| Comments | The reader keeps the text of all the `COMMENT` lines in one list. |

- Each metadata block becomes one segment of the table.
- The reader does not use the acceleration.
- The reader ignores the lines from `COVARIANCE_START` to `COVARIANCE_STOP`.
- The reader does not use the values of `INTERPOLATION`, `INTERPOLATION_DEGREE` and `REF_FRAME_EPOCH`.
- A keyword that the standard does not have gives the error `oem.keyword`.
- All the blocks must have the same object, centre, frame and time scale. If not, the error is `oem.mixed`.
- A file can have times that decrease. The reader puts the samples in the order of time.
- If the lines of two blocks overlap in time, the reader cuts the two blocks.
- It uses the first block up to the start of the useable time of the second block.
- If the blocks do not overlap, the reader keeps all the lines, also the lines out of the useable time span.
- The reader does not compare `START_TIME` and `STOP_TIME` with the data lines.

### 3.3 Verified

- Reader, version 2.0: a file of 43 lines written by hand from the standard gives the hand values. The file has two blocks, comments, an acceleration, a covariance block, a day-of-year time and a leap second.
- Reader, version 1.0: a hand file with Julian dates, TDB and the centre `MARS BARYCENTER` gives the hand values.
- Reader, version 3.0: a hand file with `CLASSIFICATION`, `MESSAGE_ID` and the frame `ICRF3` gives the hand values.
- Reader: one instant written in TT, in TAI and in UTC gives the same `et` (hand values at J2000).
- Reader: 600 s of TT are 600 s plus 2.0e-7 s of TDB in January (hand value from the rate of TDB - TT).
- Reader: the overlap rule and a file with times that decrease give the hand values.
- Reader: 25 files that are not correct give the correct error code and line number.
- Writer: the text obeys the structure rules of 502.0-B-2. The test has these rules again, with no use of the reader.
- The rules are about the line length, the characters, the keyword form and the keyword order of tables 5-2 and 5-3.
- They are also about the obligatory keywords, the time form, the number form and the 7 values of a data line.
- Writer: the time labels of `et` = 0 in the four time scales are the hand values.
- Writer: a table in `ECLIPJ2000` gives the hand values in the ICRF.
- Real flight (Voyager 2): the UTC labels go back by one second at each of the 8 leap seconds from 1977 to 1989.
- Real flight: five samples across `1977-12-31T23:59:60` have the correct labels.
- Consistency check (round trip of 4515 samples): position 4.8e-7 km, velocity 7.1e-15 km/s, time 3.6e-7 s.

### 3.4 Not verified

- Load of an Apsis OEM in STK, in GMAT or in a different program. These programs were not available.
- Read of an OEM that a different program made. The test files are hand files.
- That all programs accept two blocks with the same time at their common end.
- The XML notation. Apsis does not have it.

## 4. CCSDS Orbit Parameter Message (OPM)

Functions: `writeOpm(opm, options)`, `parseOpm(text)`, `opmFromFlight(sys, flight, options)` and `flightFromOpm(sys, opm, model, etEnd)`.
An OPM has one state at one time, optional spacecraft parameters and a list of maneuvers.

### 4.1 What Apsis writes

| Item | Value |
|---|---|
| Version | `CCSDS_OPM_VERS = 2.0` (CCSDS 502.0-B-2) |
| Header | `CCSDS_OPM_VERS`, `COMMENT`, `CREATION_DATE`, `ORIGINATOR` |
| Metadata | `OBJECT_NAME`, `OBJECT_ID`, `CENTER_NAME`, `REF_FRAME`, `TIME_SYSTEM` |
| State | `EPOCH`, `X`, `Y`, `Z`, `X_DOT`, `Y_DOT`, `Z_DOT` |
| Spacecraft | `MASS`, `SOLAR_RAD_AREA`, `SOLAR_RAD_COEFF`, `DRAG_AREA`, `DRAG_COEFF` (the values that the caller gives) |
| Maneuver | `MAN_EPOCH_IGNITION`, `MAN_DURATION`, `MAN_DELTA_MASS`, `MAN_REF_FRAME`, `MAN_DV_1`, `MAN_DV_2`, `MAN_DV_3` |
| Frame of the state | `REF_FRAME = ICRF` always. The writer turns an `ECLIPJ2000` state to the ICRF. |
| Frames of a maneuver | `ICRF`, `RTN`, `TNW` |
| Time scales | `UTC`, `TAI`, `TT`, `TDB` |
| Units | After each value, in brackets: `[km]`, `[km/s]`, `[kg]`, `[m**2]`, `[s]` |
| Digits | 16 significant digits. Times have 6 decimals of the second. |

- The writer does not give Keplerian elements, a covariance matrix or user-defined parameters.
- A message with a maneuver must have the mass (3.2.4.9). If not, the error is `opm.mass`.
- The change of mass of a maneuver must be negative (3.2.4.7). If not, the error is `opm.deltaMass`.

`opmFromFlight` makes the data of a message from a flight.

- The state is the state at the start of the flight.
- Each maneuver is impulsive: `MAN_DURATION` is 0.
- The change of mass comes from the rocket equation, with the mass and the specific impulse that the caller gives.
- A maneuver with a velocity change of zero is not in the message.
- A maneuver in a local frame relative to the centre of the message keeps its frame.
- A maneuver in a local frame relative to a different body becomes an ICRF vector. A propagation gives that vector.
- The message has no force model and no anchor states (`Maneuver.anchor`, decision D23).
- A flight that goes backward in time has no message (`opm.backward`).

### 4.2 Frames of a maneuver

Apsis has the local frames VNB and RTN (`src/engine/frames.ts`).
A local frame of a maneuver uses the state relative to the centre of the message.
In this table, (d1, d2, d3) are `MAN_DV_1`, `MAN_DV_2` and `MAN_DV_3`.

| Frame in the message | Axes 1, 2, 3 | Apsis frame | Apsis components |
|---|---|---|---|
| `RTN`, `RSW` | Radial, transverse, orbit normal | RTN | (d1, d2, d3) |
| `TNW` | Velocity, W x T, orbit normal W | VNB | (d1, d3, -d2) |
| `VNC` | Velocity, orbit normal, V x N | VNB | (d1, d2, d3) |
| `NTW` | T x W, velocity, orbit normal W | VNB | (d2, d3, d1) |
| `LVLH` | y x z, opposite to the orbit normal, opposite to the radius | RTN | (-d3, d1, -d2) |
| `ICRF`, `GCRF`, `EME2000`, `J2000` | ICRF axes | ICRF | (d1, d2, d3) |
| `J2000_ECLIPTIC` | Ecliptic axes | ECLIPJ2000 | (d1, d2, d3) |

- `RSW`, `RTN` and `TNW` are the names of 502.0-B-2, annex A3.
- The other local names are in the SANA registry of orbit-relative reference frames.
- The reader accepts each local name with or without the ending `_INERTIAL` or `_ROTATING`.
- The writer gives `TNW` for a VNB maneuver, `RTN` for an RTN maneuver and `ICRF` for the other maneuvers.
- The reader does not accept the registry frames EQW, NSW, PQW and SEZ (`opm.manFrame`).

### 4.3 What Apsis reads

| Item | Value |
|---|---|
| Versions | 1.0, 2.0 and 3.0 |
| Keywords | The keywords of section 4.1, and `CLASSIFICATION`, `MESSAGE_ID`, `REF_FRAME_EPOCH` |
| Ignored keywords | Keplerian elements and `GM`, `COV_REF_FRAME`, the covariance values, `USER_DEFINED_x` |
| Frames | As for the OEM (section 3.2) |
| Centres | Section 2.5 |
| Time scales | `UTC`, `TAI`, `TT`, `TDB` |
| Units | A unit in brackets is optional. A unit that is not the unit of the standard gives `opm.units`. |

- A maneuver must have all its seven keywords (table 3-3). If not, the error is `opm.maneuver`.
- The comments immediately before `MAN_EPOCH_IGNITION` are the comments of that maneuver.
- The reader accepts a maneuver with a duration. `flightFromOpm` does not: the error is `opm.finiteBurn`.
- `flightFromOpm` uses the force model and the end time that the caller gives.
- The maneuvers of that flight have the identifiers `man1`, `man2` and so on.

### 4.4 Verified

- Reader: a file of 38 lines written by hand from the standard gives the hand values.
- Maneuver frames: the test state has r along +x and v along +y. Each frame of section 4.2 gives the hand value of the ICRF vector.
- Writer: the keywords are in the order of tables 3-1 to 3-3, with the units and the hand values.
- Writer: a VNB maneuver gives the hand values in `TNW`. An ecliptic maneuver gives the hand values in the ICRF.
- `opmFromFlight`: the frames of the maneuvers and the change of mass. The hand value of the mass is 224.8 kg.
- Reader: 21 files that are not correct give the correct error code and line number.
- Consistency check (Voyager 2, flight to message to flight): position 3.0e-8 km, velocity 7.1e-15 km/s, epoch 0 s.

### 4.5 Not verified

- Load of an Apsis OPM in STK, in GMAT or in a different program.
- Read of an OPM that a different program made.
- The frames `VNC`, `NTW` and `LVLH` in a real file. The test uses the definitions of the registry text.

## 5. STK ephemeris file (`.e`)

Functions: `writeStkEphemeris(table, options)` and `parseStkEphemeris(text, options)`.
The source is the help page "Ephemeris File Format (*.e)" of STK 13.1.0.

### 5.1 What Apsis writes

| Item | Value |
|---|---|
| Version stamp | `stk.v.11.0` |
| Keywords | `NumberOfEphemerisPoints`, `ScenarioEpoch`, `InterpolationMethod`, `InterpolationSamplesM1`, `CentralBody`, `CoordinateSystem`, `DistanceUnit` |
| Format | `EphemerisTimePosVel`: seconds after the epoch, position, velocity |
| Frame | `CoordinateSystem ICRF`. The writer turns an `ECLIPJ2000` table to the ICRF. |
| Centre | `CentralBody` and the name of a body: `Sun`, `Earth`, `Jupiter` |
| Time | SI seconds after `ScenarioEpoch`, 6 decimals |
| Epoch | `ScenarioEpoch`: a UTC date, the whole second at or before the first time |
| Units | `DistanceUnit Kilometers`: km and km/s |
| Digits | 16 significant digits |
| Interpolation | `Lagrange` (or `Hermite`), `InterpolationSamplesM1 5` or less for a short segment |
| Maneuvers | The times in the block `BEGIN SegmentBoundaryTimes` ... `END SegmentBoundaryTimes` |
| Comments | Lines that start with `#`, after the version stamp |

- At a segment boundary the file has two points with the same time.
- A blank line is between these two points.
- The centre must be a body. `SSB` and a planet barycentre give the error `stk.center`.
- The epoch is never in a leap second. The writer uses the second before it.
- The file has no name of the object.

### 5.2 What Apsis reads

| Item | Value |
|---|---|
| Version stamp | `stk.v.<number>.<number>` in the first line that is not empty and not a comment |
| Format | `EphemerisTimePosVel` only |
| `CoordinateSystem` | `ICRF` or `J2000` (ICRF axes). The keyword is necessary. |
| `CentralBody` | A name of section 2.5. The default of the format is `Earth`. |
| `DistanceUnit` | `Kilometers` or `Meters`. The default of the format is `Meters`. |
| `ScenarioEpoch` | Necessary. A UTC date: `1 Jan 2030 00:00:00.000` |
| `TimeFormat` | `EpSec` only |
| `TimeScale` | `TDB` only. The seconds are then TDB seconds after the epoch. |
| `NumberOfEphemerisPoints` | The largest number of points that the reader uses |
| `SegmentBoundaryTimes` | The times where a new segment starts |
| Other keywords | Ignored. The help page says that STK gives only a warning. |

- The reader uses the seconds as SI seconds on the TAI scale. The table has the time scale UTC.
- The help page says that the keyword `TimeScale` makes the times TDB and "not TAI".
- The reader accepts keywords in upper case or lower case.
- The reader accepts two points with the same time only at a time of `SegmentBoundaryTimes`.
- One point at a boundary time is the end of a segment and also the start of the next segment.
- Other formats give the error `stk.format`. Examples: `EphemerisTimePos`, `EphemerisTimePosVelAcc`.

### 5.3 Verified

- Reader: a file of 23 lines written by hand from the help page gives the hand values. It has metres, a segment boundary and a comment line.
- Reader: kilometres, tab characters, exponents with three digits, keywords in other cases and the default centre.
- Reader: seconds across the leap second of 2016-12-31 give the hand values.
- Reader: `NumberOfEphemerisPoints`, one point at a boundary and `TimeScale TDB`.
- Writer: the keywords, the epoch, the boundary block and the data lines have the hand values.
- Reader: 22 files that are not correct give the correct error code and line number.
- Consistency check (round trip of 4515 samples): position 4.8e-7 km, velocity 7.1e-15 km/s, time 3.6e-7 s.

### 5.4 Not verified

- Load of an Apsis file in STK. STK was not available.
- Read of a file that STK made. The sample files of the help page are in `data-src/specs/stk/`, but no test reads them.
- That STK accepts comment lines with `#`. One sample file of the help page has such a line.
- That STK accepts the body names that Apsis writes for bodies other than the Earth and the Moon.
- That STK accepts the text of `ScenarioEpoch` with three decimals.
- That the seconds in an STK file are TAI seconds. This is the reading of the help text for `TimeScale`.

## 6. GMAT script

Functions: `writeGmatScript(input)` and `gmatDifferences(input)`.
The script makes a flight of Apsis again in the General Mission Analysis Tool (GMAT) of NASA.
Apsis writes the script. Apsis does not read a script.
The source is the GMAT User Guide R2015a. No newer guide was available.

### 6.1 What Apsis writes

The script has these parts, in this order:

| Part | Fields |
|---|---|
| Comments | Lines `% text` with the text of the caller |
| Ephemeris (optional) | `SolarSystem.EphemerisSource` |
| GM of each body | `<Body>.Mu`, with the value of Apsis |
| `Create CoordinateSystem SunMJ2000Eq` | `Origin = Sun`, `Axes = MJ2000Eq` |
| `Create Spacecraft Sat` | `DateFormat = TDBModJulian`, `Epoch`, `CoordinateSystem`, `DisplayStateType = Cartesian`, `X`, `Y`, `Z`, `VX`, `VY`, `VZ` |
| Solar radiation pressure (optional) | `DryMass`, `Cr`, `SRPArea` of the spacecraft |
| `Create ForceModel Forces` | `CentralBody = Sun`, `PointMasses`, `RelativisticCorrection`, `SRP`, `SRP.Flux`, `SRP.Nominal_Sun`, `ErrorControl = RSSStep` |
| `Create Propagator Prop` | `FM`, `Type = PrinceDormand78`, `InitialStepSize = 60`, `Accuracy = 1e-12`, `MaxStep = 86400`, `MaxStepAttempts = 50`, `StopIfAccuracyIsViolated = true` |
| `Create ImpulsiveBurn Burn1` ... | `CoordinateSystem`, `Element1`, `Element2`, `Element3`, `DecrementMass = false` |
| `Create ReportFile StateReport` | `Filename`, `Precision = 16`, `Add`, `WriteHeaders` |
| `Create EphemerisFile StateEphemeris` | `Spacecraft`, `Filename`, `FileFormat = CCSDS-OEM`, `EpochFormat = UTCGregorian`, `CoordinateSystem` |
| Mission sequence | `BeginMissionSequence`, then `Propagate Prop(Sat) {Sat.ElapsedSecs = ...}` and `Maneuver Burn1(Sat)` |

| Item | Value |
|---|---|
| Version | The fields and commands of the guide R2015a |
| Centre | The Sun. The state is relative to the Sun. |
| Axes | `MJ2000Eq` (default) or `ICRF` (option `axes`). See section 6.2. |
| Time scale | TDB for the epoch. The modified Julian date of GMAT is the Julian date - 2430000.0. |
| Units | km, km/s, kg, m^2, s |
| Digits | State and velocity changes: the same 64-bit numbers. Epoch: 11 decimals of the day. |
| Bodies | `Sun`, `Mercury`, `Venus`, `Earth`, `Luna`, `Mars`, `Jupiter`, `Saturn`, `Uranus`, `Neptune`, `Pluto` |

- The script has one `ImpulsiveBurn` for each maneuver, with the velocity change in the axes of the coordinate system.
- A maneuver with a velocity change of zero is not in the script.
- The length of each `Propagate` command is the difference of TAI between its start and its end.
- The guide says that GMAT uses the A.1 time system for its calculations.
- A.1 is an atomic time scale with a constant difference to TAI. This fact is not from the guide.
- A planet with moons is one mass in the script. `Mu` is the GM of the planet and its moons.
- The guide says that the DE files of GMAT give the barycentre of each planet system.
- The Earth and the Moon are two masses.
- The script has solar radiation pressure only if the coefficient and the area of the Apsis model are not zero.
- The solar flux is 1361 W/m^2 at 149597870.7 km, as in the Apsis model.
- The output is a report file, an ephemeris file (OEM), or the two (option `output`).

### 6.2 Limits

- The flight must go forward in time (`gmat.backward`).
- The times must be from 1957-10-04 to 2100-02-28. This is the epoch range of the guide (`gmat.epoch`).
- The force model must have the Sun (`gmat.model`).
- The guide permits 0 to 2.0 for `Cr` and an area above zero. If the values are out of these limits, the error is `gmat.srpRange`.
- The guide does not say in which axes GMAT uses the vectors of its planetary ephemeris.
- Apsis assumes that GMAT uses them as `MJ2000Eq` vectors with no rotation.
- With this assumption, the ICRF numbers of Apsis go into the `MJ2000Eq` axes of GMAT. This is the default.
- The guide says that the rotation between its `ICRF` axes and `MJ2000Eq` changes with time.
- It also says that the difference of a vector is less than 1 m at the surface of the Earth.
- That angle is below 1.6e-7 rad, which is 23 km at 1 au. A wrong selection of the axes thus gives an error of this size.
- The UTC labels of GMAT and of Apsis are different before 1972. Use the TDB column of the report for a comparison.

`gmatDifferences` gives the differences between the flight in Apsis and the flight of the script:

| Code | Difference |
|---|---|
| `gmat.ephemeris` | The body positions come from the ephemeris of GMAT (default DE405), not from the data of Apsis (DE440). |
| `gmat.j2` | The script does not have the oblateness of the planets. |
| `gmat.moons` | The script does not have the large moons as separate masses. |
| `gmat.smallBodies` | GMAT does not have Ceres, Vesta and Psyche. |
| `gmat.reducedModel` | The force model does not have all the planets. Apsis integrates relative to the barycentre of the solar system, GMAT relative to the Sun. |
| `gmat.srp` | The solar radiation pressure model of GMAT is different code (shadow). |
| `gmat.relativity` | The relativistic correction of GMAT is different code. |
| `gmat.anchors` | A maneuver has an anchor state (D23). GMAT continues from its own state. |

### 6.3 Verified

- Manual check: each field name, command and value name of the script is in the text of the guide R2015a.
- Manual check: the guide has examples of a force model with `CentralBody = Sun` and only `PointMasses`.
- Manual check: the limits of `Epoch`, `Cr`, `SRPArea`, `SRP.Flux`, `SRP.Nominal_Sun`, `Accuracy` and `InitialStepSize` in the guide.
- Structure: each line of the script is a comment, a blank line or a statement that ends with a semicolon.
- Hand flight: the epoch of 2030-01-01 TDB is `32502.50000000000`.
- Hand flight: the state is the state relative to the Sun, and the GM values are the values of Apsis.
- Hand flight: a VNB maneuver and an ecliptic maneuver give the hand values of the ICRF vector.
- Hand flight: the lengths of the two arcs are the hand values (600 s and 3000 s of TDB as TAI seconds).
- Real flight (Voyager 2): the script has one burn for each maneuver, and the sum of the arcs is the length of the flight.
- 9 flights and options that are not correct give the correct error code.
- A spacecraft name that GMAT cannot have becomes `Sat`.
- A coefficient or an area of zero gives a script with no solar radiation pressure.

### 6.4 Not verified

- A run of the script in GMAT. GMAT was not available.
- That the trajectory of GMAT agrees with the trajectory of Apsis.
- The syntax of GMAT versions after R2015a (R2020a, R2022a, R2025a). Their guides were not available.
- The assumption about the axes of the planetary ephemeris in GMAT (section 6.2).
- That GMAT accepts a new value of `Mu` for each of its bodies.
- That `ElapsedSecs` counts seconds of the A.1 time scale.
- That the models of GMAT for solar radiation pressure and relativity give the same accelerations as Apsis.

## 7. CSV table

Functions: `writeCsv(table, options)` and `parseCsv(text, options)`.
This is a format of Apsis for spreadsheet programs and scripts. No standard defines it.

### 7.1 What Apsis writes

| Item | Value |
|---|---|
| Version | None |
| First line | `time_utc,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s` |
| Time column | `time_utc`, `time_tdb`, `time_tt` or `time_tai`: calendar time with 6 decimals of the second |
| Julian date (option) | `jd_utc`, `jd_tdb`, `jd_tt` or `jd_tai`: 12 decimals of the day (0.09 microsecond) |
| Frame and centre | Those of the table. The file does not have them. |
| Units | km and km/s, in the column names |
| Digits | 17 significant digits: the reader gets the same 64-bit numbers |
| Separator | Comma |
| Maneuver | Two lines with the same time: the state before and the state after the maneuver |

- The file has no comments and no name of the object.
- A UTC time in a leap second has no Julian date. The error is `csv.time`.

### 7.2 What Apsis reads

| Item | Value |
|---|---|
| Separator | Comma, semicolon or tab |
| Comments | Lines that start with `#` |
| Time column | `time`, `epoch`, `date`, `jd` or `julian_date`, with or without `_utc`, `_tdb`, `_tt`, `_tai` |
| Position columns | `x`, `y`, `z`, with `_km` or `_m` |
| Velocity columns | `vx`, `vy`, `vz` (also `x_dot`, `xdot`), with `_km_s` or `_m_s` |
| Other columns | Ignored |
| Calendar time | The CCSDS form. Also a blank in the place of `T`, no seconds, and one digit for a field. |
| Frame and centre | The options `frame` and `center` of the reader |

- Capital letters and other characters in a column name make no difference: `X (km)` is `x_km`.
- If the time column has no time scale, the option `timeScale` gives it. If not, the error is `csv.timeScale`.
- If the state columns have no unit, the option `distanceUnit` gives it. If not, the error is `csv.units`.
- A line with the same time as the line before it starts a new segment.

### 7.3 Verified

- Reader: a hand file with units in the column names, a comment line, two segments and a leap second gives the hand values.
- Reader: a Julian date column, semicolons, metres, column names of spreadsheet programs and the options.
- Writer: the first line, the time text, the Julian date text and the number text are the hand values.
- Reader: 14 files that are not correct give the correct error code and line number.
- Consistency check: positions and velocities come back with a difference of exactly 0.
- Consistency check: calendar time 3.6e-7 s, Julian date column 6.0e-8 s.

### 7.4 Not verified

- A spreadsheet program with these files. No such program opened a file of Apsis.
- What a spreadsheet program does with 17 digits and with the time text when it saves the file again.

## 8. JPL Horizons vector table

Function: `parseHorizonsVectors(text, options)`.
Apsis reads the text of a "Vectors" table of the JPL Horizons system. Apsis does not write this format.

### 8.1 What Apsis reads

| Item | Value |
|---|---|
| Version | The output of the Horizons API, version 1.2, of 2026-10-13 |
| Data | The records between the lines `$$SOE` and `$$EOE` |
| Record forms | With labels (`X =`, `VX=`), with no labels, and CSV |
| Table types | Position and velocity: `Output format` 2 or 3 |
| `Output type` | `GEOMETRIC cartesian states` only |
| Centre | `Center body name`, with the NAIF code in brackets. `Center-site name` must be `BODY CENTER`. |
| Frames | `Reference frame : ICRF` and `Ecliptic of J2000.0` |
| Units | `KM-S`, `KM-D` and `AU-D`. The reader converts to km and km/s. |
| Time scales | Julian date in TDB (column `JDTDB`) or in UT (column `JDUT`) |
| Object | `Target body name`: the name, and the code in brackets as the identifier |

- The reader uses the Julian date as text: the integer part and the fraction go into the calculation separately.
- A Julian date in Horizons has 9 decimals. Thus the time has a resolution of 86 microseconds.
- If each record of a UT table has the difference TDB - UT (`delta-T`), the reader uses that difference.
- The reader uses a UT table with no difference as a UTC table. This is possible only from 1972.
- Before 1972 the UT of Horizons is UT1 or the UTC of those years. The error is `horizons.ut`.
- The table has one segment.
- If the text has no header, the options give the centre, the frame, the units and the time scale.
- The reader refuses states with a light-time correction, a site on a surface, elements and tables with no velocity.

### 8.2 Verified

- The reader reads all the vector tables in `truth/horizons/raw/`, with one record for each line of data.
- The reader refuses the other files of that directory: element tables (`horizons.type`) and outputs with no table (`horizons.soe`).
- On 2026-10-14 the directory has 268 vector tables, 4 element tables and 30 outputs with no table.
- 166 of the vector tables against the numbers in `truth/horizons/*.json`: 22055 records, difference exactly 0 km and 0 km/s.
- A different parser made these numbers (`tools/truth/horizons.py`).
- The times of these records agree inside 2.1e-5 s. The measured value is 2.03e-5 s.
- The truth files have the Julian date as one 64-bit number, with a step of 40 microseconds.
- The three record forms, the three units and the two frames give the numbers of `truth/horizons/frames.json`.
- These inputs are parts of real outputs. A test compares each part with the complete file in `data-src/specs/horizons/`.
- Tables in other units against tables in km and s: 8.9e-8 km and 1.1e-14 km/s.
- UT tables with `delta-T`: the times are the hand values, and the position of the Earth moves as the time difference requires.
- `time_mars_ut.txt` (98 records, 1960 to 2099): the first time is the hand value. Mars agrees with the Apsis ephemeris inside 0.05 km.
- UT tables with no `delta-T`: read as UTC for 2000 and 2020, refused for 1950 and 1968.
- Header lines of real outputs that Apsis must refuse give the correct error code and line number.
- 13 texts that are not correct give the correct error code and line number.

### 8.3 Not verified

- Outputs of the other Horizons interfaces (web page, e-mail, telnet). The test files come from the API.
- Old outputs with a different header or with the column name `JDCT`.
- Tables with statistical uncertainties.
- Tables of a body that Apsis does not have as a centre.

## 9. Error codes

`<format>.table` has a detail: `empty`, `length`, `segment:<index>`, `number:<index>` or `order:<index>`.

| Code | Meaning |
|---|---|
| `sample.empty` | The trajectory has no points. |
| `sample.step` | The step is not a positive number. |
| `sample.center`, `table.center` | Apsis does not have this centre. |
| `sample.size` | The table would have more than 5 000 000 grid times. |
| `sample.coverage`, `table.coverage` | The data of the centre do not cover the times of the table. |
| `table.points` | The number of interpolation points is not an integer of 2 or more. |
| `table.range` | The time is not in a segment of the table. |
| `oem.table`, `stk.table`, `csv.table` | A file cannot hold this table. |
| `oem.option`, `stk.option` | An option of the writer is not correct. |
| `oem.header`, `opm.header`, `stk.header` | The first lines are not the header of this format. |
| `oem.version`, `opm.version` | Apsis does not read this version. |
| `oem.keyword`, `opm.keyword` | The format does not have this keyword at this position, or the keyword is there two times. |
| `oem.meta` | A metadata block is not complete. |
| `opm.syntax` | The line is not a "keyword = value" line. |
| `opm.missing` | An obligatory keyword is not in the file. |
| `oem.time`, `opm.time`, `csv.time` | The text is not a correct time in the time scale of the file. |
| `oem.center`, `opm.center`, `stk.center`, `horizons.center` | Apsis does not have this centre, or the format cannot have it. |
| `oem.frame`, `opm.frame`, `stk.frame`, `horizons.frame` | Apsis does not read this frame. |
| `oem.timeSystem`, `opm.timeSystem`, `stk.timeScale`, `csv.timeScale` | Apsis does not read this time scale, or the file does not give it. |
| `oem.state`, `stk.state`, `horizons.state` | A data line or a record is not correct. |
| `oem.covariance` | A covariance block has no end. |
| `oem.data`, `stk.data`, `csv.data`, `horizons.data` | The file has no data lines. |
| `oem.mixed` | The blocks do not have the same object, centre, frame and time scale. |
| `oem.order`, `stk.order`, `csv.order`, `horizons.order` | The times are not in order. |
| `opm.number`, `csv.number`, `gmat.number` | A value is not a finite number. |
| `opm.units`, `stk.units`, `csv.units`, `horizons.units` | Apsis does not read this unit, or the file does not give it. |
| `opm.maneuver` | A maneuver does not have all its values. |
| `opm.manFrame` | Apsis does not read this maneuver frame. |
| `opm.mass` | The mass is necessary and is not there, or it is not positive. |
| `opm.deltaMass` | The change of mass of a maneuver is not negative. |
| `opm.duration` | The duration of a maneuver is negative. |
| `opm.backward`, `gmat.backward` | The flight goes backward in time. |
| `opm.finiteBurn` | A maneuver has a duration. Apsis has only impulsive maneuvers. |
| `stk.format` | The file does not have the format `EphemerisTimePosVel`. |
| `stk.timeFormat` | The time format is not `EpSec`. |
| `stk.epoch` | `ScenarioEpoch` is not there or is not a correct date. |
| `stk.boundary` | The block `SegmentBoundaryTimes` is not correct. |
| `csv.columns` | A necessary column is not there, or a line is too short. |
| `horizons.soe` | The text has no `$$SOE` line or no `$$EOE` line. |
| `horizons.type` | The table does not have geometric states. |
| `horizons.velocity` | The table has no velocity. |
| `horizons.time` | The text does not show the time scale. |
| `horizons.ut` | A UT time before 1972, or a UT1 time, has no difference to TDB. |
| `gmat.epoch` | A time is out of the range of GMAT. |
| `gmat.option`, `gmat.fileName` | An option or a file name is not correct. |
| `gmat.model` | The force model has no Sun. |
| `gmat.maneuver` | Apsis cannot find the velocity change of a maneuver in a local frame. |
| `gmat.srpRange` | GMAT does not accept the coefficient or the area of the solar radiation pressure. |

The codes of `gmatDifferences` are in section 6.2. They are not errors.

## 10. Measured values

The tests write their measured values to `src/validation/measured/io.json` (group `interchange`).
The application shows these values.
This table has the values of the run on 2026-10-14.

| Identifier | Value | Limit | Reason for the limit |
|---|---|---|---|
| `io.horizonsVectors` | 0 km | 1e-9 km | The same decimal text gives the same number. The correct value is 0. |
| `io.horizonsTime` | 2.03e-5 s | 2.1e-5 s | Half of the 40-microsecond step of the Julian date in the truth files |
| `io.horizonsUnits` | 8.9e-8 km | 2e-7 km | The 16 digits of the two Horizons tables |
| `io.oemPosition` | 4.8e-7 km | 1e-6 km | One unit of the last of 16 digits, for a coordinate below 1e10 km |
| `io.oemVelocity` | 7.1e-15 km/s | 1e-14 km/s | One unit of the last of 16 digits, for a component below 100 km/s |
| `io.oemTime` | 3.6e-7 s | 1e-6 s | 6 decimals of the second |
| `io.stkPosition` | 4.8e-7 km | 1e-6 km | As for the OEM |
| `io.stkVelocity` | 7.1e-15 km/s | 1e-14 km/s | As for the OEM |
| `io.stkTime` | 3.6e-7 s | 1e-6 s | 6 decimals of the second |
| `io.csvTime` | 3.6e-7 s | 1e-6 s | 6 decimals of the second |
| `io.opmState` | 3.0e-8 km | 3e-7 km | The 16 digits, and the changes of centre and frame |
| `io.hermiteCircle` | 3.78e-7 km | 3.91e-7 km | The remainder of the Hermite formula for a circular orbit |

- The round-trip values are consistency checks. They do not show that a format is correct.
- Each limit follows from the number of digits in the file or from a formula. The test file has the calculation.
- Section 13 lists the corrections after the first run of the tests.

## 11. Source documents

The retrieval date of all the documents is 2026-10-14 (local time, UTC+9).
The request stamps in the Horizons files are in UTC: 2026-10-13, 18:10 to 18:28.
The copies are in `data-src/specs/`. The directory has 25 MB.

| File in `data-src/specs/` | Document | URL |
|---|---|---|
| `ccsds/502x0b1s.pdf` | CCSDS 502.0-B-1, Orbit Data Messages, September 2004 (historical) | <https://public.ccsds.org/Pubs/502x0b1s.pdf> |
| `ccsds/502x0b2s.pdf` | CCSDS 502.0-B-2, Orbit Data Messages, November 2009, with Technical Corrigendum 1 of May 2012 (historical) | <https://public.ccsds.org/Pubs/502x0b2s.pdf> |
| `ccsds/502x0b3e1.pdf` | CCSDS 502.0-B-3, Orbit Data Messages, April 2023, with Editorial Change 1 of May 2023 | <https://public.ccsds.org/Pubs/502x0b3e1.pdf> |
| `sana/orbit_centers.html` | SANA registry, orbit centers | <https://sanaregistry.org/r/orbit_centers/?per_page=500> |
| `sana/celestial_body_reference_frames.html` | SANA registry, celestial body reference frames | <https://sanaregistry.org/r/celestial_body_reference_frames/?per_page=500> |
| `sana/orbit_relative_reference_frames.html` | SANA registry, orbit-relative reference frames | <https://sanaregistry.org/r/orbit_relative_reference_frames/?per_page=500> |
| `sana/time_systems.html` | SANA registry, time systems | <https://sanaregistry.org/r/time_systems/?per_page=500> |
| `stk/importfiles-02.htm` | STK help, "Ephemeris File Format (*.e)", STK 13.1.0, help update of September 2026 | <https://help.agi.com/stk/Content/stk/importfiles-02.htm> |
| `stk/example_ephemeris2.htm`, `3`, `5`, `6` | Sample files of that help page | <https://help.agi.com/stk/Content/stk/example_ephemeris2.htm> and the equivalent addresses |
| `gmat/help-letter.pdf` | GMAT User Guide R2015a | <https://gmat.atlassian.net/wiki/download/attachments/380273216/help-letter.pdf?api=v2> |
| `gmat/ntrs-20170001580.pdf` | NASA presentation about GMAT R2016a, NTRS document 20170001580 | <https://ntrs.nasa.gov/api/citations/20170001580/downloads/20170001580.pdf> |
| `horizons/*.txt` (14 files) | Outputs of the JPL Horizons API. Each file has its request in the first line. | <https://ssd.jpl.nasa.gov/api/horizons.api> |

- The module does not use the NASA presentation. It has no reference pages of the script fields.
- The code and the tests use the section numbers of 502.0-B-2, if they do not name a different version.
- The copies of the CCSDS documents 502.0-B-1 and 502.0-B-2 have the status "historical". 502.0-B-3 is the current version.

SHA-256 of each file:

| File | SHA-256 |
|---|---|
| `ccsds/502x0b1s.pdf` | `fab306a994e5bce9cad8c64d77af172a5819af38faf459faab1b7e2f6163223c` |
| `ccsds/502x0b2s.pdf` | `3dd6102c119cd4d33a97f03437787b5bdfb6b6acaa036a0e0b716c6c9f5747db` |
| `ccsds/502x0b3e1.pdf` | `97d1687b4a461ffdf965b9b65923820cc6aa9d1d1c4d4df77a598a53d4a49d81` |
| `gmat/help-letter.pdf` | `8ee9e8bf380e5d85e3877f727b8b3fe9fba86854f6f59b18acf697f6e12e6cb2` |
| `gmat/ntrs-20170001580.pdf` | `d0b48d6ff1da078a3b87881c57c0a640a778c5540060d8437e9eee6cb2a8470d` |
| `sana/celestial_body_reference_frames.html` | `e7f61ad8902fda9be14147928aa81746d4d80786cd5c8c796b5513bbba7a8099` |
| `sana/orbit_centers.html` | `8204d941c595c84024bf2b049d26a7e975349329d141639bff1d128ccbf81f2f` |
| `sana/orbit_relative_reference_frames.html` | `a6b68b33004eff07c30bcb1fe8ded9fcd704e0ca55bb3ec892ba3764593fc073` |
| `sana/time_systems.html` | `f8e345d457b77f0f526b185b1d66a064a0d6cc9018e06bf97b599492454bcc60` |
| `stk/importfiles-02.htm` | `2aaa1fab16fabc7472d87ed5aaa56e151e85897c4513d46381f4b491551f033f` |
| `stk/example_ephemeris2.htm` | `c9ac41da9a3833d9f6a37f7c2843591a691c92900163e50f048d0e2a3459a9bf` |
| `stk/example_ephemeris3.htm` | `a19c1a8ede5dbf0874850000de23ab69af3446bad146642a2d61625e8d321f67` |
| `stk/example_ephemeris5.htm` | `d402f639d069f0c0ed55a6b4b0fd9a860ff289494abc638cec25be265a1a0b70` |
| `stk/example_ephemeris6.htm` | `0c21b143535ecaaecf45be62a205a9d067fbca3bb0cae09a368983a458d25bb7` |
| `horizons/csv_ecl_VENUS_aud_t3.txt` | `e97edaee029140229f378198e51b2f5aebff02ebf42e9521539f3abb5ac519f2` |
| `horizons/csv_icrf_EARTH_ut.txt` | `a4885a5b7b711df11dd6d68367ca7e99862d6b42368f6ebc7fdb9fbd7b153d3e` |
| `horizons/csv_icrf_EARTH_ut_dt.txt` | `7e3105493e108bdaf2e0554ab25c93f5173c6bfdbf756027c79f2a7852fd19e6` |
| `horizons/labelled_ecl_MARS_aud.txt` | `63bdfb0ebd68fa000f9d60fa9529f65c9e8f5c53b85b112c08abc9a30de33839` |
| `horizons/labelled_icrf_EARTH_kmd.txt` | `f6e707a98b6771b12527118c07c9fd211179abbc8fe8ccff00ecb1e0787565ce` |
| `horizons/labelled_icrf_EARTH_t3.txt` | `c0886e2f6e692f89e0ac837bb28cc1f145750804c7968552d7f5948ab2a7c3a7` |
| `horizons/labelled_icrf_EARTH_ut.txt` | `7227424eb4c86b9bea59a44d4223cb5143851aa9fe4fe6d3f2a6e0c5b8055523` |
| `horizons/labelled_icrf_EARTH_ut_dt.txt` | `5730bea867ad54fdf5b51ffe4419c65db5d014875d090b2cb114973d51a35167` |
| `horizons/plain_icrf_JUPITER_BARYCENTER.txt` | `d0fd68765346db620ac1c27a51290b6d6da3d20e13c27565e0745de05e37fa3a` |
| `horizons/reject_b1950_EARTH.txt` | `79766f111d84a1c96e3fb0e7372494854d967a01584eb3c6c50bd83a9995280b` |
| `horizons/reject_body_equator_MARS.txt` | `eaf269cc088d417c11fcd1a915d7b87d490d71fdd6f1b69b0478eda0745b1e1d` |
| `horizons/reject_lt_corrected_EARTH.txt` | `a702261c755a39b44b761ef5d61c6ee4cddc824bf2d307ba129879ee8ba9622e` |
| `horizons/reject_position_only_EARTH.txt` | `6223bef1638c9c95f1fe50bee26d1d88260b1f0a7d8baf9be35703a0e2f0bd5d` |
| `horizons/reject_topocentric_MARS.txt` | `d4a514e6f6349fa1675f7c1bcd1102015bea4cb924a40520e2bf03efed0d438e` |

## 12. Limits of the tables

- A table has a constant step. Apsis does not make the step smaller near a body.
- Interpolation between samples is not accurate if the step is large near a flyby. Use a small step there.
- A table has the states of a trajectory. It does not have the force model.
- An OEM, an STK file and a CSV file do not have the anchor states of the maneuvers (D23).
- A flight that Apsis makes from an OPM is a new integration. It does not use the trajectory that made the message.

## 13. Corrections after the first run of the tests

The first complete run of `tests/io.test.ts` was on 2026-10-14. 12 of 57 tests failed.
The table gives the causes of these failures and the other corrections of that day.
Each correction has its reason in a comment of the test file.
The reasons come from the specifications and from arithmetic, not from the output of the code.

| Cause | Correction |
|---|---|
| The readers refused a UTC time with the second 60. | The module used an engine function that is one second late for such a time. `checkedCalendarToEt` now counts a leap second on the TAI scale. |
| A test expected `6.02e123` to have 16 exact digits. | The test was wrong: the nearest 64-bit number is different. The test now uses `1.5e123`. |
| A test expected 600 s of TT to be exactly 600 s of TDB. | The test was wrong. The rate of TDB - TT in January is 3.3e-10 s/s. |
| A test expected 97 records in `time_mars_ut.txt`. | The test was wrong. The file has 97 steps, which are 98 records. |
| A test had a wrong line number for the error of an element table. | The test was wrong. The error is at the line `Output type`. |
| A test had wrong line numbers for the Horizons records. | The test was wrong. It now finds the line `$$SOE` in the text. |
| A test expected TDB seconds in the `Propagate` commands. | The test was wrong. The script gives TAI seconds. |
| Parts of Horizons outputs in the test file were not exact copies. | A script made the parts again from the files. A test now compares them with the files. |
| Some limits were not equal to their written calculation. | Each limit is now the result of the calculation in its comment. |
| A test had the exact numbers of the files in `truth/horizons/raw/`. | These numbers are now minimum values: a new truth file must not fail the test. The test now examines the error code of each refused file. |
