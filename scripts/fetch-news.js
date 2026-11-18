
const Parser = require("rss-parser");
const fs = require("fs");
const path = require("path");

const parser = new Parser();

// 수집할 반도체 뉴스 분야
const categories = [
    {
        name: "공정",
        query: "반도체 제조 공정 OR 반도체 미세공정"
    },
    {
        name: "패키징",
        query: "반도체 첨단 패키징 OR HBM 패키징"
    },
    {
        name: "메모리",
        query: "반도체 메모리 OR HBM DRAM NAND"
    },
    {
        name: "장비",
        query: "반도체 제조 장비 OR 반도체 장비 기업"
    },
    {
        name: "AI 반도체",
        query: "AI 반도체 OR GPU 반도체"
    },
    {
        name: "기업·시장",
        query: "반도체 산업 시장 기업 투자"
    }
];

// Google 뉴스 RSS 주소 생성
function createRssUrl(query) {
    const params = new URLSearchParams({
        q: query,
        hl: "ko",
        gl: "KR",
        ceid: "KR:ko"
    });

    return `https://news.google.com/rss/search?${params.toString()}`;
}

// 날짜 형식 변환
function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
}

// 뉴스 수집
async function collectNews() {
    console.log("반도체 뉴스 수집을 시작합니다.");

    const collectedArticles = [];

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
                    publishedAt: formatDate(item.isoDate || item.pubDate),
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

    // 기사 중복 제거
    const uniqueArticles = Array.from(
        new Map(
            collectedArticles.map(article => [
                article.url || article.title,
                article
            ])
        ).values()
    );

    // ID 부여
    uniqueArticles.forEach((article, index) => {
        article.id = index + 1;
    });

    // 기존 news.json 구조 유지
    const newsData = {
        generatedAt: new Date().toISOString(),
        dailyBriefing: "AI 브리핑은 추후 분석 기능 연결 후 제공됩니다.",
        articles: uniqueArticles
    };

    // data/news.json 저장
    const outputPath = path.join(
        __dirname,
        "../data/news.json"
    );

    fs.writeFileSync(
        outputPath,
        JSON.stringify(newsData, null, 2),
        "utf-8"
    );

    console.log("--------------------------------");
    console.log(`뉴스 수집 완료: ${uniqueArticles.length}개`);
    console.log("data/news.json 저장 완료");
    console.log("--------------------------------");
}

// 프로그램 실행
collectNews();