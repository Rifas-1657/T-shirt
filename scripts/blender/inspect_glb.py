"""Inspect a GLB in Blender (read-only on the source; never saves over it).

Usage:
  blender -b --factory-startup -P scripts/blender/inspect_glb.py -- <in.glb> <out_dir>
Writes <out_dir>/glb_inspection.json and front/back/side/top renders plus the base-color atlas.
"""
import bpy, sys, json, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

report = {"source": os.path.basename(src), "objects": [], "materials": [], "images": []}
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
gmin = Vector((1e9,) * 3); gmax = Vector((-1e9,) * 3)
for o in bpy.context.scene.objects:
    entry = {"name": o.name, "type": o.type, "parent": o.parent.name if o.parent else None,
             "location": list(o.location), "rotation_euler": list(o.rotation_euler), "scale": list(o.scale)}
    if o.type == "MESH":
        me = o.data
        me.calc_loop_triangles()
        ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
        for v in ws:
            gmin = Vector(map(min, gmin, v)); gmax = Vector(map(max, gmax, v))
        uvstats = []
        for uv in me.uv_layers:
            us = [d.uv for d in uv.data]
            uvstats.append({"name": uv.name,
                            "u_range": [min(u.x for u in us), max(u.x for u in us)],
                            "v_range": [min(u.y for u in us), max(u.y for u in us)]})
        entry.update({"vertices": len(me.vertices), "triangles": len(me.loop_triangles),
                      "materials": [m.name for m in me.materials if m], "uv_layers": uvstats,
                      "world_bbox_min": list(map(min, *ws)), "world_bbox_max": list(map(max, *ws))})
    report["objects"].append(entry)
report["scene_bbox"] = {"min": list(gmin), "max": list(gmax), "size": list(gmax - gmin)}
report["total_triangles"] = sum(o.get("triangles", 0) for o in report["objects"])
for m in bpy.data.materials:
    nodes = [n.bl_idname for n in m.node_tree.nodes] if m.use_nodes else []
    report["materials"].append({"name": m.name, "nodes": nodes})
for img in bpy.data.images:
    report["images"].append({"name": img.name, "size": list(img.size), "channels": img.channels,
                             "colorspace": img.colorspace_settings.name})
    if img.size[0] and "baseColor" in img.name or img.name.lower().startswith("image_0") or True:
        p = os.path.join(out, "atlas_" + "".join(c if c.isalnum() else "_" for c in img.name) + ".png")
        img.filepath_raw = p; img.file_format = "PNG"
        try: img.save()
        except Exception as e: report.setdefault("errors", []).append(str(e))

with open(os.path.join(out, "glb_inspection.json"), "w") as f:
    json.dump(report, f, indent=2)

# Renders
scn = bpy.context.scene
scn.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
scn.render.resolution_x, scn.render.resolution_y = 1600, 1000
scn.world = bpy.data.worlds.new("w"); scn.world.use_nodes = True
scn.world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.88, 0.85, 1)
scn.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scn.collection.objects.link(sun)
sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
center = (gmin + gmax) / 2; size = gmax - gmin
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam)
cam.data.type = "ORTHO"; scn.camera = cam
views = {"front": Vector((0, -1, 0)), "back": Vector((0, 1, 0)), "side": Vector((1, 0, 0)), "top": Vector((0, 0, 1))}
for name, d in views.items():
    cam.location = center + d * 5
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y" if name != "top" else "Y").to_euler()
    cam.data.ortho_scale = max(size) * 1.1
    scn.render.filepath = os.path.join(out, f"render_{name}.png")
    bpy.ops.render.render(write_still=True)
print("INSPECTION_DONE", json.dumps(report["scene_bbox"]), report["total_triangles"])
