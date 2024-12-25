import "./transform_stream_shim";

import { query, Server, text, update } from "azle/experimental";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import multer from "multer";
import { createServer } from "http"; // Import to create an http.Server
import { elizaLogger } from "../../dist/core";
import { stringToUuid } from "../../dist/core";
import { settings } from "../../dist/core";
import { createApiRouter } from "../../../src/api";
import { AgentRuntime } from "../../dist/core";

export default Server(
    () => {
        const app = express();
        const server = createServer(app); // Wrap express in an HTTP server
        const upload = multer({ storage: multer.memoryStorage() });
        const agents = new Map<string, AgentRuntime>();

        // Middleware setup
        app.use(cors());
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));

        elizaLogger.log("Server setup complete, initializing API routes...");

        // API router
        const apiRouter = createApiRouter(agents);
        app.use(apiRouter);

        elizaLogger.log("API routes initialized.");

        // Whisper endpoint
        app.post(
            "/:agentId/whisper",
            upload.single("file"),
            async (req, res) => {
                elizaLogger.log("Received request on /:agentId/whisper");
                elizaLogger.log("Headers: ", req.headers);
                elizaLogger.log("File metadata: ", req.file);
                elizaLogger.log("Agent ID: ", req.params.agentId);

                const audioFile = req.file;
                const agentId = req.params.agentId;

                if (!audioFile) {
                    elizaLogger.error("No audio file provided");
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
                    elizaLogger.error("Agent not found: ", agentId);
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

                    elizaLogger.log("Sending request to external API...");

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
                    elizaLogger.log("Received response from external API: ", data);
                    res.json(data);
                } catch (error) {
                    elizaLogger.error("Error processing whisper request: ", error);
                    res.status(500).send("Internal server error");
                }
            }
        );

        // Message endpoint
        // app.post("/:agentId/message", async (req, res) => {
        //     const agentId = req.params.agentId;
        //     const roomId = stringToUuid(
        //         req.body.roomId ?? "default-room-" + agentId
        //     );
        //     const userId = stringToUuid(req.body.userId ?? "user");

        //     let runtime = agents.get(agentId);

        //     if (!runtime) {
        //         runtime = Array.from(agents.values()).find(
        //             (a) =>
        //                 a.character.name.toLowerCase() ===
        //                 agentId.toLowerCase()
        //         );
        //     }

        //     if (!runtime) {
        //         res.status(404).send("Agent not found");
        //         return;
        //     }

        //     const text = req.body.text;

        //     // Additional processing...
        //     res.json({ response: `Processed message: ${text}` });
        // });

        // Start the HTTP server
        // const port = parseInt(settings.SERVER_PORT || "3000");
        // server.listen(port, () => {
        //     elizaLogger.success(`Server running at http://localhost:${port}/`);
        // });

        elizaLogger.log("Server initialized and ready.");

        return server; // Return the HTTP server
    },
    // Exposed canister functions.
    {
        startServer: query([], text, () => {
            elizaLogger.log("startServer called.");
            return "Server started successfully";
        }),
        stopServer: update([], text, () => {
            elizaLogger.log("stopServer called.");
            return "Server stopped successfully";
        }),
    }
);
