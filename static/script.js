// --- State Managers (Local Storage Cached) ---

let currentSubject = localStorage.getItem("currentSubject") || "Math";
let selectedDifficultyLevel = localStorage.getItem("selectedDifficultyLevel") || "Medium";
let selectedPlannerSubjects = [];

// Track active language: false = English, true = Telugu
let isTeluguMode = localStorage.getItem("isTeluguMode") === "true";

// Active Quiz State variables
let activeQuizQuestions = [];
let activeQuizIndex = 0;
let activeQuizScore = 0;
let activeQuizSelectedOption = null;

// --- Language Toggle Actions ---

function updateLanguageUI() {
    const langBtn = document.getElementById("langToggleBtn");
    const langText = document.getElementById("langText");
    
    if (isTeluguMode) {
        if (langBtn) langBtn.classList.add("active");
        if (langText) langText.innerText = "తెలుగు (Telugu) ✓";
    } else {
        if (langBtn) langBtn.classList.remove("active");
        if (langText) langText.innerText = "తెలుగులో కావాలా?";
    }
}

function toggleLanguage() {
    isTeluguMode = !isTeluguMode;
    localStorage.setItem("isTeluguMode", isTeluguMode);
    updateLanguageUI();
    
    const currentPath = window.location.pathname;
    if (currentPath === "/dashboard") {
        loadDashboardData();
    } else if (currentPath === "/chat") {
        updateChatPlaceholder();
    } else if (currentPath === "/quiz") {
        const configBtn = document.getElementById("quizGenBtnText");
        if (configBtn) {
            configBtn.innerText = isTeluguMode ? "రైట్, క్విజ్ ప్రారంభించు! 🚀" : "Generate 5 MCQ Quiz 🚀";
        }
    } else if (currentPath === "/planner") {
        const planBtn = document.getElementById("planGenBtnText");
        if (planBtn) {
            planBtn.innerText = isTeluguMode ? "AI తో ప్లాన్ తయారు చెయ్యి 📅" : "Generate Daily Study Planner 🚀";
        }
    }
}

document.addEventListener("DOMContentLoaded", function() {
    updateLanguageUI();
});

// --- Onboarding & Profile Flow ---

function registerStudent(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById("studentName");
    const classSelect = document.getElementById("classLevel");
    const errorDiv = document.getElementById("formError");
    
    if (!nameInput || !classSelect) return;
    
    const name = nameInput.value.trim();
    const classLevel = classSelect.value;
    
    if (!name || !classLevel) {
        if (errorDiv) errorDiv.innerText = "Please fill in all details.";
        return;
    }
    
    if (errorDiv) errorDiv.innerText = "";
    
    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, class_level: classLevel })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            window.location.href = "/dashboard";
        } else {
            if (errorDiv) errorDiv.innerText = data.error || "An error occurred during registration.";
        }
    })
    .catch(err => {
        console.error("Registration error:", err);
        if (errorDiv) errorDiv.innerText = "Connection lost. Please try again.";
    });
}

function resetProfile() {
    if (!confirm("Are you sure you want to reset your student profile and clear all progress? This action cannot be undone.")) return;
    
    fetch('/api/reset', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            localStorage.clear();
            window.location.href = "/";
        }
    })
    .catch(err => console.error("Reset error:", err));
}

// --- Dashboard Logic ---

function loadDashboardData() {
    const quoteEl = document.getElementById("motivationalQuote");
    if (quoteEl) {
        fetch('/api/quote')
        .then(res => res.json())
        .then(data => {
            quoteEl.innerText = `"${data.quote}"`;
        })
        .catch(err => {
            console.error("Quote fetch error:", err);
            quoteEl.innerText = isTeluguMode ? 
                `"విజయం మీ సంకల్పంపైనే ఆధారపడి ఉంటుంది, నిరంతరం చదువుతూ ఉండండి!"` : 
                `"Every small step of learning leads to massive success. Keep glowing!"`;
        });
    }
    
    loadDashboardSchedule();
    loadDashboardQuizHistory();
}

