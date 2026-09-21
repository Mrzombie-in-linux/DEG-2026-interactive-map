import csv
import os

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"

# Try different encodings
for encoding in ['utf-8', 'cp1251', 'cp1252', 'latin1', 'iso-8859-5']:
    try:
        with open(os.path.join(extract_dir, 'elections.csv'), 'r', encoding=encoding) as f:
            reader = csv.DictReader(f)
            regions = set()
            for row in reader:
                if row['region']:
                    regions.add(row['region'])
            print(f"\n=== Encoding: {encoding} ===")
            for r in sorted(regions)[:10]:
                print(f"  {r}")
            break
    except Exception as e:
        print(f"Encoding {encoding} failed: {e}")