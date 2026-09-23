"""Corner shop (Kenney City Kit Suburban family) — deterministic Blender recipe.

No Kenney kit ships a shopfront building, so this is the authored landmark of
the second district (FR3). It is authored to the *measured* City Kit (Suburban)
contract (see `conductor/archive/v1-playtest-slice_20260921/kit-mount-measurements.md`
and `conductor/tracks/second-district_20260923/spec.md` FR3), so the town's
usual house mounting handles it: fit-capped, footprint published after mount.

Gate 1.1 measurement table (measured before this recipe was written):

  * Lot pitch 1.00 x 1.00; fit cap `HOUSE_LOT_FIT` 0.86 on the widest
    horizontal axis (`houseFitScale`, never scales up).
  * Family authoring envelope (measured, w x h x d): 1.03–1.83 x 0.83–1.24 x
    0.89–1.41 (building-type-a/b/c/d/f/q/r via `scripts/measure-assets.ts`).
    The shop targets 1.4–1.6 wide x ~0.95 tall x ~1.35 deep — in band, and its
    fitted front wall lands at ~0.61 from the street centre line, inside the
    family's measured wall band 0.574–0.748.
  * Seating: stands on the ground plane, `min z = 0.000`, like every suburban
    building. Ground contact is verified in the running app (gate 5.1).
  * Facing: a model's local +z is its front (`yawForDirection` turns it toward
    the house's `facing`; south is yaw 0). Blender's glTF conversion maps glTF
    +Z onto Blender -Y, so the shopfront is authored at +Y and the finished
    assembly is turned 180 degrees about Z before export — the same convention
    the ice-cream truck measured against the kit.
  * Palette: `city-kit-suburban/colormap.png` — a 512x512 gradient atlas, so
    every material pins its UVs to one sampled texel and reads as one flat
    colour. Texels come from the family's own two gradient columns plus the
    neutral cells; the typeface-free silhouette carries the read (FR3).

Run headless:

    blender --background --python scripts/blender-corner-shop.py

Node-name contract (greppable, one node each):

    shop_body, shop_roof, shop_roof_trim, shop_awning, shop_awning_mid,
    shop_awning_end, shop_awning_stripe_a, shop_awning_stripe_b,
    shop_awning_valance, shop_window, shop_window_left, shop_window_right,
    shop_door, shop_step, shop_crate, shop_produce_a, shop_produce_b

The palette is extracted from a committed packed kit GLB rather than kept as a
loose PNG: the repo commits packed models plus each kit's LICENSE.txt and
nothing else.
"""

from __future__ import annotations

import json
import math
import struct
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SUBURBAN_KIT = ROOT / "src" / "assets" / "kits" / "city-kit-suburban"
# Build artefacts land in the OS temp directory rather than in the repo: the
# recipe re-runs at any time, and the committed model is the packed GLB under
# `src/assets/kits/city-kit-suburban/`.
OUT_DIR = Path(tempfile.gettempdir()) / "tiny-town-explorer-corner-shop"
GLB_PATH = OUT_DIR / "corner-shop.glb"
PALETTE_PNG = OUT_DIR / "colormap.png"

# Palette texels sampled from city-kit-suburban/colormap.png (System.Drawing
# coordinates, y measured from the top of the image). The roof and stripe pick
# the family's own gradient columns (x=48 greens, x=240 corals) so the shop
# reads as the same neighbourhood; the neutrals carry the shopfront.
TEXELS = {
    "wall": ((160, 300), "#F6F1E7"),
    "roof": ((48, 243), "#228C6C"),
    "trim": ((240, 243), "#D3554D"),
    "awning": ((160, 300), "#F6F1E7"),
    "stripe": ((240, 206), "#E35E49"),
    "valance": ((240, 243), "#D3554D"),
    "glass": ((352, 190), "#C2DDFA"),
    "door": ((96, 300), "#4A4A50"),
    "step": ((32, 300), "#8D93A6"),
    "crate": ((352, 320), "#C99A6A"),
    "produce": ((96, 190), "#FFB13B"),
}
IMAGE_SIZE = 512.0


def uv_for(texel: tuple[int, int]) -> tuple[float, float]:
    """Centre of a palette texel in Blender UV space (v measured upward)."""
    x, y = texel
    return ((x + 0.5) / IMAGE_SIZE, (IMAGE_SIZE - y - 0.5) / IMAGE_SIZE)


def extract_palette() -> None:
    """Write the Suburban palette out of a committed packed GLB."""
    glb = (SUBURBAN_KIT / "building-type-a.glb").read_bytes()
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
        vertices=12, radius1=radius, radius2=0.0, depth=depth, location=centre
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


