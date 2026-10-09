"use client";

/**
 * Efectos de cámara de la calidad alta: oclusión ambiental (sombras de
 * contacto en rincones y bajo los muebles), brillo de pantallas y luces,
 * suavizado de bordes, viñeta sutil y tono de color neutro.
 */

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

export function SceneEffects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO halfRes aoRadius={0.55} distanceFalloff={0.9} intensity={2.6} color="#1a1410" />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.55} />
      {/* Neutral (Khronos PBR): colores fieles, sin el amarillo apagado de ACES. */}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.4} darkness={0.22} />
      <SMAA />
    </EffectComposer>
  );
}
