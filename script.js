const page = document.body.dataset.page;
const params = new URLSearchParams(window.location.search);

let subjects = [];
let subject = null;
let activeQuiz = null;

function storageKey(subjectId) {
  return `alevel-revision:${subjectId}`;
}

function getStats(subjectId) {
  const raw = localStorage.getItem(storageKey(subjectId));
  if (raw) return JSON.parse(raw);
  return {
    answered: 0,
    correct: 0,
    topics: {},
    wrong: [],
    paperMarks: {},
    history: [],
  };
}

function saveStats(subjectId, stats) {
  localStorage.setItem(storageKey(subjectId), JSON.stringify(stats));
}

function percent(correct, total) {
  if (!total) return null;
  return Math.round((correct / total) * 100);
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function formatPercent(value) {
  return value === null ? "--%" : `${value}%`;
}

function makeSubjectUrl(id) {
  return `subject.html?subject=${encodeURIComponent(id)}`;
}

function makeTopicUrl(subjectId, topicId) {
  return `topic.html?subject=${encodeURIComponent(subjectId)}&topic=${encodeURIComponent(topicId)}`;
}

function getSubject(id) {
  return subjects.find((entry) => entry.id === id);
}

function getTopic(topicId) {
  return subject.topics.find((topic) => topic.id === topicId);
}

function topicAccuracy(stats, topicId) {
  const entry = stats.topics[topicId];
  return percent(entry?.correct || 0, entry?.answered || 0);
}

function estimatedTopicScore(stats, topicId) {
  const accuracy = topicAccuracy(stats, topicId);
  return accuracy === null ? 0.55 : accuracy / 100;
}

function predictPaperMark(stats, paper) {
  const totalWeight = Object.values(paper.topicWeights).reduce((sum, value) => sum + value, 0);
  const weighted = Object.entries(paper.topicWeights).reduce((sum, [topicId, weight]) => {
    return sum + estimatedTopicScore(stats, topicId) * weight;
  }, 0);
  return Math.round((weighted / totalWeight) * paper.max);
}

function predictTotal(stats) {
  return subject.papers.reduce((sum, paper) => {
    const override = Number(stats.paperMarks[paper.id]);
    return sum + (Number.isFinite(override) && override > 0 ? override : predictPaperMark(stats, paper));
  }, 0);
}

function gradeFromMark(mark) {
  const grades = Object.entries(subject.boundaries.grades).sort((a, b) => b[1] - a[1]);
  return grades.find(([, boundary]) => mark >= boundary)?.[0] || "U";
}

function topicPerformanceRows(stats) {
  return subject.topics.map((topic) => {
    const entry = stats.topics[topic.id] || { answered: 0, correct: 0 };
    return {
      topic,
      answered: entry.answered,
      correct: entry.correct,
      accuracy: percent(entry.correct, entry.answered),
    };
  });
}

function renderRevisionInsights(stats) {
  const rows = topicPerformanceRows(stats);
  const attempted = rows.filter((entry) => entry.answered > 0);
  const weak = attempted
    .filter((entry) => entry.answered >= 2)
    .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0))
    .slice(0, 3);
  const strong = attempted
    .filter((entry) => entry.answered >= 2)
    .sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0))
    .slice(0, 3);
  const paperRows = subject.papers.map((paper) => {
    const predicted = predictPaperMark(stats, paper);
    return `<li><strong>${paper.name}</strong><span>${predicted}/${paper.max}</span></li>`;
  }).join("");

  return `
    <div class="insight-grid">
      <article class="insight-card">
        <p class="kicker">revise first</p>
        ${weak.length ? weak.map((entry) => `<p><strong>${entry.topic.name}</strong> ${formatPercent(entry.accuracy)} from ${entry.answered} questions</p>`).join("") : `<p class="muted">Answer a few more questions and this will lock onto your weak spots.</p>`}
      </article>
      <article class="insight-card">
        <p class="kicker">strongest topics</p>
        ${strong.length ? strong.map((entry) => `<p><strong>${entry.topic.name}</strong> ${formatPercent(entry.accuracy)} from ${entry.answered} questions</p>`).join("") : `<p class="muted">No strong-topic pattern yet.</p>`}
      </article>
      <article class="insight-card">
        <p class="kicker">paper prediction</p>
        <ul>${paperRows}</ul>
        <p class="muted">Predicted from your topic accuracy and the paper weighting model.</p>
      </article>
    </div>
  `;
}

