import zipfile
import xml.etree.ElementTree as ET
import json
import math

sh3d_path = r'C:\Users\aosla\OneDrive\Documents\2905 somewhat accurate.sh3d'

with zipfile.ZipFile(sh3d_path, 'r') as z:
    with z.open('Home.xml') as f:
        root = ET.parse(f).getroot()

# Load existing model3d.json to preserve verified room definitions
with open('data/model3d.json') as f:
    existing_model = json.load(f)

levels_xml = root.findall('.//level')
level_map = {}
for l in levels_xml:
    lvl_name = l.get('name', '')
    lvl_id = 'main' if '0' in lvl_name else 'basement'
    level_map[l.get('id')] = {
        'id': lvl_id,
        'name': lvl_name,
        'elevation': float(l.get('elevation', '0')) / 100.0,
        'height': float(l.get('height', '243.84')) / 100.0
    }

# 1. Rooms: Keep existing verified rooms
rooms = existing_model['rooms']

# Helper for point in polygon
def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def is_point_in_any_room(x, y, level):
    for r in rooms:
        if r['level'] == level:
            if point_in_poly(x, y, r['points']):
                return True
    return False

# 2. Walls: Classify isExterior
walls = existing_model['walls']
for w in walls:
    dx = w['x2'] - w['x1']
    dz = w['y2'] - w['y1']
    length = math.hypot(dx, dz)
    if length < 0.01:
        w['isExterior'] = False
        continue
    
    nx = -dz / length
    nz = dx / length
    midX = (w['x1'] + w['x2']) / 2
    midZ = (w['y1'] + w['y2']) / 2
    offset = 0.25
    side1_in = is_point_in_any_room(midX + nx * offset, midZ + nz * offset, w['level'])
    side2_in = is_point_in_any_room(midX - nx * offset, midZ - nz * offset, w['level'])
    w['isExterior'] = not (side1_in and side2_in)

# 3. Doors & Windows: Extract all from Home.xml
doors = []
windows = []
doors_windows_xml = root.findall('.//doorOrWindow')

for i, dw in enumerate(doors_windows_xml):
    lid = dw.get('level')
    lvl = level_map.get(lid, {'id': 'main', 'name': 'Level 0', 'elevation': 0.0, 'height': 2.44})
    
    x = (float(dw.get('x', '0')) - 3600.0) / 100.0
    z = (float(dw.get('y', '0')) - 1400.0) / 100.0
    w = float(dw.get('width', '0')) / 100.0
    d = float(dw.get('depth', '0')) / 100.0
    h = float(dw.get('height', '0')) / 100.0
    sill = float(dw.get('elevation', '0')) / 100.0
    angle = float(dw.get('angle', '0'))
    
    cat = dw.get('catalogId', '')
    name = dw.get('name', '')
    dw_id = dw.get('id', f'dw_{i}')
    
    is_door = 'door' in cat.lower() or 'door' in name.lower()
    is_garage = 'garagedoor' in cat.lower() or 'garage' in name.lower()
    is_cased = 'doorframe' in cat.lower() or 'door frame' in name.lower()
    
    rotY = -angle
    y = lvl['elevation']
    
    item = {
        'id': dw_id,
        'name': name,
        'catalogId': cat,
        'level': lvl['id'],
        'x': round(x, 4),
        'y': round(y, 4),
        'z': round(z, 4),
        'width': round(w, 4),
        'height': round(h, 4),
        'depth': round(d, 4),
        'rotY': round(rotY, 4),
        'angleDeg': round(math.degrees(angle), 1)
    }
    
    if is_door:
        item['isGarage'] = is_garage
        item['isCased'] = is_cased
        item['isExterior'] = is_garage or ('front' in name.lower()) or (lvl['id'] == 'basement' and 'door' in name.lower() and not is_cased)
        doors.append(item)
    else:
        item['sill'] = round(sill, 4)
        windows.append(item)

