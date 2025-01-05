// src/backend/index.ts

import "./transform_stream_shim";

import { query, Server, text, update, ic } from "azle/experimental";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import multer from "multer";
import { createServer } from "http"; // Import to create an http.Server
import { settings } from "../../dist/core"; // Adjust the path as necessary
import { createApiRouter } from "../../../src/api"; // Adjust the path as necessary
import { v4 as uuidv4 } from "uuid"; // Ensure this is installed
import { composeContext } from "@ai16z/eliza"; // Adjust or remove based on actual usage
import { generateMessageResponse } from "@ai16z/eliza"; // Adjust or remove based on actual usage
import { messageCompletionFooter, ModelClass } from "@ai16z/eliza"; // Adjust or remove based on actual usage

// New Imports for Agent Management
import {
    registerNewAgent,
    unregisterExistingAgent,
    listAgentIds,
} from "./agent";

import { db, initDb, preUpgradeHook, postUpgradeHook } from "./db";

// Move the agents map to the top-level scope
const agents = new Map<string, any>(); // Update type as necessary

const logger = async (message: text) => {
    ic.print(message);
};

export default Server(
    () => {
        // Initialize the database asynchronously
        // Since Server expects a synchronous function, initialize without awaiting
        // Lifecycle hooks will handle initialization
        console.log("Server setup: initializing database asynchronously...");
        initDb().catch((err) => {
            console.error("Database initialization failed:", err);
        });

        const app = express();
        const server = createServer(app); // Wrap express in an HTTP server
        const upload = multer({ storage: multer.memoryStorage() });

        // Middleware setup
        app.use(cors());
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));

        ic.print("Server setup complete, initializing API routes...");

        // API router
        const apiRouter = createApiRouter(agents);
        app.use(apiRouter);

        console.log("API routes initialized.");

        // Test API Endpoints
        app.get("/http-query", (_req, res) => {
            res.send("http-query-server");
        });

        app.post("/http-update", (_req, res) => {
            res.send("http-update-server");
        });

        app.get("/agents", (_req, res) => {
            const agentIds = Array.from(agents.keys());
            console.log("Listing all agent IDs: ", agentIds);
            res.json({ agentIds });
        });

        // // Whisper endpoint
        // app.post(
        //     "/:agentId/whisper",
        //     upload.single("file"),
        //     async (req, res) => {
        //         console.log("Received request on /:agentId/whisper");
        //         console.log("Headers: ", req.headers);
        //         console.log("File metadata: ", req.file);
        //         console.log("Agent ID: ", req.params.agentId);

        //         const audioFile = req.file;
        //         const agentId = req.params.agentId;

        //         if (!audioFile) {
        //             console.error("No audio file provided");
        //             res.status(400).send("No audio file provided");
        //             return;
        //         }

        //         let runtime = agents.get(agentId);

        //         if (!runtime) {
        //             runtime = Array.from(agents.values()).find(
        //                 (a: any) =>
        //                     a.character.name.toLowerCase() ===
        //                     agentId.toLowerCase()
        //             );
        //         }

        //         if (!runtime) {
        //             console.error("Agent not found: ", agentId);
        //             res.status(404).send("Agent not found");
        //             return;
        //         }

        //         try {
        //             const formData = new FormData();
        //             const audioBlob = new Blob([audioFile.buffer], {
        //                 type: audioFile.mimetype,
        //             });
        //             formData.append("file", audioBlob, audioFile.originalname);
        //             formData.append("model", "whisper-1");

        //             console.log("Sending request to external API...");

        //             const response = await fetch(
        //                 "https://api.openai.com/v1/audio/transcriptions",
        //                 {
        //                     method: "POST",
        //                     headers: {
        //                         Authorization: `Bearer ${runtime.token}`,
        //                     },
        //                     body: formData,
        //                 }
        //             );

        //             const data = await response.json();
        //             console.log("Received response from external API: ", data);
        //             res.json(data);
        //         } catch (error) {
        //             console.error("Error processing whisper request: ", error);
        //             res.status(500).send("Internal server error");
        //         }
        //     }
        // );

        // Message endpoint
        app.post("/:agentId/message", async (req, res) => {
            const agentId = req.params.agentId;

            const roomId = req.body.roomId ?? `default-room-${uuidv4()}`;
            const userId = req.body.userId ?? uuidv4();

            let runtime = agents.get(agentId);

            if (!runtime) {
                runtime = Array.from(agents.values()).find(
                    (a: any) =>
                        a.character.name.toLowerCase() === agentId.toLowerCase()
                );
            }

            if (!runtime) {
                res.status(404).send("Agent not found");
                return;
            }

            const text = req.body.text;
            const messageId = uuidv4();

            const content = {
                text,
                attachments: [],
                source: "direct",
                inReplyTo: undefined,
            };

            const userMessage = {
                content,
                userId,
                roomId,
                agentId: runtime.agentId,
            };

            try {
                const memory = {
                    id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`, // Cast to the expected type
                    agentId: runtime.agentId,
                    userId,
                    roomId,
                    content,
                    createdAt: Date.now(),
                };

                await runtime.messageManager_createMemory(memory);

                const state = await runtime.composeState(userMessage, {
                    agentName: runtime.character.name,
                });

                // This part is trying to utilize tokenizer and onyxruntime to generate a response but the compiler is claiming there is no loader for them.

                const context = composeContext({
                    state,
                    template: `${messageCompletionFooter}`,
                });

                const response = await generateMessageResponse({
                    runtime,
                    context,
                    modelClass: ModelClass.SMALL,
                });

                // const response = req.body.text;

                res.json({ response });
            } catch (error) {
                console.error("Error processing message request: ", error);
                res.status(500).send("Internal server error");
            }
        });

        console.log("Server initialized and ready.");

        return app.listen(); // Return the HTTP server
    },
    // Exposed canister functions.
    {
        testQuery: query([], text, () => {
            console.log("This is a test canister query call.");
            return "This is a test canister query call.";
        }),
        testUpdate: update([], text, () => {
            console.log("This is a test canister update call.");
            return "This is a test canister update call.";
        }),

        // Replace the commented-out registerAgent with the new implementation
        registerAgent: update([text], text, async (agentName) => {
            console.log(`Registering agent with name: ${agentName}`);
            try {
                const agentId = await registerNewAgent(agentName);
                // Retrieve agent details from the database
                if (!db) {
                    throw new Error("Database not initialized.");
                }
                const stmt = db.prepare(`
                    SELECT id, name, token FROM agents WHERE id = $id;
                `);
                stmt.bind({ $id: agentId });
                let agentData: {
                    id: string;
                    name: string;
                    token: string;
                } | null = null;
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    agentData = {
                        id: row.id as string,
                        name: row.name as string,
                        token: row.token as string,
                    };
                }
                stmt.free();

                if (agentData) {
                    agents.set(agentId, {
                        character: { name: agentData.name },
                        token: agentData.token,
                        messageManager_createMemory: async (_msg: any) => {
                            /* Implement if needed */
                        },
                        composeState: async (_msg: any, _opts: any) => {
                            return {};
                        },
                    });
                }

                return `Agent "${agentName}" registered with ID ${agentId}.`;
            } catch (error: unknown) {
                console.error("Error registering agent:", error);
                if (error instanceof Error) {
                    return `Failed to register agent: ${error.message}`;
                } else {
                    return "Failed to register agent: Unknown error";
                }
            }
        }),
        unregisterAgent: update([text], text, (agentId) => {
            console.log(`Unregistering agent with ID: ${agentId}`);
            try {
                const success = unregisterExistingAgent(agentId);
                if (success) {
                    agents.delete(agentId);
                    return `Agent ${agentId} unregistered successfully.`;
                } else {
                    return `Agent ${agentId} does not exist.`;
                }
            } catch (error: unknown) {
                console.error("Error unregistering agent:", error);
                if (error instanceof Error) {
                    return `Failed to unregister agent: ${error.message}`;
                } else {
                    return `Failed to unregister agent: Unknown error`;
                }
            }
        }),
        listAgents: query([], text, () => {
            try {
                const agentsList = listAgentIds();
                console.log("Listing agent IDs:", agentsList);
                return JSON.stringify({ agentIds: agentsList });
            } catch (error: unknown) {
                console.error("Error listing agents:", error);
                if (error instanceof Error) {
                    return `Failed to list agents: ${error.message}`;
                } else {
                    return "Failed to list agents: Unknown error";
                }
            }
        }),
        message: query([text], text, async (message) => {
            return message;
        }),

        // Lifecycle hooks
        init: update([], text, async () => {
            console.log("Canister init: initializing database...");
            try {
                await initDb();
                console.log("Database initialized.");
                return "Initialization complete.";
            } catch (error: unknown) {
                console.error("Database initialization failed:", error);
                if (error instanceof Error) {
                    return `Initialization failed: ${error.message}`;
                } else {
                    return "Initialization failed: Unknown error";
                }
            }
        }),
        pre_upgrade: update([], text, () => {
            console.log("pre_upgrade: saving database...");
            try {
                preUpgradeHook();
                return "pre_upgrade complete.";
            } catch (error: unknown) {
                console.error("pre_upgrade failed:", error);
                if (error instanceof Error) {
                    return `pre_upgrade failed: ${error.message}`;
                } else {
                    return "pre_upgrade failed: Unknown error";
                }
            }
        }),
        post_upgrade: update([], text, async () => {
            console.log("post_upgrade: restoring database...");
            try {
                await postUpgradeHook();
                console.log("Database restored after upgrade.");
                // Optionally, rehydrate the in-memory agents map from the database
                if (!db) {
                    throw new Error("Database not initialized after upgrade.");
                }
                const results = db.exec(`SELECT id, name, token FROM agents;`);
                if (results.length > 0) {
                    const rows = results[0].values;
                    for (const row of rows) {
                        const [id, name, token] = row as [
                            string,
                            string,
                            string,
                        ];
                        agents.set(id, {
                            character: { name },
                            token,
                            messageManager_createMemory: async (_msg: any) => {
                                /* Implement if needed */
                            },
                            composeState: async (_msg: any, _opts: any) => {
                                return {};
                            },
                        });
                    }
                }
                return "post_upgrade complete.";
            } catch (error: unknown) {
                console.error("post_upgrade failed:", error);
                if (error instanceof Error) {
                    return `post_upgrade failed: ${error.message}`;
                } else {
                    return "post_upgrade failed: Unknown error";
                }
            }
        }),
    }
);
