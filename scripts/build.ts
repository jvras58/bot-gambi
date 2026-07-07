/**
 * Compila o bot em binário standalone (não precisa de Bun na máquina de destino).
 *
 * Uso: bun scripts/build.ts [alvo]
 *   alvo: win | linux | mac | mac-intel | all | (vazio = plataforma atual)
 *
 * Se SUPABASE_URL e SUPABASE_ANON_KEY estiverem no ambiente (ou .env),
 * eles são embutidos no binário — o participante não precisa de .env.
 */

const TARGETS: Record<string, { triple: string; outfile: string }> = {
  win: { triple: 'bun-windows-x64', outfile: 'dist/win-x64/minecraft-bot.exe' },
  linux: { triple: 'bun-linux-x64', outfile: 'dist/linux-x64/minecraft-bot' },
  mac: { triple: 'bun-darwin-arm64', outfile: 'dist/darwin-arm64/minecraft-bot' },
  'mac-intel': { triple: 'bun-darwin-x64', outfile: 'dist/darwin-x64/minecraft-bot' },
};

function hostTarget(): string {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac' : 'mac-intel';
  return 'linux';
}

const requested = process.argv[2] ?? hostTarget();
const targetNames = requested === 'all' ? Object.keys(TARGETS) : [requested];

for (const name of targetNames) {
  if (!TARGETS[name]) {
    console.error(`❌ Alvo desconhecido: "${name}". Use: ${Object.keys(TARGETS).join(' | ')} | all`);
    process.exit(1);
  }
}

const defines: string[] = [];
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (supabaseUrl && supabaseKey) {
  defines.push('--define', `__EMBED_SUPABASE_URL__=${JSON.stringify(supabaseUrl)}`);
  defines.push('--define', `__EMBED_SUPABASE_ANON_KEY__=${JSON.stringify(supabaseKey)}`);
  console.log('🔑 Credenciais Supabase serão embutidas no binário');
} else {
  console.log('⚠️  SUPABASE_URL/SUPABASE_ANON_KEY ausentes — binário sairá sem coleta de métricas embutida');
}

const mcHost = process.env.MINECRAFT_HOST;
const mcPort = process.env.MINECRAFT_PORT;
if (mcHost) {
  defines.push('--define', `__EMBED_MC_HOST__=${JSON.stringify(mcHost)}`);
  if (mcPort) defines.push('--define', `__EMBED_MC_PORT__=${JSON.stringify(mcPort)}`);
  console.log(`🎮 Servidor Minecraft padrão embutido: ${mcHost}:${mcPort ?? '25565'}`);
} else {
  console.log('⚠️  MINECRAFT_HOST ausente — binário usará localhost como default (participantes precisam de --mc-host)');
}

const mcVersion = process.env.MINECRAFT_VERSION;
const botAuth = process.env.BOT_AUTH;
if (mcVersion) {
  defines.push('--define', `__EMBED_MC_VERSION__=${JSON.stringify(mcVersion)}`);
  console.log(`🧩 Versão do Minecraft embutida: ${mcVersion}`);
}
if (botAuth) {
  defines.push('--define', `__EMBED_BOT_AUTH__=${JSON.stringify(botAuth)}`);
}

for (const name of targetNames) {
  const { triple, outfile } = TARGETS[name]!;
  console.log(`\n📦 Compilando ${name} (${triple}) → ${outfile}`);
  const proc = Bun.spawnSync(
    ['bun', 'build', '--compile', `--target=${triple}`, 'src/index.ts', '--outfile', outfile, ...defines],
    { stdout: 'inherit', stderr: 'inherit' },
  );
  if (proc.exitCode !== 0) {
    console.error(`❌ Build falhou para ${name}`);
    process.exit(proc.exitCode ?? 1);
  }
}

console.log('\n✅ Build concluído');
