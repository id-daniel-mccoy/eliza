// src/backend/db/index.ts

import { StableBTreeMap, stableJson, ic } from "azle/experimental";

import initSqlJs, { Database } from "sql.js/dist/sql-asm.js";
import { migrations } from "./migrations"; // Optional: Remove if inlining migrations

//
// 1) Define stable storage for our DB bytes
//
let stableDbMap = StableBTreeMap<"DATABASE", Uint8Array>(0, stableJson, {
    toBytes: (data: Uint8Array) => data,
    fromBytes: (bytes: Uint8Array) => bytes,
});

//
// 2) Shared db reference
//
export let db: Database | undefined;

/**
 * Initialize an in-memory DB from optional `bytes`.
 * If `bytes` is empty, we run migrations to create tables.
 */
export async function initDb(
    bytes: Uint8Array = new Uint8Array()
): Promise<void> {
    const SQL = await initSqlJs({});
    const database = new SQL.Database(bytes);

    // Run migrations if the DB is new/empty
    if (bytes.length === 0) {
        for (const migration of migrations) {
            database.run(migration);
        }
    }

    db = database; // Assign to the exported db

    ic.print("[db] Database initialized and assigned.");
}

/**
 * Pre-upgrade hook: serialize the DB to stable memory
 */
export function preUpgradeHook(): void {
    ic.print("[db] preUpgradeHook: exporting DB to stable memory...");
    if (db) {
        const data = db.export();
        stableDbMap.insert("DATABASE", data);
        ic.print("[db] Database exported to stable memory.");
    } else {
        ic.print("[db] preUpgradeHook: db is undefined, nothing to export.");
    }
}

/**
 * Post-upgrade hook: restore DB from stable memory
 */
export async function postUpgradeHook(): Promise<void> {
    ic.print("[db] postUpgradeHook: restoring DB from stable memory...");
    const maybeBytes = stableDbMap.get("DATABASE");
    if (maybeBytes) {
        await initDb(maybeBytes);
        ic.print("[db] Database restored from stable memory.");
    } else {
        ic.print("[db] postUpgradeHook: No database found in stable memory.");
        await initDb(); // Initialize fresh DB
    }
}
