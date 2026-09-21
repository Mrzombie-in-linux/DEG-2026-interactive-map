import csv
import json
import os
from datetime import datetime, timedelta
from collections import defaultdict
import numpy as np

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"
output_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\src"

# Region name to ID mapping
REGION_NAME_TO_ID = {
    "Челябинская область": "chelyabinsk",
    "Ростовская область": "rostov",
    "Свердловская область": "sverdlovsk",
    "Новосибирская область": "novosibirsk",
    "Калининградская область": "kaliningrad",
    "Алтайский край": "altai-krai",
    "Белгородская область": "belgorod",
    "Воронежская область": "voronezh",
    "Краснодарский край": "krasnodar",
    "Кемеровская область": "kemerovo",
    "Красноярский край": "krasnoyarsk",
    "Пермский край": "perm-krai",
    "Приморский край": "primorsky",
    "Ставропольский край": "stavropol",
    "Хабаровский край": "khabarovsk",
    "Иркутская область": "irkutsk",
    "Курганская область": "kurgan",
    "Самарская область": "samara",
    "Саратовская область": "saratov",
    "Тамбовская область": "tambov",
    "Томская область": "tomsk",
    "Тульская область": "tula",
    "Тюменская область": "tyumen",
    "Ульяновская область": "ulyanovsk",
    "Волгоградская область": "volgograd",
    "Ярославская область": "yaroslavl",
    "Республика Адыгея": "adygeya",
    "Республика Башкортостан": "bashkortostan",
    "Республика Бурятия": "buryatia",
    "Республика Дагестан": "dagestan",
    "Республика Ингушетия": "ingushetia",
    "Республика Калмыкия": "kalmykia",
    "Республика Карелия": "karelia",
    "Республика Коми": "komi",
    "Республика Крым": "crimea",
    "Республика Марий Эл": "mari-el",
    "Республика Мордовия": "mordovia",
    "Республика Саха (Якутия)": "sakha",
    "Республика Северная Осетия — Алания": "north-ossetia",
    "Республика Татарстан": "tatarstan",
    "Республика Тыва": "tuva",
    "Удмуртская Республика": "udmurt",
    "Чувашская Республика": "chuvash",
    "Чеченская Республика": "chechnya",
    "Чукотский автономный округ": "chukotka",
    "Ямало-Ненецкий автономный округ": "yamalo-nenets",
    "Ханты-Мансийский автономный округ — Югра": "khanty-mansiysk",
    "Ненецкий автономный округ": "nenets",
    "Еврейская автономная область": "jewish-ao",
    "Забайкальский край": "zabaykalsky",
    "Камчатский край": "kamchatka",
    "Магаданская область": "magadan",
    "Мурманская область": "murmansk",
    "Сахалинская область": "sakhalin",
    "Архангельская область": "arkhangelsk",
    "Астраханская область": "astrakhan",
    "Брянская область": "bryansk",
    "Владимирская область": "vladimir",
    "Вологодская область": "vologda",
    "Ивановская область": "ivanovo",
    "Калининградская область": "kaliningrad",
    "Костромская область": "kostroma",
    "Курская область": "kursk",
    "Ленинградская область": "leningrad-oblast",
    "Липецкая область": "lipetsk",
    "Магаданская область": "magadan",
    "Московская область": "moscow-oblast",
    "Москва": "moscow-city",
    "Нижегородская область": "nizhny-novgorod",
    "Новгородская область": "novgorod",
    "Омская область": "omsk",
    "Оренбургская область": "orenburg",
    "Орловская область": "orlovskaya",
    "Пензенская область": "penza",
    "Псковская область": "pskov",
    "Рязанская область": "ryazan",
    "Смоленская область": "smolensk",
    "Санкт-Петербург": "st-petersburg",
    "Донецкая Народная Республика": "donetsk",
    "Луганская Народная Республика": "lugansk",
    "Запорожская область": "zaporozhye",
    "Херсонская область": "kherson",
    "Севастополь": "sevastopol",
    "Республика Алтай": "altai-republic",
    "Республика Хакасия": "khakassia",
    "Республика Калмыкия": "kalmykia",
}

