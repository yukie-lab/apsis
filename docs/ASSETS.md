# Assets

This page gives the source and the license of each asset of Apsis.
The assets are the maps of the bodies, the spacecraft models, the data of the engine and the libraries.

The script `tools/textures/build_textures.py` writes the first two sections of this page.
It uses the data in `public/textures/manifest.json`.
Do not change these two sections. Change `data-src/textures/sources.json` or the script, and then use the script again.

## Maps of the bodies

The table shows each map file in `public/`.
Each map also has a small file in `public/textures/sm/`.
23 maps also have a large file in `public/textures/lg/`.
The column Changes gives the sizes that the project made of each map.
The project got all source files on 2026-10-14.

The source files are in `data-src/textures/original/`.
They are not in `git`, because they are large.
The file `manifest.json` gives the address and the SHA-256 of each source file (fields `downloadUrl` and `sha256`).

The records of the licenses are in `data-src/textures/evidence/`.
Each record contains text from the page of its source: thus the records are not in `git` (decision D79).
The file `data-src/reference-copies.json` gives the address, the size and the SHA-256 of each record.

Each map comes from the data of a space mission, of a telescope or of star catalogs.
No map comes from an application of a company or from the web site of a person.
Six maps come from the JPL Solar System Simulator, an application of NASA.
They are the maps of Deimos, Miranda, Ariel, Umbriel, Titania and Oberon.
The JPL page shows that the USGS made these six maps from images of Viking and Voyager.
The catalog of USGS Astrogeology has no image mosaic of these six bodies.

The field `note` of each map in `manifest.json` gives the limits of its file.
With the license CC BY 4.0, the user of a file must give a credit and a note about each change.
The table gives the credit and the note.
NASA, JPL, the USGS and the Space Telescope Science Institute also tell the user to give a credit for their files.
The table gives this credit too.
The field `licenceStatement` of each map in `manifest.json` gives the words of the license of its source.

