# Assets

This page lists the assets of Apsis that come from other sources.
A script writes the two texture sections of this page.
The script is `tools/textures/build_textures.py`.
It reads `public/textures/manifest.json`.
Do not edit the two texture sections by hand.

## Textures

The table shows each published texture file.
The file paths are relative to `public/`.
Each file also has a small version in `public/textures/sm/`.
The original files are in `data-src/textures/original/`.
The licence evidence for each file is in `data-src/textures/evidence/`.
The retrieval date of all files is 2026-10-14.

Each texture comes from the data of a space mission, of a telescope or of star catalogues.
No texture comes from a commercial application, from a game or from a personal site.
Six maps come from the texture map database of the JPL Solar System Simulator, a NASA application.
They are the maps of Deimos, Miranda, Ariel, Umbriel, Titania and Oberon.
JPL says that the USGS made these six maps from Viking and Voyager images.
The catalogue of USGS Astrogeology has no image mosaic of these six bodies.
The note of each manifest entry gives the weak points of the file.
A file with the licence CC BY 4.0 needs a credit.
It also needs a note about each change.
This table gives both.
NASA, JPL, the USGS and the Space Telescope Science Institute ask for a credit for their files.
This table gives that credit too.
The manifest field `licenceStatement` quotes the licence words of each source.

