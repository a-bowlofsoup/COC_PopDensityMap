# Chandler Density Relief (GIS Day 2026 entry)

An animated relief map of Chandler's population density, 1970 to 2025. It plays on a loop, full screen, and runs offline.

```
ChandlerDensity/        the web app. Open index.html in Chrome, Edge or Firefox.
  index.html
  app.js                renderer + player (no libraries)
  demo.js               simulated pattern, used only when data/density-data.js is missing
  data/                 build_density_frames.py writes density-data.js here
pipeline/
  build_density_frames.py   ArcPy script: parcels + Census totals -> annual density frames
```

## 1. Get the data: `pipeline/build_chandler_parcels.py`

This script downloads and builds the parcel set in one run. It needs ArcGIS Pro's Python and internet access, and takes about 5–15 minutes.

```
"C:\Program Files\ArcGIS\Pro\bin\Python\scripts\propy.bat" build_chandler_parcels.py
```

It selects parcels by **location**: (Chandler city limits OR Chandler county islands) AND 1970 ≤ construction year ≤ latest year in the data. The Assessor JURISDICTION field and mailing address are not used to select. They are kept as attributes.

| Piece | Source |
|---|---|
| City limits | Chandler GIS, Cadastral MapServer/10 "Chandler Jurisdiction Boundary" (65.8 sq mi) |
| County islands | Chandler GIS, Cadastral MapServer/15 "County Island" (60 polygons, all MUNICIPALITY = COUNTY) |
| Parcels + attributes | Maricopa County Assessor, Parcels MapServer/0 (APN, CONST_YEAR, address, PUC, JURISDICTION, values, …) |
| Cross-check only | Chandler GIS, planning FeatureServer/4 "City Boundary", which is really the Municipal Planning Area (71.4 sq mi, larger than the city) |

It writes to `C:\GIS\GISDay2026\` (change `OUT_FOLDER` at the top of the script):

- `ChandlerParcels.gdb\Chandler_Parcels_1970_<latest>` is the dataset. It has every Assessor field plus:
  - `YEAR_BUILT`: an integer copy of CONST_YEAR, which the Assessor stores as text
  - `AREA_SOURCE`: CITY or COUNTY_ISLAND
  - `IN_PLANNING_AREA`
- `ChandlerParcels.gdb\Chandler_Footprint`, `Chandler_City_Limits` and `Chandler_County_Islands`
- `Chandler_Parcels_1970_<latest>.csv`: the same records without geometry
- `..._summary.txt`: counts, including parcels with no construction year, the AREA_SOURCE × JURISDICTION crosstab (this shows the county-labelled parcels inside the footprint), and a count per year

Selection details:

- A parcel is in the footprint when its inside point (`labelPoint`) falls inside. This avoids picking up slivers of neighbouring Gilbert, Tempe or Mesa parcels along the edges.
- An island is used only if it touches Chandler's limits, within 100 ft.
- "Latest" is the newest construction year actually present, not the calendar year. Values above next year are treated as typos and dropped.

Optional: 2020 Census blocks (TIGER/Line joined to P1/H1) give local persons-per-unit in the density step.

## 2. Build the frames (ArcGIS Pro)

1. Open `pipeline/build_density_frames.py` and edit the CONFIG block: paths, `FIELD_YEAR_BUILT`, `FIELD_UNITS`, `RESIDENTIAL_WHERE`.
2. Run it from the ArcGIS Pro Python window, a Pro notebook, or `propy.bat build_density_frames.py`.
   It needs only `arcpy`, `numpy`, `scipy` and `matplotlib`, which all ship with Pro. It does not need a Spatial Analyst licence.
3. It prints one line per year (parcel count, population, peak density) and writes `ChandlerDensity/data/density-data.js`.
4. Open `ChandlerDensity/index.html`. The "Demo pattern" tag is gone once real data loads.

Settings to try:

- `BANDWIDTH_M`: 450 m gives soft hills like the reference map. 300 m shows neighborhood detail. 700 m gives broad regional hills.
- `CELL_M`: 100 m is a good default. 75 m is sharper, with a bigger file.
- `WRITE_GEOTIFFS = True` also writes one GeoTIFF per year. Use them to build a time-enabled imagery layer in Pro, AGOL or Enterprise, so the same frames can go into a story map or Experience Builder.
- The `CHAPTERS` and `LABELS` lists set the story text and the map labels.

## 3. Present it

- Press **F** for full screen. **H** hides the control bar, and adding `#kiosk` to the URL does the same. Controls also fade out on their own after 3.5 s of no mouse movement.
- **Space** plays or pauses. **← / →** step one year. **1–5** jump to a chapter. The speed menu sets 0.5× to 4×.
- One loop takes about 50 s at 1×, and the map holds on 2025 for 4 s before it restarts.
- The layout switches to stacked on portrait screens and phones.

## 4. Host it (optional)

It is a static folder, so any web server works:

- **ArcGIS Enterprise:** copy `ChandlerDensity/` to the web server behind your Web Adaptor, for example IIS `C:\inetpub\wwwroot\gisday\`.
- **GitHub Pages or any static host:** upload the folder.
- **Experience Builder or a StoryMap:** host the folder first, then embed its URL with the Embed widget or block.

## Method notes for the entry form

- **Map type.** This is a density relief (isopleth) map. A cartogram distorts area, and this map does not.
- **Totals.** Each year's total is scaled to the official city population. Census years (1970–2020) are April 1 counts. 2024–2025 are Census Bureau PEP estimates, and the years in between are interpolated.
- **Pattern.** Where people live comes from residential parcels by year built. Homes that were torn down are missing from early years.
- **Boundary.** The map uses today's city limits for every year. Before the city annexed them, some areas counted here were unincorporated county land.
- **Colors.** 1.0 is Chandler's 2020 average density, about 4,276 people per square mile.