function questionTemplates(topic) {
  const key = topic.keywords[0] || topic.name;
  const keyTwo = topic.keywords[1] || topic.name;
  return [
    {
      prompt: `Which statement best describes ${key} in ${topic.name}?`,
      options: [
        `${key} is a central idea that must be applied to context`,
        `${key} is only useful in coursework and not exams`,
        `${key} should be named but never explained`,
        `${key} is unrelated to ${topic.name}`,
      ],
      answer: 0,
      explanation: `The strongest answer explains ${key} and applies it to the specific question, rather than just naming it.`,
    },
    {
      prompt: `In an exam answer on ${topic.name}, what is the best use of ${keyTwo}?`,
      options: [
        "Use it as evidence inside a clear line of argument",
        "Put it in the conclusion only",
        "Use it as a random keyword with no explanation",
        "Avoid it because specification terms lose marks",
      ],
      answer: 0,
      explanation: `${keyTwo} should support the argument and be linked to the command word.`,
    },
    {
      prompt: `A student writes a paragraph on ${topic.name} but gives no judgement. What is the main weakness?`,
      options: [
        "The paragraph may describe content without answering the question fully",
        "The answer will automatically be too short",
        "The answer cannot include examples",
        "The answer becomes too specific",
      ],
      answer: 0,
      explanation: `Most A Level answers need explanation and judgement, especially when the command word asks you to assess or evaluate.`,
    },
    {
      prompt: `What should you do first when a question mentions ${topic.name}?`,
      options: [
        "Identify the command word, topic focus and marks available",
        "Write every fact you know immediately",
        "Skip planning because it wastes time",
        "Only define the first keyword",
      ],
      answer: 0,
      explanation: `Command word, focus and marks tell you how much depth, application and evaluation are needed.`,
    },
    {
      prompt: `Which revision method is most useful for ${topic.name}?`,
      options: [
        "Practising exam-style application and checking explanations",
        "Only rereading notes passively",
        "Memorising headings with no examples",
        "Avoiding timed practice until the final week",
      ],
      answer: 0,
      explanation: `Application and feedback expose weak understanding faster than passive rereading.`,
    }
  ];
}

function generateQuestions(topicIds, count, mode = "practice") {
  const topicPool = topicIds.map(getTopic).filter(Boolean);
  const questions = [];
  let index = 0;
  while (questions.length < count) {
    const topic = topicPool[index % topicPool.length];
    const template = questionTemplates(topic)[Math.floor(index / topicPool.length) % questionTemplates(topic).length];
    const options = shuffle(template.options.map((text, originalIndex) => ({ text, originalIndex })));
    questions.push({
      id: `${mode}-${topic.id}-${index}`,
      topicId: topic.id,
      paperId: topic.paper,
      prompt: template.prompt,
      options: options.map((option) => option.text),
      answer: options.findIndex((option) => option.originalIndex === template.answer),
      explanation: template.explanation,
    });
    index += 1;
  }
  return shuffle(questions);
}

function renderHome() {
  const grid = document.querySelector("#subject-grid");
  grid.replaceChildren(
    ...subjects.map((entry) => {
      const stats = getStats(entry.id);
      const card = document.createElement("a");
      card.className = "card subject-card";
      card.href = makeSubjectUrl(entry.id);
      card.innerHTML = `
        <p class="kicker">${entry.board}</p>
        <h2>${entry.name}</h2>
        <p>${entry.tagline}</p>
        <p>${stats.answered} questions answered</p>
      `;
      return card;
    }),
  );
}

