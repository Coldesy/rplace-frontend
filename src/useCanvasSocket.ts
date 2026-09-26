import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
    BOARD_ENDPOINT,
    DEFAULT_COOLDOWN_SECONDS,
    SEQUENCE_HEADER,
    WS_ENDPOINT,
    drawUpdate,
    encodePlacement,
    isValidUpdateFrame,
    parseTextMessage,
    parseUpdateFrame,
    unpackSnapshot
} from './protocol';

export type ConnectionPhase = 'connecting' | 'connected' | 'reconnecting';

export interface PlacementFeedbackState {
    status: 'accepted' | 'rejected';
    message: string;
    /** Raw server-provided detail, preserved for debugging even though the message above is friendly. */
    detail?: string;
    id: number;
}

const MIN_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 30000;
/** How long an optimistic "accepted" state waits before showing, in case a rejection is still in flight. */
const ACCEPT_FEEDBACK_DELAY_MS = 900;

function nextBackoffDelay(attempt: number): number {
    const raw = MIN_RECONNECT_DELAY_MS * 2 ** Math.max(0, attempt - 1);
    return Math.min(MAX_RECONNECT_DELAY_MS, raw);
}

/**
 * Owns the WebSocket + snapshot lifecycle for the board: initial load,
 * live updates, capped-backoff reconnect with a fresh /api/board resync,
 * display-only cooldown, and placement rejection feedback.
 *
 * The wire format is untouched — this only reorganizes existing behavior
 * from Board.tsx and adds reconnect/resync, which reuses the same
 * endpoints and message shapes.
 */
