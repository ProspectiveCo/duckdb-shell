// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/workspace";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-d3fc";

import "@perspective-dev/viewer/dist/css/dracula.css";
import "@perspective-dev/viewer/dist/css/themes.css";
import "@perspective-dev/workspace/dist/css/pro-dark.css";
import "xterm/css/xterm.css";
import * as xterm from "xterm";

import "regular-layout";

// @ts-ignore
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";

// @ts-ignore
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

import { DuckDBHandler } from "@perspective-dev/client/dist/esm/virtual_servers/duckdb.js";
import * as duckdb from "@duckdb/duckdb-wasm";
import * as duckdbShell from "@duckdb/duckdb-wasm-shell";
// import * as internalShell from "@duckdb/duckdb-wasm-shell/dist/crate/pkg"

// @ts-ignore
import SUPERSTORE_ARROW from "superstore-arrow/superstore.lz4.arrow";

await Promise.all([
    perspective.init_server(fetch(SERVER_WASM)),
    perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

async function initializeDuckDB() {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
            type: "text/javascript",
        }),
    );

    const duckdb_worker = new Worker(worker_url);
    const logger = new duckdb.VoidLogger();
    const db = new duckdb.AsyncDuckDB(logger, duckdb_worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    await db.open({ opfs: { fileHandling: "manual" } });
    const conn = await db.connect();
    await conn.query(`
        SET default_null_order=NULLS_FIRST_ON_ASC_LAST_ON_DESC;
    `);

    console.log("DuckDB initialized");
    return { db, conn };
}

async function loadSampleData(db: duckdb.AsyncDuckDBConnection) {
    // const c = await db.connect();
    try {
        const response = await fetch(SUPERSTORE_ARROW);
        const arrayBuffer = await response.arrayBuffer();
        await db.insertArrowFromIPCStream(new Uint8Array(arrayBuffer), {
            name: "data_source_one",
            create: true,
        });
    } catch (error) {
        console.error("Error loading Arrow data:", error);
    }
}

const db = await initializeDuckDB();
await perspective.init_client(fetch(CLIENT_WASM));
await loadSampleData(db.conn);
const server = perspective.createMessageHandler(new DuckDBHandler(db.conn));
const client = await perspective.worker(server);

document.querySelector("regular-layout")!.restore({
    type: "split-panel",
    orientation: "horizontal",
    sizes: [0.5, 0.5],
    children: [
        { type: "child-panel", child: ["sql"] },
        { type: "child-panel", child: ["query"] },
    ],
});

const viewer = document.querySelector("perspective-workspace")!;
viewer.load(client);

const container = document.getElementById("shell-container") as HTMLDivElement;

const shellModule = duckdbShell.getJsDelivrModule();
shellModule.pathname = shellModule.pathname.replace("dist/dist", "dist");

// Initialize DuckDB WASM Shell
// @ts-ignore
const { resize } = await duckdbShell.embed({
    container,
    shellModule,
    backgroundColor: "#282a36",
    resolveDatabase: async (p) => {
        console.log(p);
        console.log(this);
        console.log(shellModule);
        console.log(duckdbShell);
        return db.db;
    },
});

const observer = new ResizeObserver((_entries) => {
    // duckdbShell;
    resize();
    // xterm;
});

observer.observe(container);
