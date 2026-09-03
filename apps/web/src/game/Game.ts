import { GameEngine } from "./GameEngine";
import type { GameCallbacks } from "./GameEngine";
import { GameSocket } from "./networking/GameSocket";

export type { GameEngine, GameState, GameCallbacks } from "./GameEngine";
export type { ServerHitEvent, ServerKillEvent, ServerDamageEvent } from "./networking/GameSocket";
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
  callbacks: GameCallbacks = {},
  options: CreateGameOptions = {}
) {
  let socket: GameSocket | null = null;
  if (options.online) {
    socket = new GameSocket();
    socket.connect().catch((err) => {
      console.error("Failed to join game server:", err);
    });
  }
  const engine = new GameEngine(container, callbacks, { socket: socket ?? undefined });
  return {
    dispose: () => engine.dispose(),
    getEngine: () => engine,
  };
}
