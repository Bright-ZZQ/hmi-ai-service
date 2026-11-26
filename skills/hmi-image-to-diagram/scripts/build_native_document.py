"""Compile a coordinate scene into an editable HMI document using only stdlib."""

import argparse
import base64
import copy
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid


SKILL_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROFILE = SKILL_ROOT / "assets" / "native-format-v1.json"
GEOMETRY_FIELDS = {
    "id", "pId", "type", "name", "layer", "zIndex", "localRect",
    "roatePos", "_originInfo", "width", "height", "scaleX", "scaleY",
    "polygon", "text", "tempId",
}
COMMON_NODE_FIELDS = {"key", "kind", "name", "layer", "z", "style", "attrs"}
KIND_FIELDS = {
    "rectangle": {"bounds"},
    "ellipse": {"bounds"},
    "polygon": {"points"},
    "pipeline": {"points"},
    "text": {"bounds", "text", "rotation_deg"},
    "button": {"bounds", "text", "pressed_text"},
    "group": {"children"},
    "instance": {"template", "at", "params"},
}
PARAMETER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


class SceneError(ValueError):
    """An invalid scene, profile, or incompatible base document."""


def read_json(path):
    with Path(path).open(encoding="utf-8-sig") as stream:
        return json.load(stream)


def number(value, context):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SceneError(f"{context} must be a finite number")
    if not math.isfinite(value):
        raise SceneError(f"{context} must be finite")
    return value


def vector(value, length, context):
    if not isinstance(value, list) or len(value) != length:
        raise SceneError(f"{context} must contain {length} numbers")
    return [number(item, context) for item in value]


def identifier(value, context):
    if not isinstance(value, str) or not value or "/" in value:
        raise SceneError(f"{context} must be a nonempty string without '/'")
    return value


def substitute(value, parameters):
    """Replace explicit string tokens without evaluating Python expressions."""
    if isinstance(value, str):
        def replace(match):
            key = match.group(1)
            if key not in parameters:
                raise SceneError(f"Missing template parameter: {key}")
            return str(parameters[key])
        return PARAMETER.sub(replace, value)
    if isinstance(value, list):
        return [substitute(item, parameters) for item in value]
    if isinstance(value, dict):
        return {key: substitute(item, parameters) for key, item in value.items()}
    return value


def bounds_of(points):
    xs, ys = zip(*points)
    left, top = min(xs), min(ys)
    return [left, top, max(xs) - left, max(ys) - top]


def corners(bounds):
    x, y, width, height = bounds
    return [
        {"x": x, "y": y}, {"x": x + width, "y": y},
        {"x": x + width, "y": y + height}, {"x": x, "y": y + height},
    ]


def rotate_corners(rect, center, degrees):
    radians = math.radians(degrees)
    cos_angle, sin_angle = math.cos(radians), math.sin(radians)
    cx, cy = center["x"], center["y"]
    rotated = []
    for point in rect:
        dx, dy = point["x"] - cx, point["y"] - cy
        rotated.append({
            "x": cx + dx * cos_angle - dy * sin_angle,
            "y": cy + dx * sin_angle + dy * cos_angle,
        })
    return rotated


