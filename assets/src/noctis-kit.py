import bpy, math
from mathutils import Vector

# Four reusable, metre-scale assemblies, baked by material for a small draw budget.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def material(name, color, metal=.7, rough=.38, emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
steel=material('Gunmetal',(.14,.19,.22));edge=material('Worn pewter',(.35,.39,.4));gold=material('Ancient brass',(.42,.25,.09));black=material('Recesses',(.025,.035,.04));bone=material('Ivory reliquary',(.65,.57,.4),.2,.65)
blue=material('Relais cyan',(.05,.55,.8),.2,.3,2);amber=material('Plasma amber',(1,.32,.025),.2,.3,2);red=material('Emergency lamps',(.8,.035,.02),.2,.3,2)
group=None
def box(name,p,s,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o.parent=group
    if bevel:
        m=o.modifiers.new('Machined edges','BEVEL');m.width=bevel;m.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    return o
def cyl(name,p,r,depth,mat,verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=p);o=bpy.context.object;o.name=name;o.data.materials.append(mat);o.parent=group;return o
def beam(a,b,r,mat):
    a,b=Vector(a),Vector(b);o=cyl('Conduit',(a+b)/2,r,(b-a).length,mat,10);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def newgroup(name):
    global group
    group=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(group)
def bake(offset):
    children=list(group.children)
    for mat in [steel,edge,gold,black,bone,blue,amber,red]:
        meshes=[o for o in list(group.children) if o.type=='MESH' and o.data.materials[0]==mat]
        if not meshes:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();meshes[0].name=group.name+'_'+mat.name
    group.location.x=offset

newgroup('Relay')
box('Octagonal dais',(0,0,.12),(1.7,1.6,.24),steel)
cyl('Cogitator base',(0,0,.35),.65,.4,gold,12)
cyl('Projector',(0,0,.62),.47,.2,black)
for k in range(8):
    a=k*math.tau/8;x,y=.57*math.cos(a),.57*math.sin(a)
    cyl('Projector lens',(x,y,.75),.065,.12,blue)
for s in [-1,1]:
    box('Cogitator cabinet',(s*.7,.48,.95),(.4,.38,1.5),steel)
    box('Luminous display',(s*.7,.275,1.12),(.28,.025,.42),blue)
    for z in [.45,.55,.65]:box('Cooling slats',(s*.7,.265,z),(.26,.04,.035),edge,.005)
    beam((s*.7,.48,1.6),(0,.48,2.1),.06,gold)
beam((0,.48,2.1),(0,.48,2.4),.035,gold)
bake(0)

newgroup('Power')
box('Reactor raft',(0,0,.12),(1.65,1.65,.24),steel)
cyl('Reactor core',(0,0,1),.43,1.7,amber,24)
for z in [.3,.55,1.5,1.8]:cyl('Containment rings',(0,0,z),.6,.12,edge,24)
for k in range(6):
    a=k*math.tau/6;x,y=.54*math.cos(a),.54*math.sin(a)
    beam((x,y,.25),(x,y,1.9),.085,steel)
    beam((x,y,.4),(x*1.5,y*1.5,.25),.05,gold)
cyl('Containment crown',(0,0,1.96),.46,.22,steel)
for s in [-1,1]:
    box('Transformer',(s*.75,.5,.55),(.3,.55,.8),steel)
    for z in [.3,.45,.6,.75]:box('Transformer fins',(s*.75,.5,z),(.4,.62,.04),edge,.005)
bake(3)

newgroup('Archives')
box('Reliquary plinth',(0,0,.13),(1.8,1.4,.26),steel)
box('Vault',(0,.35,1), (1.5,.5,1.8),black)
for x in [-.78,.78]:
    box('Buttress',(x,.35,1.1),(.17,.65,2.05),gold)
    beam((x,.35,2.1),(0,.35,2.6),.07,gold)
for z in [.38,.8,1.22,1.64,2.06]:box('Shelf',(0,.12,z),(1.45,.62,.07),edge,.008)
for row in range(4):
    for col in range(9):
        x=-.62+col*.15;z=.57+row*.42
        box('Data reliquary',(x,.03,z),(.1,.28,.3),bone,.007)
        box('Seal',(x,-.12,z+.05),(.07,.015,.03),gold,.002)
for x in [-.7,.7]:
    cyl('Candle',(x,-.4,.45),.035,.4,bone,8);cyl('Lumen',(x,-.4,.67),.025,.07,amber,8)
box('Book stand',(0,-.45,.65),(.6,.45,.1),gold).rotation_euler.x=.35
bake(6)

newgroup('Bulkhead')
for x in [-1.25,1.25]:
    box('Hydraulic pillar',(x,0,1.3),(.5,.75,2.6),steel)
    box('Pillar rib',(x,-.42,1.3),(.18,.1,2.4),gold)
    for z in [.2,1,1.8,2.5]:box('Collar',(x,0,z),(.65,.85,.12),edge)
    box('Warning lamp',(x,-.45,2),(.12,.05,.4),red,.01)
beam((-1.25,0,2.6),(0,0,3.3),.2,steel);beam((1.25,0,2.6),(0,0,3.3),.2,steel)
for x in [-1,1]:beam((x,-.22,2.7),(0,-.22,3.17),.04,gold)
box('Pediment',(0,0,2.64),(2.25,.65,.22),edge)
bake(9)

newgroup('Buttress')
box('Foot',(0,0,.1),(.75,.9,.2),steel)
box('Pier',(0,0,1.35),(.48,.52,2.6),steel)
box('Inset',(0,-.28,1.5),(.26,.03,1.8),black)
for x in [-.22,.22]:beam((x,-.28,.15),(x,-.28,2.6),.035,gold)
box('Lamp',(0,-.3,1.75),(.14,.03,.42),red)
beam((0,0,2.5),(.65,0,3.1),.12,steel)
beam((0,0,2.75),(.65,0,3.1),.04,gold)
for z in [.18,.8,2.5]:box('Moulding',(0,0,z),(.62,.65,.1),edge)
bake(12)
