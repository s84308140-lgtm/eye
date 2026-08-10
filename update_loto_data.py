#!/usr/bin/env python3
from pathlib import Path
import csv, io, json, re, urllib.request
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "lotodata.json"

SOURCES = {
    "loto6": {
        "url": "https://www.japannetbank.co.jp/lottery/co/loto6jnb.csv",
        "picks": 6,
        "bonus": 1,
    },
    "loto7": {
        "url": "https://www.japannetbank.co.jp/lottery/co/loto7jnb.csv",
        "picks": 7,
        "bonus": 2,
    },
    "miniloto": {
        "url": "https://www.japannetbank.co.jp/lottery/co/minilotojnb.csv",
        "picks": 5,
        "bonus": 1,
    },
}

def fetch_csv(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; LotoNoMeUpdater/1.1)",
            "Accept": "text/csv,*/*;q=0.8",
            "Accept-Language": "ja-JP,ja;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read()
    for enc in ("cp932", "shift_jis", "utf-8-sig", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise RuntimeError("CSVの文字コードを判定できませんでした")

def parse_round(value):
    m = re.search(r"(\d+)", str(value))
    return int(m.group(1)) if m else None

def parse_game(text, picks, bonus_count):
    rows = csv.DictReader(io.StringIO(text))
    records = []
    for row in rows:
        round_no = parse_round(row.get("回号", ""))
        if not round_no:
            continue
        nums = []
        for i in range(1, picks + 1):
            key = f"抽せん数字{i}"
            # CSV uses full-width numerals
            if key not in row:
                fw = str(i).translate(str.maketrans("1234567890", "１２３４５６７８９０"))
                key = f"抽せん数字{fw}"
            try:
                nums.append(int(str(row[key]).strip()))
            except Exception:
                nums = []
                break
        if len(nums) != picks:
            continue
        bonuses = []
        for i in range(1, bonus_count + 1):
            candidates = ["ボーナス数字"]
            if bonus_count > 1:
                fw = str(i).translate(str.maketrans("1234567890", "１２３４５６７８９０"))
                candidates = [f"ボーナス数字{i}", f"ボーナス数字{fw}"]
            val = None
            for k in candidates:
                if k in row and str(row[k]).strip():
                    val = row[k]
                    break
            if val is not None:
                try:
                    bonuses.append(int(str(val).strip()))
                except Exception:
                    pass

        records.append({
            "round": round_no,
            "date": str(row.get("抽せん日", "")).strip().replace("/", "-"),
            "numbers": sorted(nums),
            "bonus": bonuses,
        })
    return records

def merge(existing, incoming):
    by_round = {int(x["round"]): x for x in existing if "round" in x}
    before = len(by_round)
    for item in incoming:
        by_round[int(item["round"])] = item
    merged = [by_round[k] for k in sorted(by_round)]
    return merged, len(merged) - before

def main():
    data = json.loads(DB.read_text(encoding="utf-8"))
    total_added = 0

    for game, cfg in SOURCES.items():
        text = fetch_csv(cfg["url"])
        incoming = parse_game(text, cfg["picks"], cfg["bonus"])
        if not incoming:
            raise RuntimeError(f"{game}: CSVからデータを取得できませんでした")
        data.setdefault(game, [])
        data[game], added = merge(data[game], incoming)
        total_added += max(0, added)
        latest = data[game][-1]["round"] if data[game] else "-"
        print(f"{game}: {len(data[game])}件 / +{added} / 最新 第{latest}回")

    data["version"] = "1.2"
    data["updated"] = date.today().isoformat()
    data["source_latest"] = "PayPay銀行 当せん情報CSV"
    DB.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"TOTAL ADDED: {total_added}")

if __name__ == "__main__":
    main()
