import express, { Request, Response } from "express";
import { AgentRuntime } from "../azle/dist/core"

export function createApiRouter(agents: Map<string, AgentRuntime>) {
    const router = express.Router();

    // Simple test endpoint
    router.get("/hello", (req: Request, res: Response) => {
        res.json({ message: "Hello from direct-client-dfx!" });
    });

    // GET /agents
    router.get("/agents", (req: Request, res: Response) => {
        const agentsList = Array.from(agents.values()).map((agent) => ({
            id: agent.agentId,
            name: agent.character.name,
        }));
        res.json({ agents: agentsList });
    });

    // GET /agents/:agentId
    router.get("/agents/:agentId", (req: Request, res: Response) => {
        const agentId = req.params.agentId;
        const agent = agents.get(agentId);
        if (!agent) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }
        res.json({
            id: agent.agentId,
            character: agent.character,
        });
    });
    return router;
}
