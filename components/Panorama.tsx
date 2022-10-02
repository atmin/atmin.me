import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import createRegl, { Regl } from "regl";

export default function Panorama({ imgUrl }: { imgUrl: string }) {
  const canvas = useRef<HTMLCanvasElement>();
  const [regl, setRegl] = useState<Regl>();

  const drawTriangle = useMemo(
    () =>
      regl?.({
        frag: `
          precision mediump float;
          uniform vec4 color;
          void main() {
            gl_FragColor = color;
          }`,
        vert: `
          attribute vec2 position;
          void main() {
            gl_Position = vec4(position, 0, 1);
          }`,
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

  const [yaw, setYaw] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);

  const drawPano = useMemo(
    () =>
      regl?.({
        frag: `
          precision mediump float;
          uniform vec4 color;
          void main() {
            gl_FragColor = color;
          }`,
        vert: `
          attribute vec2 position;
          void main() {
            gl_Position = vec4(position, 0, 1);
          }`,
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
  
  useEffect(() => {
    if (!canvas.current) return;
    setRegl(() => createRegl(canvas.current));
  }, [canvas]);

  useEffect(() => {
    regl?.clear({
      color: [0, 0.5, 0.3, 1],
      depth: 1,
    });
    drawTriangle?.({ color: [1, 0, 1, 1] });
  }, [regl, drawTriangle, yaw, pitch]);

  // const ref = useRef<HTMLDivElement>();

  // useEffect(() => {
  //   if (ref.current) {
  //     import("marzipano").then((Marzipano) => {
  //       const viewer = new Marzipano.Viewer(ref.current, {
  //         scrollZoom: true,
  //       });
  //       const source = Marzipano.ImageUrlSource.fromString(imgUrl);
  //       const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
  //       const limiter = Marzipano.util.compose(
  //         Marzipano.RectilinearView.limit.vfov(0.1, 2),
  //         Marzipano.RectilinearView.limit.hfov(0.1, 2),
  //         Marzipano.RectilinearView.limit.pitch(-Math.PI / 2, Math.PI / 2)
  //       );
  //       const view = new Marzipano.RectilinearView({ yaw: Math.PI }, limiter);
  //       const scene = viewer.createScene({ source, geometry, view });
  //       scene.switchTo();
  //     });
  //   }
  // }, [ref, imgUrl]);

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
