
const newsList = document.getElementById("newsList");
const categoryButtons = document.querySelectorAll(".category-list button");
const newsCount = document.getElementById("newsCount");

let articles = [];
// 한국 시간 기준 오늘 날짜
function getKoreaDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

// 기존 API Usage Dashboard와 동일한 분석 완료 기준
function isArticleAnalyzed(article) {
    return Boolean(
        article.technicalSignificance &&
        article.careerRelevance &&
        Array.isArray(article.relatedJobs) &&
        Array.isArray(article.skillsToLearn) &&
        Array.isArray(article.terms) &&
        article.terms.length > 0
    );
}

// 오늘의 AI 분석 현황 표시
function renderTodayAnalysisLimit(newsData) {
    const DAILY_ANALYSIS_LIMIT = 15;
    const today = getKoreaDate();

    const todayCount = (Array.isArray(newsData.articles)
        ? newsData.articles
        : []
    ).filter(article =>
        article.aiAnalyzedDate === today &&
        isArticleAnalyzed(article)
    ).length;

    const remaining = Math.max(
        0,
        DAILY_ANALYSIS_LIMIT - todayCount
    );

    const percentage = Math.min(
        100,
        (todayCount / DAILY_ANALYSIS_LIMIT) * 100
    );

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText("today-analysis-count", todayCount.toLocaleString("ko-KR"));
    setText("today-analysis-remaining", remaining.toLocaleString("ko-KR"));
    setText("today-analysis-percent", percentage.toFixed(1) + "%");
    setText("today-analysis-date", today + " · KST");

    const progress = document.getElementById("today-analysis-progress");

    if (progress) {
        progress.style.width = percentage + "%";
    }

    const status = document.getElementById("today-analysis-status");

    if (status) {
        if (todayCount >= DAILY_ANALYSIS_LIMIT) {
            status.textContent = "오늘 분석 한도 도달";
            status.className = "news-analysis-status full";
        } else {
            status.textContent = "분석 가능";
            status.className = "news-analysis-status available";
        }
    }
}

// 안전하게 HTML 요소 생성
function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
}

// 분석 결과 섹션 생성
function createInfoSection(title, content, className = "") {
    if (!content) return null;

    const section = createElement("div", `news-ai-section ${className}`);
    section.appendChild(createElement("strong", "", title));
    section.appendChild(createElement("p", "", content));

    return section;
}

// 배열 형태의 분석 결과 생성
function createListSection(title, items, className = "") {
    if (!Array.isArray(items) || items.length === 0) return null;

    const section = createElement("div", `news-ai-section ${className}`);
    section.appendChild(createElement("strong", "", title));

    const list = createElement("ul", "");

    items.forEach(item => {
        list.appendChild(createElement("li", "", item));
    });

    section.appendChild(list);

    return section;
}

// 전문용어 설명 생성
function createTermsSection(terms) {
    if (!Array.isArray(terms) || terms.length === 0) return null;

    const section = createElement("div", "news-terms");
    section.appendChild(createElement("strong", "", "📖 전문용어 쉽게 이해하기"));

    terms.forEach(term => {
        const item = createElement("div", "news-term-item");

        const name = term.term || term.word || "전문용어";
        const explanation =
            term.explanation || term.meaning || "설명이 없습니다.";

        item.appendChild(createElement("strong", "", name));
        item.appendChild(createElement("p", "", explanation));

        section.appendChild(item);
    });

    return section;
}

// 뉴스 데이터 불러오기
async function loadNews() {
    try {
        const response = await fetch("./data/news.json", { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`뉴스 데이터 오류: ${response.status}`);
        }

        const data = await response.json();

        articles = Array.isArray(data.articles)
            ? data.articles
            : [];

        const briefing = document.querySelector(".news-briefing p");

        if (briefing) {
            briefing.textContent =
                data.dailyBriefing || "오늘의 브리핑이 없습니다.";
        }

        const generatedAt = document.getElementById("newsUpdated");

        if (generatedAt && data.generatedAt) {
            const date = new Date(data.generatedAt);

            generatedAt.textContent =
                Number.isNaN(date.getTime())
                    ? ""
                    : `마지막 수집: ${date.toLocaleString("ko-KR")}`;
        }

        renderTodayAnalysisLimit(data);
        renderNews(articles);

    } catch (error) {
        console.error("뉴스 불러오기 실패:", error);

        newsList.replaceChildren(
            createElement(
                "div",
                "news-empty",
                "뉴스 데이터를 불러오지 못했습니다. Live Server 실행 여부를 확인해 주세요."
            )
        );

        if (newsCount) newsCount.textContent = "뉴스 0개";
    }
}

// 뉴스 카드 생성
function createNewsCard(article) {
    const card = createElement("article", "news-card");

    // 제목
    card.appendChild(
        createElement("h3", "", article.title || "제목 없음")
    );

    // 뉴스 정보
    card.appendChild(
        createElement(
            "p",
            "news-info",
            `${article.category || "기타"} | ${article.source || "출처 미상"} | ${article.publishedAt || "날짜 미상"}`
        )
    );

    // 원문 요약
    card.appendChild(
        createElement(
            "p",
            "news-summary",
            article.summary || "기사 요약이 없습니다."
        )
    );

    // AI 분석 영역
    const aiSection = createElement("div", "news-ai-analysis");

    aiSection.appendChild(
        createElement("h4", "", "🤖 AI 취업·기술 분석")
    );

    const technical = createInfoSection(
        "🔬 기술적 중요성",
        article.technicalSignificance
    );

    if (technical) aiSection.appendChild(technical);

    const career = createInfoSection(
        "💼 취업 연관성",
        article.careerRelevance
    );

    if (career) aiSection.appendChild(career);

    const jobs = createListSection(
        "🎯 관련 직무",
        article.relatedJobs
    );

    if (jobs) aiSection.appendChild(jobs);

    const skills = createListSection(
        "📚 추천 학습 역량",
        article.skillsToLearn
    );

    if (skills) aiSection.appendChild(skills);

    const terms = createTermsSection(article.terms);

    if (terms) aiSection.appendChild(terms);

    // AI 분석 결과가 있을 때만 표시
    if (aiSection.children.length > 1) {
        card.appendChild(aiSection);
    } else {
        card.appendChild(
            createElement(
                "p",
                "news-ai-pending",
                "AI 분석 결과를 기다리는 중입니다."
            )
        );
    }

    // 원문 링크
    if (
        article.url &&
        /^https?:\/\//i.test(article.url)
    ) {
        const link = createElement("a", "news-link", "기사 원문 보기 →");

        link.href = article.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        card.appendChild(link);
    }

    return card;
}

// 뉴스 목록 출력
function renderNews(newsArray) {
    newsList.replaceChildren();

    if (newsCount) {
        newsCount.textContent = `뉴스 ${newsArray.length}개`;
    }

    if (newsArray.length === 0) {
        newsList.appendChild(
            createElement(
                "div",
                "news-empty",
                "해당 분야의 뉴스가 없습니다."
            )
        );
        return;
    }

    newsArray.forEach(article => {
        newsList.appendChild(createNewsCard(article));
    });
}

// 카테고리 버튼 연결
categoryButtons.forEach(button => {
    button.addEventListener("click", () => {
        const selectedCategory = button.textContent.trim();

        const filteredArticles =
            selectedCategory === "전체"
                ? articles
                : articles.filter(
                    article => article.category === selectedCategory
                );

        renderNews(filteredArticles);

        categoryButtons.forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");
    });
});

// 페이지 실행
loadNews();
