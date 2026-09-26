// The six colors a user can place with.
//
// Display colors intentionally match the EXISTING backend palette entries
// exactly (not an external r/place-style hex spec) so the swatch a user
// selects always matches the pixel that actually lands on the board.
// Order here is the stable, user-facing swatch order.

export interface SwatchDefinition {
    /** Human-readable name shown in the dock and used in aria-labels. */
    name: string;
    /** Display color, matching the backend's own RGB for this colorId exactly. */
    hex: string;
    rgb: readonly [number, number, number];
    /** The numeric index this backend expects in the placement payload. */
    colorId: number;
}

export const SWATCHES: readonly SwatchDefinition[] = [
    { name: 'Red', hex: '#FF0000', rgb: [255, 0, 0], colorId: 2 },
    { name: 'Orange', hex: '#FFA500', rgb: [255, 165, 0], colorId: 6 },
    { name: 'Yellow', hex: '#FFFF00', rgb: [255, 255, 0], colorId: 5 },
    { name: 'Green', hex: '#00FF00', rgb: [0, 255, 0], colorId: 3 },
    { name: 'Blue', hex: '#0000FF', rgb: [0, 0, 255], colorId: 4 },
    { name: 'Black', hex: '#000000', rgb: [0, 0, 0], colorId: 1 }
];

export const DEFAULT_SWATCH_INDEX = 0;
