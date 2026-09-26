import type { KeyboardEvent } from 'react';
import type { SwatchDefinition } from '../palette';
import { SWATCHES } from '../palette';
import type { PlacementFeedbackState } from '../useCanvasSocket';
import { PlacementFeedback } from './PlacementFeedback';

interface PaletteDockProps {
    selectedIndex: number;
    onSelect: (index: number) => void;
    cooldownSeconds: number;
    canPlace: boolean;
    feedback: PlacementFeedbackState | null;
}

function readyLabel(canPlace: boolean, cooldownSeconds: number): string {
    if (cooldownSeconds > 0) return `Ready in ${cooldownSeconds}s`;
    if (!canPlace) return 'Waiting for connection…';
    return 'Ready to place';
}

export function PaletteDock({
    selectedIndex,
    onSelect,
    cooldownSeconds,
    canPlace,
    feedback
}: PaletteDockProps) {
    const selected: SwatchDefinition = SWATCHES[selectedIndex];
    const swatchesDisabled = !canPlace;

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (swatchesDisabled) return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(index);
        }
    };

    return (
        <div className="dock">
            <div className="dock-row">
                <p className="dock-title" id="palette-title">Choose a color</p>
                <span className="status-pill" data-ready={canPlace && cooldownSeconds === 0}>
                    {readyLabel(canPlace, cooldownSeconds)}
                </span>
            </div>

            <div className="dock-selected">
                <span
                    className="dock-selected-swatch"
                    style={{ background: selected.hex }}
                    aria-hidden="true"
                />
                <span>
                    Selected: <span className="dock-selected-name">{selected.name}</span>
                </span>
            </div>

            <div
                className="swatch-grid"
                role="group"
                aria-labelledby="palette-title"
            >
                {SWATCHES.map((swatch, index) => (
                    <button
                        key={swatch.colorId}
                        type="button"
                        className="swatch"
                        data-selected={index === selectedIndex}
                        data-black={swatch.name === 'Black'}
                        style={{ background: swatch.hex }}
                        aria-label={`Select ${swatch.name}`}
                        aria-pressed={index === selectedIndex}
                        disabled={swatchesDisabled}
                        onClick={() => onSelect(index)}
                        onKeyDown={event => handleKeyDown(event, index)}
                    />
                ))}
            </div>

            <p className="guidance">Select a color, then choose a cell.</p>

            <PlacementFeedback feedback={feedback} />
        </div>
    );
}