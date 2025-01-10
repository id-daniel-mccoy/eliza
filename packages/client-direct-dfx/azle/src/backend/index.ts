import "./transform_stream_shim";

import { query, Server, text, update, ic, Null, empty, AzleEmpty, Void } from "azle/experimental";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import multer from "multer";
import { createServer } from "http"; // Import to create an http.Server
import { settings } from "../../dist/core";
import { createApiRouter } from "../../../src/api";
import { AgentRuntime } from "../../dist/core";
import { v4 as uuidv4 } from "uuid";
// import { composeContext, stringToUuid } from "@ai16z/eliza";
import { generateMessageResponse } from "@ai16z/eliza";
import { ModelClass } from "@ai16z/eliza";
import { IAgentRuntime, Content } from "@ai16z/eliza";

// Moved the agents map to the top-level scope.
const agents = new Map<string, AgentRuntime>();
const logger = async(message: text) => {
    ic.print(message);
}

const messageCompletionFooter = `
Response format should be formatted in a JSON block like this:
\`\`\`json
{ "user": "{{agentName}}", "text": "string", "action": "string" }
\`\`\``;

const messageHandlerTemplate = `
# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.

${messageCompletionFooter}
`;

export default Server(
    () => {
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

        // Whisper endpoint
        app.post(
            "/:agentId/whisper",
            upload.single("file"),
            async (req, res) => {
                console.log("Received request on /:agentId/whisper");
                console.log("Headers: ", req.headers);
                console.log("File metadata: ", req.file);
                console.log("Agent ID: ", req.params.agentId);

                const audioFile = req.file;
                const agentId = req.params.agentId;

                if (!audioFile) {
                    console.error("No audio file provided");
                    res.status(400).send("No audio file provided");
                    return;
                }

                let runtime = agents.get(agentId);

                if (!runtime) {
                    runtime = Array.from(agents.values()).find(
                        (a) =>
                            a.character.name.toLowerCase() ===
                            agentId.toLowerCase()
                    );
                }

                if (!runtime) {
                    console.error("Agent not found: ", agentId);
                    res.status(404).send("Agent not found");
                    return;
                }

                try {
                    const formData = new FormData();
                    const audioBlob = new Blob([audioFile.buffer], {
                        type: audioFile.mimetype,
                    });
                    formData.append("file", audioBlob, audioFile.originalname);
                    formData.append("model", "whisper-1");

                    console.log("Sending request to external API...");

                    const response = await fetch(
                        "https://api.openai.com/v1/audio/transcriptions",
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${runtime.token}`,
                            },
                            body: formData,
                        }
                    );

                    const data = await response.json();
                    console.log("Received response from external API: ", data);
                    res.json(data);
                } catch (error) {
                    console.error("Error processing whisper request: ", error);
                    res.status(500).send("Internal server error");
                }
            }
        );

        // Message endpoint
        app.post("/:agentId/message", async (req, res) => {
            const agentId = req.params.agentId;

            const roomId = req.body.roomId ?? `default-room-${uuidv4()}`;
            const userId = req.body.userId ?? uuidv4();

            let runtime = agents.get(agentId);

            if (!runtime) {
                runtime = Array.from(agents.values()).find(
                    (a) =>
                        a.character.name.toLowerCase() ===
                        agentId.toLowerCase()
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

                await runtime.messageManager.createMemory(memory);

                const state = await runtime.composeState(userMessage, {
                    agentName: runtime.character.name,
                });

                // This part is trying to utilize tokenizer and onyxruntime to generate a response but the compiler is claiming there is no loader for them.

                // Attempted fix using custom composeContext function.

                const composeContext = ({ state, template }: { state: Record<string, any>; template: string }): string => {
                    return template.replace(/{{\s*([\w]+)\s*}}/g, (match, placeholder) => {
                        return state.hasOwnProperty(placeholder) ? String(state[placeholder]) : '';
                    });
                };

                const context = composeContext({
                    state,
                    template: messageHandlerTemplate,
                });

                // Attempted fix using custom generateMessageResponse function.

                const customGenerateMessageResponse = async ({
                    runtime,
                    context,
                    modelClass,
                }: {
                    runtime: IAgentRuntime;
                    context: string;
                    modelClass: string;
                }): Promise<Content> => {
                    // Simulate generating a response based on context
                    ic.print("Generating custom message response...");
                    return {
                        text: `Simulated response for ${runtime.character.name} in class ${modelClass}: ${context}`,
                        action: "simulateAction",
                        source: "custom",
                        attachments: [],
                    };
                };

                const response = await customGenerateMessageResponse({
                    runtime,
                    context,
                    modelClass: "small",
                });

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

        // Server management functions - Replace with internal canister management API

        // startServer: update([], text, () => {
        //     console.log("Server start requested.");
        //     return "Server started successfully.";
        // }),
        // stopServer: update([], text, () => {
        //     console.log("Server stop requested.");
        //     return "Server stopped successfully.";
        // }),

        // The register agent function needs to use the actual AgentRuntime constructor to create a new runtime instance.

        // registerAgent: update([text, text], text, (agentId, token) => {
        //     console.log(`Registering agent with ID: ${agentId}`);
        //     agents.set(agentId, new AgentRuntime({ token }));
        //     return `Agent ${agentId} registered successfully.`;
        // }),

        unregisterAgent: update([text], text, (agentId) => {
            console.log(`Unregistering agent with ID: ${agentId}`);
            if (!agents.has(agentId)) {
                return `Agent ${agentId} does not exist.`;
            }
            agents.delete(agentId);
            return `Agent ${agentId} unregistered successfully.`;
        }),
        listAgents: query([], text, () => {
            const agentIds = Array.from(agents.keys());
            console.log("Listing all agent IDs: ", agentIds);
            return JSON.stringify({ agentIds });
        }),
        message: query([text], text, async(message) => {
            return message;
        })
    }
);