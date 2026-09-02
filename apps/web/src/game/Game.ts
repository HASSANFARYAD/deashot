import { GameEngine } from "./GameEngine";
import { GameSocket } from "./networking/GameSocket";

export type { GameEngine, GameState, GameCallbacks } from "./GameEngine";
export { GameSocket } from "./networking/GameSocket";

export interface CreateGameOptions {
  /** When true, connects to the game server for multiplayer. */
  online?: boolean;
}

/**
 * Create a game instance inside the given container element.
 * In online mode a GameSocket connects to the server and remote players render.
 * Returns a handle to dispose the game when done.
 */
export function createGame(
  container: HTMLElement,
  onStateChange?: (state: import("./GameEngine").GameState) => void,
  options: CreateGameOptions = {}
) {
  let socket: GameSocket | null = null;
  if (options.online) {
    socket = new GameSocket();
    socket.connect().catch((err) => {
      console.error("Failed to join game server:", err);
    });
  }
  const engine = new GameEngine(container, { onStateChange }, { socket: socket ?? undefined });
  return {
    dispose: () => engine.dispose(),
    getEngine: () => engine,
  };
}
