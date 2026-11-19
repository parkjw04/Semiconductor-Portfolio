const numberFormat = new Intl.NumberFormat("ko-KR");

function formatNumber(value) {
    return numberFormat.format(Number(value) || 0);
}

function formatCost(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return "미설정";
    }

    return "$" + value.toFixed(4);
}

function formatDate(dateString) {
    const date = new Date(dateString + "T00:00:00");

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString("ko-KR", {
        month: "2-digit",
        day: "2-digit"
    });
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function renderDailyChart(dailyData) {
    const chart = document.getElementById("daily-chart");

    const entries = Object.entries(dailyData || {})
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7);

    if (entries.length === 0) {
        chart.innerHTML = '<p class="loading-message">아직 기록된 사용량이 없습니다.</p>';
        return;
    }

    const maxTokens = Math.max(
        1,
        ...entries.map(([, data]) =>
            (Number(data.inputTokens) || 0) +
            (Number(data.outputTokens) || 0)
        )
    );

    chart.innerHTML = entries.map(([date, data]) => {
        const input = Number(data.inputTokens) || 0;
        const output = Number(data.outputTokens) || 0;
        const total = input + output;

        const inputWidth = (input / maxTokens) * 100;
        const outputWidth = (output / maxTokens) * 100;

        return `
            <div class="chart-row">
                <span class="chart-date">${formatDate(date)}</span>
                <div class="chart-bars">
                    <div class="chart-bar input" style="width:${inputWidth}%"></div>
                    <div class="chart-bar output" style="width:${outputWidth}%"></div>
                </div>
                <span class="chart-total">${formatNumber(total)}</span>
            </div>
        `;
    }).join("");
}

function renderHistory(dailyData, pricingConfigured) {
    const tbody = document.getElementById("usage-history");

    const entries = Object.entries(dailyData || {})
        .sort((a, b) => b[0].localeCompare(a[0]));

    if (entries.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">아직 기록된 사용량이 없습니다.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = entries.map(([date, data]) => {
        const cost = pricingConfigured
            ? formatCost(data.estimatedCostUSD)
            : "미설정";

        return `
            <tr>
                <td>${formatDate(date)}</td>
                <td>${formatNumber(data.requests)}</td>
                <td>${formatNumber(data.inputTokens)}</td>
                <td>${formatNumber(data.outputTokens)}</td>
                <td>${formatNumber(data.totalTokens)}</td>
                <td>${cost}</td>
            </tr>
        `;
    }).join("");
}

function renderDashboard(data) {
    const totals = data.totals || {};
    const pricingConfigured = data.pricingConfigured === true;

    setText("total-requests", formatNumber(totals.requests));
    setText("successful-requests", formatNumber(totals.successfulResponses));
    setText("total-tokens", formatNumber(totals.totalTokens));
    setText("input-tokens", formatNumber(totals.inputTokens));
    setText("output-tokens", formatNumber(totals.outputTokens));

    if (pricingConfigured) {
        setText("total-cost", formatCost(totals.estimatedCostUSD));
        setText("cost-description", "설정된 가격 기준 예상 비용");
    } else {
        setText("total-cost", "미설정");
        setText("cost-description", "모델별 API 가격 정보가 필요합니다.");
    }

    if (data.updatedAt) {
        const updatedDate = new Date(data.updatedAt);

        setText(
            "updated-at",
            Number.isNaN(updatedDate.getTime())
                ? data.updatedAt
                : updatedDate.toLocaleString("ko-KR")
        );
    } else {
        setText("updated-at", "기록 없음");
    }

    renderDailyChart(data.daily);
    renderHistory(data.daily, pricingConfigured);
}

async function loadUsageData() {
    try {
        const response = await fetch("data/usage.json", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("사용량 데이터를 불러오지 못했습니다. HTTP " + response.status);
        }

        const data = await response.json();
        renderDashboard(data);

    } catch (error) {
        console.error("API 사용량 데이터 오류:", error);

        document.getElementById("daily-chart").innerHTML = `
            <p class="loading-message">
                데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
        `;

        document.getElementById("usage-history").innerHTML = `
            <tr>
                <td colspan="6">데이터를 불러오지 못했습니다.</td>
            </tr>
        `;

        setText("updated-at", "데이터 연결 실패");
    }
}

loadUsageData();
