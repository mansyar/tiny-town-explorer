"""PWA launcher icons — deterministic Blender recipe.

Renders the Kenney Car Kit firetruck the game already vendors
(`src/assets/kits/car-kit/firetruck.glb`) into the three PNGs `vite.config.ts`
declares in its web-app manifest. Nothing is authored here: the icon is the
shipped model, so the home-screen tile looks like the game.

Contract:

  * Square, opaque PNGs at exactly 192x192, 512x512 and a 512x512 maskable.
  * `icon-192`/`icon-512`: one vehicle, big and centred, no text, no thin
    details — it must read as a toy fire truck at 48 px.
  * `icon-maskable-512`: the vehicle is shrunk inside the maskable safe zone
    (the central 80% circle, radius 0.40 x the canvas) with flat
    `theme_color` padding out to every edge, so a launcher can crop hard
    without clipping the truck.
  * Background is `#87ceeb` exactly. Blender shader colours are linear, so
    `linear_for_srgb` inverts the sRGB transfer curve and `Standard` (not
    filmic) view transform round-trips it back to the same bytes.
  * Cycles CPU, orthographic, deterministic seed. Renders land in a temp dir
    first; only accepted files are copied over `public/icons/`.

Run headless:

    blender --background --python scripts/blender-icon.py

The axis convention is measured, not assumed (see
`conductor/tracks/v1-playtest-slice_20260921/kit-mount-measurements.md`):
glTF +Z is the nose and Blender's importer maps it onto Blender -Y, so the
firetruck's grill sits at Blender y = -1.575. The camera therefore sits on the
-y side to look at the nose.
"""

from __future__ import annotations

import math
import shutil
import struct
import tempfile
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
FIRETRUCK = ROOT / "src" / "assets" / "kits" / "car-kit" / "firetruck.glb"
ICON_DIR = ROOT / "public" / "icons"
# Check renders land in the OS temp directory rather than in the repo: they are
# working files, and the shipped icons are the three PNGs copied into
# `public/icons/`.
RENDER_DIR = Path(tempfile.gettempdir()) / "tiny-town-explorer-icons"

# #87ceeb, and its linear equivalent under the Standard view transform.
SKY_SRGB = (135, 206, 235)
# The camera looks at the nose (-Y) and the truck's right (+X), tilted down a
# little for the game's isometric feel.
VIEW_DIR = Vector((1.10, -1.50, 0.75))
# Fraction of the canvas the vehicle spans. Maskable keeps its widest point
# inside 0.40 x width (the safe zone radius); the others fill the frame.
PLAIN_FILL = 0.86
MASKABLE_RADIUS = 0.375          # comfortably inside the 0.40 safe radius
MASKABLE_NAME = "icon-maskable-512.png"


def linear_for_srgb(channel: int) -> float:
    """Invert the sRGB transfer curve so a Standard render returns the byte."""
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_firetruck() -> list[bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(FIRETRUCK))
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        raise SystemExit(f"FAIL  import: no meshes in {FIRETRUCK}")
    bpy.context.view_layer.update()
    print(f"imported    {len(meshes)} firetruck meshes")
    return meshes


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


def setup_world() -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("icon_world")
    world.use_nodes = True
    background = next(
        node for node in world.node_tree.nodes if node.type == "BACKGROUND"
    )
    background.inputs["Color"].default_value = (
        linear_for_srgb(SKY_SRGB[0]),
        linear_for_srgb(SKY_SRGB[1]),
        linear_for_srgb(SKY_SRGB[2]),
        1.0,
    )
    # Strength 1.0 keeps the flat backdrop byte-exact; it still washes the
    # model with soft sky ambient so no face crushes to black.
    background.inputs["Strength"].default_value = 1.0
    scene.world = world


def setup_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 256
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.max_bounces = 3
    scene.cycles.use_denoising = True
    scene.cycles.seed = 0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 100
    # Dither adds +-1 LSB noise to the flat sky, which both looks like grain
    # and bloats the PNG tenfold.
    scene.render.dither_intensity = 0.0
    scene.render.film_transparent = False
    # Standard, not filmic: the palette must survive to the PNG.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def setup_lights() -> None:
    scene = bpy.context.scene
    key_data = bpy.data.lights.new("icon_key", type="SUN")
    key_data.energy = 3.0
    key_data.angle = 0.30
    key = bpy.data.objects.new("icon_key", key_data)
    key.rotation_euler = (math.radians(52.0), math.radians(8.0), math.radians(-42.0))
    scene.collection.objects.link(key)

    # A soft fill from the opposite side stops the truck's shaded flank going
    # to a silhouette while keeping one clear key direction.
    fill_data = bpy.data.lights.new("icon_fill", type="SUN")
    fill_data.energy = 1.1
    fill_data.angle = 0.7
    fill = bpy.data.objects.new("icon_fill", fill_data)
    fill.rotation_euler = (math.radians(64.0), 0.0, math.radians(128.0))
    scene.collection.objects.link(fill)


