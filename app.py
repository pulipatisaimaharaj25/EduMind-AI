import os
import json
import sqlite3
import requests
from flask import Flask, render_template, request, jsonify, session, redirect, url_for

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "edumind_ai_hackathon_key_2026")

DATABASE = 'database.db'

# --- SQLite Database Helper Functions ---

def get_db():
    """Establishes and returns a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database schema if it doesn't exist."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create students table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                class_level TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create quiz_scores table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS quiz_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER,
                subject TEXT NOT NULL,
                score INTEGER NOT NULL,
                total INTEGER NOT NULL,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students (id)
            )
        ''')
        
        # Create study_plans table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS study_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER,
                exam_name TEXT NOT NULL,
                exam_date TEXT NOT NULL,
                subjects TEXT NOT NULL,
                plan_json TEXT NOT NULL,
                FOREIGN KEY (student_id) REFERENCES students (id)
            )
        ''')
        conn.commit()

# Initialize Database on Startup
if not os.path.exists(DATABASE):
    init_db()

# --- Gemini API Call Helper ---

def get_gemini_api_key():
    """Retrieves the Gemini API Key from environment variables."""
    return os.environ.get("GEMINI_API_KEY", "")

def call_gemini(prompt, system_instruction=None, response_json=False):
    """Makes a REST request to the Gemini 1.5/3.5 API."""
    api_key = get_gemini_api_key()
    if not api_key:
        return None

    # Use standard gemini-3.5-flash or gemini-1.5-flash beta endpoint
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    contents_payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    
    if system_instruction:
        contents_payload["systemInstruction"] = {
            "parts": [
                {"text": system_instruction}
            ]
        }
        
    if response_json:
        contents_payload["generationConfig"] = {
            "responseMimeType": "application/json",
            "temperature": 0.5
        }

    try:
        response = requests.post(url, headers=headers, json=contents_payload, timeout=30)
        if response.status_code == 200:
            res_data = response.json()
            # Extract text
            return res_data['candidates'][0]['content']['parts'][0]['text']
        else:
            print(f"Gemini API Error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Exception during Gemini call: {e}")
        return None

# --- Web Route Endpoints ---

@app.route('/')
def index():
    """Renders the landing page."""
    if 'student_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Renders the dashboard page if user is signed in."""
    if 'student_id' not in session:
        return redirect(url_for('index'))
    return render_template('dashboard.html')

@app.route('/quiz')
def quiz():
    """Renders the interactive quiz page."""
    if 'student_id' not in session:
        return redirect(url_for('index'))
    return render_template('quiz.html')

@app.route('/chat')
def chat():
    """Renders the AI doubt solver chat interface."""
    if 'student_id' not in session:
        return redirect(url_for('index'))
    return render_template('chat.html')

@app.route('/planner')
def planner():
    """Renders the day-by-day exam schedule planner."""
    if 'student_id' not in session:
        return redirect(url_for('index'))
    return render_template('planner.html')

# --- REST API Endpoints ---

@app.route('/api/register', methods=['POST'])
def api_register():
    """Registers a student name & class level, storing in SQLite and setting session."""
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    class_level = data.get('class_level', '').strip()
    
    if not name or not class_level:
        return jsonify({"error": "Name and Class Level are required"}), 400
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO students (name, class_level) VALUES (?, ?)", (name, class_level))
        student_id = cursor.lastrowid
        conn.commit()
        
    session['student_id'] = student_id
    session['student_name'] = name
    session['class_level'] = class_level
    
    return jsonify({
        "status": "success",
        "student_id": student_id,
        "name": name,
        "class_level": class_level
    })

@app.route('/api/student', methods=['GET'])
def api_student():
    """Returns the current student session details."""
    if 'student_id' not in session:
        return jsonify({"logged_in": False}), 200
        
    return jsonify({
        "logged_in": True,
        "student_id": session['student_id'],
        "name": session['student_name'],
        "class_level": session['class_level']
    })

