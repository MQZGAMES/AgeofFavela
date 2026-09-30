# Age of Favelas — protótipo isométrico

Protótipo 2.5D em perspectiva isométrica de um morro carioca gerado proceduralmente.
É HTML5 Canvas + JavaScript puro, sem dependências nem etapa de build. O prompt de especificação está em [PROMPT.md](PROMPT.md).

## Como rodar
- **Duplo clique em `index.html`**: funciona direto no Chrome, Edge ou Firefox.
- Ou por um servidor local: `python -m http.server 8765` e abra http://localhost:8765
- `?seed=123` na URL fixa o mapa.

## Controles
| Ação | Entrada |
|---|---|
| Andar em 8 direções | WASD / setas (W+D, S+A… seguem os eixos do grid, que é o sentido dos becos) |
| Correr | Shift (gamepad: A / RT) |
| Ir até um ponto | Clique ou toque num caminho (pathfinding A*) |
| Subir escadas das casas | É só andar: a escada e o terraço/laje são chão como outro qualquer |
| Gamepad | Analógico ou D-pad |
| Raio-X on/off | X |
| Grade de colisão | G |
| Novo mapa | R |
| Zoom | Roda do mouse ou + / − |

## Arquitetura
```
src/util.js      RNG com seed, hash, value noise, shade de cores
src/config.js    constantes (tamanho do tile, altura do degrau/pavimento, tipos de tile, paletas)
src/world.js     geração do morro, colisão por tile, A*, picking de tile pelo mouse
src/render.js    todo o desenho procedural: chão, muros de arrimo, casas, lajes, props, fiação, personagens, veículos
src/entities.js  jogador, moradores, cães, carros/vans/mototáxis; colisão contínua
src/main.js      loop, input (teclado/mouse/toque/gamepad), câmera, raio-X, debug, HUD, minimapa
```

### Escala (1 tile = 3 m · 1 unidade de altura = 0,75 m · pavimento = 3 m)
| Elemento | Real | No jogo |
|---|---|---|
| Pessoa | 1,70 m | desenho × 0,66 (~31 px) |
| Moto | 2,0 × 0,8 m | 0,7 × 0,3 tile |
| Carro | 4,2 × 1,8 m | 1,4 × 0,6 tile |
| Van | 4,5 × 1,9 m | 1,5 × 0,64 tile |
| Ônibus | 12 × 2,5 m | 4 × 0,85 tile (avenida) |
| Casa | 6×6 a 9×9 m | blocos de 2×2 a 3×3 tiles |

- Toda casa tem **porta voltada para um caminho alcançável**. Quando a casa não tem nenhum caminho por perto, a geração abre um beco até ela.
- **Acessos verticais** (`planAccess`), sempre dentro do terreno da casa:
  - **Puxadinho**: na fileira da frente, 1–2 tiles viram **escada** (patamar plano + degraus + corrimão) e o resto vira **terraço** na altura do andar de cima; a unidade de cima recua uma fileira e a porta dela abre para o terraço.
  - **Laje acessível**: em casas de 1–2 andares, a escada leva ao teto e a laje inteira vira área de convivência.
  - Escada e terraço são **superfícies caminháveis** (`surf`): a colisão compara alturas por ponto (`heightAt`), então o jogador sobe andando, e a escada e o terraço funcionam como parede e guarda-corpo. O A* passa pela aresta onde o corpo cabe (`crossing`), e o caminho vira waypoints.
- **Portas no nível certo**: a fundação da casa fica exatamente na altura da borda do chão em frente à porta, e portas ou lojas secundárias só aparecem onde a soleira coincide com o chão. A frente de toda porta e escada nunca recebe props.

### Mapa
- **Altura por tile** em unidades de degrau (14 px). O terreno sobe para o fundo (−y) e um pouco para a esquerda (−x).
- **Avenida e calçada** na base. A **rua principal** faz ziguezague com 2 tiles de largura. Ela guarda a altura em cada vértice, que é a média dos tiles vizinhos, e por isso vira rampa suave.
- **Escadarias** fixas e **becos** gerados por caminhantes aleatórios. Os becos não abrem áreas 2×2, então ficam estreitos. Um passo de relaxamento garante que dois caminhos vizinhos nunca tenham desnível maior que 1 degrau.
- **Casas** em blocos de 2×2 até 3×3 (sobras de 1 tile viram anexo da casa vizinha), com 1 a 4 pavimentos. Cada pavimento é pintado ou de tijolo baiano, e o telhado é laje, obra (vergalhões) ou telha. A fundação fica na maior altura do bloco, o que gera os muros de arrimo.
- Depois que um prop que bloqueia é colocado, uma **checagem de conectividade** (BFS) confirma que ele não isolou nenhuma parte do mapa. Se isolou, o prop é removido.

### Colisão
Cada tile tem `type`, `level` e `block`. Uma entidade (raio de 0,2 tile) só ocupa uma posição quando os 4 cantos e o centro estão em tiles caminháveis com desnível ≤ 1,05 em relação ao tile atual. Paredes, props e quedas de laje/precipícios ficam bloqueados. Quando o movimento é bloqueado, a entidade desliza ao longo da parede. Veículos são retângulos dinâmicos: param e buzinam quando o jogador está na frente.

### Profundidade (z-order)
Algoritmo do pintor por diagonal isométrica: os tiles são desenhados em ordem crescente de `x + y` e, dentro da diagonal, de `x`. Entidades entram **no fim da diagonal** do tile que ocupam; o veículo usa o tile do seu canto mais à frente. Com isso, um beco atrás de uma casa empilhada fica corretamente escondido.

### Raio-X
A cada quadro são amostrados 12 pontos sobre o corpo do jogador. Para cada tile desenhado **depois** dele, um teste ponto-em-coluna isométrica verifica se o chão ou a estrutura cobre esses pontos:
- A porcentagem coberta aparece no HUD.
- Acima de 20% de cobertura, as casas e árvores que cobrem o jogador ficam translúcidas com fade suave.
- Sempre que houver cobertura, o jogador é redesenhado por cima como silhueta amarela.

## Próximos passos sugeridos
- Trocar o desenho procedural por sprites (cada função `draw*` em `render.js` corresponde a um sprite).
- Deixar as lajes acessíveis por escadas externas, com um segundo nível de navegação sobre os telhados.
- Ciclo dia/noite com postes acesos, sons ambientes e missões ou diálogos com moradores.
