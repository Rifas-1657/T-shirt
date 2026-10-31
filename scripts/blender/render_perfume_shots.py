"""Photoreal studio product shots of the seed perfumes (Cycles).

Usage:
  blender -b --factory-startup -P scripts/blender/render_perfume_shots.py -- <out_dir> [SKU ...] [--samples N] [--views front,side]

For each perfume: imports its bottle GLB (public/models/perfume/<bottle>.glb), applies photoreal
materials (glass, coloured juice, metal / onyx cap), adds a maroon label with gold serif text,
and renders front / three-quarter / side / back views on a seamless light sweep.
Writes <out_dir>/<SKU>/<view>.png and <out_dir>/manifest.json.
The bottle (not the camera) turns between views so the lighting stays identical, like a turntable.
"""
import bpy, bmesh, sys, os, math, json, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "public", "models", "perfume")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else os.path.join(ROOT, "assets", "processed", "perfume-shots"))
SAMPLES, ONLY, VIEWS_ONLY = 192, [], None
i = 1
while i < len(argv):
    a = argv[i]
    if a == "--samples":
        SAMPLES = int(argv[i + 1]); i += 2; continue
    if a == "--views":
        VIEWS_ONLY = argv[i + 1].split(","); i += 2; continue
    ONLY.append(a); i += 1

FONT = next((f for f in ["C:/Windows/Fonts/georgia.ttf", "C:/Windows/Fonts/times.ttf"] if os.path.exists(f)), None)

METALS = {"gold": "#d2b06a", "rose gold": "#d9a08b", "silver": "#d9dadc"}
PERFUMES = [
    dict(sku="MDP-QASR-OUD", bottle="qasr", liquid="#8a4a12", cap="gold", name="QASR OUD", conc="EXTRAIT DE PARFUM", vol="100 ML"),
    dict(sku="MDP-WARD-TAIF", bottle="ward", liquid="#e39aa8", cap="rose gold", name="WARD TAIFI", conc="EAU DE PARFUM", vol="75 ML"),
    dict(sku="MDP-MAJLIS-NOIR", bottle="majlis", liquid="#7a0f24", cap="onyx", name="MAJLIS NOIR", conc="PARFUM", vol="50 ML"),
    dict(sku="MDP-DOHA-PEARL", bottle="ward", liquid="#f1e8da", cap="silver", name="DOHA PEARL", conc="EAU DE PARFUM", vol="100 ML"),
    dict(sku="MDP-SADU-SAFFRON", bottle="majlis", liquid="#d68a1c", cap="gold", name="SADU SAFFRON", conc="EXTRAIT DE PARFUM", vol="50 ML"),
]
# view name -> bottle yaw (degrees). Negative turns the bottle's front towards the camera's left.
VIEWS = [("front", 0.0), ("three-quarter", -35.0), ("side", -90.0), ("back", 180.0)]
BG = "#f4f2ef"
SWEEP_EMISSION = float(os.environ.get("SWEEP_EMISSION", "5.0"))   # backdrop glow (camera-visible)
LIGHT_SCALE = float(os.environ.get("LIGHT_SCALE", "0.05"))       # global scale on the area-light watts
AO_DIST = float(os.environ.get("AO_DIST", "0.035"))
AO_STRENGTH = float(os.environ.get("AO_STRENGTH", "0.45"))
TRANSMISSION_GLOW = float(os.environ.get("TRANSMISSION_GLOW", "0.5"))
LOOK = os.environ.get("LOOK", "AgX - Medium High Contrast")


