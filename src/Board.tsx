import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import logo from './assets/logo.png';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './protocol';
import { DEFAULT_SWATCH_INDEX, SWATCHES } from './palette';
import { useCanvasSocket } from './useCanvasSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { PaletteDock } from './components/PaletteDock';

export function Board() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedIndex, setSelectedIndex] = useState(DEFAULT_SWATCH_INDEX);

    const {
        connectionPhase,
        reconnectAttempt,
        cooldownSeconds,
        feedback,
        canPlace,
        placePixel
    } = useCanvasSocket(canvasRef);

    const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
        if (!canPlace) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(
            ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH
        );
        const y = Math.floor(
            ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
        );

        const colorId = SWATCHES[selectedIndex].colorId;
        placePixel(x, y, colorId);
    };

    return (
        <div className="app-shell">
            <header className="topbar">
    <div className="topbar-brand">
    <img src={logo} alt="r/place logo" className="topbar-logo" />
    
        <p className="topbar-title">r/place</p>
        <p className="topbar-subtitle">You have one pixel - Don't fuck it up.</p>
    </div>
    <ConnectionStatus phase={connectionPhase} reconnectAttempt={reconnectAttempt} />
</header>

            <div className="stage">
                <div className="canvas-frame">
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_WIDTH}
                        height={CANVAS_HEIGHT}
                        onClick={handleCanvasClick}
                        role="img"
                        aria-label="Collaborative pixel canvas"
                        style={{
                            cursor: canPlace ? 'crosshair' : 'wait'
                        }}
                    />
                </div>
            </div>

            <PaletteDock
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                cooldownSeconds={cooldownSeconds}
                canPlace={canPlace}
                feedback={feedback}
            />
        </div>
    );
}