function renderSubjectHero() {
  document.title = `${subject.name} | A Level Revision`;
  document.querySelector("#subject-hero").innerHTML = `
    <p class="kicker">${subject.board}</p>
    <h1>${subject.name}</h1>
    <p class="lede">${subject.tagline}</p>
  `;
}

function renderTopicGrid() {
  document.querySelector("#topic-grid").replaceChildren(
    ...subject.topics.map((topic) => {
      const card = document.createElement("a");
      card.className = "topic-card";
      card.href = makeTopicUrl(subject.id, topic.id);
      card.innerHTML = `
        <p class="kicker">${subject.papers.find((paper) => paper.id === topic.paper)?.name || "topic"}</p>
        <h3>${topic.name}</h3>
        <p>${topic.notes[0]}</p>
      `;
      return card;
    }),
  );
}

function renderTopStats() {
  const stats = getStats(subject.id);
  const weakest = subject.topics
    .map((topic) => ({ topic, accuracy: topicAccuracy(stats, topic.id), answered: stats.topics[topic.id]?.answered || 0 }))
    .filter((entry) => entry.answered > 0)
    .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0))[0];
  document.querySelector("#stat-answered").textContent = stats.answered;
  document.querySelector("#stat-accuracy").textContent = formatPercent(percent(stats.correct, stats.answered));
  document.querySelector("#stat-weakest").textContent = weakest?.topic.name || "--";
}

function renderPracticeBuilder() {
  document.querySelector("#practice-topics").replaceChildren(
    ...subject.topics.map((topic) => {
      const label = document.createElement("label");
      label.className = "topic-check";
      label.innerHTML = `<input type="checkbox" value="${topic.id}" checked /> ${topic.name}`;
      return label;
    }),
  );
}

function quizMarkup(questions, zoneId, title) {
  const zone = document.querySelector(zoneId);
  activeQuiz = { zoneId, questions, answers: new Array(questions.length).fill(null), title };
  zone.innerHTML = `
    <div class="result-box">
      <strong>${title}</strong>
      <p class="muted">${questions.length} questions. Answer them all, then submit.</p>
    </div>
    ${questions.map((question, index) => `
      <article class="question-card">
        <p class="kicker">${index + 1}. ${getTopic(question.topicId).name}</p>
        <h3>${question.prompt}</h3>
        <div class="options">
          ${question.options.map((option, optionIndex) => `
            <label class="option">
              <input type="radio" name="${zoneId}-${index}" data-question="${index}" data-option="${optionIndex}" />
              <span>${option}</span>
            </label>
          `).join("")}
        </div>
      </article>
    `).join("")}
    <button class="button button-light submit-quiz" type="button">Submit Quiz</button>
  `;

  zone.querySelectorAll("[data-question]").forEach((input) => {
    input.addEventListener("change", () => {
      activeQuiz.answers[Number(input.dataset.question)] = Number(input.dataset.option);
    });
  });
  zone.querySelector(".submit-quiz").addEventListener("click", submitQuiz);
}

