<img width="1280" height="720" alt="COC_Pop_Den" src="https://github.com/user-attachments/assets/038d93a4-1022-4b10-87e0-e24e5fd46807" />


# Chandler, Drawn by Its People

**An animated relief map of where people live in Chandler, Arizona, from 1970 to 2026.**

Each year, color, shading and contour lines rise wherever new homes were built. The map shows the farm town around downtown in the 1970s, the Intel-era subdivisions of the 1980s and 90s, and the build-out south of the Santan Freeway after 2000. One loop takes about 45 seconds, then the map melts back into 1970 and starts again.

Made by **Will Surkan**. It is a single offline web page, built to run full screen on a projector with no internet connection.

> **Map type:** this is a density relief (isopleth) map. Every place keeps its true size and shape; height, color and contours show how crowded it is.

<!-- Add a screenshot or GIF of the map here, e.g. ![Chandler density relief](docs/preview.gif) -->

---

## What's on the screen

### The map
| Element | What it shows |
|---|---|
| **color bands** | 25 steps on a school-atlas scale: blues where few people live, then greens, yellow, orange and red, with white for the most crowded places |
| **Relief shading** | Hillshade lit from the upper left, with shadows cast by the high ground |
| **Contour lines** | One on every band edge: white on the side facing the light, dark on the other, so each step looks embossed |
| **City outline** | Chandler's city limits with county islands filled in, softened corners and a soft drop shadow |
| **Freeways** | Loop 202, Loop 101 and I-10 with their ramps, as see-through white bands cropped to the city |
| **Airfields** | Chandler Municipal Airport and Stellar Airpark in their real shape: runways, taxiways and aprons |
| **Place names** | Downtown, Chandler Fashion Center, West Chandler, Ocotillo, Chandler Airport, Southeast Chandler |
| **North symbol** | Top right |
| **Locator** | Bottom right: Maricopa County with Chandler filled in and Phoenix marked |
| **Scale bar and credit** | Bottom right, next to map |

### The story panel
| Element | What it shows |
|---|---|
| **Year and population** | The year on screen and Chandler's population that year (Census count or estimate) |
| **Chapter** | One of five decades of Chandler's story, with a short description; the current decade glows softly |
| **Chapter list** | All five decades; the glow hands over smoothly from one row to the next as the years pass |
| **Residents chart** | Population from 1970 to 2026, filled in up to the year on screen |
| **Legend** | The color scale, where ×1 is Chandler's 2020 average density (about 4,000 people per square mile) |

### Hover
Point at any subdivision to outline it and see its name, the years most of its homes were built, the number of homes, roughly how many people lived there when it was built, and Chandler's population that year. The label sits beside the subdivision, never on top of it.

### Playback
Years blend into one another: the terrain morphs between yearly grids rather than stepping. The last year holds for a moment, then melts back into 1970 before the loop restarts.

---

## Controls

| Key or button | Action |
|---|---|
| **Space** / Play | Play or pause |
| **← →** | Step one year |
| **1–5** | Jump to a chapter |
| **F** / Full screen | Full screen |
| **H** | Hide the control bar (or open the page with `#kiosk` on the end of the address) |
| Speed menu | 0.5× to 4× |
| Names | Turn place names on or off |
| colors | Switch to a color scale for red-green color blindness |

The control bar fades away after a few seconds without mouse movement during playback.

---

## Repository layout

```
ChandlerDensity/              the web app
  index.html                  page, renderer and player (no libraries, no build step)
  data/density-data.js        made by the pipeline; holds every year's density grid and overlays
pipeline/                     ArcGIS Pro (ArcPy) scripts that make the data
  build_chandler_parcels.py   step 1: Chandler parcels with year built
  build_density_frames.py     step 2: yearly density grids, overlays and subdivisions
  update_airfield.py          optional: refresh only the airfield shapes in an existing data file
```

---

## How the data is made

### Step 1: parcels (`build_chandler_parcels.py`)
Selects every Maricopa County Assessor parcel **inside Chandler's city limits or a Chandler county island**, built from 1970 on. Parcels are chosen by location, not by the Assessor's jurisdiction field or mailing address, so county islands leave no holes. The output is a file geodatabase of parcels, city limits and county islands, plus a summary report.

### Step 2: density frames (`build_density_frames.py`)
1. **Homes:** each residential parcel counts as homes in place from its year built.
2. **Grid:** for each year, the homes standing by then are placed on a 100 m grid and smoothed with a 450 m Gaussian kernel.
3. **Population:** each year is scaled to the official city population from the Census Bureau's decennial counts and annual estimates. Homes in county islands are added at the same people-per-home rate.
4. **2026:** there is no official figure yet, so 2026 is extended from 2025 in step with new housing.
5. **Overlays:** downloads freeways and ramps (ADOT), airfield shapes, and subdivision outlines (City of Chandler), and works out each subdivision's build years and residents.
6. **Output:** writes everything to `ChandlerDensity/data/density-data.js`.

### In the browser
The page corrects the smoothing at the city edge, smooths the grid a little more, then draws every frame live: color bands, hillshade, cast shadows, contours, overlays and labels. Between years, the terrain is interpolated along a smooth curve through the neighbouring years, so growth flows evenly instead of pausing at each year.

