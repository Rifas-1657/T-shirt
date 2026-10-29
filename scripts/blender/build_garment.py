"""Garment templates v2: half-sleeve tee, full-sleeve tee, oversized tee, hoodie.

Usage:
  blender -b --factory-startup -P scripts/blender/build_garment.py -- <category> <out.glb> <out_meta.json> [out.blend] [--no-sim]

Pipeline (all reproducible, no external assets):
  1. pattern-like outline per category -> constrained Delaunay front/back panels -> inflated, welded body
  2. print-atlas UVs assigned on the flat pattern (so artwork follows the fabric through the drape)
  3. cloth simulation: shoulders pinned to the hanger, gravity + light pressure -> natural hanging folds
  4. trims built on the *simulated* surface: rib collar along the real neck opening, hoodie hood,
     kangaroo pocket (duplicated body patch), drawstrings with metal aglets, hanger
  5. textures: heather base colour, detail normal map (jersey grain, rib bands, twin-needle hem
     stitching, shoulder/armhole seams, pocket topstitch), Cycles-baked ambient occlusion
  6. glTF export + JSON sidecar with the print zones in UV space (read by the web app)

Conventions: Blender Z-up metres, garment front faces -Y, x to the viewer's right. glTF export
makes the front face +Z in three.js. UV0 atlas is 2:1: front panel in u [0, .5], back panel in
u [.5, 1] mirrored so text reads correctly from behind; v = (z - Z0) / SPAN (isotropic).
"""
import bpy, bmesh, sys, os, math, json, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
flags = {a for a in argv if a.startswith("--")}
args = [a for a in argv if not a.startswith("--")]
CAT = args[0] if args else "half-sleeve"
OUT_GLB = os.path.abspath(args[1] if len(args) > 1 else f"{CAT}.glb")
OUT_META = os.path.abspath(args[2] if len(args) > 2 else f"{CAT}.json")
OUT_BLEND = os.path.abspath(args[3]) if len(args) > 3 else None
SIM = "--no-sim" not in flags
T0 = time.time()

def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)