@app.route('/api/chat', methods=['POST'])
def api_chat():
    """Solves academic doubts using Gemini API (with optional Telugu translation)."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json() or {}
    subject = data.get('subject', 'General')
    question = data.get('question', '').strip()
    is_telugu = data.get('is_telugu', False)
    
    if not question:
        return jsonify({"error": "Question is empty"}), 400
        
    # Language toggle instruction
    language_prompt = (
        "Answer the student's question in Telugu language. Use very simple, encouraging terms suitable for a school student."
        if is_telugu else
        "Answer in very simple, easy-to-understand English. Explain step-by-step as if explaining to a rural school student in India."
    )
    
    prompt = f"""
    Student Class: {session['class_level']} standard
    Subject: {subject}
    Question/Doubt: {question}
    
    Instruction: {language_prompt}
    Keep the answer concise, encouraging, structured with bullet points or small paragraphs, and easy to read.
    """
    
    system_instruction = (
        "You are EduMind AI, a friendly, extremely supportive study assistant for rural Indian school students. "
        "You excel at explaining complex academic concepts (Math, Science, Social, English) in very simple, "
        "step-by-step lines with examples from Indian everyday rural life."
    )
    
    response_text = call_gemini(prompt, system_instruction=system_instruction)
    
    if not response_text:
        # Fallback offline support if API key is missing or calls fail
        if is_telugu:
            response_text = f"క్షమించండి, మీ ప్రశ్న: '{question}' కి సమాధానం ఇవ్వడానికి నేను ఇప్పుడు సర్వర్‌కి కనెక్ట్ కాలేకపోతున్నాను. దయచేసి తర్వాత మళ్ళీ ప్రయత్నించండి."
        else:
            response_text = f"I am sorry, I am currently unable to reach the AI server to answer your doubt: '{question}'. Please check your API key configuration and try again!"
            
    return jsonify({"response": response_text})

@app.route('/api/quiz/generate', methods=['POST'])
def api_quiz_generate():
    """Generates 5 personalized MCQ questions using Gemini API."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json() or {}
    subject = data.get('subject', 'Math')
    difficulty = data.get('difficulty', 'Medium')
    is_telugu = data.get('is_telugu', False)
    
    language_pref = (
        "Questions, options, and explanations MUST be in Telugu (తెలుగు) language."
        if is_telugu else
        "Questions, options, and explanations must be in very simple English suitable for Indian school kids."
    )
    
    prompt = f"""
    Generate exactly 5 multiple-choice questions (MCQs) for a quiz.
    Subject: {subject}
    Class Level: {session['class_level']} standard
    Difficulty Level: {difficulty}
    Language: {language_pref}

    You MUST respond ONLY with a raw JSON object matching this exact schema:
    {{
      "questions": [
        {{
          "question": "Question text...",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctIndex": 0,
          "explanation": "Simple explanation of the correct option..."
        }}
      ]
    }}

    Rules:
    1. Response must be valid JSON. Do not wrap in markdown code blocks like ```json ... ```.
    2. options must contain exactly 4 choices.
    3. correctIndex must be an integer (0, 1, 2, or 3).
    """
    
    json_response = call_gemini(prompt, response_json=True)
    
    if json_response:
        try:
            # Parse to ensure it is valid JSON
            clean_json = json_response.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif clean_json.startswith("```"):
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            quiz_data = json.loads(clean_json)
            return jsonify(quiz_data)
        except Exception as e:
            print(f"Error parsing Gemini JSON: {e}")
            
    # Local Fallback MCQ Data to ensure demo robustness
    fallback_data = get_fallback_quiz(subject, is_telugu)
    return jsonify(fallback_data)

@app.route('/api/quiz/save', methods=['POST'])
def api_quiz_save():
    """Saves a quiz score history record to SQLite database."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json() or {}
    subject = data.get('subject', 'Math')
    score = data.get('score', 0)
    total = data.get('total', 5)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO quiz_scores (student_id, subject, score, total) VALUES (?, ?, ?, ?)",
            (session['student_id'], subject, score, total)
        )
        conn.commit()
        
    return jsonify({"status": "success"})

@app.route('/api/quiz/history', methods=['GET'])
def api_quiz_history():
    """Fetches last 5 quiz attempts of the student."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT subject, score, total, date FROM quiz_scores WHERE student_id = ? ORDER BY id DESC LIMIT 5",
            (session['student_id'],)
        )
        rows = cursor.fetchall()
        
    scores = []
    for r in rows:
        scores.append({
            "subject": r['subject'],
            "score": r['score'],
            "total": r['total'],
            "date": r['date']
        })
        
    return jsonify({"scores": scores})

