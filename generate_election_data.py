import csv
import json
import os

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"
output_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\src"

# Region name to ID mapping (from map-data.js regionNames)
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
    "Запорожская область": "zaporozhye"
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

# Load ballots.csv to count ballots per contract
print("Loading ballots.csv...")
ballots_per_contract = {}
with open(os.path.join(extract_dir, 'ballots.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        cid = row['contract_id']
        ballots_per_contract[cid] = ballots_per_contract.get(cid, 0) + 1

print(f"Loaded ballot counts for {len(ballots_per_contract)} contracts")

# Load voter_list_events.csv to count initial voters per contract
print("Loading voter_list_events.csv...")
voters_per_contract = {}
with open(os.path.join(extract_dir, 'voter_list_events.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['type'] == 'initial':
            cid = row['contract_id']
            count = int(row['count'])
            voters_per_contract[cid] = voters_per_contract.get(cid, 0) + count

print(f"Loaded voter counts for {len(voters_per_contract)} contracts")

# Aggregate by region + election
print("Aggregating by region+election...")
election_data = {}
for cid, region_name in contract_to_region.items():
    region_id = REGION_NAME_TO_ID.get(region_name)
    if not region_id:
        continue
    
    election_name = contract_to_election.get(cid, "Неизвестные выборы")
    key = (region_id, election_name)
    
    ballots = ballots_per_contract.get(cid, 0)
    voters = voters_per_contract.get(cid, 0)
    turnout = (ballots / voters * 100) if voters > 0 else 0
    
    if key not in election_data:
        election_data[key] = {
            'region': region_name,
            'ballotsIssued': 0,
            'voters': 0,
            'turnout': 0,
            'invalidBallots': 0,
            'validBallots': 0
        }
    
    election_data[key]['ballotsIssued'] += ballots
    election_data[key]['voters'] += voters

# Calculate turnout for each
for key, data in election_data.items():
    if data['voters'] > 0:
        data['turnout'] = round(data['ballotsIssued'] / data['voters'] * 100, 2)
    data['validBallots'] = data['ballotsIssued']  # Simplified
    data['invalidBallots'] = 0

# Convert to flat structure by region_id (use first election per region)
final_data = {}
for (region_id, election_name), data in election_data.items():
    if region_id not in final_data:
        final_data[region_id] = data

print(f"Aggregated data for {len(final_data)} regions")

# Save as JSON for the frontend
output_path = os.path.join(output_dir, 'election-data.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final_data, f, ensure_ascii=False, indent=2)

print(f"Saved to {output_path}")

# Also save as CSV for compatibility
csv_path = os.path.join(output_dir, 'election-data.csv')
with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['region', 'ballotsIssued', 'voters', 'turnout', 'invalidBallots', 'validBallots'])
    for region_id, data in final_data.items():
        writer.writerow([
            data['region'],
            data['ballotsIssued'],
            data['voters'],
            data['turnout'],
            data['invalidBallots'],
            data['validBallots']
        ])
print(f"Also saved CSV to {csv_path}")