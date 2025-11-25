// Browser WebWorker entry point for SAS Language Server
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from "vscode-languageserver/browser";

import { runServer } from "./server";

// Set up message passing for WebWorker
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

// Start the server
runServer(connection);

console.log("SAS Language Server running in WebWorker");
