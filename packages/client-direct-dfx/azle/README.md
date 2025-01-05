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
pnpm build ./scripts/collect-dists.sh
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

Deployment and Testing

1. Start the Local Replica

dfx start --background

2. Deploy the Canister

dfx deploy

3. Initialize the Canister

Before using other methods, initialize the canister to set up the database.

dfx canister call backend init '()'
Expected Output:

(ok "Initialization complete.")

4. Register an Agent

dfx canister call backend registerAgent '("Eliza")'
Expected Output:

(ok "Agent \"Eliza\" registered with ID 123e4567-e89b-12d3-a456-426614174000.")

5. List Agents

dfx canister call backend listAgents '()'
Expected Output:

(ok "{\"agentIds\":[\"123e4567-e89b-12d3-a456-426614174000\"]}")

6. Send a Message to an Agent

dfx canister call backend message '("123e4567-e89b-12d3-a456-426614174000", "Hello from user!")'
Expected Output:

(ok "{\"response\":\"Agent \\\"Eliza\\\" echo: Hello from user!\"}")

7. Unregister an Agent

dfx canister call backend unregisterAgent '("123e4567-e89b-12d3-a456-426614174000")'
Expected Output:

(ok "Agent 123e4567-e89b-12d3-a456-426614174000 unregistered successfully.")

8. Upgrade the Canister

To test persistence across upgrades:

Make any changes to your canister code (e.g., update a message).

Deploy the Canister Again:

dfx deploy
List Agents Again:

dfx canister call backend listAgents '()'
Expected Output:

(ok "{\"agentIds\":[\"123e4567-e89b-12d3-a456-426614174000\"]}")
This confirms that the database persisted across the upgrade.
