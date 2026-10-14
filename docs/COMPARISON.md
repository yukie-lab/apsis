# Comparison with other tools

This document compares Apsis with three tools: STK, GMAT and Universe Sandbox.
It gives the limits of those tools for the first design of a mission to a different planet.
It also gives the points where those tools are better than Apsis, and the points where Apsis is better.

## How to read this document

- The project did not operate STK, GMAT or Universe Sandbox. It compared no result of Apsis with a result of these tools.
- The statements about the three tools come from web pages. The list of the pages is at the end of this document. The project read each page on 2026-10-14.
- Each statement about one of the three tools has a label. The label "Page" with a number tells you that the project found the statement in the text of that page.
- The label "No check" tells you that the project found no source for the statement. Use a statement with this label with caution.
- A page shows only a part of a product. If the project found no function in a page, a different part of the product can have that function.
- "Better" is a decision of the project. It is not a measured result. The statements about Apsis refer to measured values. The file `docs/VALIDATION.md` and the Accuracy screen give each measured value and its reference.

## The three tools

| Tool | Type | Computer | License | Label |
|------|------|----------|---------|-------|
| STK | Program that the user installs on a computer. It examines missions. Its Astrogator part does the trajectory design. | Windows 11, Windows 10, Windows Server 2019. Only an administrator of the computer can install the program. Minimum: 8 GB of memory and a graphics card with 4 GB and OpenGL 4.5. | The user must have a license. The Mars example gives the licenses "STK Premium (Space)" or "STK Enterprise". | Page 1, Page 2 |
| GMAT | Program that the user installs on a computer. Its functions are the design of missions, optimization and navigation. It has screens and a script language. | Windows, Linux and macOS. | Open source (Apache License 2.0). The program has no price. | Page 3, Page 4, Page 5 |
| Universe Sandbox | Simulator of gravity, collisions, climate and materials. | Windows, macOS and Linux. | The product has a price. Software stores have it. | Page 7 |

The "Mars example" is the example with the name "Mars Probe" in the help pages of STK (Page 2).

## Limits of the three tools for the first design of a mission to a different planet

### STK

1. STK operates only on Windows, and the user must install it (Page 1). The Mars example uses a license level that has a price (Page 2).
2. In the Mars example, the launch date and the time of flight come from the text of the example. The example tells the user to examine these values for each different mission. The page shows no map of launch windows (Page 2).
3. In the Mars example, the user makes the trajectory from parts: a Lambert solver, a sequence of segments, a targeter and a new force model for Mars (Page 2). This method can do many types of mission. But the first estimate of a mission has many steps.
4. No check: a different part of STK can make a map of launch windows.
5. No check: STK does not show the measured error of each number in the product.

### GMAT

1. The user must install GMAT on a computer (Page 3).
2. The user guide has examples and a reference guide. The reference guide has a section about targeters and parameter optimization (Page 4). The user makes each mission as a sequence of commands.
3. No check: the user must give the first estimate of each variable of a targeter. GMAT does not find a sequence of flybys from the dates only.
4. No check: GMAT has no map of launch windows. The project did not get the full reference guide.
5. No check: GMAT does not show the measured error of each number in the product.

### Universe Sandbox

1. On the page, the product is a simulator. The list of functions on the page has no transfer design, no launch window and no file for other programs (Page 7).
2. The simulator calculates the motion of all bodies with the gravity model of Newton (Page 7).
3. No check: the positions of the planets come from the simulator and not from an ephemeris. Thus their error increases with the time step and with the duration.
4. The page tells the user that they can go with the Juno and New Horizons spacecraft (Page 7). No check: the method that makes these flights.
5. No check: the simulator does not show time scales and frames.

## Points where the three tools are better than Apsis

