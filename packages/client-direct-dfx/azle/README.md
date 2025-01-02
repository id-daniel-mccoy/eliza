## Eliza Azle Server
### Version 0.2.8

This version of Eliza requires NodeJS v23.3.0 and DFX 0.22.0

### To Setup:

```
git clone -b eliza-azle https://github.com/id-daniel-mccoy/eliza.git
cd eliza
pnpm i
pnpm build
cd packages/client-direct-dfx/azle
npm install
cd ../
npm run prepare-ic
cd ../../
pnpm build
bash ./scripts/collect-dists.sh
pnpm build
```

### To Run Base Server Without IC:

```
pnpm start
```

### To Test IC Development Version:

```
cd packages/client-direct-dfx/azle
dfx start --clean --background
dfx canister create --all
dfx build
dfx deploy
```

Check the test-commands.txt file for ways to test the current endpoints using the get and post calls.