# ------------------------------------------------------------------ category definitions
# Outlines: right half, (x, z) metres, from back-neck centre clockwise to hem centre.
# 'neck_end' = index of the neck/shoulder point; points before it form the back neckline.
CATS = {
    "half-sleeve": dict(
        label="Half-sleeve T-shirt",
        outline=[(0.000, 0.700), (0.040, 0.704), (0.072, 0.712), (0.090, 0.722), (0.150, 0.704), (0.215, 0.682),
                 (0.258, 0.650), (0.300, 0.604), (0.338, 0.560), (0.318, 0.536), (0.296, 0.512), (0.276, 0.490),
                 (0.262, 0.500), (0.256, 0.470), (0.258, 0.380), (0.262, 0.200), (0.266, 0.040), (0.266, 0.004),
                 (0.200, 0.000), (0.100, -0.003), (0.000, -0.004)],
        neck_end=3, scoop=0.078, thick=0.021, round=0.045, span=0.80, z0=-0.04,
        cuffs=[((0.338, 0.560), (0.276, 0.490))], cuff_rib=False, hem_rib=0.0,
        armhole=((0.215, 0.682), (0.262, 0.500)),
        zones=dict(front=(-0.15, 0.15, 0.17, 0.57), back=(-0.15, 0.15, 0.16, 0.61)),
        collar_r=0.0055, fabric=dict(rough=0.9, sheen=0.12, normal=0.55), hood=False, pocket=None,
    ),
    "full-sleeve": dict(
        label="Full-sleeve T-shirt",
        outline=[(0.000, 0.700), (0.040, 0.704), (0.072, 0.712), (0.090, 0.722), (0.150, 0.704), (0.215, 0.682),
                 (0.262, 0.640), (0.300, 0.560), (0.330, 0.440), (0.352, 0.300), (0.366, 0.160), (0.374, 0.092),
                 (0.336, 0.084), (0.298, 0.078),
                 (0.292, 0.160), (0.284, 0.300), (0.276, 0.420), (0.268, 0.488),
                 (0.262, 0.470), (0.258, 0.380), (0.262, 0.200), (0.266, 0.040), (0.266, 0.004),
                 (0.200, 0.000), (0.100, -0.003), (0.000, -0.004)],
        neck_end=3, scoop=0.078, thick=0.021, round=0.045, span=0.80, z0=-0.04,
        cuffs=[((0.374, 0.092), (0.298, 0.078))], cuff_rib=0.055, hem_rib=0.0,
        armhole=((0.215, 0.682), (0.268, 0.488)),
        zones=dict(front=(-0.15, 0.15, 0.17, 0.57), back=(-0.15, 0.15, 0.16, 0.61)),
        collar_r=0.0055, fabric=dict(rough=0.9, sheen=0.12, normal=0.55), hood=False, pocket=None,
    ),
    "oversized": dict(
        label="Oversized T-shirt",
        outline=[(0.000, 0.775), (0.045, 0.779), (0.080, 0.788), (0.100, 0.798), (0.180, 0.776), (0.255, 0.746),
                 (0.300, 0.724), (0.345, 0.692), (0.395, 0.648), (0.440, 0.600),
                 (0.380, 0.537), (0.322, 0.476),
                 (0.306, 0.470), (0.300, 0.430), (0.300, 0.200), (0.302, 0.040), (0.302, 0.004),
                 (0.200, 0.000), (0.100, -0.002), (0.000, -0.003)],
        neck_end=3, scoop=0.082, thick=0.025, round=0.05, span=0.92, z0=-0.04,
        cuffs=[((0.440, 0.600), (0.322, 0.476))], cuff_rib=False, hem_rib=0.0,
        armhole=((0.300, 0.724), (0.306, 0.470)),
        zones=dict(front=(-0.17, 0.17, 0.20, 0.64), back=(-0.17, 0.17, 0.18, 0.68)),
        collar_r=0.0075, fabric=dict(rough=0.92, sheen=0.16, normal=0.6), hood=False, pocket=None,
    ),
    "hoodie": dict(
        label="Hoodie",
        outline=[(0.000, 0.705), (0.050, 0.710), (0.085, 0.720), (0.105, 0.732), (0.170, 0.712), (0.240, 0.690),
                 (0.285, 0.640), (0.320, 0.560), (0.348, 0.440), (0.366, 0.300), (0.378, 0.170), (0.382, 0.130),
                 (0.374, 0.075), (0.340, 0.070), (0.306, 0.066),
                 (0.308, 0.125), (0.300, 0.300), (0.292, 0.420), (0.290, 0.480),
                 (0.285, 0.460), (0.285, 0.300), (0.287, 0.110), (0.272, 0.060), (0.268, 0.004),
                 (0.200, 0.000), (0.100, -0.002), (0.000, -0.003)],
        neck_end=3, scoop=0.07, thick=0.034, round=0.06, span=0.82, z0=-0.04,
        cuffs=[((0.374, 0.075), (0.306, 0.066))], cuff_rib=0.065, hem_rib=0.07,
        armhole=((0.240, 0.690), (0.290, 0.480)),
        zones=dict(front=(-0.13, 0.13, 0.36, 0.60), back=(-0.16, 0.16, 0.10, 0.42)),
        collar_r=0.0, fabric=dict(rough=0.95, sheen=0.3, normal=0.7), hood=True,
        pocket=[(-0.16, 0.110), (0.16, 0.110), (0.135, 0.300), (-0.135, 0.300)],
    ),
}
C = CATS[CAT]
SPAN, Z0 = C["span"], C["z0"]
GRID = 0.0068
HALF = C["outline"]
NECK_END = C["neck_end"]
THICK, ROUND = C["thick"], C["round"]

# ------------------------------------------------------------------ 2D helpers
def densify(loop, step, closed=True):
    out = []
    n = len(loop)
    for i in range(n if closed else n - 1):
        a, b = Vector(loop[i]), Vector(loop[(i + 1) % n])
        seg = max(1, int((b - a).length / step))
        for k in range(seg):
            out.append(tuple(a.lerp(b, k / seg)))
    if not closed:
        out.append(tuple(loop[-1]))
    return out

def mirror_full(half):
    return half + [(-x, z) for (x, z) in reversed(half[1:-1])]

def front_scoop(n=30):
    x0, z0 = HALF[NECK_END]
    pts = []
    for i in range(n + 1):
        t = math.pi * i / n
        pts.append((x0 * math.cos(t), z0 - C["scoop"] * math.sin(t) ** 1.15))
    return pts

def point_in_poly(p, poly):
    x, y = p; inside = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside

def seg_dist(P, a, b):
    """distance from points P (N,2) to segment ab, plus the projection parameter t."""
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    t = np.clip(((P - a) @ ab) / (ab @ ab + 1e-12), 0, 1)
    return np.linalg.norm(a + t[:, None] * ab - P, axis=1), t

OUTLINE = mirror_full(HALF)
right_from_neck = HALF[NECK_END:]
left_to_neck = [(-x, z) for (x, z) in reversed(HALF[NECK_END:-1])]
FRONT_OUTLINE = right_from_neck + left_to_neck + list(reversed(front_scoop()))[1:-1]
OUT_D = np.array(densify(OUTLINE, GRID * 0.5))

def dist_to_outline(P):
    a = OUT_D; b = np.roll(OUT_D, -1, axis=0); ab = b - a
    res = np.empty(len(P))
    for i in range(0, len(P), 2048):
        p = P[i:i + 2048][:, None, :]
        t = np.clip(((p - a) * ab).sum(-1) / ((ab * ab).sum(-1) + 1e-12), 0, 1)
        res[i:i + 2048] = np.min(np.linalg.norm(a + ab * t[..., None] - p, axis=-1), axis=1)
    return res