function loadDashboardSchedule() {
    const container = document.getElementById("todayScheduleContainer");
    if (!container) return;
    
    fetch('/api/planner/latest')
    .then(res => res.json())
    .then(data => {
        if (data.no_plan) {
            container.innerHTML = `
                <div class="empty-state-card text-center p-3" style="background-color: var(--slate-dark); border-radius: var(--border-radius-md); border: 1px dashed var(--slate-border);">
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">No active Study Timetable found. Create one now to organize your daily priorities!</p>
                    <a href="/planner" class="btn-primary-glow" style="padding: 10px 16px; font-size: 12px; text-decoration: none; display: inline-flex;">Create Study Plan 🚀</a>
                </div>
            `;
            return;
        }
        
        let days = data.days || [];
        let todayDay = days.find(d => d.topics && d.topics.some(t => !t.isDone)) || days[0];
        
        if (!todayDay) {
            container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">All planned days completed successfully! Congratulations! 🎉</p>`;
            return;
        }
        
        const dayIndex = days.indexOf(todayDay);
        
        let html = `
            <div class="schedule-day-box" style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <strong style="font-size: 14px; color: white;">${data.exam_name} - ${todayDay.day}</strong>
                        <p style="font-size: 11px; color: var(--accent-cyan); font-weight: 600;">Focus Subject: ${todayDay.focus_subject}</p>
                    </div>
                    <span class="day-time-badge">⏳ ${todayDay.study_time}</span>
                </div>
                <div class="day-card-checklist">
        `;
        
        todayDay.topics.forEach((topic, tIdx) => {
            const isChecked = topic.isDone;
            html += `
                <div class="checklist-item">
                    <div class="checklist-cb ${isChecked ? 'checked' : ''}" onclick="toggleDashboardTopic(${dayIndex}, ${tIdx}, ${isChecked})">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <span class="checklist-text ${isChecked ? 'checked' : ''}">${topic.text}</span>
                </div>
            `;
        });
        
        html += `</div></div>`;
        container.innerHTML = html;
    })
    .catch(err => {
        console.error("Dashboard schedule error:", err);
        container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">Could not sync study priorities.</p>`;
    });
}

function toggleDashboardTopic(dayIndex, topicIndex, currentStatus) {
    fetch('/api/planner/latest')
    .then(res => res.json())
    .then(data => {
        if (!data || !data.days) return;
        data.days[dayIndex].topics[topicIndex].isDone = !currentStatus;
        
        fetch('/api/planner/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exam_name: data.exam_name,
                exam_date: '',
                subjects: '',
                plan_json: JSON.stringify(data)
            })
        })
        .then(() => { loadDashboardSchedule(); });
    });
}

