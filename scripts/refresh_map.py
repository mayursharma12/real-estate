#!/usr/bin/env python3
"""Download simplified Census county and river geometry for the regional map."""
import json
from pathlib import Path
from urllib.parse import urlencode

from refresh_data import download

ROOT = Path(__file__).resolve().parents[1]
TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb"
COUNTIES = ("39017", "39025", "39061", "39165", "21015", "21037", "21117", "18029", "18115")

def query(layer, **fields):
    params = {"f": "json", "outSR": 4326, "maxAllowableOffset": ".0007", "geometryPrecision": "5", **fields}
    result = json.loads(download(f"{TIGER}/{layer}/query?{urlencode(params)}"))
    if "error" in result or result.get("exceededTransferLimit"):
        raise RuntimeError(result)
    return result["features"]

def main():
    shapes = query("State_County/MapServer/1", where="GEOID IN (" + ",".join(map(repr, COUNTIES)) + ")",
                   outFields="STATE", returnGeometry="true")
    waterways = query("Hydro/MapServer/1", where="MTFCC = 'H3010' AND BASENAME IN ('Ohio','Great Miami','Little Miami','Licking')",
                      geometry="-85.08,38.72,-83.96,39.64", geometryType="esriGeometryEnvelope",
                      inSR=4326, maxAllowableOffset=".00015", outFields="NAME", returnGeometry="true")
    data = {
        "counties": [{"state": feature["attributes"]["STATE"], "rings": feature["geometry"]["rings"]} for feature in shapes],
        "river": [path for feature in waterways for path in feature["geometry"]["rings"]],
    }
    if len(data["counties"]) != len(COUNTIES) or not data["river"]:
        raise ValueError(f"Census geometry is incomplete ({len(shapes)} counties, {len(waterways)} waterways).")
    (ROOT / "docs" / "map-data.js").write_text("window.housingMap = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"Loaded {len(data['counties'])} county outlines and {len(data['river'])} river rings.")

if __name__ == "__main__":
    main()
