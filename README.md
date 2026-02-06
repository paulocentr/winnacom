# winna plinko audit

provably fair audit for winna.com plinko

## reports

- **[AUDIT_SUMMARY.md](AUDIT_SUMMARY.md)** - statistical audit (RTP, distribution, security)
- **[report/CRYPTO_REPORT.md](report/CRYPTO_REPORT.md)** - cryptographic verification (bet-by-bet proof with real seeds)

## setup

```
npm install
```

## run

```
npm test              # verifier + seed verification
npm run simulate      # 100k RTP sim
npm run crypto        # crypto checks
npm run nonce         # nonce edge cases
npm run timing        # timing analysis
npm run analyze <file> # analyze sample data
npm run verify-bets <export.json> <revealed_server_seed>  # cryptographic bet verification
```

## cryptographic verification workflow

1. note your current seed pair (client seed, hashed server seed, nonce)
2. play bets with the chrome extension capturing API responses
3. export from extension popup
4. rotate seeds on winna ("Change Pair and Unhash Server seed")
5. copy the revealed (unhashed) server seed
6. run `npm run verify-bets -- data/export.json <revealed_seed>`

this verifies: commitment (SHA-256 hash match), every bet outcome, nonce sequence

## data collection

used the chrome extension (`chrome-extension/` folder) to intercept game API calls. load it as unpacked in chrome, play plinko on winna, export from popup.

had to go this route because the game runs in an iframe and devtools console injection doesnt work properly.
