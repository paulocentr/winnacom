# Winna Plinko - Fairness & RTP Audit

https://winna.com/game/originals/plinko

## TL;DR

The game is fair across all four difficulties (~98% theoretical RTP for low/medium/high/extreme). After reverse-engineering the actual algorithm from winna's frontend source code, I verified **190 out of 190 bets cryptographically** across three difficulties (low, medium and high) using a funded test account and 3 seed rotations. The algorithm is legit but has some transparency issues: players cant choose their own client seed, the API doesnt return nonces per bet, and the plinko animation is cosmetic (outcomes are determined by a probability table, not pin-by-pin physics). Extreme mode looks scary (skull icons on 13 of 17 slots) but mathematically the RTP is the same ~98% as the other modes - its just high variance.

Full cryptographic verification details: **[report/CRYPTO_REPORT.md](report/CRYPTO_REPORT.md)**

## 1. How the Verifier Works

**Important:** Winna does NOT use the common per-pin left/right approach like Stake. I had to reverse-engineer their actual algorithm from the frontend JavaScript source code (lazy-loaded chunk `XwnR1nwE.chunk.js`). See [report/CRYPTO_REPORT.md](report/CRYPTO_REPORT.md) for the full discovery process.

**How outcomes are actually generated:**
1. **Byte generator**: `HMAC-SHA256(serverSeed, clientSeed:nonce:cursor)` using js-sha256 v0.10.1. Each HMAC gives 32 bytes, cursor starts at 0 and increments when more bytes are needed
2. **Float generation**: Take 4 bytes, convert to float: `b0/256 + b1/65536 + b2/16777216 + b3/4294967296`
3. **Bucket determination**: The single float is compared against a cumulative probability distribution table for that difficulty/pins combination. First bucket where the cumulative sum exceeds the float wins
4. Bucket maps to multiplier from the payout table

This is NOT a pin-by-pin simulation. The ball doesnt bounce left/right per row - instead one random number directly picks the final bucket. The visual ball animation you see on screen is cosmetic, reconstructed from the result. For low/medium/high the distribution is symmetric and resembles binomial coefficients. Extreme uses a completely different distribution (nearly uniform across middle buckets, computed dynamically with a `zi = 0.98` scaling constant).

Deterministic - same seeds + nonce = same result every time.

**Seed commitment:** Server seed gets hashed (SHA-256) before player sees it, then revealed after rotation. Normal commit-reveal flow. Works correctly - I verified 3 seed pair commitments across 3 rotations.

**Verifier validation against real bets:** Using the provided test account, I played bets across multiple difficulties, rotated seed pairs, then verified every single bet against our independent verifier:

- **Round 1 (low/16)**: 100/100 bets matched (100%)
- **Round 2 (medium/16)**: 30/30 bets matched (100%)
- **Round 3 (high/16)**: 60/60 bets matched (100%)
- **Total: 190/190 verified** - every bucket and multiplier was correct across 3 difficulties
- **Commitment valid** - 3 seed pair commitments verified (SHA-256 match)
- **Nonce sequence continuous** - no gaps or duplicates in any round
- **Cross-checked with winna's Verify tab** - 6/6 additional matches

## 2. Payout Tables (16 Pins)

Got these directly from the game UI:

| Slot | Low | Medium | High | Extreme |
|------|-----|--------|------|---------|
| 0 | 16x | 110x | 1000x | 2000x |
| 1 | 9x | 41x | 130x | 100x |
| 2 | 2x | 10x | 26x | 0x (skull) |
| 3 | 1.4x | 5x | 9x | 0x |
| 4 | 1.4x | 3x | 4x | 0x |
| 5 | 1.2x | 1.5x | 2x | 0x |
| 6 | 1.1x | 1x | 0.2x | 0x |
| 7 | 1x | 0.5x | 0.2x | 0x |
| 8 | 0.5x | 0.3x | 0.2x | 0x |
| 9-16 | (mirror) | (mirror) | (mirror) | (mirror) |

Extreme is fundamentally different from the other three - it shows skull icons for slots 2 thru 14 meaning 0x (you lose everything). Only the very edges pay: 2000x on slot 0/16 and 100x on slot 1/15. So its basically a lottery, hit the edge or bust.

*(screenshots: `screenshots/payout_low.png`, `screenshots/payout_medium.png`, `screenshots/payout_high.png`, `screenshots/payout_extreme.png`)*

## 3. Empirical Results

I collected 1000 live samples per difficulty using a chrome extension that hooks into the `/plinko/play` fetch calls. All at 16 pins.

