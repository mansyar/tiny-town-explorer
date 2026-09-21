"""Recon: slice the Toy Car Kit's road pieces to the numbers a new piece must match.

Run headless:

    blender --background --python scripts/blender-analyze-kit.py

Prints a JSON measurement table (and only that, on the final line) describing,
for each reference piece:

  * extents           -- where it sits in kit units, so a new piece can be
                         seated on the same ground plane
  * levels            -- distinct heights, which reveal the road surface
                         thickness and any kerb/chamfer tiers
  * end_profile       -- cross-sections approaching the run axis' ends: this is
                         the mate contract a neighbouring straight must meet
                         flush, including the connector tongue
  * top_faces         -- per-face UV centroid and sampled palette color for the
                         upward faces, i.e. the asphalt and marking texels a new
                         piece must reuse to be pixel-identical in style

This is the skill's Phase 1 ("measure the mount"; gate 1.1 wants a written
table before any geometry is authored). It lives in the repo so the numbers are
reproducible rather than remembered.

Known limits: colors are sampled with the image's own colorspace (sanity only --
the texel coordinates are the contract, since the new piece reuses the same
palette image); overlapping kit pieces are measured per piece, so a corner's
module is its own extent, not the pitch of an assembled grid.
"""

import json
import os
import sys

import bpy

KIT_DIR = os.path.join("src", "assets", "kits", "city-kit-roads")
PIECES = [
    "road-straight",
    "road-intersection",
    "road-crossroad",
    "road-curve",
    "tile-low",
    "tile-high",
    "electricity-pole",
]
# Coarsening used when clustering vertices into modelling planes.
PLANE_EPSILON = 0.01
# A face counts as "up" above this normal z, "down" below the negative one.
TOP_NORMAL_MIN_Z = 0.9
BOTTOM_NORMAL_MAX_Z = -0.9


