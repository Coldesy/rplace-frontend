import type { ConnectionPhase } from '../useCanvasSocket';

interface ConnectionStatusProps {
    phase: ConnectionPhase;
    reconnectAttempt: number;
}

function labelFor(phase: ConnectionPhase, reconnectAttempt: number): string {
    switch (phase) {
        case 'connected':
            return 'Connected';
        case 'reconnecting':
            return reconnectAttempt > 1
                ? `Reconnecting (attempt ${reconnectAttempt})`
                : 'Reconnecting';
        case 'connecting':
        default:
            return 'Connecting';
    }
}

export function ConnectionStatus({ phase, reconnectAttempt }: ConnectionStatusProps) {
    return (
        <div className="connection-status" role="status" aria-live="polite">
            <span className="connection-dot" data-phase={phase} aria-hidden="true" />
            <span>{labelFor(phase, reconnectAttempt)}</span>
        </div>
    );
}
