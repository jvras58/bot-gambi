/** Schema Zod das ações do bot. */
import { z } from 'zod';

export const botActionSchema = z.object({
  acao: z.enum(['FALAR', 'ANDAR', 'PULAR', 'OLHAR', 'EXPLORAR', 'PARAR', 'NADA', 'SEGUIR', 'FUGIR', 'COLETAR', 'CRAFTAR', 'ATACAR']),
  conteudo: z.string().optional(),
  direcao: z.enum(['frente', 'tras', 'esquerda', 'direita', 'aleatorio']).optional(),
  raciocinio: z.string().optional(),
  alvo: z.string().optional(),
});

export type BotAction = z.infer<typeof botActionSchema>;
