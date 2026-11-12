import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT_DIR = os.path.join(REPO, "docs", "arena", "assets", "weapons")
PREVIEW_DIR = os.path.join(ROOT, "previews")
GRIP_SCALE = 0.84


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, color, metallic, roughness, emission=None, strength=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return material


def materials():
    return {
        "gunmetal": make_material("Gunmetal", (0.045, 0.048, 0.052), 0.9, 0.35),
        "parkerized": make_material("Parkerized", (0.07, 0.072, 0.07), 0.8, 0.55),
        "polymer": make_material("Polymer", (0.016, 0.017, 0.018), 0.0, 0.5),
        "rubber": make_material("Rubber", (0.018, 0.018, 0.019), 0.0, 0.85),
        "accent": make_material("Accent", (0.05, 0.42, 0.2), 0.1, 0.4, (0.25, 0.68, 0.48), 1.5),
        "lens": make_material("Lens", (0.05, 0.09, 0.08), 0.6, 0.08, (0.02, 0.06, 0.05), 0.4),
        "dot": make_material("Dot", (0.2, 1.0, 0.5), 0.0, 0.3, (0.3, 1.0, 0.55), 12.0),
        "brass": make_material("Brass", (0.6, 0.42, 0.14), 0.95, 0.3),
        "shell": make_material("Shell", (0.45, 0.05, 0.06), 0.0, 0.45),
        "olive": make_material("Olive", (0.085, 0.105, 0.08), 0.35, 0.6),
        "warhead": make_material("Warhead", (0.5, 0.08, 0.04), 0.2, 0.45),
    }


