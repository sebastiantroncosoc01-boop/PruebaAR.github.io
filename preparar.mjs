// Prepara los modelos para la web: combina, escala (1:1 y 1:60) y reduce el peso.
//
// Uso:
//   npm init -y
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
//   Crea la carpeta ./origen con: "Maquina A prueba.glb", "Fardo.glb", "Apilamiento_Fardos.glb"
//   node preparar.mjs
// Resultado: carpeta ./modelos con 8 archivos .glb listos para subir junto a index.html

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const ORIGEN = './origen/';
const SALIDA = './modelos/';

const FUENTES = {
  maquina:     ORIGEN + 'Maquina A prueba.glb',
  fardo:       ORIGEN + 'Fardo.glb',
  apilamiento: ORIGEN + 'Apilamiento_Fardos.glb'
};

// Posiciones del conjunto, en metros (las mismas de tu código original).
const POSICION_EN_CONJUNTO = {
  maquina:     [0, 0, 0],
  fardo:       [3.2, 0, 0],
  apilamiento: [-3.2, 0, 0]
};

const ESCALAS = { '': 1, '_1a60': 1 / 60 };
const TEXTURA_MAX = 1024; // píxeles por lado; baja a 512 si aún pesa mucho

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function construir(claves, posiciones, escala, destino) {
  const doc = new Document();
  doc.createBuffer();
  const escena = doc.createScene('escena');
  const raiz = doc.createNode('raiz').setScale([escala, escala, escala]);
  escena.addChild(raiz);

  for (const clave of claves) {
    const origen = await io.read(FUENTES[clave]);
    const mapa = mergeDocuments(doc, origen);
    const escenaOrigen = origen.getRoot().listScenes()[0];
    const contenedor = doc.createNode(clave).setTranslation(posiciones[clave]);
    for (const nodo of escenaOrigen.listChildren()) contenedor.addChild(mapa.get(nodo));
    raiz.addChild(contenedor);
  }

  // mergeDocuments trae también las escenas de origen: se eliminan.
  for (const s of doc.getRoot().listScenes()) if (s !== escena) s.dispose();
  doc.getRoot().setDefaultScene(escena);

  await doc.transform(
    unpartition(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, resize: [TEXTURA_MAX, TEXTURA_MAX] })
  );

  await io.write(destino, doc);
  console.log('OK', destino);
}

await mkdir(SALIDA, { recursive: true });

const sinOffset = { maquina: [0, 0, 0], fardo: [0, 0, 0], apilamiento: [0, 0, 0] };

for (const [sufijo, escala] of Object.entries(ESCALAS)) {
  await construir(['maquina', 'fardo', 'apilamiento'], POSICION_EN_CONJUNTO, escala, `${SALIDA}conjunto${sufijo}.glb`);
  for (const clave of Object.keys(FUENTES)) {
    await construir([clave], sinOffset, escala, `${SALIDA}${clave}${sufijo}.glb`);
  }
}
