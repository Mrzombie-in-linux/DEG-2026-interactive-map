#!/usr/bin/env python3
"""Generate all data files for the interactive map app from the raw source archive.

Reads the immutable raw ZIP in ``datasets/`` (elections.csv, ballots.csv, votes.csv,
voter_list_events.csv) plus ``src/map.html`` and writes three derived JSON files
into ``src/`` for the browser UI:

- ``src/feddeg_dashboard.json`` — time series and per-region/per-district stats
- ``src/election-data.json``   — per-region summary for hover tooltips
- ``src/region-details.json``  — cultural info (peoples, languages, links, gallery)

Usage (from the repo root):

    python setup.py
    python setup.py --archive datasets/edg2026.zip
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import zipfile
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

MSK = timezone(timedelta(hours=3))
BUCKET_MINUTES = 5
UNKNOWN_REGION = "Регион не указан"
UNKNOWN_DISTRICT = "Округ не указан"
ALL_ID = "all"
EPOCH = datetime(1970, 1, 1)
EPOCH_TS = pd.Timestamp("1970-01-01")

# Russian region name -> slug id used by the map front-end (map-data.js).
REGION_NAME_TO_ID = {
    "Республика Алтай": "altai-republic",
    "Алтайский край": "altai-krai",
    "Республика Адыгея": "adygeya",
    "Амурская область": "amur-oblast",
    "Архангельская область": "arkhangelsk",
    "Астраханская область": "astrakhan",
    "Республика Башкортостан": "bashkortostan",
    "Белгородская область": "belgorod",
    "Брянская область": "bryansk",
    "Республика Бурятия": "buryatia",
    "Чеченская Республика": "chechnya",
    "Челябинская область": "chelyabinsk",
    "Чукотский автономный округ": "chukotka",
    "Республика Крым": "crimea",
    "Чувашская Республика": "chuvash",
    "Чувашская Республика - Чувашия": "chuvash",
    "Республика Дагестан": "dagestan",
    "Донецкая Народная Республика": "donetsk",
    "Республика Ингушетия": "ingushetia",
    "Иркутская область": "irkutsk",
    "Ивановская область": "ivanovo",
    "Камчатский край": "kamchatka",
    "Кабардино-Балкарская Республика": "kabardino-balkaria",
    "Карачаево-Черкесская Республика": "karachay-cherkessia",
    "Краснодарский край": "krasnodar",
    "Кемеровская область": "kemerovo",
    "Калининградская область": "kaliningrad",
    "Курганская область": "kurgan",
    "Хабаровский край": "khabarovsk",
    "Ханты-Мансийский автономный округ — Югра": "khanty-mansiysk",
    "Кировская область": "kirov",
    "Республика Хакасия": "khakassia",
    "Республика Калмыкия": "kalmykia",
    "Калужская область": "kaluga",
    "Республика Коми": "komi",
    "Костромская область": "kostroma",
    "Республика Карелия": "karelia",
    "Курская область": "kursk",
    "Красноярский край": "krasnoyarsk",
    "Ленинградская область": "leningrad-oblast",
    "Липецкая область": "lipetsk",
    "Луганская Народная Республика": "lugansk",
    "Магаданская область": "magadan",
    "Республика Марий Эл": "mari-el",
    "Республика Мордовия": "mordovia",
    "Московская область": "moscow-oblast",
    "Москва": "moscow-city",
    "Мурманская область": "murmansk",
    "Ненецкий автономный округ": "nenets",
    "Новгородская область": "novgorod",
    "Нижегородская область": "nizhny-novgorod",
    "Новосибирская область": "novosibirsk",
    "Омская область": "omsk",
    "Оренбургская область": "orenburg",
    "Орловская область": "orlovskaya",
    "Пермский край": "perm-krai",
    "Пензенская область": "penza",
    "Приморский край": "primorsky",
    "Псковская область": "pskov",
    "Ростовская область": "rostov",
    "Рязанская область": "ryazan",
    "Республика Саха (Якутия)": "sakha",
    "Сахалинская область": "sakhalin",
    "Самарская область": "samara",
    "Саратовская область": "saratov",
    "Республика Северная Осетия — Алания": "north-ossetia",
    "Севастополь": "sevastopol",
    "Смоленская область": "smolensk",
    "Санкт-Петербург": "st-petersburg",
    "Ставропольский край": "stavropol",
    "Свердловская область": "sverdlovsk",
    "Республика Татарстан": "tatarstan",
    "Тамбовская область": "tambov",
    "Томская область": "tomsk",
    "Тульская область": "tula",
    "Тверская область": "tver",
    "Республика Тыва": "tuva",
    "Тюменская область": "tyumen",
    "Удмуртская Республика": "udmurt",
    "Ульяновская область": "ulyanovsk",
    "Волгоградская область": "volgograd",
    "Владимирская область": "vladimir",
    "Вологодская область": "vologda",
    "Воронежская область": "voronezh",
    "Ямало-Ненецкий автономный округ": "yamalo-nenets",
    "Ярославская область": "yaroslavl",
    "Еврейская автономная область": "jewish-ao",
    "Забайкальский край": "zabaykalsky",
    "Херсонская область": "kherson",
    "Запорожская область": "zaporozhye",
}


@dataclass
class GroupStats:
    id: str
    name: str
    voters: int = 0
    ballots: int = 0
    votes: int = 0
    removed_voters: int = 0
    contracts: set[str] = field(default_factory=set)
    uiks: int = 0
    district_ids: set[str] = field(default_factory=set)
    election_names: set[str] = field(default_factory=set)


def read_csv_from_zip(archive: zipfile.ZipFile, name: str) -> Iterator[dict[str, str]]:
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)


def read_rows_from_zip(archive: zipfile.ZipFile, name: str) -> Iterator[tuple[dict[str, int], list[str]]]:
    """Yield (column_index, row) pairs using the faster list-based csv.reader."""
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        reader = csv.reader(text)
        header = next(reader)
        col = {field: index for index, field in enumerate(header)}
        for row in reader:
            yield col, row


def clean_text(value: str | None, fallback: str) -> str:
    value = (value or "").strip()
    return value if value else fallback


def parse_int(value: str | None) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return 0


def natural_key(value: str) -> list[int | str]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def bucket_from_timestamp(value: str) -> int:
    year, month, day = int(value[0:4]), int(value[5:7]), int(value[8:10])
    hour, minute = int(value[11:13]), int(value[14:16])
    bucket_minute = (minute // BUCKET_MINUTES) * BUCKET_MINUTES
    dt = datetime(year, month, day, hour, bucket_minute)
    return int((dt - EPOCH).total_seconds() // 60)


def label_from_bucket(bucket: int) -> str:
    return (EPOCH + timedelta(minutes=bucket)).strftime("%Y-%m-%d %H:%M")


def make_series(increments, group_id: str, min_bucket: int, max_bucket: int) -> list[list[int]]:
    points = []
    running_ballots = 0
    running_votes = 0
    for bucket in sorted(increments.get(group_id, {})):
        ballot_inc, vote_inc = increments[group_id][bucket]
        running_ballots += ballot_inc
        running_votes += vote_inc
        points.append([bucket - min_bucket, running_ballots, running_votes])

    span = max(max_bucket - min_bucket, 1)
    if not points:
        return [[0, 0, 0], [span, 0, 0]]
    if points[0][0] > 0:
        points.insert(0, [0, 0, 0])
    if points[-1][0] < span:
        points.append([span, running_ballots, running_votes])
    return points


def make_removed_series(removed_increments, group_id: str, min_bucket: int, max_bucket: int) -> list[list[int]]:
    points = []
    running = 0
    for bucket in sorted(removed_increments.get(group_id, {})):
        running += removed_increments[group_id][bucket]
        points.append([bucket - min_bucket, running])

    span = max(max_bucket - min_bucket, 1)
    if not points:
        return [[0, 0], [span, 0]]
    if points[0][0] > 0:
        points.insert(0, [0, 0])
    if points[-1][0] < span:
        points.append([span, running])
    return points


def compact_stats(group: GroupStats) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "voters": group.voters,
        "ballots": group.ballots,
        "votes": group.votes,
        "removed_voters": group.removed_voters,
        "contracts": len(group.contracts),
        "uiks": group.uiks,
    }


def build_dashboard(archive_path: Path) -> dict:
    contract_region: dict[str, str] = {}
    contract_district: dict[str, str] = {}
    contract_election: dict[str, str] = {}
    region_names: set[str] = set()
    district_keys: set[tuple[str, str]] = set()

    with zipfile.ZipFile(archive_path) as archive:
        for row in read_csv_from_zip(archive, "elections.csv"):
            contract_id = row["contract_id"]
            region = clean_text(row.get("region"), UNKNOWN_REGION)
            district = clean_text(row.get("district"), UNKNOWN_DISTRICT)
            election = clean_text(row.get("election"), "")
            contract_region[contract_id] = region
            contract_district[contract_id] = district
            contract_election[contract_id] = election
            region_names.add(region)
            district_keys.add((region, district))

    if UNKNOWN_REGION not in region_names:
        region_names.add(UNKNOWN_REGION)
    if (UNKNOWN_REGION, UNKNOWN_DISTRICT) not in district_keys:
        district_keys.add((UNKNOWN_REGION, UNKNOWN_DISTRICT))

    # slug id per region (fallback: normalized transliteration is not attempted;
    # unmapped regions keep a generated slug so they still appear in data).
    def region_slug(name):
        return REGION_NAME_TO_ID.get(name, "region-" + re.sub(r"\W+", "-", name.casefold()))

    district_id_by_key = {
        key: f"d{index}"
        for index, key in enumerate(sorted(district_keys, key=lambda item: natural_key(" ".join(item))))
    }
    unknown_district_id = district_id_by_key[(UNKNOWN_REGION, UNKNOWN_DISTRICT)]

    regions: dict[str, GroupStats] = {}
    for name in region_names:
        regions[region_slug(name)] = GroupStats(region_slug(name), name)
    unknown_region_id = region_slug(UNKNOWN_REGION)

    districts: dict[str, GroupStats] = {}
    district_region: dict[str, str] = {}
    for (region, district), district_id in district_id_by_key.items():
        rid = region_slug(region)
        districts[district_id] = GroupStats(district_id, district)
        district_region[district_id] = rid
        regions[rid].district_ids.add(district_id)

    contract_to_region_id: dict[str, str] = {}
    contract_to_district_id: dict[str, str] = {}
    for contract_id, region in contract_region.items():
        district = contract_district[contract_id]
        rid = region_slug(region)
        did = district_id_by_key.get((region, district), unknown_district_id)
        contract_to_region_id[contract_id] = rid
        contract_to_district_id[contract_id] = did
        regions[rid].contracts.add(contract_id)
        districts[did].contracts.add(contract_id)
        election = contract_election.get(contract_id, "")
        if election:
            districts[did].election_names.add(election)

    increments: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    removed_increments: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    min_bucket = None
    max_bucket = None
    all_stats = GroupStats(ALL_ID, "Все регионы")
    unknown_event_contracts: set[str] = set()

    def touch_bucket(bucket):
        nonlocal min_bucket, max_bucket
        min_bucket = bucket if min_bucket is None else min(min_bucket, bucket)
        max_bucket = bucket if max_bucket is None else max(max_bucket, bucket)

    def ids_for_contract(contract_id):
        if contract_id not in contract_to_region_id:
            unknown_event_contracts.add(contract_id)
        return (
            contract_to_region_id.get(contract_id, unknown_region_id),
            contract_to_district_id.get(contract_id, unknown_district_id),
        )

    contract_voter_totals: dict[str, dict] = defaultdict(
        lambda: {"initial": 0, "added": 0, "removed": 0, "uiks": set()}
    )

    with zipfile.ZipFile(archive_path) as archive:
        for col, row in read_rows_from_zip(archive, "voter_list_events.csv"):
            contract_id = row[col["contract_id"]]
            event_type = clean_text(row[col["type"]], "").casefold()
            count = parse_int(row[col["count"]])
            uik = clean_text(row[col["uik"]], "")
            agg = contract_voter_totals[contract_id]
            if uik:
                agg["uiks"].add(uik)
            if event_type == "initial":
                agg["initial"] += count
            elif event_type == "add":
                agg["added"] += count
            elif event_type == "remove":
                agg["removed"] += count

            if event_type == "remove" and count:
                rid, did = ids_for_contract(contract_id)
                bucket = bucket_from_timestamp(row[col["timestamp"]])
                touch_bucket(bucket)
                for gid in (ALL_ID, rid, did):
                    removed_increments[gid][bucket] += count

        # ballots.csv and votes.csv are large (12M+ rows each): read with pandas.
        def read_events(name):
            df = pd.read_csv(
                archive.open(name),
                usecols=["contract_id", "timestamp"],
                dtype={"contract_id": str},
                parse_dates=["timestamp"],
                encoding="utf-8-sig",
            )
            df["bucket"] = (
                (df["timestamp"].dt.floor(f"{BUCKET_MINUTES}min") - EPOCH_TS).dt.total_seconds()
            ).astype("int64") // 60
            df["region_id"] = df["contract_id"].map(contract_to_region_id).fillna(unknown_region_id)
            df["district_id"] = df["contract_id"].map(contract_to_district_id).fillna(unknown_district_id)
            return df

        df_ballots = read_events("ballots.csv")
        df_votes = read_events("votes.csv")

        all_stats.ballots = int(len(df_ballots))
        all_stats.votes = int(len(df_votes))

        for rid, b in df_ballots.groupby("region_id").size().items():
            regions[rid].ballots = int(b)
        for did, b in df_ballots.groupby("district_id").size().items():
            districts[did].ballots = int(b)
        for rid, v in df_votes.groupby("region_id").size().items():
            regions[rid].votes = int(v)
        for did, v in df_votes.groupby("district_id").size().items():
            districts[did].votes = int(v)

        ballot_inc = df_ballots.groupby(["region_id", "district_id", "bucket"]).size()
        vote_inc = df_votes.groupby(["region_id", "district_id", "bucket"]).size()
        for (rid, did, bucket), b in ballot_inc.items():
            key = int(bucket)
            increments[did][key][0] += int(b)
            increments[rid][key][0] += int(b)
            increments[ALL_ID][key][0] += int(b)
        for (rid, did, bucket), v in vote_inc.items():
            key = int(bucket)
            increments[did][key][1] += int(v)
            increments[rid][key][1] += int(v)
            increments[ALL_ID][key][1] += int(v)

        for df in (df_ballots, df_votes):
            if len(df):
                touch_bucket(int(df["bucket"].min()))
                touch_bucket(int(df["bucket"].max()))

        known_contracts = set(contract_to_region_id)
        all_contracts = set(df_ballots["contract_id"].unique()) | set(df_votes["contract_id"].unique())
        for c in all_contracts - known_contracts:
            unknown_event_contracts.add(str(c))

    for contract_id, agg in contract_voter_totals.items():
        rid, did = ids_for_contract(contract_id)
        removed = agg["removed"]
        voters = agg["initial"] + agg["added"] - removed
        uiks = len(agg["uiks"])
        all_stats.voters += voters
        all_stats.removed_voters += removed
        all_stats.uiks += uiks
        regions[rid].voters += voters
        regions[rid].removed_voters += removed
        regions[rid].uiks += uiks
        districts[did].voters += voters
        districts[did].removed_voters += removed
        districts[did].uiks += uiks

    if min_bucket is None or max_bucket is None:
        min_bucket = max_bucket = int((datetime.now(MSK).replace(tzinfo=None) - EPOCH).total_seconds() // 60)

    all_stats.contracts = set(contract_to_region_id)
    active_region_ids = {
        r.id for r in regions.values() if r.contracts or r.voters or r.ballots or r.votes
    }
    active_district_ids = {
        d.id for d in districts.values() if d.contracts or d.voters or d.ballots or d.votes
    }

    regions_payload = []
    for region in regions.values():
        if region.id not in active_region_ids:
            continue
        item = compact_stats(region)
        item["districtIds"] = sorted(
            [did for did in region.district_ids if did in active_district_ids],
            key=lambda did: natural_key(districts[did].name),
        )
        item["series"] = make_series(increments, region.id, min_bucket, max_bucket)
        item["removedSeries"] = make_removed_series(removed_increments, region.id, min_bucket, max_bucket)
        regions_payload.append(item)

    districts_payload = []
    for district in districts.values():
        if district.id not in active_district_ids:
            continue
        item = compact_stats(district)
        item["regionId"] = district_region[district.id]
        item["series"] = make_series(increments, district.id, min_bucket, max_bucket)
        item["removedSeries"] = make_removed_series(removed_increments, district.id, min_bucket, max_bucket)
        item["elections"] = sorted(district.election_names, key=natural_key)[:3]
        districts_payload.append(item)

    regions_payload.sort(key=lambda item: (-item["votes"], -item["ballots"], natural_key(item["name"])))
    districts_payload.sort(
        key=lambda item: (item["name"] == UNKNOWN_DISTRICT, -item["votes"], -item["ballots"], natural_key(item["name"]))
    )

    return {
        "generatedAt": datetime.now(MSK).strftime("%Y-%m-%d %H:%M:%S %z"),
        "sourceArchive": str(archive_path.as_posix()),
        "timezone": "Europe/Moscow (GMT+3)",
        "bucketMinutes": BUCKET_MINUTES,
        "timeline": {
            "start": label_from_bucket(min_bucket),
            "end": label_from_bucket(max_bucket),
            "spanMinutes": max(max_bucket - min_bucket, 1),
        },
        "totals": {
            **compact_stats(all_stats),
            "regions": len(active_region_ids),
            "districts": len(active_district_ids),
        },
        "series": make_series(increments, ALL_ID, min_bucket, max_bucket),
        "removedSeries": make_removed_series(removed_increments, ALL_ID, min_bucket, max_bucket),
        "regions": regions_payload,
        "districts": districts_payload,
        "anomalies": [
            f"События без строки в elections.csv: {len(unknown_event_contracts)}"
        ] if unknown_event_contracts else [],
    }


def build_election_data(dashboard: dict) -> dict:
    result = {}
    for region in dashboard["regions"]:
        if region["id"] == ALL_ID:
            continue
        voters = region["voters"]
        ballots = region["ballots"]
        votes = region["votes"]
        removed = region["removed_voters"]
        result[region["id"]] = {
            "region": region["name"],
            "ballotsIssued": ballots,
            "votes": votes,
            "voters": voters,
            "removedVoters": removed,
            "turnout": f"{(votes / voters * 100):.2f}" if voters else "0.00",
            "invalidBallots": max(0, ballots - votes),
            "validBallots": votes,
            "districts": len(region["districtIds"]),
        }
    return result


def extract_region_details(map_html_path: Path) -> dict:
    html = Path(map_html_path).read_text(encoding="utf-8")
    details = {}

    blocks = re.split(r'<div id="(RU-[A-Z]+)" class="district-text">', html)
    for i in range(1, len(blocks), 2):
        code = blocks[i]
        block = blocks[i + 1]
        # cut at the closing </table> to avoid bleeding into the next region
        block = block.split("</table>")[0]

        peoples = re.search(r"Народы, которые проживают на территории субъекта:\s*([^<]*)", block)
        languages = re.search(r"Используемые языки народов:\s*([^<]*)", block)
        education = re.search(r"Язык\(и\), которые изучаются в системе общего образования:\s*([^<]*)", block)

        links = []
        for m in re.finditer(r'<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<u>([^<]+)</u>', block):
            links.append({"url": m.group(1).strip(), "text": m.group(2).strip()})

        gallery = [m.strip() for m in re.findall(r'src="([^"]*' + re.escape(code) + r'-\d+\.jpg)"', block)]

        flag = None
        coat_of_arms = None
        fm = re.search(r'src="([^"]*' + re.escape(code) + r'\.png)"', block)
        if fm:
            flag = fm.group(1).strip()
        cm = re.search(r'src="([^"]*' + re.escape(code) + r'\(1\)\.png)"', block)
        if cm:
            coat_of_arms = cm.group(1).strip()

        details[code.replace("RU-", "")] = {
            "flag": flag,
            "coat_of_arms": coat_of_arms,
            "peoples": peoples.group(1).strip() if peoples else "",
            "languages": languages.group(1).strip() if languages else "",
            "education_languages": education.group(1).strip() if education else "",
            "links": links,
            "gallery": gallery,
        }

    return details


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=None, help="source ZIP archive")
    parser.add_argument("--data-dir", type=Path, default=Path("datasets"), help="directory with source ZIP archives")
    parser.add_argument("--map-html", type=Path, default=Path("src/map.html"), help="source map.html")
    parser.add_argument("--out-dir", type=Path, default=Path("src"), help="directory to write generated JSON")
    args = parser.parse_args()

    archive_path = args.archive
    if archive_path is None:
        candidates = sorted(args.data_dir.glob("*.zip"), key=lambda p: p.name)
        if not candidates:
            raise FileNotFoundError(f"no ZIP archives found in {args.data_dir}")
        archive_path = candidates[-1]

    dashboard = build_dashboard(archive_path)
    election_data = build_election_data(dashboard)
    region_details = extract_region_details(args.map_html)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "feddeg_dashboard.json").write_text(
        json.dumps(dashboard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (args.out_dir / "election-data.json").write_text(
        json.dumps(election_data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (args.out_dir / "region-details.json").write_text(
        json.dumps(region_details, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    t = dashboard["totals"]
    print(f"Источник: {archive_path}")
    print(
        f"Итого: {t['regions']} регионов, {t['districts']} округов, "
        f"{t['votes']:,} голосов".replace(",", " ")
    )
    print(
        f"Списки: {t['voters']:,} избирателей, {t['removed_voters']:,} исключено".replace(",", " ")
    )
    print(f"Регионы на карте: {len(region_details)}")
    print(f"Сводка по регионам: {len(election_data)}")
    if dashboard["anomalies"]:
        print("Аномалии:")
        for anomaly in dashboard["anomalies"]:
            print(f"- {anomaly}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