| File | Body | Title | Credit | License | Source | Changes |
|---|---|---|---|---|---|---|
| `textures/mercury.jpg` | `MERCURY` | Mercury MESSENGER MDIS Basemap MD3 Color Global Mosaic 665m | Applied Coherent Technology Corporation (primary authors); NASA, Johns Hopkins Applied Physics Laboratory, Arizona State University, Carnegie Science (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_md3_color_global_mosaic_665m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 23040 x 11520 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It set the color space of each size to sRGB, because the source image gives no color space. |
| `textures/venus_surface.jpg` | `VENUS` | Venus Magellan Global C3-MDIR Synthetic Color Mosaic 4641m | USGS Astrogeology Science Center (primary author and publisher); PDS Geosciences Node (originator); NASA Magellan mission | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_synthetic_color_mosaic_4641m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 8192 x 4096 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It set the color space of each size to sRGB, because the source image gives no color space. |
| `textures/earth.jpg` | `EARTH` | Blue Marble: Next Generation with Topography and Bathymetry (July, world.topo.bathy.200407.3x5400x2700.jpg) | NASA Earth Observatory. Blue Marble: Next Generation was produced by Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center). | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 5400 x 2700 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/earth_night.jpg` | `EARTH` | Earth at Night/Black Marble: Flat Maps (2016, 3600x1800, BlackMarble_2016_01deg.jpg) | NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC. | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 3600 x 1800 pixels). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/earth_clouds.jpg` | `EARTH` | The Blue Marble (2002): True-color global imagery at 1km resolution - Clouds (cloud_combined_2048.jpg) | NASA Goddard Space Flight Center. Image by Reto Stöckli (land surface, shallow water, clouds). Enhancements by Robert Simmon (ocean color, compositing, 3D globes, animation). | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 2048 x 1024 pixels). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/moon.jpg` | `MOON` | CGI Moon Kit (2025 color map, lroc_color_2k.jpg) | NASA's Scientific Visualization Studio (visualizer: Ernie Wright, USRA; scientist: Noah Petro, NASA/GSFC) | [Public domain](https://svs.gsfc.nasa.gov/help/) | <https://svs.gsfc.nasa.gov/4720/> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 2048 x 1024 pixels). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/mars.jpg` | `MARS` | File:Mars Viking MDIM21 ClrMosaic 1km.jpg | NASA / Jet Propulsion Lab / USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov) | <https://commons.wikimedia.org/wiki/File:Mars_Viking_MDIM21_ClrMosaic_1km.jpg> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 21339 x 10670 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/jupiter.jpg` | `JUPITER` | Cassini's Best Maps of Jupiter (Cylindrical Map), PIA07782 | NASA/JPL/Space Science Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 3601 x 1801 pixels). It converted each size from TIFF to JPEG (JPEG quality 85) with the color space sRGB, because the source image gives no color space. |
| `textures/saturn.jpg` | `SATURN` | OPAL Saturn Cycle 32, rotation A (2025a): color global map from the filters F631N, F502N and F395N | OPAL program (Outer Planet Atmospheres Legacy; principal investigator and HLSP author: Amy Simon); NASA/ESA Hubble Space Telescope; archive: MAST at the Space Telescope Science Institute; doi:10.17909/T9G593 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | <https://archive.stsci.edu/hlsp/opal/opal-saturn-cycle-32> | The project gave a new color to each row that has no good image data. North of 75.2 degrees north and south of 82.2 degrees south, the new color is the mean color of the nearest good rows. Near the limit, the color changes in small steps from the color of the nearest good row to this mean color. Between 5.4 degrees north and 0.6 degrees south, the new color of a row is a linear interpolation between the two nearest good rows. Then the project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1800 x 900 pixels, thus the size 2048 x 1024 is larger than the source image). It converted each size from TIFF to JPEG (JPEG quality 85) with the color space sRGB, because the source image gives no color space. |
| `textures/saturn_ring.png` | `SATURN` | Panoramic Rings (PIA06175) | NASA/JPL/Space Science Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/panoramic-rings/> | The project made a new image from the source image: one line of 2048 pixels from the smallest radius of the rings to the largest radius. The brightness of a pixel is the mean brightness of 17 image rows along the long axis of the ring ellipses. The scale of the radius comes from a fit to ring edges that have a known radius. The alpha value of a pixel is its brightness as a fraction of the largest brightness of the image. A pixel gets the mean color of 9 image columns around it, or the color of the nearest brighter pixel if it is very dark. The file has 16 equal rows (PNG), and the small version has 1024 x 8 pixels. |
| `textures/uranus.jpg` | `URANUS` | OPAL Uranus Cycle 23, rotation B (2015b): color global map from the filters F657N, F547M and F467M | OPAL program (Outer Planet Atmospheres Legacy; principal investigator and HLSP author: Amy Simon); NASA/ESA Hubble Space Telescope; archive: MAST at the Space Telescope Science Institute; doi:10.17909/T9G593 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | <https://archive.stsci.edu/hlsp/opal/opal-uranus-cycle-23> | The project gave a new color to each row that has no good image data. South of 22.2 degrees south, the new color is the mean color of the nearest good rows. Near the limit, the color changes in small steps from the color of the nearest good row to this mean color. Then the project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 721 x 361 pixels, thus each size is larger than the source image). It converted each size from TIFF to JPEG (JPEG quality 85) with the color space sRGB, because the source image gives no color space. |
| `textures/neptune.jpg` | `NEPTUNE` | OPAL Neptune Cycle 22, rotation A (2015a): color global map from the filters F657N, F547M and F467M | OPAL program (Outer Planet Atmospheres Legacy; principal investigator and HLSP author: Amy Simon); NASA/ESA Hubble Space Telescope; archive: MAST at the Space Telescope Science Institute; doi:10.17909/T9G593 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | <https://archive.stsci.edu/hlsp/opal/opal-neptune-cycle-22> | The project gave a new color to each row that has no good image data. North of 23.2 degrees north, the new color is the mean color of the nearest good rows. Near the limit, the color changes in small steps from the color of the nearest good row to this mean color. Then the project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 721 x 361 pixels, thus each size is larger than the source image). It converted each size from TIFF to JPEG (JPEG quality 85) with the color space sRGB, because the source image gives no color space. |
| `textures/pluto.jpg` | `PLUTO` | File:Pluto color mapmosaic.jpg (NASA title: Pluto Global Color Map) | NASA / Johns Hopkins University Applied Physics Laboratory / Southwest Research Institute | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Pluto_color_mapmosaic.jpg> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 5926 x 2963 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/charon.jpg` | `CHARON` | Charon New Horizons LORRI MVIC Global Mosaic 300m | New Horizons Team (primary authors); NASA, Johns Hopkins University Applied Physics Laboratory, Southwest Research Institute, Lunar and Planetary Institute (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 12693 x 6347 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/io.jpg` | `IO` | Io Galileo SSI / Voyager Color Merged Global Mosaic 1km | USGS Astrogeology Science Center (primary author and publisher); Planetary Data System (originator) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 11445 x 5723 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It set the color space of each size to sRGB, because the source image gives no color space. |
| `textures/europa.jpg` | `EUROPA` | Europa Voyager - Galileo SSI Global Mosaic 500m | Tammy Becker (primary author); Archinal, B., Colvin, T, Davies, M, Gitlin, A., Kirk, R., Weller, L. (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 19631 x 9816 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/ganymede.jpg` | `GANYMEDE` | Ganymede Voyager - Galileo SSI Color Global Mosaic 1.4km | USGS Astrogeology Science Center | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 11520 x 5760 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It set the color space of each size to sRGB, because the source image gives no color space. |
| `textures/callisto.jpg` | `CALLISTO` | Callisto Galileo/Voyager Global Mosaic 1km | USGS Astrogeology Science Center | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 15138 x 7569 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/mimas.jpg` | `MIMAS` | Color Maps of Mimas – 2014 (PIA18437) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-mimas-2014/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 6356 x 3178 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/enceladus.jpg` | `ENCELADUS` | Color Maps of Enceladus – 2014 (PIA18435) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-enceladus-2014/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 15960 x 7980 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/tethys.jpg` | `TETHYS` | Color Maps of Tethys – 2014 (PIA18439) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-tethys-2014/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 13467 x 6734 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/dione.jpg` | `DIONE` | Color Maps of Dione – 2014 (PIA18434) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-dione-2014/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 14134 x 7067 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/rhea.jpg` | `RHEA` | Color Maps of Rhea – 2014 (PIA18438) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-rhea-2014/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 12015 x 6008 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/titan_surface.jpg` | `TITAN` | Titan Cassini ISS Global Mosaic 4005m | Cassini ISS Team (primary authors); NASA/JPL-Caltech/SSI (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4005m> | The project made three sizes of the image: 4040 x 2020, 2048 x 1024 and 1024 x 512 pixels (the source image has 4040 x 2020 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4040 x 2020, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/iapetus.jpg` | `IAPETUS` | Color Maps of Iapetus – 2014 (PIA18436) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-iapetus-2014/> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 11741 x 5871 pixels). It wrote each size as a new JPEG file (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). |
| `textures/miranda.jpg` | `MIRANDA` | File:Miranda map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Miranda_map_JPL_USGS.jpg> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1440 x 720 pixels, thus the size 2048 x 1024 is larger than the source image). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/ariel.jpg` | `ARIEL` | File:Ariel map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Ariel_map_JPL_USGS.jpg> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1440 x 720 pixels, thus the size 2048 x 1024 is larger than the source image). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/umbriel.jpg` | `UMBRIEL` | File:Umbriel map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Umbriel_map_JPL_USGS.jpg> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1440 x 720 pixels, thus the size 2048 x 1024 is larger than the source image). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/titania.jpg` | `TITANIA` | File:Titania map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Titania_map_JPL_USGS.jpg> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1440 x 720 pixels, thus the size 2048 x 1024 is larger than the source image). It wrote each size as a new JPEG file (JPEG quality 85). |
| `textures/oberon.jpg` | `OBERON` | File:Oberon map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Oberon_map_JPL_USGS.jpg> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1440 x 720 pixels, thus the size 2048 x 1024 is larger than the source image). It wrote each size as a new JPEG file (JPEG quality 85). It converted each size from gray values to sRGB color values. |
| `textures/triton.jpg` | `TRITON` | Triton Voyager 2 Global Color Mosaic 600m | Lunar and Planetary Institute (primary authors); NASA, Jet Propulsion Laboratory, Dr. Paul Schenk (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 14138 x 7069 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It set the color space of each size to sRGB, because the source image gives no color space. |
| `textures/phobos.jpg` | `PHOBOS` | Phobos Viking Global Mosaic 5m | Phil Stooke (primary author); Planetary Data System (originator); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 14400 x 7200 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/deimos.jpg` | `DEIMOS` | Mars - Deimos (NASA 3D Resources, image texture for 3D models, Mars - Deimos.tif) | NASA/JPL/Solar System Simulator (credit on the NASA page). The JPL texture map page gives creator and owner 'Caltech/JPL/USGS'. | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/3d-resources/mars-deimos/> | The project made two sizes of the image: 2048 x 1024 and 1024 x 512 pixels (the source image has 1440 x 720 pixels, thus the size 2048 x 1024 is larger than the source image). It converted each size from TIFF to JPEG (JPEG quality 85) with the color space sRGB, because the source image gives no color space. It gave new values to dark lines and to a black area at the right edge and in the last row. |
| `textures/ceres.jpg` | `CERES` | Ceres Dawn FC Global Mosaic 400m | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (primary authors); USGS Astrogeology Science Center (originator and publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_400m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 7383 x 3691 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/vesta.jpg` | `VESTA` | Vesta Dawn FC HAMO Global Mosaic 60m | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (primary authors); Dawn Team (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_mosaic_60m> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 26704 x 13352 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/bennu.jpg` | `BENNU` | Bennu OSIRIS-REx OCAMS Global PAN Mosaic 5cm | Lunar and Planetary Laboratory, University of Arizona (primary authors); C.A. Bennett, D.N.DellaGiustina, K.J.Becker, T.L.Becker, K.L.Edmundson, D.R. Golish, et. al. (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/bennu_osiris_rex_ocams_global_pan_mosaic_5cm> | The project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 31417 x 15709 pixels). It converted each size from TIFF to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/eros.jpg` | `EROS` | NEAR MSI Albedo Mosaics: global albedo map of Eros, filter 4 (950 nm), simple cylindrical (browse image eros_nearmsi_filter4.png) | Golish, D.R., Brodbeck, J.I., Webber, C., Becker, K.J., Bennett, C.A., DellaGiustina, D.N. (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/near_msi_albedo_mosaics> | The project gave a new value to each black pixel (value 0) in the first 8 and the last 8 columns of the source image. The new value is the value of the nearest pixel of the same row that is not black. Then the project made three sizes of the image: 4096 x 2048, 2048 x 1024 and 1024 x 512 pixels (the source image has 10682 x 5341 pixels). It converted each size from PNG to JPEG (JPEG quality 80 for the size 4096 x 2048, JPEG quality 85 for the other sizes). It converted each size from gray values to sRGB color values. |
| `textures/stars.jpg` | `STARS` | Deep Star Maps 2020 (star map in celestial coordinates, starmap_2020_4k.exr) | NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC. | [Public domain](https://svs.gsfc.nasa.gov/help/) | <https://svs.gsfc.nasa.gov/4851/> | The project made two sizes of the image: 4096 x 2048 and 2048 x 1024 pixels (the source image has 4096 x 2048 pixels). It converted each size from OpenEXR to JPEG (JPEG quality 85). It converted each size from linear values to sRGB values. |

## Maps that the application does not have

The list gives the body and the type of each map that the application does not have, and the reason.

- `SUN`, map `color`: The code calculates the surface of the Sun. The surface of the Sun always changes. The project removed the earlier file, because the project uses no file from a different application.
- `VENUS`, map `color`: The code calculates the clouds of Venus. The project removed the earlier map of the clouds, because the project uses no file from a different application. The project did not search for a map of the clouds from the data of a mission. The file `venus_surface.jpg` shows the surface below the clouds.
- `EARTH`, map `specular`: The code calculates the light of the Sun on the oceans. The project removed the earlier map of the oceans, because the project uses no file from a different application.
- `EARTH`, map `normal`: The project removed the earlier normal map, because the project uses no file from a different application. The project did not search for a different normal map.
- `TITAN`, map `color`: The project searched USGS Astrogeology, NASA Photojournal, NASA 3D Resources and Wikimedia Commons for a color map of the haze of Titan. It found no color map of the haze from the data of a mission with a clear license. NASA 3D Resources has a map of Titan, but the JPL page gives this name to that map: "Fictitious Titan concept". The file `titan_surface.jpg` shows the surface in near-infrared light.

## Spacecraft models

The project made the spacecraft models for Apsis.
The code in `src/render/spacecraft/` makes each model in the browser.
The models use no model file, no image file and no font.
The code calculates the colors of each surface of the models.
The models contain no part of a model or of an image of other software.
The models are code of the project: they have the license of the code of the project.

No model shows a logo, a flag or text.
The model `voyager` has a yellow circle on its bus.
The circle has no picture and no text.

Each model shows the approximate shape of one type of actual spacecraft.
No model is an accurate copy of an actual spacecraft.
The model `apsis` is a design of the project. It is not a model of an actual spacecraft.

The table shows the spacecraft type of each model.
It also shows the document that gives the largest dimensions of the spacecraft.
The project got each document on 2026-10-14.
The file `data-src/reference-copies.json` lists the documents that have a local copy.

| Model | Spacecraft type | Document | Dimensions from the document |
|---|---|---|---|
| `voyager` | Voyager 1 and Voyager 2 | NASA NSSDCA Master Catalog, Voyager 1, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A> (local copy `nssdc_voyager1.html`). | Bus: 1.78 m wide and 0.47 m high. Dish antenna: 3.66 m. Boom of the instruments: approximately 2.5 m. Magnetometer boom: 13 m. Two antennas of 10 m. Generator: 0.41 m by 0.51 m. |
| `cassini` | Cassini, a Saturn orbiter with its atmosphere probe | NASA Science, Cassini Quick Facts, <https://science.nasa.gov/mission/cassini/quick-facts/>. NASA Science, Cassini Orbiter, <https://science.nasa.gov/mission/cassini/spacecraft/cassini-orbiter/>. | The spacecraft is 6.7 m high and 4 m wide. One high-gain antenna. Three generators. |
| `newhorizons` | New Horizons | NASA NSSDCA Master Catalog, New Horizons, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2006-001A> (local copy `nssdc_newhorizons.html`). | Bus: 0.68 m by 2.11 m by 2.74 m. Dish antenna: 2.1 m. One generator at one edge of the bus. |
| `juno` | Juno, a Jupiter orbiter | NASA NSSDCA Master Catalog, Juno, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-040A>. | Bus with six sides: 3.5 m wide and 3.5 m high. Three solar arrays, approximately 20 m from end to end. Eleven panels. Boom at the end of one solar array. Vault: 0.8 m by 0.8 m by 0.6 m. Rotation rate: 2 revolutions for each minute. |
| `galileo` | Galileo, a Jupiter orbiter with its atmosphere probe | NASA Science, Galileo, <https://science.nasa.gov/mission/galileo/>. | Dish antenna: 4.8 m. The spacecraft is 5.3 m high. Magnetometer boom: 11 m. Two generators. Rotation rate: approximately 3 revolutions for each minute. Probe: 1.27 m wide and 0.91 m high. |
| `pioneer` | Pioneer 10 and Pioneer 11 | NASA NSSDCA Master Catalog, Pioneer 10, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-012A>. | Dish antenna: 2.74 m. Bus with six sides: 0.36 m high, each side 0.71 m long. Antenna feed on three struts. Four generators on two trusses, approximately 3 m from the center. Magnetometer boom: 6.6 m. |
| `marscruise` | Spacecraft of a Mars rover mission during the cruise (aeroshell and cruise stage) | None | The dimensions are approximate. No document is their source. The project did not compare them with a document. |
| `apsis` | Design of the project | None | The model is not a model of an actual spacecraft. |
| `ulysses` | Ulysses | None | The dimensions are approximate. No document is their source. The project did not compare them with a document. |

A document gives only the largest dimensions of a spacecraft.
The models agree with these dimensions approximately.
The other dimensions have no document as their source.
The project did not compare them with a document.
The Mars 2020 pages that the project read give no dimension of the cruise stage or of the aeroshell.

## Pictures of the bodies

The code in `src/render/bodies/` makes the pictures of the Sun, the planets, the moons, the rings, the small bodies and the stars.
It reads only `public/textures/manifest.json` and the files that this file lists.
It uses no other image, no model file and no font.
It sends no request to a different server.

Each body gives the source of its picture (`provenance`: `map`, `procedural` or `mixed`) and a list of notes (`notes`).
The list `NOTE_CODES` in `src/render/bodies/index.ts` has each note.
The 3D view shows the notes of the body in view.

The code calculates these parts. They are not images from a camera.

- The surface of the Sun and the light around the Sun.
- The clouds of Venus and the haze of Titan. The maps of these two bodies show only with the option `surface`.
- The atmosphere of the Earth and of Mars, the haze of Pluto and the thin haze of the outer planets.
- The light of the Sun on the oceans of the Earth, and the shadows of the clouds.
- The rings of Uranus and the F ring of Saturn. The code makes these narrow rings wider than the actual rings, because a picture cannot show the actual size. It also makes the rings of Uranus brighter than the albedo in the fact sheet.
- The opacity of the rings of Saturn. The ring file gives the color and the brightness. The code calculates the opacity from the brightness and from the ranges of the optical depth in the fact sheet.
- The shape of Phobos, Deimos, Eros, Itokawa, Ryugu, Bennu, Didymos, Arrokoth, Psyche and the nuclei of the two comets. Each shape shows the approximate shape of the body. No shape comes from a shape model of the body. Phobos, Deimos, Bennu and Eros show their map on this shape.
- The shape of a body that is not in the table of bodies. It is the approximate shape of a small asteroid.
- The surface of each body that has no map, and the surface that a body shows when its file does not load.

The code changes the picture of a map as follows.

- Each map has a brightness factor. The author set the factor from the picture on the screen.
- A map with the color type `enhanced` shows 30 percent of its color saturation.
- An area with no data shows a dark gray color.
- Some map files have one or two dark columns of pixels at the left edge or at the right edge. Some have dark rows at the top edge or at the lower edge. A dark column shows as a thin line along a meridian. A dark row shows as a small circle at a pole.
- When the code loads a map, it replaces these columns and rows with the good column or row adjacent to them. The notes `map-edge-repaired` and `map-pole-repaired` tell this to the user. The files have no change.
- The code makes this change to the maps of Mars, Io, Europa, Ganymede, Callisto, Mimas, Enceladus, Tethys, Dione, Rhea and Iapetus. It also makes this change to the maps of Miranda, Ariel, Umbriel, Titania, Oberon, Charon, Ceres (small file only), Vesta, Bennu and Eros.
- The night map of the Earth shows only on the dark side. The code subtracts a dark level from it: only the lights stay.
- The cloud map of the Earth gives the quantity of cloud. A curve increases its contrast.
- The star map has a low brightness. A curve decreases the brightness of its dark areas more.
- A body starts with the small file or with the 2048 file of each map (setting `low` or `high`). When the camera is near, the code loads the next size and changes to it. When the camera is far again for 10 s, the code uses the first file again. Not more than two maps of all bodies use the next size at the same time. The three maps of the Earth with the setting `low` are an exception.
- Where one pixel of a map file is larger than two screen pixels, the code calculates the color between the pixels of the file. It uses a cubic curve for this calculation. The picture there shows no squares. It shows no detail that the file does not have.

Sources of the numbers in the code:

- Radii of the rings and ranges of the optical depth: NSSDC Saturnian Rings Fact Sheet and Uranian Rings Fact Sheet.
- Scale heights of the atmosphere of the Earth, of Mars and of Venus: NSSDC planetary fact sheets.
- Radii of Phobos and Deimos: `src/engine/data/constants.json` (from the NAIF kernel `pck00011.tpc`).
- Sizes of the ring gaps and sizes of the other small bodies: approximate values. No document is their source. The project did not compare them with a document.
- Colors, tables of cloud bands, haze values and brightness factors: the author set them from the picture on the screen. The author did not measure them.

The file `data-src/reference-copies.json` lists the local copies of the fact sheets.

## Music

The code in `src/app/music.ts` makes the music of the application with the Web Audio interface of the browser.
It uses no music file and no music of a different author. The project made the chords and the notes of the music.

## Data of the engine

The application contains the data files of this table.
The project made each file from data of JPL.
The file paths are relative to the project directory.

| File | Data in the file | Source | How the project made the file |
|---|---|---|---|
| `public/data/ephem.bin` (4.3 MB) | Positions of the Sun, the planets, the Moon and the Pluto system from 1949-12-14 to 2100-01-12 (TDB) | The planet ephemeris DE440 of JPL: the NAIF kernel `de440s.bsp` | The script `tools/ephem/build_ephem.py` calculates new Chebyshev polynomials. The fit tolerance is 10 m. |
| `public/data/small.bin` (1.8 MB) | Positions of 11 asteroids, comets and dwarf planets from 1980-01-01 to 2060-01-01 (TDB) | State vectors from the JPL Horizons API (`data-src/horizons-fit/`) | The script `tools/ephem/build_small.py` calculates Chebyshev polynomials. The fit tolerance is 1 km. |
| `src/engine/data/constants.json` | Mass parameters, radii, pole directions and leap seconds | The NAIF kernels `gm_de440.tpc`, `pck00011.tpc` and `naif0012.tls` | The script `tools/ephem/build_constants.py` reads the values. The file records the SHA-256 of each kernel. |
| `src/engine/data/moons.json` | Orbit model of 20 moons | State vectors from the JPL Horizons API (`truth/horizons/moons_fit.json`) | The script `tools/ephem/build_moons.py` calculates the parameters of an ellipse that turns at a constant rate. |
| `src/engine/data/small.json` | Names and physical data of the 11 small bodies | JPL Small-Body Database API (`truth/sbdb/raw/`) | The script `tools/truth/fetch_small_info.py` reads the values. |
| `src/engine/data/famous.json` | Data of 8 actual missions: the sequence of the bodies and the times of the closest approaches. Also the aim point at the last body and the times of the deep-space maneuvers. | Trajectories of the spacecraft from the JPL Horizons API (`truth/horizons/`) | The script `tools/truth/build_famous.py` reads the times and the aim points. The file contains no trajectory. |

The header of each of the two files in `public/data/` gives its source. The header of `ephem.bin` also gives the SHA-256 of the kernel.
The four kernels are not in `git` because of their size. The file `data-src/reference-copies.json` gives their addresses.

Conditions of use that the project found:

- **NAIF kernels.** The NAIF page "Rules Regarding Use of SPICE" has the sentences that follow.
  - "SPICE kernels placed on the NAIF server may be downloaded and used by anyone"
  - "No fees or licensing are required."
  - "Redistribution of SPICE kernels distributed by NAIF is permitted as long as they have not been modified."
  - "Acknowledgement of the use of NASA's SPICE system is encouraged."
- The file `data-src/evidence/naif_rules.txt` has these parts of the page and the date.
- The file `ephem.bin` is not a kernel. It is a new fit that the project made from a kernel.
- **JPL Horizons API and JPL Small-Body Database API.** The project found no license text for the data of these two services.
- The JPL page "API Documentation" gives rules only for the requests (`data-src/evidence/jpl_ssd_api_fair_use.txt`).
- This page, the About screen and the headers of the two files in `public/data/` give JPL as the source of the data.
- The two files in `data-src/evidence/` contain text from the pages. Thus they are local copies, and they are not in `git` (decision D79).
- The project did not make sure that these conditions are sufficient for a release. Only the author examined them.

## Libraries

The files of the application contain the libraries of this table.
The command `npm run build` writes their license texts to `dist/licenses.txt`. The About screen shows the same list.

| Library | Version | License |
|---|---|---|
| `react` | 19.3.0 | `MIT` |
| `react-dom` | 19.3.0 | `MIT` |
| `scheduler` | 0.28.0 | `MIT` |
| `three` | 0.186.1 | `MIT` |
| `zustand` | 5.0.15 | `MIT` |

The project uses the tools of the next table for the work on the code. The files of the application do not contain them.

| Tool | Version | License | Use |
|---|---|---|---|
| `typescript` | 7.0.2 | `Apache-2.0` | Type check |
| `vite` | 8.3.4 | `MIT` | Local web server and the files of the application |
| `@vitejs/plugin-react` | 6.1.2 | `MIT` | The files of the application |
| `vitest` | 5.0.4 | `MIT` | Automatic checks |
| `playwright-core` | 1.64.0 | `Apache-2.0` | Pictures of the screens |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/three` | 26.6.5, 19.3.0, 19.3.0, 0.186.0 | `MIT` | Type check |
| `jplephem` (Python) | 2.24 | `MIT` | The scripts in `tools/ephem` read the kernels |
| `numpy` (Python) | 2.5.4 | `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` | The scripts in `tools/ephem` and `tools/truth` |
| `scipy` (Python) | 1.18.1 | `BSD License` | The scripts in `tools/ephem` |

The application contains no font files: it uses the fonts of the computer of the user.
The project made the logo and the icons of the application. They are in the code.

## Tools and models of the user manual

The tools in `tools/manual/` make the user manual (`docs/MANUAL.md`). The files of the application do not contain these tools.
The manual contains the videos, the subtitles, the pictures and the figures that the tools made.

| Item | Version | License | Use |
|---|---|---|---|
| Kokoro-82M, ONNX model `onnx-community/Kokoro-82M-v1.0-ONNX` | 1.0 | `Apache-2.0` | Voice of the narration (voice af_heart) |
| Whisper `small.en`, ONNX model `Xenova/whisper-small.en` | | `Apache-2.0` | Check of the narration (speech recognition) |
| `kokoro-js` | 1.2.1 | `Apache-2.0` | Operates the voice model |
| `@huggingface/transformers` (Transformers.js) | 3.8.1 | `Apache-2.0` | Operates the two models |
| `phonemizer` | 1.2.1 | `Apache-2.0` | Changes the text into a form for the voice model. The package contains eSpeak NG (GPL version 3 or later). |
| `onnxruntime-node`, `onnxruntime-web` | 1.21.0, `1.22.0-dev.20250409` | `MIT` | Operates the two models |
| `@mathjax/src`, `@mathjax/mathjax-newcm-font` | 4.1.3 | `Apache-2.0` | Equations in the videos |
| `@fontsource/inter` (font Inter) | 5.3.0 | `OFL-1.1` | Text in the videos |
| `opentype.js` | 2.0.0 | `MIT` | Text in the videos |
| FFmpeg (`ffmpeg`, `ffprobe`) | 8.1.2 | GPL version 3 or later (this version has x264) | Makes the video files (H.264 and AAC) |
| `cwebp` (`libwebp`) | 1.6.0 | `BSD-3-Clause` | Makes the WebP pictures of the manual |
| Google Chrome | 147 | License of Google Chrome | Makes the pictures of the screens and the frames of the videos, with `playwright-core` |

- The licenses of the two models are the license fields of their pages on Hugging Face (read on 2026-10-14). The licenses of the packages are the license fields of their `package.json` files.
- The page of the model Kokoro-82M gives two sources of speech with a CC BY license in the data of the model: Koniwa `tnc` (CC BY 3.0) and SIWIS (CC BY 4.0). The manual gives this credit.
- The files of the two models are in `tools/manual/.cache/hf/` (1.2 GB). They are not in `git`.
- The project did not use ElevenLabs or a different service on the internet for the voice.

## Documents and pages for reference

The project read documents and pages of other sources for the file formats and for the published values.
The application contains no part of these documents.

- Specifications of the file formats: `docs/IO_FORMATS.md`, section 11.
- Published values of actual missions: `truth/published/published.json` gives the page of each value.
- NSSDC fact sheets: the sections "Spacecraft models" and "Pictures of the bodies" of this page give their use.

The copies of these documents and pages are not in `git` (decision D79).
The file `data-src/reference-copies.json` gives the address, the time, the size and the SHA-256 of each copy.

The outputs of the JPL Horizons API and of the JPL Small-Body Database API are the reference data of the tests.
They are in `truth/horizons/`, `truth/sbdb/`, `data-src/horizons-fit/` and `data-src/specs/horizons/`.
Each output file contains its request.