class SceneCompiler:
    def __init__(self, base, scene, profile):
        self.output = copy.deepcopy(base)
        self.scene = scene
        self.profile = profile
        self.elements = []
        self.paths = set()
        self.template_stack = []
        if scene.get("schema") != "hmi-native-scene/v1":
            raise SceneError("Unsupported scene schema")
        if profile.get("schema") != "hmi-native-format/v1":
            raise SceneError("Unsupported format profile")
        self.namespace = identifier(scene.get("namespace"), "namespace")
        self.document = self.output.get("document")
        if not isinstance(self.document, dict):
            raise SceneError("Base must contain a document object")
        existing = self.document.get("elements", [])
        layers = self.document.get("layers", [])
        if not isinstance(existing, list) or not isinstance(layers, list):
            raise SceneError("Base elements and layers must be arrays")
        self.layer_ids = {str(layer["id"]) for layer in layers}
        if not self.layer_ids:
            raise SceneError("Base must define at least one layer")
        self.default_layer = scene.get("layer")
        if self.default_layer is None and len(self.layer_ids) == 1:
            self.default_layer = next(iter(self.layer_ids))
        self.existing_ids = {element["id"] for element in existing}
        if len(self.existing_ids) != len(existing):
            raise SceneError("Base contains duplicate element IDs")
        identity = self.document.get("code") or self.document.get("name", "")
        self.id_namespace = uuid.uuid5(
            uuid.NAMESPACE_URL, f"{identity}/{self.namespace}"
        )
        root_z = [element.get("zIndex", 0) for element in existing
                  if str(element.get("pId", "0")) == "0"]
        self.z_offset = max(root_z, default=-1) + 1

    def make_id(self, path):
        result = uuid.uuid5(self.id_namespace, path).hex
        if result in self.existing_ids:
            raise SceneError(
                "Generated ID already exists in base. Rebuild each batch from "
                "the original base snapshot, not a previous generated output."
            )
        return result

    def attributes(self, node, kind):
        attrs = copy.deepcopy(self.profile.get("common", {}))
        attrs.update(copy.deepcopy(self.profile["types"][kind].get("attrs", {})))
        style = node.get("style", [])
        names = [style] if isinstance(style, str) else style
        if not isinstance(names, list):
            raise SceneError("style must be a name or list of style names")
        for name in names:
            styles = self.scene.get("styles", {})
            if name not in styles:
                raise SceneError(f"Unknown style: {name}")
            attrs.update(copy.deepcopy(styles[name]))
        overrides = node.get("attrs", {})
        if not isinstance(overrides, dict):
            raise SceneError("attrs must be an object")
        attrs.update(copy.deepcopy(overrides))
        forbidden = GEOMETRY_FIELDS.intersection(attrs)
        if forbidden:
            raise SceneError(f"Use scene geometry fields for {sorted(forbidden)}")
        return attrs

    def emit(self, nodes, scope, offset, parent_id="0", inherited_layer=None):
        if not isinstance(nodes, list):
            raise SceneError(f"{scope}: objects/children must be an array")
        roots = []
        for index, node in enumerate(nodes):
            if not isinstance(node, dict):
                raise SceneError(f"{scope}: object must be a dictionary")
            key = identifier(node.get("key"), "object key")
            path = f"{scope}/{key}"
            if path in self.paths:
                raise SceneError(f"Duplicate object key: {path}")
            self.paths.add(path)
            kind = node.get("kind")
            if kind not in KIND_FIELDS:
                raise SceneError(f"{path}: unsupported kind {kind!r}")
            allowed = COMMON_NODE_FIELDS | KIND_FIELDS[kind]
            if kind == "instance":
                allowed -= {"style", "attrs"}
            invalid = set(node) - allowed
            if invalid:
                raise SceneError(f"{path}: fields do not apply to {kind}: {sorted(invalid)}")
            layer = str(node.get("layer", inherited_layer or self.default_layer))
            if layer not in self.layer_ids:
                raise SceneError(f"{path}: layer {layer!r} does not exist in base")
            z = number(node.get("z", index), f"{path}.z")
            if parent_id == "0":
                z += self.z_offset
            if kind == "instance":
                root = self.emit_instance(node, path, offset, parent_id, layer, z)
            else:
                root = self.emit_element(node, path, offset, parent_id, layer, z)
            roots.append(root)
        return roots

    def emit_instance(self, node, path, offset, parent_id, layer, z):
        name = node.get("template")
        templates = self.scene.get("templates", {})
        if name not in templates:
            raise SceneError(f"{path}: unknown template {name!r}")
        if name in self.template_stack:
            raise SceneError(f"{path}: recursive template {name!r}")
        template = substitute(templates[name], node.get("params", {}))
        if not isinstance(template, dict):
            raise SceneError("A template must describe one root object")
        template["key"] = "root"
        template["z"] = z - (self.z_offset if parent_id == "0" else 0)
        if "name" in node:
            template["name"] = node["name"]
        template["layer"] = layer
        at = vector(node.get("at", [0, 0]), 2, f"{path}.at")
        translated = [offset[0] + at[0], offset[1] + at[1]]
        self.template_stack.append(name)
        roots = self.emit([template], path, translated, parent_id, layer)
        self.template_stack.pop()
        return roots[0]

    def emit_element(self, node, path, offset, parent_id, layer, z):
        kind = node.get("kind")
        if kind not in self.profile.get("types", {}):
            raise SceneError(f"{path}: unsupported kind {kind!r}")
        element_id = self.make_id(path)
        attrs = self.attributes(node, kind)
        points = None
        if kind == "group":
            children = self.emit(
                node.get("children"), path, offset, element_id, layer
            )
            if not children:
                raise SceneError(f"{path}: a group needs children")
            points_for_bounds = [
                (p["x"], p["y"]) for child in children for p in child["localRect"]
            ]
            bounds = bounds_of(points_for_bounds)
        elif kind in ("pipeline", "polygon"):
            minimum = 2 if kind == "pipeline" else 3
            raw_points = node.get("points", [])
            if not isinstance(raw_points, list) or len(raw_points) < minimum:
                raise SceneError(f"{path}: at least {minimum} points required")
            points = []
            for raw_point in raw_points:
                x, y = vector(raw_point, 2, f"{path}.points")
                points.append([x + offset[0], y + offset[1]])
            bounds = bounds_of(points)
            if bounds[2] == 0 and bounds[3] == 0:
                raise SceneError(f"{path}: points must span a nonzero distance")
        else:
            x, y, width, height = vector(node.get("bounds"), 4, f"{path}.bounds")
            if width <= 0 or height <= 0:
                raise SceneError(f"{path}: width and height must be positive")
            bounds = [x + offset[0], y + offset[1], width, height]
        x, y, width, height = bounds
        element = dict(
            attrs,
            type=self.profile["types"][kind]["type"],
            id=element_id,
            name=node.get("name", node["key"]),
            pId=parent_id,
            layer=layer,
            zIndex=z,
            localRect=corners(bounds),
            roatePos={"x": x + width / 2, "y": y + height / 2},
            _originInfo={"width": width, "height": height},
            scaleX=1,
            scaleY=1,
        )
        if points is not None:
            element["polygon"] = [{"x": a, "y": b} for a, b in points]
        elif kind == "group":
            element["tempId"] = uuid.uuid5(self.id_namespace, path + "/temp").hex
        elif kind == "button":
            self.set_button(element, node, width, height, path)
        else:
            element.update(width=width, height=height)
        if kind == "text":
            text = node.get("text")
            if not isinstance(text, str):
                raise SceneError(f"{path}: text must be a string")
            if "rotation_deg" in node:
                degrees = number(node["rotation_deg"], f"{path}.rotation_deg")
                if "roateAngle" in attrs:
                    raise SceneError(f"{path}: rotation_deg cannot be combined with roateAngle")
                element["roateAngle"] = degrees
                element["localRect"] = rotate_corners(
                    element["localRect"], element["roatePos"], degrees
                )
            encoding = self.profile.get("text", {}).get("encoding")
            if encoding == "base64-utf8":
                element["text"] = base64.b64encode(text.encode("utf-8")).decode("ascii")
            elif encoding == "plain":
                element["text"] = text
            else:
                raise SceneError(f"Unsupported profile text encoding: {encoding!r}")
        self.elements.append(element)
        return element

    def set_button(self, element, node, width, height, path):
        button = self.profile.get("button", {})
        bw, bh = vector(button.get("size"), 2, "profile button.size")
        if bw <= 0 or bh <= 0:
            raise SceneError("Button base size must be positive")
        text = node.get("text")
        pressed = node.get("pressed_text", text)
        if not isinstance(text, str) or not isinstance(pressed, str):
            raise SceneError(f"{path}: button text must be a string")
        bindings = copy.deepcopy(element.get("dataBind", {}))
        bindings[button["text_field"]] = text
        bindings[button["pressed_text_field"]] = pressed
        element.update(
            width=bw, height=bh, clipWidth=bw, clipHeight=bh, clipX=0, clipY=0,
            scaleX=width / bw, scaleY=height / bh, dataBind=bindings,
        )

    def compile(self, until_batch=None):
        batches = self.scene.get("batches")
        if not isinstance(batches, list) or not batches:
            raise SceneError("Scene must contain batches")
        keys = [identifier(batch.get("key"), "batch key") for batch in batches]
        if len(set(keys)) != len(keys):
            raise SceneError("Batch keys must be unique")
        if until_batch is not None and until_batch not in keys:
            raise SceneError(f"Unknown batch: {until_batch}")
        for batch in batches:
            self.emit(batch.get("objects"), batch["key"], [0, 0])
            # Later batches draw above earlier batches at the root level.
            roots = [e["zIndex"] for e in self.elements if e["pId"] == "0"]
            self.z_offset = max([self.z_offset - 1, *roots]) + 1
            if batch["key"] == until_batch:
                break
        self.document.setdefault("elements", []).extend(self.elements)
        properties = self.document.get("pageProperty", {})
        if "latestIndex" in properties:
            current = number(properties["latestIndex"], "pageProperty.latestIndex")
            properties["latestIndex"] = current + len(self.elements)
        return self.output