def build_corner_shop() -> list[bpy.types.Object]:
    """A one-storey shopfront under a striped awning.

    The silhouette carries the read at 48px with zero text (FR3): the big
    display window and the awning's hanging valance are the shapes that say
    "shop", the door and step say "come in", and the produce crate out front
    says "corner shop" from any street. Nothing that carries lettering in a
    reference is reproduced — the game has no text anywhere.
    """
    image = palette_image()
    wall = make_material("shop_wall", image, "wall")
    roof = make_material("shop_roof", image, "roof")
    trim = make_material("shop_trim", image, "trim")
    awning = make_material("shop_awning", image, "awning")
    stripe = make_material("shop_stripe", image, "stripe")
    valance = make_material("shop_valance", image, "valance")
    glass = make_material("shop_glass", image, "glass")
    door = make_material("shop_door", image, "door")
    step = make_material("shop_step", image, "step")
    crate = make_material("shop_crate", image, "crate")
    produce = make_material("shop_produce", image, "produce")

    parts = [
        # The mass: one plain box, so the awning and window own the read.
        add_box("shop_body", (1.40, 0.95, 0.78), (0.0, 0.0, 0.39), wall, "wall"),
        # Flat slab roof with an overhang, and the cornice band under it —
        # the same band language the kit's own buildings use at the eaves.
        add_box("shop_roof", (1.52, 1.06, 0.12), (0.0, 0.0, 0.84), roof, "roof"),
        add_box(
            "shop_roof_trim", (1.56, 1.10, 0.05), (0.0, 0.0, 0.755), trim, "trim"
        ),
        # The striped awning: the piece that identifies the shop at a glance.
        # Five flush prisms weave the stripes across the whole slab — cream,
        # coral, cream, coral, cream — so the alternation reads on the top and
        # the front face alike with no step shadows, and the valance hangs off
        # the front edge so the silhouette scallops.
        add_box("shop_awning", (0.30, 0.34, 0.08), (-0.60, 0.64, 0.62), awning, "awning"),
        add_box(
            "shop_awning_stripe_a", (0.30, 0.34, 0.08), (-0.30, 0.64, 0.62),
            stripe, "stripe",
        ),
        add_box(
            "shop_awning_mid", (0.30, 0.34, 0.08), (0.0, 0.64, 0.62),
            awning, "awning",
        ),
        add_box(
            "shop_awning_stripe_b", (0.30, 0.34, 0.08), (0.30, 0.64, 0.62),
            stripe, "stripe",
        ),
        add_box(
            "shop_awning_end", (0.30, 0.34, 0.08), (0.60, 0.64, 0.62),
            awning, "awning",
        ),
        add_box(
            "shop_awning_valance", (1.50, 0.03, 0.10), (0.0, 0.815, 0.53),
            valance, "valance",
        ),
        # Shopfront: the display window is the biggest opening, the door sits
        # beside it with a step, so the facade reads window-door at any size.
        add_box("shop_window", (0.62, 0.04, 0.36), (0.28, 0.48, 0.40), glass, "glass"),
        add_box("shop_door", (0.26, 0.04, 0.46), (-0.42, 0.48, 0.23), door, "door"),
        add_box("shop_step", (0.34, 0.14, 0.05), (-0.42, 0.52, 0.025), step, "step"),
        # Side windows so the shop holds up from the back streets too.
        add_box(
            "shop_window_left", (0.04, 0.40, 0.28), (0.70, -0.05, 0.44), glass, "glass"
        ),
        add_box(
            "shop_window_right", (0.04, 0.40, 0.28), (-0.70, -0.05, 0.44), glass, "glass"
        ),
        # The crate of produce out front: the charm piece that says "corner
        # shop" from across the junction, sized small so it never crowds the
        # door (the occupant-sized read, not the mount's).
        add_box("shop_crate", (0.22, 0.22, 0.16), (0.55, 0.66, 0.08), crate, "crate"),
        add_scoop("shop_produce_a", 0.05, (0.50, 0.62, 0.19), produce, "produce"),
        add_scoop("shop_produce_b", 0.05, (0.60, 0.69, 0.19), produce, "produce"),
    ]
    # Blender's glTF importer maps glTF +Z onto Blender -Y, and the town turns a
    # model's local +z toward the house's facing. The parts above are authored
    # front-forward at +Y because that reads better, so turn the finished shop:
    # the exported GLB then faces glTF +Z like the kit's and mounts at the same
    # yaw as any house (`yawForDirection`).
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
        make_material("check_ground", palette_image(), "wall")
    )
    pin_uvs(ground, TEXELS["wall"][0])


def stage_neighbours() -> list[bpy.types.Object]:
    """An accepted house of the same kit, for scale and style.

    The ground is excluded from the returned list so it cannot widen the
    framing. Ground contact is deliberately not judged here either: a Blender
    render draws its own floor, so the seating check belongs in the running app
    (gate 5.1).
    """
    house = import_glb(SUBURBAN_KIT / "building-type-a.glb")
    # Blender's glTF importer can keep a node hierarchy, so translate only the
    # parentless roots: nudging every mesh double-applies the offset to any
    # child (which is how the truck's grill first ended up 3.6 units adrift).
    movers = [obj for obj in house if obj.parent is None] or house
    for obj in movers:
        obj.location.x += 2.3
        obj.location.y -= 0.3
    bpy.context.view_layer.update()
    print(f"neighbours  {len(house)} house meshes")
    return house


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

    # Facing check: the shopfront (+Y) with its awning must face the camera.
    aim_camera(centre, span, Vector((0.0, -2.2, 0.7)), OUT_DIR / "front.png")


def export_corner_shop(parts: list[bpy.types.Object]) -> None:
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
        # under the kit-namespaced name `city-kit-suburban/colormap`.
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
    parts = build_corner_shop()
    low, high = bounds(parts)
    size = high - low
    print(
        f"extents     {size.x:.3f} x {size.y:.3f} x {size.z:.3f}"
        f"  (min z = {low.z:.3f})"
    )
    render_checks(parts)
    export_corner_shop(parts)
    failures = verify_glb([obj.name for obj in parts])
    sys.exit(failures)


if __name__ == "__main__":
    main()
