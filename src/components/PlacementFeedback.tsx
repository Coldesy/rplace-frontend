import type { PlacementFeedbackState } from '../useCanvasSocket';

interface PlacementFeedbackProps {
    feedback: PlacementFeedbackState | null;
}

export function PlacementFeedback({ feedback }: PlacementFeedbackProps) {
    if (!feedback) return null;

    return (
        <div
            className="placement-feedback"
            data-status={feedback.status}
            role="status"
            aria-live="polite"
        >
            {feedback.message}
            {feedback.detail && feedback.status === 'rejected' && (
                <span> ({feedback.detail})</span>
            )}
        </div>
    );
}
