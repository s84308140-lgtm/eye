const LOTTERY_SETTINGS = {
  loto6: {
    name: "ロト6",
    url: "https://www.mizuhobank.co.jp/takarakuji/check/loto/loto6/index.html",
    mainCount: 6,
    bonusCount: 1,
  },
  loto7: {
    name: "ロト7",
    url: "https://www.mizuhobank.co.jp/takarakuji/check/loto/loto7/index.html",
    mainCount: 7,
    bonusCount: 2,
  },
  miniloto: {
    name: "ミニロト",
    url: "https://www.mizuhobank.co.jp/takarakuji/check/loto/miniloto/index.html",
    mainCount: 5,
    bonusCount: 1,
  },
};

function removeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractResult(text, type) {
  const setting = LOTTERY_SETTINGS[type];

  const drawPattern = new RegExp(
    `${setting.name}\\s*第\\s*(\\d+)\\s*回\\s*(\\d{4})年\\s*(\\d{1,2})月\\s*(\\d{1,2})日\\s*抽せん`
  );

  const drawMatch = text.match(drawPattern);

  if (!drawMatch) {
    throw new Error("抽せん回と日付を読み取れませんでした");
  }

  const drawNumber = Number(drawMatch[1]);
  const year = Number(drawMatch[2]);
  const month = Number(drawMatch[3]);
  const day = Number(drawMatch[4]);

  const startIndex = drawMatch.index;
  const resultArea = text.slice(startIndex, startIndex + 1500);

  const numberMatches = [
    ...resultArea.matchAll(/(?:^|\s)(0?[1-9]|[1-3][0-9]|4[0-3])(?=\s|$)/g),
  ].map((match) => Number(match[1]));

  const requiredCount = setting.mainCount + setting.bonusCount;
  const numbers = numberMatches.slice(0, requiredCount);

  if (numbers.length < requiredCount) {
    throw new Error("当せん数字をすべて読み取れませんでした");
  }

  return {
    type,
    lotteryName: setting.name,
    drawNumber,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    mainNumbers: numbers.slice(0, setting.mainCount),
    bonusNumbers: numbers.slice(setting.mainCount, requiredCount),
    source: setting.url,
    fetchedAt: new Date().toISOString(),
  };
}

export default async (request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  try {
    const requestUrl = new URL(request.url);
    const type = requestUrl.searchParams.get("type") || "loto7";
    const setting = LOTTERY_SETTINGS[type];

    if (!setting) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "typeは loto6、loto7、miniloto のいずれかを指定してください",
        }),
        {
          status: 400,
          headers,
        }
      );
    }

    const response = await fetch(setting.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Loto-no-Me/0.6",
        "Accept-Language": "ja-JP,ja;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`公式ページの取得に失敗しました: ${response.status}`);
    }

    const html = await response.text();
    const text = removeHtml(html);
    const result = extractResult(text, type);

    return new Response(
      JSON.stringify({
        ok: true,
        result,
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "不明なエラーが発生しました",
      }),
      {
        status: 500,
        headers,
      }
    );
  }
};
