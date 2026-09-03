"""HUNTFLOW Scrapling Sidecar — Stealth, Anti-Fingerprinting & Cookie Jar Tests."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stealth import STEALTH_INJECTION_SCRIPT, get_stealth_chromium_args
from cookies import CookieJarManager


class StealthScriptTests(unittest.TestCase):
    def test_stealth_script_masks_webdriver(self) -> None:
        self.assertIn("Navigator.prototype, 'webdriver'", STEALTH_INJECTION_SCRIPT)
        self.assertIn("get: () => undefined", STEALTH_INJECTION_SCRIPT)

    def test_stealth_script_emulates_chrome_runtime(self) -> None:
        self.assertIn("window.chrome.runtime", STEALTH_INJECTION_SCRIPT)
        self.assertIn("window.chrome.loadTimes", STEALTH_INJECTION_SCRIPT)
        self.assertIn("window.chrome.csi", STEALTH_INJECTION_SCRIPT)

    def test_stealth_script_spoofs_webgl_renderer(self) -> None:
        self.assertIn("Google Inc. (NVIDIA)", STEALTH_INJECTION_SCRIPT)
        self.assertIn("ANGLE (NVIDIA, NVIDIA GeForce RTX", STEALTH_INJECTION_SCRIPT)

    def test_stealth_chromium_args(self) -> None:
        args = get_stealth_chromium_args()
        self.assertIn("--disable-blink-features=AutomationControlled", args)
        self.assertIn("--hide-scrollbars", args)


class CookieJarTests(unittest.TestCase):
    def test_cookie_jar_persistence_and_consent_seeding(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            jar_path = Path(tmp_dir) / "test_cookies.json"
            mgr = CookieJarManager(jar_path)

            # Add cookies
            mgr.add_cookies([
                {"name": "session_id", "value": "xyz123", "domain": ".greenhouse.io", "path": "/"},
                {"name": "cf_clearance", "value": "token_abc", "domain": "jobs.lever.co", "path": "/"},
            ])

            # Verify saved
            cookies = mgr.get_cookies_for_domain("boards.greenhouse.io")
            self.assertEqual(len(cookies), 1)
            self.assertEqual(cookies[0]["name"], "session_id")

            # Reload from disk
            reloaded = CookieJarManager(jar_path)
            lever_cookies = reloaded.get_cookies_for_domain("jobs.lever.co")
            self.assertEqual(len(lever_cookies), 1)
            self.assertEqual(lever_cookies[0]["value"], "token_abc")


if __name__ == "__main__":
    unittest.main(verbosity=2)