def build_panel(poly, sign):
    bnd = densify(poly, GRID)
    xmax = max(abs(x) for x, _ in poly) + GRID
    zmin = min(z for _, z in poly) - GRID; zmax = max(z for _, z in poly) + GRID
    interior = []
    for j, z in enumerate(np.arange(zmin, zmax, GRID * 0.866)):
        off = GRID * 0.5 if j % 2 else 0.0
        for x in np.arange(-xmax, xmax, GRID):
            p = (x + off, z)
            if point_in_poly(p, poly):
                interior.append(p)
    pts2 = bnd + interior
    edges = [(i, (i + 1) % len(bnd)) for i in range(len(bnd))]
    vco, _, faces, _, _, _ = delaunay_2d_cdt([Vector(p) for p in pts2], edges, [list(range(len(bnd)))], 1, 1e-6)
    P = np.array([[v.x, v.y] for v in vco])
    d = dist_to_outline(P)
    r = np.clip(d / ROUND, 0, 1)
    prof = np.sqrt(1 - (1 - r) ** 2)
    x, z = P[:, 0], P[:, 1]
    top = max(zz for _, zz in HALF)
    taper = 0.45 + 0.55 * np.clip((z - 0.05) / (top - 0.08), 0, 1) ** 1.5
    y = sign * THICK * prof * taper
    # seam vertices must sit exactly on y = 0 so the front and back panels weld (sqrt amplifies float noise)
    y[d < 1e-5] = 0.0
    return [Vector((x[i], y[i], z[i])) for i in range(len(x))], faces

def atlas_uv(x, z, front):
    u = 0.5 * (x / SPAN + 0.5) if front else 0.5 + 0.5 * (-x / SPAN + 0.5)
    return (u, (z - Z0) / SPAN)

# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

def link(ob):
    scn.collection.objects.link(ob)
    return ob

def activate(ob):
    for o in scn.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob

# ------------------------------------------------------------------ body
log("building panels", CAT)
bm = bmesh.new()
uvl = bm.loops.layers.uv.new("UVMap")
tag = bm.faces.layers.int.new("front")
for poly, sign, front in ((FRONT_OUTLINE, -1, True), (OUTLINE, +1, False)):
    verts, faces = build_panel(poly, sign)
    bv = [bm.verts.new(v) for v in verts]
    for f in faces:
        vs = [bv[i] for i in f]
        if not front:
            vs = vs[::-1]
        try:
            face = bm.faces.new(vs)
        except ValueError:
            continue
        face[tag] = 1 if front else 0
bm.verts.ensure_lookup_table()
bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if abs(v.co.y) < 1e-7], dist=GRID * 0.05)
bm.normal_update()
for f in bm.faces:
    want = -1 if f[tag] == 1 else 1
    if f.normal.y * want < 0:
        f.normal_flip()
for f in bm.faces:
    for l in f.loops:
        l[uvl].uv = atlas_uv(l.vert.co.x, l.vert.co.z, f[tag] == 1)
me = bpy.data.meshes.new("Shirt")
bm.to_mesh(me); bm.free()
body = link(bpy.data.objects.new("Shirt", me))
for p in me.polygons:
    p.use_smooth = True
log("body verts", len(me.vertices), "faces", len(me.polygons))

# hanger path (wood arms) — just under the shoulder line
SH = HALF[NECK_END + 2]   # shoulder point
NK = HALF[NECK_END]
def hanger_z(x):
    ax = abs(x)
    if ax <= NK[0]:
        return NK[1] - 0.012
    t = min(1.0, (ax - NK[0]) / max(1e-6, SH[0] - 0.02 - NK[0]))
    return (NK[1] - 0.012) * (1 - t) + (SH[1] - 0.026) * t

# ------------------------------------------------------------------ cloth simulation
if SIM:
    vg = body.vertex_groups.new(name="pin")
    pin = []
    for v in me.vertices:
        x, z = v.co.x, v.co.z
        if abs(x) <= SH[0] - 0.015 and z >= hanger_z(x) - 0.004:
            pin.append(v.index)
    vg.add(pin, 1.0, "REPLACE")
    log("pinned", len(pin))
    mod = body.modifiers.new("Cloth", "CLOTH")
    s = mod.settings
    s.quality = 6
    s.mass = 0.25
    s.tension_stiffness = 40
    s.compression_stiffness = 40
    s.shear_stiffness = 12
    # stiffer fabric = clean, retail-pressed drape (few large folds) instead of crumpled cloth
    s.bending_stiffness = 2.5 if CAT != "hoodie" else 8.0
    s.air_damping = 2.0
    s.vertex_group_mass = "pin"
    s.pin_stiffness = 1.0
    s.use_pressure = True
    s.uniform_pressure_force = 0.3 if CAT != "hoodie" else 0.45
    s.pressure_factor = 1.0
    cs = mod.collision_settings
    cs.use_collision = False
    cs.use_self_collision = True
    cs.self_distance_min = 0.0025
    cs.collision_quality = 2
    frames = 30
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = frames
    scn.frame_start, scn.frame_end = 1, frames
    for f in range(1, frames + 1):
        scn.frame_set(f)
        if f % 6 == 0:
            log("sim frame", f)
    activate(body)
    with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    sm = body.modifiers.new("Smooth", "CORRECTIVE_SMOOTH")
    sm.factor, sm.iterations, sm.smooth_type = 0.7, 10, "LENGTH_WEIGHTED"
    with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body]):
        bpy.ops.object.modifier_apply(modifier=sm.name)
    body.vertex_groups.clear()
    log("sim applied")

