/**
 * fuzzyAction.ts
 *
 * Normaliza ações vindas do LLM para o enum válido mais próximo.
 * Usa distância de Levenshtein para fuzzy matching.
 */

const VALID_ACTIONS = [
  'FALAR', 'ANDAR', 'PULAR', 'OLHAR', 'EXPLORAR',
  'PARAR', 'NADA', 'SEGUIR', 'FUGIR', 'COLETAR', 'CRAFTAR', 'ATACAR',
] as const;

const VALID_DIRECTIONS = ['frente', 'tras', 'esquerda', 'direita', 'aleatorio'] as const;

/** Distância de Levenshtein entre duas strings */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] !== b[j - 1] ? 1 : 0),
      );
    }
  }
  return dp[m]![n]!;
}

/** Encontra o item mais próximo de uma lista, com threshold máximo */
function findClosest(input: string, candidates: readonly string[], maxDistance = 3): string | null {
  const normalized = input.toUpperCase().trim();

  // Match exato primeiro
  const exact = candidates.find(c => c === normalized);
  if (exact) return exact;

  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(normalized, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= maxDistance ? best : null;
}

/**
 * Normaliza os campos do objeto de ação do LLM antes da validação Zod.
 * Corrige ações e direções aproximadas (ex: COLETOR → COLETAR).
 */
export function normalizeAction(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };

  // Normaliza ação
  if (typeof result.acao === 'string') {
    const matched = findClosest(result.acao, VALID_ACTIONS);
    if (matched && matched !== result.acao) {
      console.log(`      🔄 Ação corrigida: "${result.acao}" → "${matched}"`);
      result.acao = matched;
    }
  }

  // Normaliza direção
  if (typeof result.direcao === 'string') {
    const matched = findClosest(result.direcao.toLowerCase(), VALID_DIRECTIONS, 3);
    if (matched && matched !== result.direcao) {
      console.log(`      🔄 Direção corrigida: "${result.direcao}" → "${matched}"`);
      result.direcao = matched;
    } else if (!matched) {
      delete result.direcao;
    }
  }

  // Remove campos null que o LLM às vezes retorna (Zod espera undefined, não null)
  for (const key of ['conteudo', 'direcao', 'alvo', 'raciocinio']) {
    if (result[key] === null) {
      delete result[key];
    }
  }

  return result;
}
