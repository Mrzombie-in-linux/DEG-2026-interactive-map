import zipfile
import os

zip_path = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\feddeg_20260919T155213+0300.zip"
extract_dir = r"C:\Users\Rory_\Desktop\DEG-2026-interactive-map\data\extracted"

os.makedirs(extract_dir, exist_ok=True)

with zipfile.ZipFile(zip_path, 'r') as z:
    z.extractall(extract_dir)
    files = z.namelist()
    print('Total files:', len(files))
    for f in files[:30]:
        print(' ', f)