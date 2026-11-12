// an entry with only the fields a test sets, as an old library or a hand-made backup might hold one: the app reads
// every other field as missing. One cast, here, instead of one in every test
import type { Item } from "../../src/features/core/model";

export const bare = (fields: Partial<Item>): Item => fields as Item; // cast: the rest are left out on purpose
