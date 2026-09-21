import json

with open(r'C:\Users\Rory_\Desktop\DEG-2026-interactive-map\feddeg\dashboard\site\data\feddeg_dashboard.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("Regions:", len(data['regions']))
for r in data['regions'][:3]:
    print(f"  {r['id']}: {r['name']} - contracts: {r.get('contracts')}, districtIds: {len(r.get('districtIds', []))}")

print("\nDistricts:", len(data['districts']))
for d in data['districts'][:5]:
    print(f"  {d['id']}: {d['name']} - regionId: {d['regionId']}, elections: {d.get('elections')}")

# Check if regions have elections field
print("\nRegion elections field:")
for r in data['regions'][:3]:
    print(f"  {r['id']}: {r.get('elections', 'NO ELECTIONS FIELD')}")