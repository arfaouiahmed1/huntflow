"""HUNTFLOW Scrapling Sidecar — Community Filter List Driven Adblock Tests."""

from __future__ import annotations

import unittest
from adblock import (
    should_block_url,
    load_rules,
    _COSMETIC_CSS,
)
from sync_filterlists import parse_adblock_filter_line, parse_hosts_file_line


class FilterlistParserTests(unittest.TestCase):
    def test_parses_network_domain_rules(self) -> None:
        domain, path, selector, is_exc = parse_adblock_filter_line("||doubleclick.net^")
        self.assertEqual(domain, "doubleclick.net")
        self.assertFalse(is_exc)

    def test_parses_whitelist_exception_rules(self) -> None:
        domain, path, selector, is_exc = parse_adblock_filter_line("@@||boards-api.greenhouse.io^")
        self.assertEqual(domain, "boards-api.greenhouse.io")
        self.assertTrue(is_exc)

    def test_parses_cosmetic_hiding_rules(self) -> None:
        domain, path, selector, is_exc = parse_adblock_filter_line("adblock.turtlecute.org##.adbox.banner_ads.adsbox")
        self.assertEqual(selector, ".adbox.banner_ads.adsbox")
        self.assertFalse(is_exc)

    def test_parses_hosts_lines(self) -> None:
        domain = parse_hosts_file_line("0.0.0.0 tracking.example.com")
        self.assertEqual(domain, "tracking.example.com")
        self.assertIsNone(parse_hosts_file_line("# comment"))
        self.assertIsNone(parse_hosts_file_line("127.0.0.1 localhost"))


class AdblockTests(unittest.TestCase):
    def setUp(self) -> None:
        load_rules(force_reload=True)

    def test_blocks_known_ad_networks_and_trackers(self) -> None:
        ad_urls = [
            "https://securepubads.g.doubleclick.net/gampad/ads",
            "https://www.google-analytics.com/analytics.js",
            "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
            "https://connect.facebook.net/en_US/fbevents.js",
            "https://ib.adnxs.com/seg?add=1",
            "https://static.criteo.net/js/ld/ld.js",
            "https://cdn.segment.com/analytics.js/v1/xyz/analytics.min.js",
            "https://static.hotjar.com/c/hotjar-123.js",
            "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
            "https://adblock.turtlecute.org/pagead.js",
            "https://adblock.turtlecute.org/widget/ads.js",
        ]
        for url in ad_urls:
            self.assertTrue(should_block_url(url), f"expected URL to be blocked: {url}")

    def test_permits_legitimate_job_board_content(self) -> None:
        legit_urls = [
            "https://boards-api.greenhouse.io/v1/boards/stripe/jobs",
            "https://api.lever.co/v0/postings/linear",
            "https://jobs.ashbyhq.com/supabase/api",
            "https://www.arbeitnow.com/api/job-board-api",
            "https://remotive.com/api/remote-jobs",
            "https://news.ycombinator.com/item?id=40000000",
            "https://stripe.com/jobs/search",
        ]
        for url in legit_urls:
            self.assertFalse(should_block_url(url), f"expected URL to be permitted: {url}")

    def test_cosmetic_rules_contain_turtlecute_and_standard_selectors(self) -> None:
        self.assertIn(".banner_ads", _COSMETIC_CSS)
        self.assertIn(".textads", _COSMETIC_CSS)
        self.assertIn(".adsbygoogle", _COSMETIC_CSS)
        self.assertIn("display: none !important", _COSMETIC_CSS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