# 4. Staircase: Exact from Home.xml
# Staircase in Home.xml: x=4312.195, y=1836.4584, width=72.39, depth=222.25, height=361.95
# In 3D: x=7.122, z=4.365. Runs along Z from Z=3.254 (top, main floor 0.0) to Z=5.477 (bottom, basement -2.13)
stairs = [
    {
        'id': 'stair_basement',
        'name': 'Basement Staircase',
        'level': 'all',
        'startX': 7.122,
        'startZ': 3.254,
        'startY': 0.0,
        'endX': 7.122,
        'endZ': 5.477,
        'endY': -2.134,
        'width': 0.724,
        'steps': 13
    }
]

# 5. Equipment: From Home.xml pieceOfFurniture
equipment = [
    {
        'id': 'eq_water_heater',
        'name': 'Water Heater Tank',
        'level': 'basement',
        'type': 'cylinder',
        'x': -0.411,
        'z': 2.485,
        'y': -2.134,
        'radius': 0.228,
        'height': 2.057,
        'color': 13358561
    },
    {
        'id': 'eq_water_softener',
        'name': 'Water Softener / Expansion Tank',
        'level': 'basement',
        'type': 'cylinder',
        'x': -0.573,
        'z': 3.253,
        'y': -2.134,
        'radius': 0.27,
        'height': 1.575,
        'color': 11184810
    },
    {
        'id': 'eq_furnace_1',
        'name': 'HVAC Furnace Unit',
        'level': 'basement',
        'type': 'box',
        'x': 1.551,
        'z': 3.271,
        'y': -2.134,
        'width': 0.914,
        'depth': 0.914,
        'height': 2.134,
        'color': 4674921
    },
    {
        'id': 'eq_furnace_2',
        'name': 'HVAC Air Handler Unit',
        'level': 'basement',
        'type': 'box',
        'x': 0.471,
        'z': 3.271,
        'y': -2.134,
        'width': 0.914,
        'depth': 0.914,
        'height': 2.083,
        'color': 5595238
    },
    {
        'id': 'eq_storage_cyl_1',
        'name': 'Basement Storage Drum 1',
        'level': 'basement',
        'type': 'cylinder',
        'x': 2.857,
        'z': 7.951,
        'y': -2.134,
        'radius': 0.457,
        'height': 1.88,
        'color': 7832960
    },
    {
        'id': 'eq_storage_cyl_2',
        'name': 'Basement Storage Drum 2',
        'level': 'basement',
        'type': 'cylinder',
        'x': 2.857,
        'z': 6.804,
        'y': -2.134,
        'radius': 0.457,
        'height': 1.88,
        'color': 7832960
    },
    {
        'id': 'eq_main_panel_3d',
        'name': 'Main 200A Electrical Panel',
        'level': 'basement',
        'type': 'panel',
        'x': 0.6,
        'z': 2.25,
        'y': -0.9,
        'width': 0.45,
        'depth': 0.12,
        'height': 0.95,
        'rotY': 1.5708,
        'color': 1976635
    }
]

model_data = {
    'levels': existing_model['levels'],
    'rooms': rooms,
    'walls': walls,
    'doors': doors,
    'windows': windows,
    'stairs': stairs,
    'equipment': equipment
}

# Write to data/model3d.json
with open('data/model3d.json', 'w') as f:
    json.dump(model_data, f, indent=2)

# Write to data/model3d.js for file:// offline compatibility
with open('data/model3d.js', 'w') as f:
    f.write('/* Auto-generated 3D Model Data for Offline file:// compatibility */\n')
    f.write('window.MODEL_3D_DATA = ')
    json.dump(model_data, f, indent=2)
    f.write(';\n')

print("Successfully generated data/model3d.json and data/model3d.js!")
print(f"  Levels: {len(model_data['levels'])}")
print(f"  Rooms: {len(model_data['rooms'])}")
print(f"  Walls: {len(model_data['walls'])}")
print(f"  Doors: {len(model_data['doors'])}")
print(f"  Windows: {len(model_data['windows'])}")
print(f"  Stairs: {len(model_data['stairs'])}")
print(f"  Equipment: {len(model_data['equipment'])}")
