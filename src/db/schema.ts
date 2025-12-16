import { integer, pgTable, varchar, json, timestamp, bigint } from "drizzle-orm/pg-core";

export const wordsTable = pgTable("words", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    word: varchar({ length: 255 }).notNull(),
    freq: integer().notNull().default(1),
    userID: bigint({ mode: 'number' }).notNull(),
    chatID: bigint({ mode: 'number' }).notNull(),
});

export const last24hrWords = pgTable("last24hrWords", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    word: varchar({ length: 255 }).notNull(),
    freq: integer().notNull().default(1),
    userID: bigint({ mode: 'number' }).notNull(),
    chatID: bigint({ mode: 'number' }).notNull(),
});

export const last24hrChanges = pgTable("last24hrChanges", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    message: json().notNull(),
    userID: bigint({ mode: 'number' }).notNull(),
    chatID: bigint({ mode: 'number' }).notNull(),
    sendedAt: timestamp().notNull()
});