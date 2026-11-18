
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const filePath = path.join(__dirname, "../data/news.json");
const BATCH_SIZE = 5;

// JSON 파일 저장
function saveData(data) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

// AI 응답에서 JSON 추출
function parseJSON(text) {
    const cleaned = text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    return JSON.parse(cleaned);
}

// 분석이 완료된 기사인지 확인
function isAnalyzed(article) {
    return Boolean(
        article.technicalSignificance &&
        article.careerRelevance &&
        Array.isArray(article.relatedJobs) &&
        Array.isArray(article.skillsToLearn) &&
        Array.isArray(article.terms) &&
        article.terms.length > 0
    );
}

async function analyzeNews() {
    let failed = false;

    try {
        const data = JSON.parse(
            fs.readFileSync(filePath, "utf8")
        );

        const articles = data.articles;

        const pendingArticles = articles
            .map((article, index) => ({ article, index }))
            .filter(({ article }) => !isAnalyzed(article));

        console.log(`전체 뉴스: ${articles.length}개`);
        console.log(`분석 완료: ${articles.length - pendingArticles.length}개`);
        console.log(`분석 대기: ${pendingArticles.length}개`);

        if (pendingArticles.length === 0) {
            console.log("모든 뉴스의 AI 분석이 완료되었습니다.");
            return;
        }

        // 뉴스 5개씩 묶어서 분석
        for (
            let i = 0;
            i < pendingArticles.length;
            i += BATCH_SIZE
        ) {
            const batch = pendingArticles.slice(i, i + BATCH_SIZE);

            console.log(`\nAI 분석 시작: ${batch.length}개 뉴스`);

            const newsText = batch.map((item, index) => `
[뉴스 ${index + 1}]
제목: ${item.article.title}
분야: ${item.article.category}
출처: ${item.article.source}
내용: ${item.article.summary}
`).join("\n");

            try {
                const response = await client.responses.create({
                    model: "gpt-6-luna",
                    input: `
너는 반도체 산업 전문 분석가야.

다음 뉴스 ${batch.length}개를 각각 분석해줘.

${newsText}

각 뉴스에 대해 아래 JSON 구조로 분석해줘.

{
  "analyses": [
    {
      "index": 1,
      "technicalSignificance": "기술적 중요성",
      "careerRelevance": "반도체 취업과의 연관성",
      "relatedJobs": ["관련 직무"],
      "skillsToLearn": ["학습하면 좋은 역량"],
      "terms": [
        {
          "term": "전문용어",
          "explanation": "초보자도 이해할 수 있는 설명"
        }
      ]
    }
  ]
}

주의사항:
1. index는 위 뉴스 번호와 일치시켜줘.
2. 모든 뉴스에 대해 빠짐없이 분석해줘.
3. 뉴스 내용만으로 판단하기 어려운 부분은 추측하지 말고 정보가 부족하다고 밝혀줘.
4. 관련 직무와 학습 역량은 뉴스 내용과 연결해서 작성해줘.
5. JSON 이외의 설명은 출력하지 마.
`
                });

                const result = parseJSON(response.output_text);

                if (!Array.isArray(result.analyses)) {
                    throw new Error("AI 응답에 analyses 배열이 없습니다.");
                }

                // 뉴스별 분석 결과 반영
                for (const analysis of result.analyses) {
                    const index = Number(analysis.index) - 1;

                    if (
                        !Number.isInteger(index) ||
                        index < 0 ||
                        index >= batch.length
                    ) {
                        console.log("잘못된 뉴스 번호:", analysis.index);
                        continue;
                    }

                    const article = batch[index].article;

                    if (
                        !analysis.technicalSignificance ||
                        !analysis.careerRelevance ||
                        !Array.isArray(analysis.relatedJobs) ||
                        !Array.isArray(analysis.skillsToLearn) ||
                        !Array.isArray(analysis.terms)
                    ) {
                        console.log(`분석 결과 형식 오류: ${article.title}`);
                        failed = true;
                        continue;
                    }

                    Object.assign(article, {
                        technicalSignificance: analysis.technicalSignificance,
                        careerRelevance: analysis.careerRelevance,
                        relatedJobs: analysis.relatedJobs,
                        skillsToLearn: analysis.skillsToLearn,
                        terms: analysis.terms
                    });

                    console.log(`분석 완료: ${article.title}`);
                }

                // 묶음 분석이 끝날 때마다 저장
                saveData(data);

                console.log("분석 결과 저장 완료!");

            } catch (error) {
                console.error("AI 분석 오류:", error.message);
                failed = true;

                // 요청 한도 초과라면 추가 요청을 중단
                if (
                    error.status === 429 ||
                    error.code === "rate_limit_exceeded"
                ) {
                    console.log(
                        "API 요청 한도 초과: 다음 실행에서 이어서 분석합니다."
                    );
                    break;
                }

                // 그 외 오류는 다음 묶음으로 진행
                console.log("다음 뉴스 묶음으로 진행합니다.");
            }
        }

        // 최종 저장
        data.generatedAt = new Date().toISOString();
        saveData(data);

        const remaining = data.articles.filter(
            article => !isAnalyzed(article)
        ).length;

        console.log("\n최종 분석 결과");
        console.log(`전체 뉴스: ${articles.length}개`);
        console.log(`분석 완료: ${articles.length - remaining}개`);
        console.log(`분석 미완료: ${remaining}개`);

        if (failed || remaining > 0) {
            process.exitCode = 1;
        } else {
            console.log("모든 뉴스 분석 및 저장 완료!");
        }

    } catch (error) {
        console.error("프로그램 실행 오류:", error.message);
        process.exitCode = 1;
    }
}

analyzeNews();
