import unittest

import server


class FakePage:
    def __init__(self, url: str, closed: bool = False):
        self.url = url
        self._closed = closed

    def is_closed(self) -> bool:
        return self._closed


class LinkedInStateTests(unittest.TestCase):
    def test_checkpoint_is_not_treated_as_success(self):
        page = FakePage("https://www.linkedin.com/checkpoint/challenge/")
        self.assertEqual(server._li_classify_page(page), "checkpoint")
        diagnostic = server._li_diagnostics("checkpoint", "visible_browser")
        self.assertFalse(diagnostic["authenticated"])
        self.assertIn("keeps that window open", diagnostic["recovery"])

    def test_feed_url_is_authenticated(self):
        page = FakePage("https://www.linkedin.com/feed/")
        self.assertEqual(server._li_classify_page(page), "signed_in")

    def test_closed_window_has_specific_recovery(self):
        page = FakePage("https://www.linkedin.com/login", closed=True)
        self.assertEqual(server._li_classify_page(page), "window_closed")
        diagnostic = server._li_diagnostics("window_closed", "visible_browser")
        self.assertIn("closed before authentication", diagnostic["reason"])


if __name__ == "__main__":
    unittest.main()
