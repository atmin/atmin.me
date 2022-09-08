import { useEffect, useRef } from "react";
// import Marzipano from "marzipano";

export default function Panorama({ imgUrl }: { imgUrl: string }) {
  const ref = useRef<HTMLDivElement>();

  useEffect(() => {
    if (ref.current) {
      import("marzipano").then((Marzipano) => {
        const viewer = new Marzipano.Viewer(ref.current, {
          scrollZoom: true,
        });
        const source = Marzipano.ImageUrlSource.fromString(imgUrl);
        const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
        const limiter = Marzipano.util.compose(
          Marzipano.RectilinearView.limit.vfov(
            0.698131111111111,
            2.09439333333333
          ),
          Marzipano.RectilinearView.limit.hfov(
            0.698131111111111,
            2.09439333333333
          ),
          Marzipano.RectilinearView.limit.pitch(-Math.PI / 2, Math.PI / 2)
        );
        const view = new Marzipano.RectilinearView({ yaw: Math.PI }, limiter);
        const scene = viewer.createScene({
          source: source,
          geometry: geometry,
          view: view,
          pinFirstLevel: true,
        });
        scene.switchTo();
      });
    }
  }, [ref, imgUrl]);

  return (
    <div
      ref={ref}
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
