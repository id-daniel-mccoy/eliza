// src/backend/db/migrations.ts

export const migrations = [
    `
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        token TEXT,
        name TEXT
    );
    `,
    // Add more migrations as needed
];
