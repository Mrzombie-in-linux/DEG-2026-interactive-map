import csv
import os

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"

# Try cp1251
encoding = 'cp1251'
try:
    with open(os.path.join(extract_dir, 'elections.csv'), 'r', encoding=encoding) as f:
        reader = csv.DictReader(f)
        regions = set()
        for row in reader:
            if row['region']:
                regions.add(row['region'])
        print(f"=== Encoding: {encoding} ===")
        for r in sorted(regions):
            print(f"  {r}")
except Exception as e:
    print(f"Encoding {encoding} failed: {e}")