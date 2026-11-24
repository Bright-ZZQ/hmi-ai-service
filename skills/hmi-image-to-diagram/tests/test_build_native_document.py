"""Offline regression checks against the original total-flow native snapshots."""

import base64
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SKILL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL_ROOT / "scripts"))
from build_native_document import SceneError, build_document, read_json


def fingerprint(elements):
    """Normalize random IDs and floating point noise from the original builder."""
    ids = {element["id"]: f"element-{index}"
           for index, element in enumerate(elements)}

    def normalize(value):
        if isinstance(value, dict):
            return {key: normalize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return round(float(value), 6)
        return value

    normalized = []
    for original in elements:
        element = copy.deepcopy(original)
        element["id"] = ids[element["id"]]
        if element["pId"] != "0":
            element["pId"] = ids[element["pId"]]
        element.pop("tempId", None)
        normalized.append(normalize(element))
    encoded = json.dumps(
        normalized, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class NativeDocumentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        example = SKILL_ROOT / "examples" / "total-flow"
        cls.example = example
        cls.base = read_json(example / "base.json")
        cls.scene = read_json(example / "scene.json")
        cls.expected = read_json(example / "expected.json")["batches"]

    def test_original_snapshot_geometry_styles_and_hierarchy(self):
        earlier_ids = set()
        for batch, expected in self.expected.items():
            with self.subTest(batch=batch):
                output = build_document(self.base, self.scene, until_batch=batch)
                elements = output["document"]["elements"]
                self.assertEqual(len(elements), expected["elements"])
                self.assertEqual(dict(Counter(e["type"] for e in elements)),
                                 expected["types"])
                self.assertEqual(fingerprint(elements), expected["sha256"])
                ids = {element["id"] for element in elements}
                self.assertEqual(len(ids), len(elements))
                self.assertTrue(earlier_ids <= ids)
                self.assertTrue(all(e["pId"] == "0" or e["pId"] in ids
                                    for e in elements))
                earlier_ids = ids

    def test_text_button_states_and_native_types(self):
        elements = build_document(self.base, self.scene)["document"]["elements"]
        buttons = [e for e in elements if e.get("hmi.type") == "Button"]
        self.assertTrue(buttons)
        for button in buttons:
            self.assertEqual(button["type"], "NodeSymbol")
            bindings = button["dataBind"]
            self.assertEqual(bindings["button.text"],
                             bindings["button.text.pressed"])
            self.assertFalse(button["ds_key"])
        for element in elements:
            if element["type"] == "Text":
                decoded = base64.b64decode(element["text"], validate=True).decode()
                self.assertTrue(decoded)
        self.assertTrue(any(e.get("bgDash") for e in elements))
        self.assertTrue(any(e.get("fillColor", {}).get("gradientMode")
                            for e in elements))

    def test_retarget_preserves_base_and_input_objects(self):
        base = copy.deepcopy(self.base)
        base["document"].update(code="another-drawing", name="另一张图纸")
        base["document"]["pageProperty"].update(
            width=2400, pageWidth=2400, height=1400, pageHeight=1400
        )
        base["project"] = {"code": "another-project", "path": "user-selected"}
        base["document"]["pageScript"] = [{"content": "existing-script"}]
        base["document"]["layers"].append({"id": "existing-layer", "visible": True})
        existing = {
            "id": "existing-object", "type": "Text", "pId": "0", "zIndex": 100,
            "layer": "existing-layer", "custom": {"binding": ["keep-this"]},
        }
        base["document"]["elements"].append(existing)
        before = copy.deepcopy(base)
        scene_before = copy.deepcopy(self.scene)
        output = build_document(base, self.scene)
        self.assertEqual(base, before)
        self.assertEqual(self.scene, scene_before)
        self.assertEqual(output["document"]["elements"][0], existing)
        self.assertEqual(output["project"], base["project"])
        for field in ("code", "name", "pageScript", "layers"):
            self.assertEqual(output["document"][field], base["document"][field])
        properties = output["document"]["pageProperty"]
        expected = copy.deepcopy(base["document"]["pageProperty"])
        expected["latestIndex"] += len(output["document"]["elements"]) - 1
        self.assertEqual(properties, expected)
        original_ids = {e["id"] for e in
                        build_document(self.base, self.scene)["document"]["elements"]}
        self.assertTrue(original_ids.isdisjoint(
            {e["id"] for e in output["document"]["elements"]}
        ))

    def test_version_profile_and_distinct_pressed_text(self):
        profile = read_json(SKILL_ROOT / "assets" / "native-format-v1.json")
        profile["button"]["size"] = [80, 40]
        profile["types"]["button"]["attrs"]["src"] = "symbols/custom/button.json"
        profile["text"]["encoding"] = "plain"
        scene = {
            "schema": "hmi-native-scene/v1", "namespace": "button-profile-test",
            "batches": [{"key": "buttons", "objects": [
                {"key": "toggle", "kind": "button", "bounds": [30, 70, 160, 20],
                 "text": "抬起", "pressed_text": "按下"},
                {"key": "label", "kind": "text", "bounds": [200, 70, 60, 20],
                 "text": "温度"},
            ]}],
        }
        button, label = build_document(self.base, scene, profile)["document"]["elements"]
        self.assertEqual(button["src"], "symbols/custom/button.json")
        self.assertEqual((button["width"], button["height"]), (80, 40))
        self.assertEqual((button["scaleX"], button["scaleY"]), (2, 0.5))
        self.assertEqual(button["dataBind"]["button.text"], "抬起")
        self.assertEqual(button["dataBind"]["button.text.pressed"], "按下")
        self.assertEqual(label["text"], "温度")

    def test_templates_use_input_coordinates_and_remain_editable(self):
        scene = {
            "schema": "hmi-native-scene/v1", "namespace": "translation-test",
            "templates": {
                "readout": {
                    "key": "root", "kind": "group", "name": "${tag}",
                    "children": [
                        {"key": "text", "kind": "text", "bounds": [2, 3, 40, 12],
                         "text": "${tag}"},
                        {"key": "pipe", "kind": "pipeline",
                         "points": [[0, 0], [0, 20]]},
                    ],
                }
            },
            "batches": [{"key": "first", "objects": [
                {"key": "a", "kind": "instance", "template": "readout",
                 "at": [217, 389], "params": {"tag": "新位号"}},
            ]}],
        }
        elements = build_document(self.base, scene)["document"]["elements"]
        text, pipe, group = elements
        self.assertEqual(text["localRect"][0], {"x": 219, "y": 392})
        self.assertEqual(base64.b64decode(text["text"]).decode(), "新位号")
        self.assertEqual(pipe["polygon"], [{"x": 217, "y": 389},
                                          {"x": 217, "y": 409}])
        self.assertEqual(group["localRect"][0], {"x": 217, "y": 389})
        self.assertEqual(text["pId"], group["id"])

    def test_rejects_duplicate_keys_reused_output_and_invalid_geometry(self):
        output = build_document(self.base, self.scene, until_batch="pipes")
        with self.assertRaisesRegex(SceneError, "original base snapshot"):
            build_document(output, self.scene)
        for name, node in [
            ("negative width", {"key": "a", "kind": "rectangle",
                                "bounds": [0, 0, -1, 5]}),
            ("nonfinite coordinate", {"key": "a", "kind": "text",
                                      "bounds": [float("nan"), 0, 10, 10],
                                      "text": "x"}),
            ("unknown style", {"key": "a", "kind": "rectangle",
                               "bounds": [0, 0, 10, 10], "style": "missing"}),
            ("missing template", {"key": "a", "kind": "instance",
                                  "template": "missing"}),
        ]:
            with self.subTest(name=name):
                scene = {
                    "schema": "hmi-native-scene/v1", "namespace": "invalid",
                    "batches": [{"key": "batch", "objects": [node]}],
                }
                with self.assertRaises(SceneError):
                    build_document(self.base, scene)
        duplicate = copy.deepcopy(self.scene)
        objects = duplicate["batches"][0]["objects"]
        objects.append(copy.deepcopy(objects[0]))
        with self.assertRaisesRegex(SceneError, "Duplicate object key"):
            build_document(self.base, duplicate)
        with self.assertRaisesRegex(SceneError, "Unknown batch"):
            build_document(self.base, self.scene, until_batch="missing")
        recursive = {
            "schema": "hmi-native-scene/v1", "namespace": "recursive",
            "templates": {
                "loop": {"key": "self", "kind": "instance", "template": "loop"}
            },
            "batches": [{"key": "batch", "objects": [
                {"key": "start", "kind": "instance", "template": "loop"}
            ]}],
        }
        with self.assertRaisesRegex(SceneError, "recursive template"):
            build_document(self.base, recursive)

    def test_cli_roundtrip_determinism_and_failed_write(self):
        with tempfile.TemporaryDirectory(prefix="hmi-验证-") as temporary:
            output = Path(temporary) / "生成图纸.json"
            command = [
                sys.executable, "-X", "utf8",
                str(SKILL_ROOT / "scripts" / "build_native_document.py"),
                "--base", str(self.example / "base.json"),
                "--scene", str(self.example / "scene.json"),
                "--output", str(output),
            ]
            result = subprocess.run(command, capture_output=True, text=True,
                                    encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stderr)
            original_bytes = output.read_bytes()
            document = read_json(output)
            final_batch = list(self.expected)[-1]
            self.assertEqual(fingerprint(document["document"]["elements"]),
                             self.expected[final_batch]["sha256"])
            result = subprocess.run(command, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(output.read_bytes(), original_bytes)
            result = subprocess.run(command + ["--until-batch", "missing"],
                                    capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_bytes(), original_bytes)
            self.assertFalse(list(Path(temporary).glob("*.tmp")))


if __name__ == "__main__":
    unittest.main()