function loadDashboardQuizHistory() {
    const container = document.getElementById("quizHistoryContainer");
    if (!container) return;
    
    fetch('/api/quiz/history')
    .then(res => res.json())
    .then(data => {
        const scores = data.scores || [];
        if (scores.length === 0) {
            container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">No quizzes attempted yet. Generate an AI exam to test your skills!</p>`;
            return;
        }
        
        let html = '<div class="history-list">';
        scores.forEach(score => {
            const isExcellent = score.score >= 4;
            const emoji = getSubjectEmoji(score.subject);
            const dateObj = new Date(score.date);
            const formattedDate = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            
            html += `
                <div class="history-row" style="border-color: ${isExcellent ? 'rgba(0, 200, 83, 0.2)' : 'var(--slate-border)'}">
                    <div class="hist-left">
                        <span class="hist-emoji">${emoji}</span>
                        <div class="hist-details">
                            <span class="hist-subj">${score.subject}</span>
                            <span class="hist-date">Attempted: ${formattedDate}</span>
                        </div>
                    </div>
                    <div class="hist-right">
                        <span class="hist-score ${isExcellent ? 'pass' : 'fail'}">${score.score} / ${score.total}</span>
                        <span class="hist-badge ${isExcellent ? 'pass' : 'fail'}">${isExcellent ? 'Passed' : 'Review'}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    })
    .catch(err => {
        console.error("Quiz history error:", err);
        container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">Could not fetch score history.</p>`;
    });
}

function getSubjectEmoji(subj) {
    switch (subj) {
        case "Math": return "🧮";
        case "Science": return "🔬";
        case "English": return "📖";
        case "Social": return "🌍";
        default: return "💻";
    }
}

// --- Chat AI Doubt Solver Flow ---

function initChat() {
    updateChatPlaceholder();
}

function selectSubject(pill, subjectName) {
    document.querySelectorAll(".subject-pill").forEach(el => el.classList.remove("active"));
    pill.classList.add("active");
    currentSubject = subjectName;
    localStorage.setItem("currentSubject", subjectName);
    const label = document.getElementById("currentSubLabel");
    if (label) label.innerText = subjectName;
    updateChatPlaceholder();
}

function updateChatPlaceholder() {
    const chatInput = document.getElementById("chatInput");
    const example = document.getElementById("chatExampleText");
    const thinking = document.getElementById("thinkingLabel");
    
    if (chatInput) {
        chatInput.placeholder = isTeluguMode ? "ఇక్కడ మీ సందేహాన్ని అడగండి..." : "Ask your doubt here...";
    }
    if (thinking) {
        thinking.innerText = isTeluguMode ? "EduMind AI ఆలోచిస్తోంది..." : "EduMind AI is thinking...";
    }
    if (example) {
        if (isTeluguMode) {
            example.innerText = currentSubject === "Math" ? '"సమబాహు త్రిభుజం వైశాల్య సూత్రం ఏమిటి?"' : 
                                currentSubject === "Science" ? '"కిరణజన్య సంయోగక్రియ అంటే ఏమిటి?"' :
                                '"ఈ సబ్జెక్టులో ఏదైనా సందేహం అడగండి..."';
        } else {
            example.innerText = currentSubject === "Math" ? '"What is the formula for the area of a circle?"' :
                                currentSubject === "Science" ? '"Explain standard photosynthesis in simple terms"' :
                                '"Ask anything regarding this subject..."';
        }
    }
}

// ============================================================
// ON DEVICE AI — Auto Subject Detection using Transformers.js
// Runs 100% locally in browser — No API key needed!
// ============================================================

// Auto-switch subject pill based on local AI detection
async function autoDetectAndSwitchSubject(questionText) {
    try {
        // Check if local AI is ready (set by chat.html module script)
        if (!window.isLocalAIReady || !window.isLocalAIReady()) return;
        if (!window.detectSubjectLocally) return;

        const detected = await window.detectSubjectLocally(questionText);
        if (!detected) return;

        // Find matching pill and click it
        const pills = document.querySelectorAll(".subject-pill");
        pills.forEach(pill => {
            const pillText = pill.textContent.trim();
            if (pillText.includes(detected.subject)) {
                // Only switch if different from current
                if (currentSubject !== detected.subject) {
                    selectSubject(pill, detected.subject);
                }

                // Show info bar
                const bar = document.getElementById("ondeviceBar");
                const barText = document.getElementById("ondeviceBarText");
                if (bar && barText) {
                    barText.textContent = `🧠 On-Device AI detected: ${detected.subject} (${detected.confidence}% confidence) — ran locally, no API used!`;
                    bar.style.display = "flex";
                    // Auto hide after 5 seconds
                    setTimeout(() => { bar.style.display = "none"; }, 5000);
                }
            }
        });
    } catch(e) {
        console.warn("Auto subject detect skipped:", e);
    }
}

// Main submit function — now with On Device AI detection!
async function submitDoubt(event) {
    event.preventDefault();
    
    const input = document.getElementById("chatInput");
    const chatBox = document.getElementById("chatMessages");
    const loader = document.getElementById("chatLoader");
    
    if (!input || !chatBox || !loader) return;
    
    const question = input.value.trim();
    if (!question) return;
    
    // Hide placeholder
    const placeholder = document.getElementById("chatPlaceholder");
    if (placeholder) placeholder.style.display = "none";
    
    // Clear input immediately
    input.value = "";
    
    // Append Student bubble
    appendChatBubble("You", question, true);
    chatBox.scrollTop = chatBox.scrollHeight;

    // === ON DEVICE AI — Auto detect subject locally FIRST ===
    await autoDetectAndSwitchSubject(question);
    // ========================================================
    
    // Show AI Loader
    loader.style.display = "flex";
    
    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subject: currentSubject,
            question: question,
            is_telugu: isTeluguMode
        })
    })
    .then(res => res.json())
    .then(data => {
        loader.style.display = "none";
        appendChatBubble("EduMind AI ✨", data.response, false);
        chatBox.scrollTop = chatBox.scrollHeight;
    })
    .catch(err => {
        console.error("Chat API error:", err);
        loader.style.display = "none";
        appendChatBubble("EduMind AI ✨", "Connection error. Please try again later.", false);
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function appendChatBubble(sender, text, isStudent) {
    const chatBox = document.getElementById("chatMessages");
    if (!chatBox) return;
    
    const bubble = document.createElement("div");
    bubble.className = isStudent ? "bubble-student" : "bubble-ai";
    bubble.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    
    const header = document.createElement("div");
    header.className = "bubble-header";
    header.innerHTML = `<span>${sender}</span> <span>${isTeluguMode ? 'తెలుగు' : 'English'}</span>`;
    
    const body = document.createElement("div");
    body.className = "bubble-body";
    body.innerText = text;
    
    bubble.appendChild(header);
    bubble.appendChild(body);
    chatBox.appendChild(bubble);
}

// --- Quiz Generative Interaction Flow ---

function initQuizState() {
    const textBtn = document.getElementById("quizGenBtnText");
    if (textBtn) {
        textBtn.innerText = isTeluguMode ? "రైట్, క్విజ్ ప్రారంభించు! 🚀" : "Generate 5 MCQ Quiz 🚀";
    }
}

function updateQuizSetupUI(radioEl) {
    document.querySelectorAll(".setup-item").forEach(item => {
        item.classList.remove("active");
    });
    radioEl.closest(".setup-item").classList.add("active");
}

function selectDifficulty(btn, diff) {
    document.querySelectorAll(".diff-btn").forEach(el => el.classList.remove("active"));
    btn.classList.add("active");
    selectedDifficultyLevel = diff;
}

function startQuizGeneration() {
    const subjectRadio = document.querySelector('input[name="quizSubject"]:checked');
    const subject = subjectRadio ? subjectRadio.value : "Math";
    
    document.getElementById("quizStateConfig").style.display = "none";
    document.getElementById("quizStateLoading").style.display = "flex";
    
    const loadingTitle = document.getElementById("quizLoadingTitle");
    if (loadingTitle) {
        loadingTitle.innerText = isTeluguMode ? "మీ కోసం ప్రత్యేక క్విజ్ తయారు చేయబడుతోంది..." : "Gemini AI is generating your Quiz...";
    }
    
    fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subject: subject,
            difficulty: selectedDifficultyLevel,
            is_telugu: isTeluguMode
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.questions && data.questions.length > 0) {
            activeQuizQuestions = data.questions;
            activeQuizIndex = 0;
            activeQuizScore = 0;
            
            document.getElementById("quizStateLoading").style.display = "none";
            document.getElementById("quizStateActive").style.display = "block";
            
            renderQuizQuestion();
        } else {
            alert("Failed to generate quiz. Please try again.");
            resetQuiz();
        }
    })
    .catch(err => {
        console.error("Quiz generate error:", err);
        alert("Server communication error. Try again.");
        resetQuiz();
    });
}