def activate(obj):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def apply_modifiers(obj):
    activate(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def add_bevel(obj, width, segments=2, angle=50):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    mod.miter_outer = "MITER_ARC"
    return obj


def box(name, size, location, material, bevel=0.0015, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel > 0:
        add_bevel(obj, bevel, segments)
        apply_modifiers(obj)
    return obj


def cylinder(name, radius, depth, location, material, axis="Y", vertices=32, bevel=0.0008, radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=vertices, location=location)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=radius, radius2=radius2, depth=depth, vertices=vertices, location=location)
    obj = bpy.context.active_object
    obj.name = name
    if axis == "Y":
        obj.rotation_euler = (math.radians(90), 0, 0)
    elif axis == "X":
        obj.rotation_euler = (0, math.radians(90), 0)
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    assign(obj, material)
    if bevel > 0:
        add_bevel(obj, bevel, 2, 40)
        apply_modifiers(obj)
    return obj


def profile(name, points_yz, width, material, x=0.0, bevel=0.002, segments=3):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    half = width / 2
    front = [bm.verts.new((x - half, y, z)) for y, z in points_yz]
    back = [bm.verts.new((x + half, y, z)) for y, z in points_yz]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(points_yz)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    if bevel > 0:
        add_bevel(obj, bevel, segments, 35)
        apply_modifiers(obj)
    return obj


def tube_path(name, points, radius, material, resolution=6):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = resolution
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    assign(obj, material)
    return obj


def cut(target, cutter, operation="DIFFERENCE"):
    mod = target.modifiers.new("Bool", "BOOLEAN")
    mod.operation = operation
    mod.solver = "EXACT"
    mod.object = cutter
    apply_modifiers(target)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def repeat(obj, count, offset):
    mod = obj.modifiers.new("Array", "ARRAY")
    mod.count = count
    mod.use_relative_offset = False
    mod.use_constant_offset = True
    mod.constant_offset_displace = offset
    return apply_modifiers(obj)


def join(objects, name):
    objects = [o for o in objects if o]
    activate(objects[0])
    for o in objects[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    return obj


def finish(obj, origin, smooth_angle=35):
    activate(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    return obj


def empty(name, location):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.02
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def screw(name, location, axis, material, radius=0.0028):
    head = cylinder(name, radius, 0.0018, location, material, axis=axis, vertices=14, bevel=0.0004)
    outward = 1 if location[0] >= 0 else -1
    slot = box(name + "Slot", (0.0016, radius * 2.4, 0.0007), (location[0] + outward * 0.0009, location[1], location[2]), material, bevel=0)
    return cut(head, slot)


def place(obj, rotation, location):
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.rotation_euler = rotation
    obj.location = location
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def picatinny(name, y_start, length, z_base, width, material):
    base = box(name, (width, length, 0.006), (0, y_start + length / 2, z_base + 0.003), material, bevel=0.0008)
    pitch = 0.01
    count = int(length / pitch)
    tooth = box(name + "Tooth", (width + 0.004, 0.0052, 0.0042), (0, y_start + 0.004, z_base + 0.0081), material, bevel=0.0006)
    repeat(tooth, count, (0, pitch, 0))
    for side in (-1, 1):
        chamfer = box(name + "Lip", (0.003, length, 0.003), (side * (width / 2 + 0.0008), y_start + length / 2, z_base + 0.0075), material, bevel=0.0007)
        base = join([base, chamfer], name)
    return join([base, tooth], name)


def build_aa12(m):
    parts = []
    receiver = box("Receiver", (0.056, 0.43, 0.078), (0, 0.07, 0.039), m["gunmetal"], bevel=0.004, segments=3)
    for side in (-1, 1):
        recess = box("Recess", (0.004, 0.2, 0.034), (side * 0.028, 0.06, 0.034), m["gunmetal"], bevel=0.002)
        receiver = cut(receiver, recess)
        groove = box("Groove", (0.003, 0.38, 0.003), (side * 0.028, 0.07, 0.066), m["gunmetal"], bevel=0)
        receiver = cut(receiver, groove)
    port = box("Port", (0.012, 0.07, 0.022), (0.028, 0.04, 0.046), m["gunmetal"], bevel=0.001)
    receiver = cut(receiver, port)
    parts.append(receiver)
    for y in (-0.06, 0.01, 0.15, 0.2):
        for side in (-1, 1):
            parts.append(screw("Pin", (side * 0.0285, y, 0.022), "X", m["parkerized"]))
    bolt_face = box("BoltFace", (0.004, 0.066, 0.018), (0.0245, 0.04, 0.046), m["parkerized"], bevel=0.0008)
    parts.append(bolt_face)

    handle_front = box("HandlePost", (0.03, 0.03, 0.03), (0, 0.255, 0.092), m["gunmetal"], bevel=0.003)
    handle_back = box("HandlePostRear", (0.03, 0.03, 0.03), (0, -0.115, 0.092), m["gunmetal"], bevel=0.003)
    handle_bar = box("HandleBar", (0.034, 0.4, 0.016), (0, 0.07, 0.113), m["gunmetal"], bevel=0.004, segments=3)
    parts += [handle_front, handle_back, handle_bar]
    parts.append(picatinny("Rail", -0.13, 0.4, 0.121, 0.021, m["parkerized"]))

    sight_body = box("SightBody", (0.03, 0.06, 0.026), (0, 0.01, 0.147), m["polymer"], bevel=0.004, segments=3)
    hood = cylinder("SightHood", 0.022, 0.05, (0, 0.012, 0.164), m["polymer"], axis="Y", vertices=32, bevel=0.001)
    hood_hole = cylinder("HoodHole", 0.018, 0.06, (0, 0.012, 0.164), m["polymer"], axis="Y", vertices=32, bevel=0)
    hood = cut(hood, hood_hole)
    clamp = box("SightClamp", (0.034, 0.03, 0.008), (0, 0.0, 0.131), m["parkerized"], bevel=0.001)
    knob = cylinder("SightKnob", 0.006, 0.008, (0.018, 0.0, 0.146), m["parkerized"], axis="X", vertices=16)
    lens = cylinder("SightLens", 0.0178, 0.002, (0, 0.03, 0.164), m["lens"], axis="Y", vertices=32, bevel=0)
    dot = cylinder("SightDot", 0.0012, 0.001, (0, 0.0305, 0.164), m["dot"], axis="Y", vertices=10, bevel=0)
    parts += [sight_body, hood, clamp, knob, lens, dot]
    front_post = box("FrontPost", (0.004, 0.006, 0.018), (0, 0.262, 0.139), m["parkerized"], bevel=0.0008)
    front_wing = box("FrontWing", (0.022, 0.008, 0.016), (0, 0.262, 0.136), m["parkerized"], bevel=0.001)
    front_wing = cut(front_wing, box("WingCut", (0.012, 0.02, 0.014), (0, 0.262, 0.141), m["parkerized"], bevel=0))
    parts += [front_post, front_wing]

    shroud = box("Shroud", (0.052, 0.24, 0.064), (0, 0.4, 0.038), m["gunmetal"], bevel=0.008, segments=4)
    bore = cylinder("ShroudBore", 0.019, 0.3, (0, 0.4, 0.04), m["gunmetal"], axis="Y", vertices=32, bevel=0)
    shroud = cut(shroud, bore)
    for side in (-1, 1):
        for row, z in enumerate((0.056,)):
            for k in range(5):
                slot = box("Vent", (0.024, 0.026, 0.011), (side * 0.026, 0.322 + row * 0.012 + k * 0.036, z), m["gunmetal"], bevel=0.0052, segments=4)
                shroud = cut(shroud, slot)
    for side in (-1, 1):
        rail = picatinny("SideRail", 0.33, 0.12, 0, 0.016, m["parkerized"])
        place(rail, (0, math.radians(90 * side), 0), (side * 0.026, 0, 0.026))
        parts.append(rail)
    parts.append(shroud)
    bottom_rail = picatinny("BottomRail", 0.31, 0.16, 0, 0.02, m["parkerized"])
    place(bottom_rail, (0, math.radians(180), 0), (0, 0, 0.006))
    parts.append(bottom_rail)

    barrel = cylinder("Barrel", 0.0125, 0.28, (0, 0.4, 0.04), m["parkerized"], axis="Y", vertices=28)
    bore_hole = cylinder("BarrelBore", 0.0095, 0.3, (0, 0.4, 0.04), m["parkerized"], axis="Y", vertices=24, bevel=0)
    barrel = cut(barrel, bore_hole)
    muzzle = cylinder("Brake", 0.0175, 0.06, (0, 0.545, 0.04), m["parkerized"], axis="Y", vertices=32, bevel=0.0015)
    muzzle = cut(muzzle, cylinder("BrakeBore", 0.011, 0.08, (0, 0.545, 0.04), m["parkerized"], axis="Y", vertices=24, bevel=0))
    for angle in range(0, 360, 60):
        a = math.radians(angle)
        port_cut = box("BrakePort", (0.008, 0.012, 0.05), (0, 0.548, 0.04), m["parkerized"], bevel=0)
        port_cut.rotation_euler = (0, a, 0)
        muzzle = cut(muzzle, port_cut)
    ring = cylinder("BrakeRing", 0.019, 0.006, (0, 0.518, 0.04), m["accent"], axis="Y", vertices=32, bevel=0.0008)
    parts += [barrel, muzzle, ring]

    stock_profile = [(-0.14, 0.0), (-0.14, 0.076), (-0.2, 0.074), (-0.34, 0.07), (-0.395, 0.07), (-0.4, 0.06), (-0.4, -0.06), (-0.392, -0.068), (-0.34, -0.058), (-0.22, -0.02), (-0.18, -0.006)]
    stock = profile("Stock", stock_profile, 0.05, m["polymer"], bevel=0.006, segments=4)
    for side in (-1, 1):
        cheek = box("CheekCut", (0.008, 0.15, 0.04), (side * 0.026, -0.27, 0.035), m["polymer"], bevel=0.004)
        stock = cut(stock, cheek)
    sling = box("SlingSlot", (0.06, 0.022, 0.008), (0, -0.33, -0.035), m["polymer"], bevel=0.002)
    stock = cut(stock, sling)
    parts.append(stock)
    pad = profile("ButtPad", [(-0.4, 0.068), (-0.418, 0.066), (-0.42, 0.0), (-0.418, -0.064), (-0.4, -0.066)], 0.052, m["rubber"], bevel=0.004, segments=3)
    parts.append(pad)
    for z in (-0.045, -0.025, -0.005, 0.015, 0.035, 0.055):
        parts.append(box("PadRib", (0.054, 0.004, 0.006), (0, -0.421, z), m["rubber"], bevel=0.0012))
    parts.append(screw("StockScrew", (0.0255, -0.17, 0.03), "X", m["parkerized"], 0.0035))
    parts.append(screw("StockScrewL", (-0.0255, -0.17, 0.03), "X", m["parkerized"], 0.0035))

    grip_profile = [(0.018, 0.0), (0.012, -0.03), (0.014, -0.042), (0.006, -0.054), (0.008, -0.068), (0.0, -0.08), (-0.004, -0.095), (-0.012, -0.112), (-0.05, -0.112), (-0.052, -0.1), (-0.04, -0.06), (-0.032, 0.0)]
    grip = profile("Grip", grip_profile, 0.032, m["polymer"], bevel=0.005, segments=4)
    for side in (-1, 1):
        panel = box("GripPanel", (0.004, 0.03, 0.078), (side * 0.0155, -0.018, -0.062), m["rubber"], bevel=0.0015, segments=2)
        panel.rotation_euler = (math.radians(-15), 0, 0)
        parts.append(panel)
        for i in range(6):
            ridge = box("GripRidge", (0.0035, 0.026, 0.0022), (side * 0.0175, -0.012 - i * 0.0026, -0.035 - i * 0.0102), m["rubber"], bevel=0.0007)
            ridge.rotation_euler = (math.radians(-15), 0, 0)
            parts.append(ridge)
    grip.rotation_euler = (math.radians(-4), 0, 0)
    parts.append(grip)
    guard = tube_path("TriggerGuard", [(0, 0.02, -0.001), (0, 0.022, -0.03), (0, 0.06, -0.042), (0, 0.09, -0.03), (0, 0.095, -0.002)], 0.0035, m["polymer"])
    parts.append(guard)
    magwell = box("MagWell", (0.06, 0.1, 0.03), (0, 0.13, -0.006), m["gunmetal"], bevel=0.004, segments=3)
    latch = box("MagLatch", (0.012, 0.014, 0.02), (0, 0.075, -0.012), m["parkerized"], bevel=0.0015)
    selector = cylinder("Selector", 0.006, 0.064, (0, 0.005, 0.03), m["parkerized"], axis="X", vertices=16)
    lever = box("SelectorLever", (0.003, 0.018, 0.007), (0.033, 0.012, 0.03), m["parkerized"], bevel=0.001)
    parts += [magwell, latch, selector, lever]

    body = join(parts, "Body")
    finish(body, (0, 0, 0))

    trigger = tube_path("Trigger", [(0, 0.04, -0.002), (0, 0.042, -0.014), (0, 0.037, -0.027)], 0.0028, m["parkerized"])
    finish(trigger, (0, 0.04, -0.002))

    handle_knob = cylinder("Knob", 0.008, 0.02, (-0.042, 0.22, 0.06), m["parkerized"], axis="X", vertices=20, bevel=0.001)
    knob_cap = cylinder("KnobCap", 0.0095, 0.006, (-0.053, 0.22, 0.06), m["accent"], axis="X", vertices=20, bevel=0.001)
    stem = box("KnobStem", (0.016, 0.01, 0.008), (-0.032, 0.22, 0.06), m["parkerized"], bevel=0.001)
    bolt = join([handle_knob, knob_cap, stem], "Bolt")
    finish(bolt, (-0.032, 0.22, 0.06))

    drum_center = (0, 0.13, -0.105)
    drum_shell = cylinder("DrumShell", 0.096, 0.072, drum_center, m["polymer"], axis="X", vertices=64, bevel=0.007)
    for side in (-1, 1):
        groove = cylinder("DrumGroove", 0.08, 0.004, (side * 0.036, 0.13, -0.105), m["polymer"], axis="X", vertices=64, bevel=0)
        ring_keep = cylinder("DrumGrooveInner", 0.074, 0.006, (side * 0.036, 0.13, -0.105), m["polymer"], axis="X", vertices=64, bevel=0)
        groove = cut(groove, ring_keep)
        drum_shell = cut(drum_shell, groove)
    drum_parts = [drum_shell]
    for side in (-1, 1):
        hub = cylinder("DrumHub", 0.03, 0.01, (side * 0.037, 0.13, -0.105), m["parkerized"], axis="X", vertices=40, bevel=0.002)
        cap = cylinder("DrumCap", 0.016, 0.006, (side * 0.043, 0.13, -0.105), m["gunmetal"], axis="X", vertices=32, bevel=0.0015)
        drum_parts += [hub, cap]
        for k in range(6):
            a = math.radians(k * 60 + 30)
            drum_parts.append(screw("DrumScrew", (side * 0.0375, 0.13 + math.cos(a) * 0.022, -0.105 + math.sin(a) * 0.022), "X", m["gunmetal"], 0.0022))
        for k in range(12):
            a = math.radians(k * 30)
            rib = box("DrumRib", (0.004, 0.018, 0.004), (side * 0.0365, 0.13 + math.cos(a) * 0.057, -0.105 + math.sin(a) * 0.057), m["polymer"], bevel=0.001)
            rib.rotation_euler = (a, 0, 0)
            drum_parts.append(rib)
    stripe = cylinder("DrumStripe", 0.0968, 0.008, drum_center, m["accent"], axis="X", vertices=64, bevel=0)
    stripe_inner = cylinder("DrumStripeInner", 0.09, 0.012, drum_center, m["accent"], axis="X", vertices=64, bevel=0)
    stripe = cut(stripe, stripe_inner)
    for k in range(5):
        a = math.radians(200 + k * 14)
        window = box("DrumWindow", (0.012, 0.007, 0.012), (0.0335, 0.13 + math.cos(a) * 0.075, -0.105 + math.sin(a) * 0.075), m["polymer"], bevel=0.002)
        drum_shell = cut(drum_shell, window)
        drum_parts.append(cylinder("ShellBase", 0.005, 0.004, (0.031, 0.13 + math.cos(a) * 0.075, -0.105 + math.sin(a) * 0.075), m["brass"], axis="X", vertices=12, bevel=0))
    neck = box("DrumNeck", (0.046, 0.07, 0.03), (0, 0.13, -0.02), m["polymer"], bevel=0.004, segments=3)
    lip = box("DrumLip", (0.05, 0.08, 0.006), (0, 0.13, -0.003), m["parkerized"], bevel=0.001)
    drum_parts += [stripe, neck, lip]
    drum = join(drum_parts, "Drum")
    finish(drum, (0, 0.13, -0.01))

    empty("Muzzle", (0, 0.578, 0.04))
    empty("Eject", (0.032, 0.04, 0.05))
    empty("HandL", (-0.004, 0.38, -0.012))
    return [body, trigger, bolt, drum]


def build_pistol(m):
    parts = []
    slide_profile = [(-0.088, 0.034), (-0.088, 0.062), (-0.08, 0.068), (0.11, 0.068), (0.118, 0.064), (0.118, 0.034)]
    slide = profile("SlideBody", slide_profile, 0.026, m["gunmetal"], bevel=0.003, segments=3)
    for side in (-1, 1):
        top_chamfer = box("SlideChamfer", (0.012, 0.25, 0.012), (side * 0.016, 0.015, 0.071), m["gunmetal"], bevel=0)
        top_chamfer.rotation_euler = (0, math.radians(45), 0)
        slide = cut(slide, top_chamfer)
        rear = box("Serration", (0.006, 0.0018, 0.03), (side * 0.013, -0.078, 0.05), m["gunmetal"], bevel=0)
        repeat(rear, 9, (0, 0.0042, 0))
        slide = cut(slide, rear)
        front = box("SerrationFront", (0.006, 0.0018, 0.022), (side * 0.013, 0.08, 0.052), m["gunmetal"], bevel=0)
        repeat(front, 6, (0, 0.0042, 0))
        slide = cut(slide, front)
    port = box("EjectPort", (0.016, 0.042, 0.016), (0.012, 0.02, 0.062), m["gunmetal"], bevel=0.001)
    slide = cut(slide, port)
    bore = cylinder("SlideBore", 0.0075, 0.05, (0, 0.11, 0.05), m["gunmetal"], axis="Y", vertices=20, bevel=0)
    slide = cut(slide, bore)
    hood = box("BarrelHood", (0.012, 0.04, 0.012), (0, 0.02, 0.064), m["parkerized"], bevel=0.0012)
    rear_sight = box("RearSight", (0.022, 0.008, 0.008), (0, -0.078, 0.072), m["parkerized"], bevel=0.0012)
    rear_sight = cut(rear_sight, box("RearNotch", (0.004, 0.02, 0.008), (0, -0.078, 0.076), m["parkerized"], bevel=0))
    front_sight = box("FrontSight", (0.005, 0.008, 0.007), (0, 0.108, 0.071), m["parkerized"], bevel=0.0012)
    front_dot = cylinder("FrontDot", 0.0013, 0.001, (0, 0.1036, 0.0725), m["dot"], axis="Y", vertices=10, bevel=0)
    rear_dots = [cylinder("RearDot", 0.0011, 0.001, (s * 0.006, -0.0739, 0.0735), m["accent"], axis="Y", vertices=10, bevel=0) for s in (-1, 1)]
    barrel_tip = cylinder("BarrelTip", 0.0072, 0.01, (0, 0.114, 0.05), m["parkerized"], axis="Y", vertices=20)
    barrel_tip = cut(barrel_tip, cylinder("BarrelTipBore", 0.0046, 0.02, (0, 0.114, 0.05), m["parkerized"], axis="Y", vertices=16, bevel=0))
    slide = join([slide, hood, rear_sight, front_sight, front_dot, *rear_dots, barrel_tip], "Slide")
    finish(slide, (0, 0.0, 0.05))

    frame_profile = [(-0.082, 0.034), (0.1, 0.034), (0.112, 0.03), (0.112, 0.012), (0.06, 0.01), (0.03, 0.0), (-0.035, 0.0), (-0.06, 0.004), (-0.088, 0.018), (-0.094, 0.028)]
    frame = profile("Frame", frame_profile, 0.028, m["polymer"], bevel=0.003, segments=3)
    for k in range(3):
        slot = box("RailSlot", (0.04, 0.004, 0.004), (0, 0.068 + k * 0.012, 0.009), m["polymer"], bevel=0)
        frame = cut(frame, slot)
    parts.append(frame)
    grip_profile = [(0.026, 0.002), (0.02, -0.03), (0.022, -0.042), (0.012, -0.056), (0.014, -0.07), (0.004, -0.082), (0.0, -0.1), (-0.004, -0.112), (-0.044, -0.112), (-0.046, -0.1), (-0.05, -0.05), (-0.062, -0.005), (-0.074, 0.004), (-0.04, 0.004)]
    grip_profile = [(y, z * GRIP_SCALE) for y, z in grip_profile]
    grip = profile("PistolGrip", grip_profile, 0.03, m["polymer"], bevel=0.004, segments=3)
    grip.rotation_euler = (math.radians(-6), 0, 0)
    parts.append(grip)
    for side in (-1, 1):
        panel = box("GripPanel", (0.002, 0.03, 0.06 * GRIP_SCALE), (side * 0.0155, -0.016, -0.062 * GRIP_SCALE), m["rubber"], bevel=0.0008)
        panel.rotation_euler = (math.radians(-18), 0, 0)
        parts.append(panel)
        for i in range(8):
            dimple = box("GripDimple", (0.0024, 0.026, 0.0016), (side * 0.0162, -0.012 - i * 0.002, (-0.036 - i * 0.0072) * GRIP_SCALE), m["polymer"], bevel=0.0004)
            dimple.rotation_euler = (math.radians(-18), 0, 0)
            parts.append(dimple)
    guard = tube_path("PistolGuard", [(0, 0.026, 0.0), (0, 0.028, -0.022), (0, 0.055, -0.028), (0, 0.072, -0.012), (0, 0.072, 0.006)], 0.0032, m["polymer"])
    parts.append(guard)
    slide_stop = box("SlideStop", (0.003, 0.022, 0.006), (-0.0155, 0.02, 0.03), m["parkerized"], bevel=0.001)
    takedown = box("Takedown", (0.003, 0.008, 0.008), (-0.0155, 0.048, 0.026), m["parkerized"], bevel=0.001)
    mag_release = box("MagRelease", (0.004, 0.01, 0.008), (-0.0155, 0.022, -0.004), m["parkerized"], bevel=0.001)
    parts += [slide_stop, takedown, mag_release]
    body = join(parts, "Body")
    finish(body, (0, 0, 0))

    trigger = tube_path("Trigger", [(0, 0.045, 0.004), (0, 0.047, -0.008), (0, 0.042, -0.018)], 0.0026, m["parkerized"])
    finish(trigger, (0, 0.045, 0.004))

    hammer_base = box("HammerBase", (0.007, 0.01, 0.012), (0, -0.088, 0.04), m["parkerized"], bevel=0.0012)
    spur = box("HammerSpur", (0.008, 0.012, 0.004), (0, -0.095, 0.048), m["parkerized"], bevel=0.0012)
    spur.rotation_euler = (math.radians(-25), 0, 0)
    hammer = join([hammer_base, spur], "Hammer")
    finish(hammer, (0, -0.086, 0.034))

    mag_body = box("MagBody", (0.022, 0.03, 0.105 * GRIP_SCALE), (0, -0.016, -0.05 * GRIP_SCALE), m["parkerized"], bevel=0.002)
    mag_body.rotation_euler = (math.radians(-18), 0, 0)
    baseplate = box("BasePlate", (0.03, 0.044, 0.01), (0, -0.034, -0.112 * GRIP_SCALE), m["polymer"], bevel=0.003, segments=3)
    plate_stripe = box("PlateStripe", (0.031, 0.03, 0.002), (0, -0.034, -0.112 * GRIP_SCALE - 0.005), m["accent"], bevel=0.0005)
    round_tip = cylinder("Round", 0.0045, 0.012, (0, -0.004, 0.002), m["brass"], axis="Y", vertices=12)
    mag = join([mag_body, baseplate, plate_stripe, round_tip], "Mag")
    finish(mag, (0, 0, 0))

    empty("Muzzle", (0, 0.124, 0.05))
    empty("Eject", (0.016, 0.02, 0.064))
    empty("HandL", (-0.012, 0.004, -0.034))
    return [body, slide, trigger, hammer, mag]


def build_ar(m):
    parts = []
    upper = box("Upper", (0.04, 0.36, 0.056), (0, 0.12, 0.052), m["gunmetal"], bevel=0.0035, segments=3)
    port = box("Port", (0.012, 0.075, 0.022), (0.02, 0.125, 0.056), m["gunmetal"], bevel=0.001)
    upper = cut(upper, port)
    for side in (-1, 1):
        upper = cut(upper, box("UpperGroove", (0.003, 0.3, 0.003), (side * 0.0205, 0.12, 0.072), m["gunmetal"], bevel=0))
    parts.append(upper)
    lower = box("Lower", (0.036, 0.2, 0.048), (0, 0.04, 0.0), m["polymer"], bevel=0.004, segments=3)
    lower = cut(lower, box("LowerCut", (0.007, 0.07, 0.028), (0.018, 0.06, 0.0), m["polymer"], bevel=0.001))
    parts.append(lower)
    magwell = box("MagWell", (0.04, 0.074, 0.05), (0, 0.082, -0.03), m["polymer"], bevel=0.004, segments=3)
    release = box("MagRelease", (0.012, 0.012, 0.014), (0.022, 0.05, -0.012), m["parkerized"], bevel=0.001)
    parts += [magwell, release]
    for y in (0.02, 0.14):
        for side in (-1, 1):
            parts.append(screw("Pin", (side * 0.0205, y, 0.044), "X", m["parkerized"], 0.0032))
    grip_profile = [(0.02, 0.0), (0.014, -0.03), (0.016, -0.045), (0.007, -0.062), (0.002, -0.082), (-0.004, -0.098), (-0.014, -0.116), (-0.05, -0.116), (-0.052, -0.1), (-0.046, -0.06), (-0.036, 0.0)]
    grip = profile("Grip", grip_profile, 0.03, m["polymer"], bevel=0.005, segments=3)
    for side in (-1, 1):
        for i in range(6):
            parts.append(box("GripRidge", (0.0035, 0.024, 0.0022), (side * 0.0156, -0.01 - i * 0.003, -0.034 - i * 0.0105), m["rubber"], bevel=0.0007))
    parts.append(grip)
    guard = tube_path("TriggerGuard", [(0, 0.02, -0.001), (0, 0.024, -0.03), (0, 0.06, -0.042), (0, 0.095, -0.03), (0, 0.098, -0.002)], 0.0035, m["polymer"])
    parts.append(guard)
    parts.append(picatinny("Rail", -0.06, 0.4, 0.08, 0.021, m["parkerized"]))
    handguard = box("Handguard", (0.05, 0.27, 0.052), (0, 0.42, 0.045), m["polymer"], bevel=0.008, segments=4)
    handguard = cut(handguard, cylinder("HandguardBore", 0.017, 0.4, (0, 0.42, 0.048), m["polymer"], axis="Y", vertices=24, bevel=0))
    for side in (-1, 1):
        for row in range(2):
            for k in range(6):
                handguard = cut(handguard, box("Slot", (0.014, 0.026, 0.01), (side * 0.025, 0.325 + k * 0.034, 0.03 + row * 0.02), m["polymer"], bevel=0.004, segments=2))
    parts.append(handguard)
    parts.append(picatinny("HandguardRail", 0.31, 0.22, 0.07, 0.021, m["parkerized"]))
    for y in (0.34, 0.5):
        parts.append(cylinder("HandguardBand", 0.0275, 0.006, (0, y, 0.045), m["accent"], axis="Y", vertices=32, bevel=0.0008))
    barrel = cylinder("Barrel", 0.0115, 0.2, (0, 0.63, 0.048), m["parkerized"], axis="Y", vertices=24)
    hider = cylinder("FlashHider", 0.0155, 0.07, (0, 0.72, 0.048), m["gunmetal"], axis="Y", vertices=28, bevel=0.0012)
    hider = cut(hider, cylinder("HiderBore", 0.0085, 0.09, (0, 0.72, 0.048), m["gunmetal"], axis="Y", vertices=20, bevel=0))
    for k in range(5):
        slot = box("HiderSlot", (0.004, 0.036, 0.04), (0, 0.724, 0.048), m["gunmetal"], bevel=0)
        slot.rotation_euler = (0, math.radians(k * 36), 0)
        hider = cut(hider, slot)
    gas = box("GasBlock", (0.026, 0.03, 0.03), (0, 0.545, 0.075), m["parkerized"], bevel=0.003)
    post = box("FrontPost", (0.004, 0.008, 0.026), (0, 0.55, 0.098), m["parkerized"], bevel=0.0008)
    parts += [barrel, hider, gas, post]
    optic_body = cylinder("OpticBody", 0.0185, 0.1, (0, 0.06, 0.109), m["gunmetal"], axis="Y", vertices=32, bevel=0.002)
    optic_front = cylinder("OpticFront", 0.0235, 0.03, (0, 0.118, 0.109), m["gunmetal"], axis="Y", vertices=32, bevel=0.002, radius2=0.0195)
    lens_f = cylinder("LensFront", 0.0205, 0.002, (0, 0.134, 0.109), m["lens"], axis="Y", vertices=32, bevel=0)
    lens_r = cylinder("LensRear", 0.014, 0.002, (0, 0.009, 0.109), m["lens"], axis="Y", vertices=24, bevel=0)
    ring = cylinder("OpticRing", 0.0195, 0.008, (0, 0.04, 0.109), m["accent"], axis="Y", vertices=32, bevel=0.0005)
    mount = box("OpticMount", (0.034, 0.05, 0.012), (0, 0.06, 0.088), m["parkerized"], bevel=0.002)
    turret = cylinder("OpticTurret", 0.006, 0.01, (0, 0.07, 0.132), m["parkerized"], axis="Z", vertices=14, bevel=0.0008)
    parts += [optic_body, optic_front, lens_f, lens_r, ring, mount, turret]
    stock_profile = [(-0.02, 0.05), (-0.2, 0.048), (-0.285, 0.046), (-0.3, 0.042), (-0.305, -0.07), (-0.288, -0.076), (-0.2, -0.024), (-0.02, 0.0)]
    stock = profile("Stock", stock_profile, 0.036, m["polymer"], bevel=0.005, segments=4)
    stock = cut(stock, box("StockWindow", (0.02, 0.1, 0.022), (0, -0.19, 0.012), m["polymer"], bevel=0.004))
    parts.append(box("StockJoin", (0.034, 0.06, 0.04), (0, -0.07, 0.03), m["polymer"], bevel=0.004))
    parts.append(stock)
    pad = profile("ButtPad", [(-0.3, 0.046), (-0.314, 0.044), (-0.318, -0.07), (-0.304, -0.076)], 0.038, m["rubber"], bevel=0.003, segments=3)
    parts.append(pad)
    parts.append(box("CheekRest", (0.03, 0.12, 0.008), (0, -0.2, 0.055), m["rubber"], bevel=0.003))
    parts.append(cylinder("StockTube", 0.012, 0.12, (0, -0.16, 0.026), m["parkerized"], axis="Y", vertices=16, bevel=0.0008))
    selector = cylinder("Selector", 0.005, 0.048, (0, 0.02, 0.022), m["parkerized"], axis="X", vertices=14)
    lever = box("SelectorLever", (0.003, 0.016, 0.006), (0.026, 0.026, 0.022), m["parkerized"], bevel=0.001)
    parts += [selector, lever]
    body = join(parts, "Body")
    finish(body, (0, 0, 0))
    trigger = tube_path("Trigger", [(0, 0.052, -0.002), (0, 0.054, -0.014), (0, 0.049, -0.026)], 0.0027, m["parkerized"])
    finish(trigger, (0, 0.052, -0.002))
    handle = box("ChargeHandle", (0.03, 0.03, 0.014), (0, -0.038, 0.092), m["gunmetal"], bevel=0.003)
    latch = box("ChargeLatch", (0.012, 0.022, 0.016), (0, -0.046, 0.084), m["gunmetal"], bevel=0.002)
    grip_l = box("ChargeGripL", (0.008, 0.026, 0.01), (-0.014, -0.05, 0.092), m["accent"], bevel=0.002)
    grip_r = box("ChargeGripR", (0.008, 0.026, 0.01), (0.014, -0.05, 0.092), m["accent"], bevel=0.002)
    bolt = join([handle, latch, grip_l, grip_r], "Bolt")
    finish(bolt, (0, -0.04, 0.09))
    mag_profile = [(0.052, -0.03), (0.096, -0.03), (0.102, -0.09), (0.118, -0.15), (0.14, -0.2), (0.108, -0.205), (0.084, -0.15), (0.066, -0.09)]
    mag_body = profile("MagBody", mag_profile, 0.026, m["polymer"], bevel=0.003, segments=3)
    for k in range(5):
        parts_rib = box("MagRib", (0.027, 0.004, 0.004), (0, 0.075 + k * 0.012, -0.04 - k * 0.026), m["rubber"], bevel=0.0006)
        mag_body = join([mag_body, parts_rib], "MagBody")
    base = box("MagBase", (0.03, 0.04, 0.01), (0, 0.124, -0.206), m["parkerized"], bevel=0.002)
    base.rotation_euler = (math.radians(-25), 0, 0)
    stripe = box("MagStripe", (0.0275, 0.03, 0.002), (0, 0.118, -0.18), m["accent"], bevel=0.0005)
    stripe.rotation_euler = (math.radians(-25), 0, 0)
    mag = join([mag_body, base, stripe], "Mag")
    finish(mag, (0, 0.074, -0.03))
    empty("Muzzle", (0, 0.76, 0.048))
    empty("Eject", (0.024, 0.125, 0.056))
    empty("HandL", (-0.004, 0.4, 0.0))
    return [body, trigger, bolt, mag]


def build_smg(m):
    parts = []
    body_box = box("Receiver", (0.046, 0.24, 0.064), (0, 0.06, 0.04), m["gunmetal"], bevel=0.005, segments=3)
    body_box = cut(body_box, box("Port", (0.012, 0.07, 0.024), (0.023, 0.08, 0.05), m["gunmetal"], bevel=0.001))
    for side in (-1, 1):
        for k in range(4):
            body_box = cut(body_box, box("Vent", (0.01, 0.034, 0.008), (side * 0.023, 0.0 + k * 0.045, 0.026), m["gunmetal"], bevel=0.003))
    parts.append(body_box)
    parts.append(picatinny("Rail", -0.05, 0.28, 0.072, 0.02, m["parkerized"]))
    for y in (-0.02, 0.15):
        for side in (-1, 1):
            parts.append(screw("Pin", (side * 0.0235, y, 0.02), "X", m["parkerized"], 0.003))
    shroud = box("Shroud", (0.04, 0.1, 0.048), (0, 0.23, 0.042), m["gunmetal"], bevel=0.006, segments=3)
    shroud = cut(shroud, cylinder("ShroudBore", 0.016, 0.2, (0, 0.23, 0.042), m["gunmetal"], axis="Y", vertices=24, bevel=0))
    for k in range(3):
        shroud = cut(shroud, box("ShroudSlot", (0.05, 0.016, 0.012), (0, 0.2 + k * 0.03, 0.058), m["gunmetal"], bevel=0.003))
    parts.append(shroud)
    can = cylinder("Suppressor", 0.0215, 0.22, (0, 0.38, 0.042), m["polymer"], axis="Y", vertices=36, bevel=0.002)
    can_bore = cylinder("CanBore", 0.007, 0.25, (0, 0.38, 0.042), m["polymer"], axis="Y", vertices=16, bevel=0)
    can = cut(can, can_bore)
    parts.append(can)
    for k in range(6):
        parts.append(cylinder("CanRib", 0.0228, 0.004, (0, 0.29 + k * 0.034, 0.042), m["parkerized"], axis="Y", vertices=36, bevel=0.0004))
    parts.append(cylinder("CanBand", 0.0225, 0.01, (0, 0.495, 0.042), m["accent"], axis="Y", vertices=36, bevel=0.0006))
    parts.append(cylinder("CanMount", 0.016, 0.03, (0, 0.28, 0.042), m["parkerized"], axis="Y", vertices=24, bevel=0.001))
    grip_profile = [(0.02, 0.0), (0.012, -0.03), (0.014, -0.046), (0.004, -0.064), (0.0, -0.084), (-0.006, -0.1), (-0.018, -0.114), (-0.052, -0.114), (-0.054, -0.1), (-0.048, -0.06), (-0.04, 0.0)]
    grip = profile("Grip", grip_profile, 0.03, m["polymer"], bevel=0.005, segments=3)
    parts.append(grip)
    for side in (-1, 1):
        for i in range(6):
            parts.append(box("GripRidge", (0.0035, 0.024, 0.0022), (side * 0.0156, -0.012 - i * 0.003, -0.034 - i * 0.0105), m["rubber"], bevel=0.0007))
    parts.append(tube_path("TriggerGuard", [(0, 0.02, -0.001), (0, 0.024, -0.026), (0, 0.055, -0.036), (0, 0.082, -0.026), (0, 0.084, -0.002)], 0.0033, m["polymer"]))
    fore = box("Foregrip", (0.03, 0.03, 0.09), (0, 0.17, -0.025), m["polymer"], bevel=0.006, segments=3)
    for k in range(5):
        parts.append(box("ForeRidge", (0.032, 0.03, 0.0022), (0, 0.17, -0.04 - k * 0.011), m["rubber"], bevel=0.0007))
    foregrip_mount = box("ForeMount", (0.036, 0.05, 0.012), (0, 0.17, 0.0), m["parkerized"], bevel=0.002)
    parts += [fore, foregrip_mount]
    wire = tube_path("StockWire", [(0.0, -0.02, 0.055), (0.0, -0.2, 0.052), (0.0, -0.245, 0.02), (0.0, -0.24, -0.02), (0.0, -0.215, -0.045)], 0.0075, m["parkerized"])
    for side in (-1, 1):
        rod = tube_path("StockRod", [(side * 0.02, -0.01, 0.05), (side * 0.024, -0.16, 0.05), (side * 0.028, -0.245, 0.02), (side * 0.028, -0.24, -0.02), (side * 0.018, -0.215, -0.045)], 0.0042, m["parkerized"])
        parts.append(rod)
    parts.append(box("ButtPad", (0.044, 0.02, 0.1), (0, -0.245, 0.0), m["rubber"], bevel=0.005, segments=3))
    bpy.data.objects.remove(wire, do_unlink=True)
    rear = box("RearSight", (0.024, 0.01, 0.018), (0, -0.04, 0.1), m["parkerized"], bevel=0.0012)
    rear = cut(rear, box("RearNotch", (0.004, 0.02, 0.01), (0, -0.04, 0.108), m["parkerized"], bevel=0))
    front = box("FrontSight", (0.016, 0.012, 0.03), (0, 0.19, 0.1), m["parkerized"], bevel=0.0012)
    front = cut(front, box("FrontCut", (0.006, 0.02, 0.02), (0, 0.19, 0.104), m["parkerized"], bevel=0))
    parts += [rear, front, cylinder("FrontDot", 0.0013, 0.001, (0, 0.1835, 0.108), m["dot"], axis="Y", vertices=10, bevel=0)]
    body = join(parts, "Body")
    finish(body, (0, 0, 0))
    trigger = tube_path("Trigger", [(0, 0.04, -0.002), (0, 0.042, -0.012), (0, 0.037, -0.024)], 0.0026, m["parkerized"])
    finish(trigger, (0, 0.04, -0.002))
    knob = cylinder("Knob", 0.007, 0.018, (-0.032, 0.05, 0.062), m["parkerized"], axis="X", vertices=16, bevel=0.001)
    cap = cylinder("KnobCap", 0.0085, 0.005, (-0.043, 0.05, 0.062), m["accent"], axis="X", vertices=16, bevel=0.0008)
    stem = box("KnobStem", (0.012, 0.012, 0.008), (-0.026, 0.05, 0.062), m["parkerized"], bevel=0.001)
    bolt = join([knob, cap, stem], "Bolt")
    finish(bolt, (-0.026, 0.05, 0.062))
    mag_body = box("MagBody", (0.024, 0.034, 0.18), (0, 0.082, -0.075), m["parkerized"], bevel=0.002)
    mag_body.rotation_euler = (math.radians(-6), 0, 0)
    ribs = []
    for k in range(7):
        r = box("MagRib", (0.0255, 0.036, 0.003), (0, 0.082 - 0.0, -0.03 - k * 0.019), m["gunmetal"], bevel=0.0006)
        r.rotation_euler = (math.radians(-6), 0, 0)
        ribs.append(r)
    base = box("MagBase", (0.03, 0.044, 0.01), (0, 0.093, -0.168), m["polymer"], bevel=0.003, segments=3)
    stripe = box("MagStripe", (0.031, 0.03, 0.002), (0, 0.093, -0.174), m["accent"], bevel=0.0005)
    mag = join([mag_body, base, stripe, *ribs], "Mag")
    finish(mag, (0, 0.07, -0.04))
    empty("Muzzle", (0, 0.5, 0.042))
    empty("Eject", (0.023, 0.08, 0.05))
    empty("HandL", (0, 0.17, -0.07))
    return [body, trigger, bolt, mag]


def build_sniper(m):
    parts = []
    receiver = cylinder("ReceiverTube", 0.027, 0.5, (0, 0.14, 0.05), m["gunmetal"], axis="Y", vertices=36, bevel=0.0012)
    receiver = cut(receiver, box("EjectionPort", (0.03, 0.07, 0.02), (0.016, 0.07, 0.056), m["gunmetal"], bevel=0.001))
    receiver = cut(receiver, box("BoltSlot", (0.008, 0.16, 0.012), (0.026, 0.02, 0.05), m["gunmetal"], bevel=0))
    parts.append(receiver)
    parts.append(picatinny("Rail", -0.08, 0.36, 0.074, 0.022, m["parkerized"]))
    chassis_profile = [(-0.42, 0.075), (-0.36, 0.1), (-0.24, 0.1), (-0.16, 0.07), (-0.1, 0.03), (0.0, 0.026), (0.12, 0.028), (0.34, 0.03), (0.34, -0.012), (0.12, -0.016), (0.02, -0.024), (0.026, -0.07), (0.034, -0.1), (0.012, -0.124), (-0.04, -0.124), (-0.05, -0.07), (-0.07, -0.032), (-0.16, -0.03), (-0.26, -0.04), (-0.38, -0.06), (-0.425, -0.05)]
    chassis = profile("Chassis", chassis_profile, 0.044, m["polymer"], bevel=0.005, segments=3)
    chassis = cut(chassis, box("ThumbHole", (0.06, 0.06, 0.05), (0, -0.1, 0.0), m["polymer"], bevel=0.01, segments=3))
    for side in (-1, 1):
        for k in range(5):
            chassis = cut(chassis, box("ChassisSlot", (0.012, 0.032, 0.012), (side * 0.022, 0.15 + k * 0.04, 0.008), m["polymer"], bevel=0.004, segments=2))
    parts.append(chassis)
    parts.append(profile("ButtPad", [(-0.425, 0.073), (-0.443, 0.07), (-0.447, -0.05), (-0.428, -0.052)], 0.048, m["rubber"], bevel=0.004, segments=3))
    parts.append(box("CheekRiser", (0.036, 0.16, 0.012), (0, -0.28, 0.108), m["rubber"], bevel=0.004, segments=3))
    for k in range(5):
        parts.append(box("PadRib", (0.05, 0.004, 0.006), (0, -0.449, -0.04 + k * 0.02), m["rubber"], bevel=0.001))
    parts.append(tube_path("TriggerGuard", [(0, -0.01, 0.0), (0, -0.008, -0.026), (0, 0.03, -0.04), (0, 0.065, -0.026), (0, 0.068, -0.004)], 0.0032, m["polymer"]))
    shroud = cylinder("Shroud", 0.026, 0.3, (0, 0.5, 0.05), m["gunmetal"], axis="Y", vertices=36, bevel=0.001)
    shroud = cut(shroud, cylinder("ShroudBore", 0.0215, 0.4, (0, 0.5, 0.05), m["gunmetal"], axis="Y", vertices=28, bevel=0))
    for side in (-1, 1):
        for k in range(8):
            shroud = cut(shroud, cylinder("ShroudHole", 0.0065, 0.07, (0, 0.38 + k * 0.032, 0.05), m["gunmetal"], axis="X", vertices=12, bevel=0))
    parts.append(shroud)
    barrel = cylinder("Barrel", 0.0135, 0.7, (0, 0.58, 0.05), m["parkerized"], axis="Y", vertices=28)
    brake = cylinder("Brake", 0.0225, 0.085, (0, 0.865, 0.05), m["gunmetal"], axis="Y", vertices=32, bevel=0.0015)
    brake = cut(brake, cylinder("BrakeBore", 0.0105, 0.11, (0, 0.865, 0.05), m["gunmetal"], axis="Y", vertices=20, bevel=0))
    for k in range(3):
        brake = cut(brake, box("BrakePort", (0.06, 0.01, 0.012), (0, 0.84 + k * 0.022, 0.05), m["gunmetal"], bevel=0))
    parts += [barrel, brake, cylinder("BrakeRing", 0.0235, 0.006, (0, 0.82, 0.05), m["accent"], axis="Y", vertices=32, bevel=0.0006)]
    for y in (0.0, 0.14):
        parts.append(box("ScopeRingBase", (0.03, 0.026, 0.024), (0, y, 0.087), m["parkerized"], bevel=0.002))
        ring = cylinder("ScopeRing", 0.0235, 0.022, (0, y, 0.12), m["parkerized"], axis="Y", vertices=28, bevel=0.0012)
        ring = cut(ring, cylinder("RingBore", 0.0185, 0.03, (0, y, 0.12), m["parkerized"], axis="Y", vertices=24, bevel=0))
        parts.append(ring)
    scope = cylinder("ScopeTube", 0.0185, 0.4, (0, 0.07, 0.12), m["gunmetal"], axis="Y", vertices=32, bevel=0.0012)
    objective = cylinder("Objective", 0.0295, 0.085, (0, 0.285, 0.12), m["gunmetal"], axis="Y", vertices=36, bevel=0.0018, radius2=0.0205)
    objective.rotation_euler = (0, 0, 0)
    eyepiece = cylinder("Eyepiece", 0.0195, 0.07, (0, -0.145, 0.12), m["gunmetal"], axis="Y", vertices=32, bevel=0.0018, radius2=0.0265)
    parts += [scope, objective, eyepiece]
    parts.append(cylinder("ObjectiveLens", 0.0275, 0.002, (0, 0.3275, 0.12), m["lens"], axis="Y", vertices=36, bevel=0))
    parts.append(cylinder("EyepieceLens", 0.0235, 0.002, (0, -0.1805, 0.12), m["lens"], axis="Y", vertices=32, bevel=0))
    parts.append(cylinder("ScopeBand", 0.0192, 0.008, (0, -0.02, 0.12), m["accent"], axis="Y", vertices=32, bevel=0.0005))
    parts.append(cylinder("ZoomRing", 0.0215, 0.03, (0, -0.07, 0.12), m["rubber"], axis="Y", vertices=32, bevel=0.0008))
    parts.append(cylinder("ElevationTurret", 0.011, 0.02, (0, 0.07, 0.147), m["parkerized"], axis="Z", vertices=24, bevel=0.001))
    parts.append(cylinder("ElevationCap", 0.0125, 0.006, (0, 0.07, 0.159), m["accent"], axis="Z", vertices=24, bevel=0.0008))
    parts.append(cylinder("WindageTurret", 0.011, 0.02, (0.027, 0.07, 0.12), m["parkerized"], axis="X", vertices=24, bevel=0.001))
    for side in (-1, 1):
        leg = cylinder("BipodLeg", 0.006, 0.17, (side * 0.03, 0.42, 0.012), m["parkerized"], axis="Y", vertices=12, bevel=0.0005)
        parts.append(leg)
    parts.append(box("BipodMount", (0.07, 0.03, 0.018), (0, 0.44, 0.02), m["parkerized"], bevel=0.003))
    body = join(parts, "Body")
    finish(body, (0, 0, 0))
    trigger = tube_path("Trigger", [(0, 0.012, 0.002), (0, 0.014, -0.01), (0, 0.009, -0.022)], 0.0026, m["parkerized"])
    finish(trigger, (0, 0.012, 0.002))
    bolt_body = cylinder("BoltBody", 0.0125, 0.08, (0.016, 0.0, 0.052), m["parkerized"], axis="Y", vertices=20, bevel=0.0008)
    stem = tube_path("BoltStem", [(0.02, 0.0, 0.052), (0.05, 0.0, 0.044), (0.075, 0.0, 0.03)], 0.0055, m["parkerized"])
    knob = cylinder("BoltKnob", 0.0125, 0.026, (0.078, 0.0, 0.03), m["accent"], axis="Z", vertices=20, bevel=0.003, radius2=0.0095)
    bolt = join([bolt_body, stem, knob], "Bolt")
    finish(bolt, (0.02, 0.0, 0.05))
    mag_body = box("MagBody", (0.03, 0.062, 0.07), (0, 0.075, -0.045), m["gunmetal"], bevel=0.003, segments=3)
    mag_base = box("MagBase", (0.034, 0.066, 0.008), (0, 0.075, -0.083), m["accent"], bevel=0.0015)
    mag = join([mag_body, mag_base], "Mag")
    finish(mag, (0, 0.075, -0.01))
    empty("Muzzle", (0, 0.91, 0.05))
    empty("Eject", (0.03, 0.07, 0.056))
    empty("HandL", (0, 0.32, -0.03))
    return [body, trigger, bolt, mag]


def build_rocket(m):
    parts = []
    tube_len = 0.96
    tube = cylinder("Tube", 0.066, tube_len, (0, 0.2, 0.07), m["olive"], axis="Y", vertices=48, bevel=0.0015)
    tube = cut(tube, cylinder("TubeBore", 0.056, tube_len + 0.1, (0, 0.2, 0.07), m["olive"], axis="Y", vertices=40, bevel=0))
    parts.append(tube)
    muzzle_flare = cylinder("MuzzleFlare", 0.066, 0.06, (0, 0.71, 0.07), m["olive"], axis="Y", vertices=48, bevel=0.0012, radius2=0.082)
    muzzle_flare = cut(muzzle_flare, cylinder("MuzzleFlareBore", 0.056, 0.1, (0, 0.71, 0.07), m["olive"], axis="Y", vertices=40, bevel=0))
    parts.append(muzzle_flare)
    rear = cylinder("RearFlare", 0.094, 0.1, (0, -0.33, 0.07), m["olive"], axis="Y", vertices=48, bevel=0.0012, radius2=0.066)
    rear = cut(rear, cylinder("RearBore", 0.056, 0.2, (0, -0.33, 0.07), m["olive"], axis="Y", vertices=40, bevel=0))
    parts.append(rear)
    for y, w in ((-0.2, 0.012), (0.02, 0.008), (0.4, 0.012), (0.6, 0.008)):
        parts.append(cylinder("TubeBand", 0.0685, w, (0, y, 0.07), m["accent"] if w == 0.012 else m["gunmetal"], axis="Y", vertices=48, bevel=0.0007))
    for k in range(5):
        parts.append(cylinder("RearRib", 0.0675, 0.006, (0, 0.18 + k * 0.032, 0.07), m["gunmetal"], axis="Y", vertices=48, bevel=0.0006))
    shield = box("HeatShield", (0.1, 0.34, 0.03), (0, 0.18, 0.003), m["polymer"], bevel=0.008, segments=4)
    for k in range(6):
        shield = cut(shield, box("ShieldVent", (0.07, 0.02, 0.05), (0, 0.06 + k * 0.05, 0.003), m["polymer"], bevel=0.005, segments=2))
    parts.append(shield)
    for side in (-1, 1):
        parts.append(box("ShieldClamp", (0.012, 0.03, 0.07), (side * 0.045, 0.02, 0.028), m["parkerized"], bevel=0.002))
        parts.append(box("ShieldClampF", (0.012, 0.03, 0.07), (side * 0.045, 0.34, 0.028), m["parkerized"], bevel=0.002))
    grip_profile = [(0.02, 0.0), (0.014, -0.03), (0.016, -0.048), (0.006, -0.066), (0.002, -0.088), (-0.006, -0.104), (-0.016, -0.122), (-0.054, -0.122), (-0.056, -0.108), (-0.05, -0.064), (-0.04, -0.01), (-0.03, 0.0)]
    grip = profile("Grip", grip_profile, 0.034, m["polymer"], bevel=0.005, segments=3)
    parts.append(grip)
    for i in range(7):
        parts.append(box("GripRidge", (0.039, 0.024, 0.0022), (0, -0.012 - i * 0.003, -0.034 - i * 0.0105), m["rubber"], bevel=0.0007))
    parts.append(tube_path("TriggerGuard", [(0, 0.022, -0.001), (0, 0.026, -0.03), (0, 0.062, -0.042), (0, 0.095, -0.03), (0, 0.098, -0.002)], 0.0036, m["polymer"]))
    fore_profile = [(0.0, 0.0), (-0.022, -0.04), (-0.026, -0.1), (-0.012, -0.14), (0.02, -0.14), (0.032, -0.1), (0.03, -0.04), (0.016, 0.0)]
    fore = profile("Foregrip", fore_profile, 0.036, m["polymer"], bevel=0.005, segments=3)
    fore.location = (0, 0.3, 0.0)
    activate(fore)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    parts.append(fore)
    for i in range(5):
        parts.append(box("ForeRidge", (0.04, 0.03, 0.0022), (0, 0.3, -0.05 - i * 0.016), m["rubber"], bevel=0.0007))
    parts.append(box("ForeMount", (0.06, 0.06, 0.02), (0, 0.3, 0.01), m["parkerized"], bevel=0.003))
    sight_mount = box("SightMount", (0.022, 0.12, 0.03), (-0.076, 0.1, 0.082), m["parkerized"], bevel=0.003)
    sight_body = cylinder("SightBody", 0.018, 0.12, (-0.088, 0.1, 0.108), m["gunmetal"], axis="Y", vertices=28, bevel=0.0015)
    sight_lens = cylinder("SightLens", 0.0155, 0.002, (-0.088, 0.161, 0.108), m["lens"], axis="Y", vertices=28, bevel=0)
    sight_dot = cylinder("SightDot", 0.0012, 0.001, (-0.088, 0.1615, 0.108), m["dot"], axis="Y", vertices=10, bevel=0)
    sight_hood = cylinder("SightHood", 0.021, 0.03, (-0.088, 0.145, 0.108), m["polymer"], axis="Y", vertices=28, bevel=0.001, radius2=0.018)
    parts += [sight_mount, sight_body, sight_lens, sight_dot, sight_hood]
    parts.append(picatinny("TopRail", -0.06, 0.3, 0.134, 0.02, m["parkerized"]))
    parts.append(box("FrontSightPost", (0.004, 0.008, 0.02), (0, 0.5, 0.146), m["parkerized"], bevel=0.0008))
    parts.append(box("RearSightBlock", (0.022, 0.012, 0.016), (0, -0.04, 0.152), m["parkerized"], bevel=0.0012))
    parts.append(box("SwitchBox", (0.04, 0.05, 0.024), (0.06, 0.04, 0.012), m["gunmetal"], bevel=0.003))
    body = join(parts, "Body")
    finish(body, (0, 0, 0))
    trigger = tube_path("Trigger", [(0, 0.05, -0.002), (0, 0.052, -0.014), (0, 0.047, -0.026)], 0.0028, m["parkerized"])
    finish(trigger, (0, 0.05, -0.002))
    rocket_parts = []
    rocket_parts.append(cylinder("RocketBody", 0.05, 0.54, (0, 0.32, 0.07), m["parkerized"], axis="Y", vertices=36, bevel=0.002))
    rocket_parts.append(cylinder("Warhead", 0.05, 0.2, (0, 0.69, 0.07), m["warhead"], axis="Y", vertices=36, bevel=0.002, radius2=0.012))
    rocket_parts.append(cylinder("WarheadTip", 0.012, 0.03, (0, 0.795, 0.07), m["parkerized"], axis="Y", vertices=16, bevel=0.002))
    rocket_parts.append(cylinder("WarheadBand", 0.0505, 0.018, (0, 0.6, 0.07), m["accent"], axis="Y", vertices=36, bevel=0.0008))
    for k in range(4):
        fin = box("Fin", (0.004, 0.08, 0.08), (0, -0.04, 0.07 + 0.0), m["gunmetal"], bevel=0.0012)
        fin.rotation_euler = (math.radians(k * 90 + 45), 0, 0)
        fin.location = (0, 0.07, 0.07)
        rocket_parts.append(fin)
    rocket = join(rocket_parts, "Rocket")
    finish(rocket, (0, 0.32, 0.07))
    empty("Muzzle", (0, 0.84, 0.07))
    empty("Eject", (0, -0.4, 0.07))
    empty("HandL", (0, 0.3, -0.05))
    return [body, trigger, rocket]


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_materials="EXPORT", export_animations=False, export_cameras=False, export_lights=False)


def build(kind):
    reset_scene()
    m = materials()
    {"aa12": build_aa12, "pistol": build_pistol, "ar": build_ar, "smg": build_smg, "sniper": build_sniper, "rocket": build_rocket}[kind](m)
    export(os.path.join(OUT_DIR, f"{kind}.glb"))
    report = {"kind": kind, "triangles": 0, "objects": []}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        report["objects"].append(o.name)
        if o.type == "MESH":
            mesh = o.evaluated_get(depsgraph).to_mesh()
            mesh.calc_loop_triangles()
            report["triangles"] += len(mesh.loop_triangles)
            o.evaluated_get(depsgraph).to_mesh_clear()
    print("REPORT", report)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["aa12", "pistol", "ar", "smg", "sniper", "rocket"]
    for kind in args:
        build(kind)