def reset_scene():
    """Empty the file so each piece is measured in isolation."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_piece(name):
    """Imports one kit GLB and returns its mesh objects."""
    path = os.path.join(KIT_DIR, f"{name}.glb")
    if not os.path.exists(path):
        raise SystemExit(f"missing kit piece: {path}")
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def world_triangles(objects):
    """All mesh triangles as world-space vertex tuples."""
    triangles = []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        matrix = obj.matrix_world
        for triangle in mesh.loop_triangles:
            corners = [matrix @ mesh.vertices[index].co for index in triangle.vertices]
            triangles.append((obj, triangle, corners))
    return triangles


def extents(points):
    """Axis-aligned bounds of a point cloud."""
    return {
        axis: {
            "min": round(min(point[i] for point in points), 4),
            "max": round(max(point[i] for point in points), 4),
        }
        for i, axis in enumerate("xyz")
    }


def distinct_levels(points):
    """Distinct heights with vertex counts, coarsened to reveal flat tiers."""
    counts = {}
    for point in points:
        key = round(point[2] / PLANE_EPSILON) * PLANE_EPSILON
        counts[key] = counts.get(key, 0) + 1
    return [
        {"z": round(level, 4), "vertices": count}
        for level, count in sorted(counts.items(), reverse=True)
    ]


def run_planes(triangles):
    """Cross-sections at each distinct plane along the longest horizontal axis.

    A box-modelled kit piece is a stack of planes, so clustering vertices on the
    run axis reveals the whole mate contract at once: how far a connector tongue
    protrudes, where the road body actually starts, and the cross profile at
    each step.
    """
    points = [corner for _obj, _tri, corners in triangles for corner in corners]
    bounds = extents(points)
    sizes = {axis: bounds[axis]["max"] - bounds[axis]["min"] for axis in "xy"}
    run_axis = "y" if sizes["y"] >= sizes["x"] else "x"
    cross_axis = "x" if run_axis == "y" else "y"
    run_index = "xyz".index(run_axis)
    cross_index = "xyz".index(cross_axis)

    planes = {}
    for point in points:
        key = round(point[run_index] / PLANE_EPSILON) * PLANE_EPSILON
        planes.setdefault(key, []).append(point)
    return run_axis, [
        {
            "at": round(position, 4),
            "inset_from_low": round(position - bounds[run_axis]["min"], 4),
            "inset_from_high": round(bounds[run_axis]["max"] - position, 4),
            "vertices": len(slab),
            "cross": [round(min(p[cross_index] for p in slab), 4), round(max(p[cross_index] for p in slab), 4)],
            "z": [round(min(p[2] for p in slab), 4), round(max(p[2] for p in slab), 4)],
        }
        for position, slab in sorted(planes.items())
        if len(slab) >= 3
    ]


def face_orientation(normal_z) -> str:
    if normal_z >= TOP_NORMAL_MIN_Z:
        return "up"
    if normal_z <= BOTTOM_NORMAL_MAX_Z:
        return "down"
    return "side"


def palette_samples(objects):
    """Distinct palette texels per face orientation, with total area.

    Grouped rather than listed per face: the authoring question is "which flat
    colors does the family use, and where does each one face", and a per-face
    dump of hundreds of triangles answers nothing.
    """
    groups = {"up": {}, "side": {}, "down": {}}
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv_layer = mesh.uv_layers.active
        if uv_layer is None:
            continue
        image = material_image(obj)
        for triangle in mesh.loop_triangles:
            normal = (obj.matrix_world.to_3x3() @ triangle.normal).normalized()
            uv = [uv_layer.data[index].uv for index in triangle.loops]
            u = sum(coord[0] for coord in uv) / len(uv)
            v = sum(coord[1] for coord in uv) / len(uv)
            texel = texel_of(image, u, v)
            entry = groups[face_orientation(normal.z)].setdefault(
                tuple(texel),
                {
                    "texel": texel,
                    "uv": [round(u, 4), round(v, 4)],
                    "color": color_of(image, u, v),
                    "area": 0.0,
                    # Where the swatch actually sits on the piece: areas alone
                    # cannot tell a kerb strip from an end cap.
                    "bounds": [None, None, None, None],
                },
            )
            entry["area"] = round(entry["area"] + triangle.area, 4)
            corners = [obj.matrix_world @ mesh.vertices[index].co for index in triangle.vertices]
            for corner in corners:
                bounds = entry["bounds"]
                bounds[0] = corner.x if bounds[0] is None else min(bounds[0], corner.x)
                bounds[1] = corner.y if bounds[1] is None else min(bounds[1], corner.y)
                bounds[2] = corner.x if bounds[2] is None else max(bounds[2], corner.x)
                bounds[3] = corner.y if bounds[3] is None else max(bounds[3], corner.y)
            entry["bounds"] = [round(value, 3) for value in entry["bounds"]]
    return {
        orientation: sorted(entries.values(), key=lambda entry: -entry["area"])
        for orientation, entries in groups.items()
    }


def material_image(obj):
    """The first image texture referenced by an object's materials."""
    for slot in obj.material_slots:
        material = slot.material
        if material is None or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None:
                return node.image
    return None


def texel_of(image, u, v):
    if image is None:
        return None
    width, height = image.size
    return [int(u % 1.0 * width), int(v % 1.0 * height)]


def color_of(image, u, v):
    """RGBA at a UV, read from the image's pixel buffer (bottom-left origin)."""
    if image is None or image.size[0] == 0:
        return None
    width, height = image.size
    x = min(width - 1, max(0, int(u % 1.0 * width)))
    y = min(height - 1, max(0, int(v % 1.0 * height)))
    pixels = image.pixels[:]
    offset = (y * width + x) * 4
    return [round(channel, 3) for channel in pixels[offset : offset + 4]]


def describe_piece(name):
    """The full measurement record for one kit piece."""
    objects = import_piece(name)
    triangles = world_triangles(objects)
    points = [corner for _obj, _tri, corners in triangles for corner in corners]
    run_axis, profiles = run_planes(triangles)
    image = material_image(objects[0]) if objects else None
    return {
        "piece": name,
        "objects": [obj.name for obj in objects],
        "triangles": len(triangles),
        "extents": extents(points),
        "levels": distinct_levels(points),
        "run_axis": run_axis,
        "run_planes": profiles,
        "palette_image": None
        if image is None
        else {"name": image.name, "size": list(image.size)},
        "top_faces": palette_samples(objects),
    }


def main():
    report = {"kit_dir": KIT_DIR, "pieces": [describe_piece(name) for name in PIECES]}
    reset_scene()
    sys.stdout.write("\nRECON_JSON " + json.dumps(report) + "\n")


if __name__ == "__main__":
    main()
