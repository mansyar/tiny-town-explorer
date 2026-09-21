"""Ice-cream truck (Kenney Car Kit family) — deterministic Blender recipe.

No Kenney kit ships an ice-cream truck, so this is the one authored piece in the
v1 fleet. It is authored to the *measured* Car Kit contract (see
`conductor/tracks/v1-playtest-slice_20260921/kit-mount-measurements.md`), so a
single runtime fit in `vehicleActor` handles the whole fleet:

  * Blender axes: +X = the model's right, +Z = up. The shipped GLB faces glTF
    +Z (the car's nose), and Blender's glTF axis conversion maps glTF +Z onto
    Blender -Y — so `build_ice_cream_truck` turns the finished truck 180
    degrees about Z before export. Measured, not assumed: the kit's own
    firetruck has its grill at Blender y = -1.575.
  * Stands on the ground plane: `min z = 0.000`, like every Car Kit vehicle.
  * Car Kit scale, not town scale: ~1.79 x 3.40 x 2.78 against the firetruck's
    1.50 x 1.70 x 3.40. The runtime scales the family down to the car capsule.
  * Palette from `car-kit/colormap.png` — a 512x512 gradient atlas, so every
    material pins its UVs to one sampled texel and reads as one flat colour.

Run headless:

    blender --background --python scripts/blender-ice-cream-truck.py

Node-name contract (greppable, one node each):

    ice_cream_body_lower, ice_cream_body_upper, ice_cream_roof_band,
    ice_cream_roof_cap, ice_cream_windshield, ice_cream_cab_window_left,
    ice_cream_cab_window_right, ice_cream_serving_window, ice_cream_awning,
    ice_cream_menu, ice_cream_grille, ice_cream_headlight_left,
    ice_cream_headlight_right, ice_cream_bumper, ice_cream_roof_cone, ice_cream_roof_scoop, ice_cream_roof_cherry,
    ice_cream_wheel_front_left, ice_cream_wheel_front_right,
    ice_cream_wheel_back_left, ice_cream_wheel_back_right,
    ice_cream_hub_front_left, ice_cream_hub_front_right,
    ice_cream_hub_back_left, ice_cream_hub_back_right

The palette is extracted from a committed packed kit GLB rather than kept as a
loose PNG: the repo commits packed models plus each kit's LICENSE.txt and
nothing else.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
CAR_KIT = ROOT / "src" / "assets" / "kits" / "car-kit"
OUT_DIR = Path(
    r"C:\Users\Ansyar\AppData\Local\Temp\opencode\ice-cream-truck"
)
GLB_PATH = OUT_DIR / "ice-cream-truck.glb"
PALETTE_PNG = OUT_DIR / "colormap.png"

# Palette texels sampled from car-kit/colormap.png (System.Drawing coordinates,
# y measured from the top of the image).
TEXELS = {
    "body": ((495, 391), "#FF8AAE"),
    "trim": ((431, 262), "#F6F6F9"),
    "accent": ((175, 470), "#E1473E"),
    "glass": ((48, 16), "#C2DDFA"),
    "hub": ((336, 272), "#A0A8C9"),
    "tyre": ((175, 383), "#36363A"),
    "cone": ((431, 472), "#DBA33D"),
    "yellow": ((112, 400), "#FFE44B"),
    "vanilla": ((144, 144), "#FDE4C7"),
}
IMAGE_SIZE = 512.0


def uv_for(texel: tuple[int, int]) -> tuple[float, float]:
    """Centre of a palette texel in Blender UV space (v measured upward)."""
    x, y = texel
    return ((x + 0.5) / IMAGE_SIZE, (IMAGE_SIZE - y - 0.5) / IMAGE_SIZE)


def extract_palette() -> None:
    """Write the Car Kit palette out of a committed packed GLB."""
    glb = (CAR_KIT / "firetruck.glb").read_bytes()
    json_length = struct.unpack_from("<I", glb, 12)[0]
    gltf = json.loads(glb[20 : 20 + json_length])
    view = gltf["bufferViews"][gltf["images"][0]["bufferView"]]
    start = 20 + json_length + 8 + view.get("byteOffset", 0)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PALETTE_PNG.write_bytes(glb[start : start + view["byteLength"]])
    print(f"palette     {PALETTE_PNG} ({view['byteLength']} bytes)")


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def palette_image() -> bpy.types.Image:
    image = bpy.data.images.load(str(PALETTE_PNG))
    image.name = "colormap"
    image.colorspace_settings.name = "sRGB"
    return image


def make_material(name: str, image: bpy.types.Image, key: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    # glTF viewers name a texture from the image, and the packer namespaces it.
    texture.label = "colormap"
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.85
    r, g, b = (int(TEXELS[key][1][i : i + 2], 16) / 255 for i in (1, 3, 5))
    material.diffuse_color = (r, g, b, 1.0)
    material.use_backface_culling = False
    return material


def pin_uvs(obj: bpy.types.Object, texel: tuple[int, int]) -> None:
    """Give every loop the same palette texel, so each face reads flat."""
    mesh = obj.data
    layer = mesh.uv_layers[0] if mesh.uv_layers else mesh.uv_layers.new(name="UVMap")
    u, v = uv_for(texel)
    for loop in layer.data:
        loop.uv = (u, v)


def finish(
    obj: bpy.types.Object, name: str, material: bpy.types.Material, key: str
) -> bpy.types.Object:
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(material)
    pin_uvs(obj, TEXELS[key][0])
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def add_box(
    name: str,
    size: tuple[float, float, float],
    centre: tuple[float, float, float],
    material: bpy.types.Material,
    key: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre)
    obj = bpy.context.active_object
    obj.scale = size
    return finish(obj, name, material, key)


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    centre: tuple[float, float, float],
    material: bpy.types.Material,
    key: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=radius,
        depth=depth,
        location=centre,
        rotation=(0.0, 1.5707963267948966, 0.0),
    )
    return finish(bpy.context.active_object, name, material, key)


def add_cone(
    name: str,
    radius: float,
    depth: float,
    centre: tuple[float, float, float],
    material: bpy.types.Material,
    key: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        # radius1 is the base and radius2 the top, and a soft-serve cone is wide
        # at the top with its point at the bottom, so the mouth takes `radius`.
        vertices=12, radius1=0.0, radius2=radius, depth=depth, location=centre
    )
    return finish(bpy.context.active_object, name, material, key)


def add_scoop(
    name: str,
    radius: float,
    centre: tuple[float, float, float],
    material: bpy.types.Material,
    key: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1, radius=radius, location=centre
    )
    return finish(bpy.context.active_object, name, material, key)


def build_ice_cream_truck() -> list[bpy.types.Object]:
    """A two-tone serving van under a waffle cone.

    The silhouette follows the reviewer's reference, which is a forward-control
    van rather than a box truck: the cab is the body's own front, so it reads
    from its windscreen, grille, headlights and bumper instead of a separate box.
    Nothing that carries lettering in the reference is reproduced — the game has
    no text anywhere.
    """
    image = palette_image()
    body = make_material("ice_cream_body", image, "body")
    trim = make_material("ice_cream_trim", image, "trim")
    accent = make_material("ice_cream_accent", image, "accent")
    glass = make_material("ice_cream_glass", image, "glass")
    hub = make_material("ice_cream_hub", image, "hub")
    tyre = make_material("ice_cream_tyre", image, "tyre")
    cone = make_material("ice_cream_cone", image, "cone")
    yellow = make_material("ice_cream_yellow", image, "yellow")
    vanilla = make_material("ice_cream_vanilla", image, "vanilla")

    parts = [
        # Two-tone body: pink below the waistline, cream above, yellow roof band.
        add_box(
            "ice_cream_body_lower", (1.55, 3.30, 0.80), (0.0, 0.0, 0.70), body, "body"
        ),
        add_box(
            "ice_cream_body_upper", (1.55, 3.30, 0.50), (0.0, 0.0, 1.35), trim, "trim"
        ),
        # The yellow is a stripe under the roof, not the roof itself: a cream cap
        # sits on top so the van does not read as a yellow slab from above.
        add_box(
            "ice_cream_roof_band",
            (1.62, 3.38, 0.10),
            (0.0, 0.0, 1.65),
            yellow,
            "yellow",
        ),
        add_box(
            "ice_cream_roof_cap", (1.56, 3.32, 0.06), (0.0, 0.0, 1.73), trim, "trim"
        ),
        # The cab is the body's front: windscreen over a grille and bumper.
        add_box(
            "ice_cream_windshield", (1.30, 0.08, 0.40), (0.0, 1.63, 1.32), glass, "glass"
        ),
        add_box(
            "ice_cream_cab_window_left",
            (0.06, 0.70, 0.36),
            (0.79, 0.90, 1.32),
            glass,
            "glass",
        ),
        add_box(
            "ice_cream_cab_window_right",
            (0.06, 0.70, 0.36),
            (-0.79, 0.90, 1.32),
            glass,
            "glass",
        ),
        add_box("ice_cream_grille", (0.90, 0.10, 0.40), (0.0, 1.66, 0.60), tyre, "tyre"),
        add_box(
            "ice_cream_headlight_left",
            (0.24, 0.08, 0.22),
            (0.60, 1.67, 0.92),
            yellow,
            "yellow",
        ),
        add_box(
            "ice_cream_headlight_right",
            (0.24, 0.08, 0.22),
            (-0.60, 1.67, 0.92),
            yellow,
            "yellow",
        ),
        add_box(
            "ice_cream_bumper", (1.45, 0.14, 0.16), (0.0, 1.68, 0.34), trim, "trim"
        ),
        # Serving side: hatch, a projecting awning, and a menu board beside it.
        add_box(
            "ice_cream_serving_window",
            (0.06, 1.15, 0.45),
            (0.79, -0.60, 1.28),
            glass,
            "glass",
        ),
        add_box(
            "ice_cream_awning", (0.26, 1.30, 0.10), (0.86, -0.60, 1.57), accent, "accent"
        ),
        add_box(
            "ice_cream_menu", (0.06, 0.48, 0.42), (0.79, 0.28, 1.28), trim, "trim"
        ),
        # Roof cone: the piece that identifies the truck at a glance, set above
        # the cab as in the reference.
        # The cone's point rests on the roof cap: no plinth, or the cream stand
        # vanishes against the cream roof and leaves the cone apparently floating.
        add_cone("ice_cream_roof_cone", 0.36, 0.52, (0.0, 0.60, 2.02), cone, "cone"),
        # The swirl fills the cone's mouth rather than sitting in it as a bead.
        # Warm vanilla, not the body's cool cream, or it vanishes against the roof.
        add_scoop("ice_cream_roof_scoop", 0.34, (0.0, 0.60, 2.34), vanilla, "vanilla"),
        add_scoop("ice_cream_roof_cherry", 0.12, (0.0, 0.60, 2.66), accent, "accent"),
        # Blue-hubbed wheels, set proud of the body like the reference's.
        add_cylinder(
            "ice_cream_wheel_front_left", 0.32, 0.30, (-0.68, 1.05, 0.32), tyre, "tyre"
        ),
        add_cylinder(
            "ice_cream_wheel_front_right", 0.32, 0.30, (0.68, 1.05, 0.32), tyre, "tyre"
        ),
        add_cylinder(
            "ice_cream_wheel_back_left", 0.32, 0.30, (-0.68, -0.95, 0.32), tyre, "tyre"
        ),
        add_cylinder(
            "ice_cream_wheel_back_right", 0.32, 0.30, (0.68, -0.95, 0.32), tyre, "tyre"
        ),
        add_cylinder(
            "ice_cream_hub_front_left", 0.17, 0.34, (-0.68, 1.05, 0.32), hub, "hub"
        ),
        add_cylinder(
            "ice_cream_hub_front_right", 0.17, 0.34, (0.68, 1.05, 0.32), hub, "hub"
        ),
        add_cylinder(
            "ice_cream_hub_back_left", 0.17, 0.34, (-0.68, -0.95, 0.32), hub, "hub"
        ),
        add_cylinder(
            "ice_cream_hub_back_right", 0.17, 0.34, (0.68, -0.95, 0.32), hub, "hub"
        ),
    ]
    # Blender's glTF importer maps glTF +Z onto Blender -Y, so the measured Car
    # Kit fleet has its nose at -Y (firetruck grill at Blender y = -1.575). The
    # parts above are authored nose-forward at +Y because that reads better, so
    # turn the finished truck: the exported GLB then faces glTF +Z like the kit's
    # and mounts at the same yaw instead of needing a second convention.
    for part in parts:
        part.rotation_euler = 0.0, 0.0, math.radians(180.0)
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bpy.context.view_layer.update()
    print(f"built       {len(parts)} parts")
    return parts


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            low = Vector((min(low.x, world.x), min(low.y, world.y), min(low.z, world.z)))
            high = Vector(
                (max(high.x, world.x), max(high.y, world.y), max(high.z, world.z))
            )
    return low, high


def aim_camera(centre: Vector, span: float, direction: Vector, path: Path) -> None:
    """Ortho frame sized to the stage's bounding diagonal, from any angle."""
    scene = bpy.context.scene
    data = bpy.data.cameras.new("check_camera")
    data.type = "ORTHO"
    data.ortho_scale = span * 1.1
    data.clip_start = 0.1
    data.clip_end = 200.0
    camera = bpy.data.objects.new("check_camera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    location = centre + direction.normalized() * 30.0
    camera.location = location
    camera.rotation_euler = (location - centre).to_track_quat("Z", "Y").to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"rendered    {path}")
    bpy.data.objects.remove(camera, do_unlink=True)