me = body.data
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())

# neck opening = the body's only boundary loop
def boundary_loop(mesh):
    """Walks every boundary loop (bounded by a visited set) and returns the neck: the highest long loop."""
    bm2 = bmesh.new(); bm2.from_mesh(mesh)
    adj = {}
    for e in bm2.edges:
        if e.is_boundary:
            a, b = e.verts
            adj.setdefault(a.index, []).append(b.index); adj.setdefault(b.index, []).append(a.index)
    seen, loops = set(), []
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while cur is not None and cur not in seen:
            seen.add(cur); loop.append(cur)
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            prev, cur = cur, (nxt[0] if nxt else None)
        loops.append(loop)
    bm2.free()
    log("boundary loops", [len(l) for l in loops])
    loops = [l for l in loops if len(l) >= 12] or loops
    best = max(loops, key=lambda l: sum(mesh.vertices[i].co.z for i in l) / len(l) + len(l) * 1e-4)
    return [mesh.vertices[i].co.copy() for i in best]

def resample(pts, step, closed=True):
    out = []
    seq = pts + ([pts[0]] if closed else [])
    for i in range(len(seq) - 1):
        a, b = seq[i], seq[i + 1]
        n = max(1, int((b - a).length / step))
        for k in range(n):
            out.append(a.lerp(b, k / n))
    if not closed:
        out.append(seq[-1])
    return out

def smooth_path(pts, it=3, closed=True):
    p = [v.copy() for v in pts]
    for _ in range(it):
        q = []
        n = len(p)
        for i in range(n):
            if not closed and (i == 0 or i == n - 1):
                q.append(p[i]); continue
            q.append(p[i] * 0.5 + (p[i - 1] + p[(i + 1) % n]) * 0.25)
        p = q
    return p

def tube(name, path, radius, closed=False, ring=10, squash=1.0, uv_period=0.024, up=Vector((0, 0, 1)), radius_fn=None):
    """Swept tube with UVs (u along the path / uv_period, v around) for tiled rib/knit textures."""
    bm3 = bmesh.new(); uvl3 = bm3.loops.layers.uv.new("UVMap")
    n = len(path); rings = []; arc = [0.0]
    for i in range(1, n):
        arc.append(arc[-1] + (path[i] - path[i - 1]).length)
    for i, p in enumerate(path):
        if closed:
            tan = (path[(i + 1) % n] - path[i - 1]).normalized()
        else:
            tan = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        side = tan.cross(up)
        if side.length < 1e-4:
            side = tan.cross(Vector((0, 1, 0)))
        side.normalize(); nrm = side.cross(tan).normalized()
        r = radius * (radius_fn(i / max(1, n - 1)) if radius_fn else 1.0)
        rings.append([bm3.verts.new(p + (side * math.cos(a) * r + nrm * math.sin(a) * r * squash))
                      for a in (2 * math.pi * k / ring for k in range(ring))])
    segs = n if closed else n - 1
    for i in range(segs):
        A, B = rings[i], rings[(i + 1) % n]
        u0, u1 = arc[i] / uv_period, (arc[i] + (path[(i + 1) % n] - path[i]).length) / uv_period
        for k in range(ring):
            k2 = (k + 1) % ring
            f = bm3.faces.new((A[k], A[k2], B[k2], B[k]))
            for l, (uu, vv) in zip(f.loops, ((u0, k / ring), (u0, (k + 1) / ring), (u1, (k + 1) / ring), (u1, k / ring))):
                l[uvl3].uv = (uu, vv)
    if not closed:
        for R in (rings[0], rings[-1][::-1]):
            try:
                cap = bm3.faces.new(R[::-1] if R is rings[0] else R)
                for l in cap.loops:
                    l[uvl3].uv = (0, 0)
            except ValueError:
                pass
    bm3.normal_update()
    m3 = bpy.data.meshes.new(name); bm3.to_mesh(m3); bm3.free()
    for p in m3.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, m3))

