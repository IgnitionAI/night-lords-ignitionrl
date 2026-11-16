import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=ASSET_INPUTS['model'])
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    tris=sum(len(p.vertices)-2 for p in obj.data.polygons)
    if tris>6000:
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Tactical silhouette LOD','DECIMATE');mod.ratio=6000/tris;mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
