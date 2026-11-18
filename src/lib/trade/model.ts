import { z } from "zod";

export const conversationIdSchema = z.uuid();
export const openConversationSchema = z.strictObject({ listingId: z.uuid() });
export const messageBodySchema = z.string().trim().min(1).max(4000);
export const sendMessageSchema = z.strictObject({ id: z.uuid().optional(), body: messageBodySchema });

export type Conversation = {
  id: string;
  buyerId: string;
  sellerId: string;
  listing: {
    id: string;
    title: string;
    game_slug: string;
    quantity: number;
    region: string;
    delivery_method: string;
    price_wei: string;
    status: "ACTIVE" | "PAUSED" | "SOLD";
  };
};

export type ChatMessage = {
  id: string;
  senderId: string | null;
  kind: "USER" | "SYSTEM";
  body: string;
  createdAt: string;
};

export type MessagePage = { messages: ChatMessage[]; nextBefore: string | null };
