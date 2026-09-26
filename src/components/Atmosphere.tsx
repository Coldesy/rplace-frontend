import { useMemo } from 'react';

interface Mote {
    id: number;
    top: string;
    left: string;
    driftX: string;
    driftY: string;
    duration: string;
    delay: string;
}

const MOTE_COUNT = 22;

function buildMotes(): Mote[] {
    const motes: Mote[] = [];

    for (let i = 0; i < MOTE_COUNT; i++) {
        motes.push({
            id: i,
            top: `${Math.round(Math.random() * 100)}%`,
            left: `${Math.round(Math.random() * 100)}%`,
            driftX: `${Math.round(-80 - Math.random() * 160)}px`,
            driftY: `${Math.round(60 + Math.random() * 160)}px`,
            duration: `${(10 + Math.random() * 14).toFixed(1)}s`,
            delay: `${(-Math.random() * 20).toFixed(1)}s`
        });
    }

    return motes;
}

/**
 * Purely decorative. Never intercepts pointer events and is hidden from
 * assistive tech so it can never sit between a user and the canvas/dock.
 */
export function Atmosphere() {
    const motes = useMemo(() => buildMotes(), []);

    return (
        <div className="atmosphere" aria-hidden="true">
            <div className="atmosphere-halo" />
            {motes.map(mote => (
                <span
                    key={mote.id}
                    className="atmosphere-mote"
                    data-mote-index={mote.id}
                    style={{
                        top: mote.top,
                        left: mote.left,
                        animationDuration: mote.duration,
                        animationDelay: mote.delay,
                        // Consumed by the drift-toward-dock keyframes in index.css.
                        ['--drift-x' as string]: mote.driftX,
                        ['--drift-y' as string]: mote.driftY
                    }}
                />
            ))}
        </div>
    );
}