function renderQuizQuestion() {
    const question = activeQuizQuestions[activeQuizIndex];
    activeQuizSelectedOption = null;
    
    document.getElementById("quizProgressText").innerText = `Question ${activeQuizIndex + 1} of ${activeQuizQuestions.length}`;
    document.getElementById("quizRunningScore").innerText = `Score: ${activeQuizScore}/${activeQuizQuestions.length}`;
    
    const pct = ((activeQuizIndex + 1) / activeQuizQuestions.length) * 100;
    document.getElementById("quizProgressBar").style.width = `${pct}%`;
    
    document.getElementById("questionText").innerText = question.question;
    
    const container = document.getElementById("optionsContainer");
    container.innerHTML = "";
    
    question.options.forEach((optText, index) => {
        const div = document.createElement("div");
        div.className = "option-row";
        div.innerText = optText;
        div.setAttribute("onclick", `selectQuizOption(${index})`);
        container.appendChild(div);
    });
    
    document.getElementById("explanationPanel").style.display = "none";
}

function selectQuizOption(optIdx) {
    if (activeQuizSelectedOption !== null) return;
    activeQuizSelectedOption = optIdx;
    
    const question = activeQuizQuestions[activeQuizIndex];
    const isCorrect = (optIdx === question.correctIndex);
    
    if (isCorrect) activeQuizScore++;
    
    const rows = document.querySelectorAll(".option-row");
    rows.forEach((row, idx) => {
        row.classList.add("disabled");
        if (idx === question.correctIndex) {
            row.classList.add("correct");
            row.innerHTML = "✅ " + row.innerText;
        } else if (idx === optIdx && !isCorrect) {
            row.classList.add("incorrect");
            row.innerHTML = "❌ " + row.innerText;
        }
    });
    
    const explPanel = document.getElementById("explanationPanel");
    const explDesc = document.getElementById("explanationDesc");
    const nextBtnText = document.getElementById("nextQuestionBtn").querySelector("span");
    
    if (explPanel && explDesc) {
        explDesc.innerText = question.explanation;
        explPanel.style.display = "block";
        
        const isLast = (activeQuizIndex === activeQuizQuestions.length - 1);
        nextBtnText.innerHTML = isLast ? 
            (isTeluguMode ? "స్కోర్ చూడండి 📊" : "See Final Score 📊") : 
            "Next Question <i class='fa-solid fa-arrow-right'></i>";
    }
}

