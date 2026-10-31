"""Perfume bottle templates: Qasr (faceted flacon), Ward (rounded rose bottle), Majlis (octagonal column).

Usage:
  blender -b --factory-startup -P scripts/blender/build_bottles.py -- <out_dir> <meta.json>

Each GLB holds named meshes the web app styles at runtime (materials are placeholders):
  Glass   - solid glass body (refraction/transmission in three.js)
  Liquid  - perfume inside, flat surface at the fill line
  Neck    - glass neck
  Collar  - metal ring under the cap
  Cap     - cap (finish chosen by the admin: gold / silver / onyx)
  CapTrim - decorative metal detail on the cap (where the style has one)
  Label   - front label plate with 0..1 UVs (product name drawn at runtime)
Units are metres, Z-up in Blender (glTF Y-up); the bottle stands on z = 0, front faces -Y.
"""
import bpy, bmesh, sys, os, math, json
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
OUT_DIR = os.path.abspath(argv[0]); META = os.path.abspath(argv[1])
os.makedirs(OUT_DIR, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def apply_mods(ob):
    for o in bpy.context.scene.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def mesh_from_bm(name, bm, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    return link(bpy.data.objects.new(name, me))


def prism(name, sides, rx, ry, z0, z1, rot=0.0):
    """Closed prism with `sides` sides (rx/ry radii) between z0 and z1."""
    bm = bmesh.new()
    ring0, ring1 = [], []
    for i in range(sides):
        a = rot + 2 * math.pi * i / sides
        ring0.append(bm.verts.new((rx * math.cos(a), ry * math.sin(a), z0)))
        ring1.append(bm.verts.new((rx * math.cos(a), ry * math.sin(a), z1)))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
    bm.faces.new(ring1)
    bm.faces.new(list(reversed(ring0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm, smooth=False)


def box(name, w, d, z0, z1):
    return prism(name, 4, w / math.sqrt(2), d / math.sqrt(2), z0, z1, rot=math.pi / 4)


def lathe(name, profile, segments=64):
    """Surface of revolution from (r, z) points (bottom to top), closed at both ends."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z)) for k in range(segments)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            k2 = (k + 1) % segments
            try:
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.faces.ensure_lookup_table()
    holes = [e for e in bm.edges if e.is_boundary]
    if holes:
        bmesh.ops.holes_fill(bm, edges=holes, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm)


def bevel(ob, width, segments=4):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = width, segments, "ANGLE"
    m.angle_limit = math.radians(30)
    m.harden_normals = True
    wn = ob.modifiers.new("WN", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True


def squash_y(ob, factor):
    ob.data.transform(Matrix.Diagonal((1, factor, 1, 1)))


def liquid_from(glass, inset, bottom, fill_z, name="Liquid"):
    """Copy of the glass body shrunk by `inset`, raised by `bottom`, cut flat at the fill line."""
    bm = bmesh.new()
    bm.from_mesh(glass.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    zmin = min(v.co.z for v in bm.verts)
    c = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    for v in bm.verts:
        d = Vector((v.co.x - c.x, v.co.y - c.y, 0))
        if d.length > 1e-6:
            v.co -= d.normalized() * min(inset, d.length * 0.5)
        v.co.z = max(zmin + bottom, v.co.z)
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, fill_z), plane_no=(0, 0, 1), clear_outer=True)
    cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    if cut:
        bmesh.ops.holes_fill(bm, edges=cut, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm)


def label_plate(w, h, z, y_front, curve=0.0, name="Label", surface=None):
    """Thin plate just in front of the glass; optional cylindrical curve (radius), or an exact
    `surface(x, z) -> y` of the glass front so the label hugs a doubly-curved bottle."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    nx, ny = 24, 2
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x = (u - 0.5) * w
            y = y_front
            zz = z + (v - 0.5) * h
            if surface:
                y = surface(x, zz)
            elif curve:
                y = y_front + (curve - math.sqrt(max(curve ** 2 - x ** 2, 0)))
            row.append((bm.verts.new((x, y - 0.0006, zz)), u, v))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            f = bm.faces.new([p[0] for p in q])
            for l, p in zip(f.loops, q):
                l[uv].uv = (p[1], p[2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    return mesh_from_bm(name, bm)


def material(name, color, metal=0.0, rough=0.4, transmission=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
        b.inputs["IOR"].default_value = 1.5
    return m


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def finish(style, parts, meta_extra):
    mats = {
        "Glass": material("Glass", (0.95, 0.97, 0.98), rough=0.02, transmission=1.0),
        "Liquid": material("Liquid", (0.8, 0.35, 0.4), rough=0.15),
        "Neck": material("Glass", (0.95, 0.97, 0.98), rough=0.02, transmission=1.0),
        "Collar": material("Metal", (0.83, 0.69, 0.42), metal=1.0, rough=0.22),
        "Cap": material("Cap", (0.83, 0.69, 0.42), metal=1.0, rough=0.2),
        "CapTrim": material("Metal", (0.83, 0.69, 0.42), metal=1.0, rough=0.22),
        "Label": material("Label", (0.54, 0.08, 0.22), rough=0.5),
    }
    for name, ob in parts.items():
        ob.name = name
        ob.data.name = name
        assign(ob, mats[name.split(".")[0]])
    root = link(bpy.data.objects.new(f"Bottle_{style}", None))
    for ob in parts.values():
        ob.parent = root
    out = os.path.join(OUT_DIR, f"{style}.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_apply=True, export_normals=True, export_texcoords=True)
    pts = [ob.matrix_world @ Vector(c) for ob in parts.values() for c in ob.bound_box]
    height = max(p.z for p in pts)
    tris = sum(len(ob.data.polygons) for ob in parts.values())
    return dict(id=style, height=round(height, 4), width=round(max(p.x for p in pts) * 2, 4), triangles=tris, **meta_extra)


bottles = []

# ---------------------------------------------------------------- Qasr: faceted rectangular flacon
reset()
W, D, H = 0.072, 0.040, 0.095
glass = box("Glass", W, D, 0.0, H)
bevel(glass, 0.0075, 5)
liquid = liquid_from(glass, 0.0045, 0.014, H * 0.82)
neck = lathe("Neck", [(0.0, H - 0.002), (0.011, H - 0.002), (0.011, H + 0.010), (0.0, H + 0.010)], 48)
collar = lathe("Collar", [(0.0, H + 0.008), (0.0145, H + 0.008), (0.0150, H + 0.011), (0.0145, H + 0.016), (0.0, H + 0.016)], 64)
cap = box("Cap", 0.040, 0.032, H + 0.016, H + 0.052)
bevel(cap, 0.004, 4)
label = label_plate(0.044, 0.018, H * 0.42, -D / 2 - 0.0003)
bottles.append(finish("qasr", {"Glass": glass, "Liquid": liquid, "Neck": neck, "Collar": collar, "Cap": cap, "Label": label},
                      dict(label="Qasr", blurb="Faceted crystal flacon", labelSize=[0.044, 0.018], capTrim=False)))

# ---------------------------------------------------------------- Ward: rounded rose bottle
reset()
R, H = 0.042, 0.085
prof = [(0.0, 0.0)] + [(R * math.sin(t) * (0.96 + 0.04 * math.sin(t)), H * (1 - math.cos(t)) / 2) for t in [i * math.pi / 40 for i in range(1, 40)]] + [(0.0, H)]
glass = lathe("Glass", prof, 72)
squash_y(glass, 0.62)
liquid = liquid_from(glass, 0.004, 0.012, H * 0.7)
neck = lathe("Neck", [(0.0, H - 0.004), (0.010, H - 0.004), (0.010, H + 0.010), (0.0, H + 0.010)], 48)
collar = lathe("Collar", [(0.0, H + 0.008), (0.013, H + 0.008), (0.0138, H + 0.011), (0.013, H + 0.015), (0.0, H + 0.015)], 64)
bud = [(0.0, H + 0.015), (0.012, H + 0.016), (0.017, H + 0.024), (0.018, H + 0.033), (0.015, H + 0.042), (0.009, H + 0.050), (0.003, H + 0.055), (0.0, H + 0.056)]
cap = lathe("Cap", bud, 64)
# petal ridges: gentle 6-fold modulation of the bud
for v in cap.data.vertices:
    a = math.atan2(v.co.y, v.co.x)
    k = 1 + 0.06 * math.cos(6 * a) * max(0.0, (v.co.z - H - 0.016) / 0.04)
    v.co.x *= k
    v.co.y *= k
def ward_front(x, z, rx=R * 0.985, ry=R * 0.62, zc=H / 2, rz=H / 2):
    k = 1 - (x / rx) ** 2 - ((z - zc) / rz) ** 2
    return -ry * math.sqrt(max(k, 0.0)) - 0.0004
label = label_plate(0.040, 0.016, H * 0.48, 0, surface=ward_front)
bottles.append(finish("ward", {"Glass": glass, "Liquid": liquid, "Neck": neck, "Collar": collar, "Cap": cap, "Label": label},
                      dict(label="Ward", blurb="Rounded rose bottle", labelSize=[0.040, 0.016], capTrim=False)))

# ---------------------------------------------------------------- Majlis: octagonal column with dome cap
reset()
R, H = 0.030, 0.118
glass = prism("Glass", 8, R, R, 0.0, H, rot=math.pi / 8)
bevel(glass, 0.003, 4)
liquid = liquid_from(glass, 0.0035, 0.016, H * 0.8)
neck = lathe("Neck", [(0.0, H - 0.002), (0.009, H - 0.002), (0.009, H + 0.009), (0.0, H + 0.009)], 48)
collar = lathe("Collar", [(0.0, H + 0.007), (0.0125, H + 0.007), (0.0132, H + 0.010), (0.0125, H + 0.014), (0.0, H + 0.014)], 64)
dome = [(0.0, H + 0.014), (0.016, H + 0.015), (0.0175, H + 0.022), (0.0172, H + 0.030), (0.0145, H + 0.039), (0.0095, H + 0.047), (0.004, H + 0.054), (0.0018, H + 0.060), (0.0, H + 0.064)]
cap = lathe("Cap", dome, 64)
trim = lathe("CapTrim", [(0.0, H + 0.0255), (0.0178, H + 0.0255), (0.0182, H + 0.0275), (0.0178, H + 0.0295), (0.0, H + 0.0295)], 64)
label = label_plate(0.030, 0.034, H * 0.5, -R * math.cos(math.pi / 8) - 0.0003)
bottles.append(finish("majlis", {"Glass": glass, "Liquid": liquid, "Neck": neck, "Collar": collar, "Cap": cap, "CapTrim": trim, "Label": label},
                      dict(label="Majlis", blurb="Octagonal column, dome cap", labelSize=[0.030, 0.034], capTrim=True)))

with open(META, "w") as f:
    json.dump({b["id"]: b for b in bottles}, f, indent=2)
print("BOTTLES_DONE", json.dumps(bottles))