- STK and GMAT calculate an engine burn with a duration (no check). Apsis has only impulses.
- GMAT has optimizers and orbit determination (Page 5, Page 6). Apsis has no orbit determination, and its optimizers are only for its plans.
- GMAT has gravity fields with spherical harmonics for more than one body (Page 6). The force model of Apsis has point masses, the J2 terms of the planets, the relativistic correction of the Sun and solar radiation pressure.
- STK and GMAT calculate missions about a planet: Earth orbits, atmospheric drag and tours of moons (no check). Apsis has no plan about a planet.
- STK has functions that are not trajectory design (no check). Apsis does not.
- GMAT has a script language and an interface for other programs (Page 4, Page 6). Apsis has no script language.
- Actual missions used STK and GMAT for many years (no check). Apsis is new: only its automatic tests show its accuracy.
- Universe Sandbox has collisions, climate, materials, stars and galaxies (Page 7). Apsis shows only the solar system and one spacecraft.

## Points where Apsis is better

Each item gives the function, the result and the reason. The project found no equal function in the pages that it read. This is not a check of the full products.

### 1. Each number gives its method, its accuracy limit and its measured error

- **Function.** A button at each value opens the method and the accuracy limit of that type of number. The Accuracy screen shows 221 measured errors, the items with no check and the limits of the models.
- **Result.** Each measured value comes from an automatic test. Each reference comes from JPL Horizons, from an exact solution or from a published document of a mission (`docs/VALIDATION.md`).
- **Reason.** The user must know the accuracy of a number before its use. In Apsis, this data is in the product, and the tests write it. A person does not write it.

### 2. One operation changes a plan into a flight in the full force model

- **Function.** A plan is a sequence of bodies and dates (patched conics). One command finds the flight in the model with many bodies. The flybys have no engine burn. The small corrections show as maneuvers with their size.
- **Result.** The application calculated the flight of Voyager 2 from the sequence of bodies, the actual dates and the arrival condition at Neptune. At Jupiter, Saturn and Uranus, the periapsis radius agrees with JPL Horizons in 1.02 %. The sum of the corrections is 104 m/s. For Cassini, the periapsis radius at each flyby agrees in 0.98 % and the deep-space maneuver agrees in 1.04 %.
- **Reason.** In the Mars example of STK (Page 2), the user makes the sequence of segments and the targeter manually. In Apsis, the user gets a flight in the full model in some seconds and then changes the maneuvers.

### 3. The map of launch windows agrees with actual missions

- **Function.** The Windows screen calculates the launch energy and the velocity changes for each pair of dates. One click opens a point of the map as a mission. The screen can show the actual launch of nine missions on the map.
- **Result.** For nine actual launches, the launch energy C3 agrees in 1.7 % with the C3 of the JPL Horizons trajectory of the spacecraft. For Mars 2020, the day of the minimum C3 is in the published launch period. For four Mars missions, the length of the flight path agrees in 0.3 % with the published distance.
- **Reason.** A map is the usual start of a design. The check with actual missions shows the user how much the map agrees with a flight.

### 4. The Files screen examines the trajectory file of a different program

- **Function.** The screen reads a table of states (CCSDS OEM, STK ephemeris, JPL Horizons vector table or CSV). It finds each closest approach between the samples and each velocity change in the table.
- **Result.** In a JPL Horizons table of Cassini with one sample for each 10 days, the search found the deep-space maneuver. Its size agrees with the table of 6 h samples in 0.0003 %, and its time agrees in 0.093 d. From the same type of table, the radius of the closest approach to Venus agrees in 4 km.
- **Reason.** A table from a different source frequently has no list of maneuvers and no sample at a flyby. The user gets this data from the table with no other tool.

### 5. A file that Apsis writes gives its interpolation error

- **Function.** The Files screen shows the interpolation error of a table before it writes the file. The user can write the table with the steps of the integrator.
- **Result.** For the flight of Voyager 2, the table with the steps of the integrator has an error of 0.06 km between the samples. A table with one sample for each day has an error of 149 000 km at Neptune. That table has 4515 samples, and the table of the integrator has 1569 samples. These values come from Apsis: this is not an independent check.
- **Reason.** The user of a file frequently does not know that the time between the samples is too long at a flyby.

### 6. The Propagation screen shows the effect of each force and the numerical error