def surface_point(x, z, side, offset):
    """Point on the simulated body surface seen from the front (side=-1) or back (+1), pushed out by offset."""
    origin = Vector((x, side * 1.0, z)); direction = Vector((0, -side, 0))
    hit = bvh.ray_cast(origin, direction)
    if hit[0] is None:
        return Vector((x, side * THICK, z))
    return hit[0] + Vector((0, side * offset, 0))

neck = boundary_loop(me)
neck = smooth_path(resample(neck, 0.006), 2)
trims = []
if C["collar_r"] > 0:
    collar = tube("Collar", neck, C["collar_r"], closed=True, ring=12, squash=0.75, uv_period=0.024)
    trims.append(collar)

hood = None
if C["hood"]:
    # rolled hood edge around the neck, the hood itself lying down the back
    ring = tube("HoodEdge", neck, 0.016, closed=True, ring=14, squash=0.8, uv_period=0.024)
    trims.append(ring)
    hb = bmesh.new(); huv = hb.loops.layers.uv.new("UVMap")
    hood_outline = [(0.0, 0.43)] + [(0.175 * math.sin(t), 0.43 + 0.40 * (1 - math.cos(t)) * 0.5 + 0.05 * math.sin(t))
                                   for t in np.linspace(0.15, math.pi - 0.05, 16)]
    hood_outline = [(x, z) for (x, z) in hood_outline]
    hood_poly = hood_outline + [(-x, z) for (x, z) in reversed(hood_outline[1:])]
    hpts = densify(hood_poly, 0.008)
    inter = [(x, z) for z in np.arange(0.43, 0.86, 0.008) for x in np.arange(-0.2, 0.2, 0.008) if point_in_poly((x, z), hood_poly)]
    vco, _, faces, _, _, _ = delaunay_2d_cdt([Vector(p) for p in hpts + inter], [(i, (i + 1) % len(hpts)) for i in range(len(hpts))], [list(range(len(hpts)))], 1, 1e-6)
    HP = np.array([[v.x, v.y] for v in vco])
    hd, _ = np.full(len(HP), 1.0), None
    hd = np.min(np.stack([seg_dist(HP, hpts[i], hpts[(i + 1) % len(hpts)])[0] for i in range(len(hpts))]), axis=0)
    hprof = np.sqrt(1 - (1 - np.clip(hd / 0.05, 0, 1)) ** 2)
    for side in (+1, -1):
        bv = []
        for i, (x, z) in enumerate(HP):
            base = surface_point(x, min(z, 0.70), +1, 0.004)
            yb = base.y + 0.022 + 0.018 * hprof[i] * (1 if side > 0 else -0.2)
            bv.append(hb.verts.new((x, yb + (0.012 * (z - 0.43)), z if z < 0.70 else 0.70 + (z - 0.70) * 0.6)))
        for f in faces:
            vs = [bv[i] for i in f]
            if side < 0:
                vs = vs[::-1]
            try:
                hb.faces.new(vs)
            except ValueError:
                pass
    bmesh.ops.remove_doubles(hb, verts=hb.verts, dist=0.0015)
    bmesh.ops.recalc_face_normals(hb, faces=hb.faces)
    for f in hb.faces:
        for l in f.loops:
            l[huv].uv = atlas_uv(l.vert.co.x, l.vert.co.z, False)
    hm = bpy.data.meshes.new("Hood"); hb.to_mesh(hm); hb.free()
    for p in hm.polygons:
        p.use_smooth = True
    hood = link(bpy.data.objects.new("Hood", hm))
    # drawstrings with aglets hanging from the hood edge
    for sx in (-1, 1):
        x0 = sx * 0.045
        top = min(neck, key=lambda v: (v.x - x0) ** 2 + (v.y + 0.5) ** 2 * 0.01 + (0 if v.y < 0 else 1))
        path = []
        for t in np.linspace(0, 1, 22):
            z = top.z - 0.02 - 0.27 * t
            x = x0 + sx * 0.012 * math.sin(t * 2.4)
            path.append(surface_point(x, z, -1, 0.012 + 0.004 * math.sin(t * 3)))
        path[0] = top + Vector((0, -0.01, -0.01))
        cord = tube(f"Cord{'L' if sx < 0 else 'R'}", smooth_path(path, 2, closed=False), 0.0034, ring=8, uv_period=0.012)
        trims.append(cord)
        end = path[-1]; d = (path[-1] - path[-2]).normalized()
        aglet = tube(f"Aglet{'L' if sx < 0 else 'R'}", [end, end + d * 0.028], 0.0042, ring=10)
        aglet["metal"] = True

