# Cryptographic Verification Report

## Status: COMPLETE

## Algorithm Discovery

After going through winna's frontend JavaScript (chunk `XwnR1nwE.chunk.js`), I found the actual plinko algorithm they use. Turns out its completely different from the per-pin L/R approach that most provably fair plinko games use (Stake, etc).

### How winna's plinko works

1. **Byte Generator** (Stake-style): `HMAC-SHA256(serverSeed, clientSeed:nonce:cursor)` using `js-sha256` v0.10.1. Each HMAC produces 32 bytes. Cursor starts at 0 and increments when more bytes are needed.

2. **Float Generation**: 4 bytes from the generator are converted to a single normalized float:
   ```
   float = byte[0]/256 + byte[1]/65536 + byte[2]/16777216 + byte[3]/4294967296
   ```

3. **Bucket Determination**: The single float is mapped against a **cumulative probability distribution table** specific to (difficulty, pins). NOT individual pin decisions - the ball doesn't bounce left/right per row. Instead, the probability of landing in each bucket is pre-calculated and the float indexes into the cumulative distribution.

4. **Payout**: `PAYOUTS[difficulty][pins][bucket]` gives the multiplier.

### Why this matters

Most provably fair plinko out there (Stake, etc) generates one random bit per pin row, basically simulating the physical board. Winna skips that entirely and jumps straight to the bucket using weighted probabilities. For low/medium/high difficulties, the probability distributions closely resemble binomial distributions (bell-shaped, symmetric). Extreme is intentionally different - its probability distribution is nearly uniform across the middle buckets with very small weights on the edges, creating a lottery-style experience where the rare edge hits pay 2000x/100x but most results land in 0x territory.

All four difficulties end up at roughly 98% theoretical RTP. Extreme gets there by concentrating large payouts on extremely rare edge buckets while making the rest zero - the math still works out to ~98% return. I initially thought extreme had ~11% RTP but that was wrong - I was applying binomial probabilities when the actual distribution is completely different. Once I extracted the real probability table from winna's source, extreme came out to ~98% like everything else.

### Key implementation detail

The server seed is passed as a **string** to HMAC (not as a Buffer from hex). The js-sha256 library handles string keys differently than Node.js crypto with Buffer keys. This tripped me up for a while - my initial attempts using `Buffer.from(serverSeed, 'hex')` as the HMAC key kept failing until I figured out the library difference.

## Verification Results

### Round 2 (30 bets, medium, 16 pins)

- **Client Seed**: `bc0077399f741f4e44c0d257820c0b55aa64f5836ab69f598c876f14205eee2e`
- **Server Seed (hashed)**: `68f05ff8f0033b6e9939dfb3180db640f1650c2dd9fac3cecd2d797b9e63116b`
- **Server Seed (revealed)**: `59436d5114d239bc388947e9dcbe9546532bf9b8b1bd96669550ca124330d244`
- **Nonce range**: 1-30 (confirmed via winna History tab)
- **Commitment Valid**: YES - `SHA-256(revealed) == hashed`
- **Bet-by-bet Verification**: **30/30 (100%)**
- **Nonce Sequence**: Continuous, no gaps, no duplicates
- **Verify Tab Cross-check**: 6/6 (nonces 0-5)

### Round 3 (60 bets, high, 16 pins)

- **Client Seed**: `8847c9300016f0fba472f2671c3abb45d960de730b25ae5249df2cca603c57d9`
- **Server Seed (hashed)**: `0a007244626efb8b0f929f42aea411537df15b44281be88bb7caa4ae78911631`
- **Server Seed (revealed)**: `9932862dad02e165c8295be73b76e8fb0d04d8aa4126d8bbdf56d39710d21066`
- **Nonce range**: 1-60 (confirmed via winna History tab)
- **Commitment Valid**: YES - `SHA-256(revealed) == hashed`
- **Bet-by-bet Verification**: **60/60 (100%)**
- **Nonce Sequence**: Continuous, no gaps, no duplicates
- **Note**: Different difficulty from round 2 (high vs medium). Confirms algorithm works across difficulties.

### Round 1 (100 bets, low, 16 pins)

