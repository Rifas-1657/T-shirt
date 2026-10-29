"""Build the T-shirt TEMPLATE garment used by the customizer.

Why this exists: the supplied source GLB (assets/source/cloth_rack.glb) is a fused scan of a rack
holding six coats. It contains no T-shirt and no separable garment, so the customizer runs on this
clearly-labelled template instead (decision confirmed by the user, see docs/GLB_DIAGNOSTIC.md).

Usage:
  blender -b --factory-startup -P scripts/blender/build_tshirt_template.py -- <out.glb> [out.blend]

Conventions (Blender, Z-up, metres). The garment front faces -Y. glTF export converts to Y-up,
so in three.js the front faces +Z and +X is the viewer's right when looking at the front.

UV0 is a dedicated PRINT ATLAS (2:1):
  front panel  -> u in [0, 0.5], planar projection, u grows to the viewer's right (+X)
  back panel   -> u in [0.5, 1], planar projection mirrored so u grows to the viewer's right
                  when viewed from behind (-X)
  v = (z - Z0) / S for both, S = PRINT_SPAN metres per half-atlas (isotropic => no stretching).
The app's product config stores print zones as rectangles in this UV space (see src/lib/printZones.ts).
"""
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_GLB = os.path.abspath(argv[0] if argv else "tshirt-template.glb")
OUT_BLEND = os.path.abspath(argv[1]) if len(argv) > 1 else None

PRINT_SPAN = 0.80   # metres covered by one half of the UV atlas
Z0 = -0.04          # z mapped to v = 0
GRID = 0.0055       # interior sampling step (m)
THICK = 0.021       # half-thickness of the garment at the shoulders (tapers toward the hem)
ROUND = 0.045       # distance from the outline over which the edge rounds off

# ---------------------------------------------------------------- outline (front view, x right, z up)
HALF = [  # right half, from back-neck centre clockwise to hem centre
    (0.000, 0.700), (0.040, 0.704), (0.072, 0.712), (0.090, 0.722),
    (0.150, 0.704), (0.215, 0.682),                       # shoulder seam
    (0.258, 0.650), (0.300, 0.604), (0.338, 0.560),       # sleeve top
    (0.318, 0.536), (0.296, 0.512), (0.276, 0.490),       # sleeve cuff
    (0.262, 0.500), (0.256, 0.470), (0.258, 0.380),       # underarm
    (0.262, 0.200), (0.266, 0.040), (0.266, 0.004),       # side seam
    (0.200, 0.000), (0.100, -0.003), (0.000, -0.004),     # hem
]
NECK_END = 3  # HALF[0..3] is the back neckline (open in front)

def mirror_full(half):
    right = half
    left = [(-x, z) for (x, z) in reversed(half[1:-1])]
    return right + left  # closed loop: right side top->hem, then left side hem->top

def densify(loop, step):
    out = []
    n = len(loop)
    for i in range(n):
        a, b = Vector(loop[i]), Vector(loop[(i + 1) % n])
        seg = max(1, int((b - a).length / step))
        for k in range(seg):
            out.append(tuple(a.lerp(b, k / seg)))
    return out

def front_scoop(n=28):
    """Front neckline: deeper U-scoop between the two neck/shoulder points."""
    x0, z0 = HALF[NECK_END]
    depth = 0.078
    pts = []
    for i in range(n + 1):
        t = math.pi * i / n  # 0..pi, from +x side to -x side going down through centre
        pts.append((x0 * math.cos(t), z0 - depth * math.sin(t) ** 1.15))
    return pts

outline = mirror_full(HALF)            # back panel outline (closed)
# front outline: replace the back neckline (left neck pt -> right neck pt across the top) by the scoop
right_from_neck = HALF[NECK_END:]      # right neck point ... hem centre
left_to_neck = [(-x, z) for (x, z) in reversed(HALF[NECK_END:-1])]
scoop = front_scoop()                  # from (+x0) to (-x0)
front_outline = right_from_neck + left_to_neck + list(reversed(scoop))[1:-1]
# front_outline now: right neck -> hem -> left neck -> (scoop, reversed so it goes -x0 -> +x0)

def point_in_poly(p, poly):
    x, y = p; inside = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside

OUT_D = np.array(densify(outline, GRID * 0.6))
def dist_to_outline(pts):
    a = OUT_D; b = np.roll(OUT_D, -1, axis=0); ab = b - a
    res = np.empty(len(pts))
    for i, p in enumerate(pts):
        t = np.clip(((p - a) * ab).sum(1) / ((ab * ab).sum(1) + 1e-12), 0, 1)
        res[i] = np.min(np.linalg.norm(a + ab * t[:, None] - p, axis=1))
    return res