@app.route('/api/planner/generate', methods=['POST'])
def api_planner_generate():
    """Generates an customized day-by-day exam calendar timetable."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json() or {}
    exam_name = data.get('exam_name', 'Finals')
    exam_date = data.get('exam_date', 'Next Week')
    subjects = data.get('subjects', [])
    
    subjects_str = ", ".join(subjects)
    
    prompt = f"""
    Create a personalized day-by-day study schedule calendar for a student preparing for an exam.
    Student Class: {session['class_level']} standard
    Exam Name: {exam_name}
    Exam Timeframe: {exam_date}
    Subjects to cover: {subjects_str}

    You MUST respond ONLY with a raw JSON object matching this exact schema:
    {{
      "exam_name": "{exam_name}",
      "days": [
        {{
          "day": "Day 1",
          "focus_subject": "Math",
          "topics": ["Numbers system revision", "Solve 5 practice problems"],
          "study_time": "1 hour"
        }}
      ]
    }}

    Rules:
    1. Limit to maximum 7 days lead up.
    2. Topics must be reasonable for {session['class_level']} standard.
    3. Do not wrap in markdown code blocks.
    """
    
    json_response = call_gemini(prompt, response_json=True)
    
    if json_response:
        try:
            clean_json = json_response.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif clean_json.startswith("```"):
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            plan_data = json.loads(clean_json)
            return jsonify(plan_data)
        except Exception as e:
            print(f"Error parsing Gemini Plan JSON: {e}")
            
    # Local Fallback Study Plan
    fallback_plan = get_fallback_plan(exam_name, subjects)
    return jsonify(fallback_plan)

@app.route('/api/planner/save', methods=['POST'])
def api_planner_save():
    """Saves the student's active calendar study plan JSON to SQLite."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json() or {}
    exam_name = data.get('exam_name', 'My Exam')
    exam_date = data.get('exam_date', '')
    subjects = data.get('subjects', '')
    plan_json = data.get('plan_json', '{}')
    
    with get_db() as conn:
        cursor = conn.cursor()
        # Delete any previous latest plan to save space
        cursor.execute("DELETE FROM study_plans WHERE student_id = ?", (session['student_id'],))
        cursor.execute(
            "INSERT INTO study_plans (student_id, exam_name, exam_date, subjects, plan_json) VALUES (?, ?, ?, ?, ?)",
            (session['student_id'], exam_name, exam_date, subjects, plan_json)
        )
        conn.commit()
        
    return jsonify({"status": "success"})

@app.route('/api/planner/latest', methods=['GET'])
def api_planner_latest():
    """Fetches the latest saved study plan of the student."""
    if 'student_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT plan_json FROM study_plans WHERE student_id = ? ORDER BY id DESC LIMIT 1",
            (session['student_id'],)
        )
        row = cursor.fetchone()
        
    if row:
        return jsonify(json.loads(row['plan_json']))
    return jsonify({"no_plan": True})

@app.route('/api/quote', methods=['GET'])
def api_quote():
    """Generates daily motivational quote using Gemini."""
    if 'student_id' not in session:
        return jsonify({"quote": "Focus on your goals and work hard to make your dreams come true!"})
        
    prompt = f"Generate a short, inspiring 1-sentence motivational quote for a school student named {session['student_name']} who lives in rural India. Keep it under 25 words."
    
    quote = call_gemini(prompt)
    if not quote:
        quote = f"Believe in yourself, {session['student_name']}! Every small step of learning leads to huge success."
    else:
        quote = quote.replace('"', '').strip()
        
    return jsonify({"quote": quote})

@app.route('/api/reset', methods=['POST'])
def api_reset():
    """Clears SQLite database records of the student and ends session."""
    if 'student_id' in session:
        student_id = session['student_id']
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM quiz_scores WHERE student_id = ?", (student_id,))
            cursor.execute("DELETE FROM study_plans WHERE student_id = ?", (student_id,))
            cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
            conn.commit()
            
    session.clear()
    return jsonify({"status": "success"})

# --- Local Fallback Data Generative Methods ---