function nextQuestion() {
    activeQuizIndex++;
    if (activeQuizIndex < activeQuizQuestions.length) {
        renderQuizQuestion();
    } else {
        showQuizResults();
    }
}

function showQuizResults() {
    const subjectRadio = document.querySelector('input[name="quizSubject"]:checked');
    const subject = subjectRadio ? subjectRadio.value : "Math";
    
    fetch('/api/quiz/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subject: subject,
            score: activeQuizScore,
            total: activeQuizQuestions.length
        })
    }).catch(err => console.error("Error saving score history:", err));
    
    document.getElementById("quizStateActive").style.display = "none";
    document.getElementById("quizStateResult").style.display = "block";
    
    const pct = (activeQuizScore / activeQuizQuestions.length) * 100;
    
    document.getElementById("resultScoreFraction").innerText = `${activeQuizScore} / ${activeQuizQuestions.length}`;
    document.getElementById("resultScorePercentage").innerText = `${pct.toFixed(0)}% Score`;
    
    const title = document.getElementById("resultTitle");
    const desc = document.getElementById("resultDesc");
    const retryBtn = document.getElementById("quizRetryText");
    
    if (retryBtn) {
        retryBtn.innerText = isTeluguMode ? "మరొక క్విజ్ రాయండి 🔄" : "Try Another Quiz 🔄";
    }
    
    const isPass = activeQuizScore >= 3;
    const circle = document.getElementById("resultCircle");
    
    if (isPass) {
        circle.style.borderColor = "var(--soft-green)";
        circle.style.background = "radial-gradient(rgba(0, 200, 83, 0.15), transparent)";
        if (activeQuizScore === 5) {
            title.innerText = isTeluguMode ? "అద్భుతం! శభాష్! 🏆" : "Perfect Score! Master! 🏆";
            desc.innerText = "You answered all questions correctly! Your concepts are extremely clear.";
        } else {
            title.innerText = isTeluguMode ? "చాలా మంచి ప్రయత్నం! 🌟" : "Great Job! Well Done! 🌟";
            desc.innerText = "You did very well! Keep reviewing and you will score 100% next time.";
        }
    } else {
        circle.style.borderColor = "var(--accent-yellow)";
        circle.style.background = "radial-gradient(rgba(255, 214, 0, 0.15), transparent)";
        title.innerText = isTeluguMode ? "మరలా ప్రయత్నించు! 💪" : "Keep Practicing! Don't Give Up! 💪";
        desc.innerText = "Don't worry, mistakes are part of learning. Solve your doubts in AI Chat and try again!";
    }
}

function resetQuiz() {
    document.getElementById("quizStateResult").style.display = "none";
    document.getElementById("quizStateActive").style.display = "none";
    document.getElementById("quizStateLoading").style.display = "none";
    document.getElementById("quizStateConfig").style.display = "block";
    initQuizState();
}

// --- Study Planner Flow ---

function initPlannerState() {
    const planBtn = document.getElementById("planGenBtnText");
    if (planBtn) {
        planBtn.innerText = isTeluguMode ? "AI తో ప్లాన్ తయారు చెయ్యి 📅" : "Generate Study Planner 🚀";
    }
    
    fetch('/api/planner/latest')
    .then(res => res.json())
    .then(data => {
        if (!data.no_plan) {
            renderActivePlanner(data);
        }
    });
}

function toggleSubjectChip(chip, subject) {
    if (chip.classList.contains("active")) {
        chip.classList.remove("active");
        selectedPlannerSubjects = selectedPlannerSubjects.filter(s => s !== subject);
    } else {
        chip.classList.add("active");
        selectedPlannerSubjects.push(subject);
    }
}

