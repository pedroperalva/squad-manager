# Squad Manager

Manager de futebol.

## Stack

- Next.js + TypeScript + Tailwind
- Engine de jogo em `src/engine/` (sem dependência de UI)
- SQLite para saves em `data/squad-manager.db`

## Comandos

```bash
npm run dev        # UI em http://localhost:3000
npm run simulate   # Simula 1 temporada via CLI (ex: npm run simulate PT BENFICA)
npm run build
```

## Países disponíveis

Brasil, Portugal, Espanha, Itália, Inglaterra, França, Alemanha.

## Mecânicas MVP

- Força 1–50, moral, forma, 4 divisões
- Simulação por força agregada + fator casa (+10%)
- Formações 4-4-2, 4-3-3, 3-5-2, 5-3-2, 4-5-1
- Promoção/rebaixamento, reputação do técnico, demissão, transferências