| File | Body | Title | Author or credit | Licence | Source | Changes |
|---|---|---|---|---|---|---|
| `textures/mercury.jpg` | MERCURY | Mercury MESSENGER MDIS Basemap MD3 Color Global Mosaic 665m | Applied Coherent Technology Corporation (primary authors); NASA, Johns Hopkins Applied Physics Laboratory, Arizona State University, Carnegie Science (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_md3_color_global_mosaic_665m> | The build resizes the image from 23040 x 11520 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/venus_surface.jpg` | VENUS | Venus Magellan Global C3-MDIR Synthetic Color Mosaic 4641m | USGS Astrogeology Science Center (primary author and publisher); PDS Geosciences Node (originator); NASA Magellan mission | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_synthetic_color_mosaic_4641m> | The build resizes the image from 8192 x 4096 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/earth.jpg` | EARTH | Blue Marble: Next Generation with Topography and Bathymetry (July, world.topo.bathy.200407.3x5400x2700.jpg) | NASA Earth Observatory. Blue Marble: Next Generation was produced by Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center). | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/> | The build resizes the image from 5400 x 2700 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/earth_night.jpg` | EARTH | Earth at Night/Black Marble: Flat Maps (2016, 3600x1800, BlackMarble_2016_01deg.jpg) | NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC. | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/> | The build resizes the image from 3600 x 1800 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/earth_clouds.jpg` | EARTH | The Blue Marble (2002): True-color global imagery at 1km resolution - Clouds (cloud_combined_2048.jpg) | NASA Goddard Space Flight Center. Image by Reto Stöckli (land surface, shallow water, clouds). Enhancements by Robert Simmon (ocean color, compositing, 3D globes, animation). | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/> | The build encodes the image again as JPEG (quality 85). |
| `textures/moon.jpg` | MOON | CGI Moon Kit (2025 color map, lroc_color_2k.jpg) | NASA's Scientific Visualization Studio (visualizer: Ernie Wright, USRA; scientist: Noah Petro, NASA/GSFC) | [Public domain](https://svs.gsfc.nasa.gov/help/) | <https://svs.gsfc.nasa.gov/4720/> | The build encodes the image again as JPEG (quality 85). |
| `textures/mars.jpg` | MARS | File:Mars Viking MDIM21 ClrMosaic 1km.jpg | NASA / Jet Propulsion Lab / USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov) | <https://commons.wikimedia.org/wiki/File:Mars_Viking_MDIM21_ClrMosaic_1km.jpg> | The build resizes the image from 21339 x 10670 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/jupiter.jpg` | JUPITER | Cassini's Best Maps of Jupiter (Cylindrical Map), PIA07782 | NASA/JPL/Space Science Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/> | The build resizes the image from 3601 x 1801 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/saturn.jpg` | SATURN | OPAL Saturn Cycle 32, rotation A (2025a): colour global map from the filters F631N, F502N and F395N | OPAL program (Outer Planet Atmospheres Legacy; principal investigator and HLSP author: Amy Simon); NASA/ESA Hubble Space Telescope; archive: MAST at the Space Telescope Science Institute; doi:10.17909/T9G593 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | <https://archive.stsci.edu/hlsp/opal/opal-saturn-cycle-32> | The build fills each row that has no clean image data. The fill north of 75.2 degrees north is the mean colour of the nearest valid rows. The fill south of 82.2 degrees south is the mean colour of the nearest valid rows. Near the limit the fill blends from the nearest valid row to this mean colour. Between 5.4 degrees north and 0.6 degrees south the fill is a linear blend of the two nearest valid rows. Then the build enlarges the image from 1800 x 900 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/saturn_ring.png` | SATURN | Panoramic Rings (PIA06175) | NASA/JPL/Space Science Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/panoramic-rings/> | The build makes a new image from the original image. It takes one brightness profile along the long axis of the ring ellipses. Each profile value is the mean of 17 image rows. The build resamples the profile to 2048 pixels between the inner radius and the outer radius. The radius scale comes from a fit to ring edges with a known radius (field radiusFit). The alpha value of a pixel is its brightness divided by the largest brightness of the strip. The colour of a pixel is the mean colour of 9 image columns around it. The build scales this colour to the largest brightness of the strip. A very dark pixel takes the colour of the nearest brighter pixel. The build writes 16 equal rows as a PNG file. The small version has 1024 x 8 pixels. |
| `textures/uranus.jpg` | URANUS | OPAL Uranus Cycle 23, rotation B (2015b): colour global map from the filters F657N, F547M and F467M | OPAL program (Outer Planet Atmospheres Legacy; principal investigator and HLSP author: Amy Simon); NASA/ESA Hubble Space Telescope; archive: MAST at the Space Telescope Science Institute; doi:10.17909/T9G593 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | <https://archive.stsci.edu/hlsp/opal/opal-uranus-cycle-23> | The build fills each row that has no clean image data. The fill south of 22.2 degrees south is the mean colour of the nearest valid rows. Near the limit the fill blends from the nearest valid row to this mean colour. Then the build enlarges the image from 721 x 361 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/neptune.jpg` | NEPTUNE | OPAL Neptune Cycle 22, rotation A (2015a): colour global map from the filters F657N, F547M and F467M | OPAL program (Outer Planet Atmospheres Legacy; principal investigator and HLSP author: Amy Simon); NASA/ESA Hubble Space Telescope; archive: MAST at the Space Telescope Science Institute; doi:10.17909/T9G593 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | <https://archive.stsci.edu/hlsp/opal/opal-neptune-cycle-22> | The build fills each row that has no clean image data. The fill north of 23.2 degrees north is the mean colour of the nearest valid rows. Near the limit the fill blends from the nearest valid row to this mean colour. Then the build enlarges the image from 721 x 361 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/pluto.jpg` | PLUTO | File:Pluto color mapmosaic.jpg (NASA title: Pluto Global Color Map) | NASA / Johns Hopkins University Applied Physics Laboratory / Southwest Research Institute | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Pluto_color_mapmosaic.jpg> | The build resizes the image from 5926 x 2963 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/charon.jpg` | CHARON | Charon New Horizons LORRI MVIC Global Mosaic 300m | New Horizons Team (primary authors); NASA, Johns Hopkins University Applied Physics Laboratory, Southwest Research Institute, Lunar and Planetary Institute (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m> | The build resizes the image from 12693 x 6347 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/io.jpg` | IO | Io Galileo SSI / Voyager Color Merged Global Mosaic 1km | USGS Astrogeology Science Center (primary author and publisher); Planetary Data System (originator) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km> | The build resizes the image from 11445 x 5723 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/europa.jpg` | EUROPA | Europa Voyager - Galileo SSI Global Mosaic 500m | Tammy Becker (primary author); Archinal, B., Colvin, T, Davies, M, Gitlin, A., Kirk, R., Weller, L. (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m> | The build resizes the image from 19631 x 9816 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/ganymede.jpg` | GANYMEDE | Ganymede Voyager - Galileo SSI Color Global Mosaic 1.4km | USGS Astrogeology Science Center | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km> | The build resizes the image from 11520 x 5760 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/callisto.jpg` | CALLISTO | Callisto Galileo/Voyager Global Mosaic 1km | USGS Astrogeology Science Center | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km> | The build resizes the image from 15138 x 7569 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/mimas.jpg` | MIMAS | Color Maps of Mimas – 2014 (PIA18437) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-mimas-2014/> | The build resizes the image from 6356 x 3178 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/enceladus.jpg` | ENCELADUS | Color Maps of Enceladus – 2014 (PIA18435) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-enceladus-2014/> | The build resizes the image from 15960 x 7980 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/tethys.jpg` | TETHYS | Color Maps of Tethys – 2014 (PIA18439) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-tethys-2014/> | The build resizes the image from 13467 x 6734 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/dione.jpg` | DIONE | Color Maps of Dione – 2014 (PIA18434) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-dione-2014/> | The build resizes the image from 14134 x 7067 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/rhea.jpg` | RHEA | Color Maps of Rhea – 2014 (PIA18438) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-rhea-2014/> | The build resizes the image from 12015 x 6008 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/titan_surface.jpg` | TITAN | Titan Cassini ISS Global Mosaic 4005m | Cassini ISS Team (primary authors); NASA/JPL-Caltech/SSI (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4005m> | The build resizes the image from 4040 x 2020 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/iapetus.jpg` | IAPETUS | Color Maps of Iapetus – 2014 (PIA18436) | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | [Public domain (JPL Image Use Policy)](https://www.jpl.nasa.gov/jpl-image-use-policy/) | <https://science.nasa.gov/photojournal/color-maps-of-iapetus-2014/> | The build resizes the image from 11741 x 5871 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/miranda.jpg` | MIRANDA | File:Miranda map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Miranda_map_JPL_USGS.jpg> | The build enlarges the image from 1440 x 720 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/ariel.jpg` | ARIEL | File:Ariel map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Ariel_map_JPL_USGS.jpg> | The build enlarges the image from 1440 x 720 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/umbriel.jpg` | UMBRIEL | File:Umbriel map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Umbriel_map_JPL_USGS.jpg> | The build enlarges the image from 1440 x 720 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/titania.jpg` | TITANIA | File:Titania map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Titania_map_JPL_USGS.jpg> | The build enlarges the image from 1440 x 720 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). |
| `textures/oberon.jpg` | OBERON | File:Oberon map JPL USGS.jpg | Caltech/JPL/USGS | [Public domain](https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA) | <https://commons.wikimedia.org/wiki/File:Oberon_map_JPL_USGS.jpg> | The build enlarges the image from 1440 x 720 to 2048 x 1024 pixels. It encodes the image again as JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/triton.jpg` | TRITON | Triton Voyager 2 Global Color Mosaic 600m | Lunar and Planetary Institute (primary authors); NASA, Jet Propulsion Laboratory, Dr. Paul Schenk (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m> | The build resizes the image from 14138 x 7069 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. |
| `textures/phobos.jpg` | PHOBOS | Phobos Viking Global Mosaic 5m | Phil Stooke (primary author); Planetary Data System (originator); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m> | The build resizes the image from 14400 x 7200 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/deimos.jpg` | DEIMOS | Mars - Deimos (NASA 3D Resources, image texture for 3D models, Mars - Deimos.tif) | NASA/JPL/Solar System Simulator (credit on the NASA page). The JPL texture map page gives creator and owner 'Caltech/JPL/USGS'. | [Public domain](https://www.nasa.gov/nasa-brand-center/images-and-media/) | <https://science.nasa.gov/3d-resources/mars-deimos/> | The build enlarges the image from 1440 x 720 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It tags the image with the sRGB colour profile. It removes scan marks at the right edge, at the top right corner and in the bottom row. |
| `textures/ceres.jpg` | CERES | Ceres Dawn FC Global Mosaic 400m | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (primary authors); USGS Astrogeology Science Center (originator and publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_400m> | The build resizes the image from 7383 x 3691 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/vesta.jpg` | VESTA | Vesta Dawn FC HAMO Global Mosaic 60m | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (primary authors); Dawn Team (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_mosaic_60m> | The build resizes the image from 26704 x 13352 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/bennu.jpg` | BENNU | Bennu OSIRIS-REx OCAMS Global PAN Mosaic 5cm | Lunar and Planetary Laboratory, University of Arizona (primary authors); C.A. Bennett, D.N.DellaGiustina, K.J.Becker, T.L.Becker, K.L.Edmundson, D.R. Golish, et. al. (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/bennu_osiris_rex_ocams_global_pan_mosaic_5cm> | The build resizes the image from 31417 x 15709 to 2048 x 1024 pixels. It converts the image from TIFF to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/eros.jpg` | EROS | NEAR MSI Albedo Mosaics: global albedo map of Eros, filter 4 (950 nm), simple cylindrical (browse image eros_nearmsi_filter4.png) | Golish, D.R., Brodbeck, J.I., Webber, C., Becker, K.J., Bennett, C.A., DellaGiustina, D.N. (originators); USGS Astrogeology Science Center (publisher) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | <https://astrogeology.usgs.gov/search/map/near_msi_albedo_mosaics> | The build fills each black pixel (value 0) in the first 8 and the last 8 columns of the original. Such a pixel takes the value of the nearest pixel of the same row that is not black. Then the build resizes the image from 10682 x 5341 to 2048 x 1024 pixels. It converts the image from PNG to JPEG (quality 85). It converts the image from greyscale to sRGB colour. |
| `textures/stars.jpg` | STARS | Deep Star Maps 2020 (star map in celestial coordinates, starmap_2020_4k.exr) | NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC. | [Public domain](https://svs.gsfc.nasa.gov/help/) | <https://svs.gsfc.nasa.gov/4851/> | The build converts the image from OpenEXR to JPEG (quality 85). It converts the image from linear light to the sRGB colour profile. |

## Bodies with no texture

The list shows each body that lacks a texture.

- SUN (color map): The project draws the Sun with shader code. The Sun has no fixed surface features. The earlier file is no longer in the project (project decision: no file from another application).
- VENUS (color map): The project draws the clouds of Venus with shader code. The earlier cloud map is no longer in the project (project decision: no file from another application). This work did not search for a cloud map from mission data. The file venus_surface.jpg shows the surface below the clouds.
- EARTH (specular map): The project draws the reflection of the ocean with shader code. The earlier water mask is no longer in the project (project decision: no file from another application).
- EARTH (normal map): The earlier normal map is no longer in the project (project decision: no file from another application). This work did not search for another one.
- TITAN (color map): No source offers a real colour map of the Titan haze with a clear licence. NASA 3D Resources has a Titan map. The JPL page calls that map a 'Fictitious Titan concept'. The file titan_surface.jpg shows the surface in near-infrared light. The search covers USGS Astrogeology, NASA Photojournal, NASA 3D Resources and Wikimedia Commons.

## Spacecraft models

The spacecraft models are original work for Apsis.
The code in `src/render/spacecraft/` builds each model when the application runs.
The models use no model file, no image file and no font.
The code makes each texture of the models.
The models copy no model file and no texture of other software.
The licence of the models is the licence of the Apsis source code.
No model shows an agency logo, a flag, a mission patch or text.
The `voyager` model has a plain gold disc on its bus.
The disc has no picture and no text.

Each model shows the general look of one class of real spacecraft.
No model is an exact copy of a real spacecraft.
The model `apsis` is an original design.
It represents no real spacecraft.

The table shows the spacecraft class of each model.
It also shows the public document that gives the main sizes.
The retrieval date of each document is 2026-10-14.
A local copy is a file in `truth/published/`.

| Model | Spacecraft class | Document | Sizes from the document |
|---|---|---|---|
| `voyager` | Voyager 1 and Voyager 2 class probe | NASA NSSDCA Master Catalog, Voyager 1, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A> (local copy `nssdc_voyager1.html`) | Bus 1.78 m across and 0.47 m high. Dish 3.66 m. Science boom about 2.5 m. Magnetometer boom 13 m. Two whip antennas of 10 m. Generator case 0.41 m by 0.51 m. |
| `cassini` | Cassini class Saturn orbiter with its atmospheric probe | NASA Science, Cassini Quick Facts, <https://science.nasa.gov/mission/cassini/quick-facts/>. NASA Science, Cassini Orbiter, <https://science.nasa.gov/mission/cassini/spacecraft/cassini-orbiter/> | Height 6.7 m. Width 4 m. One high-gain antenna. Three generators. |
| `newhorizons` | New Horizons class flyby probe | NASA NSSDCA Master Catalog, New Horizons, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2006-001A> (local copy `nssdc_newhorizons.html`) | Bus 0.68 m by 2.11 m by 2.74 m. Dish 2.1 m. One generator at one corner. |
| `juno` | Juno class Jupiter orbiter | NASA NSSDCA Master Catalog, Juno, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-040A> | Six-sided bus 3.5 m across and 3.5 m high. Three solar wings, about 20 m across. Eleven panels. Boom at the end of one wing. Vault 0.8 m by 0.8 m by 0.6 m. Spin rate 2 rpm. |
| `galileo` | Galileo class Jupiter orbiter with its atmospheric probe | NASA Science, Galileo, <https://science.nasa.gov/mission/galileo/> | Dish 4.8 m. Height 5.3 m. Magnetometer boom 11 m. Two generators. Spin rate about 3 rpm. Probe 1.27 m wide and 0.91 m high. |
| `pioneer` | Pioneer 10 and Pioneer 11 class probe | NASA NSSDCA Master Catalog, Pioneer 10, <https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-012A> | Dish 2.74 m. Six-sided bus 0.36 m deep with sides of 0.71 m. Feed on three struts. Four generators on two trusses, about 3 m from the centre. Magnetometer boom 6.6 m. |
| `marscruise` | Mars rover mission in the cruise configuration (aeroshell and cruise stage) | None | Approximate proportions from general knowledge, not verified against a document. |
| `apsis` | Original design of this product | None | The model represents no real spacecraft. |
| `ulysses` | Ulysses class solar polar probe | None | Approximate proportions from general knowledge, not verified against a document. |

A document gives only the main sizes of a spacecraft.
The models follow these sizes approximately.
All other proportions come from general knowledge.
No document confirms them.
The local Mars 2020 pages give no size of the cruise stage or the aeroshell.

## Body rendering

The code in `src/render/bodies/` draws the Sun, the planets, the moons, the rings, the small bodies and the star background.
It reads only `public/textures/manifest.json` and the files that the manifest lists.
It uses no other image, no model file and no font.
It makes no request to another server.
Each body reports `provenance` (`map`, `procedural` or `mixed`) and `notes`.
The list `NOTE_CODES` in `src/render/bodies/index.ts` gives the meaning of each note.

These parts are made by code.
They are not photographs.

- The surface and the glow of the Sun.
- The cloud deck of Venus and the haze of Titan. The maps of these two bodies show only in the variant `surface`.
- The air of Earth and Mars, the haze of Pluto, the thin haze of the giant planets, the glint of the Sun on the sea, and the shadows of the clouds.
- The rings of Uranus and the F ring of Saturn. The code draws these narrow rings wider than the real rings, so that a picture can show them. It also draws the rings of Uranus brighter than the albedo of the fact sheet.
- The opacity of the rings of Saturn. The ring file gives the colour and the brightness. The code derives the opacity from the brightness and from the optical depth ranges of the fact sheet.
- The shape of Phobos, Deimos, Eros, Itokawa, Ryugu, Bennu, Didymos, Arrokoth, Psyche and the two comet nuclei. Each shape shows the shape class of the body. It is not a measured shape model. Phobos, Deimos, Bennu and Eros show their real map on this shape. A body that is not in the body table gets a generic rocky shape.
- The surface of each body with no map, and the surface that a body shows when its file does not load.

The code changes the look of a real map in these ways.

- Each map has a brightness factor. The factor is set by eye.
- A map with the colour class `enhanced` shows 30 percent of its colour saturation.
- An area with no data shows a flat dark grey.
- Some map files have one or two dark pixel columns at the left or right edge, or dark pixel rows at the top or bottom edge. A dark column shows as a thin line along a meridian. A dark row shows as a dot at a pole. At load time the code replaces these lines by the good line beside them (note `map-edge-repaired` for columns, note `map-pole-repaired` for rows). The files stay as they are. The repair applies to the maps of Mars, Io, Europa, Ganymede, Callisto, Mimas, Enceladus, Tethys, Dione, Rhea, Iapetus, Miranda, Ariel, Umbriel, Titania, Oberon, Charon, Ceres (small file only), Vesta, Bennu and Eros.
- The night map of Earth shows only on the dark side. The code subtracts a dark level from it, so that only the lights stay.
- The cloud map of Earth gives the amount of cloud. A curve increases its contrast.
- The star map is dim. A power curve makes its faint areas darker.

Sources of the numbers in the code:

- Ring radii and optical depth ranges: NSSDC Saturnian Rings Fact Sheet and Uranian Rings Fact Sheet (local copies `data-src/factsheets/satringfact.html` and `uranringfact.html`).
- Scale heights of the air of Earth, Mars and Venus: NSSDC planetary fact sheets (local copies in `data-src/factsheets/`).
- Radii of Phobos and Deimos: `src/engine/data/constants.json` (from the NAIF kernel `pck00011.tpc`).
- Widths of the ring gaps and sizes of the other small bodies: approximate values from general knowledge. No document was checked for them.
- Colours, cloud band tables, haze values and brightness factors: set by eye. They are not measured.
