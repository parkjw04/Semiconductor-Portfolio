
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60000
});

const filePath = path.join(__dirname, "../data/news.json");

// 분석 설정
const BATCH_SIZE = 5;
const DAILY_ANALYSIS_LIMIT = 15;

// 재시도 설정
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;
const REQUEST_INTERVAL_MS = 1500;

// 대기 함수
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 한국 시간 기준 날짜
function getKoreaDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

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

// 분석 완료 여부 확인
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

// 오늘 분석한 뉴스 개수 확인
function getTodayAnalysisCount(articles) {
    const today = getKoreaDate();

    return articles.filter(article =>
        article.aiAnalyzedDate === today &&
        isAnalyzed(article)
    ).length;
}

// 재시도 가능한 오류인지 확인
function isRetryableError(error) {
    const status = error.status;
    const code = error.code;
    const message = error.message || "";

    // AI 응답 형식 오류도 재시도
    if (
        error instanceof SyntaxError ||
        message.includes("AI 응답") ||
        message.includes("잘못되거나 중복된 뉴스 번호") ||
        message.includes("분석 결과 형식")
    ) {
        return true;
    }

    // 일시적인 API 오류
    if (
        status === 408 ||
        status === 409 ||
        status === 429 ||
        status >= 500
    ) {
        return true;
    }

    const retryableCodes = [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "ENOTFOUND",
        "UND_ERR_CONNECT_TIMEOUT",
        "rate_limit_exceeded"
    ];

    return retryableCodes.includes(code);
}

// Retry-After 헤더 확인
function getRetryAfter(error) {
    try {
        const value = error.headers?.get?.("retry-after");

        if (value) {
            const seconds = Number(value);

            if (Number.isFinite(seconds)) {
                return Math.min(
                    seconds * 1000,
                    MAX_RETRY_DELAY_MS
                );
            }

            const dateDelay = new Date(value).getTime() - Date.now();

            if (dateDelay > 0) {
                return Math.min(
                    dateDelay,
                    MAX_RETRY_DELAY_MS
                );
            }
        }
    } catch (error) {
        // Retry-After 정보를 읽지 못하면 기본 대기 시간 사용
    }

    return null;
}

// AI 분석 결과 검증
function validateAnalysisResult(result, batchLength) {
    if (
        !result ||
        !Array.isArray(result.analyses) ||
        result.analyses.length !== batchLength
    ) {
        throw new Error(
            "AI 응답의 analyses 배열이 누락되었거나 뉴스 개수가 맞지 않습니다."
        );
    }

    const indexes = new Set();

    for (const analysis of result.analyses) {
        const index = Number(analysis.index) - 1;

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= batchLength ||
            indexes.has(index)
        ) {
            throw new Error(
                `잘못되거나 중복된 뉴스 번호: ${analysis.index}`
            );
        }

        if (
            !analysis.technicalSignificance ||
            !analysis.careerRelevance ||
            !Array.isArray(analysis.relatedJobs) ||
            !Array.isArray(analysis.skillsToLearn) ||
            !Array.isArray(analysis.terms) ||
            analysis.terms.length === 0
        ) {
            throw new Error(
                `뉴스 ${analysis.index}의 분석 결과 형식이 올바르지 않습니다.`
            );
        }

        indexes.add(index);
    }

    return result;
}