---

## Running it yourself

**You need:** ArcGIS Pro (its Python includes `arcpy`, `numpy`, `scipy`, `matplotlib` and `requests`) and internet access for the public GIS services.

1. **Build the parcels.** Open **Start → ArcGIS → Python Command Prompt** and run:
   ```
   cd /d C:\GIS\GISDay2026\pipeline
   python build_chandler_parcels.py
   ```
2. **Build the frames.** Check the paths at the top of `build_density_frames.py` (`CITY_BOUNDARY`, `PARCELS`, `OUT_JS`), then run:
   ```
   python build_density_frames.py
   ```
   Progress is also written to `build_density_frames_log.txt`.
3. **Open the map.** Open `ChandlerDensity/index.html` in Chrome, Edge or Firefox.

To run a script from the ArcGIS Pro **Python window** instead:
```python
exec(open(r"C:\GIS\GISDay2026\pipeline\build_density_frames.py", encoding="utf-8").read(), {"__name__": "__main__"})
```

If the airfield download times out (the public OpenStreetMap servers are sometimes busy), run `update_airfield.py` the same way later. It takes about a minute and only updates the airfield in the existing data file.

---

## Settings to change

### In `index.html`
| Setting | What it does |
|---|---|
| `SEC_PER_YEAR` | Seconds per year during playback |
| `END_HOLD` | Seconds the final year holds before the loop restarts |
| `LOOP_FADE` | Seconds the final year takes to melt back into 1970 |
| `WHITE_AT` | Where white (most crowded) starts, as a multiple of the 2020 average, or `'auto'` |
| `SMOOTH` | Extra smoothing of the color bands, in grid cells |
| `RASTER_MAX_PX` | Size of the relief image in pixels: higher is crisper, lower is faster |
| `BOUNDARY_ROUND` | Corner rounding of the city outline (0 = sharp) |
| `LABEL_TEXT` | Place-name wording; use `|` for a line break, e.g. `'Chandler|Fashion Center'` |
| `SHOW_OVERLAYS`, `OVERLAY_OPACITY` | Freeway and airfield layer and its transparency |
| `AIRFIELD_WIDEN` | How much wider than real life runways and taxiways are drawn |
| `MAP_SHIFT_X` | Nudges the map left (negative) or right; it never slides under the panel |
| `CREDIT_LINES` | Credit text in the bottom-right corner |
| `SHOW_LOCATOR`, `SHOW_NORTH` | Locator map and north symbol |
| `--panel-w` (CSS) | Width of the story panel |
| `--glow-in`, `--glow-out` (CSS) | Strength of the glow on the current decade |

### In `build_density_frames.py`
| Setting | What it does |
|---|---|
| `YEAR_START`, `YEAR_END` | Year range |
| `CELL_M`, `BANDWIDTH_M` | Grid size and smoothing (100 m and 450 m) |
| `CENSUS_POP` | Official population by year; add 2026 once it is published |
| `CHAPTERS`, `LABELS` | Story text and place names |
| `CITY_PARCELS_ONLY` | `False` (default) includes county-island residents |
| `AIRFIELD_FC` | Your own airfield pavement polygons; otherwise OpenStreetMap is used |

---

## Hosting

The app is static files, so any web server works:

- **GitHub Pages:** enable Pages for this repository and open `/ChandlerDensity/`.
- **ArcGIS Enterprise:** copy `ChandlerDensity/` to the web server behind the Web Adaptor.
- **Experience Builder or ArcGIS StoryMaps:** host it first, then embed the URL.
- **Offline:** open `index.html` straight from a folder or USB drive.

For a presentation, open the page full screen in Chrome or Edge with `#kiosk` on the end of the address to hide the controls.

---

## Data sources

- **Population:** U.S. Census Bureau decennial census (1970–2020) and Population Estimates Program (Vintage 2025).
- **Parcels and year built:** Maricopa County Assessor.
- **City limits, county islands, subdivisions:** City of Chandler GIS.
- **Freeways and ramps:** Arizona Department of Transportation, ATIS Roads (via AZGEO).
- **Airfields:** © OpenStreetMap contributors (ODbL), with the Federal Aviation Administration runway layer as a fallback.
- **Locator:** U.S. Census Bureau TIGERweb (Maricopa County and Chandler extent).

## Method notes and limits

- **Demolished homes:** year built only covers homes still standing, so homes since demolished are missing from early years. The Census scaling spreads that population over the homes that survived.
- **Boundaries:** every year uses today's city limits, so some land shown in early years was still unincorporated.
- **County islands:** island residents are estimated from housing and added on top of the Census counts, so the population on screen runs slightly above the official city figure, and no year is labelled as an exact Census count.
- **2025–2026:** the Census Bureau's 2025 estimate is slightly lower than 2024's, so the map dips a little at the end. 2026 is a partial year and an estimate.
- **Hover figures:** "Residents when built" is approximate: homes × Chandler's average people per home that year.

---

*Will Surkan · [github.com/a-bowlofsoup](https://github.com/a-bowlofsoup) · City of Chandler GIS Day 2026*
