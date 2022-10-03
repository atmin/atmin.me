import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import createRegl, { Regl, Texture2D } from "regl";

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D texture;
  uniform vec4 color;

  // Passed from vertex shader
  varying vec2 textureCoords;

  void main() {
    gl_FragColor = color;
  }
`;

const VERTEX_SHADER = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0, 1);
  }
`;

export default function Panorama({ imgUrl }: { imgUrl: string }) {
  const canvas = useRef<HTMLCanvasElement>();
  const [regl, setRegl] = useState<Regl>();
  const [panoTexture, setPanoTexture] = useState<Texture2D>();

  // Start from little planet view
  const [fov, setFov] = useState<number>(180);
  const [yaw, setYaw] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);

  const drawPano = useMemo(
    () =>
      regl?.({
        frag: FRAGMENT_SHADER,
        vert: VERTEX_SHADER,
        attributes: {
          position: [
            [0, -1],
            [-1, 0],
            [1, 1],
          ],
        },
        uniforms: {
          // @ts-ignore
          color: regl?.prop("color"),
        },
        count: 3,
      }),
    [regl]
  );

  // Initialize regl on canvas
  useEffect(() => {
    if (!canvas.current) return;
    setRegl(() => createRegl(canvas.current));
  }, [canvas]);

  // Load panorama texture
  useEffect(() => {
    if (!regl) return;
    const img = new Image();
    img.src = imgUrl;
    img.onload = () => setPanoTexture(regl.texture(img));
  }, [regl, imgUrl]);

  // Draw panorama texture on canvas
  useEffect(() => {
    if (!regl) return;
    regl.clear({
      color: [0, 0.5, 0.3, 1],
      depth: 1,
    });
    drawPano({ color: [1, 0, 1, 1] });
  }, [regl, drawPano, yaw, pitch]);

  return (
    <canvas
      ref={canvas}
      style={{
        position: "absolute",
        top: "0",
        left: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}