// AI 분석 요청 및 자동 재시도
async function requestAnalysis(newsText, batchLength) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(
                `AI API 요청 (${attempt + 1}/${MAX_RETRIES + 1}회차)`
            );

            const response = await client.responses.create({
                model: "gpt-6-luna",
                input: `
너는 반도체 산업 전문 분석가야.

다음 뉴스 ${batchLength}개를 각각 분석해줘.

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

            return validateAnalysisResult(
                result,
                batchLength
            );

        } catch (error) {
            const retryable = isRetryableError(error);

            console.error(
                `AI 분석 요청 실패: ${error.message}`
            );

            if (!retryable || attempt >= MAX_RETRIES) {
                throw error;
            }

            const retryAfter = getRetryAfter(error);

            const delay = retryAfter !== null
                ? retryAfter
                : Math.min(
                    BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
                    MAX_RETRY_DELAY_MS
                );

            console.log(
                `${delay / 1000}초 후 자동 재시도합니다.`
            );

            await sleep(delay);
        }
    }
}

// 메인 분석 함수
async function analyzeNews() {
    let failed = false;
    let stopAnalysis = false;

    try {
        const data = JSON.parse(
            fs.readFileSync(filePath, "utf8")
        );

        const articles = data.articles;

        const pendingArticles = articles
            .map((article, index) => ({ article, index }))
            .filter(({ article }) => !isAnalyzed(article));

        console.log(`전체 뉴스: ${articles.length}개`);
        console.log(
            `분석 완료: ${articles.length - pendingArticles.length}개`
        );
        console.log(`분석 대기: ${pendingArticles.length}개`);

        let todayCount = getTodayAnalysisCount(articles);

        console.log(`오늘 분석 완료: ${todayCount}개`);
        console.log(`하루 분석 한도: ${DAILY_ANALYSIS_LIMIT}개`);

        if (pendingArticles.length === 0) {
            console.log("모든 뉴스의 AI 분석이 완료되었습니다.");
            return;
        }

        // 하루 분석 한도 내에서 진행
        for (
            let i = 0;
            i < pendingArticles.length &&
            todayCount < DAILY_ANALYSIS_LIMIT;
            i += BATCH_SIZE
        ) {
            const remainingLimit =
                DAILY_ANALYSIS_LIMIT - todayCount;

            const batch = pendingArticles.slice(
                i,
                i + Math.min(BATCH_SIZE, remainingLimit)
            );

            console.log(`\nAI 분석 시작: ${batch.length}개 뉴스`);

            // 요청 간격 조절
            if (i > 0) {
                console.log("다음 API 요청 전 대기합니다.");
                await sleep(REQUEST_INTERVAL_MS);
            }

            const newsText = batch.map((item, index) => `
[뉴스 ${index + 1}]
제목: ${item.article.title}
분야: ${item.article.category}
출처: ${item.article.source}
내용: ${item.article.summary}
`).join("\n");

            try {
                // AI 분석 및 자동 재시도
                const result = await requestAnalysis(
                    newsText,
                    batch.length
                );

                for (const analysis of result.analyses) {
                    const index = Number(analysis.index) - 1;
                    const article = batch[index].article;

                    Object.assign(article, {
                        technicalSignificance:
                            analysis.technicalSignificance,
                        careerRelevance:
                            analysis.careerRelevance,
                        relatedJobs:
                            analysis.relatedJobs,
                        skillsToLearn:
                            analysis.skillsToLearn,
                        terms:
                            analysis.terms,

                        // 분석 완료 날짜 및 시간 기록
                        aiAnalyzedDate: getKoreaDate(),
                        aiAnalyzedAt: new Date().toISOString()
                    });

                    todayCount++;

                    console.log(
                        `분석 완료: ${article.title}`
                    );
                }

                // 분석 결과 즉시 저장
                saveData(data);

                console.log("분석 결과 저장 완료!");
                console.log(
                    `오늘 분석 누적: ${todayCount}/${DAILY_ANALYSIS_LIMIT}개`
                );

            } catch (error) {
                console.error(
                    "뉴스 묶음 분석 실패:",
                    error.message
                );

                failed = true;

                if (
                    error.status === 429 ||
                    error.code === "rate_limit_exceeded"
                ) {
                    console.log(
                        "API 요청 한도 초과: 다음 실행에서 이어서 분석합니다."
                    );

                    stopAnalysis = true;
                    break;
                }

                console.log(
                    "이번 묶음은 미완료 상태로 남깁니다."
                );
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
        console.log(
            `오늘 분석량: ${todayCount}/${DAILY_ANALYSIS_LIMIT}개`
        );

        if (stopAnalysis) {
            console.log(
                "API 한도 문제로 분석을 중단했습니다."
            );
        }

        if (todayCount >= DAILY_ANALYSIS_LIMIT && remaining > 0) {
            console.log(
                "일일 분석 한도 도달: 남은 뉴스는 다음 실행에서 분석합니다."
            );
        }

        if (failed || remaining > 0) {
            process.exitCode = 1;
        } else {
            console.log("모든 뉴스 분석 및 저장 완료!");
        }

    } catch (error) {
        console.error(
            "프로그램 실행 오류:",
            error.message
        );

        process.exitCode = 1;
    }
}

analyzeNews();
