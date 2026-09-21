import csv
import os

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"

# Check elections.csv region names
with open(os.path.join(extract_dir, 'elections.csv'), 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    regions = set()
    for row in reader:
        if row['region']:
            regions.add(row['region'])
    
    print("Unique regions in elections.csv:")
    for r in sorted(regions):
        # Show raw bytes
        print(f"  {repr(r)}")
        print(f"  Display: {r}")

import os