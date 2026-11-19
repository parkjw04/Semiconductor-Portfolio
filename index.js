async function loadMainNews() {
    const newsList = document.getElementById("main-news-list");

    if (!newsList) return;

    try {
        const response = await fetch("./data/news.json", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("뉴스 데이터 요청 실패: " + response.status);
        }

        const data = await response.json();

        const articles = Array.isArray(data.articles)
            ? data.articles
            : [];

        const latestArticles = articles
            .filter(article => article.title && article.url)
            .sort((a, b) => {
                return new Date(b.publishedAt || 0) -
                       new Date(a.publishedAt || 0);
            })
            .slice(0, 5);

        if (latestArticles.length === 0) {
            newsList.textContent = "표시할 뉴스가 없습니다.";
            return;
        }

        newsList.replaceChildren();

        latestArticles.forEach(article => {
            const card = document.createElement("a");
            card.className = "main-news-card";
            card.href = article.url;
            card.target = "_blank";
            card.rel = "noopener noreferrer";

            const meta = document.createElement("div");
            meta.className = "main-news-meta";

            const category = document.createElement("span");
            category.className = "main-news-category";
            category.textContent = article.category || "반도체";

            const date = document.createElement("span");
            date.className = "main-news-date";
            date.textContent = article.publishedAt || "날짜 미상";

            meta.append(category, date);

            const title = document.createElement("h3");
            title.textContent = article.title;

            const summary = document.createElement("p");
            summary.textContent = article.summary || "기사 원문에서 자세한 내용을 확인할 수 있습니다.";

            card.append(meta, title, summary);

            if (
                article.technicalSignificance &&
                article.careerRelevance &&
                Array.isArray(article.terms) &&
                article.terms.length > 0
            ) {
                const analysis = document.createElement("span");
                analysis.className = "main-news-analysis";
                analysis.textContent = "✓ AI 분석 완료";
                card.appendChild(analysis);
            }

            newsList.appendChild(card);
        });

    } catch (error) {
        console.error("메인 화면 뉴스 로딩 오류:", error);
        newsList.textContent = "뉴스를 불러오지 못했습니다.";
    }
}

document.addEventListener("DOMContentLoaded", loadMainNews);
