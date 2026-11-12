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


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_materials="EXPORT", export_animations=False, export_cameras=False, export_lights=False)


def build(kind):
    reset_scene()
    m = materials()
    if kind == "aa12":
        build_aa12(m)
    else:
        build_pistol(m)
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
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["aa12", "pistol"]
    for kind in args:
        build(kind)
