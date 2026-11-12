import bpy
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
WEAPON_DIR = os.path.join(REPO, "docs", "arena", "assets", "weapons")
PREVIEW_DIR = os.path.join(ROOT, "previews")


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_light(name, kind, location, energy, size, target):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    look_at(obj, target)


def render(kind, view):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(WEAPON_DIR, f"{kind}.glb"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lo = Vector((min(v[i] for o in meshes for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
    hi = Vector((max(v[i] for o in meshes for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
    center = (lo + hi) / 2
    size = (hi - lo).length
    print("DIMENSIONS", kind, tuple(round(x, 3) for x in (hi - lo)))
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.06, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    offsets = {"three_quarter": (1.0, -0.55, 0.45), "side": (1.0, 0.0, 0.08), "left": (-1.0, 0.2, 0.25)}
    off = Vector(offsets[view]).normalized() * size * 2.4
    cam.location = center + off
    look_at(cam, center)
    scene.camera = cam
    add_light("Key", "AREA", center + Vector((0.6, -0.8, 1.0)) * size, 300 * size * size, size, center)
    add_light("Fill", "AREA", center + Vector((-1.0, -0.3, 0.3)) * size, 100 * size * size, size, center)
    add_light("Rim", "AREA", center + Vector((-0.2, 1.0, 0.6)) * size, 220 * size * size, size * 0.6, center)
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene.render.filepath = os.path.join(PREVIEW_DIR, f"{kind}_{view}.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["aa12", "pistol"]
    for kind in args:
        for view in ("three_quarter", "side", "left"):
            render(kind, view)