def get_fallback_quiz(subject, is_telugu):
    """Provides high-quality, local mock MCQ quiz if Gemini is unavailable."""
    if is_telugu:
        return {
            "questions": [
                {
                    "question": "కింది వాటిలో ఏది ద్రవ రూపంలో ఉండే లోహం?",
                    "options": ["A) ఇనుము", "B) పాదరసం (Mercury)", "C) రాగి", "D) బంగారం"],
                    "correctIndex": 1,
                    "explanation": "సాధారణ ఉష్ణోగ్రత వద్ద పాదరసం ద్రవ రూపంలో ఉండే ఏకైక లోహం."
                },
                {
                    "question": "కంప్యూటర్ యొక్క మెదడు అని దేనిని పిలుస్తారు?",
                    "options": ["A) కీబోర్డ్", "B) CPU", "C) మానిటర్", "D) మౌస్"],
                    "correctIndex": 1,
                    "explanation": "CPU (Central Processing Unit) కంప్యూటర్ యొక్క అన్ని లెక్కలను మరియు పనులను నిర్వహిస్తుంది."
                },
                {
                    "question": "మొక్కలు ఆహారాన్ని తయారుచేసే ప్రక్రియను ఏమంటారు?",
                    "options": ["A) శ్వాసక్రియ", "B) కిరణజన్య సంయోగక్రియ", "C) జీర్ణక్రియ", "D) ఆవిరిపోవడం"],
                    "correctIndex": 1,
                    "explanation": "ఆకుపచ్చని మొక్కలు సూర్యరశ్మి మరియు నీటి సహాయంతో కిరణజన్య సంయోగక్రియ (Photosynthesis) ద్వారా ఆహారాన్ని తయారుచేస్తాయి."
                },
                {
                    "question": "కింది వాటిలో ఏది సహజ సంఖ్య?",
                    "options": ["A) -5", "B) 0", "C) 5", "D) 1/2"],
                    "correctIndex": 2,
                    "explanation": "సహజ సంఖ్యలు (Natural Numbers) ఎల్లప్పుడూ 1 నుండి ప్రారంభమవుతాయి (1, 2, 3, 4, 5...)."
                },
                {
                    "question": "సూర్యుడు ఏ దిక్కున ఉదయిస్తాడు?",
                    "options": ["A) పడమర", "B) తూర్పు", "C) ఉత్తరం", "D) దక్షిణం"],
                    "correctIndex": 1,
                    "explanation": "భూమి తన అక్షం మీద పడమర నుండి తూర్పుకు తిరుగుతుంది కాబట్టి సూర్యుడు తూర్పున ఉదయిస్తున్నట్లు కనిపిస్తాడు."
                }
            ]
        }
    else:
        return {
            "questions": [
                {
                    "question": "Which of the following is an even prime number?",
                    "options": ["A) 1", "B) 2", "C) 3", "D) 5"],
                    "correctIndex": 1,
                    "explanation": "2 is the only prime number that is also an even number."
                },
                {
                    "question": "What is the primary gas found in Earth's atmosphere?",
                    "options": ["A) Oxygen", "B) Nitrogen", "C) Carbon Dioxide", "D) Hydrogen"],
                    "correctIndex": 1,
                    "explanation": "Nitrogen makes up about 78% of the Earth's atmosphere, followed by Oxygen at 21%."
                },
                {
                    "question": "What is the capital city of India?",
                    "options": ["A) Mumbai", "B) New Delhi", "C) Kolkata", "D) Chennai"],
                    "correctIndex": 1,
                    "explanation": "New Delhi was declared the official capital of India in 1911."
                },
                {
                    "question": "Which organ pumps blood throughout the human body?",
                    "options": ["A) Lungs", "B) Brain", "C) Heart", "D) Kidneys"],
                    "correctIndex": 2,
                    "explanation": "The heart acts as a muscular pump that continuously circulates blood to all body organs."
                },
                {
                    "question": "Which of these is a computer input device?",
                    "options": ["A) Monitor", "B) Keyboard", "C) Printer", "D) Speaker"],
                    "correctIndex": 1,
                    "explanation": "A keyboard allows a user to input letters, numbers, and commands into a computer."
                }
            ]
        }

def get_fallback_plan(exam_name, subjects):
    """Provides high-quality, customized mock study plan if Gemini is offline."""
    if not subjects:
        subjects = ["Math", "Science"]
        
    days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]
    days_data = []
    
    for i, day in enumerate(days):
        sub = subjects[i % len(subjects)]
        days_data.append({
            "day": day,
            "focus_subject": sub,
            "topics": [
                f"Read Chapter {i + 1} of {sub} thoroughly",
                f"Solve back-of-the-chapter practice questions",
                f"Create a 1-page summary chart of important terms"
            ],
            "study_time": "1.5 hours"
        })
        
    return {
        "exam_name": exam_name,
        "days": days_data
    }

if __name__ == '__main__':
    # Default to 5000 port
    app.run(host='0.0.0.0', port=5000, debug=True)
