"""Studio preview of a garment GLB (front, 3/4, back) for visual QA.

Usage: blender -b --factory-startup -P scripts/blender/render_preview.py -- <in.glb> <out.png> [#hex tint]
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
tint = argv[2] if len(argv) > 2 else "#d9d4ca"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scn = bpy.context.scene

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

for m in bpy.data.materials:
    if m.name in ("Fabric", "Rib") and m.use_nodes:
        b = m.node_tree.nodes.get("Principled BSDF")
        tex = [l.from_node for l in b.inputs["Base Color"].links]
        mix = m.node_tree.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[7].default_value = (*srgb(tint), 1)
        if tex:
            m.node_tree.links.new(tex[0].outputs["Color"], mix.inputs[6])
        else:
            mix.inputs[6].default_value = (1, 1, 1, 1)
        m.node_tree.links.new(mix.outputs[2], b.inputs["Base Color"])

meshes = [o for o in scn.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
centre = (lo + hi) / 2; size = max(hi - lo)

scn.render.engine = "BLENDER_EEVEE"
scn.render.resolution_x, scn.render.resolution_y = 700, 900
scn.render.film_transparent = False
scn.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("w"); scn.world = world
world.color = (0.82, 0.8, 0.77)
def area(name, loc, energy, size_, color=(1, 0.96, 0.9)):
    l = bpy.data.lights.new(name, "AREA"); l.energy = energy; l.size = size_; l.color = color
    o = bpy.data.objects.new(name, l); scn.collection.objects.link(o); o.location = loc
    o.rotation_euler = (centre - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area("key", centre + Vector((1.4, -1.6, 1.2)), 140, 1.4)
area("fill", centre + Vector((-1.8, -1.2, 0.4)), 50, 2.0, (0.92, 0.95, 1))
area("rim", centre + Vector((0.2, 1.8, 1.2)), 90, 1.2)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera = cam
cam.data.lens = 70
frames = []
for i, ang in enumerate((0, 35, 180)):
    a = math.radians(ang)
    d = size * 3.3
    cam.location = centre + Vector((math.sin(a) * d, -math.cos(a) * d, 0.05))
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    p = out.replace(".png", f"_{i}.png")
    scn.render.filepath = p
    bpy.ops.render.render(write_still=True)
    frames.append(p)
print("PREVIEW_DONE", frames)
