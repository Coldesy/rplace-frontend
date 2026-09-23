import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, MutableRefObject } from 'react';

const PALETTE = [
    [255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0],
    [0, 0, 255], [255, 255, 0], [255, 165, 0], [128, 0, 128],
    [0, 255, 255], [255, 192, 203], [165, 42, 42], [128, 128, 128],
    [192, 192, 192], [173, 216, 230], [144, 238, 144], [255, 215, 0]
];

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const COOLDOWN_SECONDS = 6;

function unpackAndDraw(
    buffer: ArrayBuffer,
    ctx: CanvasRenderingContext2D
) {
    const rawBytes = new Uint8Array(buffer);
    const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    const pixels = imageData.data;

    let pixelIndex = 0;

    for (const byte of rawBytes) {
        const colors = [
            PALETTE[(byte >> 4) & 0x0f],
            PALETTE[byte & 0x0f]
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

    ctx.putImageData(imageData, 0, 0);
}

function processBinaryUpdate(
    buffer: ArrayBuffer,
    ctx: CanvasRenderingContext2D,
    currentSeqRef: MutableRefObject<number>
) {
    const dataView = new DataView(buffer);

    for (let offset = 0; offset + 9 <= buffer.byteLength; offset += 9) {
        const x = dataView.getUint16(offset, true);
        const y = dataView.getUint16(offset + 2, true);
        const colorId = dataView.getUint8(offset + 4);
        const sequence = dataView.getUint32(offset + 5, true);

        if (sequence <= currentSeqRef.current) continue;

        currentSeqRef.current = sequence;

        const color = PALETTE[colorId];
        if (!color) continue;

        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillRect(x, y, 1, 1);
    }
}

export function Board() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const currentSeqRef = useRef(0);
    const isHttpLoadedRef = useRef(false);
    const messageQueueRef = useRef<ArrayBuffer[]>([]);

    const [cooldown, setCooldown] = useState(0);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) return;

        const timer = window.setInterval(() => {
            setCooldown(current => {
                if (current <= 1) {
                    window.clearInterval(timer);
                    return 0;
                }

                return current - 1;
            });
        }, 1000);

        return () => window.clearInterval(timer);
    }, [cooldown]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const ws = new WebSocket(
            'ws://localhost:3001/ws?mock_user_id=dev_frontend'
        );

        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connected');
            setConnected(true);
        };

        ws.onerror = event => {
            console.error('WebSocket error', event);
        };

        ws.onclose = event => {
            console.warn('WebSocket closed', {
                code: event.code,
                reason: event.reason || 'no reason'
            });

            setConnected(false);
            wsRef.current = null;
        };

        const processIncomingBinary = (buffer: ArrayBuffer) => {
            if (buffer.byteLength === 0 || buffer.byteLength % 9 !== 0) {
                console.error('Ignoring malformed binary frame:', buffer.byteLength);
                return;
            }

            if (!isHttpLoadedRef.current) {
                messageQueueRef.current.push(buffer);
                return;
            }

            processBinaryUpdate(buffer, ctx, currentSeqRef);
        };

        ws.onmessage = async event => {
            if (typeof event.data === 'string') {
                console.log('Received text WebSocket message:', event.data);

                try {
                    const message = JSON.parse(event.data) as {
                        type?: string;
                        error?: string;
                        ttl?: number;
                    };

                    if (message.type !== 'ERROR') return;

                    console.error('Pixel placement failed:', message.error);

                    if (message.error === 'RATE_LIMITED') {
                        setCooldown(Math.max(0, message.ttl ?? COOLDOWN_SECONDS));
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }

                return;
            }

            if (event.data instanceof ArrayBuffer) {
                processIncomingBinary(event.data);
                return;
            }

            if (event.data instanceof Blob) {
                processIncomingBinary(await event.data.arrayBuffer());
            }
        };

        const fetchInitialState = async () => {
            try {
                const response = await fetch('http://localhost:3001/api/board');

                if (!response.ok) {
                    throw new Error(`Board request failed: ${response.status}`);
                }

                const sequenceHeader = response.headers.get('X-Canvas-Sequence');
                currentSeqRef.current = Number(sequenceHeader ?? 0);

                const boardBuffer = await response.arrayBuffer();
                unpackAndDraw(boardBuffer, ctx);

                isHttpLoadedRef.current = true;

                const queuedMessages = messageQueueRef.current;
                messageQueueRef.current = [];

                for (const message of queuedMessages) {
                    processBinaryUpdate(message, ctx, currentSeqRef);
                }

                console.log(
                    'Board synced at sequence',
                    currentSeqRef.current
                );
            } catch (error) {
                console.error('Failed to load initial board:', error);
            }
        };

        void fetchInitialState();

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, []);

    const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
        const socket = wsRef.current;

        console.log('Canvas clicked', {
            readyState: socket?.readyState,
            cooldown
        });

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('Pixel not sent: WebSocket is not open');
            return;
        }

        if (cooldown > 0) {
            console.warn(`Pixel not sent: ${cooldown}s cooldown remaining`);
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(
            ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH
        );
        const y = Math.floor(
            ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
        );

        const colorId = 2;
        const payload = new ArrayBuffer(9);
        const view = new DataView(payload);

        view.setUint16(0, x, true);
        view.setUint16(2, y, true);
        view.setUint8(4, colorId);
        view.setUint32(5, crypto.getRandomValues(new Uint32Array(1))[0], true);

        console.log('Sending pixel', { x, y, colorId });

        socket.send(payload);

        // Prevent duplicate clicks while waiting for the server response.
        setCooldown(COOLDOWN_SECONDS);
    };

    return (
        <div>
            <p>
                {connected ? 'Connected' : 'Disconnected'}
                {cooldown > 0 && ` - ${cooldown}s`}
            </p>

            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onClick={handleCanvasClick}
                style={{
                    width: '1000px',
                    height: '600px',
                    border: '1px solid black',
                    imageRendering: 'pixelated',
                    cursor: cooldown > 0 ? 'wait' : 'crosshair'
                }}
            />
        </div>
    );
}