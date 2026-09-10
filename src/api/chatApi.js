import { apiRequest } from "./apiClient";

/**
 * @param {string} message
 * @param {{role: "user"|"assistant", text: string}[]} history
 * @returns {Promise<{reply: string}>}
 */
export function sendChatMessage(message, history) {
  return apiRequest(
    "/api/chat",
    { method: "POST", body: JSON.stringify({ message, history }) },
    "Couldn't reach the chat assistant.",
  );
}