function generatePlanner(event) {
    event.preventDefault();
    
    const examNameInput = document.getElementById("examName");
    const examDateInput = document.getElementById("examDate");
    const errorDiv = document.getElementById("plannerFormError");
    
    if (!examNameInput || !examDateInput) return;
    
    const examName = examNameInput.value.trim();
    const examDate = examDateInput.value.trim();
    
    if (!examName || !examDate) {
        if (errorDiv) errorDiv.innerText = "Please fill in all details.";
        return;
    }
    
    if (selectedPlannerSubjects.length === 0) {
        if (errorDiv) errorDiv.innerText = "Please select at least one subject to study.";
        return;
    }
    
    if (errorDiv) errorDiv.innerText = "";
    
    document.getElementById("plannerStateForm").style.display = "none";
    document.getElementById("plannerStateLoading").style.display = "flex";
    
    const loaderTitle = document.getElementById("plannerLoadingTitle");
    if (loaderTitle) {
        loaderTitle.innerText = isTeluguMode ? "మీ పరీక్షల ప్లాన్ తయారు చేయబడుతోంది..." : "Creating your day-by-day study schedule...";
    }
    
    fetch('/api/planner/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            exam_name: examName,
            exam_date: examDate,
            subjects: selectedPlannerSubjects
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.days && data.days.length > 0) {
            data.days.forEach(day => {
                day.topics = day.topics.map(t => {
                    return typeof t === 'string' ? { text: t, isDone: false } : t;
                });
            });
            
            fetch('/api/planner/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exam_name: data.exam_name,
                    exam_date: examDate,
                    subjects: selectedPlannerSubjects.join(', '),
                    plan_json: JSON.stringify(data)
                })
            })
            .then(() => {
                document.getElementById("plannerStateLoading").style.display = "none";
                renderActivePlanner(data);
            });
        } else {
            alert("Failed to generate plan. Please try again.");
            backToPlannerForm();
        }
    })
    .catch(err => {
        console.error("Planner API error:", err);
        alert("Connection lost. Try again.");
        backToPlannerForm();
    });
}

function renderActivePlanner(planData) {
    document.getElementById("plannerStateForm").style.display = "none";
    document.getElementById("plannerStateLoading").style.display = "none";
    document.getElementById("plannerStateActive").style.display = "block";
    
    document.getElementById("activePlanTitle").innerText = `📅 ${planData.exam_name}`;
    
    const container = document.getElementById("dayCardsList");
    container.innerHTML = "";
    
    planData.days.forEach((day, dIdx) => {
        const allCompleted = day.topics.every(t => t.isDone);
        
        const card = document.createElement("div");
        card.className = `day-card ${allCompleted ? 'completed' : ''}`;
        
        let html = `
            <div class="day-card-header">
                <div class="day-card-title-row">
                    <span class="day-title">${day.day}</span>
                    ${allCompleted ? '<span class="day-complete-badge">Completed ✓</span>' : ''}
                </div>
                <span class="day-time-badge">⏳ ${day.study_time}</span>
            </div>
            <p class="day-focus">Focus Subject: ${day.focus_subject}</p>
            <div class="day-card-checklist mt-3">
        `;
        
        day.topics.forEach((topic, tIdx) => {
            const isChecked = topic.isDone;
            html += `
                <div class="checklist-item" style="border-bottom-color: rgba(255,255,255,0.02)">
                    <div class="checklist-cb ${isChecked ? 'checked' : ''}" onclick="togglePlannerTopic(${dIdx}, ${tIdx}, ${isChecked})">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <span class="checklist-text ${isChecked ? 'checked' : ''}">${topic.text}</span>
                </div>
            `;
        });
        
        html += `</div>`;
        card.innerHTML = html;
        container.appendChild(card);
    });
}

function togglePlannerTopic(dayIdx, topicIdx, currentStatus) {
    fetch('/api/planner/latest')
    .then(res => res.json())
    .then(data => {
        if (!data || !data.days) return;
        data.days[dayIdx].topics[topicIdx].isDone = !currentStatus;
        
        fetch('/api/planner/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exam_name: data.exam_name,
                exam_date: '',
                subjects: '',
                plan_json: JSON.stringify(data)
            })
        })
        .then(() => { renderActivePlanner(data); });
    });
}

function backToPlannerForm() {
    document.getElementById("plannerStateActive").style.display = "none";
    document.getElementById("plannerStateLoading").style.display = "none";
    document.getElementById("plannerStateForm").style.display = "block";
    document.querySelectorAll(".subject-chip").forEach(c => c.classList.remove("active"));
    selectedPlannerSubjects = [];
}
