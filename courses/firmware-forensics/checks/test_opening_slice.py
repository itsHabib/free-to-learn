"""Regression for the exact code displayed in the opening parser lesson.

Separate from lab/checks: preserves the historical five scaffold checks.
Run: python3 -m unittest discover -s checks -v (from the course root).
"""
import contextlib
from html.parser import HTMLParser
import importlib.util
import io
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("slice_probe", ROOT / "examples/slice_probe.py")
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class DisplayedCode(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.code = ""

    def handle_starttag(self, tag, attrs):
        if tag == "pre" and dict(attrs).get("data-example") == "slice-probe":
            self.inside = True

    def handle_endtag(self, tag):
        if tag == "pre":
            self.inside = False

    def handle_data(self, data):
        if self.inside:
            self.code += data


class OpeningSliceTests(unittest.TestCase):
    def test_reader_and_markdown_execute_the_shown_starter(self):
        source = (ROOT / "examples/slice_probe.py").read_text()
        taught = source.split("# BEGIN TAUGHT SLICE\n")[1].split("# END TAUGHT SLICE")[0].strip()
        page = DisplayedCode()
        page.feed((ROOT / "reader/01/index.html").read_text())
        lesson = (ROOT / "lab/lessons/00-build-parser-and-map.md").read_text()
        markdown = lesson.split("```python\n")[1].split("```")[0].strip()
        for text in (page.code.strip(), markdown):
            with self.subTest(surface=text[:30]):
                self.assertEqual(text, taught)
                namespace = {}
                exec(compile(text, "<displayed slice probe>", "exec"), namespace)
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    status = PROBE.check(namespace["read_payload"])
                self.assertEqual(status, 1)
                self.assertIn("2/8 range cases passed", output.getvalue())
                self.assertIn("FAIL past-end: expected ValueError; got b'abcdef'", output.getvalue())

    def test_checker_rejects_always_raise_and_wrong_error_type(self):
        def always_raise(*args):
            raise ValueError("reject everything")
        def wrong_error(*args):
            raise IndexError("wrong contract")
        for candidate in (always_raise, wrong_error):
            with self.subTest(candidate=candidate.__name__), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(PROBE.check(candidate), 1)

    def test_starter_demonstrates_silent_truncation_and_table_leak(self):
        self.assertEqual(PROBE.read_payload(PROBE.DATA, 8, 8, 7), b"abcdef")
        self.assertEqual(PROBE.read_payload(PROBE.DATA, 8, 7, 2), b"_a")
        self.assertEqual(PROBE.read_payload(PROBE.DATA, 8, 8, 0), b"")


if __name__ == "__main__":
    unittest.main()
