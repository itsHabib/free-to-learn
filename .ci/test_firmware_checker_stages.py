"""Regression controls for the learner-facing staged firmware checker."""
import contextlib
from html import unescape
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
COURSE = ROOT / 'courses/firmware-forensics'
spec = importlib.util.spec_from_file_location('firmware_check_core', COURSE / 'check_core.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class CheckerStages(unittest.TestCase):
    def run_stage(self, *args):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Path(directory) / '001-first'
            attempt.mkdir()
            output = io.StringIO()
            def completed(command, **kwargs):
                return subprocess.CompletedProcess(command, 0, stdout='', stderr='')
            with mock.patch.object(sys, 'argv', ['check_core.py', *args, str(attempt)]), \
                 mock.patch.object(checker.subprocess, 'run', side_effect=completed) as runner, \
                 contextlib.redirect_stdout(output):
                code = checker.main()
            payload = json.loads(output.getvalue())
            commands = [call.args[0][1:] for call in runner.call_args_list]
            for call in runner.call_args_list:
                self.assertEqual(call.kwargs['cwd'], COURSE / 'lab')
                self.assertTrue(Path(call.kwargs['env']['TMPDIR']).is_absolute())
            self.assertEqual(code, 0)
            self.assertEqual(payload['status'], 'pass')
            self.assertEqual([row['command'][1:] for row in payload['results']], commands)
            return commands

    def test_parser_stage_excludes_later_groups(self):
        commands = self.run_stage('--stage', 'parser')
        self.assertEqual([cmd[0] for cmd in commands], ['-m', 'checks/check_parser.py'])
        self.assertNotIn('check_submission.py', str(commands))
        self.assertNotIn('check_investigation.py', str(commands))

    def test_full_and_legacy_default_cover_all_groups(self):
        expected = ['-m', 'checks/check_parser.py', 'checks/check_submission.py', 'checks/check_investigation.py']
        self.assertEqual([cmd[0] for cmd in self.run_stage('--stage', 'full')], expected)
        self.assertEqual([cmd[0] for cmd in self.run_stage()], expected)

    def test_invalid_stage_is_rejected_before_any_check(self):
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.object(sys, 'argv', ['check_core.py', '--stage', 'analysis', directory]), \
                 mock.patch.object(checker.subprocess, 'run') as runner, \
                 contextlib.redirect_stderr(io.StringIO()) as error:
                with self.assertRaises(SystemExit) as stopped:
                    checker.main()
            self.assertEqual(stopped.exception.code, 2)
            self.assertIn('invalid choice', error.getvalue())
            runner.assert_not_called()

    def test_learner_commands_follow_stage_order(self):
        readme = (COURSE / 'README.md').read_text()
        self.assertIn('check_core.py --stage parser attempts/001-first', readme)
        self.assertIn('check_core.py --stage full attempts/005-analysis', readme)
        for unit in ('01', '02'):
            page = unescape((COURSE / 'reader' / unit / 'index.html').read_text())
            self.assertIn('check_core.py --stage parser', page)
            self.assertNotIn('check_core.py --stage full', page)
        later = unescape((COURSE / 'reader/05/index.html').read_text())
        self.assertIn('check_core.py --stage full', later)
        self.assertIn('Write and save your first investigation before running the full check.', later)


if __name__ == '__main__':
    unittest.main()