def lin(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for k in range(3):
        c = int(h[2 * k:2 * k + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# ------------------------------------------------------------------ render setup
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = "CYCLES"


def setup_device():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type == kind]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == kind
                scn.cycles.device = "GPU"
                return kind, [d.name for d in devs]
        except Exception:
            continue
    prefs.compute_device_type = "NONE"
    scn.cycles.device = "CPU"
    return "CPU", []


DEVICE, DEVNAMES = setup_device()
print("RENDER_DEVICE", DEVICE, DEVNAMES)
cy = scn.cycles
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.01
cy.use_denoising = True
cy.denoiser = "OPTIX" if DEVICE == "OPTIX" else "OPENIMAGEDENOISE"
cy.max_bounces = 32
cy.diffuse_bounces = 4
cy.glossy_bounces = 12
cy.transmission_bounces = 32
cy.transparent_max_bounces = 32
cy.volume_bounces = 2
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 0.5
cy.sample_clamp_indirect = 8.0
scn.render.resolution_x, scn.render.resolution_y = 1200, 1600
scn.render.resolution_percentage = 100
scn.render.film_transparent = False
scn.render.image_settings.file_format = "PNG"
scn.render.image_settings.color_mode = "RGB"
scn.render.image_settings.color_depth = "8"
scn.view_settings.view_transform = "AgX"
scn.view_settings.look = "None"
if LOOK:
    try:
        scn.view_settings.look = LOOK
    except TypeError as e:
        print("LOOK_UNAVAILABLE", e)
scn.view_settings.exposure = 0.0
scn.view_settings.gamma = 1.0

scn.world = bpy.data.worlds.new("Studio")
scn.world.use_nodes = True
wbg = scn.world.node_tree.nodes["Background"]
wbg.inputs["Color"].default_value = (*lin(BG), 1)
wbg.inputs["Strength"].default_value = 0.25


def link(ob):
    scn.collection.objects.link(ob)
    return ob


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes["Principled BSDF"]


# ------------------------------------------------------------------ studio: seamless sweep
def build_sweep():
    """Floor curving up into a back wall (profile in YZ, extruded along X)."""
    prof = [(-3.0, 0.0), (-1.0, 0.0), (0.0, 0.0), (0.25, 0.0)]
    r, cy0 = 0.45, 0.25
    for k in range(1, 25):
        t = k / 24 * math.pi / 2
        prof.append((cy0 + r * math.sin(t), r * (1 - math.cos(t))))
    prof += [(cy0 + r, 1.2), (cy0 + r, 3.0)]
    bm = bmesh.new()
    rows = []
    for x in (-3.0, 3.0):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for k in range(len(prof) - 1):
        bm.faces.new((rows[0][k], rows[1][k], rows[1][k + 1], rows[0][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Sweep")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
        if p.normal.z < -0.01 or p.normal.y > 0.01:
            pass
    ob = link(bpy.data.objects.new("Sweep", me))
    m, n, l, b = new_mat("Sweep")
    b.inputs["Base Color"].default_value = (*lin(BG), 1)
    b.inputs["Roughness"].default_value = 0.7
    b.inputs["Specular IOR Level"].default_value = 0.1
    # Lit-backdrop look (like a backdrop lit a couple of stops over the subject): the sweep glows
    # for camera, transmission and glossy rays (plain bright frame edges, luminous glass, clean
    # reflections) but not for diffuse rays, so labels and caps are not flooded with light.
    # The diffuse part still receives the bottle's soft contact shadow.
    lp = n.new("ShaderNodeLightPath")
    g = n.new("ShaderNodeMath"); g.operation = "MULTIPLY"; g.inputs[1].default_value = 0.7
    l.new(lp.outputs["Is Glossy Ray"], g.inputs[0])
    # seen through the juice the backdrop is dimmer, so coloured liquids are not washed out
    # (AgX desaturates very bright values towards white)
    tq = n.new("ShaderNodeMath"); tq.operation = "MULTIPLY"; tq.inputs[1].default_value = TRANSMISSION_GLOW
    l.new(lp.outputs["Is Transmission Ray"], tq.inputs[0])
    m1 = n.new("ShaderNodeMath"); m1.operation = "MAXIMUM"
    l.new(lp.outputs["Is Camera Ray"], m1.inputs[0]); l.new(tq.outputs[0], m1.inputs[1])
    m2 = n.new("ShaderNodeMath"); m2.operation = "MAXIMUM"
    l.new(m1.outputs[0], m2.inputs[0]); l.new(g.outputs[0], m2.inputs[1])
    em = n.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*lin(BG), 1)
    # reflections/refractions only see the glowing part behind and under the bottle; the floor
    # towards the camera stays a plain (dimmer) surface so metals and glass keep some contrast
    geo = n.new("ShaderNodeNewGeometry")
    sp = n.new("ShaderNodeSeparateXYZ"); l.new(geo.outputs["Position"], sp.inputs[0])
    gt = n.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = -0.12
    l.new(sp.outputs["Y"], gt.inputs[0])
    m3 = n.new("ShaderNodeMath"); m3.operation = "MAXIMUM"
    l.new(gt.outputs[0], m3.inputs[0]); l.new(lp.outputs["Is Camera Ray"], m3.inputs[1])
    m4 = n.new("ShaderNodeMath"); m4.operation = "MULTIPLY"
    l.new(m2.outputs[0], m4.inputs[0]); l.new(m3.outputs[0], m4.inputs[1])
    # soft contact shadow: ambient occlusion around the bottle base darkens the glow a little
    ao = n.new("ShaderNodeAmbientOcclusion"); ao.samples = 16; ao.inputs["Distance"].default_value = AO_DIST
    aom = n.new("ShaderNodeMapRange")
    aom.inputs["To Min"].default_value = 1.0 - AO_STRENGTH
    l.new(ao.outputs["AO"], aom.inputs["Value"])
    m5 = n.new("ShaderNodeMath"); m5.operation = "MULTIPLY"
    l.new(m4.outputs[0], m5.inputs[0]); l.new(aom.outputs["Result"], m5.inputs[1])
    st = n.new("ShaderNodeMath"); st.operation = "MULTIPLY"; st.inputs[1].default_value = SWEEP_EMISSION
    l.new(m5.outputs[0], st.inputs[0]); l.new(st.outputs[0], em.inputs["Strength"])
    add = n.new("ShaderNodeAddShader")
    l.new(b.outputs["BSDF"], add.inputs[0]); l.new(em.outputs["Emission"], add.inputs[1])
    l.new(add.outputs["Shader"], n["Material Output"].inputs["Surface"])
    me.materials.append(m)
    return ob


SWEEP = build_sweep()


def area(name, loc, target, energy, sx, sy, color=(1, 1, 1), visible=False, spread=180):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = sx, sy
    ld.energy = energy * LIGHT_SCALE
    ld.color = color
    ld.spread = math.radians(spread)
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    ob.visible_camera = visible
    return ob


def flag(name, loc, sx, sz, yaw_deg):
    """Black card (negative fill) that gives glass and metal dark edge reflections."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.scale = (sx, sz, 1)
    ob.rotation_euler = (math.radians(90), 0, math.radians(yaw_deg))
    ob.location = loc
    m, n, l, b = new_mat("Flag")
    b.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1)
    b.inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    ob.visible_camera = False
    ob.visible_shadow = False
    return ob


def build_lights(h):
    c = (0, 0, h * 0.5)
    lights = [
        # key: large softbox front-left, slightly high
        area("Key", (-0.55, -0.55, h + 0.35), c, 260, 0.9, 0.9),
        # fill: front-right, broader and weaker
        area("Fill", (0.65, -0.6, h * 0.6 + 0.1), c, 110, 1.0, 1.0),
        # rim strips: tall narrow boxes behind-left/right -> clean vertical highlights in the glass
        area("RimL", (-0.32, 0.18, h * 0.55), (0, 0, h * 0.55), 70, 0.07, 0.6),
        area("RimR", (0.32, 0.18, h * 0.55), (0, 0, h * 0.55), 70, 0.07, 0.6),
        # top: overhead box for the cap and a soft contact shadow
        area("Top", (0.0, -0.05, h + 0.6), (0, 0, 0), 120, 0.6, 0.6),
    ]
    flags = [flag("FlagL", (-0.24, 0.02, h * 0.55), 0.18, 0.5, 70), flag("FlagR", (0.24, 0.02, h * 0.55), 0.18, 0.5, -70)]
    return lights + flags


# ------------------------------------------------------------------ materials
def glass_material(name, tint=(1, 1, 1), ior=1.5, rough=0.02, absorb=None, shadow_tint=(0.92, 0.92, 0.92)):
    m, n, l, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*tint, 1)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = ior
    b.inputs["Roughness"].default_value = rough
    out = n["Material Output"]
    # light shadows through glass instead of black ones (caustics are off)
    lp = n.new("ShaderNodeLightPath")
    tr = n.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = (*shadow_tint, 1)
    mix = n.new("ShaderNodeMixShader")
    l.new(lp.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    l.new(b.outputs["BSDF"], mix.inputs[1])
    l.new(tr.outputs["BSDF"], mix.inputs[2])
    l.new(mix.outputs["Shader"], out.inputs["Surface"])
    if absorb:
        col, dens = absorb
        va = n.new("ShaderNodeVolumeAbsorption")
        va.inputs["Color"].default_value = (*col, 1)
        va.inputs["Density"].default_value = dens
        l.new(va.outputs["Volume"], out.inputs["Volume"])
    return m


def metal_material(name, hexcol, rough=0.16):
    m, n, l, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*lin(hexcol), 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = rough
    b.inputs["Anisotropic"].default_value = 0.2
    return m


def onyx_material():
    m, n, l, b = new_mat("Onyx")
    b.inputs["Base Color"].default_value = (*lin("#141213"), 1)
    b.inputs["Roughness"].default_value = 0.12
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.02
    return m


def liquid_material(hexcol):
    c = lin(hexcol)
    # surface tint a touch lighter than the juice; volume absorption gives depth (thicker = richer)
    # Principled transmission tint is the colour after passing through the body (Blender 4+),
    # a light volume absorption adds depth: thicker parts and edges read richer
    tint = c
    lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    dens = 4.0 + 22.0 * lum  # pale juices need more body to read as liquid, not water
    shadow = tuple(0.35 + 0.6 * x for x in tint)
    return glass_material("Liquid", tint=tint, ior=1.36, rough=0.0, absorb=(tint, dens), shadow_tint=shadow)


def label_material(w, h):
    """Maroon printed plate with a thin gold hairline frame (from the plate's 0..1 UVs)."""
    m, n, l, b = new_mat("Label")
    maroon = (*lin("#6d0f2a"), 1)
    gold = (*lin("#d2b06a"), 1)
    uv = n.new("ShaderNodeUVMap")
    sep = n.new("ShaderNodeSeparateXYZ")
    l.new(uv.outputs["UV"], sep.inputs[0])

    def edge_dist(sock, size):
        a = n.new("ShaderNodeMath"); a.operation = "PINGPONG"; a.inputs[1].default_value = 0.5
        l.new(sock, a.inputs[0])  # 0..0.5..0 -> distance from the nearest edge in UV
        k = n.new("ShaderNodeMath"); k.operation = "MULTIPLY"; k.inputs[1].default_value = size
        l.new(a.outputs[0], k.inputs[0])
        return k.outputs[0]

    du, dv = edge_dist(sep.outputs["X"], w), edge_dist(sep.outputs["Y"], h)
    mn = n.new("ShaderNodeMath"); mn.operation = "MINIMUM"
    l.new(du, mn.inputs[0]); l.new(dv, mn.inputs[1])
    inset, thick = 0.0011, 0.00028
    s1 = n.new("ShaderNodeMath"); s1.operation = "SUBTRACT"; s1.inputs[1].default_value = inset
    l.new(mn.outputs[0], s1.inputs[0])
    ab = n.new("ShaderNodeMath"); ab.operation = "ABSOLUTE"
    l.new(s1.outputs[0], ab.inputs[0])
    lt = n.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = thick / 2
    l.new(ab.outputs[0], lt.inputs[0])
    mixc = n.new("ShaderNodeMix"); mixc.data_type = "RGBA"
    mixc.inputs[6].default_value = maroon  # (index 6/7 = A_Color/B_Color: the Mix node has A/B per data type)
    mixc.inputs[7].default_value = gold
    l.new(lt.outputs[0], mixc.inputs[0])
    l.new(mixc.outputs["Result"], b.inputs["Base Color"])
    l.new(lt.outputs[0], b.inputs["Metallic"])
    rr = n.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.42
    rr.inputs["To Max"].default_value = 0.22
    l.new(lt.outputs[0], rr.inputs["Value"])
    l.new(rr.outputs["Result"], b.inputs["Roughness"])
    b.inputs["Specular IOR Level"].default_value = 0.4
    # the back of the plate (seen through glass and juice in the back view) is plain cream paper
    gf = n.new("ShaderNodeNewGeometry")
    back = n.new("ShaderNodeBsdfPrincipled")
    back.inputs["Base Color"].default_value = (*lin("#e8dfd0"), 1)  # cream paper back
    back.inputs["Roughness"].default_value = 0.6
    # faint self-glow: the lights sit in front, so the paper back would otherwise read as a grey block
    back.inputs["Emission Color"].default_value = (*lin("#e8dfd0"), 1)
    back.inputs["Emission Strength"].default_value = 1.5
    mix = n.new("ShaderNodeMixShader")
    l.new(gf.outputs["Backfacing"], mix.inputs["Fac"])
    l.new(b.outputs["BSDF"], mix.inputs[1])
    l.new(back.outputs["BSDF"], mix.inputs[2])
    l.new(mix.outputs["Shader"], n["Material Output"].inputs["Surface"])
    return m


def text_gold_material():
    m, n, l, b = new_mat("LabelGold")
    b.inputs["Base Color"].default_value = (*lin("#d8b56a"), 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.25
    return m


# ------------------------------------------------------------------ label text
def make_text_line(body, size):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = body
    if FONT:
        cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = size
    cu.space_character = 1.12
    cu.extrude = 0.00008
    cu.resolution_u = 6
    ob = link(bpy.data.objects.new("txt", cu))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    return me, (min(xs), max(xs), min(ys), max(ys))


def build_label_text(p, label_ob, gold):
    """Gold serif text laid onto the front of the Label plate (text faces -Y, reads left to right
    from the front), every vertex projected onto the plate surface so curved labels are hugged."""
    bb = [label_ob.matrix_world @ Vector(c) for c in label_ob.bound_box]
    x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
    z0, z1 = min(v.z for v in bb), max(v.z for v in bb)
    w, h = x1 - x0, z1 - z0
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    tall = h > w
    name_lines = p["name"].split(" ") if tall else [p["name"]]
    small_lines = [p["conc"], p["vol"]] if tall else [f"{p['conc']} \u00b7 {p['vol']}"]
    lines = [(t, 1.0) for t in name_lines] + [(t, 0.42) for t in small_lines]
    meshes = []
    for t, rel in lines:
        me, ext = make_text_line(t, 0.01 * rel)
        meshes.append((me, ext, rel))
    # stack lines (2D, text space: x right, y up), gaps proportional to size
    heights = [(e[3] - e[2]) for _, e, _ in meshes]
    cap_h = max(hh for hh, (_, _, r) in zip(heights, meshes) if r == 1.0)
    gaps = []
    for k in range(len(meshes) - 1):
        r0, r1 = meshes[k][2], meshes[k + 1][2]
        gaps.append(cap_h * (0.32 if r0 == r1 == 1.0 else 0.62 if r0 != r1 else 0.45 * r1 / 1.0 + 0.1))
    line_h = [cap_h * r for _, _, r in meshes]
    total = sum(line_h) + sum(gaps)
    bm = bmesh.new()
    y = total / 2
    for k, (me, ext, rel) in enumerate(meshes):
        lh = line_h[k]
        yc = y - lh / 2
        tmp = bmesh.new(); tmp.from_mesh(me)
        dx = -(ext[0] + ext[1]) / 2
        for v in tmp.verts:
            v.co.x += dx
            v.co.y += yc - (0.0 if rel != 1.0 else 0.0)
        tmp_me = bpy.data.meshes.new("t"); tmp.to_mesh(tmp_me); tmp.free()
        bm.from_mesh(tmp_me); bpy.data.meshes.remove(tmp_me); bpy.data.meshes.remove(me)
        y -= lh + (gaps[k] if k < len(gaps) else 0)
    # fit inside the plate with margins (inside the gold hairline frame)
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]
    tw, th = max(xs) - min(xs), max(ys) - min(ys)
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    s = min((w - 0.0058) / tw, (h - 0.0052) / th)
    # label-space mapping: text x -> world x, text y -> world z, text z (extrude, +front) -> -y
    bvh = BVHTree.FromObject(label_ob, bpy.context.evaluated_depsgraph_get())
    inv = label_ob.matrix_world.inverted()
    for v in bm.verts:
        X = cx + (v.co.x - mx) * s
        Z = cz + (v.co.y - my) * s
        depth = v.co.z  # -extrude..+extrude
        origin = inv @ Vector((X, -1.0, Z))
        hit = bvh.ray_cast(origin, (inv.to_3x3() @ Vector((0, 1, 0))).normalized())
        ys_ = (label_ob.matrix_world @ hit[0]).y if hit[0] is not None else bb[0].y
        v.co = Vector((X, ys_ - 0.00012 - (depth + 0.00008), Z))
    me = bpy.data.meshes.new("LabelText")
    bm.to_mesh(me); bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    me.materials.append(gold)
    ob = link(bpy.data.objects.new("LabelText", me))
    return ob, (w, h)


def conform_label(label_ob, glass_ob, gap=0.00035):
    """Wrap the label plate onto the glass (projected along +Y), so a flat plate that is wider than
    a facet follows the bottle instead of floating past the facet edges. Scene-only change."""
    dg = bpy.context.evaluated_depsgraph_get()
    gb = BVHTree.FromObject(glass_ob, dg)
    gi = glass_ob.matrix_world.inverted()
    gd = (gi.to_3x3() @ Vector((0, 1, 0))).normalized()
    lw, li = label_ob.matrix_world, label_ob.matrix_world.inverted()
    for v in label_ob.data.vertices:
        w = lw @ v.co
        hit = gb.ray_cast(gi @ Vector((w.x, -1.0, w.z)), gd)
        if hit[0] is None:
            continue
        hy = (glass_ob.matrix_world @ hit[0]).y - gap
        if hy > w.y:  # only push the plate back towards the glass, never out
            v.co = li @ Vector((w.x, hy, w.z))
    label_ob.data.update()


# ------------------------------------------------------------------ bottle import + styling
def import_bottle(p):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, p["bottle"] + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    pivot = link(bpy.data.objects.new("Pivot", None))
    bpy.context.view_layer.update()
    for o in new:
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = pivot
            o.matrix_world = mw
    parts = {o.name.split(".")[0]: o for o in new if o.type == "MESH"}
    glass = glass_material("Glass")
    liquid = liquid_material(p["liquid"])
    trim_metal = metal_material("Trim", METALS["silver"] if p["cap"] == "silver" else METALS["gold"], 0.14)
    cap = onyx_material() if p["cap"] == "onyx" else metal_material("Cap", METALS[p["cap"]], 0.17)
    gold = text_gold_material()
    for key, ob in parts.items():
        if key in ("Neck", "Collar", "CapTrim") or (key == "Cap" and p["bottle"] != "qasr"):
            # turned (lathe) parts: drop the imported flat custom normals and shade smooth
            with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
                try:
                    bpy.ops.mesh.customdata_custom_splitnormals_clear()
                except Exception as e:
                    print("NORMALS_CLEAR_FAILED", key, e)
            for poly in ob.data.polygons:
                poly.use_smooth = True
        ob.data.materials.clear()
        for poly in ob.data.polygons:
            poly.use_smooth = poly.use_smooth or key in ("Glass", "Liquid", "Neck")
        if key in ("Glass", "Neck"):
            ob.data.materials.append(glass)
        elif key == "Liquid":
            ob.data.materials.append(liquid)
        elif key in ("Collar", "CapTrim"):
            ob.data.materials.append(trim_metal)
        elif key == "Cap":
            ob.data.materials.append(cap)
    lab = parts["Label"]
    bpy.context.view_layer.update()
    conform_label(lab, parts["Glass"])
    txt, (lw, lh) = build_label_text(p, lab, gold)
    lab.data.materials.append(label_material(lw, lh))
    txt.parent = pivot
    pts = [o.matrix_world @ Vector(c) for o in parts.values() for c in o.bound_box]
    size = Vector((max(v.x for v in pts) - min(v.x for v in pts), max(v.y for v in pts) - min(v.y for v in pts), max(v.z for v in pts)))
    return pivot, new + [txt], size


def setup_camera(size):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 65
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 36
    cam_data.clip_start = 0.01
    cam = link(bpy.data.objects.new("Cam", cam_data))
    scn.camera = cam
    h = size.z
    frame_h = h / 0.71  # lands at ~70% of the frame height once perspective is accounted for
    dist = frame_h * cam_data.lens / cam_data.sensor_height + size.y * 0.25
    elev = math.radians(7)
    target = Vector((0, 0, h * 0.5))
    cam.location = target + Vector((0, -math.cos(elev), math.sin(elev))) * dist
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    # nudge the frame so the bottle sits a little low (room above the cap, base clear of the edge)
    cam_data.shift_y = 0.0
    return cam


def clear(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images, bpy.data.curves):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


# ------------------------------------------------------------------ main
os.makedirs(OUT, exist_ok=True)
manifest_path = os.path.join(OUT, "manifest.json")
manifest = {"generator": "scripts/blender/render_perfume_shots.py", "resolution": [1200, 1600], "background": BG,
            "device": DEVICE, "samples": SAMPLES, "products": []}
if os.path.exists(manifest_path):
    try:
        old = json.load(open(manifest_path))
        manifest["products"] = [q for q in old.get("products", [])]
    except Exception:
        pass
t_all = time.time()
for p in PERFUMES:
    if ONLY and p["sku"] not in ONLY:
        continue
    t0 = time.time()
    pivot, objs, size = import_bottle(p)
    cam = setup_camera(size)
    lights = build_lights(size.z)
    d = os.path.join(OUT, p["sku"])
    os.makedirs(d, exist_ok=True)
    files = {}
    for view, yaw in VIEWS:
        if VIEWS_ONLY and view not in VIEWS_ONLY:
            continue
        pivot.rotation_euler = (0, 0, math.radians(yaw))
        scn.render.filepath = os.path.join(d, view + ".png")
        bpy.ops.render.render(write_still=True)
        files[view] = f"{p['sku']}/{view}.png"
        print("RENDERED", p["sku"], view, round(time.time() - t0, 1), "s", flush=True)
    entry = dict(sku=p["sku"], name=p["name"].title(), bottle=p["bottle"], liquid=p["liquid"], cap=p["cap"],
                 concentration=p["conc"].title(), volume=p["vol"], files=files, seconds=round(time.time() - t0, 1))
    manifest["products"] = [q for q in manifest["products"] if q["sku"] != p["sku"]] + [entry]
    clear(objs + [pivot, cam] + lights)
manifest["products"].sort(key=lambda q: [x["sku"] for x in PERFUMES].index(q["sku"]))
manifest["totalSeconds"] = round(time.time() - t_all, 1)
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
print("ALL_DONE", round(time.time() - t_all, 1), "s ->", OUT)
