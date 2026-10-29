"""Analyze connected components of the rack GLB (read-only). Usage:
blender -b --factory-startup -P analyze_parts.py -- <in.glb> <out.json>"""
import bpy, bmesh, sys, os, json
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
parts = []
for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    seen = set()
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; comp = []
        seen.add(v.index)
        while stack:
            x = stack.pop(); comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
        ws = [o.matrix_world @ c.co for c in comp]
        mn = [min(p[i] for p in ws) for i in range(3)]; mx = [max(p[i] for p in ws) for i in range(3)]
        parts.append({"obj": o.name, "n": len(comp), "min": mn, "max": mx})
    bm.free()
parts.sort(key=lambda p: -p["n"])
json.dump(parts, open(out, "w"))
print("PARTS", len(parts))
for p in parts[:60]:
    print(p["obj"], p["n"], [round(x, 3) for x in p["min"]], [round(x, 3) for x in p["max"]])
