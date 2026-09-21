import json

with open(r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\feddeg\dashboard\site\data\feddeg_dashboard.json", 'r', encoding='utf-8') as f:
    data = json.load(f)

print("Keys:", data.keys())
print("\nSource:", data.get('sourceArchive'))
print("Timezone:", data.get('timezone'))
print("Bucket minutes:", data.get('bucketMinutes'))
print("Generated at:", data.get('generatedAt'))
print("Totals:", data.get('totals'))
print("Anomalies:", data.get('anomalies')[:3])

print("\nRegions:", len(data.get('regions', [])))
if data.get('regions'):
    r = data['regions'][0]
    print("  Region sample:", r.keys())
    print("  Region:", r)

print("\nDistricts:", len(data.get('districts', [])))
if data.get('districts'):
    d = data['districts'][0]
    print("  District sample:", d.keys())
    print("  District:", d)

# Check series format
if data.get('regions'):
    r = data['regions'][0]
    if 'series' in r:
        print("\nSeries format (first 5):", r['series'][:5])
    else:
        print("\nNo 'series' in region")