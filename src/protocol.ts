// Shared backend wire-protocol constants and helpers.
//
// This file is the single source of truth for the byte layout used to talk
// to the rplace backend. Nothing here changes the wire format — it is a
// direct extraction of the logic that already lived inline in Board.tsx.

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 600;
export const DEFAULT_COOLDOWN_SECONDS = 6;

export const BOARD_ENDPOINT = 'http://localhost:3001/api/board';
export const WS_ENDPOINT = 'ws://localhost:3001/ws?mock_user_id=dev_frontend';

export const SEQUENCE_HEADER = 'X-Canvas-Sequence';

/** Existing backend palette: index -> [r, g, b]. Do not reorder. */
export const BACKEND_PALETTE: readonly [number, number, number][] = [
    [255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0],
    [0, 0, 255], [255, 255, 0], [255, 165, 0], [128, 0, 128],
    [0, 255, 255], [255, 192, 203], [165, 42, 42], [128, 128, 128],
    [192, 192, 192], [173, 216, 230], [144, 238, 144], [255, 215, 0]
];

/** Size in bytes of a single live-update record (binary WS frame entry). */
const UPDATE_RECORD_BYTES = 9;

export interface PixelUpdate {
    x: number;
    y: number;
    colorId: number;
    sequence: number;
}

/** Unpacks the initial /api/board snapshot (4-bit packed indices, 2px/byte) into an ImageData. */
export function unpackSnapshot(
    buffer: ArrayBuffer,
    ctx: CanvasRenderingContext2D
): ImageData {
    const rawBytes = new Uint8Array(buffer);
    const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    const pixels = imageData.data;

    let pixelIndex = 0;

    for (const byte of rawBytes) {
        const colors = [
            BACKEND_PALETTE[(byte >> 4) & 0x0f],
            BACKEND_PALETTE[byte & 0x0f]
        ];

        for (const color of colors) {
            if (pixelIndex >= CANVAS_WIDTH * CANVAS_HEIGHT) break;

            pixels[pixelIndex * 4] = color[0];
            pixels[pixelIndex * 4 + 1] = color[1];
            pixels[pixelIndex * 4 + 2] = color[2];
            pixels[pixelIndex * 4 + 3] = 255;
            pixelIndex++;
        }
    }

    return imageData;
}

/** Returns true if a binary frame's length is a valid multiple of the record size. */
export function isValidUpdateFrame(buffer: ArrayBuffer): boolean {
    return buffer.byteLength > 0 && buffer.byteLength % UPDATE_RECORD_BYTES === 0;
}

/** Parses a binary live-update frame into individual pixel updates (no filtering applied). */
export function parseUpdateFrame(buffer: ArrayBuffer): PixelUpdate[] {
    const dataView = new DataView(buffer);
    const updates: PixelUpdate[] = [];

    for (let offset = 0; offset + UPDATE_RECORD_BYTES <= buffer.byteLength; offset += UPDATE_RECORD_BYTES) {
        updates.push({
            x: dataView.getUint16(offset, true),
            y: dataView.getUint16(offset + 2, true),
            colorId: dataView.getUint8(offset + 4),
            sequence: dataView.getUint32(offset + 5, true)
        });
    }

    return updates;
}

/** Draws a single already-validated pixel update onto the canvas context. */
export function drawUpdate(ctx: CanvasRenderingContext2D, update: PixelUpdate): void {
    const color = BACKEND_PALETTE[update.colorId];
    if (!color) return;

    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.fillRect(update.x, update.y, 1, 1);
}

/** Builds the 9-byte outbound placement payload. Field layout mirrors incoming update records. */
export function encodePlacement(x: number, y: number, colorId: number): ArrayBuffer {
    const payload = new ArrayBuffer(UPDATE_RECORD_BYTES);
    const view = new DataView(payload);

    view.setUint16(0, x, true);
    view.setUint16(2, y, true);
    view.setUint8(4, colorId);
    view.setUint32(5, crypto.getRandomValues(new Uint32Array(1))[0], true);

    return payload;
}

export interface ServerTextMessage {
    type?: string;
    error?: string;
    ttl?: number;
}

export function parseTextMessage(raw: string): ServerTextMessage | null {
    try {
        return JSON.parse(raw) as ServerTextMessage;
    } catch {
        return null;
    }
}
