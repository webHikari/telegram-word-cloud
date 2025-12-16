import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { blacklist } from "../../db/schema.ts"
import { eq } from 'drizzle-orm';
const db = drizzle(`postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@localhost:${process.env.DB_PORT}/${process.env.DB_NAME}`!);


export const isAllowedToProcessMsg = async (userID: number): Promise<boolean> => {
    const settings = await db.select({ canSave: blacklist.canSave }).from(blacklist).where(eq(blacklist.userID, userID))

    // userID: bigint
    // canSave: boolean
    // command /dont_save_my_data turns canSave to false
    // command /save_my_data turns canSave to true

    // no restrictions? FUCKING SAVE
    if (settings.length === 0) {
        return true
    }

    return settings[0]?.canSave === true
}