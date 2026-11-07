import unittest, tempfile, pathlib, json, hashlib, zipfile, os, stat
from unittest.mock import patch
from verify_courses import verify
class PipelineTests(unittest.TestCase):
 def fixture(self, files, **overrides):
  root=pathlib.Path(tempfile.mkdtemp(prefix='pipeline-fixture-',dir=os.environ.get('FTL_TEST_FIXTURES')));p=root/'course.zip'
  with zipfile.ZipFile(p,'w') as z:
   for name,data in files.items():z.writestr(name,data)
  c={'id':'fixture','archive':'course.zip','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'commands':[],**overrides};out=root/'out';out.mkdir();return verify(c,root,out)
 def test_partial_never_complete(self):
  r=self.fixture({'README.md':'hello'});self.assertEqual(r['status'],'partial');self.assertEqual(r['learner_completion'],'not_run')
 def test_hash_mismatch(self):self.assertEqual(self.fixture({'README.md':'hello'},sha256='bad')['status'],'blocked')
 def test_path_traversal(self):self.assertEqual(self.fixture({'../escaped':'bad'})['status'],'blocked')
 def test_invalid_python(self):self.assertEqual(self.fixture({'bad.py':'def ('})['status'],'fail')
 def test_expected_failure_needs_pattern(self):
  self.assertEqual(self.fixture({},commands=[{'stage':'starter','argv':['python3','-c','raise SystemExit(1)'],'exit':1}])['status'],'blocked')
 def test_wrong_failure_rejected(self):
  r=self.fixture({},commands=[{'stage':'starter','argv':['python3','-c','print("crash");raise SystemExit(1)'],'exit':1,'match':'TODO'}]);self.assertEqual(r['status'],'fail')
 def test_documented_starter_failure(self):
  r=self.fixture({},commands=[{'stage':'starter','argv':['python3','-c','print("TODO module 1");raise SystemExit(1)'],'exit':1,'match':'TODO module 1'}]);self.assertEqual(r['status'],'partial')

 def test_empty_commands_cannot_be_coverage_complete(self):
  self.assertEqual(self.fixture({'README.md':'hello'},coverage_complete=True)['status'],'partial')
 def test_executable_mode_preserved(self):
  root=pathlib.Path(tempfile.mkdtemp(prefix='pipeline-mode-',dir=os.environ.get('FTL_TEST_FIXTURES')));archive=root/'course.zip'
  with zipfile.ZipFile(archive,'w') as z:
   i=zipfile.ZipInfo('native-target');i.external_attr=(stat.S_IFREG|0o755)<<16;z.writestr(i,b'fixture bytes, never executed')
  out=root/'out';out.mkdir();c={'id':'mode','archive':'course.zip','sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'commands':[]}
  r=verify(c,root,out);self.assertEqual(r['status'],'partial');self.assertEqual((out/'mode/native-target').stat().st_mode&0o777,0o755)
 def test_retained_evidence_rejects_changed_archive(self):
  root=pathlib.Path(tempfile.mkdtemp(prefix='pipeline-evidence-',dir=os.environ.get('FTL_TEST_FIXTURES')));archive=root/'course.zip'
  with zipfile.ZipFile(archive,'w') as z:z.writestr('README.md','new source')
  out=root/'out';out.mkdir();c={'id':'proof','archive':'course.zip','sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'retained_evidence':{'source_repository':str(root),'source_commit':'a'*40,'source_archive_blob':'.packages/proof.zip'}}
  with patch('verify_courses.subprocess.check_output',return_value=b'older qualified archive'):
   r=verify(c,root,out,True)
  self.assertEqual(r['status'],'blocked');self.assertIn('differs from qualified Git object',r['error'])
 def test_retained_evidence_rejects_changed_receipt(self):
  root=pathlib.Path(tempfile.mkdtemp(prefix='pipeline-receipt-',dir=os.environ.get('FTL_TEST_FIXTURES')));archive=root/'course.zip'
  with zipfile.ZipFile(archive,'w') as z:z.writestr('README.md','same source')
  receipt=root/'receipt.json';receipt.write_text('{}');out=root/'out';out.mkdir()
  c={'id':'proof','archive':'course.zip','sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'retained_evidence':{'source_repository':str(root),'source_commit':'a'*40,'source_archive_blob':'.packages/proof.zip','contract':{'path':str(receipt),'sha256':'0'*64}}}
  with patch('verify_courses.subprocess.check_output',return_value=archive.read_bytes()):
   r=verify(c,root,out,True)
  self.assertEqual(r['status'],'blocked');self.assertIn('evidence hash mismatch',r['error'])

if __name__=='__main__':unittest.main()