pocket = None
if C["pocket"]:
    poly = C["pocket"]
    pb = bmesh.new(); pb.from_mesh(me)
    puv = pb.loops.layers.uv.active
    keep = []
    for f in pb.faces:
        c = f.calc_center_median()
        if f.normal.y < 0 and point_in_poly((c.x, c.z), poly) and c.y < 0:
            keep.append(f)
    rest = [f for f in pb.faces if f not in set(keep)]
    bmesh.ops.delete(pb, geom=rest, context="FACES")
    for v in pb.verts:
        v.co += v.normal * 0.0045
    pm = bpy.data.meshes.new("Pocket"); pb.to_mesh(pm); pb.free()
    pocket = link(bpy.data.objects.new("Pocket", pm))
    so = pocket.modifiers.new("Solid", "SOLIDIFY"); so.thickness = 0.003; so.offset = 1
    activate(pocket)
    with bpy.context.temp_override(object=pocket, active_object=pocket, selected_objects=[pocket]):
        bpy.ops.object.modifier_apply(modifier=so.name)
    for p in pocket.data.polygons:
        p.use_smooth = True

# ------------------------------------------------------------------ hanger
def build_hanger():
    path = []
    for t in np.linspace(-1, 1, 25):
        x = t * (SH[0] - 0.03)
        path.append(Vector((x, 0, hanger_z(x) - 0.004)))
    wood = tube("HangerWood", smooth_path(path, 2, closed=False), 0.0085, ring=12, squash=0.55, uv_period=0.2)
    top = Vector((0, 0, NK[1] - 0.008))
    hc = Vector((-0.018, 0, NK[1] + 0.07)); hr = 0.018
    hook = [top, top + Vector((0, 0, 0.04)), Vector((0, 0, hc.z - 0.002))]
    for k in range(0, 13):
        a = math.radians(k * 17.5)
        hook.append(Vector((hc.x + hr * math.cos(a), 0, hc.z + hr * math.sin(a))))
    metal = tube("HangerHook", smooth_path(hook, 1, closed=False), 0.0019, ring=8, uv_period=0.2)
    return wood, metal, hc
wood, hook, HOOK_C = build_hanger()

# ------------------------------------------------------------------ textures
RES_W, RES_H = 2048, 1024

def save_img(name, arr, noncolor):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    rgba = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1) if arr.shape[2] == 3 else arr
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    return img

def uv_grid(w, h):
    u = (np.arange(w) + 0.5) / w; v = (np.arange(h) + 0.5) / h
    return np.meshgrid(u, v)  # Blender image rows go bottom->top == v

def garment_xz(U, V):
    """Atlas UV -> garment (x, z, isFront)."""
    front = U < 0.5
    x = np.where(front, (U * 2 - 0.5) * SPAN, -((U - 0.5) * 2 - 0.5) * SPAN)
    z = V * SPAN + Z0
    return x, z, front

rng = np.random.default_rng(7)