def build_panel(poly, sign):
    """Triangulate a filled polygon with interior grid points; return verts(3D), faces."""
    bnd = densify(poly, GRID)
    xs = np.arange(-0.36, 0.36, GRID); zs = np.arange(-0.01, 0.73, GRID)
    interior = []
    for z in zs:
        for x in xs:
            jx = x + (GRID * 0.5 if int(round(z / GRID)) % 2 else 0)  # hex-ish offset rows
            if point_in_poly((jx, z), poly):
                interior.append((jx, z))
    pts2 = bnd + interior
    edges = [(i, (i + 1) % len(bnd)) for i in range(len(bnd))]
    vco, _, faces, _, _, _ = delaunay_2d_cdt([Vector(p) for p in pts2], edges, [list(range(len(bnd)))], 1, 1e-6)
    p2 = np.array([[v.x, v.y] for v in vco])
    d = dist_to_outline(p2)
    r = np.clip(d / ROUND, 0, 1)
    prof = np.sqrt(1 - (1 - r) ** 2)                    # circular roll at the seams
    x = p2[:, 0]; z = p2[:, 1]
    # gentle drape folds kept away from the chest/back print area (no fake folds under artwork)
    side = np.clip((np.abs(x) - 0.17) / 0.09, 0, 1)
    low = np.clip((0.22 - z) / 0.22, 0, 1)
    sleeve = (np.abs(x) > 0.24) & (z > 0.47)
    fold = 0.0018 * side * np.sin(z * 22 + np.sign(x) * 1.3) + 0.0012 * low * np.sin(x * 24)
    fold = np.where(sleeve, 0.0015 * np.sin((np.abs(x) + z) * 40), fold)
    # a hanging tee is held open by the hanger at the shoulders and nearly flat at the hem
    taper = 0.42 + 0.58 * np.clip((z - 0.05) / 0.62, 0, 1) ** 1.6
    y = sign * (THICK * prof * taper + fold * prof)
    verts = [Vector((x[i], y[i], z[i])) for i in range(len(x))]
    return verts, faces

def panel_uv(co, front):
    u = 0.5 * (co.x / PRINT_SPAN + 0.5) if front else 0.5 + 0.5 * (-co.x / PRINT_SPAN + 0.5)
    v = (co.z - Z0) / PRINT_SPAN
    return (u, v)

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# ---------------------------------------------------------------- shirt body
bm = bmesh.new()
uvl = bm.loops.layers.uv.new("PrintUV")
panel_tag = bm.faces.layers.int.new("panel")
for poly, sign, front in ((front_outline, -1, True), (outline, +1, False)):
    verts, faces = build_panel(poly, sign)
    bv = [bm.verts.new(v) for v in verts]
    for f in faces:
        vs = [bv[i] for i in f]
        if not front:
            vs = vs[::-1]           # back panel winding faces +Y
        try:
            face = bm.faces.new(vs)
        except ValueError:
            continue
        face[panel_tag] = 1 if front else 0
bm.verts.ensure_lookup_table()
# weld the two panels along the shared seams (outline points with y == 0)
bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if abs(v.co.y) < 1e-5], dist=GRID * 0.05)
bm.normal_update()
# make all normals point outward (front panel faces -Y, back faces +Y)
for f in bm.faces:
    want = -1 if f[panel_tag] == 1 else 1
    if f.normal.y * want < 0:
        f.normal_flip()
for f in bm.faces:
    front = f[panel_tag] == 1
    for l in f.loops:
        l[uvl].uv = panel_uv(l.vert.co, front)
me = bpy.data.meshes.new("Shirt")
bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
shirt = bpy.data.objects.new("Shirt", me); scn.collection.objects.link(shirt)

# ---------------------------------------------------------------- collar rib (follows the neck opening)
def collar_curve():
    sc = front_scoop(40)
    # back neckline (right neck -> centre -> left neck) at the panel surface, then the front scoop back to start
    back = [(x, z) for (x, z) in densify(HALF[:NECK_END + 1][::-1], 0.01)] + \
           [(-x, z) for (x, z) in densify(HALF[:NECK_END + 1], 0.01)][1:]
    pts = [Vector((x, 0.002, z)) for (x, z) in back]
    # front scoop sits on the front panel surface
    for (x, z) in list(reversed(sc))[1:-1]:
        d = dist_to_outline(np.array([[x, z]]))[0]
        r = min(d / ROUND, 1); y = -THICK * math.sqrt(1 - (1 - r) ** 2) * 0.95
        pts.append(Vector((x, y, z)))
    cu = bpy.data.curves.new("CollarCurve", "CURVE"); cu.dimensions = "3D"
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1); sp.use_cyclic_u = True
    for i, p in enumerate(pts): sp.points[i].co = (p.x, p.y, p.z, 1)
    cu.bevel_depth = 0.0055; cu.bevel_resolution = 3; cu.resolution_u = 2
    ob = bpy.data.objects.new("Collar", cu); scn.collection.objects.link(ob)
    return ob
