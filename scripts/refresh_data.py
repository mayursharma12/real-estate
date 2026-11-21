#!/usr/bin/env python3
"""Build the dashboard's local snapshot from Zillow's public monthly CSVs."""
import argparse
import csv
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ZILLOW = "https://files.zillowstatic.com/research/public_csvs/zhvi/"
CENSUS = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip"
TYPES = {"all": "uc_sfrcondo", "house": "uc_sfr", "condo": "uc_condo"}
COUNTIES = {
    "OH": {"Hamilton County", "Butler County", "Warren County", "Clermont County"},
    "KY": {"Boone County", "Kenton County", "Campbell County"},
}

def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "RiverCity Housing Lab/1.0 (public research datasets)"})
    with urllib.request.urlopen(request, timeout=55) as response:
        return response.read()

def dataset(level, type_code, source):
    filename = f"{level}_zhvi_{type_code}_tier_0.33_0.67_sm_sa_month.csv"
    data = (source / filename).read_bytes() if source else download(ZILLOW + filename)
    return csv.DictReader(io.StringIO(data.decode("utf-8-sig")))

def coordinates(source):
    archive = zipfile.ZipFile(io.BytesIO((source / "2024_Gaz_zcta_national.zip").read_bytes() if source else download(CENSUS)))
    rows = csv.DictReader(io.StringIO(archive.read(archive.namelist()[0]).decode("utf-8-sig")), delimiter="\t")
    for raw in rows:
        row = {key.strip(): value.strip() for key, value in raw.items() if key and value is not None}
        yield row["GEOID"], [round(float(row["INTPTLONG"]), 5), round(float(row["INTPTLAT"]), 5)]

def monthly(row, months):
    return [round(float(row[month])) if row.get(month) else None for month in months]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, help="Use locally downloaded source files")
    args = parser.parse_args()
    coords = dict(coordinates(args.input_dir))
    records = {}
    benchmark = {}
    months = None
    for kind, code in TYPES.items():
        rows = dataset("Zip", code, args.input_dir)
        if months is None:
            months = [key for key in rows.fieldnames if key[:4].isdigit() and key >= "2016-01-01"]
        for row in rows:
            state, county = row["State"], row["CountyName"]
            if row["Metro"] != "Cincinnati, OH-KY-IN" or county not in COUNTIES.get(state, set()):
                continue
            postal = row["RegionName"].zfill(5)
            if kind == "all":
                records[postal] = {
                    "zip": postal, "city": row["City"] or postal, "state": state,
                    "county": county.removesuffix(" County"), "point": coords.get(postal), "values": {},
                }
            if postal in records:
                records[postal]["values"][kind] = monthly(row, months)
        metro = next(row for row in dataset("Metro", code, args.input_dir) if row["RegionName"].startswith("Cincinnati, OH"))
        benchmark[kind] = monthly(metro, months)
    assert len(records) > 50 and all(code in records for code in ("45202", "41011", "41042"))
    end = max(index for index, value in enumerate(benchmark["all"]) if value is not None)
    assert end >= 60 and all(len(values) == len(months) for row in records.values() for values in row["values"].values())
    snapshot = {"months": months, "latest": months[end], "zipcodes": sorted(records.values(), key=lambda r: r["zip"]), "metro": benchmark}
    target = ROOT / "docs" / "market-data.js"
    temp = target.with_suffix(".tmp")
    temp.write_text("window.housingMarket = " + json.dumps(snapshot, separators=(",", ":")) + ";\n")
    temp.replace(target)
    print(f"Updated {len(records)} ZIP codes across {len(months)} months through {months[end]}.")

if __name__ == "__main__":
    main()