- **Client Seed**: `fddbb729d14e56a1e401ab25b9d030a56d9c91dcf487efa2b74c97c0c425003f`
- **Server Seed (hashed)**: `653965ec7984edb3a092d2cf858e69502b7f992f08d42c9b129c92ad95816972`
- **Server Seed (revealed)**: `5cecf5e69f10c072cc3753688f8c32a772afee990bce5095d2a5107839518958`
- **Commitment Valid**: YES - `SHA-256(revealed) == hashed`
- **Bet-by-bet Verification**: **100/100 (100%)**
- **Nonce Sequence**: Continuous 1-100, no gaps
- **Note**: Originally thought nonce mapping was lost due to autobet response reordering. Turns out the initial verification failed because the low probability table wasnt in the verifier yet. After extracting all tables from the source, retroactive verification showed nonces 1-100 sequential - all bets match.

### Round 4 (active)

- **Client Seed**: `52a03df6c08224825098719e58b06cbe52145d08161be2dc2b7aa1c6c59b8d39`
- **Server Seed (hashed)**: `bf1f57702cbe7922bfa04bab047e2485bed6351d4412327f0d816fd23c4b8f27`
- Not yet rotated

## Critical Findings

### 1. API does not return nonce per bet

The `/plinko/play` API response:
```json
{
    "id": 663543297,
    "multiplier": 0.5,
    "wager": 0.01,
    "profit": 0.005,
    "data": { "difficulty": "medium", "pins": 16, "bucket": 7 }
}
```

No nonce, no client seed, no server seed hash. The nonce is only tracked in the frontend JS counter. If using autobet, HTTP responses can arrive out of order and nonce mapping is lost.

History tab shows them after you rotate seeds which is something, but ideally the API would just include the nonce with each bet.

### 2. $0 bets dont increment nonce

Zero-amount bets (even with a logged-in account) do not increment the nonce on the server side. If you play a $0 bet, the server just ignores it for nonce tracking purposes. This means you can't use $0 bets to test nonce behavior or verify outcomes cheaply - the nonce sequence only advances on real-money bets.

### 3. Client seed not user-choosable

Winna generates the client seed automatically. Players can't set their own. The casino controls both seeds at commitment time. Commit-reveal still prevents them from changing seeds after the fact, but a player cant be sure the pair wasnt cherry-picked.

Standard practice (Stake, BC.Game) lets players freely change their client seed.

### 4. House edge applied to displayed multipliers

The History tab shows multipliers with house edge applied:
- 0.49x instead of 0.5x (bucket 7/9)
- 0.99x instead of 1x (bucket 6/10)
- 1.49x instead of 1.5x (bucket 5/11)

The verify tab shows the raw multipliers (0.5x, 1x, 1.5x). Doesnt affect fairness but its confusing when youre trying to cross-check your bets manually.

### 5. Probability distribution approach vs pin simulation

Winna doesnt simulate the plinko board. Instead of generating 16 random L/R decisions per ball, they generate one random float and map it to a pre-calculated probability distribution. Works fine mathematically but the ball animation you see is fake - its reconstructed from whatever bucket the number landed on, not from actual pin bounces.

## Tests Performed

- [x] Commitment verification (SHA-256 match) - 3 rounds PASSED
- [x] Bet-by-bet outcome verification - 100/100 round 1 (low), 30/30 round 2 (medium), 60/60 round 3 (high)
- [x] Nonce sequence continuity - continuous, no gaps
- [x] Verify tab cross-check - 6/6
- [x] Algorithm reverse-engineering from source code
- [x] Response ordering analysis (autobet reorders responses)
- [x] Cross-difficulty verification - all 3 difficulties verified (low 100/100, medium 30/30, high 60/60)
- [x] Multiple seed pair rotations - 3 rotations completed, chain intact
- [x] All probability tables extracted (low/medium/high/extreme, 8-16 pins)
- [ ] Client seed independence (would require cooperation from winna)

## Methodology

1. Built Chrome extension (MV3) to intercept `/plinko/play` API responses
2. Used the provided test account to play bets across multiple seed pair rotations
3. Captured bet data, rotated seeds to reveal server seed
4. Tried to crack the algorithm by brute-force testing different approaches (went through 60+ variants before finding the source)
5. Downloaded winna's frontend JS via Chrome page save
6. Identified lazy-loaded chunk `XwnR1nwE.chunk.js` containing actual verification code
7. Extracted byte generator, float generation, and probability distribution logic
8. Extracted ALL probability tables for every difficulty (low/medium/high/extreme) and pin count (8-16)
9. Implemented independent verifier and achieved 190/190 match across 3 difficulties (low 100/100, medium 30/30, high 60/60)
10. Verified 3 seed pair commitments across 3 rotations