### How I collected the data

The game runs inside an iframe on `games.winna.com` so you cant just paste a fetch interceptor in the console - the execution context is wrong. I tried the devtools context switcher (both "plinko" and "games.winna.com" options) and it still didnt work. Ended up building a Chrome MV3 extension with `"world": "MAIN"` and `"all_frames": true` so it injects at `document_start` before the games Vue.js bundle loads. That worked.

### Results

| Difficulty | Samples | Observed RTP | Chi-sq | Fair? |
|-----------|---------|-------------|--------|-------|
| Low | 1,000 | 98.35% | 15.61 | yes |
| Medium | 1,000 | 93.31% | 6.80 | yes |
| High | 1,000 | 85.08% | 5.16 | yes |
| Extreme | 1,000 | 110.00% | 6354 | * |

Chi-sq critical = 26.3 at p=0.05, df=16.

Low/Medium/High all pass chi-squared comfortably. The distributions look like what you'd expect from a binomial.

Extreme is weird but makes sense when you think about it. Chi-sq is 6354 which looks scary but thats compared to a binomial distribution, and extreme intentionally doesnt follow binomial. The actual probability distribution extracted from winna's source is nearly uniform across the middle buckets (each around ~7.65% for 16 pins) with tiny weights on the edges. This means most bets land in 0x territory, but the rare edge hits (2000x, 100x) make up for it mathematically. The theoretical RTP is actually ~98% same as the other difficulties - just much higher variance. 989 out of 1000 samples were 0x, 11 hit 100x, zero hit 2000x. The 110% observed RTP is just variance from those lucky 100x hits.

## 4. Simulation

100k simulated rounds, medium difficulty, 16 pins:
- RTP: 98.74%
- Chi-sq: 11.02 (fair, well under 26.3)