def build_document(base, scene, profile=None, until_batch=None):
    """Return a fresh full document. Input objects are never mutated."""
    if profile is None:
        profile = read_json(DEFAULT_PROFILE)
    if not all(isinstance(value, dict) for value in (base, scene, profile)):
        raise SceneError("Base, scene, and profile must be JSON objects")
    output = SceneCompiler(base, scene, profile).compile(until_batch)
    json.dumps(output, allow_nan=False)
    return output


def write_json_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False,
            prefix=path.name + ".", suffix=".tmp",
        ) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, type=Path,
                        help="Original target document snapshot")
    parser.add_argument("--scene", required=True, type=Path,
                        help="Coordinate data, styles, templates, and batches")
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE,
                        help="Native format profile for this editor version")
    parser.add_argument("--until-batch", help="Generate a cumulative batch prefix")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        sources = (args.base, args.scene, args.profile)
        if args.output.resolve() in [path.resolve() for path in sources]:
            raise SceneError("Output must differ from all input files")
        base, scene, profile = [read_json(path) for path in sources]
        output = build_document(base, scene, profile, args.until_batch)
        write_json_atomic(args.output, output)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "output": str(args.output.resolve()),
        "base_elements": len(base["document"].get("elements", [])),
        "total_elements": len(output["document"]["elements"]),
        "generated_elements": (
            len(output["document"]["elements"])
            - len(base["document"].get("elements", []))
        ),
        "until_batch": args.until_batch,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
