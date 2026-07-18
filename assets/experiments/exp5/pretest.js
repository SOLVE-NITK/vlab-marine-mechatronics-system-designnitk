let allQuestions = [];
let currentQuestions = [];

(function () {
  const quizContainer = document.getElementById("quiz");
  const resultsContainer = document.getElementById("results");
  const submitButton = document.getElementById("submit");
  // -----------------------------
  // MESSAGE BELOW SUBMIT BUTTON
  // -----------------------------
  const messageContainer = document.createElement("div");
  messageContainer.id = "quiz-message";
  messageContainer.style.marginTop = "10px";
  messageContainer.style.color = "red";
  messageContainer.style.fontWeight = "600";

  submitButton.insertAdjacentElement(
    "afterend",
    messageContainer
  );
  // -----------------------------
  // RANDOM QUESTION FUNCTIONS
  // -----------------------------
  function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
  }
  function getRandomQuestions(questions) {

    const grouped = {
      beginner: [],
      intermediate: [],
      advanced: []
    };
    questions.forEach(q => {
      if (grouped[q.difficulty]) {
        grouped[q.difficulty].push(q);
      }
    });
    // Shuffle questions inside difficulty groups
    Object.keys(grouped).forEach(level => {
      grouped[level] = shuffle(grouped[level]);
    });
    let selected = [];
    // Maximum 2 questions from each difficulty
    selected.push(
      ...grouped.beginner.slice(0, 2)
    );
    selected.push(
      ...grouped.advanced.slice(0, 2)
    );
    selected.push(
      ...grouped.intermediate.slice(0, 1)
    );
    // Shuffle final questions
    return shuffle(selected);
  }
  // -----------------------------
  // CREATE DIFFICULTY FILTER UI
  // -----------------------------
  const filterContainer = document.createElement("div");
  filterContainer.style.marginBottom = "15px";
  quizContainer.parentNode.insertBefore(
    filterContainer,
    quizContainer
  );
  // -----------------------------
  // CREATE AVAILABLE DIFFICULTY FILTERS
  // -----------------------------
  function createDifficultyFilters(questions) {
    const difficulties = [
      ...new Set(
        questions.map(q => q.difficulty)
      )
    ];
    let html = `
      <hr style="
        margin:10px 0;
        border:0;
        border-top:1px solid #ddd;
      ">
      <strong>
        Choose difficulty:
      </strong>
    `;
    const labels = {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced"
    };
    difficulties.forEach(level => {
      html += `
        <label style="
          margin-left:15px;
          font-size:18px;
          font-weight:750;
        ">
          <input
            type="checkbox"
            class="difficulty-filter"
            value="${level}"
            checked
          >
          ${labels[level] || level}
        </label>
      `;
    });
    html += `
      <hr style="
        margin:10px 0;
        border:0;
        border-top:1px solid #ddd;
      ">
    `;
    filterContainer.innerHTML = html;
  }
  // -----------------------------
// LOAD QUIZ DATA
// -----------------------------
function loadQuiz() {
  fetch("experiment/pretest.json")
    .then(res => res.json())
    .then(data => {
      allQuestions = data.questions;
      createDifficultyFilters(allQuestions);
      // Select only 5 random questions
      // with difficulty distribution:
      // Beginner: 2
      // Advanced: 2
      // Intermediate: 1
      currentQuestions =
        getRandomQuestions(allQuestions);
      renderQuiz(currentQuestions);
    });
}
// -----------------------------
// RENDER QUIZ
// -----------------------------
function renderQuiz(questions) {
  currentQuestions = questions;
  quizContainer.innerHTML = "";
  questions.forEach((d, i) => {
    let html = `
      <div class="question" 
           style="margin-bottom:8px;">
        ${i + 1}. ${d.question}
      </div>
      <hr style="
        margin:10px 0;
        border:0;
      ">
      <div class="answers">
    `;
    for (let letter in d.answers) {
      html += `
        <div class="option"
             style="margin-bottom:12px;">
          <label>
            <input
              type="radio"
              name="question${i}"
              value="${letter}"
            >
            ${letter} :
            ${d.answers[letter]}
          </label>
          <button
            type="button"
            class="exp-btn"
            id="btn-${i}-${letter}"
            style="
              display:none;
              margin:6px 0 4px 24px;
              padding:0;
              background:transparent;
              border:none;
              outline:none;
              box-shadow:none;
              color:#0d6efd;
              text-decoration:underline;
              font-size:14px;
              font-weight:500;
              cursor:pointer;
            "
          >
            Explanation
          </button>
          <div
            class="explanation"
            id="exp-${i}-${letter}"
            style="
              display:none;
              margin:6px 0 8px 18px;
              padding:8px;
              background:#f4f4f4;
              border-left:4px solid #2196f3;
              font-size:14px;
              color:#444;
            "
          >
            ${d.explanations[letter] || ""}
          </div>
        </div>
      `;
    }
   html += `
      </div>
    `;
quizContainer.insertAdjacentHTML(
      "beforeend",
      html
    );
  });
}
// -----------------------------
// EXPLANATION BUTTON EVENTS
// -----------------------------
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("exp-btn")) {
    const id = e.target.id;
    const parts = id.split("-");
    const questionIndex = parts[1];
    const letter = parts[2];
    const explanation =
      document.getElementById(
        `exp-${questionIndex}-${letter}`
      );
    if (explanation) {
      explanation.style.display = "block";
    }
    e.target.style.display = "none";
    e.target.blur();
  }
});
// -----------------------------
// APPLY DIFFICULTY FILTER
// -----------------------------
function applyFilter() {
  const checked = Array.from(
    document.querySelectorAll(
      ".difficulty-filter:checked"
    )
  )
  .map(cb => cb.value);
  if (checked.length === 0) {
    currentQuestions = [];
    quizContainer.innerHTML = "";
    resultsContainer.innerHTML = "";
    messageContainer.innerHTML = "";
    return;
  }
  const filtered =
    allQuestions.filter(q =>
      checked.includes(q.difficulty)
    );
  // Generate a fresh random set of 5 questions
  currentQuestions =
    getRandomQuestions(filtered);
  renderQuiz(currentQuestions);
  resultsContainer.innerHTML = "";
  messageContainer.innerHTML = "";
}
// -----------------------------
// LISTEN FOR FILTER CHANGES
// -----------------------------
document.addEventListener(
  "change",
  function (e) {
    if (
      e.target.classList.contains(
        "difficulty-filter"
      )
    ) {
      applyFilter();
    }
  }
);
// -----------------------------
// SHOW RESULTS
// -----------------------------
function showResults() {
  messageContainer.innerHTML = "";
  if (currentQuestions.length === 0) {
    resultsContainer.innerHTML = "";
    return;
  }
  const answerContainers =
    quizContainer.querySelectorAll(
      ".answers"
    );
  let numCorrect = 0;
  let answeredQuestions = 0;
  answerContainers.forEach(
    (answerContainer, i) => {
      const selected =
        answerContainer.querySelector(
          "input:checked"
        );
      // Reset old styles
      answerContainer
        .querySelectorAll("label")
        .forEach(label => {
          label.style.color = "";
          label.style.fontWeight = "normal";
        });
      answerContainer
        .querySelectorAll(".exp-btn")
        .forEach(btn => {
          btn.style.display = "none";
        });
      answerContainer
        .querySelectorAll(".explanation")
        .forEach(exp => {
          exp.style.display = "none";
        });
      // Skip unanswered questions
      if (!selected) {
        return;
      }
      answeredQuestions++;
      const selectedLabel =
        selected.parentElement;
      const questionData =
        currentQuestions[i];
      if (!questionData) {
        return;
      }
      // Correct answer
      if (
        selected.value ===
        questionData.correctAnswer
      ) {
        numCorrect++;
        selectedLabel.style.color =
          "green";
        selectedLabel.style.fontWeight =
          "bold";
        // Show explanation buttons
        for (
          let letter in questionData.answers
        ) {
          const btn =
            document.getElementById(
              `btn-${i}-${letter}`
            );
          if (btn) {
            btn.style.display =
              "inline-block";
          }
        }
      } else {
        // Wrong answer
        selectedLabel.style.color =
          "red";
        selectedLabel.style.fontWeight =
          "bold";
        const btn =
          document.getElementById(
            `btn-${i}-${selected.value}`
          );
        if (btn) {
          btn.style.display ="inline-block";
        }
      }
    }
  );
// -----------------------------
// VALIDATE EMPTY SUBMISSION
// -----------------------------
if (answeredQuestions === 0) {
  resultsContainer.innerHTML = "";
  messageContainer.innerHTML ="Please select the answers before submitting the quiz.";
  return;
}
// -----------------------------
// DISPLAY SCORE
// -----------------------------
resultsContainer.innerHTML =
  `${numCorrect} out of ${currentQuestions.length}`;
}
// -----------------------------
// INITIALIZE QUIZ
// -----------------------------
loadQuiz();
submitButton.addEventListener("click",showResults);
})();