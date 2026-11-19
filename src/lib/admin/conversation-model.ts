import type { ChatMessage, ConversationPage } from "./queries";
const compare = (a: ChatMessage, b: ChatMessage) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  return [...new Map([...current, ...incoming].map(message => [message.id, message])).values()].sort(compare);
}
export function refreshConversation(current: ConversationPage, incoming: ConversationPage): ConversationPage {
  if (!current.messages.length) return incoming;
  // A long disconnect or burst of messages can leave a gap. Restart from the latest
  // page so Load earlier can traverse the gap instead of skipping it permanently.
  if (incoming.nextBefore && incoming.messages.length && compare(incoming.messages[0], current.messages.at(-1)!) > 0) return incoming;
  return { messages: mergeChatMessages(current.messages, incoming.messages), nextBefore: current.nextBefore };
}
