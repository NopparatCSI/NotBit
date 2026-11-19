import { expect, it } from "vitest";
import { refreshConversation } from "../src/lib/admin/conversation-model";
import type { ChatMessage } from "../src/lib/admin/queries";
const message = (id: string): ChatMessage => ({ id, from: "BUYER", body: id, hasImage: false, created_at: "2026-11-19T00:00:00Z" });
it("retains loaded older messages on refresh but resets pagination if a burst leaves a gap", () => {
  const history = { messages: [message("01"),message("02"),message("03")], nextBefore: "01" };
  const overlap = refreshConversation(history,{messages:[message("03"),message("04")],nextBefore:"03"});
  expect(overlap.messages.map(m=>m.id)).toEqual(["01","02","03","04"]); expect(overlap.nextBefore).toBe("01");
  const recent = { messages: [message("10"),message("11")], nextBefore: "10" };
  expect(refreshConversation(history,recent)).toEqual(recent);
});