function submitQuiz() {
  if (!activeQuiz) return;
  const stats = getStats(subject.id);
  let correct = 0;
  const wrong = [];

  activeQuiz.questions.forEach((question, index) => {
    const answer = activeQuiz.answers[index];
    const isCorrect = answer === question.answer;
    if (isCorrect) correct += 1;
    const topicEntry = stats.topics[question.topicId] || { answered: 0, correct: 0 };
    topicEntry.answered += 1;
    if (isCorrect) topicEntry.correct += 1;
    stats.topics[question.topicId] = topicEntry;
    stats.answered += 1;
    if (isCorrect) stats.correct += 1;
    if (!isCorrect) {
      wrong.push({ ...question, selected: answer });
      stats.wrong.unshift({
        prompt: question.prompt,
        topicId: question.topicId,
        explanation: question.explanation,
        when: new Date().toISOString(),
      });
    }
  });

  stats.wrong = stats.wrong.slice(0, 40);
  stats.history.unshift({
    title: activeQuiz.title,
    correct,
    total: activeQuiz.questions.length,
    when: new Date().toISOString(),
  });
  stats.history = stats.history.slice(0, 30);
  saveStats(subject.id, stats);

  const zone = document.querySelector(activeQuiz.zoneId);
  zone.innerHTML = `
    <div class="result-box">
      <p class="kicker">results</p>
      <h3>${correct}/${activeQuiz.questions.length} correct (${formatPercent(percent(correct, activeQuiz.questions.length))})</h3>
      <p class="muted">${wrong.length ? "Review the explanations below, then check your stats dashboard." : "Clean sweep. Extremely suspicious."}</p>
    </div>
    ${renderRevisionInsights(stats)}
    ${wrong.map((question) => `
      <article class="question-card">
        <p class="kicker">${getTopic(question.topicId).name}</p>
        <h3>${question.prompt}</h3>
        <p class="explanation"><strong>Correct answer:</strong> ${question.options[question.answer]}</p>
        <p class="explanation">${question.explanation}</p>
      </article>
    `).join("")}
  `;
  activeQuiz = null;
  renderAllSubjectStats();
}

function renderStatsDashboard() {
  const stats = getStats(subject.id);
  document.querySelector("#stats-grid").replaceChildren(
    ...subject.topics.map((topic) => {
      const entry = stats.topics[topic.id] || { answered: 0, correct: 0 };
      const card = document.createElement("article");
      card.className = "topic-stat";
      card.innerHTML = `
        <p class="kicker">${topic.name}</p>
        <strong>${formatPercent(percent(entry.correct, entry.answered))}</strong>
        <p class="muted">${entry.correct}/${entry.answered} correct</p>
      `;
      return card;
    }),
  );
  document.querySelector("#wrong-log").innerHTML = `
    <p class="kicker">recent wrong answers</p>
    ${stats.wrong.slice(0, 10).map((item) => `
      <div class="wrong-item">
        <strong>${getTopic(item.topicId)?.name || "Topic"}</strong>
        <p>${item.prompt}</p>
        <p>${item.explanation}</p>
      </div>
    `).join("") || `<p class="muted">No wrong answers logged yet.</p>`}
  `;
}

function renderPredictor() {
  const stats = getStats(subject.id);
  document.querySelector("#paper-predictions").replaceChildren(
    ...subject.papers.map((paper) => {
      const predicted = predictPaperMark(stats, paper);
      const override = Number(stats.paperMarks[paper.id]);
      const card = document.createElement("article");
      card.className = "paper-card";
      card.innerHTML = `
        <p class="kicker">${paper.name}</p>
        <strong>${Number.isFinite(override) && override > 0 ? override : predicted}/${paper.max}</strong>
        <p class="muted">${Number.isFinite(override) && override > 0 ? "using your entered mark" : "predicted from topic stats"}</p>
      `;
      return card;
    }),
  );
  document.querySelector("#manual-marks").replaceChildren(
    ...subject.papers.map((paper) => {
      const label = document.createElement("label");
      label.className = "paper-card";
      label.innerHTML = `
        <p class="kicker">${paper.name}</p>
        <input type="number" min="0" max="${paper.max}" value="${stats.paperMarks[paper.id] || ""}" placeholder="Enter mark after exam" />
      `;
      label.querySelector("input").addEventListener("input", (event) => {
        stats.paperMarks[paper.id] = Number(event.target.value || 0);
        saveStats(subject.id, stats);
        renderPredictor();
      });
      return label;
    }),
  );
  const total = predictTotal(stats);
  const max = subject.papers.reduce((sum, paper) => sum + paper.max, 0);
  document.querySelector("#grade-output").innerHTML = `
    <p class="kicker">estimated final result</p>
    <h3>${total}/${max} - Grade ${gradeFromMark(total)}</h3>
    <p class="muted">Prediction uses your quiz performance by topic, paper weighting and any marks you manually enter after sitting papers.</p>
  `;
}

