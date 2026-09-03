"""HUNTFLOW Connector SDK — Unit and Fixture Tests.

Deterministic, zero-network tests for all ATS, aggregator, HTML, and directory adapters.
"""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock
import httpx

from connectors.registry import get_connector, list_connectors
from connectors.ats import (
    GreenhouseConnector,
    LeverConnector,
    AshbyConnector,
    PersonioConnector,
    detect_ats_provider,
)
from connectors.aggregators import (
    ArbeitnowConnector,
    JobicyConnector,
    TheMuseConnector,
)
from rate_limiter import CircuitBreaker


class ConnectorRegistryTests(unittest.TestCase):
    def test_registry_contains_all_core_connectors(self) -> None:
        connectors = list_connectors()
        expected = [
            "greenhouse", "lever", "ashby", "smartrecruiters", "personio",
            "recruitee", "workable", "teamtailor", "workday", "bamboohr",
            "arbeitnow", "jobicy", "remotive", "himalayas", "reliefweb",
            "themuse", "adzuna", "jooble", "findwork", "usajobs",
            "html_static", "html_stealth", "html_posts",
            "directory_careerpanels", "directory_jobboardsearch",
        ]
        for conn_id in expected:
            self.assertIn(conn_id, connectors, f"missing connector '{conn_id}'")
            self.assertIsNotNone(get_connector(conn_id))

    def test_detect_ats_provider(self) -> None:
        self.assertEqual(detect_ats_provider("https://boards.greenhouse.io/stripe"), ("greenhouse", "stripe"))
        self.assertEqual(detect_ats_provider("https://jobs.lever.co/linear"), ("lever", "linear"))
        self.assertEqual(detect_ats_provider("https://jobs.ashbyhq.com/supabase"), ("ashby", "supabase"))
        self.assertEqual(detect_ats_provider("https://jobs.smartrecruiters.com/visa"), ("smartrecruiters", "visa"))
        self.assertEqual(detect_ats_provider("linear"), ("lever", "linear"))
        self.assertEqual(detect_ats_provider("supabase"), ("ashby", "supabase"))


class AtsConnectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_greenhouse_connector_parsing(self) -> None:
        conn = GreenhouseConnector()
        sample_json = {
            "jobs": [
                {
                    "id": 12345,
                    "title": "Senior Infrastructure Engineer",
                    "location": {"name": "Remote, US"},
                    "absolute_url": "https://boards.greenhouse.io/acme/jobs/12345",
                    "content": "<p>Build cloud systems. Salary: $180,000 - $220,000 USD</p>",
                    "departments": [{"name": "Engineering"}],
                    "offices": [{"name": "San Francisco"}],
                    "updated_at": "2026-08-01T12:00:00Z",
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_json
        mock_resp.headers = {"ETag": '"etag-gh-123"'}

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "acme", "token": "acme", "name": "Acme Corp"}, {}, None, client)
        self.assertEqual(page.status, "success")
        self.assertEqual(len(page.items), 1)
        item = page.items[0]
        self.assertEqual(item.external_id, "12345")
        self.assertEqual(item.title, "Senior Infrastructure Engineer")
        self.assertEqual(item.company, "Acme Corp")
        self.assertEqual(item.location, "Remote, US")
        self.assertIn("Engineering", item.tags)
        self.assertIn("$180,000", item.salary or "")
        self.assertEqual(page.etag, '"etag-gh-123"')

    async def test_lever_connector_parsing(self) -> None:
        conn = LeverConnector()
        sample_json = [
            {
                "id": "lev_999",
                "text": "Product Designer",
                "categories": {"location": "Remote", "team": "Design", "commitment": "Full-time"},
                "hostedUrl": "https://jobs.lever.co/linear/lev_999",
                "description": "<div>Design user interfaces.</div>",
                "salaryRange": {"min": 140000, "max": 180000, "currency": "USD"},
                "createdAt": 1720000000000,
            }
        ]
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_json
        mock_resp.headers = {}

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "linear", "token": "linear", "name": "Linear"}, {}, None, client)
        self.assertEqual(page.status, "success")
        self.assertEqual(len(page.items), 1)
        item = page.items[0]
        self.assertEqual(item.title, "Product Designer")
        self.assertEqual(item.salary, "USD 140,000 - 180,000")
        self.assertIn("Design", item.tags)

    async def test_ashby_connector_parsing(self) -> None:
        conn = AshbyConnector()
        sample_json = {
            "jobPostings": [
                {
                    "id": "ashby_101",
                    "title": "Distributed Systems Engineer",
                    "locationName": "Remote - Global",
                    "jobUrl": "https://jobs.ashbyhq.com/supabase/ashby_101",
                    "descriptionPlain": "Work on Postgres clustering.",
                    "departmentName": "Core Database",
                    "employmentType": "Full-time",
                    "publishedAt": "2026-08-15T10:00:00Z",
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_json
        mock_resp.headers = {}

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "supabase", "token": "supabase", "name": "Supabase"}, {}, None, client)
        self.assertEqual(page.status, "success")
        self.assertEqual(len(page.items), 1)
        item = page.items[0]
        self.assertEqual(item.title, "Distributed Systems Engineer")
        self.assertEqual(item.location, "Remote - Global")
        self.assertIn("Core Database", item.tags)

    async def test_personio_xml_connector_parsing(self) -> None:
        conn = PersonioConnector()
        sample_xml = """<?xml version="1.0" encoding="utf-8"?>
        <workzag-jobs>
            <position>
                <id>8888</id>
                <name>Full Stack Python Developer</name>
                <office>Munich, Germany</office>
                <department>Software Engineering</department>
                <schedule>Full-time</schedule>
                <jobDescriptions>
                    <jobDescription>
                        <name>Role Overview</name>
                        <value><![CDATA[<p>Build scalable web backends.</p>]]></value>
                    </jobDescription>
                </jobDescriptions>
            </position>
        </workzag-jobs>"""

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_xml
        mock_resp.headers = {}

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "test_personio", "token": "personio-client", "name": "Personio Client"}, {}, None, client)
        self.assertEqual(page.status, "success")
        self.assertEqual(len(page.items), 1)
        item = page.items[0]
        self.assertEqual(item.external_id, "8888")
        self.assertEqual(item.title, "Full Stack Python Developer")
        self.assertEqual(item.location, "Munich, Germany")
        self.assertIn("Build scalable web backends", item.description)


class AggregatorConnectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_arbeitnow_connector_parsing(self) -> None:
        conn = ArbeitnowConnector()
        sample_json = {
            "data": [
                {
                    "slug": "arbeitnow-job-1",
                    "title": "Backend Go Developer",
                    "company_name": "Berlin Tech",
                    "location": "Berlin, Germany",
                    "url": "https://www.arbeitnow.com/jobs/1",
                    "description": "<p>Golang microservices</p>",
                    "tags": ["Go", "Kubernetes"],
                    "remote": True,
                    "visa_sponsorship": True,
                    "created_at": 1720000000,
                }
            ],
            "links": {"next": "https://www.arbeitnow.com/api/job-board-api?page=2"},
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_json
        mock_resp.headers = {}

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "arbeitnow"}, {}, None, client)
        self.assertEqual(page.status, "success")
        self.assertEqual(len(page.items), 1)
        item = page.items[0]
        self.assertEqual(item.title, "Backend Go Developer")
        self.assertIn("Visa Sponsorship", item.tags)
        self.assertEqual(page.next_cursor, "2")
        self.assertFalse(page.is_complete)

    async def test_jobicy_connector_parsing(self) -> None:
        conn = JobicyConnector()
        sample_json = {
            "jobs": [
                {
                    "id": 555,
                    "jobTitle": "React Native Mobile Engineer",
                    "companyName": "Mobile Labs",
                    "jobGeo": "Worldwide",
                    "url": "https://jobicy.com/jobs/555",
                    "jobDescription": "Build mobile applications.",
                    "annualSalaryMin": 100000,
                    "annualSalaryMax": 130000,
                    "salaryCurrency": "USD",
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_json

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "jobicy"}, {}, None, client)
        self.assertEqual(page.status, "success")
        self.assertEqual(len(page.items), 1)
        self.assertEqual(page.items[0].title, "React Native Mobile Engineer")
        self.assertEqual(page.items[0].salary, "USD 100000 - 130000")
    async def test_themuse_not_configured_graceful_handling(self) -> None:
        conn = TheMuseConnector()
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        client = AsyncMock(spec=httpx.AsyncClient)
        client.get.return_value = mock_resp

        page = await conn.fetch_page({"id": "themuse"}, {}, None, client)
        self.assertEqual(page.status, "not_configured")

class RateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_circuit_breaker_tripping_and_recovery(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_seconds=1.0)
        self.assertFalse(cb.is_open("api.example.com"))

        cb.record_failure("api.example.com")
        cb.record_failure("api.example.com")
        self.assertFalse(cb.is_open("api.example.com"))

        tripped = cb.record_failure("api.example.com")
        self.assertTrue(tripped)
        self.assertTrue(cb.is_open("api.example.com"))

        cb.record_success("api.example.com")
        self.assertFalse(cb.is_open("api.example.com"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
