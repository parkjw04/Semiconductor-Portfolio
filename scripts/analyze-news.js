
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const filePath = path.join(__dirname, "../data/news.json");

async function analyzeNews() {
    try {
        const data = JSON.parse(
            fs.readFileSync(filePath, "utf8")
        );

        console.log(`AI 분석 시작: ${data.articles.length}개 뉴스`);

        for (const article of data.articles) {
            if (article.technicalSignificance &&
                article.careerRelevance &&
                article.terms?.length > 0) {
                console.log(`이미 분석됨: ${article.title}`);
                continue;
            }

            const response = await client.responses.create({
                model: "gpt-6-luna",
                input: `
너는 반도체 산업 전문 분석가야.

다음 뉴스 정보를 분석해줘.

제목: ${article.title}
분야: ${article.category}
출처: ${article.source}
내용: ${article.summary}

반드시 아래 JSON 형식으로 답변해줘.

{
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

뉴스 내용만으로 판단하기 어려운 부분은 추측하지 말고 정보가 부족하다고 밝혀줘.
JSON 이외의 설명은 출력하지 마.
`
            });

            const result = JSON.parse(response.output_text);

            Object.assign(article, result);

            console.log(`분석 완료: ${article.title}`);
        }

        data.generatedAt = new Date().toISOString();

        fs.writeFileSync(
            filePath,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        console.log("모든 뉴스 분석 및 저장 완료!");

    } catch (error) {
        console.error("AI 분석 오류:", error.message);
        process.exitCode = 1;
    }
}

analyzeNews();