/**
 * The controls the parent panel can flip.
 *
 * A type on its own so the panel's implementation and its callers can share it
 * without importing each other's DOM code.
 */

export type PanelToggleId = 'helper' | 'sfx';
