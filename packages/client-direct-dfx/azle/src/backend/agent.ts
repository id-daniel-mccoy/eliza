// src/backend/agent.ts

import { db } from "./db";
import { v4 as uuidv4 } from "uuid"; // Ensure you have this dependency installed
import { QueryExecResult } from "sql.js/dist/sql-asm.js";

// Define ModelProviderName enum
export enum ModelProviderName {
    OPENAI = "OPENAI",
    LLAMALOCAL = "LLAMALOCAL",
    // Add more providers as needed
}

// Define Character type
export type Character = {
    id: string;
    name: string;
    modelProvider?: ModelProviderName;
    // Add other fields as necessary
};

// Define AgentConfig type
export type AgentConfig = {
    token: string;
    character: Character;
    modelProvider: ModelProviderName;
};

// Define AgentRuntime class
export class AgentRuntime {
    token: string;
    character: Character;
    modelProvider: ModelProviderName;
    agentId: string;

    constructor(config: AgentConfig) {
        this.token = config.token;
        this.character = config.character;
        this.modelProvider = config.modelProvider;
        this.agentId = config.character.id;
    }

    async initialize() {
        // Initialize any necessary components
        // For example, set up connections, load plugins, etc.
    }

    // Example method for storing a user message
    async messageManager_createMemory(_msg: any): Promise<void> {
        // Implement memory storage logic here
    }

    // Example method for composing a response
    async composeState(_userMessage: any, _options: any): Promise<any> {
        // Implement state composition logic here
        return {};
    }
}

//
// Helper Functions
//

// Minimal UUID generator (using uuid library)
function generateUuid(): string {
    return uuidv4();
}

/**
 * Retrieves a token based on the model provider.
 * In a real scenario, fetch this from a secure store or environment variables.
 */
function getTokenForProvider(provider: ModelProviderName): string {
    switch (provider) {
        case ModelProviderName.OPENAI:
            return "openai-dummy-token"; // Replace with secure token retrieval
        case ModelProviderName.LLAMALOCAL:
            return "ollama-dummy-token"; // Replace as needed
        default:
            return "default-dummy-token";
    }
}

/**
 * Registers a new agent and stores it in the database.
 * @param agentName - The name of the agent to register.
 * @returns The unique ID of the registered agent.
 */
export async function registerNewAgent(agentName: string): Promise<string> {
    if (!db) {
        throw new Error("Database not initialized.");
    }

    // Create a new Character object
    const character: Character = {
        id: generateUuid(),
        name: agentName,
        modelProvider: ModelProviderName.OPENAI, // Default provider
    };

    // Get the token for the provider
    const token = getTokenForProvider(character.modelProvider!);

    // Instantiate AgentRuntime
    const runtime = new AgentRuntime({
        token,
        character,
        modelProvider: character.modelProvider!,
    });

    // Initialize the runtime
    await runtime.initialize();

    // Insert the new agent into the database
    const stmt = db.prepare(`
        INSERT INTO agents (id, token, name)
        VALUES ($id, $token, $name);
    `);
    stmt.run({
        $id: runtime.agentId,
        $token: runtime.token,
        $name: runtime.character.name,
    });
    stmt.free();

    return runtime.agentId;
}

/**
 * Unregisters an existing agent by ID.
 * @param agentId - The unique ID of the agent to unregister.
 * @returns True if the agent was successfully unregistered, false otherwise.
 */
export function unregisterExistingAgent(agentId: string): boolean {
    if (!db) {
        throw new Error("Database not initialized.");
    }

    const stmt = db.prepare(`
        DELETE FROM agents
        WHERE id = $id;
    `);
    stmt.run({ $id: agentId });
    const changes = db.getRowsModified();
    stmt.free();
    return changes > 0;
}

/**
 * Retrieves a list of all registered agent IDs.
 * @returns An array of agent IDs.
 */
export function listAgentIds(): string[] {
    if (!db) {
        throw new Error("Database not initialized.");
    }

    const results: QueryExecResult[] = db.exec(`
        SELECT id FROM agents;
    `);

    if (results.length === 0) return [];

    const agentIds: string[] = [];
    const rows = results[0].values;
    for (const row of rows) {
        agentIds.push(row[0] as string);
    }

    return agentIds;
}