# Load elections.csv to map contract_id -> region, election name
print("Loading elections.csv...")
contract_to_region = {}
contract_to_election = {}
with open(os.path.join(extract_dir, 'elections.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        cid = row['contract_id']
        region = row['region']
        election = row['election']
        if region:
            contract_to_region[cid] = region
        if election:
            contract_to_election[cid] = election

print(f"Loaded {len(contract_to_region)} contract->region mappings")

# Load ballots.csv with timestamps
print("Loading ballots.csv...")
ballots_by_contract = defaultdict(list)
with open(os.path.join(extract_dir, 'ballots.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        cid = row['contract_id']
        ts = datetime.fromisoformat(row['timestamp'])
        ballots_by_contract[cid].append(ts)

print(f"Loaded ballots for {len(ballots_by_contract)} contracts")

# Load votes.csv with timestamps
print("Loading votes.csv...")
votes_by_contract = defaultdict(list)
with open(os.path.join(extract_dir, 'votes.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        cid = row['contract_id']
        ts = datetime.fromisoformat(row['timestamp'])
        votes_by_contract[cid].append(ts)

print(f"Loaded votes for {len(votes_by_contract)} contracts")

# Load voter_list_events.csv to get initial voters
print("Loading voter_list_events.csv...")
voters_by_contract = defaultdict(int)
with open(os.path.join(extract_dir, 'voter_list_events.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['type'] == 'initial':
            cid = row['contract_id']
            count = int(row['count'])
            voters_by_contract[cid] += count

# Determine global time range
all_timestamps = []
for cid, timestamps in ballots_by_contract.items():
    all_timestamps.extend(timestamps)
for cid, timestamps in votes_by_contract.items():
    all_timestamps.extend(timestamps)

if not all_timestamps:
    print("No timestamps found!")
    exit(1)

t_min = min(all_timestamps)
t_max = max(all_timestamps)
print(f"Time range: {t_min} to {t_max}")

# Use 5-minute buckets like the dashboard
bucket_minutes = 5
start_bucket = t_min.replace(minute=(t_min.minute // bucket_minutes) * bucket_minutes, second=0, microsecond=0)
end_bucket = t_max.replace(minute=(t_max.minute // bucket_minutes + 1) * bucket_minutes, second=0, microsecond=0)

# Generate bucket offsets (minutes from start)
buckets = []
current = start_bucket
while current <= end_bucket:
    buckets.append(current)
    current += timedelta(minutes=bucket_minutes)

num_buckets = len(buckets)
print(f"Number of buckets: {num_buckets}")

# Build series for each contract
print("Building contract series...")
contract_series = {}
for cid, ballot_times in ballots_by_contract.items():
    region_name = contract_to_region.get(cid)
    if not region_name:
        continue
    region_id = REGION_NAME_TO_ID.get(region_name)
    if not region_id:
        continue
    
    vote_times = votes_by_contract.get(cid, [])
    
    # Create cumulative counts per bucket
    ballot_counts = [0] * num_buckets
    vote_counts = [0] * num_buckets
    
    for ts in ballot_times:
        bucket_idx = int((ts - start_bucket).total_seconds() / 60 / bucket_minutes)
        if 0 <= bucket_idx < num_buckets:
            ballot_counts[bucket_idx] += 1
    
    for ts in vote_times:
        bucket_idx = int((ts - start_bucket).total_seconds() / 60 / bucket_minutes)
        if 0 <= bucket_idx < num_buckets:
            vote_counts[bucket_idx] += 1
    
    # Convert to cumulative
    cum_ballots = np.cumsum(ballot_counts).tolist()
    cum_votes = np.cumsum(vote_counts).tolist()
    
    # Create series: [offset_minutes, cum_ballots, cum_votes]
    series = [[i * bucket_minutes, cum_ballots[i], cum_votes[i]] for i in range(num_buckets)]
    contract_series[cid] = {
        'region_id': region_id,
        'region_name': region_name,
        'series': series,
        'total_ballots': cum_ballots[-1],
        'total_votes': cum_votes[-1],
        'voters': voters_by_contract.get(cid, 0)
    }

print(f"Built series for {len(contract_series)} contracts")

# Aggregate by region
print("Aggregating by region...")
region_data = defaultdict(lambda: {'series': None, 'total_ballots': 0, 'total_votes': 0, 'voters': 0, 'contract_ids': []})

for cid, data in contract_series.items():
    rid = data['region_id']
    region_data[rid]['total_ballots'] += data['total_ballots']
    region_data[rid]['total_votes'] += data['total_votes']
    region_data[rid]['voters'] += data['voters']
    region_data[rid]['contract_ids'].append(cid)
    
    # Sum series
    if region_data[rid]['series'] is None:
        region_data[rid]['series'] = [[i * bucket_minutes, 0, 0] for i in range(num_buckets)]
    for i in range(num_buckets):
        region_data[rid]['series'][i][1] += data['series'][i][1]  # ballots
        region_data[rid]['series'][i][2] += data['series'][i][2]  # votes

# Build output structure
regions_output = []
for rid, data in region_data.items():
    regions_output.append({
        'id': rid,
        'name': data.get('region_name', rid),  # We don't have Russian name easily, use ID
        'voters': data['voters'],
        'ballots': data['total_ballots'],
        'votes': data['total_votes'],
        'contracts': len(data['contract_ids']),
        'uiks': 0,
        'districtIds': data['contract_ids'],
        'series': data['series']
    })

# Also create a "all regions" aggregate
all_series = [[i * bucket_minutes, 0, 0] for i in range(num_buckets)]
for rid, data in region_data.items():
    for i in range(num_buckets):
        all_series[i][1] += data['series'][i][1]
        all_series[i][2] += data['series'][i][2]

all_regions = {
    'id': 'all',
    'name': 'Все регионы',
    'voters': sum(d['voters'] for d in region_data.values()),
    'ballots': sum(d['total_ballots'] for d in region_data.values()),
    'votes': sum(d['total_votes'] for d in region_data.values()),
    'contracts': len(contract_series),
    'uiks': sum(len(v) for v in voters_by_contract.keys()),
    'districtIds': list(contract_series.keys()),
    'series': all_series
}

# Add all-regions to the beginning
regions_output.insert(0, all_regions)

# Build timeline
timeline = {
    'start': start_bucket.strftime('%Y-%m-%d %H:%M'),
    'end': (buckets[-1] + timedelta(minutes=bucket_minutes)).strftime('%Y-%m-%d %H:%M'),
    'bucketMinutes': bucket_minutes
}

# Generate anomalies (simplified - just note missing voters)
anomalies = []
for rid, data in region_data.items():
    if data['voters'] == 0 and data['total_ballots'] > 0:
        anomalies.append(f"Нет данных об избирателях для {rid}: {data['total_ballots']} бюллетеней")

output = {
    'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S %z'),
    'sourceArchive': 'feddeg_20260919T155213+0300.zip',
    'timezone': 'Europe/Moscow (GMT+3)',
    'bucketMinutes': bucket_minutes,
    'timeline': timeline,
    'totals': {
        'id': 'all',
        'name': 'Все регионы',
        'voters': all_regions['voters'],
        'ballots': all_regions['ballots'],
        'votes': all_regions['votes'],
        'contracts': len(contract_series),
        'uiks': len(voters_by_contract),
        'regions': len(region_data),
        'districts': len(contract_series)
    },
    'series': all_series,
    'regions': regions_output,
    'districts': [],  # Not building district-level for now
    'anomalies': anomalies[:10]
}

output_path = os.path.join(output_dir, 'feddeg_dashboard.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

print(f"\nSaved to {output_path}")
print(f"Regions: {len(regions_output)}")
print(f"Time buckets: {num_buckets}")
print(f"Total ballots: {all_regions['ballots']:,}")
print(f"Total votes: {all_regions['votes']:,}")