function renderBank(query = "") {
  const needle = query.trim().toLowerCase();
  const results = subject.topics.filter((topic) => {
    const haystack = `${topic.name} ${topic.keywords.join(" ")} ${topic.notes.join(" ")}`.toLowerCase();
    return !needle || haystack.includes(needle);
  });
  document.querySelector("#bank-results").replaceChildren(
    ...results.map((topic) => {
      const card = document.createElement("article");
      card.className = "bank-card";
      card.innerHTML = `
        <h3>${topic.name}</h3>
        <p>${topic.notes.join(" ")}</p>
        <ul>${topic.keywords.map((keyword) => `<li>${keyword}</li>`).join("")}</ul>
        <a class="button button-dark" href="${makeTopicUrl(subject.id, topic.id)}">Open Topic</a>
      `;
      return card;
    }),
  );
}

function renderBoundaries() {
  const max = subject.papers.reduce((sum, paper) => sum + paper.max, 0);
  document.querySelector("#boundary-table").innerHTML = `
    <p class="muted">${subject.boundaries.source}</p>
    <table class="boundary-table">
      <thead><tr><th>Grade</th><th>Minimum total</th><th>Percentage</th></tr></thead>
      <tbody>${Object.entries(subject.boundaries.grades).map(([grade, mark]) => `
        <tr><td>${grade}</td><td>${mark}/${max}</td><td>${Math.round((mark / max) * 100)}%</td></tr>
      `).join("")}</tbody>
    </table>
  `;

  const tool = document.querySelector("#boundary-tool");
  const defaultGrade = "A";
  tool.innerHTML = `
    <label class="boundary-card">
      <p class="kicker">target grade</p>
      <select id="target-grade">${Object.keys(subject.boundaries.grades).map((grade) => `<option value="${grade}" ${grade === defaultGrade ? "selected" : ""}>${grade}</option>`).join("")}</select>
    </label>
    <div id="boundary-sliders"></div>
    <div class="result-box" id="boundary-result"></div>
  `;
  const sliders = document.querySelector("#boundary-sliders");
  sliders.innerHTML = subject.papers.map((paper) => `
    <div class="slider-row">
      <strong>${paper.name}</strong>
      <input type="range" min="0" max="${paper.max}" value="${Math.round(subject.boundaries.grades[defaultGrade] / subject.papers.length)}" data-paper="${paper.id}" />
      <span data-value="${paper.id}"></span>
    </div>
  `).join("");

  function updateSliders(changedInput = null) {
    const grade = document.querySelector("#target-grade").value;
    const target = subject.boundaries.grades[grade];
    const inputs = [...sliders.querySelectorAll("input")];
    if (changedInput) changedInput.dataset.touched = "true";
    const touched = inputs.filter((input) => input.dataset.touched === "true");
    const untouched = inputs.filter((input) => input.dataset.touched !== "true");
    const touchedTotal = touched.reduce((sum, input) => sum + Number(input.value), 0);
    let remaining = Math.max(0, target - touchedTotal);
    untouched.forEach((input, index) => {
      const left = untouched.length - index;
      const value = Math.min(Number(input.max), Math.ceil(remaining / left));
      input.value = value;
      remaining -= value;
    });
    const total = inputs.reduce((sum, input) => sum + Number(input.value), 0);
    inputs.forEach((input) => {
      document.querySelector(`[data-value="${input.dataset.paper}"]`).textContent = `${input.value}/${input.max}`;
    });
    document.querySelector("#boundary-result").innerHTML = `<strong>${total}/${max}</strong><p class="muted">${total >= target ? `On track for ${grade}` : `${target - total} marks short of ${grade}`}</p>`;
  }

  document.querySelector("#target-grade").addEventListener("change", () => {
    sliders.querySelectorAll("input").forEach((input) => delete input.dataset.touched);
    updateSliders();
  });
  sliders.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => updateSliders(input)));
  updateSliders();
}