export function useCanvasSocket(canvasRef: RefObject<HTMLCanvasElement | null>) {
    const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('connecting');
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [feedback, setFeedback] = useState<PlacementFeedbackState | null>(null);
    const [snapshotLoaded, setSnapshotLoaded] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const currentSeqRef = useRef(0);
    const snapshotLoadedRef = useRef(false);
    const pendingQueueRef = useRef<ArrayBuffer[]>([]);
    const cooldownSecondsRef = useRef(0);

    const generationRef = useRef(0);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<number | undefined>(undefined);
    const acceptTimerRef = useRef<number | undefined>(undefined);
    const feedbackTokenRef = useRef(0);
    const unmountedRef = useRef(false);

    useEffect(() => {
        cooldownSecondsRef.current = cooldownSeconds;
    }, [cooldownSeconds]);

    // Cooldown ticker — display-only. The server remains the sole authority
    // on whether a placement is actually accepted (see RATE_LIMITED handling below).
    useEffect(() => {
        if (cooldownSeconds <= 0) return;

        const timer = window.setInterval(() => {
            setCooldownSeconds(current => (current <= 1 ? 0 : current - 1));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [cooldownSeconds]);

    useEffect(() => {
        unmountedRef.current = false;

        const getCtx = (): CanvasRenderingContext2D | null => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            return canvas.getContext('2d', { alpha: false });
        };

        const applyFrame = (buffer: ArrayBuffer, ctx: CanvasRenderingContext2D) => {
            for (const update of parseUpdateFrame(buffer)) {
                if (update.sequence <= currentSeqRef.current) continue;
                currentSeqRef.current = update.sequence;
                drawUpdate(ctx, update);
            }
        };

        const scheduleReconnect = () => {
            if (unmountedRef.current) return;
            if (reconnectTimerRef.current !== undefined) return; // already scheduled

            reconnectAttemptRef.current += 1;
            setReconnectAttempt(reconnectAttemptRef.current);
            setConnectionPhase('reconnecting');

            const delay = nextBackoffDelay(reconnectAttemptRef.current);
            reconnectTimerRef.current = window.setTimeout(() => {
                reconnectTimerRef.current = undefined;
                connect();
            }, delay);
        };

        const loadSnapshotAndResync = async (myGeneration: number) => {
            try {
                const response = await fetch(BOARD_ENDPOINT);
                if (myGeneration !== generationRef.current) return;

                if (!response.ok) {
                    throw new Error(`Board request failed: ${response.status}`);
                }

                const sequenceHeader = response.headers.get(SEQUENCE_HEADER);
                const snapshotSequence = Number(sequenceHeader ?? 0);
                const boardBuffer = await response.arrayBuffer();
                if (myGeneration !== generationRef.current) return;

                const ctx = getCtx();
                if (!ctx) return;

                const imageData = unpackSnapshot(boardBuffer, ctx);
                ctx.putImageData(imageData, 0, 0);
                currentSeqRef.current = snapshotSequence;

                const queued = pendingQueueRef.current;
                pendingQueueRef.current = [];
                snapshotLoadedRef.current = true;
                setSnapshotLoaded(true);

                for (const frame of queued) {
                    applyFrame(frame, ctx);
                }

                if (myGeneration !== generationRef.current) return;
                reconnectAttemptRef.current = 0;
                setReconnectAttempt(0);
                setConnectionPhase('connected');
            } catch (error) {
                console.error('Failed to load board snapshot:', error);
                if (myGeneration !== generationRef.current) return;
                // Treat a failed snapshot load the same as a dropped connection.
                wsRef.current?.close();
            }
        };

        const connect = () => {
            generationRef.current += 1;
            const myGeneration = generationRef.current;

            snapshotLoadedRef.current = false;
            setSnapshotLoaded(false);
            pendingQueueRef.current = [];

            const ws = new WebSocket(WS_ENDPOINT);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            ws.onopen = () => {
                if (myGeneration !== generationRef.current) return;
                void loadSnapshotAndResync(myGeneration);
            };

            ws.onerror = event => {
                if (myGeneration !== generationRef.current) return;
                console.error('WebSocket error', event);
            };

            ws.onclose = event => {
                if (myGeneration !== generationRef.current) return;
                console.warn('WebSocket closed', {
                    code: event.code,
                    reason: event.reason || 'no reason'
                });
                wsRef.current = null;
                scheduleReconnect();
            };

            const processIncomingBinary = (buffer: ArrayBuffer) => {
                if (!isValidUpdateFrame(buffer)) {
                    console.error('Ignoring malformed binary frame:', buffer.byteLength);
                    return;
                }

                if (!snapshotLoadedRef.current) {
                    pendingQueueRef.current.push(buffer);
                    return;
                }

                const ctx = getCtx();
                if (!ctx) return;
                applyFrame(buffer, ctx);
            };

            ws.onmessage = async event => {
                if (myGeneration !== generationRef.current) return;

                if (typeof event.data === 'string') {
                    const message = parseTextMessage(event.data);
                    if (!message || message.type !== 'ERROR') return;

                    console.error('Pixel placement failed:', message.error);

                    if (acceptTimerRef.current !== undefined) {
                        window.clearTimeout(acceptTimerRef.current);
                        acceptTimerRef.current = undefined;
                    }
                    feedbackTokenRef.current += 1;

                    if (message.error === 'RATE_LIMITED') {
                        setCooldownSeconds(Math.max(0, message.ttl ?? DEFAULT_COOLDOWN_SECONDS));
                        setFeedback({
                            status: 'rejected',
                            message: 'Too fast — wait for the cooldown to finish.',
                            detail: message.error,
                            id: feedbackTokenRef.current
                        });
                    } else {
                        setFeedback({
                            status: 'rejected',
                            message: 'Placement was not accepted.',
                            detail: message.error ?? 'unknown error',
                            id: feedbackTokenRef.current
                        });
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
        };

        connect();

        return () => {
            unmountedRef.current = true;
            generationRef.current += 1; // invalidate any in-flight handlers/fetches

            if (reconnectTimerRef.current !== undefined) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = undefined;
            }
            if (acceptTimerRef.current !== undefined) {
                window.clearTimeout(acceptTimerRef.current);
                acceptTimerRef.current = undefined;
            }

            wsRef.current?.close();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const canPlace = connectionPhase === 'connected'
        && snapshotLoaded
        && cooldownSeconds <= 0;

    const placePixel = (x: number, y: number, colorId: number): boolean => {
        const ws = wsRef.current;

        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        if (!snapshotLoadedRef.current) return false;
        if (cooldownSecondsRef.current > 0) return false;

        ws.send(encodePlacement(x, y, colorId));
        setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);

        if (acceptTimerRef.current !== undefined) {
            window.clearTimeout(acceptTimerRef.current);
        }
        feedbackTokenRef.current += 1;
        const myToken = feedbackTokenRef.current;

        // No explicit ACK exists in the current protocol — only ERROR is sent
        // on rejection. Show an optimistic "accepted" state if nothing
        // rejects the placement within a short window.
        acceptTimerRef.current = window.setTimeout(() => {
            acceptTimerRef.current = undefined;
            if (feedbackTokenRef.current !== myToken) return;
            setFeedback({ status: 'accepted', message: 'Placed.', id: myToken });
        }, ACCEPT_FEEDBACK_DELAY_MS);

        return true;
    };

    return {
        connectionPhase,
        reconnectAttempt,
        cooldownSeconds,
        feedback,
        canPlace,
        placePixel
    };
}
