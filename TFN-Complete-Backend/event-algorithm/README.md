# Skillscore & Recommendation Algorithm

A dual-engine system designed to score professional skills and provide intelligent recommendations for profiles and events. This project combines a Python-based skill analysis engine with a Node.js-based recommendation algorithm.

## 🚀 Overview

The system operates in two main phases:
1.  **Skill Analysis (Python/FastAPI):** Parses resumes (PDF or text), extracts skills based on a master taxonomy, and calculates a multidimensional "Skill Score" considering recency, duration, seniority, and endorsements.
2.  **Recommendation Engine (Node.js):** Takes scored skill profiles and ranks events and other profiles using weights tailored to user types (Student vs. Pro), incorporating a feedback loop for continuous improvement.

---

## 🛠️ Features

### Skill Scoring Engine (Python)
-   **PDF Resume Parsing:** Automatic text extraction from PDF resumes.
-   **Taxonomy-Based Extraction:** Intelligent skill detection using a customizable `master_taxonomy.json`.
-   **Weighted Scoring:** Sophisticated algorithm calculating:
    -   `Recency Score`: Decays over time (tau = 24 months).
    -   `Duration Score`: Logarithmic normalization of experience.
    -   `Seniority Score`: Based on role level (Used, Built, Led, Expert).
    -   `Endorsement Bonus`: Quantitative validation of skills.
-   **FastAPI Interface:** Modern RESTful API with a built-in demo UI.

### Recommendation Engine (Node.js)
-   **Dual Scoring Modes:**
    -   *Student Mode*: Prioritizes skill overlap (weight: 0.50).
    -   *Pro Mode*: Prioritizes mutual connections (weight: 0.40).
-   **Feedback Loop:** Updates rankings in real-time based on user signals (Connect, RSVP, Dwell).
-   **Exploration Slot:** Reserves 10% for "discovery" items to avoid echo chambers.
-   **Pure Algorithm:** Decoupled from any UI for maximum portability.

---

## 📂 Project Structure

```text
├── api/                    # FastAPI Application
│   └── app.py              # Main API endpoints and demo UI logic
├── skillscore_algorithm/   # Core Python logic
│   └── core.py             # Skill scoring and event ranking algorithms
├── src/                    # Node.js Recommendation Engine
│   ├── index.js            # Public exports
│   ├── recommendationEngine.js
│   └── features/           # Scorer and signal logic
├── data/                   # JSON Taxonomy and sample datasets
├── tests/                  # Python unit tests
├── test/                   # Node.js unit tests
└── tools/                  # Utility scripts (e.g., Node runner for Python)
```

---

## 🚦 Getting Started

### Python (Skill Scoring API)
1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
2.  **Run the API:**
    ```bash
    uvicorn api.app:app --reload
    ```
3.  **Access the UI:** Open `http://120.0.0.1:8000` to use the interactive resume uploader.

### Node.js (Recommendation Engine)
1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run Demo:**
    ```bash
    npm run demo
    ```
3.  **Run Tests:**
    ```bash
    npm test
    ```

---

## 🧪 API Endpoints

-   `POST /upload_and_score`: Accepts a PDF/Text file and returns extracted skills, domain scores, and ranked events.
-   `POST /score_skill`: Detailed scoring for a single skill input.
-   `POST /combine`: Orchestrates both engines to provide comprehensive domain and node recommendations.
-   `POST /search_events`: Ranks a list of events against a user's skill profile.

---

## 📄 License
This project is licensed under the MIT License - see the `LICENSE` file for details.