function renderChannels() {
  document.querySelector("#channel-grid").replaceChildren(
    ...subject.channels.map((channel) => {
      const card = document.createElement("a");
      card.className = "channel-card";
      card.href = channel.url;
      card.target = "_blank";
      card.rel = "noreferrer";
      card.innerHTML = `<p class="kicker">channel</p><h3>${channel.name}</h3><p class="muted">${channel.note}</p>`;
      return card;
    }),
  );
}

function renderAllSubjectStats() {
  renderTopStats();
  renderStatsDashboard();
  renderPredictor();
}

function renderSubject() {
  const id = params.get("subject");
  subject = getSubject(id);
  if (!subject) {
    document.querySelector(".app").innerHTML = `<section class="panel"><h1>Subject not found</h1></section>`;
    return;
  }
  renderSubjectHero();
  renderTopicGrid();
  renderPracticeBuilder();
  renderAllSubjectStats();
  renderBank();
  renderBoundaries();
  renderChannels();

  document.querySelector("#start-skill-test").addEventListener("click", () => {
    quizMarkup(generateQuestions(subject.topics.map((topic) => topic.id), 50, "skill"), "#skill-test-zone", "Skill Test");
  });
  document.querySelector("#start-practice").addEventListener("click", () => {
    const selected = [...document.querySelectorAll("#practice-topics input:checked")].map((input) => input.value);
    const count = Math.max(5, Math.min(80, Number(document.querySelector("#practice-count").value || 15)));
    quizMarkup(generateQuestions(selected.length ? selected : subject.topics.map((topic) => topic.id), count, "practice"), "#practice-zone", "Practice Quiz");
  });
  document.querySelector("#bank-search").addEventListener("input", (event) => renderBank(event.target.value));
}

function renderTopicPage() {
  const subjectId = params.get("subject");
  subject = getSubject(subjectId);
  const topic = subject?.topics.find((entry) => entry.id === params.get("topic"));
  if (!subject || !topic) {
    document.querySelector("#topic-page").innerHTML = `<h1>Topic not found</h1>`;
    return;
  }
  document.title = `${topic.name} | ${subject.name}`;
  document.querySelector("#subject-back").href = makeSubjectUrl(subject.id);
  document.querySelector("#subject-back").textContent = subject.name;
  document.querySelector("#topic-page").innerHTML = `
    <p class="kicker">${subject.name}</p>
    <h1>${topic.name}</h1>
    <p class="lede">${subject.papers.find((paper) => paper.id === topic.paper)?.name || "Topic"}</p>
    <div class="pill-row">${topic.keywords.map((keyword) => `<span class="pill">${keyword}</span>`).join("")}</div>
    <div class="topic-notes">
      ${topic.notes.map((note) => `<article class="bank-card"><p>${note}</p></article>`).join("")}
      <article class="bank-card">
        <h3>Exam technique</h3>
        <p>Define the key idea, apply it to the question, use precise evidence, and finish with a judgement about why it matters.</p>
      </article>
    </div>
  `;
}

async function init() {
  const response = await fetch(`data/subjects.json?v=${Date.now()}`);
  const data = await response.json();
  subjects = data.subjects;
  if (page === "home") renderHome();
  if (page === "subject") renderSubject();
  if (page === "topic") renderTopicPage();
}

init().catch((error) => {
  document.querySelector(".app").innerHTML = `<section class="panel"><h1>Could not load revision data</h1><p class="muted">${error.message}</p></section>`;
});
