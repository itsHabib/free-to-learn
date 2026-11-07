"""Tests only the provided scaffold; use check_parser.py for your implementation."""
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fwcourse.container import Component,Container,FormatError,extract
from fwcourse.evidence import json_bytes,load_json


class ScaffoldTests(unittest.TestCase):
    def test_strict_json_numbers_keys_encoding(self):
        for blob in [b'{"x":1e999}',b'{"x":-1e999}',b'{"x":NaN}',b'{"x":1,"x":2}',b'\xff']:
            with self.subTest(blob=blob),self.assertRaises(FormatError):json_bytes(blob)
        self.assertEqual(json_bytes(b'{"x":1.25}'),{'x':1.25})

    def test_fixture_index(self):
        for row in load_json(ROOT/'fixtures/fixture-index.json')['files']:
            data=(ROOT/'fixtures'/row['path']).read_bytes()
            self.assertEqual((len(data),sha256(data).hexdigest()),(row['bytes'],row['sha256']))

    def test_extraction_defense_even_if_learner_parser_is_wrong(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ['../escape','/absolute','', 'with/slash']:
                c=Component(name,'data',1,100,b'x',sha256(b'x').hexdigest())
                with self.subTest(name=name),self.assertRaises(FormatError):extract(Container(b'',(c,)),root/'out')
                self.assertFalse((root/'out').exists())
            c=Component('safe','data',1,100,b'x',sha256(b'x').hexdigest())
            self.assertEqual(extract(Container(b'',(c,)),root/'out'),['safe.bin'])
            with self.assertRaises(FileExistsError):extract(Container(b'',(c,)),root/'out')

    def test_attempt_restore_preserves_both_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ['001-first','002-restored']:
                result=subprocess.run([sys.executable,str(ROOT/'tools/attempt.py'),name,'--root',str(root)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual((root/'001-first/parser.py').read_bytes(),(root/'002-restored/parser.py').read_bytes())
            self.assertEqual((root/'001-first/analysis.py').read_bytes(),(root/'002-restored/analysis.py').read_bytes())
            first=(root/'001-first/parser.py');first.write_text('# original work retained\n')
            result=subprocess.run([sys.executable,str(ROOT/'tools/attempt.py'),'001-first','--root',str(root)],capture_output=True,text=True)
            self.assertEqual(result.returncode,2)
            self.assertEqual(first.read_text(),'# original work retained\n')

    def test_cli_cannot_silently_use_a_supplied_parser(self):
        result=subprocess.run([sys.executable,str(ROOT/'fwlab.py'),'inspect',str(ROOT/'fixtures/release-1.efw')],capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertIn('--parser',result.stderr)
        result=subprocess.run([sys.executable,str(ROOT/'fwlab.py'),'inspect',str(ROOT/'fixtures/release-1.efw'),'--parser',str(ROOT/'starter/parser.py')],capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertIn('NotImplementedError',result.stderr)


if __name__=='__main__':unittest.main()
