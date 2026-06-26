from pathlib import Path
import sys
import json

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
  sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient
from api.app import app

client = TestClient(app)

sample_pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT_DIR / "Vyas_s_resume.pdf"
sample_events = [
  {
    "id": "e1",
    "title": "AI and Data Meetup",
    "required_skills": {"Artificial Intelligence": 0.9, "Data Science": 0.7},
    "start_time": "2026-06-15T09:00:00+00:00",
    "popularity": 0.8,
  },
  {
    "id": "e2",
    "title": "Hospitality and Tourism Forum",
    "required_skills": {"Hospitality Management": 0.9},
    "start_time": "2026-06-20T09:00:00+00:00",
    "popularity": 0.5,
  },
]

if sample_pdf.exists():
  file_name = sample_pdf.name
  file_bytes = sample_pdf.read_bytes()
  content_type = 'application/pdf'
else:
  file_name = 'resume.txt'
  file_bytes = b'Python Frontend AI Cybersecurity Data Science'
  content_type = 'text/plain'

resp = client.post(
  '/upload_and_score',
  files={'file': (file_name, file_bytes, content_type)},
  data={'events': json.dumps(sample_events)},
)
print('status', resp.status_code)
print(json.dumps(resp.json(), indent=2))