- **Function.** One command propagates the flight again with one change of the force model for each row. The table gives the position difference at each closest approach. A second command estimates the error of the integration.
- **Result.** The tests propagate seven asteroids from a JPL Horizons state. After 168 days, the largest difference from JPL Horizons is 0.17 km. Without the relativistic correction, the difference for Ryugu is 22 km.
- **Reason.** The user sees which forces are important for each flight.

### 7. Tisserand graph for the first selection of a tour

- **Function.** The Tour screen shows the Tisserand graph of the planets. The graph shows which flybys can connect two orbits with no engine burn.
- **Result.** The values agree with the exact formula in 3 × 10⁻¹³.
- **Reason.** The graph gives a possible sequence of flybys before a calculation with dates.

### 8. The 3D view has one true scale and a record of each picture

- **Function.** All sizes and all distances in the 3D view have one scale. A button shows the source of the picture of each body: a map of mission data, a calculation, or the two.
- **Result.** The About screen gives the source, the credit and the license of each map (`docs/ASSETS.md`).
- **Reason.** The user always knows which part of a picture is data.

### 9. Two modes use one engine and one mission

- **Function.** A person with no instruction makes a flight in the Explorer mode. The button "Show the numbers" opens the same mission in the Expert mode, with the plan, the maneuvers and all numbers.
- **Result.** One engine calculates the two modes (`src/engine`). A change of the mode keeps the mission, the time of the view and the state of the clock.
- **Reason.** A user of the Expert mode can show a design to a person with no instruction, and the numbers stay the same.

### 10. The user does not install a program

- **Function.** Apsis is a set of files on a web server. The browser does all calculations. The application uses no user account, and it sends no data.
- **Result.** The application contains all its data. The tool that makes the pictures of the screens also records each request of the browser.
- **Reason.** STK operates only on Windows and has a license (Page 1, Page 2). The user must install GMAT (Page 3). Apsis starts from a link on a computer or on a phone.

### 11. The time scale and the frame are always on the screen

- **Function.** The top bar shows the time scale, the frame and the center. The user can change them, and each table and each graph shows their names and the units.
- **Result.** The conversion from UTC to TDB agrees with JPL Horizons in 0.000031 s at 89 epochs. The frame conversions agree with JPL Horizons in 0.0016 km.
- **Reason.** An incorrect time scale or frame is frequently the cause of an error when data goes from one program to a different program.

### 12. Controlled English and a glossary

- **Function.** The texts of the screens, the help texts and the documents obey the rules of ASD-STE100. The Glossary screen gives each technical name. A second language is possible with no change to the code.
- **Result.** A script does the check of the texts (`docs/STE_CHECK.md`). The official dictionary of ASD-STE100 was not available: the record gives the limits of the check.
- **Reason.** Many persons use a tool of this type in a language that is not their first language.

## Pages that the project read

The project read these pages on 2026-10-14. A program read the text of each page. For Page 1, Page 2, Page 5 and Page 7, the project also examined the text of the page. That text contains each name and each number that this document gives from the page. For Page 3, Page 4 and Page 6, the project has only the summary that a program made.

| Page | Address | Subject |
|------|---------|---------|
| 1 | `https://help.agi.com/stk/Content/install/sysreq.htm` | Computer and software that STK 13.1.0 must have. |
| 2 | `https://help.agi.com/stk/Content/training/tx-marsprobe.htm` | Example "Mars Probe" of STK. |
| 3 | `https://sourceforge.net/projects/gmat/` | Project page of GMAT: license, computers, release R2026a of 2026-04-03. |
| 4 | `https://gmat.atlassian.net/wiki/spaces/GW/pages/380273265` | Documents of GMAT for the user: the parts of the user guide. |
| 5 | `https://software.nasa.gov/software/GSC-17177-1` | NASA Software Catalog: text about GMAT. |
| 6 | `https://gmat.atlassian.net/wiki/spaces/GW/blog/2025/05/16/2962227204/Announcing+GMAT+R2025a+Release` | New functions of GMAT R2025a. |
| 7 | `https://universesandbox.com/` | Product page of Universe Sandbox. |
