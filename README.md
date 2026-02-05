# winna plinko audit

provably fair audit for winna.com plinko

full report -> **[AUDIT_SUMMARY.md](AUDIT_SUMMARY.md)**

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
```

## data collection

used the chrome extension (`chrome-extension/` folder) to intercept game API calls. load it as unpacked in chrome, play plinko on winna, export from popup.

had to go this route because the game runs in an iframe and devtools console injection doesnt work properly.
