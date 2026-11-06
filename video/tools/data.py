"""Pulls the real numbers the scenes show from the committed dataset into src/data.json:
    python3 tools/data.py
- a sample of real PoolManager Initialize events (data/pools.json)
- the money trace of the measured swap through hook 0x676E... (data/sim-results.json)
"""
import json

pools = json.load(open("../data/pools.json"))["pools"]
sims = json.load(open("../data/sim-results.json"))["results"]

# Initialize events: 36 real hooked pools spread over the whole range, in block order.
by_block = sorted(pools, key=lambda p: (p["blockNumber"], p["logIndex"]))
step = len(by_block) // 36
events = []
for p in by_block[::step][:36]:
    events.append({
        "block": p["blockNumber"], "id": p["poolId"], "pair": f'{p.get("symbol0") or "?"} / {p.get("symbol1") or "?"}',
        "fee": "dynamic" if p["isDynamicFee"] else f'{p["fee"] / 10000:g}%', "tickSpacing": p["tickSpacing"], "hooks": p["hooks"],
    })

HOOK = "0x676e38b66a7547ff685549e4ad88134ac62200cc"
sim = next(s for s in sims if s["hook"].lower() == HOOK and s["scenario"] == "today")
pool = next(p for p in pools if p["poolId"] == sim["poolId"])
dec = {pool["currency0"].lower(): pool["decimals0"], pool["currency1"].lower(): pool["decimals1"]}
sym = {pool["currency0"].lower(): pool.get("symbol0") or "?", pool["currency1"].lower(): pool.get("symbol1") or "?"}
if pool["currency0"] == "0x0000000000000000000000000000000000000000":
    sym[pool["currency0"].lower()] = "ETH"

def amt(token, raw):
    return int(raw) / 10 ** dec[token.lower()]

directions = []
for d in sim["directions"]:
    directions.append({
        "tokenIn": sym[d["tokenIn"].lower()], "tokenOut": sym[d["tokenOut"].lower()],
        "amountIn": amt(d["tokenIn"], d["amountIn"]), "amountOut": amt(d["tokenOut"], d["amountOut"]),
        "takeBps": d["takeBps"], "lpFeeBps": d["lpFeeBps"],
        "flows": [{"role": f["role"], "address": f["address"], "token": sym[f["token"].lower()], "amount": amt(f["token"], f["amount"]), "kind": f["kind"]} for f in d["flows"]],
    })

json.dump({
    "events": events,
    "trace": {"hook": sim["hook"], "poolId": sim["poolId"], "pair": f'{sym[pool["currency0"].lower()]} / {sym[pool["currency1"].lower()]}',
              "forkBlock": sim["forkBlock"], "takeBps": sim["measuredTakeBps"], "lpFeeBps": sim["lpFeeBps"], "directions": directions},
}, open("src/data.json", "w"), indent=1)
print(len(events), "events;", "trace", json.dumps(directions)[:600])
