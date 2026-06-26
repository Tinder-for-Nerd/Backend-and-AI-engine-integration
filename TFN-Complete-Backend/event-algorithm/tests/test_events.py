import json
import unittest

from fastapi.testclient import TestClient

from api.app import app


class EventSearchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_home_page_loads(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Skillscore FastAPI Demo", resp.text)
        self.assertIn("Result", resp.text)
        self.assertIn("Upload and Score", resp.text)

    def test_search_events_prefers_matching_skills(self):
        payload = {
            "skills": [
                {"name": "Python", "domain": "Backend", "months_since_use": 1, "role_months": 24},
                {"name": "Pandas", "domain": "Data", "months_since_use": 2, "role_months": 18},
            ],
            "events": [
                {
                    "id": "e1",
                    "title": "Intro to Python for Data",
                    "required_skills": {"Python": 0.9, "Pandas": 0.6},
                    "start_time": "2026-06-15T09:00:00+00:00",
                    "popularity": 0.7,
                },
                {
                    "id": "e2",
                    "title": "Advanced System Design",
                    "required_skills": {"System Design": 0.9, "Distributed Systems": 0.8},
                    "start_time": "2026-07-20T09:00:00+00:00",
                    "popularity": 0.6,
                },
            ],
            "top_k": 2,
        }

        resp = self.client.post("/search_events", json=payload)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("results", body)
        self.assertIn("event_search_vector", body)
        results = body["results"]
        self.assertGreaterEqual(len(results), 1)
        # Top result should be the Python event
        self.assertEqual(results[0]["event_id"], "e1")

    def test_upload_resume_returns_domain_scores_and_ranked_events(self):
        taxonomy = [
            {"canonical_name": "Python", "domain": "Software", "aliases": ["python"]},
            {"canonical_name": "Pandas", "domain": "Data", "aliases": ["pandas"]},
            {"canonical_name": "Music", "domain": "Arts", "aliases": ["music"]},
        ]
        events = [
            {
                "id": "e1",
                "title": "Data Python Workshop",
                "required_skills": {"Python": 0.9, "Pandas": 0.7},
                "start_time": "2026-06-20T09:00:00+00:00",
                "popularity": 0.8,
            },
            {
                "id": "e2",
                "title": "Music and Production Meetup",
                "required_skills": {"Music": 0.9},
                "start_time": "2026-06-18T09:00:00+00:00",
                "popularity": 0.6,
            },
        ]
        files = {"file": ("resume.txt", b"Python Pandas Music", "text/plain")}
        data = {"taxonomy": json.dumps(taxonomy), "events": json.dumps(events)}

        resp = self.client.post("/upload_and_score", files=files, data=data)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["pdf_name"], "resume.txt")
        self.assertEqual(body["file_name"], "resume.txt")
        self.assertEqual(body["skill_score_results"], body["results"])
        self.assertIn("domain_scores", body)
        self.assertIn("ranked_events", body)
        self.assertIn("event_search_vector", body)
        self.assertNotIn("Other", body["domain_scores"])
        self.assertEqual(body["ranked_events"][0]["event_id"], "e1")

    def test_upload_resume_uses_default_taxonomy_when_blank(self):
        files = {"file": ("resume.txt", b"Python Frontend AI Pandas", "text/plain")}
        data = {"taxonomy": ""}

        resp = self.client.post("/upload_and_score", files=files, data=data)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["pdf_name"], "resume.txt")
        self.assertTrue(body["used_default_events"])
        self.assertIn("domain_scores", body)
        self.assertIn("Full-Stack Development", body["domain_scores"])
        self.assertIn("Artificial Intelligence & Machine Learning", body["domain_scores"])
        self.assertGreaterEqual(len(body["ranked_events"]), 1)
        self.assertEqual(body["ranked_events"][0]["event_id"], "e1")

    def test_upload_resume_ignores_swagger_placeholder_strings(self):
        files = {"file": ("resume.txt", b"Python Frontend AI Pandas", "text/plain")}
        data = {"taxonomy": "string", "events": "string"}

        resp = self.client.post("/upload_and_score", files=files, data=data)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["used_default_taxonomy"])
        self.assertTrue(body["used_default_events"])
        self.assertIn("Full-Stack Development", body["domain_scores"])
        self.assertGreaterEqual(len(body["ranked_events"]), 1)
        self.assertIn("event_search_vector", body)


if __name__ == "__main__":
    unittest.main()
