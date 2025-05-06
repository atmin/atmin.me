/* eslint-disable @next/next/no-img-element */

// Not used currently. Disabled styles in globals.css

// Equirect to cube faces: https://jaxry.github.io/panorama-to-cubemap/
// https://gist.github.com/linmic/5669280
// https://othree.github.io/360-panorama/css/

import { useCallback, useEffect, useRef, useState } from "react";

const PERSPECTIVE = 525;

export default function Index() {
  const viewerRef = useRef<HTMLDivElement>(null);

  const [viewerWidth, setViewerWidth] = useState<number>();
  const [viewerHeight, setViewerHeight] = useState<number>();

  useEffect(() => {
    if (viewerRef.current) {
      setViewerWidth(viewerRef.current.clientWidth);
      setViewerHeight(viewerRef.current.clientHeight);
    }
  }, [viewerRef]);

  const [x, setX] = useState<number>();
  const [y, setY] = useState<number>();
  const [yaw, setYaw] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [isMoving, setIsMoving] = useState<boolean>(false);

  const onMouseDown = useCallback((e: MouseEvent) => {
    console.log("mousedown");
    setX(e.pageX);
    setY(e.pageY);
    setIsMoving(true);
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isMoving) {
        const nextX = e.pageX;
        const nextY = e.pageY;
        const deltaX = nextX - x;
        const deltaY = nextY - y;

        console.log(`${deltaX}, ${deltaY}`);

        setYaw((prevYaw) => {
          const deltaYaw = (Math.atan2(deltaY, PERSPECTIVE) / Math.PI) * 180;
          return Math.max(-90, Math.min(90, prevYaw + deltaYaw));
        });

        setPitch((prevPitch) => {
          const deltaPitch = (-Math.atan2(deltaX, PERSPECTIVE) / Math.PI) * 180;
          return (prevPitch + deltaPitch) % 360;
        });
      }
    },
    [isMoving, x, y]
  );

  const onMouseUp = useCallback((e: Event) => {
    console.log("mouseup");
    setIsMoving(false);
    e.preventDefault();
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseDown, onMouseMove, onMouseUp]);

  return (
    <div id="container">
      <div id="viewer" ref={viewerRef}>
        <div
          id="cube"
          style={{
            transform: `translateZ(-150px) rotateX(${yaw}deg) rotateY(${pitch}deg)`,
          }}
        >
            <img src="/pano/denis/px.jpg" alt="right" className="right" />
            <img src="/pano/denis/nx.jpg" alt="left" className="left" />
            <img src="/pano/denis/py.jpg" alt="top" className="top" />
            <img src="/pano/denis/ny.jpg" alt="bottom" className="bottom" />
            <img src="/pano/denis/pz.jpg" alt="front" className="front" />
            <img src="/pano/denis/nz.jpg" alt="back" className="back" />
        </div>
      </div>
    </div>
  );
}