def value_noise(w, h, cells, octaves=4):
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        cx, cy = cells * 2 ** o, max(1, cells // 2) * 2 ** o
        g = rng.random((cy + 1, cx + 1)).astype(np.float32)
        ys = np.linspace(0, cy, h); xs = np.linspace(0, cx, w)
        y0 = np.floor(ys).astype(int).clip(0, cy - 1); x0 = np.floor(xs).astype(int).clip(0, cx - 1)
        fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        tot += amp; amp *= 0.5
    return out / tot

def line_mask(X, Z, a, b, offset_px_m, width):
    P = np.stack([X.ravel(), Z.ravel()], 1)
    d, t = seg_dist(P, a, b)
    return d.reshape(X.shape), t.reshape(X.shape)

def make_detail_maps():
    U, V = uv_grid(RES_W, RES_H)
    X, Z, F = garment_xz(U, V)
    px = SPAN / (RES_W / 2)  # metres per pixel
    H = np.zeros_like(X, np.float32)
    # jersey/fleece grain: fine anisotropic noise (vertical wales)
    grain = value_noise(RES_W, RES_H, 220, 3) - 0.5
    wales = 0.5 + 0.5 * np.cos(2 * np.pi * X / 0.0014)
    H += 0.18 * grain + 0.06 * wales
    def groove(mask_d, centre, width, depth):
        return -depth * np.exp(-((mask_d - centre) ** 2) / (2 * width ** 2))
    def stitches(mask_d, t_along, length, centre, period=0.003):
        on = (np.mod(t_along, period) < period * 0.62).astype(np.float32)
        return 0.55 * on * np.exp(-((mask_d - centre) ** 2) / (2 * (0.00045) ** 2))
    hem_z = 0.0
    if C["hem_rib"]:
        band = (Z < hem_z + C["hem_rib"]) & (Z > hem_z - 0.01)
        H += np.where(band, 0.5 * (0.5 + 0.5 * np.cos(2 * np.pi * X / 0.0032)), 0)
        H += groove(np.abs(Z - (hem_z + C["hem_rib"])), 0, 0.0009, 0.8)
    else:
        for off in (0.018, 0.0245):  # twin-needle hem
            d = np.abs(Z - (hem_z + off))
            H += groove(d, 0, 0.0005, 0.35) + stitches(d, X, 0, 0)
    for (a, b) in C["cuffs"]:
        for sx in (1, -1):
            A = (a[0] * sx, a[1]); B = (b[0] * sx, b[1])
            d, t = line_mask(X, Z, A, B, 0, 0)
            ab = np.hypot(B[0] - A[0], B[1] - A[1])
            if C["cuff_rib"]:
                band = d < C["cuff_rib"]
                H += np.where(band, 0.5 * (0.5 + 0.5 * np.cos(2 * np.pi * t * ab / 0.0032)), 0)
                H += groove(d, C["cuff_rib"], 0.0009, 0.8)
            else:
                for off in (0.016, 0.0225):
                    H += groove(d, off, 0.0005, 0.35) + stitches(d, t * ab, 0, off)
    # shoulder seams (neck point -> shoulder point) and set-in armhole seams
    for sx in (1, -1):
        d, t = line_mask(X, Z, (NK[0] * sx, NK[1]), (SH[0] * sx, SH[1]), 0, 0)
        H += groove(d, 0, 0.0008, 0.7)
        A, B = C["armhole"]
        d, t = line_mask(X, Z, (A[0] * sx, A[1]), (B[0] * sx, B[1]), 0, 0)
        H += groove(d, 0, 0.0009, 0.6) + stitches(d, t * 0.25, 0, 0.004)
    # neckline topstitch (front scoop on the front panel, back neck on the back panel)
    if C["collar_r"] > 0 or C["hood"]:
        sc = np.array(front_scoop(60)); bk = np.array(densify(HALF[:NECK_END + 1][::-1] + [(-x, z) for x, z in HALF[1:NECK_END + 1]], 0.004, closed=False))
        for pts, mask in ((sc, F), (bk, ~F)):
            P = np.stack([X.ravel(), Z.ravel()], 1)
            best = np.full(len(P), 9.0)
            for i in range(len(pts) - 1):
                d, _ = seg_dist(P, pts[i], pts[i + 1]); best = np.minimum(best, d)
            best = best.reshape(X.shape)
            H += np.where(mask, groove(best, 0.009, 0.0005, 0.35) + stitches(best, X + Z, 0, 0.009), 0)
    if C["pocket"]:
        pk = C["pocket"] + [C["pocket"][0]]
        P = np.stack([X.ravel(), Z.ravel()], 1)
        best = np.full(len(P), 9.0); along = np.zeros(len(P))
        for i in range(len(pk) - 1):
            d, t = seg_dist(P, pk[i], pk[i + 1]); better = d < best
            best = np.where(better, d, best); along = np.where(better, t * 0.3 + i, along)
        best = best.reshape(X.shape); along = along.reshape(X.shape)
        H += np.where(F, groove(best, 0.006, 0.0005, 0.45) + stitches(best, along * 0.3, 0, 0.006), 0)
    # height -> tangent-space normal
    gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / 2
    gy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) / 2
    k = 1.6
    N = np.stack([-gx * k, -gy * k, np.ones_like(H)], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    normal = save_img("DetailNormal", (N * 0.5 + 0.5).astype(np.float32), True)
    # heathered base colour: near-white with slub streaks; tinted at runtime by the product colour
    hw, hh = RES_W // 2, RES_H // 2
    hn = value_noise(hw, hh, 180, 3)
    slub = value_noise(hw, hh, 60, 2)
    shade = 0.93 + 0.05 * (hn - 0.5) + 0.03 * np.clip((slub - 0.62) * 4, 0, 1)
    base = np.repeat(np.clip(shade, 0, 1)[..., None], 3, -1).astype(np.float32)
    basecol = save_img("Heather", base, False)
    return normal, basecol

def rib_normal():
    s = 256
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    h = 0.5 + 0.5 * np.cos(2 * np.pi * xx / (s / 8))
    h += 0.08 * (value_noise(s, s, 32, 2) - 0.5)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)); gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0))
    N = np.stack([-gx * 2.5, -gy * 2.5, np.ones_like(h)], -1); N /= np.linalg.norm(N, axis=-1, keepdims=True)
    return save_img("RibNormal", (N * 0.5 + 0.5).astype(np.float32), True)

log("generating textures")
DETAIL_N, HEATHER = make_detail_maps()
RIB_N = rib_normal()

# ------------------------------------------------------------------ materials
def principled(name, color, rough, metal=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = 0.3 if metal == 0 else 0.5
    if sheen and "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (1, 1, 1, 1)
    return m, b

def add_normal(m, b, img, strength, uv_scale=1.0):
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    if uv_scale != 1.0:
        mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (uv_scale, uv_scale, 1)
        uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"
        nt.links.new(uv.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])

