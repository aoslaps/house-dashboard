import json
import math

with open('data/model3d.json') as f:
    data = json.load(f)

rooms = data['rooms']
walls = data['walls']

def point_in_poly(x, y, poly):
    # Ray casting point-in-polygon
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

exterior_count = 0
interior_count = 0

for w in walls:
    dx = w['x2'] - w['x1']
    dz = w['y2'] - w['y1']
    length = math.hypot(dx, dz)
    if length < 0.01: continue
    
    # Unit normal vector
    nx = -dz / length
    nz = dx / length
    
    midX = (w['x1'] + w['x2']) / 2
    midZ = (w['y1'] + w['y2']) / 2
    
    # Check 0.25m on either side
    offset = 0.25
    side1_in = is_point_in_any_room(midX + nx * offset, midZ + nz * offset, w['level'])
    side2_in = is_point_in_any_room(midX - nx * offset, midZ - nz * offset, w['level'])
    
    is_ext = not (side1_in and side2_in)
    w['isExterior'] = is_ext
    if is_ext:
        exterior_count += 1
    else:
        interior_count += 1

print(f"Walls classification: {exterior_count} exterior, {interior_count} interior (Total: {len(walls)})")
