
const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

const parser = new Parser();

const categories = [
    { name: "공정", query: "반도체 제조 공정 OR 반도체 미세공정" },
    { name: "패키징", query: "반도체 첨단 패키징 OR HBM 패키징" },
    { name: "메모리", query: "반도체 메모리 OR HBM DRAM NAND" },
    { name: "장비", query: "반도체 제조 장비 OR 반도체 장비 기업" },
    { name: "AI 반도체", query: "AI 반도체 OR GPU 반도체" },
    { name: "기업·시장", query: "반도체 산업 시장 기업 투자" }
];

const outputPath = path.join(__dirname, "../data/news.json");

// RSS 주소 생성
function createRssUrl(query) {
    const params = new URLSearchParams({
        q: query,
        hl: "ko",
        gl: "KR",
        ceid: "KR:ko"
    });

    return `https://news.google.com/rss/search?${params.toString()}`;
}

// 날짜 변환
function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
}

// 뉴스 비교용 URL 정리
function normalizeUrl(url) {
    if (!url) return "";

    try {
        const parsed = new URL(url);
        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return url.trim();
    }
}

// 뉴스가 기존 기사와 같은지 확인
function isSameArticle(a, b) {
    const urlA = normalizeUrl(a.url);
    const urlB = normalizeUrl(b.url);

    if (urlA && urlB && urlA === urlB) {
        return true;
    }

    return (
        a.title?.trim() === b.title?.trim() &&
        a.source?.trim() === b.source?.trim()
    );
}

// 기존 AI 분석 결과 보존
function preserveAnalysis(oldArticle, newArticle) {
    const analysisFields = [
        "technicalSignificance",
        "careerRelevance",
        "relatedJobs",
        "skillsToLearn",
        "terms"
    ];

    const merged = {
        ...oldArticle,
        ...newArticle,
        id: oldArticle.id ?? newArticle.id
    };

    for (const field of analysisFields) {
        if (
            oldArticle[field] !== undefined &&
            oldArticle[field] !== null &&
            oldArticle[field] !== "" &&
            !(Array.isArray(oldArticle[field]) &&
              oldArticle[field].length === 0)
        ) {
            merged[field] = oldArticle[field];
        }
    }

    return merged;
}

// 뉴스 수집
async function collectNews() {
    console.log("반도체 뉴스 수집을 시작합니다.");

    // 기존 데이터 읽기
    let oldData = {
        articles: [],
        dailyBriefing: ""
    };

    if (fs.existsSync(outputPath)) {
        try {
            oldData = JSON.parse(
                fs.readFileSync(outputPath, "utf8")
            );
        } catch (error) {
            throw new Error(
                `기존 뉴스 데이터 읽기 실패: ${error.message}`
            );
        }
    }

    const oldArticles = Array.isArray(oldData.articles)
        ? oldData.articles
        : [];

    const collectedArticles = [];

    // RSS 수집
    for (const category of categories) {
        try {
            console.log(`[${category.name}] 뉴스 수집 중...`);

            const feed = await parser.parseURL(
                createRssUrl(category.query)
            );

            const articles = feed.items.slice(0, 5);

            articles.forEach(item => {
                collectedArticles.push({
                    id: null,
                    title: item.title || "제목 없음",
                    category: category.name,
                    source: item.source?.title || feed.title || "Google News",
                    publishedAt: formatDate(
                        item.isoDate || item.pubDate
                    ),
                    url: item.link || "",
                    summary: item.contentSnippet || item.content || "",
                    technicalSignificance: "",
                    careerRelevance: "",
                    relatedJobs: [],
                    skillsToLearn: [],
                    terms: []
                });
            });

        } catch (error) {
            console.error(
                `[${category.name}] 수집 실패:`,
                error.message
            );
        }
    }

    // 새로 수집한 뉴스 중복 제거
    const uniqueArticles = [];

    for (const article of collectedArticles) {
        if (!uniqueArticles.some(
            existing => isSameArticle(existing, article)
        )) {
            uniqueArticles.push(article);
        }
    }

    // 기존 뉴스와 새 뉴스 병합
    const mergedArticles = uniqueArticles.map(article => {
        const existing = oldArticles.find(
            old => isSameArticle(old, article)
        );

        if (existing) {
            return preserveAnalysis(existing, article);
        }

        return article;
    });

    // 기존 RSS에서 사라진 뉴스도 보존
    for (const oldArticle of oldArticles) {
        const exists = mergedArticles.some(
            article => isSameArticle(article, oldArticle)
        );

        if (!exists) {
            mergedArticles.push(oldArticle);
        }
    }

    // 새로운 뉴스에 고유 ID 부여
    let nextId = oldArticles.reduce((max, article) => {
        return Math.max(max, Number(article.id) || 0);
    }, 0) + 1;

    mergedArticles.forEach(article => {
        if (article.id === null || article.id === undefined) {
            article.id = nextId++;
        }
    });

    // 기존 브리핑 유지
    const newsData = {
        generatedAt: new Date().toISOString(),
        dailyBriefing: oldData.dailyBriefing ||
            "AI 브리핑은 추후 분석 기능 연결 후 제공됩니다.",
        articles: mergedArticles
    };

    // 데이터 저장
    fs.writeFileSync(
        outputPath,
        JSON.stringify(newsData, null, 2),
        "utf8"
    );

    const analyzedCount = mergedArticles.filter(article =>
        article.technicalSignificance &&
        article.careerRelevance &&
        Array.isArray(article.terms) &&
        article.terms.length > 0
    ).length;

    console.log("--------------------------------");
    console.log(`이번 수집 뉴스: ${uniqueArticles.length}개`);
    console.log(`전체 보관 뉴스: ${mergedArticles.length}개`);
    console.log(`기존 분석 유지: ${analyzedCount}개`);
    console.log("data/news.json 저장 완료");
    console.log("--------------------------------");
}

collectNews().catch(error => {
    console.error("뉴스 수집 프로그램 오류:", error.message);
    process.exitCode = 1;
});