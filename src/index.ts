/** Ponto de entrada — cada instância controla 1 bot com 1 LLM. */
import { botConfig, gambiarraConfig } from '@/config/settings';
import { BotManager } from '@/bot/BotManager';
import { AgentLoop } from '@/core/AgentLoop';
import { GambiLLM } from '@/llm/GambiarraLLM';
import { sleep } from '@/utils/sleep';
import { parseArgs } from '@/utils/args';
import type { OnlineParticipant } from '@/types/types';

function printUsage(): void {
  console.log(`
🤖 Minecraft Bot — Agente Autônomo (via Gambi Hub)

Cada instância controla 1 bot no Minecraft usando 1 LLM participante.
Métricas são coletadas no Supabase para análise comparativa.

Uso:
  minecraft-bot --room <ROOM_CODE> [opções]        (binário instalado)
  bun run start -- --room <ROOM_CODE> [opções]     (a partir do repo)

Opções:
  --room, -r <code>          Código da sala Gambi (obrigatório)
  --participant, -p <name>   Nickname ou ID do participante (opcional — auto-detecta se só tem 1)
  --hub <url>                URL do hub (default: ${gambiarraConfig.hubUrl})
  --mc-host <host>           Host do servidor Minecraft (default: ${botConfig.host})
  --mc-port <port>           Porta do servidor Minecraft (default: ${botConfig.port})
  --help, -h                 Mostra esta ajuda

Exemplo:
  minecraft-bot --room ABC123
  minecraft-bot --room ABC123 -p meu-pc
  minecraft-bot --room ABC123 --hub http://192.168.1.10:3000 --mc-host 192.168.1.10

Variáveis de ambiente (opcionais — flags têm precedência):
  SUPABASE_URL         URL do projeto Supabase (para coleta de dados)
  SUPABASE_ANON_KEY    Chave anônima do Supabase
  MINECRAFT_HOST       Host do servidor Minecraft (default: localhost)
  MINECRAFT_PORT       Porta do servidor (default: 25565)
  BOT_USERNAME         Nome do bot (default: AgenteBot)
`);
}

/** Resolve qual participante este bot vai usar. */
async function resolveParticipant(
  llm: GambiLLM,
  hint?: string | null,
): Promise<OnlineParticipant> {
  const participants = await llm.getOnlineParticipants();

  if (participants.length === 0) {
    console.error('❌ Nenhum participante online na sala!');
    console.error('   Rode primeiro: gambi join --code <ROOM> --model <MODEL>');
    process.exit(1);
  }

  // Se especificou, busca por nickname ou ID
  if (hint) {
    const search = hint.toLowerCase();
    const found = participants.find(
      (p) => p.nickname.toLowerCase() === search || p.id.toLowerCase() === search,
    );
    if (!found) {
      console.error(`❌ Participante "${hint}" não encontrado!\n`);
      console.error('   Participantes online:');
      for (const p of participants) {
        console.error(`     - ${p.nickname} (${p.model}) [ID: ${p.id}]`);
      }
      process.exit(1);
    }
    return found;
  }

  // Auto-detecta se só tem 1
  if (participants.length === 1) {
    console.log(`🔍 Auto-detectado: ${participants[0]!.nickname} (${participants[0]!.model})`);
    return participants[0]!;
  }

  // Múltiplos: precisa especificar
  console.error(`❌ ${participants.length} participantes online — especifique qual usar com --participant\n`);
  console.error('   Participantes online:');
  for (const p of participants) {
    console.error(`     - ${p.nickname} (${p.model}) [ID: ${p.id}]`);
  }
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.room) {
    console.error('❌ Room code obrigatório!\n');
    console.error('   Crie uma sala com: gambi create --name "Benchmark AI"');
    console.error('   Depois execute:    bun run dev --room <ROOM_CODE>\n');
    printUsage();
    process.exit(1);
  }

  const roomCode = args.room;
  const hubUrl = args.hub ?? gambiarraConfig.hubUrl;

  console.log('🤖 Minecraft Bot — Agente Autônomo\n');
  console.log(`   Sala: ${roomCode}`);
  console.log(`   Hub:  ${hubUrl}\n`);

  // Resolve participante
  const tempLlm = new GambiLLM({ roomCode, hubUrl, participantId: '' });
  const participant = await resolveParticipant(tempLlm, args.participant);

  const gpu = participant.specs?.gpu ?? '?';
  const ram = participant.specs?.ram ?? '?';
  console.log(`✅ Participante: ${participant.nickname} — ${participant.model} (GPU: ${gpu}, RAM: ${ram})\n`);

  // Cria LLM configurado pro participante
  const llm = new GambiLLM({ roomCode, hubUrl, participantId: participant.id });

  // Inicializa bot Minecraft (flags CLI sobrescrevem .env)
  const botConfigWithParticipant: typeof botConfig = {
    ...botConfig,
    username: participant.id,
    host: args.mcHost ?? botConfig.host,
    port: args.mcPort ?? botConfig.port,
  };
  const botManager = new BotManager(botConfigWithParticipant);
  const agent = new AgentLoop(botManager, llm, {
    roomCode,
    botUsername: participant.id,
    participantId: participant.id,
    participantNickname: participant.nickname,
    modelName: participant.model,
    participant,
    hubUrl,
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n🛑 Encerrando...');
    await agent.shutdown();
    process.exit(exitCode);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  // Conecta e inicia
  botManager.createBot();
  await sleep(2000);
  await agent.start();
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
