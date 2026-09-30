# Age of Favelas — Prompt otimizado

## Papel
Atue como **desenvolvedor de jogos sênior e artista técnico**. Entregue código **funcional e executável**, não só orientações. Quando houver escolhas de arquitetura, decida, implemente e explique em poucas linhas.

## Entregável
Um protótipo jogável 2.5D **isométrico** (projeção 2:1) ambientado em uma favela do Rio de Janeiro:
- **Stack:** HTML5 Canvas 2D + JavaScript puro, sem dependências nem build — abre com duplo clique no `index.html`.
- **Arte 100% procedural** (desenhada por código), para não depender de sprites externos; a arquitetura deve permitir trocar por sprites depois.
- **Mapa procedural com seed** (tecla para regenerar), garantindo que toda área caminhável seja alcançável a partir do spawn.
- Código organizado em módulos: `util` (RNG/ruído/cores), `config`, `world` (geração, colisão, pathfinding), `render` (desenho), `entities` (jogador, NPCs, veículos), `main` (loop, input, câmera, HUD).

## 1. Ambientação, arquitetura e layout
**Topografia** — morro íngreme: a altura cresce da base (asfalto) até o topo; grid com **altura por tile** em degraus discretos. Diferenças de altura grandes viram muros de arrimo intransponíveis.

**Arquitetura sobreposta**
- Casas de 1 a 4 pavimentos, agrupadas em blocos de 1×1 a 2×3 tiles, apoiadas em fundações de alturas diferentes → efeito de "muralha"/escadaria visual.
- Acabamentos mistos por pavimento: reboco pintado em cores vibrantes (azul, amarelo, rosa, verde-alface, laranja, lilás, turquesa…), pavimentos superiores em **tijolo baiano aparente** com pilares e vigas de concreto, reboco descascado, sujeira na base das paredes.
- Coberturas: **lajes** (mureta, caixa-d'água azul de polietileno, antena parabólica e espinha-de-peixe, varal com roupas, churrasqueira com fumaça, cadeira de praia, vasos), **obras** (pilares com vergalhões expostos para futura ampliação) e **telhas** de fibrocimento.
- Portas, janelas variadas (vidro, grade, veneziana, basculante, vão sem acabamento) e aparelhos de ar-condicionado.

**Vias de circulação**
- **Avenida de asfalto** na base (calçada com padrão de ondas, faixa de pedestres).
- **Rua principal** em ziguezague (2 tiles de largura, rampas suaves com altura interpolada por vértice) do asfalto ao topo, com tráfego de carros, vans e mototáxis.
- **Becos e escadarias**: passagens de 1 tile, labirínticas, em concreto bruto ou cerâmica, degraus com quina pintada — só pedestres.
- Pequenas praças com mangueira e mesas de bar.

**Cenografia**
- Postes com **emaranhado de fios e "gatos"** ligando postes e casas.
- Pichações/grafites nas paredes; comércio local (bar com mesas plásticas amarelas/vermelhas, mercearia com placa escrita à mão e "ACEITA PIX", barbearia, açaí).
- Vegetação: bananeiras, mangueiras, mato nas frestas junto às paredes, terrenos baldios com entulho.
- Vida urbana: motos estacionadas, lixeiras comunitárias com sacos, botijões de gás, barris, **cães vira-latas** e **moradores** andando.

## 2. Mecânicas e controle
- **Movimento em 8 direções**: WASD/setas (as diagonais de tela se alinham aos eixos do grid, ideal para becos), **gamepad/D-pad**, e **click/toque para mover** com **A\*** (8 direções, sem cortar quinas, respeitando degraus). Shift = correr.
- Transição suave de altura ao subir/descer degraus e rampas; animação de caminhada com direção (frente/costas/lado).
- **Colisão em camadas**: cada tile tem tipo, altura e flag de bloqueio. Só é possível passar entre tiles com diferença de altura ≤ 1 degrau; paredes, props (postes, lixeiras, motos, mesas, barris) e desníveis/lajes (precipícios) bloqueiam. Veículos são obstáculos dinâmicos (e buzinam quando o jogador está na frente).
- **Ordenação de profundidade**: pintor por diagonal isométrica (`x + y`); entidades são desenhadas ao fim da diagonal do tile que ocupam, o que resolve corretamente becos escondidos atrás de casas empilhadas.
- **Raio-X**: detecta a fração do jogador coberta por geometria desenhada depois dele (teste ponto-em-coluna isométrica); estruturas que cobrem o jogador ficam translúcidas com fade suave e o jogador é redesenhado como **silhueta** por cima.

## 3. Ferramentas de debug e HUD
- `G`: sobreposição da grade de colisão (verde = caminhável, vermelho = bloqueado, linhas vermelhas = degrau alto demais).
- `X`: liga/desliga raio-X. `R`: novo mapa (nova seed). Roda do mouse: zoom. `H`: ajuda.
- HUD com tipo de tile, altitude, % de oclusão, FPS; minimapa isométrico com a posição do jogador.

## Critérios de aceite
1. Abre sem servidor e sem erros no console.
2. Jogador anda em 8 direções, sobe escadarias e rampas, e não atravessa paredes nem cai de lajes.
3. Ao entrar num beco atrás de uma casa alta, a casa fica translúcida e a silhueta aparece.
4. Todo tile caminhável é alcançável; click-to-move encontra caminho por becos e escadarias.
5. Roda a 60 fps num notebook comum.