collar = collar_curve()

# ---------------------------------------------------------------- hanger (wood arms + chrome hook)
def tube(name, pts, radius, res=4):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    sp = cu.splines.new("NURBS"); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    sp.use_endpoint_u = True; sp.order_u = 3
    cu.bevel_depth = radius; cu.bevel_resolution = res; cu.use_fill_caps = True; cu.resolution_u = 8
    ob = bpy.data.objects.new(name, cu); scn.collection.objects.link(ob); return ob
wood = tube("HangerWood", [(-0.175, 0, 0.655), (-0.09, 0, 0.690), (0, 0, 0.712), (0.09, 0, 0.690), (0.175, 0, 0.655)], 0.0075)
hc = Vector((-0.018, 0, 0.792)); hr = 0.018
hook_pts = [(0, 0, 0.712), (0, 0, 0.770), (0, 0, 0.786)]
for k in range(0, 13):
    a = math.radians(k * 17.5)
    hook_pts.append((hc.x + hr * math.cos(a), 0, hc.z + hr * math.sin(a)))
hook = tube("HangerHook", hook_pts, 0.0019, res=3)

# ---------------------------------------------------------------- materials
def knit_normal_map(size=512, cell=16):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    fu = (xx % cell) / cell; fv = (yy % cell) / cell
    dl = fu - 0.30 - 0.22 * (fv - 0.5); dr = fu - 0.70 + 0.22 * (fv - 0.5)
    h = np.maximum(np.exp(-dl ** 2 / 0.018), np.exp(-dr ** 2 / 0.018))
    h *= 0.75 + 0.25 * np.cos(2 * np.pi * fv)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.9; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.9
    n = np.stack([-gx, -gy, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.concatenate([n * 0.5 + 0.5, np.ones((size, size, 1), np.float32)], -1)
    img = bpy.data.images.new("KnitNormal", size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel()); img.pack()
    return img

def fabric_material():
    m = bpy.data.materials.new("Fabric")
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.92, 0.91, 0.89, 1)
    bsdf.inputs["Roughness"].default_value = 0.93
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.35
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = knit_normal_map()
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "PrintUV"
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (64, 64, 1)  # ~6mm stitches
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.45
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def simple_material(name, color, rough, metal):
    m = bpy.data.materials.new(name); b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; return m

fab = fabric_material()
shirt.data.materials.append(fab)
collar.data.materials.append(fab)
wood.data.materials.append(simple_material("HangerWood", (0.42, 0.24, 0.12), 0.45, 0.0))
hook.data.materials.append(simple_material("HangerChrome", (0.86, 0.86, 0.84), 0.18, 1.0))

# convert curves to meshes so the collar gets UVs in the same atlas convention (non-printable strip)
for ob in (collar, wood, hook):
    bpy.context.view_layer.objects.active = ob
    for o in scn.objects: o.select_set(o is ob)
    bpy.ops.object.convert(target="MESH")
for ob in (collar, wood, hook):
    me = ob.data
    if not me.uv_layers: me.uv_layers.new(name="PrintUV")
    for l in me.loops:
        co = me.vertices[l.vertex_index].co
        me.uv_layers[0].data[l.index].uv = (0.999, 0.999 - (co.z - 0.6) * 0.01)  # parked outside print zones
    for p in me.polygons: p.use_smooth = True

# origin = centre of the hook curl, i.e. the point that rests on the rail
for o in scn.objects:
    o.location -= hc
root = bpy.data.objects.new("TShirtTemplate", None); scn.collection.objects.link(root)
for o in (shirt, collar, wood, hook): o.parent = root
root["template"] = "tshirt-template-v1"

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_extras=True,
                          export_image_format="AUTO")
if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
tri = sum(len(o.data.polygons) for o in (shirt, collar, wood, hook))
print("TEMPLATE_DONE", OUT_GLB, "faces", tri, "shirt verts", len(shirt.data.vertices))
