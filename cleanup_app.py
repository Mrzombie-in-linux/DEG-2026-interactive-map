import re

with open(r'C:\Users\Rory_\Desktop\DEG-2026-interactive-map\src\app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of the old Chart.js code after the marker
marker = '// ===== Custom SVG Charts (from feddeg dashboard) ====='
first_marker = content.find(marker)
second_marker = content.find(marker, first_marker + 1)

if second_marker > 0:
    # Remove everything between the two markers (exclusive)
    before = content[:first_marker + len(marker)]
    after = content[second_marker:]
    
    # Also remove the trailing old Chart.js functions from the end
    # Find the last occurrence of the marker in the remaining content
    last_marker = after.rfind(marker)
    if last_marker > 0:
        after = after[:last_marker + len(marker)]
    
    content = before + '\n\n' + after
    
    with open(r'C:\Users\Rory_\Desktop\DEG-2026-interactive-map\src\app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print('Cleaned up duplicate sections')
else:
    print('Could not find markers')