FAB = C["fabric"]
fabric, fb = principled("Fabric", (1, 1, 1), FAB["rough"], sheen=FAB["sheen"])
ht = fabric.node_tree.nodes.new("ShaderNodeTexImage"); ht.image = HEATHER
fabric.node_tree.links.new(ht.outputs["Color"], fb.inputs["Base Color"])
add_normal(fabric, fb, DETAIL_N, FAB["normal"])
rib, rb = principled("Rib", (1, 1, 1), 0.9, sheen=FAB["sheen"])
add_normal(rib, rb, RIB_N, 0.8)
woodm, _ = principled("HangerWood", (0.36, 0.2, 0.1), 0.42)
chrome, _ = principled("HangerChrome", (0.88, 0.88, 0.86), 0.16, metal=1.0)
aglet_m, _ = principled("Aglet", (0.75, 0.72, 0.66), 0.25, metal=1.0)

for ob in [body] + ([hood] if hood else []) + ([pocket] if pocket else []):
    ob.data.materials.clear(); ob.data.materials.append(fabric)
for ob in trims:
    ob.data.materials.append(rib)
wood.data.materials.append(woodm); hook.data.materials.append(chrome)
for ob in scn.objects:
    if ob.get("metal"):
        ob.data.materials.append(aglet_m)

# ------------------------------------------------------------------ ambient occlusion bake (body)
log("baking AO")
scn.render.engine = "CYCLES"
scn.cycles.samples = 48
scn.cycles.device = "CPU"
ao_img = bpy.data.images.new("AO", 1024, 512, alpha=False)
ao_img.colorspace_settings.name = "Non-Color"
nt = fabric.node_tree
ao_node = nt.nodes.new("ShaderNodeTexImage"); ao_node.image = ao_img
nt.nodes.active = ao_node
for ob in (hood, pocket):
    if ob:
        ob.hide_render = True
activate(body)
scn.render.bake.margin = 6
scn.world = bpy.data.worlds.new("bakeWorld")
bpy.ops.object.bake(type="AO")
for ob in (hood, pocket):
    if ob:
        ob.hide_render = False
ao_img.pack()
# expose AO to the glTF exporter through the "glTF Material Output" group (occlusion socket)
grp = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
if not grp.interface.items_tree:
    grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
for m in (fabric,):
    g = m.node_tree.nodes.new("ShaderNodeGroup"); g.node_tree = grp
    sep = m.node_tree.nodes.new("ShaderNodeSeparateColor")
    m.node_tree.links.new(ao_node.outputs["Color"], sep.inputs["Color"])
    m.node_tree.links.new(sep.outputs[0], g.inputs["Occlusion"])
log("AO done")

# ------------------------------------------------------------------ origin at the hook curl, export
root = link(bpy.data.objects.new(f"Garment_{CAT}", None))
for ob in list(scn.objects):
    if ob is root:
        continue
    if ob.type == "MESH":
        ob.data.transform(__import__("mathutils").Matrix.Translation(-HOOK_C))
        ob.parent = root
root["template"] = f"{CAT}-v2"

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_extras=True, export_image_format="AUTO")
if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

# sidecar: everything the web app needs to know about this template
def zone(zid, rect, label):
    x0, x1, z0, z1 = rect
    if zid == "front":
        u0, u1 = 0.5 * (x0 / SPAN + 0.5), 0.5 * (x1 / SPAN + 0.5)
    else:
        u0, u1 = 0.5 + 0.5 * (-x1 / SPAN + 0.5), 0.5 + 0.5 * (-x0 / SPAN + 0.5)
    return dict(id=zid, label=label, widthCm=round((x1 - x0) * 100, 1), heightCm=round((z1 - z0) * 100, 1),
                uvRect=dict(u0=u0, v0=(z0 - Z0) / SPAN, u1=u1, v1=(z1 - Z0) / SPAN))

bb = [Vector(c) for ob in (body,) for c in ob.bound_box]
size = Vector((max(v.x for v in bb) - min(v.x for v in bb), max(v.y for v in bb) - min(v.y for v in bb), max(v.z for v in bb) - min(v.z for v in bb)))
centre = sum(bb, Vector()) / len(bb)
meta = dict(
    id=CAT, label=C["label"], version=2,
    printableMeshes=["Shirt"],
    colorableMaterials=["Fabric", "Rib"],
    printZones=[zone("front", C["zones"]["front"], "Front"), zone("back", C["zones"]["back"], "Back")],
    span=SPAN, z0=Z0,
    # hit box and camera framing in three.js space (metres, origin at the hook curl)
    size=[round(size.x, 4), round(size.z, 4), round(size.y, 4)],
    centerDrop=round(-(centre.z), 4),
    simulated=SIM,
    triangles=sum(len(o.data.polygons) for o in scn.objects if o.type == "MESH"),
)
with open(OUT_META, "w") as f:
    json.dump(meta, f, indent=2)
log("DONE", OUT_GLB, meta["triangles"], "tris")
print("GARMENT_DONE", json.dumps(meta))