Looks good. Simulation now uses the actual algorithm (byte generator + cumulative probability distribution, same as winna's implementation). Distribution matches the probability table exactly.

**Theoretical RTP from the payout tables:**

| Difficulty | 8 pins | 12 pins | 16 pins |
|-----------|--------|---------|---------|
| Low | 98.00% | 98.00% | 98.00% |
| Medium | 98.00% | 98.00% | 98.00% |
| High | 98.00% | 98.00% | 98.00% |
| Extreme | ~98% | ~98% | ~98% |

All four difficulties are at 98% theoretical RTP. Already covered how extreme works above - tldr the `zi = 0.98` constant in their formula literally sets the return rate. Same house edge, way more variance.

## 5. Security

| Test | Result | Notes |
|------|--------|-------|
| HMAC vs SHA256 | pass | using HMAC (good, not vuln to length extension) |
| Bucket Symmetry | pass | 50.15/49.85% over 50k samples |
| Distribution | pass | chi-sq 22.98 |
| Nonce Overflow | pass | no collision at 2^32 |
| Modulo Bias | pass | float method, no bias |
| Timing | pass | 1.0us diff edge vs mid, no leak |
| Determinism | pass | same in = same out |

**Couldnt test** (need real money/api access):
- Race condition / double-bet
- Cashout replay
- Nonce replay via API
- Server-side timing analysis

## 6. Performance Notes

API response time is solid, around 200ms avg. No issues there.

The client side tho - after running like 1000+ rounds on autobet the game gets really slugish. Frame drops, laggy ball animations, the whole thing bogs down. Server is still responding fast but the frontend cant handle it. Probably accumulated DOM elements from all the ball animations not getting cleaned up. Vue.js rendering pipeline isnt optimized for this kind of high-frequency update. Doesnt affect fairness at all since outcomes are server-side, but its annoying and they should fix it.

## 7. Fairness System & Limitations

### Provably Fair Modal

Accessible from the "Fairness" link in the footer. Three tabs:

**Overview** - explains their algo, mentions server seed (hashed), client seed, nonce incrementing per bet, seed rotation reveals previous. Standard commit-reveal stuff. However their description says "16 results are generated, one for each row" which suggests a per-pin approach - but the actual code uses a single-float probability distribution. The overview description doesnt match the implementation.
*(screenshot: `screenshots/fairness_overview.png`)*

**History** - shows bet history with nonces after the seed pair is rotated. Works correctly with funded accounts. I used this to confirm nonces 1-30 for my verified round. Without real money bets it shows empty.
*(screenshot: `screenshots/fairness_history.png`)*

**Verify** - has all the right fields (Game, Rows, Risk, Client Seed, Server Seed, Nonce). Tested with real revealed seeds and it works - matches our independent verifier output.
*(screenshots: `screenshots/fairness_verify_empty.png`, `screenshots/fairness_verify.png`)*

**Seed rotation works with funded accounts.** The initial error I saw (HTTP 500 / "Not found any seeds") was because seeds arent generated until you make real money bets. Once you play with real funds, the seed system works correctly - you can rotate pairs and get the revealed server seed. The error handling could be better tho (should say "no bets found" instead of a 500).

### Issues Found

1. **Client seed not user-choosable** - winna generates the client seed automatically. Players cant set their own. Standard practice (Stake, BC.Game) lets you freely change it. Since the casino controls both seeds at commitment time, a player cant be sure the pair wasnt cherry-picked. Commit-reveal still prevents changing seeds after the fact, but this weakens the provably fair guarantee.

2. **API doesnt return nonce per bet** - the `/plinko/play` response has bet id, multiplier, wager, profit, difficulty, pins, bucket - but no nonce, no seed info. The nonce is only tracked in the frontend JS counter. If you use autobet, HTTP responses can arrive out of order and nonce mapping gets lost. The History tab shows nonces retroactively after rotation, which helps, but the ideal implementation returns the nonce with each bet.

3. **House edge in displayed multipliers** - the History tab shows multipliers with house edge baked in (0.49x instead of 0.5x, 0.99x instead of 1x, 1.49x instead of 1.5x). The Verify tab shows the raw multipliers (0.5x, 1x, 1.5x). This is confusing when trying to manually cross-check.

4. **Probability distribution vs pin simulation** - the ball animation on screen doesnt reflect the actual random process. There are no 16 random left/right decisions - just one random number picking a bucket. The animation is reconstructed from the final result. Not wrong mathematically, but the animation makes you think theres 16 random bounces when there arent.

5. **$0 bets dont increment nonce** - zero-amount bets (even with a logged-in account) do not advance the server-side nonce. This means you cant use $0 bets to test verification cheaply - only real-money bets count for the nonce sequence.

### What I Confirmed
- HMAC-SHA256 with js-sha256 v0.10.1 (server seed as string key, not hex buffer)
- Commit-reveal works correctly (3 seed pairs verified across 3 rotations)
- Nonces start at 1 and increment per real-money bet ($0 bets dont count)
- 190/190 bets verified cryptographically (100 low + 30 medium + 60 high)
- Cross-difficulty verification works (same algorithm, different probability tables)
- All probability tables extracted for all 4 difficulties and pin counts 8-16
- Payout tables match whats actually paid
- All difficulties have ~98% theoretical RTP including extreme

### What Could Still Be Done
- Race condition testing with real bets
- Test client seed independence (would need cooperation from winna)
- Larger statistical sample collection (5k+ per difficulty for tighter confidence)

## 8. Conclusion

Game is fair. Numbers check out both statistically (RTP, chi-squared, distribution) and cryptographically (190/190 bets verified across 3 difficulties and 3 seed rotations). Algorithm works, commit-reveal works, same inputs always give same outputs.

All four difficulties at ~98% RTP including extreme (already explained above - its just high variance not a worse deal).

Transparency could be better tho:
1. Players cant choose their own client seed - casino picks both seeds at commitment time which weakens the provably fair guarantee
2. API doesnt return nonces per bet - makes verification harder especially with autobet where responses come back out of order
3. $0 bets dont increment nonces so you cant verify cheaply
4. Plinko animation is cosmetic, actual algorithm uses a probability distribution not pin physics
5. Their own docs describe a per-pin approach that doesnt match their code

Bottom line: game IS fair and outcomes ARE verifiable. Winna should let players set their own client seed tho, thats the biggest gap.

## Files

| File | Description |
|------|------------|
| `src/verifier.js` | Plinko verifier (byte generator + probability distribution, all difficulties/pins) |
| `src/verify-bets.js` | Batch bet verification against exported data |
| `src/simulation.js` | RTP simulation using actual winna algorithm |
| `src/extract-tables.js` | Probability table extraction from winna source |
| `src/analyze-samples.js` | Sample analysis |
| `src/exploit-tests/` | Security tests |
| `chrome-extension/` | Data collection extension (MV3) |
| `data/` | Bet exports, verification results, seed pairs |
| `report/CRYPTO_REPORT.md` | Full cryptographic verification report |

## Running it

```
npm test              # verifier test + seed verification
npm run simulate      # 100k RTP sim
npm run crypto        # crypto/distribution checks
npm run nonce         # nonce edge cases
npm run timing        # timing analysis
```
