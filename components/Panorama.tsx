import { useEffect, useRef } from "react";

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
          Marzipano.RectilinearView.limit.vfov(0.1, 2),
          Marzipano.RectilinearView.limit.hfov(0.1, 2),
          Marzipano.RectilinearView.limit.pitch(-Math.PI / 2, Math.PI / 2)
        );
        const view = new Marzipano.RectilinearView({ yaw: Math.PI }, limiter);
        const scene = viewer.createScene({ source, geometry, view });
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
