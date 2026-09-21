import csv
import os

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"

for fname in os.listdir(extract_dir):
    fpath = os.path.join(extract_dir, fname)
    print(f"\n=== {fname} ===")
    with open(fpath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        print(f"Headers: {headers}")
        for i, row in enumerate(reader):
            if i < 5:
                print(f"  Row {i}: {row}")
            else:
                break
        # Count rows
        f.seek(0)
        row_count = sum(1 for _ in csv.reader(f)) - 1
        print(f"Total rows: {row_count}")