def light_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.seed = 0
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    # Faithful palette: the default filmic transform desaturates the swatches.
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("check_world")
    world.use_nodes = True
    background = next(
        node for node in world.node_tree.nodes if node.type == "BACKGROUND"
    )
    background.inputs["Color"].default_value = (0.75, 0.86, 0.95, 1.0)
    # A style check must show the palette, so ambient light keeps shadowed
    # faces coloured instead of crushing them to black.
    background.inputs["Strength"].default_value = 1.6
    scene.world = world

    sun_data = bpy.data.lights.new("check_sun", type="SUN")
    sun_data.energy = 2.4
    sun_data.angle = 0.35
    sun = bpy.data.objects.new("check_sun", sun_data)
    sun.rotation_euler = (0.85, 0.2, 0.6)
    scene.collection.objects.link(sun)


def import_glb(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [
        obj for obj in set(bpy.data.objects) - before if obj.type == "MESH"
    ]


def add_ground() -> None:
    """A plain floor for the style render — never part of the framing stage."""
    bpy.ops.mesh.primitive_plane_add(size=40.0, location=(0.0, 0.0, -0.001))
    ground = bpy.context.active_object
    ground.name = "check_ground"
    ground.data.materials.append(
        make_material("check_ground", palette_image(), "trim")
    )
    pin_uvs(ground, TEXELS["trim"][0])


def stage_neighbours() -> list[bpy.types.Object]:
    """The firetruck, for scale and style.

    The ground is excluded from the returned list so it cannot widen the
    framing. Ground contact is deliberately not judged here either: a Blender
    render draws its own floor, so the seating check belongs in the running app
    (gate 5.1).
    """
    firetruck = import_glb(CAR_KIT / "firetruck.glb")
    # Blender's glTF importer can keep a node hierarchy, so translate only the
    # parentless roots: nudging every mesh double-applies the offset to any
    # child (which is how the truck's grill first ended up 3.6 units adrift).
    movers = [obj for obj in firetruck if obj.parent is None] or firetruck
    for obj in movers:
        obj.location.x += 3.6
        obj.location.y -= 0.6
    bpy.context.view_layer.update()
    print(f"neighbours  {len(firetruck)} firetruck meshes")
    return firetruck


def render_checks(parts: list[bpy.types.Object]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    light_scene()
    low, high = bounds(parts)
    centre = (low + high) / 2
    span = (high - low).length

    # Layer 2 style check: the new piece parked beside accepted neighbours.
    add_ground()
    neighbours = stage_neighbours()
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        low, high = bounds([obj])
        print(
            f"staged      {obj.name:<28} "
            f"x {low.x:7.2f}..{high.x:7.2f}  "
            f"y {low.y:7.2f}..{high.y:7.2f}  "
            f"z {low.z:7.2f}..{high.z:7.2f}"
        )
    stage_low, stage_high = bounds(parts + neighbours)
    aim_camera(
        (stage_low + stage_high) / 2,
        (stage_high - stage_low).length,
        Vector((1.1, -1.4, 0.8)),
        OUT_DIR / "hero.png",
    )
    for obj in neighbours:
        bpy.data.objects.remove(obj, do_unlink=True)

    # Facing check: the nose (+Y) must face the camera.
    aim_camera(centre, span, Vector((0.0, -2.2, 0.7)), OUT_DIR / "front.png")


def export_ice_cream_truck(parts: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        # Keep the palette external so scripts/pack-glb-assets.ts can embed it
        # under the kit-namespaced name `car-kit/colormap`.
        export_keep_originals=True,
    )
    print(f"exported    {GLB_PATH}")


def verify_glb(required: list[str]) -> int:
    if not GLB_PATH.exists():
        print("FAIL  io: no GLB written")
        return 1
    glb = GLB_PATH.read_bytes()
    json_length = struct.unpack_from("<I", glb, 12)[0]
    gltf = json.loads(glb[20 : 20 + json_length])
    names = [node.get("name", "") for node in gltf.get("nodes", [])]

    failures = 0
    missing = [name for name in required if names.count(name) != 1]
    if missing:
        print(f"FAIL  node-contract: {missing}")
        failures += 1
    empty = [
        node.get("name")
        for node in gltf.get("nodes", [])
        if node.get("mesh") is None
    ]
    if empty:
        print(f"FAIL  hygiene: non-mesh nodes {empty}")
        failures += 1

    images = gltf.get("images", [])
    uris = [image.get("uri", "<embedded>") for image in images]
    print(f"images      {uris}")
    print(f"bytes       {len(glb)} ({len(glb) / 1024:.1f} KiB)")
    print(f"nodes       {len(names)}")
    if not failures:
        print("PASS  node-contract, hygiene")
    return failures


def main() -> None:
    reset_scene()
    extract_palette()
    parts = build_ice_cream_truck()
    low, high = bounds(parts)
    size = high - low
    print(
        f"extents     {size.x:.3f} x {size.y:.3f} x {size.z:.3f}"
        f"  (min z = {low.z:.3f})"
    )
    render_checks(parts)
    export_ice_cream_truck(parts)
    failures = verify_glb([obj.name for obj in parts])
    sys.exit(failures)


if __name__ == "__main__":
    main()
