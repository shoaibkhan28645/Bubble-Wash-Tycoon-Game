import { PLAYGAMA } from '../platform/playgama';

/**
 * Escape closes a card, dialog or panel, except in the Playgama build: there the
 * browser keeps Esc for leaving full screen (Playgama's rule 1.5.2). Every one
 * of them also has a button that closes it.
 */
export const isEscape = (e: KeyboardEvent): boolean => !PLAYGAMA && e.key === 'Escape';
