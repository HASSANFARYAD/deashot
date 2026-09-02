import { GameEngine } from "./GameEngine";

export type { GameEngine, GameState, GameCallbacks } from "./GameEngine";

/**
 * Create a game instance inside the given container element.
 * Returns a handle to dispose the game when done.
 */
export function createGame(
  container: HTMLElement,
  onStateChange?: (state: import("./GameEngine").GameState) => void
) {
  const engine = new GameEngine(container, { onStateChange });
  return {
    dispose: () => engine.dispose(),
    getEngine: () => engine,
  };
}
