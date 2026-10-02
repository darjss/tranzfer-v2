// Registers @testing-library/jest-dom's matchers (toHaveTextContent etc.)
// with vitest's expect, including their types.
import "@testing-library/jest-dom/vitest";
import { Blob as BufferBlob, File as BufferFile } from "node:buffer";

// jsdom's Blob and File have no arrayBuffer(); Node's do.
Object.assign(globalThis, { Blob: BufferBlob, File: BufferFile });
