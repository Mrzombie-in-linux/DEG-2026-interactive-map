import os

extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"

with open(os.path.join(extract_dir, 'elections.csv'), 'rb') as f:
    data = f.read(2000)
    print("First 2000 bytes:")
    print(data[:500])
    print("---")
    # Try to find a region name
    for i in range(len(data)-20):
        chunk = data[i:i+20]
        if b'\xd0' in chunk or b'\xd1' in chunk:  # Cyrillic in UTF-8
            try:
                decoded = chunk.decode('utf-8')
                if any(c.isalpha() for c in decoded):
                    print(f"  Offset {i}: {decoded}")
            except:
                pass