def setup_camera(objects: list[bpy.types.Object]) -> tuple[bpy.types.Object, Vector]:
    scene = bpy.context.scene
    low, high = bounds(objects)
    centre = (low + high) / 2.0

    data = bpy.data.cameras.new("icon_camera")
    data.type = "ORTHO"
    data.ortho_scale = 1.0
    data.clip_start = 0.1
    data.clip_end = 200.0
    camera = bpy.data.objects.new("icon_camera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    location = centre + VIEW_DIR.normalized() * 30.0
    camera.location = location
    camera.rotation_euler = (location - centre).to_track_quat("Z", "Y").to_euler()
    bpy.context.view_layer.update()
    return camera, centre


def projected_extents(
    camera: bpy.types.Object, objects: list[bpy.types.Object]
) -> tuple[float, float]:
    """Worst per-axis and worst radial screen offset (canvas units).

    Measured at `ortho_scale = 1.0`, where a normalised offset equals the
    camera-space distance, so a frame can be solved directly from it.
    """
    scene = bpy.context.scene
    max_axis = 0.0
    max_radius = 0.0
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            co = world_to_camera_view(scene, camera, world)
            dx = co.x - 0.5
            dy = co.y - 0.5
            max_axis = max(max_axis, abs(dx), abs(dy))
            max_radius = max(max_radius, math.hypot(dx, dy))
    return max_axis, max_radius


def ortho_scale_for(
    camera: bpy.types.Object, objects: list[bpy.types.Object], maskable: bool
) -> float:
    # Measure at unity scale: a normalised offset then equals the camera-space
    # distance, so the frame solves directly and never compounds a prior pass.
    camera.data.ortho_scale = 1.0
    bpy.context.view_layer.update()
    max_axis, max_radius = projected_extents(camera, objects)
    if max_axis <= 0.0:
        raise SystemExit("FAIL  framing: model projects to nothing")
    if maskable:
        return max_radius / MASKABLE_RADIUS
    return max_axis / (PLAIN_FILL / 2.0)


def render(path: Path) -> None:
    scene = bpy.context.scene
    scene.render.filepath = str(path.with_suffix(""))
    scene.render.use_file_extension = True
    bpy.ops.render.render(write_still=True)
    if not path.exists():
        raise SystemExit(f"FAIL  render: {path} not written")
    print(f"rendered    {path} ({path.stat().st_size} bytes)")


def verify_png(path: Path, size: int) -> None:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"FAIL  {path.name}: not a PNG")
    width, height = struct.unpack_from(">II", data, 16)
    if (width, height) != (size, size):
        raise SystemExit(
            f"FAIL  {path.name}: {width}x{height}, expected {size}x{size}"
        )
    print(f"verified    {path.name} {width}x{height} ({len(data)} bytes)")


def main() -> None:
    reset_scene()
    setup_render()
    setup_world()
    setup_lights()
    import_firetruck()
    objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    bpy.context.view_layer.update()

    low, high = bounds(objects)
    size = high - low
    print(f"extents     {size.x:.3f} x {size.y:.3f} x {size.z:.3f}")
    print(f"ground      min z = {low.z:.3f}")

    camera, _centre = setup_camera(objects)
    scene = bpy.context.scene

    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        (MASKABLE_NAME, 512, True),
    ]

    rendered: list[tuple[Path, int]] = []
    for name, pixel_size, maskable in targets:
        scene.render.resolution_x = pixel_size
        scene.render.resolution_y = pixel_size
        scene.render.resolution_percentage = 100
        camera.data.ortho_scale = ortho_scale_for(camera, objects, maskable)
        print(
            f"framing     {name:<24} ortho_scale = {camera.data.ortho_scale:.3f}"
            f"{'  (maskable)' if maskable else ''}"
        )
        out = RENDER_DIR / name
        render(out)
        verify_png(out, pixel_size)
        rendered.append((out, pixel_size))

    for source, _size in rendered:
        shutil.copyfile(source, ICON_DIR / source.name)
        print(f"shipped     {ICON_DIR / source.name}")

    print(f"PASS  {len(rendered)} icons rendered, verified, and shipped")


if __name__ == "__main__":
    main()
