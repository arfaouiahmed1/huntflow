"""HUNTFLOW Scrapling Sidecar — Job-URL extractor regression tests (SPA shells)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scrapling.parser import Adaptor  # noqa: E402
from server import (  # noqa: E402
    _JOB_DESCRIPTION_FALLBACK,
    _body_text,
    _extract_job,
)

URL = "https://jobs.micro1.ai/jobs/senior-backend-engineer-123"

REAL_COPY = (
    "We are hiring a Senior Backend Engineer to build reliable job search "
    "infrastructure with Python and FastAPI for candidates around the world."
)

NEXTJS_SHELL_HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <title>Senior Backend Engineer | Micro1</title>
  <meta property="og:site_name" content="Micro1" />
  <script src="/_next/static/chunks/app/page-abc123.js" defer></script>
  <script id="__NEXT_DATA__" type="application/json">{{"props": {{"pageProps": {{}}}}}}</script>
</head>
<body>
  <div id="app"><!-- SPA shell --></div>
  <script>self.__next_f.push([1, "React Flight JS bundle payload with escaped job markup"]);</script>
  <script>self.__next_f.push([2, "more flight data for the client router"]);</script>
  <style>.job-description{{color:#111;}}</style>
  <noscript>JavaScript is required to view this job posting.</noscript>
  <div class="job-description">
    <h1>Senior Backend Engineer</h1>
    <p>{REAL_COPY}</p>
  </div>
</body>
</html>
"""

FLIGHT_ONLY_HTML = """<!DOCTYPE html>
<html lang="en">
<head><title>Job | Micro1</title></head>
<body>
  <div id="app"></div>
  <script>self.__next_f.push([1, "React Flight JS bundle payload"]);</script>
  <script>self.__next_f.push([2, "more flight data"]);</script>
  <script id="__NEXT_DATA__" type="application/json">{"props": {}}</script>
</body>
</html>
"""

STUB_COPY_HTML = """<!DOCTYPE html>
<html lang="en">
<head><title>Job | Micro1</title></head>
<body><div class="job"><a href="/apply">Apply now</a></div></body>
</html>
"""


JSON_LD_ONLY_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<script type="application/ld+json">{"@type":"JobPosting","title":"Backend Engineer","hiringOrganization":{"name":"Micro1"},"description":"<p>Build reliable APIs with Python and FastAPI.</p><script>leak()<\/script><style>.hidden{display:none}</style>"}</script>
</head>
<body><div id="app"></div><script>self.__next_f.push([1, "shell"]);</script></body>
</html>
"""


def _page(html: str) -> Adaptor:
    return Adaptor(html, url=URL)


class NextjsShellTests(unittest.TestCase):
    def test_body_text_excludes_script_style_noscript(self) -> None:
        text = _body_text(_page(NEXTJS_SHELL_HTML))
        self.assertNotIn("__next_f", text)
        self.assertNotIn("__NEXT_DATA__", text)
        self.assertNotIn("_next/static", text)
        self.assertNotIn("color:#111", text)
        self.assertNotIn("JavaScript is required", text)
        self.assertIn(REAL_COPY, text)

    def test_extract_job_keeps_real_description_on_nextjs_shell(self) -> None:
        job = _extract_job(_page(NEXTJS_SHELL_HTML), URL)
        self.assertEqual(
            {"title", "company", "location", "salary", "description"},
            set(job),
        )
        self.assertIn(REAL_COPY, job["description"])
        self.assertNotIn("__next_f", job["description"])

    def test_extract_job_falls_back_on_flight_js_only(self) -> None:
        job = _extract_job(_page(FLIGHT_ONLY_HTML), URL)
        self.assertEqual(_JOB_DESCRIPTION_FALLBACK, job["description"])
        self.assertNotIn("__next_f", job["description"])

    def test_extract_job_uses_clean_jsonld_description_when_body_is_shell(self) -> None:
        job = _extract_job(_page(JSON_LD_ONLY_HTML), URL)
        self.assertEqual("Backend Engineer", job["title"])
        self.assertEqual("Micro1", job["company"])
        self.assertIn("Build reliable APIs with Python and FastAPI.", job["description"])
        self.assertNotIn("leak", job["description"])
        self.assertNotIn("display:none", job["description"])

    def test_extract_job_falls_back_on_stub_copy(self) -> None:
        job = _extract_job(_page(STUB_COPY_HTML), URL)
        self.assertEqual(_JOB_DESCRIPTION_FALLBACK, job["description"])



if __name__ == "__main__":
    unittest.main(verbosity=2)
