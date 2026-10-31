"""Cycles preview of the perfume bottles side by side (visual QA).
Usage: blender -b --factory-startup -P scripts/blender/render_bottles.py -- <dir> <out.png>"""
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
d, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
liquids = {"qasr": (0.55, 0.05, 0.16), "ward": (0.85, 0.42, 0.48), "majlis": (0.62, 0.36, 0.08)}
for i, name in enumerate(["qasr", "ward", "majlis"]):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(d, name + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.x = (i - 1) * 0.11
        if o.type == "MESH" and o.name.startswith("Liquid"):
            b = o.active_material.node_tree.nodes["Principled BSDF"]
            b.inputs["Base Color"].default_value = (*liquids[name], 1)
floor = bpy.data.meshes.new("floor"); import bmesh
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0); bm.to_mesh(floor)
fo = bpy.data.objects.new("floor", floor); scn.collection.objects.link(fo)
fm = bpy.data.materials.new("fl"); fb = fm.node_tree.nodes["Principled BSDF"]; fb.inputs["Base Color"].default_value = (0.35, 0.05, 0.12, 1); fb.inputs["Roughness"].default_value = 0.25
floor.materials.append(fm)
scn.world = bpy.data.worlds.new("w"); scn.world.color = (0.5, 0.18, 0.24)
def area(loc, e, s):
    l = bpy.data.lights.new("a", "AREA"); l.energy = e; l.size = s
    o = bpy.data.objects.new("a", l); scn.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.07)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area((0.4, -0.5, 0.5), 40, 0.6); area((-0.5, -0.3, 0.3), 15, 0.8); area((0, 0.5, 0.4), 30, 0.5)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera = cam
cam.data.lens = 60; cam.location = (0, -0.62, 0.16)
cam.rotation_euler = (Vector((0, 0, 0.075)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scn.render.engine = "CYCLES"; scn.cycles.samples = 96; scn.cycles.device = "CPU"
scn.render.resolution_x, scn.render.resolution_y = 1200, 700
scn.view_settings.view_transform = "AgX"; scn.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDER_DONE", out)
