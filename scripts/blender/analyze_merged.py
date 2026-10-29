"""Join meshes, merge-by-distance, report connected components (read-only on source)."""
import bpy, bmesh, sys, os
argv = sys.argv[sys.argv.index("--") + 1:]
src = os.path.abspath(argv[0]); thr = float(argv[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ms = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in bpy.context.scene.objects: o.select_set(o in ms)
bpy.context.view_layer.objects.active = ms[0]
bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM"); bpy.ops.object.transform_apply()
bm = bmesh.new(); bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=thr)
bm.verts.ensure_lookup_table()
seen=set(); comps=[]
for v in bm.verts:
    if v.index in seen: continue
    st=[v]; seen.add(v.index); c=[]
    while st:
        x=st.pop(); c.append(x.co.copy())
        for e in x.link_edges:
            y=e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    comps.append(c)
comps.sort(key=lambda c:-len(c))
print("COMPONENTS", len(comps), "verts", len(bm.verts))
for c in comps[:40]:
    mn=[min(p[i] for p in c) for i in range(3)]; mx=[max(p[i] for p in c) for i in range(3)]
    print(len(c), [round(x,3) for x in mn], [round(x,3) for x in mx])
