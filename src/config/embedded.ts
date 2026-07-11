/**
 * Valores embutidos no binário em tempo de build (via --define em scripts/build.ts).
 * Em dev (bun run) as constantes não existem e os campos ficam undefined —
 * nesse caso a configuração vem do .env, que sempre tem precedência.
 */

declare const __EMBED_SUPABASE_URL__: string;
declare const __EMBED_SUPABASE_ANON_KEY__: string;
declare const __EMBED_MC_HOST__: string;
declare const __EMBED_MC_PORT__: string;
declare const __EMBED_MC_VERSION__: string;
declare const __EMBED_BOT_AUTH__: string;
declare const __EMBED_CHAT_ADMINS__: string;

export const embedded = {
  supabaseUrl:
    typeof __EMBED_SUPABASE_URL__ !== 'undefined' ? __EMBED_SUPABASE_URL__ : undefined,
  supabaseAnonKey:
    typeof __EMBED_SUPABASE_ANON_KEY__ !== 'undefined' ? __EMBED_SUPABASE_ANON_KEY__ : undefined,
  minecraftHost: typeof __EMBED_MC_HOST__ !== 'undefined' ? __EMBED_MC_HOST__ : undefined,
  minecraftPort: typeof __EMBED_MC_PORT__ !== 'undefined' ? __EMBED_MC_PORT__ : undefined,
  minecraftVersion: typeof __EMBED_MC_VERSION__ !== 'undefined' ? __EMBED_MC_VERSION__ : undefined,
  botAuth: typeof __EMBED_BOT_AUTH__ !== 'undefined' ? __EMBED_BOT_AUTH__ : undefined,
  chatAdmins: typeof __EMBED_CHAT_ADMINS__ !== 'undefined' ? __EMBED_CHAT_ADMINS__ : undefined,
};
