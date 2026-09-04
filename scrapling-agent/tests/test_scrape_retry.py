"""HUNTFLOW Scrapling Sidecar — static → dynamic retry regression tests.

Locks the quality-gated browser retry: when the static fetch yields copy that
fails the JS-bundle quality gate (SPA shell / React Flight payload), /scrape
must attempt the real-browser path before accepting the neutral fallback —
and must keep the static result when that retry fails.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scrapling.parser import Adaptor  # noqa: E402
from server import (  # noqa: E402
    ScrapeRequest,
    _body_text,
    _is_usable_description,
    scrape,
)

URL = "https://jobs.micro1.ai/jobs/senior-backend-engineer-123"

REAL_COPY = (
    "We are hiring a Senior Backend Engineer to build reliable job search "
    "infrastructure with Python and FastAPI for candidates around the world."
)

GOOD = {
    "title": "Senior Backend Engineer",
    "company": "Micro1",
    "location": "Remote / Flexible",
    "salary": "Competitive Salary",
    "description": REAL_COPY,
}

JUNK = {
    "title": "Senior Backend Engineer",
    "company": "Micro1",
    "location": "Remote / Flexible",
    "salary": "Competitive Salary",
    "description": "Job description extracted from link.",
}

TEMPLATE_LEAK_HTML = f"""<!DOCTYPE html>
<html lang="en">
<head><title>Job | Micro1</title></head>
<body>
  <div class="job-description">
    <p>{REAL_COPY}</p>
  </div>
  <template id="hidden-row">
    <div class="payroll-number">confidential-internal-template-copy</div>
  </template>
</body>
</html>
"""


class ScrapeStaticDynamicRetryTests(unittest.TestCase):
    @staticmethod
    def request() -> ScrapeRequest:
        return ScrapeRequest(url=URL)

    def test_static_junk_triggers_dynamic_and_returns_rendered_copy(self) -> None:
        with patch("server._scrape_static", return_value=JUNK) as static, patch(
            "server._scrape_dynamic", return_value=GOOD
        ) as dynamic:
            result = scrape(self.request())
        static.assert_called_once_with(URL)
        dynamic.assert_called_once()
        self.assertEqual(GOOD, result)

    def test_static_good_copy_skips_dynamic(self) -> None:
        with patch("server._scrape_static", return_value=GOOD) as static, patch(
            "server._scrape_dynamic"
        ) as dynamic:
            result = scrape(self.request())
        static.assert_called_once_with(URL)
        dynamic.assert_not_called()
        self.assertEqual(GOOD, result)

    def test_dynamic_retry_failure_keeps_static_result(self) -> None:
        with patch("server._scrape_static", return_value=JUNK) as static, patch(
            "server._scrape_dynamic", side_effect=RuntimeError("browser unavailable")
        ) as dynamic:
            result = scrape(self.request())
        static.assert_called_once_with(URL)
        dynamic.assert_called_once()
        self.assertEqual(JUNK, result)


class QualityGateCaseInsensitivityTests(unittest.TestCase):
    """The bundle-marker gate must be case-insensitive and non-tag-aware."""

    def test_rejects_mixed_case_react_flight_markers(self) -> None:
        for blob in (
            'self.__Next_F.push([1,"payload"])',
            "window.__NEXT_DATA__ = {props:{}}",
            "route /_NEXT/STATIC/chunks/app.js",
            "data:__next_Data__[0]",
        ):
            self.assertFalse(_is_usable_description(blob), msg=blob)

    def test_accepts_real_prose(self) -> None:
        self.assertTrue(_is_usable_description(REAL_COPY))

    def test_accepts_short_real_copy_like_client_gate(self) -> None:
        self.assertTrue(_is_usable_description("Part-time role in Berlin. Apply by Friday."))

    def test_template_content_never_leaks_into_body_text(self) -> None:
        text = _body_text(Adaptor(TEMPLATE_LEAK_HTML, url=URL))
        self.assertIn(REAL_COPY, text)
        self.assertNotIn("confidential-internal-template-copy", text)
        self.assertNotIn("payroll-number", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)


