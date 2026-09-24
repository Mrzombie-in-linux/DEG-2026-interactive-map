import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

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
    "Запорожская область": "zaporozhye"
}

def adaptive_bins(timestamps, max_bins=60):
    """Create adaptive time bins based on election duration."""
    if len(timestamps) < 2:
        return [timestamps[0]] if len(timestamps) == 1 else []
    
    t_min = pd.Timestamp(min(timestamps))
    t_max = pd.Timestamp(max(timestamps))
    duration_hours = (t_max - t_min).total_seconds() / 3600
    
    if duration_hours <= 2:
        freq = '15min'
    elif duration_hours <= 6:
        freq = '30min'
    elif duration_hours <= 12:
        freq = '1h'
    elif duration_hours <= 24:
        freq = '2h'
    elif duration_hours <= 48:
        freq = '4h'
    else:
        freq = '6h'
    
    bins = pd.date_range(start=t_min.floor(freq), end=t_max.ceil(freq), freq=freq)
    if len(bins) > max_bins:
        bins = pd.date_range(start=t_min, end=t_max, periods=max_bins)
    return bins

def process_election_group(group):
    """Process a single region+election group."""
    group = group.sort_values('timestamp')
    
    timestamps = group['timestamp'].values
    bins = adaptive_bins(timestamps)
    if len(bins) < 2:
        return None
    
    bin_indices = np.searchsorted(bins, timestamps, side='right') - 1
    bin_indices = np.clip(bin_indices, 0, len(bins) - 2)
    
    initial_counts = np.zeros(len(bins) - 1)
    remove_counts = np.zeros(len(bins) - 1)
    
    for idx, row in group.iterrows():
        b = bin_indices[group.index.get_loc(idx)]
        if row['type'] == 'initial':
            initial_counts[b] += row['count']
        elif row['type'] == 'remove':
            remove_counts[b] += row['count']
    
    net_per_bin = initial_counts - remove_counts
    cumulative = np.cumsum(net_per_bin)
    cumulative = np.maximum(cumulative, 0)
    
    activity = initial_counts + remove_counts
    
    mean_rate = np.mean(net_per_bin[net_per_bin > 0]) if np.any(net_per_bin > 0) else 0
    std_rate = np.std(net_per_bin[net_per_bin > 0]) if np.any(net_per_bin > 0) else 1
    std_rate = max(std_rate, 1)
    
    deviation = np.zeros_like(net_per_bin, dtype=float)
    for i, val in enumerate(net_per_bin):
        if val > 0 and mean_rate > 0:
            deviation[i] = (val - mean_rate) / std_rate
    
    spike_threshold = 2.0
    spikes = np.abs(deviation) > spike_threshold
    
    bin_labels = [bins[i].strftime('%m-%d %H:%M') for i in range(len(bins) - 1)]
    
    return {
        'timestamps': bin_labels,
        'cumulative_ballots': cumulative.tolist(),
        'activity': activity.tolist(),
        'deviation': deviation.tolist(),
        'spikes': spikes.tolist(),
        'spike_threshold': spike_threshold,
        'duration_hours': (bins[-1] - bins[0]).total_seconds() / 3600,
        'total_initial': int(initial_counts.sum()),
        'total_remove': int(remove_counts.sum()),
        'total_net': int(cumulative[-1]) if len(cumulative) > 0 else 0
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("src/merged.csv"),
        help="path to merged.csv (region+election+voter-list events)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/region-timeseries.json"),
        help="path to write the derived JSON",
    )
    args = parser.parse_args()

    print(f"Loading {args.input}...")
    df = pd.read_csv(args.input, encoding="utf-8", parse_dates=["timestamp"])

    print(f"Loaded {len(df)} rows")
    print(f"Columns: {df.columns.tolist()}")
    print(f"Unique regions: {df['region'].nunique()}")
    print(f"Unique elections: {df['election'].nunique()}")
    print(f"Types: {df['type'].unique()}")

    df = df.dropna(subset=["region", "election"])

    result = defaultdict(lambda: defaultdict(dict))
    region_id_map = {}

    grouped = df.groupby(["region", "election"])
    total_groups = len(grouped)
    print(f"\nProcessing {total_groups} region+election groups...")

    for i, ((region, election), group) in enumerate(grouped):
        if i % 50 == 0:
            print(f"  {i}/{total_groups}...")

        processed = process_election_group(group)
        if processed:
            region_id = REGION_NAME_TO_ID.get(region)
            if region_id:
                region_id_map[region] = region_id
                result[region_id][election] = processed
            else:
                print(f"  Warning: No mapping for region '{region}'")

    print(f"\nProcessed {sum(len(v) for v in result.values())} election series")
    print(f"Mapped {len(region_id_map)} regions")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"Saved to {args.output}")

    sample_region = list(result.keys())[0]
    sample_election = list(result[sample_region].keys())[0]
    print(f"\nSample: {sample_region} - {sample_election}")
    print(f"  Bins: {len(result[sample_region][sample_election]['timestamps'])}")
    print(f"  Duration: {result[sample_region][sample_election]['duration_hours']:.1f}h")
    print(f"  Total ballots: {result[sample_region][sample_election]['total_net']}")


if __name__ == "__main__":
    main()