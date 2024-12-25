import "./transform_stream_shim";

import { jsonStringify } from "azle/experimental";
import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";

import {
    AgentRuntime,
    generateMessageResponse,
    composeContext,
    messageCompletionFooter,
    stringToUuid,
} from "../azle/dist/core";

import type { Content, Memory } from "../azle/dist/core";
import { ModelClass } from "../azle/dist/core";
import { createApiRouter } from "./api"; // optional separate router if you want

////////////////////////////////////////////////////////////////////////////////
// Agents registry
////////////////////////////////////////////////////////////////////////////////
const agents = new Map<string, AgentRuntime>();

////////////////////////////////////////////////////////////////////////////////
// Set up the Azle Express app
////////////////////////////////////////////////////////////////////////////////
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from /dist if desired
app.use(express.static("/dist"));

// Optional: attach a custom router for e.g. GET /agents
app.use(createApiRouter(agents));

// Reuse your existing messageHandlerTemplate
const messageHandlerTemplate =
    `
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
` + messageCompletionFooter;

////////////////////////////////////////////////////////////////////////////////
// POST /:agentId/message => chat with the agent
////////////////////////////////////////////////////////////////////////////////
app.post("/:agentId/message", async (req: Request, res: Response) => {
    const agentId = req.params.agentId;
    const roomId = stringToUuid(req.body.roomId ?? `default-room-${agentId}`);
    const userId = stringToUuid(req.body.userId ?? "user");

    let runtime = agents.get(agentId);
    if (!runtime) {
        // fallback: try matching by character name
        runtime = Array.from(agents.values()).find(
            (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
        );
    }

    if (!runtime) {
        res.status(404).send("Agent not found");
        return;
    }

    // Ensure the connection is established
    await runtime.ensureConnection(
        userId,
        roomId,
        req.body.userName,
        req.body.name,
        "direct"
    );

    const text = req.body.text;
    const messageId = stringToUuid(Date.now().toString());

    const content: Content = {
        text,
        attachments: [],
        source: "direct",
    };

    const userMessage = {
        content,
        userId,
        roomId,
        agentId: runtime.agentId,
    };

    const memory: Memory = {
        id: messageId,
        agentId: runtime.agentId,
        userId,
        roomId,
        content,
        createdAt: Date.now(),
    };

    await runtime.messageManager.createMemory(memory);

    // Compose context for LLM
    const state = await runtime.composeState(userMessage, {
        agentName: runtime.character.name,
    });

    const context = composeContext({
        state,
        template: messageHandlerTemplate,
    });

    const responseMsg = await generateMessageResponse({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });

    if (!responseMsg) {
        res.status(500).send("No response from generateMessageResponse");
        return;
    }

    // Save AI's reply in memory
    const responseMemory = {
        ...userMessage,
        userId: runtime.agentId,
        content: responseMsg,
    };
    await runtime.messageManager.createMemory(responseMemory);

    // Possibly run evaluations/plugins
    await runtime.evaluate(memory, state);

    // Possibly run post-processing actions
    let finalMessage = null;
    await runtime.processActions(
        memory,
        [responseMemory],
        state,
        async (newMessages) => {
            finalMessage = newMessages;
            return [memory];
        }
    );

    // Return JSON-serialized response(s)
    if (finalMessage) {
        res.send(jsonStringify([responseMsg, finalMessage]));
    } else {
        res.send(jsonStringify([responseMsg]));
    }
});

////////////////////////////////////////////////////////////////////////////////
// Start the Azle Express server (no port needed)
////////////////////////////////////////////////////////////////////////////////
app.listen();

////////////////////////////////////////////////////////////////////////////////
// Helper: register/unregister agent runtimes
////////////////////////////////////////////////////////////////////////////////
export function registerAgent(runtime: AgentRuntime) {
    agents.set(runtime.agentId, runtime);
}
export function unregisterAgent(runtime: AgentRuntime) {
    agents.delete(runtime.agentId);
}
