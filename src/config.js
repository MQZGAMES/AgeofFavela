'use strict';
(function (AF) {
  AF.CFG = {
    N: 40,          // tamanho do mapa (N x N tiles)
    HW: 48,         // meia largura do tile na tela (tile = 96 x 48, projeção 2:1)
    HH: 24,         // meia altura do tile na tela
    UZ: 14,         // pixels por unidade de altura (1 degrau)
    FLOOR: 4,       // unidades de altura por pavimento (56 px)
    STEP: 1.05,     // maior desnível que dá para subir/descer a pé
    SPEED: 3.4,     // tiles por segundo
    RUN: 1.65,      // multiplicador ao correr
    RADIUS: 0.2,    // raio de colisão das entidades (em tiles)
  };

  AF.T = { NONE: 0, AVENUE: 1, SIDEWALK: 2, ROAD: 3, BECO: 4, STAIR: 5, PLAZA: 6, HOUSE: 7, LOT: 8 };
  AF.WALK = new Set([1, 2, 3, 4, 5, 6]);
  AF.TYPE_NAME = ['—', 'Avenida (asfalto)', 'Calçada', 'Rua principal', 'Beco', 'Escadaria', 'Pracinha', 'Casa', 'Terreno baldio'];

  AF.PALETTE = ['#3f8fd2', '#f2c53d', '#e87ba8', '#8fd14f', '#f08a3c', '#9b7fd4', '#ece6da',
    '#3cc4b4', '#f4a28c', '#5fb7e8', '#e8e05a', '#d9534f', '#7fd6a0'];
  AF.VEH_COLORS = ['#c0392b', '#ecf0f1', '#2c3e50', '#7f8c8d', '#2980b9', '#f1c40f', '#16a085', '#8e44ad'];
})(window.AF = window.AF || {});
